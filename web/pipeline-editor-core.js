/* Stage IDs are identities; positions are only presentation. Work on a clone. */
const PipelineEditorCore=(()=>{
function sameStage(previous,next,a,b){if(!a||!b||a.pipelineId!==b.pipelineId)return false;const x=previous?.pipelines?.find(p=>p.id===a.pipelineId)?.stages[a.stage],y=next?.pipelines?.find(p=>p.id===b.pipelineId)?.stages[b.stage];return x?.id&&y?.id?x.id===y.id:a.stage===b.stage}
function apply(source,draft){
 const s=structuredClone(source),old=s.pipelines.find(p=>p.id===draft.id),stages=structuredClone(draft.stages);
 const name=String(draft.name||'').trim();
 if(!name||name.length>100||s.pipelines.some(p=>p.id!==draft.id&&p.name.toLocaleLowerCase()===name.toLocaleLowerCase()))throw Error('Informe um nome único para o funil.');
 if(!stages.length||stages.length>30||stages.some(x=>!x.id||!x.name.trim()||x.name.length>70)||new Set(stages.map(x=>x.id)).size!==stages.length||new Set(stages.map(x=>x.name.trim().toLocaleLowerCase())).size!==stages.length)throw Error('Use de 1 a 30 etapas com nomes únicos.');
 for(const stage of stages)stage.name=stage.name.trim();
 if(old){
  const map=old.stages.map(x=>stages.findIndex(y=>y.id===x.id));
  const changed=map.some((n,i)=>n!==i);
  const stageKinds={stage_tasks:1,proposal_followup:2,conversion:1,contract:2};
  if(changed){
   for(const f of s.flows||[]){if(!(f.kind in stageKinds))continue;const raw=f.config?.stage;if(raw===''||(f.kind==='stage_tasks'&&raw===undefined)||(f.kind==='proposal_followup'&&raw===undefined))continue;const index=Number(raw??stageKinds[f.kind]);if(!f.pipelineId&&map[index]!==undefined&&map[index]!==index)throw Error('A automação “'+f.name+'” usa uma etapa em todos os funis. Vincule-a a um funil antes de reordenar ou excluir essa etapa.');if(f.pipelineId===old.id){if(map[index]===-1)throw Error('A etapa é usada pela automação “'+f.name+'”. Altere a automação antes de removê-la.');if(map[index]!==undefined){f.config||={};f.config.stage=String(map[index])}}}
   for(const r of s.rules||[]){if(r.stage===''||r.stage===undefined)continue;const i=Number(r.stage);if(!r.pipelineId&&map[i]!==undefined&&map[i]!==i)throw Error('Vincule a regra “'+r.name+'” a um funil antes de alterar essa etapa.');if(r.pipelineId===old.id&&map[i]!==undefined){if(map[i]<0)throw Error('A etapa é usada pela regra “'+r.name+'”.');r.stage=String(map[i])}}
  }
  for(let i=0;i<map.length;i++)if(map[i]<0){const id=old.stages[i].id;
   if(s.deals.some(d=>d.pipelineId===old.id&&d.stage===i))throw Error('A etapa “'+old.stages[i].name+'” possui negociações. Mova-as antes de remover a etapa.');
   if((s.pipelineRoutes||[]).some(r=>(r.sourcePipelineId===old.id&&[r.triggerStageId,r.returnStageId].includes(id))||(r.targetPipelineId===old.id&&[r.entryStageId,r.completionStageId].includes(id)))||s.deals.some(d=>{const j=d.pipelineJourney;return j&&((j.sourcePipelineId===old.id&&[j.sourceStageId,j.returnStageId].includes(id))||(j.targetPipelineId===old.id&&[j.entryStageId,j.completionStageId].includes(id)))}))throw Error('A etapa está vinculada a um subprocesso. Revise o subprocesso antes de removê-la.');
  }
  for(const t of s.tasks||[]){const d=s.deals.find(d=>d.id===t.dealId);if(d?.pipelineId===old.id&&Number.isInteger(t.stage)){if(map[t.stage]<0)throw Error('Há tarefas vinculadas à etapa removida. Revise as tarefas antes de continuar.');if(map[t.stage]!==undefined)t.stage=map[t.stage]}}
  for(const d of s.deals)if(d.pipelineId===old.id)d.stage=map[d.stage];
  Object.assign(old,{...draft,name,stages});
 }else s.pipelines.push({...draft,name,stages});
 return s;
}
return{apply,sameStage};})();
if(typeof module!=='undefined')module.exports=PipelineEditorCore;
