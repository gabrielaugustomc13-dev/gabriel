import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';import {join} from 'node:path';import {pathToFileURL} from 'node:url';
import {createClient} from '@libsql/client';
import {d1Adapter,migrate} from '../server/libsql-adapter.mjs';
import {accounts,hashPassword,issueSession,sessionUser,sessionCookie,verifyPassword} from '../server/vercel-auth.mjs';
import {route} from '../server/vercel-runtime.mjs';
import {toRequest} from '../api/index.mjs';
import worker from '../server/generated/worker.mjs';
import migrations from '../server/generated/migrations.mjs';
const password='Uma-senha-apenas-para-teste-123',passwordHash=await hashPassword(password);
async function setup(t){
 const directory=await mkdtemp(join(tmpdir(),'crm-vercel-')),client=createClient({url:pathToFileURL(join(directory,'test.db')).href});
 t.after(async()=>{client.close();await rm(directory,{recursive:true,force:true})});
 await migrate(client,migrations);
 const env={DB:d1Adapter(client),APP_URL:'https://crm.test',CRM_MASTER_USER_ID:'master',CRM_MASTER_LOGIN:'master@example.com',CRM_MASTER_PASSWORD_HASH:passwordHash,CRM_SESSION_SECRET:'s'.repeat(48),CRM_AUTH_USERS_JSON:JSON.stringify([{id:'admin',login:'admin@example.com',passwordHash},{id:'analyst',login:'analyst@example.com',passwordHash}])};
 const users=accounts(env),cookie=id=>sessionCookie(issueSession(users.find(u=>u.id===id),env)).split(';')[0];
 const call=async(path,{user='master',method='GET',body,headers={}}={})=>{
  const response=await route(new Request(env.APP_URL+'/api/'+path,{method,headers:{...(user?{cookie:cookie(user)}:{}),...(!['GET','HEAD'].includes(method)?{origin:env.APP_URL,'content-type':'application/json'}:{}),...headers},...(body!==undefined?{body:JSON.stringify(body)}:{})}),env,worker);
  return{status:response.status,headers:response.headers,body:await response.json()};
 };
 return{env,client,call,cookie};
}
test('SQLite adapter: rollback, migration ledger and idempotent startup',async t=>{
 const {client,env}=await setup(t);await migrate(client,migrations);
 await assert.rejects(()=>env.DB.batch([env.DB.prepare('INSERT INTO native_workspaces(id,name,state_json,version,updated_at) VALUES (?,?,?,?,?)').bind('rollback','A','{}',1,'now'),env.DB.prepare('INSERT INTO absent_table VALUES (1)')]));
 assert.equal(await env.DB.prepare('SELECT id FROM native_workspaces WHERE id = ?').bind('rollback').first(),null);
 await assert.rejects(()=>migrate(client,[{...migrations[0],checksum:'changed'}]),/alterada/);
 assert.equal((await client.execute('SELECT name FROM vercel_crm_migrations')).rows.length,migrations.length);
});
test('session verification rejects forgery, expiry and password changes',async()=>{
 const env={APP_URL:'https://crm.test',CRM_MASTER_USER_ID:'master',CRM_MASTER_LOGIN:'master@example.com',CRM_MASTER_PASSWORD_HASH:passwordHash,CRM_SESSION_SECRET:'x'.repeat(48)};
 const user=accounts(env)[0],now=Date.now(),token=issueSession(user,env,now);
 const request=token=>new Request(env.APP_URL,{headers:{cookie:sessionCookie(token)}});
 assert.equal(sessionUser(request(token),env,[user],now).id,'master');
 assert.equal(sessionUser(request(token+'x'),env,[user],now),null);
 assert.equal(sessionUser(request(token),env,[user],now+9*3600000),null);
 assert.equal(sessionUser(request(token),env,[{...user,passwordHash:passwordHash+'a'}],now),null);
 assert.equal(await verifyPassword(password,passwordHash),true);assert.equal(await verifyPassword('incorreta',passwordHash),false);
 assert.throws(()=>accounts({...env,CRM_SESSION_SECRET:''}));
});
test('login, rate limit, origin validation and logout',async t=>{
 const {call}=await setup(t);
 assert.equal((await call('auth/login',{user:null,method:'POST',body:{login:'master@example.com',password},headers:{origin:'https://other.test'}})).status,403);
 const login=await call('auth/login',{user:null,method:'POST',body:{login:'master@example.com',password},headers:{'x-real-ip':'good'}});
 assert.equal(login.status,200);assert.match(login.headers.get('set-cookie'),/HttpOnly; Secure; SameSite=Strict/);
 assert.equal((await call('auth/logout',{method:'POST'})).status,200);
 assert.equal((await call('auth/logout')).status,405);
 for(let i=0;i<10;i++)assert.equal((await call('auth/login',{user:null,method:'POST',body:{login:'unknown@example.com',password:'wrong'},headers:{'x-real-ip':'bad'}})).status,401);
 assert.equal((await call('auth/login',{user:null,method:'POST',body:{login:'unknown',password:'wrong'},headers:{'x-real-ip':'bad'}})).status,429);
});
test('real worker with libSQL: no header impersonation, CAS, roles and tenant boundaries',async t=>{
 const {call}=await setup(t);
 assert.equal((await call('native/workspaces',{user:null,headers:{'oai-authenticated-user-id':'master'}})).status,401);
 const state={company:'Empresa A',clients:[{id:'c1',name:'Cliente Ana'},{id:'c2',name:'Cliente Bia'}],orgs:[],deals:[{id:'d1',name:'Ana',contactId:'c1',owner:'Ana',pipelineId:'p',stage:0,status:'Aberta'},{id:'d2',name:'Bia',contactId:'c2',owner:'Bia',pipelineId:'p',stage:0,status:'Aberta'}],sellers:[{id:'ana',name:'Ana',active:true},{id:'bia',name:'Bia',active:true}],pipelines:[{id:'p',name:'Comercial',stages:[{id:'s',name:'Novo',required:[]}]}],tasks:[]};
 assert.equal((await call('native/workspaces/a',{method:'PUT',body:{state,expectedVersion:0,initialImport:true}})).status,200);
 assert.equal((await call('native/workspaces/b',{method:'PUT',body:{state,expectedVersion:0,initialImport:true}})).status,200);
 assert.equal((await call('native/access/members?workspaceId=a',{method:'POST',body:{userId:'admin',role:'admin',label:'Admin'}})).status,200);
 assert.equal((await call('native/access/members?workspaceId=a',{method:'POST',body:{userId:'analyst',role:'analyst',label:'Ana',sellerId:'ana'}})).status,200);
 assert.equal((await call('native/workspaces/b',{user:'admin'})).status,403);
 const analyst=await call('native/workspaces/a',{user:'analyst',headers:{'oai-authenticated-user-id':'master'}});
 assert.equal(analyst.status,200);assert.equal(analyst.body.state.deals.length,1);assert.equal(analyst.body.state.deals[0].id,'d1');
 const full=(await call('native/workspaces/a')).body;
 const writes=await Promise.all([call('native/workspaces/a',{method:'PUT',body:{state:full.state,expectedVersion:full.version}}),call('native/workspaces/a',{method:'PUT',body:{state:full.state,expectedVersion:full.version}})]);
 assert.deepEqual(writes.map(r=>r.status).sort(),[200,409]);
 assert.equal((await call('native/status')).body.storage,'libSQL');
 assert.equal((await call('native/identity',{user:'analyst',headers:{'oai-authenticated-user-id':'master'}})).body.userId,'analyst');
});
test('Node request rewrite keeps query filters and request bodies',async()=>{
 const request=await toRequest({url:'/api/index?__crm_route=native/workspaces/a/preview&role=analyst&sellerId=ana',method:'GET',headers:{host:'untrusted.example'}},{APP_URL:'https://crm.test'});
 assert.equal(new URL(request.url).pathname,'/api/native/workspaces/a/preview');assert.equal(new URL(request.url).searchParams.get('sellerId'),'ana');assert.equal(new URL(request.url).host,'crm.test');
 const post=await toRequest({url:'/api/index?__crm_route=auth/login',method:'POST',headers:{'content-type':'application/json'},body:{login:'a',password:'b'}},{APP_URL:'https://crm.test'});
 assert.deepEqual(await post.json(),{login:'a',password:'b'});
});
test('cron is isolated, secret-protected and awaits scheduled work',async t=>{
 const {env}=await setup(t);env.CRON_SECRET='c'.repeat(48);let completed=false;
 const scheduled={scheduled:async(_event,_env,ctx)=>ctx.waitUntil(Promise.resolve().then(()=>{completed=true}))};
 let response=await route(new Request(env.APP_URL+'/api/cron'),env,scheduled);assert.equal(response.status,401);assert.equal(completed,false);
 response=await route(new Request(env.APP_URL+'/api/cron',{headers:{authorization:'Bearer '+env.CRON_SECRET}}),env,scheduled);
 assert.equal(response.status,200);assert.equal(completed,true);
});
