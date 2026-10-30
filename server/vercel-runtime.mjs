import {accounts,appOrigin,equal,issueSession,verifyPassword,sessionCookie,sessionUser,loginAllowed} from './vercel-auth.mjs';
const json=(body,status=200,headers={})=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json;charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff',...headers}});
export function trustedRequest(request,user,env) {
 const headers=new Headers(request.headers);
 for(const key of [...headers.keys()])if(key.startsWith('oai-authenticated-')||key==='oai-sites-authorization'||key==='x-dispatched-app')headers.delete(key);
 headers.set('oai-authenticated-user-id',user.id);
 headers.set('oai-authenticated-user-email',user.login);
 headers.set('oai-authenticated-user-full-name',encodeURIComponent(user.name||user.login));
 headers.set('oai-authenticated-user-full-name-encoding','percent-encoded-utf-8');
 const url=new URL(request.url);url.protocol='https:';url.host=new URL(appOrigin(env)).host;
 return new Request(url, {method:request.method,headers,...(!['GET','HEAD'].includes(request.method)?{body:request.body,duplex:'half'}:{})});
}
export async function route(request,env,worker) {
 try {
  const origin=appOrigin(env),url=new URL(request.url),method=request.method;
  if(!url.pathname.startsWith('/api/'))return json({error:'Rota não encontrada'},404);
  if(url.pathname==='/api/cron') {
   if(method!=='GET')return json({error:'Método não permitido'},405);
   if(!env.CRON_SECRET||env.CRON_SECRET.length<32||!equal(request.headers.get('authorization')||'','Bearer '+env.CRON_SECRET))return json({error:'Não autorizado'},401);
   accounts(env);const tasks=[];await worker.scheduled({},env,{waitUntil:p=>tasks.push(p)});await Promise.all(tasks);
   return json({processed:true,at:new Date().toISOString()});
  }
  if(!['GET','HEAD'].includes(method)&&request.headers.get('origin')!==origin)return json({error:'Origem não autorizada'},403);
  const users=accounts(env);
  if(url.pathname==='/api/auth/login'){
   if(method!=='POST')return json({error:'Método não permitido'},405);
   if(!(await loginAllowed(env.DB,request.headers.get('x-real-ip'))))return json({error:'Muitas tentativas. Aguarde 15 minutos.'},429,{'retry-after':'900'});
   const raw=await request.text();if(Buffer.byteLength(raw)>4096)return json({error:'Conteúdo muito grande'},413);
   let data;try{data=JSON.parse(raw)}catch{return json({error:'Dados inválidos'},400)}
   const user=users.find(u=>u.login===String(data.login||'').trim().toLowerCase());
   // Use a real configured hash for unknown accounts to keep the password work equivalent.
   const valid=await verifyPassword(data.password,user?.passwordHash||users[0].passwordHash);
   if(!user||!valid)return json({error:'Login ou senha inválidos.'},401);
   return json({signedIn:true},200,{'set-cookie':sessionCookie(issueSession(user,env))});
  }
  if(url.pathname==='/api/auth/logout'){
   if(method!=='POST')return json({error:'Método não permitido'},405);
   return json({signedOut:true},200,{'set-cookie':sessionCookie('',0)});
  }
  const user=sessionUser(request,env,users);if(!user)return json({error:'Entre no CRM para continuar.'},401);
  if(!url.pathname.startsWith('/api/native/'))return json({error:'Rota não encontrada'},404);
  const tasks=[],response=await worker.fetch(trustedRequest(request,user,env),env,{waitUntil:p=>tasks.push(p)});
  await Promise.all(tasks);
  if(url.pathname==='/api/native/status'&&response.ok) {
   const data=await response.json();Object.assign(data,{storage:'libSQL',scheduler:env.CRON_SECRET?'vercel_daily_cron':'request_driven',unattended:!!env.CRON_SECRET,message:'Banco persistente libSQL. Cron diário sujeito à configuração e ao plano Vercel.'});
   return json(data);
  }
  return response;
 }catch(error){console.error('CRM Vercel request failed:',error.message);return json({error:'O servidor não pôde concluir a operação. Confira a configuração e os logs da Vercel.'},503)}
}
