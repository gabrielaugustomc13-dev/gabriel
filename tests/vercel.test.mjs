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

test('master creates, resets and revokes company logins through access management', async t => {
 const {call, env} = await setup(t);
 const members = 'native/access/members?workspaceId=alpha';
 const state = {company:'Alpha', clients:[], orgs:[], deals:[], tasks:[], pipelines:[{id:'p',name:'Comercial',stages:[{id:'s',name:'Novo'}]}], sellers:[{id:'seller',name:'Analista',active:true}]};
 for (const workspace of ['alpha','beta']) {
  assert.equal((await call('native/workspaces/'+workspace,{method:'PUT',body:{state,expectedVersion:0,initialImport:true}})).status,200);
 }
 await call(members,{method:'POST',body:{userId:'admin',role:'admin',label:'Admin'}});
 const account = {role:'analyst',label:'Analista',sellerId:'seller',credentials:{login:'123',password:'123'}};
 assert.equal((await call(members,{user:'admin',method:'POST',body:account})).status,403);
 assert.equal((await call(members,{method:'POST',body:{...account,credentials:{...account.credentials,password:''}}})).status,400);
 assert.equal((await call(members,{method:'POST',body:account})).status,200);
 assert.equal((await call(members,{method:'POST',body:account})).status,400);
 const items = (await call(members)).body.items;
 const member = items.find(item=>item.login===account.credentials.login);
 assert.ok(member);
 assert.equal(items.length,2);
 assert.ok(!JSON.stringify(items).includes('scrypt'));
 const login = password => call('auth/login',{user:null,method:'POST',body:{login:member.login,password}});
 const token = result => result.headers.get('set-cookie').split(';')[0];
 const oldSession = token(await login(account.credentials.password));
 const access = (workspace,cookie) => call('native/workspaces/'+workspace,{user:null,headers:{cookie}});
 assert.equal((await access('alpha',oldSession)).status,200);
 assert.equal((await access('beta',oldSession)).status,403);
 const newPassword = '456';
 const edit = {...account,userId:member.user_id,credentials:{...account.credentials,password:newPassword}};
 assert.equal((await call(members,{method:'POST',body:edit})).status,200);
 assert.equal((await access('alpha',oldSession)).status,401);
 assert.equal((await login(account.credentials.password)).status,401);
 const newSession = token(await login(newPassword));
 assert.equal((await access('alpha',newSession)).status,200);
 assert.equal((await call(members,{method:'DELETE',body:{userId:member.user_id}})).status,200);
 assert.equal((await access('alpha',newSession)).status,401);
 assert.equal((await login(newPassword)).status,401);
 assert.equal(await env.DB.prepare('SELECT user_id FROM crm_auth_users WHERE user_id = ?').bind(member.user_id).first(),null);
});

test('customer lifecycle survives commercial edits and stays private from analysts', async t => {
 const {call}=await setup(t);
 const state={company:'Academia',clients:[{id:'ana',name:'Ana',status:'Ativo'}],orgs:[],deals:[],tasks:[],
  pipelines:[{id:'p',name:'Comercial',stages:[{id:'s',name:'Novo'}]}],sellers:[{id:'seller',name:'Analista',active:true}]};
 const base={clientId:'ana',date:'2026-11-14',notes:''};
 const lifecycle={
  plans:[{...base,id:'p1',title:'Mensal',status:'Ativo',endDate:'2026-12-14'}],
  classes:[{...base,id:'c1',title:'Pilates',status:'Presente'}],
  payments:[{...base,id:'v1',title:'Mensalidade',cents:14990,status:'Pago',paidAt:'2026-11-13'}],
  notes:[{...base,id:'n1',title:'Avaliação inicial'}]
 };
 const endpoint='native/workspaces/gym';
 assert.equal((await call(endpoint,{method:'PUT',body:{state:{...state,lifecycle},expectedVersion:0,initialImport:true}})).status,200);
 const stored=(await call(endpoint)).body;
 assert.deepEqual(stored.state.lifecycle,lifecycle);
 const {lifecycle:oldClientOmission,...commercial}=stored.state;
 const update=await call(endpoint,{method:'PUT',body:{state:commercial,expectedVersion:stored.version}});
 assert.deepEqual(update.body.state.lifecycle,lifecycle);
 const invalid=structuredClone(update.body.state);
 invalid.lifecycle.payments[0].clientId='missing';
 assert.equal((await call(endpoint,{method:'PUT',body:{state:invalid,expectedVersion:update.body.version}})).status,400);
 const path='native/access/members?workspaceId=gym';
 assert.equal((await call(path,{method:'POST',body:{userId:'analyst',role:'analyst',sellerId:'seller'}})).status,200);
 const restricted=await call(endpoint,{user:'analyst'});
 assert.equal(restricted.status,200);
 assert.equal(restricted.body.state.lifecycle,undefined);
});

