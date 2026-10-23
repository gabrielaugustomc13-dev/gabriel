// HTTP and timer adapters for the CRM's own engine. Hosted audience stays owner-private.
const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json;charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'}});
const validId=id=>typeof id==='string'&&/^[a-zA-Z0-9_-]{1,120}$/.test(id);
function validateState(s,previous,initialImport=false){BrandingCore.validate(s?.branding);CompanyCore.validate(s);if(!s||!Array.isArray(s.deals)||!Array.isArray(s.pipelines)||!Array.isArray(s.clients))throw Error('Estrutura de ambiente inválida');if(s.deals.length>5000||s.clients.length>10000)throw Error('Limite deste ambiente excedido');for(const d of s.deals){const p=s.pipelines.find(p=>p.id===d.pipelineId);if(!p||!Number.isInteger(d.stage)||!p.stages[d.stage])throw Error('Funil ou etapa inválidos');const old=previous?.deals?.find(x=>x.id===d.id);if(!PipelineEditorCore.sameStage(previous,s,old,d)){const missing=CRMCore.missing(s,d,p,d.stage);if(missing.length){if(initialImport)d.migrationReview=missing;else throw Error('Campos obrigatórios ausentes: '+missing.join(', '))}}if(d.status==='Perdida'&&old?.status!=='Perdida'&&!String(d.lossReason||'').trim()){if(initialImport)d.migrationReview=['lossReason'];else throw Error('Informe o motivo da perda.')}if(d.status==='Ganha'&&old?.status!=='Ganha'){const missing=NativeCore.winMissing(s,d);if(missing.length){if(initialImport)d.migrationReview=missing;else throw Error('Fechamento incompleto: '+missing.join(', '))}}}}
async function getWorkspace(env,id){const row=await env.DB.prepare('SELECT id, name, state_json, version, updated_at FROM native_workspaces WHERE id = ?').bind(id).first();return row?{id:row.id,name:row.name,state:JSON.parse(row.state_json),version:row.version,updatedAt:row.updated_at}:null}
async function putWorkspace(env,id,state,name,expected,initialImport=false,whatsappInternal=false,actor=auditActor(null,'system')){
 const existing=await getWorkspace(env,id);
 if((existing?.version||0)!==expected)return {conflict:true,currentVersion:existing?.version||0};
 if(!whatsappInternal){if(existing?.state.whatsapp)state.whatsapp=structuredClone(existing.state.whatsapp);else delete state.whatsapp}
 CRMCore.validateSalesTeams(state);CRMCore.syncSellerNames(state,existing?.state);NativeCore.validatePipelineRoutes(state);FlowCore.validate(state,existing?.state);
 for(const d of state.deals||[])if(d.pipelineJourney&&d.pipelineId!==d.pipelineJourney.targetPipelineId)throw Error('Conclua o subprocesso antes de transferir manualmente para outro funil');
 validateState(state,existing?.state,!existing&&initialImport);state.workspaceId=id;NativeCore.init(state);
 // Apply routing to direct snapshot writes too; existing stationary records are not swept on rule activation.
 if(existing||!initialImport)for(const d of state.deals){const old=existing?.state.deals.find(x=>x.id===d.id);if(!PipelineEditorCore.sameStage(existing?.state,state,old,d)||d.pipelineRouteError)NativeCore.advanceRoute(state,d)}
 validateState(state,existing?.state,!existing&&initialImport);NativeCore.tick(state);
 const now=new Date().toISOString();FlowCore.process(state,existing?.state,now,actor.label);FlowCore.validate(state,existing?.state);const serialized=JSON.stringify(state),version=expected+1,token=crypto.randomUUID();
 if(serialized.length>1500000)throw Error('Ambiente excede o limite de armazenamento desta versão');
 const entries=AuditCore.collect(existing?.state,state,{workspaceId:id,version,at:now,actor,initialImport:!existing&&initialImport,name});
 const write=!existing
  ? env.DB.prepare('INSERT OR IGNORE INTO native_workspaces (id,name,state_json,version,updated_at,commit_token) VALUES (?,?,?,1,?,?)').bind(id,name,serialized,now,token)
  : env.DB.prepare('UPDATE native_workspaces SET name = ?, state_json = ?, version = version + 1, updated_at = ?, commit_token = ? WHERE id = ? AND version = ?').bind(name,serialized,now,token,id,expected);
 // D1 batch is transactional: a failed log insertion also rolls back the business write.
 const result=await env.DB.batch([write,...auditInsertStatements(env,entries,id,version,token)]);
 return result[0].meta.changes?{version,state,updatedAt:now}:{conflict:true};
}
async function tickWorkspace(env,id){for(let attempt=0;attempt<3;attempt++){const row=await getWorkspace(env,id);if(!row)return;const before=JSON.stringify(row.state);NativeCore.tick(row.state);const due=row.state.flowHub?.recurrences.some(r=>r.active&&r.nextDate<=FlowCore.today());if(JSON.stringify(row.state)===before&&!due)return row;const result=await putWorkspace(env,id,row.state,row.name,row.version);if(!result.conflict)return result}return {conflict:true}}
async function tickAll(env){const rows=await env.DB.prepare('SELECT id FROM native_workspaces ORDER BY updated_at ASC LIMIT 100').all();for(const row of rows.results)await tickWorkspace(env,row.id)}
function checkOrigin(req){const origin=req.headers.get('origin');return !origin||origin===new URL(req.url).origin}
export default {
async fetch(request,env,ctx){const url=new URL(request.url);if(!url.pathname.startsWith('/api/native/')){const path=url.pathname==='/'?'index.html':url.pathname.slice(1);const entry=ASSETS[path];if(!entry)return new Response('Não encontrado',{status:404});return new Response(entry.body,{headers:{'content-type':entry.type,'cache-control':'no-cache','x-content-type-options':'nosniff'}})}
if(url.pathname==='/api/native/identity')return json({userId:request.headers.get('oai-authenticated-user-id'),name:auditActor(request).label});
if(!env.DB)return json({error:'Persistência do servidor ainda não disponível'},503);
if(['POST','PUT','PATCH','DELETE'].includes(request.method)&&!checkOrigin(request))return json({error:'Origem não autorizada'},403);
try{
const access=await crmAccess(request,env);
if(url.pathname==='/api/native/access/me')return json({access,identity:{userId:request.headers.get('oai-authenticated-user-id'),name:auditActor(request).label},configured:!!env.CRM_MASTER_USER_ID});
if(!access)return json({error:'Seu usuário ainda não tem acesso a esta operação. Solicite o vínculo ao gestor master.'},403);
if(url.pathname==='/api/native/access/members')return await crmMembers(request,env,url,access);
if(url.pathname.startsWith('/api/native/whatsapp/')){const wid=url.pathname.split('/')[4];if(!crmCompanyAllowed(access,wid)||access.role==='analyst')return json({error:'Canal não autorizado'},403);return await waHandler(request,env,url)}
if(url.pathname==='/api/native/status')return json({engine:'native',storage:'D1',scheduler:'request_driven',unattended:false,integrations:'not_connected',audience:'role_scoped',message:'Dados e jobs persistidos no servidor. Agendador contínuo da hospedagem não configurado.'});
if(url.pathname==='/api/native/workspaces'&&request.method==='GET'){const rows=access.role==='master'?await env.DB.prepare('SELECT id, name, version, updated_at FROM native_workspaces ORDER BY name').all():await env.DB.prepare('SELECT id, name, version, updated_at FROM native_workspaces WHERE id = ?').bind(access.workspaceId).all();return json({items:rows.results})}
if(url.pathname==='/api/native/tick'&&request.method==='POST'){if(access.role!=='master')return json({error:'Somente o master pode processar todas as empresas'},403);await tickAll(env);return json({processed:true,at:new Date().toISOString()})}
const match=url.pathname.match(/^\/api\/native\/workspaces\/([^/]+)(?:\/(events|tick|audit|preview))?$/);if(!match||!validId(match[1]))return json({error:'Rota inválida'},404);const id=match[1],action=match[2];
if(!crmCompanyAllowed(access,id))return json({error:'Empresa não autorizada'},403);
if(action==='preview'){
 if(request.method!=='GET')return json({error:'A visualização é somente leitura'},405);
 if(access.role!=='master')return json({error:'Somente o master pode visualizar outros perfis'},403);
 const role=url.searchParams.get('role');if(!['admin','analyst'].includes(role))return json({error:'Perfil inválido'},400);
 const row=await getWorkspace(env,id);if(!row)return json({error:'Empresa não encontrada'},404);
 const sellerId=url.searchParams.get('sellerId')||'',seller=row.state.sellers?.find(s=>s.id===sellerId);
 if(role==='analyst'&&!seller)return json({error:'Selecione um usuário comercial da empresa'},400);
 return json({role,workspaceId:id,sellerId:role==='analyst'?sellerId:'',sellerName:role==='analyst'?seller.name:'',version:row.version,state:crmProjection(row.state,{role,sellerId})});
}
if(action==='audit'){
 if(access.role==='analyst')return json({error:'Histórico administrativo restrito ao administrador'},403);
 if(request.method!=='GET')return json({error:'O histórico é somente leitura'},405);
 if(!await getWorkspace(env,id))return json({error:'Ambiente não encontrado'},404);
 return json(await auditQuery(env,id,url));
}
if(request.method==='GET'&&!action){const row=await getWorkspace(env,id);return row?json(crmScoped(row,access)):json({error:'Ambiente não encontrado'},404)}
if(request.method==='POST'&&action==='tick'){await tickWorkspace(env,id);return json(crmScoped(await getWorkspace(env,id),access))}
if(Number(request.headers.get('content-length')||0)>1600000)return json({error:'Payload muito grande'},413);const text=await request.text();if(text.length>1600000)return json({error:'Payload muito grande'},413);const body=JSON.parse(text);
if(request.method==='PUT'&&!action){if(!Number.isInteger(body.expectedVersion)||body.expectedVersion<0)return json({error:'Versão obrigatória'},400);let submitted=body.state;const previous=await getWorkspace(env,id);if(!previous&&access.role!=='master')return json({error:'Somente o master pode criar uma empresa'},403);if(access.role==='analyst')submitted=crmAnalystMerge(previous.state,body.state,access);const result=await putWorkspace(env,id,submitted,access.role==='analyst'?previous.name:String(body.name||body.state?.company||id).slice(0,100),body.expectedVersion,body.initialImport===true,false,auditActor(request));return json(crmScoped(result,access),result.conflict?409:200)}
if(request.method==='POST'&&action==='events'){if(!['deal_created','stage_changed','call_missed','human_interaction','deal_won','deal_lost','pricing_visit','email_open'].includes(body.event)||typeof body.ctx?.eventId!=='string')return json({error:'Evento ou eventId inválido'},400);for(let n=0;n<3;n++){const row=await getWorkspace(env,id);if(!row)return json({error:'Ambiente não encontrado'},404);if(access.role==='analyst'&&(!crmOwns(access,row.state,row.state.deals.find(d=>d.id===body.ctx.dealId))||!['call_missed','human_interaction','deal_won','deal_lost'].includes(body.event)))return json({error:'Negociação ou ação não autorizada'},403);const result=NativeCore.dispatch(row.state,body.event,body.ctx);if(result.blocked)return json(result,422);const written=await putWorkspace(env,id,row.state,row.name,row.version,false,false,auditActor(request,'native_event'));if(!written.conflict)return json(crmScoped({...written,result},access))}return json({error:'Conflito concorrente; tente novamente'},409)}return json({error:'Método não permitido'},405);
}catch(err){console.error('CRM native request failed',err.message);return json({error:err.message||'Falha no motor nativo'},400)}},
// Hook nativo pronto. Requer que a hospedagem vincule um cron antes de haver execução contínua.
async scheduled(event,env,ctx){ctx.waitUntil(tickAll(env))}
};
