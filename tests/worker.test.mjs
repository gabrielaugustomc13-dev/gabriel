import assert from 'node:assert/strict';import {localDB} from '../scripts/d1-local.mjs';const w=(await import('../dist/server/index.mjs')).default;const env={DB:localDB()},ctx={waitUntil:p=>p};async function req(path,method='GET',body){const r=await w.fetch(new Request('https://crm.test/api/native/'+path,{method,headers:{'content-type':'application/json',origin:'https://crm.test'},...(body?{body:JSON.stringify(body)}:{})}),env,ctx);return {status:r.status,body:await r.json()}}const state={company:'Teste',workspaceId:'test',clients:[],orgs:[],deals:[],pipelines:[{id:'p',name:'Comercial',stages:[{id:'s',name:'Novo',required:[]}]}],flows:[],tasks:[]};
assert.equal((await req('status')).body.storage,'D1');let r=await req('workspaces/test','PUT',{state,name:'Teste',expectedVersion:0});assert.equal(r.status,200);assert.equal(r.body.version,1);assert.equal((await req('workspaces/test')).body.state.company,'Teste');assert.equal((await req('workspaces/test','PUT',{state,name:'Teste',expectedVersion:0})).status,409);assert.equal((await req('workspaces/other')).status,404);assert.equal((await req('workspaces')).body.items.length,1);const bad=new Request('https://crm.test/api/native/workspaces/test',{method:'PUT',headers:{origin:'https://evil.test'},body:'{}'});assert.equal((await w.fetch(bad,env,ctx)).status,403);assert.equal((await req('tick','POST',{})).status,200);console.log('✓ Worker: persistência, leitura, CAS, escopo por ambiente, origem e tick.');

// A identidade deve persistir por ambiente e rejeitar valores que virem CSS/URLs.
const brandState=structuredClone(state);brandState.branding={light:{primary:'#2563EB'},dark:{menu:'#0B1020'},logo:'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aX1cAAAAASUVORK5CYII='};
r=await req('workspaces/brand-a','PUT',{state:brandState,name:'Marca A',expectedVersion:0});assert.equal(r.status,200);assert.deepEqual((await req('workspaces/brand-a')).body.state.branding,brandState.branding);
assert.equal((await req('workspaces/test')).body.state.branding,undefined);
const invalid=structuredClone(brandState);invalid.branding.light.primary='red; color: black';assert.equal((await req('workspaces/brand-a','PUT',{state:invalid,expectedVersion:1})).status,400);
invalid.branding={logo:'data:image/svg+xml;base64,PHN2Zz4='};assert.equal((await req('workspaces/brand-a','PUT',{state:invalid,expectedVersion:1})).status,400);
assert.equal((await req('workspaces/brand-a')).body.version,1);
console.log('✓ Identidade visual: logo e temas persistidos, isolamento por empresa, cores e formatos inválidos rejeitados.');

// Independent assets survive writes/removal without crossing tenant or theme boundaries.
const {createRequire}=await import('node:module'),require=createRequire(import.meta.url),B=require('../web/branding-core.js');
const light=brandState.branding.logo,dark=light.replace('mP8/x8','mP8/y8');
assert.equal(B.logo({logo:light},'light'),light);assert.equal(B.logo({logo:light},'dark'),light);
const migrated=B.editable({logo:light,light:{primary:'#2563EB'}});assert.deepEqual(migrated.logos,{light,dark:light});assert.equal(migrated.logo,undefined);
brandState.branding={logos:{light,dark},light:{primary:'#2563EB'}};
r=await req('workspaces/brand-a','PUT',{state:brandState,name:'Marca A',expectedVersion:1});assert.equal(r.status,200);
let saved=(await req('workspaces/brand-a')).body.state.branding;assert.equal(B.logo(saved,'light'),light);assert.equal(B.logo(saved,'dark'),dark);assert.equal((await req('workspaces/test')).body.state.branding,undefined);
brandState.branding.logos.dark='';r=await req('workspaces/brand-a','PUT',{state:brandState,expectedVersion:2});assert.equal(r.status,200);saved=(await req('workspaces/brand-a')).body.state.branding;assert.equal(B.logo(saved,'dark'),'');assert.equal(B.logo(saved,'light'),light);
assert.equal(B.logo({logo:light,logos:{dark:''}},'dark'),'');assert.equal(B.logo({logo:light,logos:{dark:''}},'light'),light);
for(const logos of [{dark:'javascript:alert(1)'},{light:42},{light:null},[],'bad']){const invalid=structuredClone(brandState);invalid.branding.logos=logos;assert.equal((await req('workspaces/brand-a','PUT',{state:invalid,expectedVersion:3})).status,400)}
assert.equal((await req('workspaces/brand-a')).body.version,3);
console.log('✓ Logos por tema: compatibilidade, migração, troca, remoção independente, isolamento e validação no servidor.');

const tenant=structuredClone(state);tenant.company='Empresa Atualizada';tenant.segment='Serviços';tenant.size='11 a 50 pessoas';tenant.needs='Centralizar o comercial';tenant.companyProfile={legalName:'Empresa Atualizada Ltda',cnpj:'11222333000181',email:'empresa@example.com',phone:'(31) 99999-9999',website:'https://example.com',address:'Rua de Teste, 100',city:'Belo Horizonte',region:'MG',postalCode:'30100-000'};
r=await req('workspaces/test','PUT',{state:tenant,name:tenant.company,expectedVersion:1});assert.equal(r.status,200,JSON.stringify(r.body));let updated=(await req('workspaces/test')).body;assert.equal(updated.name,tenant.company);assert.deepEqual(updated.state.companyProfile,tenant.companyProfile);assert.equal(updated.state.segment,'Serviços');assert.equal((await req('workspaces/brand-a')).body.state.companyProfile,undefined);
for(const bad of [{cnpj:'123'},{email:'invalido'},{website:'javascript:alert(1)'},{region:'Minas Gerais'}]){const invalid=structuredClone(tenant);Object.assign(invalid.companyProfile,bad);assert.equal((await req('workspaces/test','PUT',{state:invalid,expectedVersion:2})).status,400)}
assert.equal((await req('workspaces/test')).body.version,2);
const profileAudit=(await req('workspaces/test/audit')).body.items.find(e=>e.changes.some(c=>c.field==='companyProfile'));assert(profileAudit);assert.equal(profileAudit.changes.find(c=>c.field==='companyProfile').after.cnpj,'••••0181');
console.log('✓ Empresa contratante: edição, nome do ambiente, persistência, isolamento e validação de cadastro.');
