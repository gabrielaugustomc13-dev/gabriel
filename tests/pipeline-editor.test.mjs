import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {localDB} from '../scripts/d1-local.mjs';
const require=createRequire(import.meta.url),E=require('../web/pipeline-editor-core.js');
const base=()=>({company:'Editor QA',clients:[],orgs:[],deals:[{id:'d',pipelineId:'p',name:'Negócio',stage:1,status:'Aberta',stageEntryId:'entry',stageEnteredAt:'2026-01-01',value:0}],tasks:[{id:'t',dealId:'d',stage:1,stageEntryId:'entry',dueAt:'2026-12-01'}],pipelines:[{id:'p',name:'Comercial',stages:[{id:'a',name:'Novo',required:[]},{id:'b',name:'Proposta',required:['value']},{id:'c',name:'Fechamento',required:[]}]}],flows:[{id:'f',name:'Follow-up',kind:'proposal_followup',pipelineId:'p',config:{stage:'1'}}],rules:[],pipelineRoutes:[]});
let s=base(),draft=structuredClone(s.pipelines[0]);draft.stages=[draft.stages[1],draft.stages[0],draft.stages[2]];
const next=E.apply(s,draft);assert.equal(s.deals[0].stage,1);assert.equal(next.deals[0].stage,0);assert.equal(next.tasks[0].stage,0);assert.equal(next.flows[0].config.stage,'0');assert.equal(next.deals[0].stageEntryId,'entry');assert(E.sameStage(s,next,s.deals[0],next.deals[0]));assert.equal(next.tasks[0].dueAt,s.tasks[0].dueAt);
draft.stages=draft.stages.filter(x=>x.id!=='b');assert.throws(()=>E.apply(s,draft),/automação|negociações/);assert.equal(s.deals[0].stage,1);
s=base();s.flows[0].pipelineId='';draft=structuredClone(s.pipelines[0]);draft.stages=[draft.stages[1],draft.stages[0],draft.stages[2]];assert.throws(()=>E.apply(s,draft),/todos os funis/);
s=base();s.pipelineRoutes=[{sourcePipelineId:'p',triggerStageId:'a'}];draft=structuredClone(s.pipelines[0]);draft.stages=draft.stages.slice(1);assert.throws(()=>E.apply(s,draft),/subprocesso/);
s=base();draft=structuredClone(s.pipelines[0]);draft.stages.pop();assert.equal(E.apply(s,draft).pipelines[0].stages.length,2);
// Server must accept a reorder even if a legacy record lacks its stage's required field,
// and must not trigger a subprocess or create new tasks simply because its index changed.
const worker=(await import('../dist/server/index.mjs?editor='+Date.now())).default,env={DB:localDB()};
const call=async(method,body)=>{const r=await worker.fetch(new Request('https://crm.test/api/native/workspaces/editor',{method,headers:{'content-type':'application/json'},body:body?JSON.stringify(body):undefined}),env,{});const data=await r.json();assert.equal(r.status,200,JSON.stringify(data));return data};
s=base();let result=await call('PUT',{state:s,name:s.company,expectedVersion:0,initialImport:true});
s=result.state;draft=structuredClone(s.pipelines[0]);draft.stages=[draft.stages[1],draft.stages[0],draft.stages[2]];let edited=E.apply(s,draft);
result=await call('PUT',{state:edited,name:s.company,expectedVersion:result.version});assert.equal(result.state.deals[0].stage,0);assert.equal(result.state.deals[0].stageEntryId,s.deals[0].stageEntryId);assert.equal(result.state.tasks.length,s.tasks.length);
console.log('Pipeline editor: remapping, deletion guards, atomic drafts and server identity passed.');
