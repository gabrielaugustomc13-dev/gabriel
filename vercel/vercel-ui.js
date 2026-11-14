/* Vercel owns authentication here; trusted identity headers never come from the browser. */
const vercelFetchBefore=nativeFetch;
nativeFetch=async function(...args){try{return await vercelFetchBefore(...args)}catch(error){if(error.status===401)location.replace('/login.html');throw error}};
crmAccessBlocked=function(info){document.documentElement.classList.remove('access-pending');document.body.innerHTML='<main style="margin:8vh auto;max-width:680px;padding:30px"><h1>Acesso ao FLEXÍVEL</h1><p>'+esc(info||'Seu login ainda não foi vinculado a uma empresa. Solicite o vínculo ao gestor master.')+'</p><label class="field">Seu identificador<input readonly value="'+esc(crmIdentity?.userId||'Entre para consultar seu identificador')+'"></label><a class="btn primary" href="/login.html">Entrar no FLEXÍVEL</a><button class="btn" onclick="location.reload()">Verificar meu acesso</button></main>'};
const logout=document.createElement('button');logout.type='button';logout.className='link';logout.textContent='Sair';
logout.onclick=async()=>{if(nativeSyncBusy||nativeSyncDirty||nativeSyncError)return toast('Conclua a sincronização antes de sair para preservar suas alterações.');try{const response=await fetch('/api/auth/logout',{method:'POST'});if(!response.ok)throw Error('Não foi possível encerrar a sessão.');for(const key of Object.keys(localStorage))if(key.startsWith('flexivel'))localStorage.removeItem(key);location.replace('/login.html')}catch(error){toast(error.message)}};
document.querySelector('main>header')?.append(logout);
function vercelAccountForm(member) {
 const workspace = activeWorkspace;
 const passwordHelp = member?.login ? 'Preencha a nova senha para alterar as credenciais.' : '';
 const profileOptions = [
  ['admin', 'Administrador'], ['analyst', 'Analista'], ['viewer', 'Visualizador']
 ].map(([value, label]) => `<option value="${value}" ${member?.role === value ? 'selected' : ''}>${label}</option>`).join('');
 openModal(`<form id="vercelAccountForm">
  <h2>${member ? 'Editar acesso' : 'Criar usuário'}</h2>
  ${field('Nome de exibição', 'label', member?.label || '', 'text', true)}
  ${member?.externalLogin ? `<p>Login: ${esc(member.login)}. Credenciais gerenciadas pela Vercel.</p>` : `
  <label class="field">Login
   <input name="login" type="text" value="${esc(member?.login || '')}" maxlength="160" autocomplete="username" ${member?.login || !member ? 'required' : ''}>
  </label>
  <label class="field">${member ? 'Nova senha' : 'Senha inicial'}
   <input type="password" name="password" autocomplete="new-password" maxlength="256" ${member ? '' : 'required'}>
  </label>
  ${passwordHelp ? `<p class="muted">${passwordHelp}</p>` : ''}`}
  ${selectField('Perfil', 'role', profileOptions)}
  <div data-viewer-seller>${selectField('Usuário comercial (obrigatório para analista)', 'sellerId',
   '<option value="">Selecionar</option>' + opts(state.sellers.filter(seller => seller.active !== false), member?.seller_id || ''))}</div>
  <div data-viewer-permissions hidden>
   <fieldset><legend>Telas liberadas</legend>${Object.entries(viewerScreens).map(([key,label])=>
    `<label class="field"><span><input type="checkbox" name="screens" value="${key}" ${member?.permissions?.screens.includes(key)?'checked':''}> ${label}</span></label>`).join('')}</fieldset>
   <fieldset><legend>Fichas específicas</legend><label class="field">Buscar cliente<input type="search" data-viewer-search></label>
    <div style="max-height:14rem;overflow:auto">${state.clients.map(client=>
     `<label class="field" data-viewer-client><span><input type="checkbox" name="clientIds" value="${esc(client.id)}" ${member?.permissions?.clientIds.includes(client.id)?'checked':''}> ${esc(client.name)}</span></label>`).join('')||'<p>Nenhum cliente cadastrado.</p>'}</div>
   </fieldset>
  </div>
  <p role="alert" id="vercelAccountError"></p>
  ${footer()}
 </form>`);
 const form = $('#vercelAccountForm');
 const updateProfileFields=()=>{
  form.querySelector('[data-viewer-seller]').hidden=form.elements.role.value!=='analyst';
  form.querySelector('[data-viewer-permissions]').hidden=form.elements.role.value!=='viewer';
 };
 form.elements.role.onchange=updateProfileFields;
 updateProfileFields();
 form.querySelector('[data-viewer-search]').oninput=event=>{
  const query=event.target.value.trim().toLowerCase();
  for(const label of form.querySelectorAll('[data-viewer-client]'))label.hidden=!label.textContent.toLowerCase().includes(query);
 };
 form.onsubmit = async event => {
  event.preventDefault();
  const values=new FormData(form);
  const {login, password, screens, clientIds, ...data} = Object.fromEntries(values);
  if(data.role==='viewer')data.permissions={screens:values.getAll('screens'),clientIds:values.getAll('clientIds')};
  const error = $('#vercelAccountError');
  if (member) data.userId = member.user_id;
  if (!member?.externalLogin && (!member || password || login.trim() !== (member.login || ''))) {
   if (!password) {
    error.textContent = 'Defina uma senha para salvar o login.';
    return;
   }
   data.credentials = {login:login.trim(), password};
  }
  const submit = event.submitter;
  if (submit) submit.disabled = true;
  error.textContent = '';
  try {
   await nativeFetch('access/members?workspaceId=' + encodeURIComponent(workspace),
    {method:'POST', body:JSON.stringify(data)});
   if (form.elements.password) form.elements.password.value = '';
   if (form.isConnected) closeModal();
   if (page === 'access_members' && activeWorkspace === workspace) renderCrmMembers();
  } catch (failure) {
   error.textContent = failure.message;
  } finally {
   if (submit) submit.disabled = false;
  }
 };
}

