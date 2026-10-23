/* Master-only, read-only previews of the real UI. Projected state is never saved. */
let liveProfilePreview=null,liveProfileBusy=false;
const liveProfileBanner=document.createElement('section');liveProfileBanner.className='live-profile-banner';liveProfileBanner.hidden=true;document.querySelector('main>header').after(liveProfileBanner);
function profileMasterSession(){return liveProfilePreview?.session||crmSession}
function openProfileViews(){
 if(profileMasterSession()?.role!=='master'||liveProfileBusy)return;
 const source=liveProfilePreview?.masterState||state,sellers=source.sellers||[];
 openModal(`<form id="liveProfilePicker"><h2>Visualizar perfis</h2><p>${esc(source.company)} · Dados reais da empresa selecionada.</p><label class="field">Perfil<select name="role" id="liveProfileRole"><option value="master">Gestor master</option><option value="admin" ${liveProfilePreview?.role==='admin'?'selected':''}>Administrador</option><option value="analyst" ${liveProfilePreview?.role==='analyst'?'selected':''} ${!sellers.length?'disabled':''}>Analista</option></select></label><div id="liveProfileSellerField"><label class="field">Responsável comercial<select name="sellerId">${sellers.map(s=>`<option value="${esc(s.id)}" ${s.id===liveProfilePreview?.sellerId?'selected':''}>${esc(s.name)}${s.active===false?' (inativo)':''}</option>`).join('')}</select></label></div>${!sellers.length?'<p class="muted">Cadastre um usuário em Equipes de vendas para visualizar o perfil de analista.</p>':''}<p class="muted">As visões de administrador e analista são somente leitura. O acesso do seu login não será alterado.</p><p role="alert" id="liveProfileError"></p><div class="actions"><button type="button" class="btn" onclick="closeModal()">Cancelar</button><button class="btn primary">Abrir visão</button></div></form>`);
 const form=$('#liveProfilePicker'),select=$('#liveProfileRole'),sellerField=$('#liveProfileSellerField');
 select.onchange=()=>sellerField.hidden=select.value!=='analyst';select.onchange();
 form.onsubmit=async e=>{e.preventDefault();const f=new FormData(form);form.querySelector('button[type="submit"],button.primary').disabled=true;try{if(f.get('role')==='master'){closeModal();if(liveProfilePreview)await leaveProfileView();else {page='all_pipelines';render()}return}await enterProfileView(f.get('role'),f.get('sellerId'));closeModal()}catch(err){if(form.isConnected){$('#liveProfileError').textContent=err.message;form.querySelector('button.primary').disabled=false}}};
}
async function enterProfileView(role,sellerId){
 if(profileMasterSession()?.role!=='master'||liveProfileBusy)return;
 if(!liveProfilePreview){if(nativeSyncBusy)throw Error('Aguarde a sincronização antes de mudar de visão.');if(nativeSyncDirty)await syncNative();if(nativeSyncError||!nativeSyncReady)throw Error('Conclua a sincronização antes de visualizar outro perfil.');}
 liveProfileBusy=true;
 try{
  const wid=liveProfilePreview?.workspaceId||activeWorkspace,data=await nativeFetch('workspaces/'+encodeURIComponent(wid)+'/preview?'+new URLSearchParams({role,sellerId:sellerId||''}));
  if(activeWorkspace!==wid)throw Error('A empresa mudou. Abra a seleção de perfis novamente.');
  const original=liveProfilePreview||{session:structuredClone(crmSession),masterState:structuredClone(state),workspaceId:wid,navVisibility:[...document.querySelectorAll('aside .nav')].map(el=>[el,el.hidden])};
  liveProfilePreview={...original,role,sellerId:data.sellerId,sellerName:data.sellerName};clearTimeout(nativeSyncTimer);
  state=data.state;crmSession={...original.session,role,workspaceId:wid,sellerId:data.sellerId};selectedDeal=null;page='pipeline';pipelineQuery='';syncPipeline();render();
 }finally{liveProfileBusy=false}
}
async function leaveProfileView(){
 if(!liveProfilePreview||liveProfileBusy)return;
 liveProfileBusy=true;const previous=liveProfilePreview;
 try{
  liveProfilePreview=null;crmSession=previous.session;state=previous.masterState;nativeSyncDirty=false;clearTimeout(nativeSyncTimer);for(const [el,hidden]of previous.navVisibility)el.hidden=hidden;selectedDeal=null;page='pipeline';syncPipeline();render();
  await crmLoadWorkspace(previous.workspaceId);
 }catch(err){toast('Visão master restaurada. Não foi possível atualizar os dados: '+err.message)}finally{liveProfileBusy=false;renderProfileControls()}
}
const profileReadOnlySave=save;save=function(){if(!liveProfilePreview)return profileReadOnlySave()};
const profileReadOnlySync=syncNative;syncNative=async function(){if(!liveProfilePreview)return profileReadOnlySync()};
const profileReadOnlyFetch=nativeFetch;nativeFetch=async function(path,options={}){if(liveProfilePreview&&!['GET','HEAD'].includes((options.method||'GET').toUpperCase()))throw Error('Esta visão é somente leitura. Volte ao master para alterar dados.');return profileReadOnlyFetch(path,options)};
const profileReadOnlyMove=moveDeal;moveDeal=function(...args){if(liveProfilePreview)return toast('Visão somente leitura');return profileReadOnlyMove(...args)};
const profileReadOnlyTime=checkOperationsTime;checkOperationsTime=function(...args){if(!liveProfilePreview)return profileReadOnlyTime(...args)};
document.addEventListener('submit',e=>{if(liveProfilePreview&&e.target.id!=='liveProfilePicker'){e.preventDefault();e.stopImmediatePropagation();toast('Volte ao master para alterar dados.')}},true);
function renderProfileControls(){
 const box=document.querySelector('aside>.workspace');
 if(box&&profileMasterSession()?.role==='master'&&!box.querySelector('.view-profiles-button')){const b=document.createElement('button');b.type='button';b.className='sidebar-company-edit view-profiles-button';b.textContent=liveProfilePreview?'Alterar visão de perfil':'Visualizar perfis';b.onclick=openProfileViews;box.append(b)}
 liveProfileBanner.hidden=!liveProfilePreview;
 if(!liveProfilePreview){ownAccess.disabled=false;return}
 const p=liveProfilePreview;
 liveProfileBanner.innerHTML=`<div><strong>Visualizando como ${esc(pvLabels[p.role])}${p.sellerName?' · '+esc(p.sellerName):''}</strong><span>${esc(state.company)} · Somente leitura</span></div><button type="button" class="btn" id="returnMasterView">Voltar ao master</button>`;$('#returnMasterView').onclick=leaveProfileView;ownAccess.disabled=true;
 for(const button of document.querySelectorAll('#app button')){const text=button.textContent.trim(),browse=button.closest('.tabs,.view-switch')||button.classList.contains('deal-open')||/^(←|Voltar|Ver |Abrir |Aplicar filtros|Limpar filtros|Carregar mais|Atualizar histórico)/.test(text);if(!browse)button.disabled=true}
 for(const input of document.querySelectorAll('#app input,#app textarea,#app select')){const browse=input.matches('.search,#pipelineSearch,[aria-label="Selecionar funil"],#activityFilter input,#activityFilter select');if(!browse)input.disabled=true}
 document.querySelectorAll('.sidebar-company-edit:not(.view-profiles-button),.pipeline-create,.pipeline-config-bar .clean-action-menu').forEach(el=>{if(el.tagName==='BUTTON')el.disabled=true;else el.hidden=true});
}
const profileViewsRenderBefore=render;render=function(){profileViewsRenderBefore();renderProfileControls()};
const profileViewsWorkspaceBefore=renderWorkspaceBar;renderWorkspaceBar=function(){profileViewsWorkspaceBefore();renderProfileControls()};
const profileViewStyles=document.createElement('style');profileViewStyles.textContent=`.live-profile-banner{display:flex;align-items:center;justify-content:space-between;gap:16px;margin:18px 0 8px;padding:16px;border:1px solid #829c6c66;border-radius:10px;background:#829c6c18}.live-profile-banner[hidden]{display:none}.live-profile-banner span{display:block;font-size:12px;margin-top:5px;opacity:.8}.live-profile-banner .btn{flex-shrink:0}#liveProfileError{color:#b34a35}.view-profiles-button{margin-top:3px}body:has(.live-profile-banner:not([hidden])) .kanban-card .drag-grip{display:none}@media(max-width:650px){.live-profile-banner{align-items:flex-start;flex-direction:column}}`;document.head.append(profileViewStyles);renderProfileControls();
