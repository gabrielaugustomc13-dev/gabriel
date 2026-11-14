/* The platform supplies identity. Roles never come from browser state or request bodies. */
async function crmAccess(request,env){
 const userId=request.headers.get('oai-authenticated-user-id');
 if(!env.CRM_MASTER_USER_ID)return {role:'master',userId:userId||'',configured:false};
 if(!userId)return null;
 if(userId===env.CRM_MASTER_USER_ID)return {role:'master',userId,configured:true};
 const query=env.viewerEnabled
  ? 'SELECT m.*, v.permissions_json FROM crm_access_members m LEFT JOIN crm_viewer_access v ON v.user_id=m.user_id WHERE m.user_id = ?'
  : 'SELECT * FROM crm_access_members WHERE user_id = ?';
 const member=await env.DB.prepare(query).bind(userId).first();
 return member?{role:member.permissions_json?(JSON.parse(member.permissions_json).portalClientId?'customer':'viewer'):member.role,userId,workspaceId:member.workspace_id,sellerId:member.seller_id,clientId:member.permissions_json?JSON.parse(member.permissions_json).portalClientId:undefined,configured:true}:null;
}
const crmCompanyAllowed=(a,id)=>a&&(a.role==='master'||a.workspaceId===id);
function crmOwns(a,s,d){const seller=s.sellers?.find(x=>x.id===a.sellerId);return !!d&&!!seller&&d.owner===seller.name}
function crmProjection(s,a){
 if(a.role!=='analyst')return s;
 const ds=s.deals.filter(d=>crmOwns(a,s,d)),ids=new Set(ds.map(d=>d.id)),contacts=new Set(ds.map(d=>d.contactId)),orgs=new Set(ds.map(d=>d.orgId));
 const fields=['company','workspaceId','segment','size','needs','modules','fields','defaultDDD','branding','pipelines','activePipelineId','pipelineView','pipelineRoutes'];
 const view=Object.fromEntries(fields.filter(k=>s[k]!==undefined).map(k=>[k,structuredClone(s[k])]));
 Object.assign(view,{deals:structuredClone(ds),clients:structuredClone(s.clients.filter(c=>contacts.has(c.id))),orgs:structuredClone(s.orgs.filter(o=>orgs.has(o.id))),tasks:structuredClone((s.tasks||[]).filter(t=>ids.has(t.dealId))),sellers:structuredClone((s.sellers||[]).filter(x=>x.id===a.sellerId)),salesTeams:[],rules:[],flows:[],nativeJobs:[],nativeAudit:[],flowExecutions:[],outbox:[],alerts:[],eventIds:[],intakeEvents:[]});
 return view;
}
function crmScoped(result,a){return result?.state?{...result,state:crmProjection(result.state,a)}:result}
function crmAnalystMerge(previous,incoming,a){
 const s=structuredClone(previous),allowed=new Set(previous.deals.filter(d=>crmOwns(a,previous,d)).map(d=>d.id));
 if(!Array.isArray(incoming.deals)||incoming.deals.length!==allowed.size||incoming.deals.some(d=>!allowed.has(d.id))||new Set(incoming.deals.map(d=>d.id)).size!==allowed.size)throw Error('Altere somente suas negociações existentes.');
 for(const next of incoming.deals){const d=s.deals.find(d=>d.id===next.id);if(next.pipelineId!==d.pipelineId||next.owner!==d.owner||next.contactId!==d.contactId||next.orgId!==d.orgId)throw Error('Apenas o administrador pode alterar os vínculos e o responsável.');
  const oldStage=d.stage,oldStatus=d.status;
  for(const k of ['stage','status','description','priority','notes','lossReason','lossNotes','winNotes','closedAt'])if(next[k]!==undefined)d[k]=structuredClone(next[k]);
  if(!['Aberta','Ganha','Perdida'].includes(d.status))throw Error('Resultado inválido');
  if(d.status==='Perdida'&&!d.lossReason?.trim())throw Error('Informe o motivo da perda.');
  if(d.status==='Ganha'&&d.pipelineJourney)throw Error('Conclua o subprocesso antes da venda.');
  if(oldStage!==d.stage){if(oldStatus!=='Aberta')throw Error('Reabra a negociação antes de mudar de etapa.');const p=s.pipelines.find(p=>p.id===d.pipelineId);if(!p?.stages[d.stage]||CRMCore.missing(s,d,p,d.stage).length)throw Error('Preencha os campos obrigatórios da etapa.');NativeCore.dispatch(s,'stage_changed',{dealId:d.id,eventId:crypto.randomUUID()})}
  if(oldStatus!==d.status&&d.status!=='Aberta'){const result=NativeCore.dispatch(s,d.status==='Ganha'?'deal_won':'deal_lost',{dealId:d.id,eventId:crypto.randomUUID()});if(result.blocked)throw Error('Preencha os campos obrigatórios do fechamento.')}
 }
 if(['kanban','list'].includes(incoming.pipelineView))s.pipelineView=incoming.pipelineView;
 if(s.pipelines.some(p=>p.id===incoming.activePipelineId))s.activePipelineId=incoming.activePipelineId;
 return s;
}
async function crmMembers(request,env,url,a){
 if(!a.configured)return json({error:'Ative primeiro o login do master na hospedagem para gerenciar os acessos.'},403);
 if(!['master','admin'].includes(a.role))return json({error:'Área administrativa'},403);
 const wid=url.searchParams.get('workspaceId')||a.workspaceId;
 if(!wid||!crmCompanyAllowed(a,wid))return json({error:'Empresa não autorizada'},403);
 if(request.method==='GET'){
  const {results}=await env.DB.prepare(env.accountManagement?'SELECT m.*, v.permissions_json FROM crm_access_members m LEFT JOIN crm_viewer_access v ON v.user_id=m.user_id WHERE m.workspace_id = ? ORDER BY m.label':'SELECT * FROM crm_access_members WHERE workspace_id = ? ORDER BY label').bind(wid).all();
  if(!env.accountManagement)return json({items:results});
  const logins=await env.accountManagement.list(wid);
  return json({items:results.filter(member=>a.role==='master'||!member.permissions_json).map(({permissions_json,...member})=>({...member,...(permissions_json?{role:JSON.parse(permissions_json).portalClientId?'customer':'viewer',permissions:JSON.parse(permissions_json)}:{}),login:logins.get(member.user_id)||env.accountManagement.configuredLogin(member.user_id)||'', externalLogin:!!env.accountManagement.configuredLogin(member.user_id)}))});
 }
 if(!['POST','DELETE'].includes(request.method))return json({error:'Método não permitido'},405);
 const b=await request.json();
 const credentials=b?.credentials;
 if(credentials&&(!env.accountManagement||a.role!=='master'||request.method!=='POST'))return json({error:'Somente o master pode definir credenciais'},403);
 const generatedId=credentials&&!b.userId?crypto.randomUUID():null;
 if(generatedId)b.userId=generatedId;
 if(typeof b?.userId!=='string'||!b.userId.trim()||b.userId.length>200||b.userId===env.CRM_MASTER_USER_ID)return json({error:'Informe o identificador do usuário. O master é gerenciado pela plataforma.'},400);
 const existing=await env.DB.prepare('SELECT * FROM crm_access_members WHERE user_id = ?').bind(b.userId).first();
 if(existing&&(!crmCompanyAllowed(a,existing.workspace_id)||(a.role==='admin'&&(existing.role==='admin'||existing.permissions_json))))return json({error:'Somente o master pode alterar esse acesso'},403);
 if(existing&&env.accountManagement)existing.permissions_json=(await env.DB.prepare('SELECT permissions_json FROM crm_viewer_access WHERE user_id = ?').bind(b.userId).first())?.permissions_json;
 if(existing?.permissions_json&&a.role!=='master')return json({error:'Somente o master pode alterar esse acesso'},403);
 const recordAccess=action=>env.DB.prepare('INSERT INTO native_audit_entries (event_id,workspace_id,workspace_version,occurred_at,actor_id,actor_label,actor_type,source,action,entity_type,entity_id,entity_name,deal_id,summary,changes_json) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').bind(crypto.randomUUID(),wid,0,new Date().toISOString(),a.userId,auditActor(request).label,'user','access_management','access.'+action,'access',b.userId,String(b.label||existing?.label||b.userId).slice(0,100),'','Acesso '+(action==='revoked'?'revogado':'vinculado')+' à empresa',JSON.stringify([{field:'role',label:'Perfil',before:existing?.permissions_json?(JSON.parse(existing.permissions_json).portalClientId?'customer':'viewer'):existing?.role||null,after:action==='revoked'?null:b.role},{field:'sellerId',label:'Usuário comercial',before:existing?.seller_id||null,after:action==='revoked'?null:b.sellerId||null}]));
 if(request.method==='DELETE'){if(!existing||existing.workspace_id!==wid)return json({error:'Acesso inexistente nesta empresa'},404);await env.DB.batch([...(env.accountManagement?[env.accountManagement.remove(b.userId),env.DB.prepare('DELETE FROM crm_viewer_access WHERE user_id = ?').bind(b.userId)]:[]),env.DB.prepare('DELETE FROM crm_access_members WHERE user_id = ? AND workspace_id = ?').bind(b.userId,wid),recordAccess('revoked')]);return json({removed:true})}
 if(!(env.accountManagement?['admin','analyst','viewer','customer']:['admin','analyst']).includes(b.role)||(a.role==='admin'&&b.role!=='analyst'))return json({error:'Perfil não autorizado'},403);
 const row=await getWorkspace(env,wid);if(!row)return json({error:'Empresa inexistente'},404);
 if(b.role==='analyst'&&!row.state.sellers?.some(x=>x.id===b.sellerId&&x.active!==false))return json({error:'Vincule o analista a um usuário comercial ativo da empresa'},400);
 let permissionWrite;
 if(env.accountManagement){
  if(b.role==='customer'){
   if(!row.state.clients.some(client=>client.id===b.permissions?.portalClientId))return json({error:'Selecione o cliente do portal.'},400);
   permissionWrite=env.DB.prepare('INSERT INTO crm_viewer_access(user_id,permissions_json) VALUES (?,?) ON CONFLICT(user_id) DO UPDATE SET permissions_json=excluded.permissions_json').bind(b.userId,JSON.stringify({portalClientId:b.permissions.portalClientId}));
  }else if(b.role==='viewer'){
   const {screens,clientIds}=b.permissions||{};
   const validClients=new Set(row.state.clients.map(client=>client.id));
   const allowedScreens=['clients','plans','classes','payments','notes'];
   if(!Array.isArray(screens)||!Array.isArray(clientIds)||(!screens.length&&!clientIds.length)||
      screens.some(screen=>!allowedScreens.includes(screen))||clientIds.some(id=>!validClients.has(id))){
    return json({error:'Selecione pelo menos uma tela ou ficha válida da empresa.'},400);
   }
   permissionWrite=env.DB.prepare('INSERT INTO crm_viewer_access(user_id,permissions_json) VALUES (?,?) ON CONFLICT(user_id) DO UPDATE SET permissions_json=excluded.permissions_json')
     .bind(b.userId,JSON.stringify({screens:[...new Set(screens)],clientIds:[...new Set(clientIds)]}));
  }else if(existing?.permissions_json){
   permissionWrite=env.DB.prepare('DELETE FROM crm_viewer_access WHERE user_id = ?').bind(b.userId);
  }
 }
 let credentialWrite;
 if(credentials){
  if(existing&&existing.workspace_id!==wid)return json({error:'Selecione a empresa do usuário para alterar as credenciais'},403);
  if(!existing&&b.userId!==generatedId)return json({error:'Acesso inexistente nesta empresa'},404);
  try{credentialWrite=await env.accountManagement.save(b.userId,credentials.login,credentials.password)}
  catch(error){return json({error:error.message},400)}
 }
 const writeMember=env.DB.prepare('INSERT INTO crm_access_members (user_id,workspace_id,role,seller_id,label,updated_at) VALUES (?,?,?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET workspace_id=excluded.workspace_id,role=excluded.role,seller_id=excluded.seller_id,label=excluded.label,updated_at=excluded.updated_at').bind(b.userId,wid,['viewer','customer'].includes(b.role)?'analyst':b.role,b.role==='analyst'?b.sellerId:'',String(b.label||b.userId).slice(0,100),new Date().toISOString());
 try{await env.DB.batch([writeMember,...(permissionWrite?[permissionWrite]:[]),...(credentialWrite?[credentialWrite]:[]),recordAccess('linked')])}
 catch(error){if(credentialWrite&&/UNIQUE constraint failed: crm_auth_users.login/.test(error.message))return json({error:'Login já utilizado.'},409);throw error}
 return json({saved:true});
}

