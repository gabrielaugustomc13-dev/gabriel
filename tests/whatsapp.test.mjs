import assert from 'node:assert/strict';
import {localDB} from '../scripts/d1-local.mjs';
const worker=(await import('../dist/server/index.mjs')).default;
const env={DB:localDB()},ctx={waitUntil:p=>p};
const origin='https://crm.test';
async function req(path,method='GET',body,headers={}){const response=await worker.fetch(new Request(origin+'/api/native/'+path,{method,headers:{origin,'content-type':'application/json',...headers},...(body!==undefined?{body:typeof body==='string'?body:JSON.stringify(body)}:{})}),env,ctx);return {status:response.status,body:await response.json()}}
const state={company:'A',clients:[],orgs:[],deals:[],pipelines:[{id:'p',name:'Entrada',stages:[{name:'Novo',required:[]}]}],sellers:[{name:'Ana',available:true}],flows:[{id:'r',kind:'routing',name:'Distribuição',enabled:true}],tasks:[]};
await req('workspaces/a','PUT',{state,expectedVersion:0});await req('workspaces/b','PUT',{state,expectedVersion:0});
assert.equal((await req('whatsapp/a')).body.connection.configured,false);
assert.equal((await req('whatsapp/a/send','POST',{})).status,409);
assert.equal((await req('whatsapp/a/settings','POST',{autoCreate:true,pipelineId:'invalid'})).status,400);
await req('whatsapp/a/settings','POST',{autoCreate:true,pipelineId:'p'});
const c={phoneNumberId:'123',accessToken:'secret-token',appSecret:'app-secret',verifyToken:'verify'};env.WHATSAPP_CONNECTIONS_JSON=JSON.stringify({a:c});
const payload={object:'whatsapp_business_account',entry:[{changes:[{field:'messages',value:{metadata:{phone_number_id:'123'},contacts:[{wa_id:'5511999999999',profile:{name:'gabriel'}}],messages:[{id:'wamid.1',from:'5511999999999',timestamp:String(Math.floor(Date.now()/1000)),type:'text',text:{body:'Olá'}}]}}]}]};
async function webhook(p=payload){const raw=JSON.stringify(p),key=await crypto.subtle.importKey('raw',new TextEncoder().encode(c.appSecret),{name:'HMAC',hash:'SHA-256'},false,['sign']);const bytes=new Uint8Array(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(raw)));const sig='sha256='+Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');return req('whatsapp/a/webhook','POST',raw,{'x-hub-signature-256':sig})}
assert.equal((await req('whatsapp/a/webhook','POST',payload)).status,403);
assert.equal((await webhook()).status,200);assert.equal((await webhook()).status,200);
let row=(await req('workspaces/a')).body,wa=row.state.whatsapp;
assert.equal(row.state.clients.length,1);assert.equal(row.state.deals.length,1);assert.equal(row.state.clients[0].name,'Gabriel');assert.equal(row.state.deals[0].owner,'Ana');assert.equal(row.state.deals[0].operationalStatus,'customer_replied');assert.equal(wa.messages.length,1);assert.equal(wa.threads[0].unread,1);assert.equal((await req('whatsapp/b')).body.data.messages.length,0);
// Browser state cannot forge a service window, webhook history, or credentials.
const forged=structuredClone(row.state);forged.whatsapp.messages=[];await req('workspaces/a','PUT',{state:forged,expectedVersion:row.version});assert.equal((await req('whatsapp/a')).body.data.messages.length,1);
let calls=0;const originalFetch=globalThis.fetch;globalThis.fetch=async()=>{calls++;return new Response(JSON.stringify({messages:[{id:'wamid.out'}]}),{headers:{'content-type':'application/json'}})};
const send={threadId:wa.threads[0].id,requestId:'send-1',text:'Olá, como posso ajudar?'};
assert.equal((await req('whatsapp/a/send','POST',send)).body.status,'accepted');assert.equal((await req('whatsapp/a/send','POST',send)).body.duplicate,true);assert.equal(calls,1);
const statusPayload=structuredClone(payload);const v=statusPayload.entry[0].changes[0].value;delete v.messages;v.statuses=[{id:'wamid.out',status:'read'}];await webhook(statusPayload);v.statuses=[{id:'wamid.out',status:'delivered'}];await webhook(statusPayload);assert.equal((await req('whatsapp/a')).body.data.messages[1].status,'read');
row=(await req('workspaces/a')).body;row.state.clients.push({id:'other',name:'Outro',phone:'+5521999999999'});await req('workspaces/a','PUT',{state:row.state,expectedVersion:row.version});const thread=(await req('whatsapp/a/threads','POST',{contactId:'other'})).body.thread;assert.equal((await req('whatsapp/a/send','POST',{...send,requestId:'send-closed',threadId:thread.id})).status,400);assert.equal(calls,1);
globalThis.fetch=async()=>{calls++;throw Error('Timeout')};const uncertain={...send,requestId:'send-unknown'};assert.equal((await req('whatsapp/a/send','POST',uncertain)).status,502);assert.equal((await req('whatsapp/a/send','POST',uncertain)).body.duplicate,true);assert.equal(calls,2);globalThis.fetch=originalFetch;
const data=JSON.stringify((await req('whatsapp/a')).body);assert(!data.includes(c.accessToken));assert(!data.includes(c.appSecret));assert.equal((await req('whatsapp/a')).body.connection.webhookReady,false);
console.log('✓ WhatsApp: assinatura, isolamento, deduplicação, entrada/roteamento, janela 24h, proteção do histórico, envio único e resultado incerto.');
