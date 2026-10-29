/* Confirm server persistence before announcing a successful commercial-user save. */
function startCommercialUser(){
 if(!crmSession||!['master','admin'].includes(crmSession.role))return;
 if(liveProfilePreview)return toast('Volte ao master para cadastrar usuários.');
 page='sales_teams';salesTeamsTab='users';render();sellerForm();
}
sellerForm=function(id){
 if(!crmSession||!['master','admin'].includes(crmSession.role)||liveProfilePreview)return toast('Use seu perfil de gestão para cadastrar usuários.');
 CRMCore.prepare(state);
 const wid=activeWorkspace,entityId=id||uid(),u=state.sellers.find(x=>x.id===id)||{active:true,available:true};
 openModal(`<form id="commercialUserForm"><h2>${id?'Editar':'Novo'} usuário comercial</h2>${field('Nome','name',u.name||'','text',true)}${field('E-mail','email',u.email||'','email',true)}<div class="team-user-flags"><label><input type="checkbox" name="active" ${u.active!==false?'checked':''}> Usuário ativo</label><label><input type="checkbox" name="available" ${u.available?'checked':''}> Disponível para receber leads</label></div><details><summary>Filtros de distribuição (opcionais)</summary>${field('Região atendida','region',u.region||'')}${field('Porte atendido','size',u.size||'')}${field('Produto ou serviço','product',u.product||'')}</details><p class="muted">Este cadastro permite atribuir negociações e visualizar o perfil de analista. Para liberar o login da pessoa, vincule-o depois em Acessos da empresa.</p><p id="commercialUserError" role="alert" aria-live="polite" style="color:#b34a35"></p><div class="actions"><button type="button" class="btn" id="commercialUserCancel">Cancelar</button><button type="submit" class="btn primary" id="commercialUserSave">Salvar usuário</button></div></form>`);
 const form=$('#commercialUserForm'),error=$('#commercialUserError'),button=$('#commercialUserSave'),cancel=$('#commercialUserCancel');let saving=false;
 form.elements.name.maxLength=100;form.elements.email.maxLength=160;
 cancel.onclick=closeModal;
 form.addEventListener('invalid',e=>{error.textContent=e.target.name==='email'?'Informe um e-mail válido.':'Preencha o nome e o e-mail do usuário.'},true);
 form.onsubmit=async e=>{
  e.preventDefault();if(saving)return;error.textContent='';
  const f=new FormData(form),value={id:entityId,name:String(f.get('name')||'').trim(),email:String(f.get('email')||'').trim().toLowerCase(),region:String(f.get('region')||'').trim(),size:String(f.get('size')||'').trim(),product:String(f.get('product')||'').trim(),active:f.has('active'),available:f.has('active')&&f.has('available')};
  saving=true;button.disabled=true;cancel.disabled=true;button.textContent='Salvando…';
  try{
   if(wid!==activeWorkspace)throw Error('A empresa selecionada mudou. Reabra o cadastro.');
   if(!nativeSyncReady||nativeSyncBusy)throw Error('Aguarde a sincronização do CRM e tente salvar novamente.');
   if(nativeSyncError)throw Error('Resolva a pendência em Sincronizar agora antes de salvar: '+nativeSyncError);
   if(nativeSyncDirty){clearTimeout(nativeSyncTimer);await syncNative();if(nativeSyncError||!nativeSyncReady||nativeSyncBusy)throw Error(nativeSyncError||'Aguarde a sincronização do CRM.');}
   if(wid!==activeWorkspace)throw Error('A empresa selecionada mudou. Reabra o cadastro.');
   if(!value.name||value.name.length>100)throw Error('Informe um nome de até 100 caracteres.');
   if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.email))throw Error('Informe um e-mail válido.');
   if(state.sellers.some(x=>x.id!==entityId&&x.name.trim().toLowerCase()===value.name.toLowerCase()))throw Error('Já existe um usuário comercial com esse nome.');
   const previous=structuredClone(state),next=structuredClone(state),existing=next.sellers.find(x=>x.id===entityId);
   if(id&&!existing)throw Error('O usuário não existe mais. Feche e atualize a lista.');
   next.sellers=[...next.sellers.filter(x=>x.id!==entityId),{...existing,...value}];
   CRMCore.validateSalesTeams(next);CRMCore.syncSellerNames(next,previous);
   state=next;save();clearTimeout(nativeSyncTimer);await syncNative();
   if(nativeSyncError||!nativeSyncReady||nativeSyncDirty||nativeSyncBusy)throw Error('O servidor ainda não confirmou o cadastro. Seus dados foram mantidos neste navegador. '+(nativeSyncError||'Use Sincronizar agora e tente novamente.'));
   if(wid!==activeWorkspace||!state.sellers.some(x=>x.id===entityId))throw Error('Não foi possível confirmar o usuário nesta empresa.');
   closeModal();page='sales_teams';salesTeamsTab='users';render();toast('Usuário comercial salvo no servidor.');
  }catch(err){if(form.isConnected)error.textContent=err.message}
  finally{saving=false;if(form.isConnected){button.disabled=false;cancel.disabled=false;button.textContent='Salvar usuário'}}
 };
};
const commercialUsersRenderBefore=renderSalesTeams;
renderSalesTeams=function(){commercialUsersRenderBefore();const emptyAction=[...document.querySelectorAll('#salesTeamsBody button')].find(b=>b.textContent.trim()==='Cadastrar usuários');if(emptyAction){emptyAction.removeAttribute('onclick');emptyAction.onclick=startCommercialUser}};
