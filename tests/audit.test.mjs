import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {localDB} from '../scripts/d1-local.mjs';
const require=createRequire(import.meta.url),core=require('../web/audit-core.js');
const worker=(await import('../dist/server/index.mjs')).default;
const env={DB:localDB()},ctx={waitUntil:p=>p};
async function request(path,method='GET',body,headers={}){
 const response=await worker.fetch(new Request('https://crm.test/api/native/'+path,{method,headers:{origin:'https://crm.test','content-type':'application/json','oai-authenticated-user-id':'owner-1','oai-authenticated-user-full-name':encodeURIComponent('Gabriel Augusto'),'oai-authenticated-user-full-name-encoding':'percent-encoded-utf-8',...headers},...(body!==undefined?{body:JSON.stringify(body)}:{})}),env,ctx);
 return{status:response.status,body:await response.json()};
}
const base=()=>({company:'Empresa A',workspaceId:'a',clients:[],orgs:[],deals:[],pipelines:[{id:'p',name:'Comercial',stages:[{name:'Novo',required:[]},{name:'Qualificação',required:[]}]}],flows:[],rules:[],tasks:[]});
let r=await request('workspaces/a','PUT',{state:base(),expectedVersion:0,initialImport:true});assert.equal(r.status,200);
let audit=(await request('workspaces/a/audit')).body;
assert.equal(audit.total,1);assert.equal(audit.items[0].action,'workspace.imported');assert.equal(audit.items[0].actorLabel,'Gabriel Augusto');
const baseline=audit.items[0].eventId;
// Repeated autosaves have no business changes and must not pollute the history.
r=await request('workspaces/a','PUT',{state:r.body.state,expectedVersion:r.body.version});assert.equal((await request('workspaces/a/audit')).body.total,1);
let s=r.body.state;s.clients.push({id:'c',name:'Marina',email:'marina@example.com',document:'52998224725'});s.deals.push({id:'d',name:'Contrato Marina',client:'Marina',contactId:'c',pipelineId:'p',stage:0,value:100,status:'Aberta',owner:'Outro vendedor',history:[],notes:[],createdAt:new Date().toISOString()});
r=await request('workspaces/a','PUT',{state:s,expectedVersion:r.body.version});assert.equal(r.status,200);audit=(await request('workspaces/a/audit')).body;assert.equal(audit.total,3);
assert(audit.items.every(x=>x.actorId==='owner-1'));assert(!JSON.stringify(audit).includes('52998224725'));
// Multiple changed fields and operational history survive one combined save.
s=r.body.state;s.deals[0].stage=1;s.deals[0].owner='Nova responsável';s.deals[0].priority='urgent';s.deals[0].history.push({id:'h1',text:'Etapa alterada pelo usuário'});
r=await request('workspaces/a','PUT',{state:s,expectedVersion:r.body.version});assert.equal(r.status,200);
audit=(await request('workspaces/a/audit?entity=deals&deal=d')).body;
const stage=audit.items.find(e=>e.action==='deals.stage_changed');assert(stage);assert.equal(stage.actorLabel,'Gabriel Augusto');assert.equal(stage.changes.find(c=>c.field==='stage').before,'Novo');assert.equal(stage.changes.find(c=>c.field==='stage').after,'Qualificação');assert.equal(stage.changes.find(c=>c.field==='owner').after,'Nova responsável');
assert((await request('workspaces/a/audit?actor=owner-1')).body.total>0);assert.equal((await request('workspaces/a/audit?actor=not-a-user')).body.total,0);
assert.equal((await request('workspaces/a/audit?q=Contrato%20Marina')).body.items[0].entityName,'Contrato Marina');
const total=(await request('workspaces/a/audit')).body.total;
assert.equal((await request('workspaces/a','PUT',{state:s,expectedVersion:0})).status,409);assert.equal((await request('workspaces/a/audit')).body.total,total);
// Logs are append-only through the API and are independent of browser snapshots.
assert.equal((await request('workspaces/a/audit','POST',{items:[]})).status,405);assert.equal((await request('workspaces/a/audit','DELETE')).status,405);
s=r.body.state;s.audit=[];s.nativeAudit=[];s.notes=[];
r=await request('workspaces/a','PUT',{state:s,expectedVersion:r.body.version});assert.equal(r.status,200);assert((await request('workspaces/a/audit')).body.items.some(e=>e.eventId===baseline));
// Notes and completed activities are logged even when commercial fields stay the same.
s=r.body.state;s.deals[0].notes.push({id:'n1',text:'Enviar proposta revisada'});s.tasks.push({id:'t',title:'Ligação',dealId:'d',done:false});r=await request('workspaces/a','PUT',{state:s,expectedVersion:r.body.version});
s=r.body.state;s.tasks[0].done=true;r=await request('workspaces/a','PUT',{state:s,expectedVersion:r.body.version});
assert((await request('workspaces/a/audit?entity=notes')).body.items.some(x=>x.action==='notes.added'));assert((await request('workspaces/a/audit?entity=tasks')).body.items.some(x=>x.action==='tasks.completed'));
// A failed audit insert rolls back the corresponding business data write.
const originalBatch=env.DB.batch.bind(env.DB),before=(await request('workspaces/a')).body,logCount=(await request('workspaces/a/audit')).body.total;
env.DB.batch=items=>originalBatch([...items,env.DB.prepare('INSERT INTO missing_audit_test_table VALUES (1)')]);
const changed=structuredClone(before.state);changed.deals[0].name='Should roll back';
assert.equal((await request('workspaces/a','PUT',{state:changed,expectedVersion:before.version})).status,400);env.DB.batch=originalBatch;
assert.equal((await request('workspaces/a')).body.version,before.version);assert.equal((await request('workspaces/a')).body.state.deals[0].name,'Contrato Marina');assert.equal((await request('workspaces/a/audit')).body.total,logCount);
// Workspace scope, date validation, bounded paging and cursor order.
await request('workspaces/b','PUT',{state:base(),expectedVersion:0});assert.equal((await request('workspaces/b/audit')).body.total,1);assert.equal((await request('workspaces/b/audit?q=Marina')).body.total,0);
const first=(await request('workspaces/a/audit?limit=2')).body,second=(await request('workspaces/a/audit?limit=2&cursor='+first.nextCursor)).body;assert.equal(first.items.length,2);assert(first.nextCursor);assert(second.items.every(x=>x.seq<first.items.at(-1).seq));assert(!second.items.some(x=>first.items.some(y=>x.eventId===y.eventId)));
assert.equal((await request('workspaces/a/audit?from=not-a-date')).status,400);assert.equal((await request('workspaces/a/audit?to=1970-01-01')).body.total,0);
assert.equal((await request('workspaces/a/audit?actor=%27%20OR%201%3D1--')).body.total,0);
// No credential payloads or logo bytes are copied to the activity table.
const secretState=base(),secretNext=base();secretNext.flows=[{id:'flow',name:'Teste',enabled:true,config:{accessToken:'never-log-this',days:3}}];secretNext.branding={logo:'data:image/png;base64,AAAA'};
const records=core.collect(secretState,secretNext,{workspaceId:'t',version:2});assert(!JSON.stringify(records).includes('never-log-this'));assert(!JSON.stringify(records).includes('data:image/png'));
console.log('✓ Auditoria: autor autenticado, antes/depois, notas, tarefas, filtros, paginação, isolamento, redaction, CAS, histórico independente e rollback atômico.');