test('viewer only receives approved screens and selected client records', async t => {
 const {call}=await setup(t);
 const path='native/workspaces/gym';
 const clients=[{id:'ana',name:'Ana',email:'private@example.com'},{id:'bia',name:'Bia'}];
 const records=clients.map(client=>({id:client.id,clientId:client.id,title:client.name,date:'2026-11-14',notes:'',status:'Pendente',cents:100,paidAt:''}));
 const state={company:'Academia',clients,orgs:[],deals:[],tasks:[],pipelines:[{id:'p',name:'Comercial',stages:[{id:'s',name:'Novo'}]}],
  lifecycle:{payments:records,classes:records.map(row=>({...row,status:'Presente'}))}};
 assert.equal((await call(path,{method:'PUT',body:{state,expectedVersion:0,initialImport:true}})).status,200);
 const members='native/access/members?workspaceId=gym';
 const account={role:'viewer',label:'Leitura',credentials:{login:'leitura',password:'123'},permissions:{screens:['classes'],clientIds:['ana']}};
 assert.equal((await call(members,{method:'POST',body:{...account,permissions:{screens:[],clientIds:['unknown']}}})).status,400);
 assert.equal((await call(members,{method:'POST',body:account})).status,200);
 const login=await call('auth/login',{user:null,method:'POST',body:{login:'leitura',password:'123'}});
 assert.equal(login.status,200);
 const headers={cookie:login.headers.get('set-cookie').split(';')[0]};
 const read=async(endpoint,method='GET')=>call(endpoint,{method,user:null,headers});
 assert.equal((await read('native/access/me')).body.access.role,'viewer');
 const data=(await read('native/viewer')).body;
 assert.equal(data.screenData.classes.length,2);
 assert.equal(data.screenData.payments,undefined);
 assert.deepEqual(data.recordData.payments.map(row=>row.clientId),['ana']);
 assert.ok(!JSON.stringify(data).includes('private@example.com'));
 assert.equal((await read(path)).status,403);
 assert.equal((await read(path,'PUT')).status,403);
 assert.equal((await read(path+'/audit')).status,403);
 assert.equal((await read('native/viewer','POST')).status,403);
 const member=(await call(members)).body.items.find(item=>item.login==='leitura');
 assert.equal(member.role,'viewer');
 assert.equal((await call(members,{method:'POST',body:{userId:member.user_id,role:'viewer',label:'Leitura',permissions:{screens:[],clientIds:['bia']}}})).status,200);
 const changed=(await read('native/viewer')).body;
 assert.deepEqual(changed.clients.map(client=>client.id),['bia']);
 assert.equal((await call(members,{method:'DELETE',body:{userId:member.user_id}})).status,200);
 assert.equal((await read('native/viewer')).status,401);
});