async function crmViewerRead(request, env, url, access) {
 if(request.method!=='GET'||url.pathname!=='/api/native/viewer')return json({error:'Acesso somente leitura. Recurso não liberado.'},403);
 const member=await env.DB.prepare('SELECT m.workspace_id, v.permissions_json FROM crm_access_members m JOIN crm_viewer_access v ON v.user_id=m.user_id WHERE m.user_id = ?').bind(access.userId).first();
 if(!member||member.workspace_id!==access.workspaceId)return json({error:'Acesso revogado'},403);
 const row=await getWorkspace(env,access.workspaceId);
 if(!row)return json({error:'Empresa não encontrada'},404);
 const {screens,clientIds}=JSON.parse(member.permissions_json);
 const allowedClients=new Set(clientIds);
 const screenData={},recordData={};
 for(const key of ['plans','classes','payments','notes']){
  const records=row.state.lifecycle?.[key]||[];
  if(screens.includes(key))screenData[key]=records;
  const selected=records.filter(item=>allowedClients.has(item.clientId));
  if(selected.length)recordData[key]=selected;
 }
 const visibleClients=new Set([...clientIds,...Object.values(screenData).flat().map(item=>item.clientId)]);
 const clients=row.state.clients.filter(client=>screens.includes('clients')||visibleClients.has(client.id))
   .map(({id,name,status})=>({id,name,status}));
 return json({company:row.name,screens,clientIds,clients,screenData,recordData});
}