const viewerScreens={clients:'Carteira de clientes',plans:'Planos',classes:'Agenda e presença',payments:'Pagamentos',notes:'Interações'};

async function renderViewerAccess(){
 const data=await nativeFetch('viewer');
 for(const key of Object.keys(localStorage))if(key.startsWith('flexivel'))localStorage.removeItem(key);
 document.querySelector('body > aside').hidden=true;
 const main=document.querySelector('main');
 main.replaceChildren();
 main.style.margin='0 auto';
 main.style.maxWidth='1050px';
 const header=document.createElement('header');
 header.innerHTML='<strong>FLEXÍVEL</strong>';
 header.append(logout);
 main.append(header);
 const content=document.createElement('section');
 content.innerHTML=head('Área de visualização',esc(data.company)+' · Somente leitura');
 main.append(content);
 const clients=new Map(data.clients.map(client=>[client.id,client]));
 const formatRecords=(key,records,showClient)=>records.length
  ? '<ul>'+records.map(row=>`<li><strong>${esc(row.title)}</strong>${showClient?' · '+esc(clients.get(row.clientId)?.name):''}
    · ${lifecycleDate(row.date)}${row.endDate?' a '+lifecycleDate(row.endDate):''}${row.status?' · '+esc(lifecycleStatus(row,key)):''}
    ${key==='payments'?' · '+money(row.cents/100)+(row.paidAt?' · Pago em '+lifecycleDate(row.paidAt):''):''}
    ${row.notes?'<p>'+esc(row.notes)+'</p>':''}</li>`).join('')+'</ul>'
  : '<p class="muted">Nenhum registro.</p>';
 for(const key of data.screens){
  const body=key==='clients'
   ? '<ul>'+data.clients.map(client=>`<li>${esc(client.name)} · ${esc(client.status)}</li>`).join('')+'</ul>'
   : formatRecords(key,data.screenData[key]||[],true);
  content.insertAdjacentHTML('beforeend',`<details class="card lifecycle-section"><summary>${viewerScreens[key]}</summary>${body}</details>`);
 }
 for(const id of data.clientIds){
  const client=clients.get(id);
  if(!client)continue;
  const records=Object.entries(data.recordData).map(([key,items])=>[key,items.filter(row=>row.clientId===id)]).filter(([,items])=>items.length);
  content.insertAdjacentHTML('beforeend',`<details class="card lifecycle-section"><summary>Ficha de ${esc(client.name)}</summary><p>${esc(client.status)}</p>
   ${records.map(([key,items])=>'<h3>'+viewerScreens[key]+'</h3>'+formatRecords(key,items,false)).join('')||'<p>Nenhum registro nesta ficha.</p>'}</details>`);
 }
 if(!content.querySelector('details'))content.insertAdjacentHTML('beforeend','<p>Nenhum item disponível.</p>');
 document.documentElement.classList.remove('access-pending');
}