test('operational agenda, contracts and portal enforce capacity, identity and idempotency',async t=>{
 const {call,env}=await setup(t);
 const state={company:'Academia',clients:[{id:'ana',name:'Ana'},{id:'bia',name:'Bia'}],orgs:[],deals:[],tasks:[],pipelines:[]};
 const workspace='native/workspaces/pilot',endpoint='native/customer-operations?workspaceId=pilot';
 assert.equal((await call(workspace,{method:'PUT',body:{state,expectedVersion:0,initialImport:true}})).status,200);
 const action=body=>call(endpoint,{method:'POST',body});
 const date=new Date(Date.now()+86400000*7).toISOString().slice(0,10);
 for(const clientId of ['ana','bia']){
  const contract={action:'contract',id:'contract-'+clientId,clientId,date,title:'Mensal',months:3,cents:10000};
  assert.equal((await action(contract)).status,200);
  assert.equal((await action(contract)).status,200);
 }
 assert.equal((await call(endpoint)).body.lifecycle.payments.length,6);
 const members='native/access/members?workspaceId=pilot';
 for(const clientId of ['ana','bia'])assert.equal((await call(members,{method:'POST',body:{role:'customer',label:clientId,permissions:{portalClientId:clientId},credentials:{login:clientId,password:'123'}}})).status,200);
 const login=await call('auth/login',{user:null,method:'POST',body:{login:'ana',password:'123'}});
 const headers={cookie:login.headers.get('set-cookie').split(';')[0]};
 const portal=(method='GET',body)=>call('native/customer-operations',{user:null,headers,method,body});
 assert.equal((await call('native/access/me',{user:null,headers})).body.access.role,'customer');
 assert.equal((await call(workspace,{user:null,headers})).status,403);
 assert.equal((await portal('POST',{action:'pay',id:'contract-bia-bill-0',paidAt:date})).status,400);
 const session={action:'session',id:'yoga',date,time:'12:00',title:'Yoga',instructor:'Ana professora',capacity:1,duration:60,weeks:2};
 assert.equal((await action(session)).status,200);
 assert.equal((await action(session)).body.sessions.length,2);
 assert.equal((await action({...session,id:'collision'})).status,400);
 const attempts=await Promise.all([portal('POST',{action:'book',id:'yoga-0',clientId:'bia'}),action({action:'book',id:'yoga-0',clientId:'bia'})]);
 assert.deepEqual(attempts.map(result=>result.status),[200,200]);
 const bookings=(await call(endpoint)).body.bookings;
 assert.equal(bookings.filter(row=>row.status==='Reservado').length,1);
 assert.equal(bookings.filter(row=>row.status==='Espera').length,1);
 assert.equal((await portal()).body.bookings[0].clientId,'ana');
 assert.equal((await portal()).body.lifecycle.payments.length,3);
 assert.ok(!(await portal()).body.clients);
 const first=bookings.find(row=>row.status==='Reservado');
 assert.equal((await action({action:'cancel_booking',id:'yoga-0',clientId:first.clientId})).status,200);
 assert.equal((await call(endpoint)).body.bookings.filter(row=>row.status==='Reservado').length,1);
 assert.equal((await action({action:'contract_status',id:'contract-ana',status:'Pausado'})).body.lifecycle.payments.filter(row=>row.clientId==='ana'&&row.status==='Cancelado').length,3);
 assert.equal((await action({action:'contract_status',id:'contract-ana',status:'Ativo'})).body.lifecycle.payments.filter(row=>row.clientId==='ana'&&row.status==='Pendente').length,3);
 const today=new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Sao_Paulo'}).format(new Date());
 assert.equal((await action({action:'pay',id:'contract-ana-bill-0',paidAt:today})).status,200);
 assert.equal((await action({action:'contract_status',id:'contract-ana',status:'Encerrado'})).body.lifecycle.payments.find(row=>row.id==='contract-ana-bill-0').status,'Pago');
 const before=(await call(workspace)).body;
 const edited=structuredClone(before.state);edited.customerOperations={sessions:[],bookings:[],contracts:[]};
 assert.equal((await call(workspace,{method:'PUT',body:{state:edited,expectedVersion:before.version}})).body.state.customerOperations.sessions.length,2);
 const audit=await env.DB.prepare("SELECT * FROM native_audit_entries WHERE source = 'customer_operations'").all();
 assert.ok(audit.results.length>0);
});
