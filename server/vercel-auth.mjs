import {createHmac,createHash,randomBytes,scrypt as nodeScrypt,timingSafeEqual} from 'node:crypto';
import {promisify} from 'node:util';
const scrypt=promisify(nodeScrypt);
export const COOKIE='__Host-crm_session',TTL=8*60*60;
const digest=value=>createHash('sha256').update(value).digest('hex');
export function equal(a,b){const x=Buffer.from(String(a)),y=Buffer.from(String(b));return x.length===y.length&&timingSafeEqual(x,y)}
export function appOrigin(env){const url=new URL(env.APP_URL);if(url.protocol!=='https:'||url.username||url.password||url.pathname!=='/'||url.search||url.hash)throw Error('APP_URL deve ser a origem HTTPS do CRM.');return url.origin}
export function accounts(env){
 appOrigin(env);
 if(!env.CRM_SESSION_SECRET||env.CRM_SESSION_SECRET.length<32||!env.CRM_MASTER_USER_ID||!env.CRM_MASTER_LOGIN||!env.CRM_MASTER_PASSWORD_HASH)throw Error('Configure o login master e CRM_SESSION_SECRET no servidor.');
 const extra=JSON.parse(env.CRM_AUTH_USERS_JSON||'[]');
 if(!Array.isArray(extra)||extra.length>500)throw Error('Configuração de usuários inválida.');
 const users=[{id:env.CRM_MASTER_USER_ID,login:env.CRM_MASTER_LOGIN,name:'Gestor master',passwordHash:env.CRM_MASTER_PASSWORD_HASH},...extra],ids=new Set(),logins=new Set();
 for(const u of users){
  if(typeof u.id!=='string'||!/^[a-zA-Z0-9_-]{1,120}$/.test(u.id)||typeof u.login!=='string'||!u.login.trim()||typeof u.passwordHash!=='string'||!/^scrypt\$[a-f0-9]{32}\$[a-f0-9]{128}$/.test(u.passwordHash))throw Error('Identificador, login ou hash de senha inválido.');
  u.login=u.login.trim().toLowerCase();
  if(ids.has(u.id)||logins.has(u.login))throw Error('Identificador ou login duplicado.');
  ids.add(u.id);logins.add(u.login);
 }
 return users;
}
export async function hashPassword(password){
 if(typeof password!=='string'||password.length<12||Buffer.byteLength(password)>256)throw Error('Use uma senha de 12 a 256 bytes.');
 const salt=randomBytes(16).toString('hex'),hash=await scrypt(password,salt,64,{N:32768,r:8,p:1,maxmem:64*1024*1024});
 return 'scrypt$'+salt+'$'+hash.toString('hex');
}
export async function verifyPassword(password,hash){
 if(typeof password!=='string'||Buffer.byteLength(password)>256)return false;
 const [,salt,expected]=hash.split('$');
 const result=await scrypt(password,salt,64,{N:32768,r:8,p:1,maxmem:64*1024*1024});
 return equal(result.toString('hex'),expected);
}
const sign=(value,env)=>createHmac('sha256',env.CRM_SESSION_SECRET).update(value).digest('base64url');
export function issueSession(user,env,now=Date.now()){
 const body=Buffer.from(JSON.stringify({sub:user.id,exp:Math.floor(now/1000)+TTL,version:digest(user.passwordHash)})).toString('base64url');
 return body+'.'+sign(body,env);
}
export function sessionUser(request,env,users,now=Date.now()){
 try {
  const raw=(request.headers.get('cookie')||'').split(';').map(s=>s.trim()).find(s=>s.startsWith(COOKIE+'='))?.slice(COOKIE.length+1);
  if(!raw||raw.length>2048)return null;
  const [body,signature,...rest]=raw.split('.');
  if(rest.length||!signature||!equal(signature,sign(body,env)))return null;
  const claims=JSON.parse(Buffer.from(body,'base64url').toString('utf8')),user=users.find(u=>u.id===claims.sub);
  return user&&Number.isSafeInteger(claims.exp)&&claims.exp>Math.floor(now/1000)&&claims.exp<=Math.floor(now/1000)+TTL&&claims.version===digest(user.passwordHash)?user:null;
 }catch{return null}
}
export function sessionCookie(token,maxAge=TTL){return COOKIE+'='+token+'; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age='+maxAge}
export async function loginAllowed(db,ip,now=Date.now()){
 const key=digest(ip||'unknown'),windowMs=15*60*1000;
 const row=await db.prepare('INSERT INTO crm_auth_attempts (key,attempts,started) VALUES (?,1,?) ON CONFLICT(key) DO UPDATE SET attempts=CASE WHEN started < ? THEN 1 ELSE attempts+1 END, started=CASE WHEN started < ? THEN excluded.started ELSE started END RETURNING attempts').bind(key,now,now-windowMs,now-windowMs).first();
 // Bound growth, including installations with frequent preview requests.
 await db.prepare('DELETE FROM crm_auth_attempts WHERE started < ?').bind(now-86400000).run();
 return Number(row.attempts)<=10;
}
