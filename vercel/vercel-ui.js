/* Vercel owns authentication here; trusted identity headers never come from the browser. */
const vercelFetchBefore=nativeFetch;
nativeFetch=async function(...args){try{return await vercelFetchBefore(...args)}catch(error){if(error.status===401)location.replace('/login.html');throw error}};
crmAccessBlocked=function(info){document.documentElement.classList.remove('access-pending');document.body.innerHTML='<main style="margin:8vh auto;max-width:680px;padding:30px"><h1>Acesso ao Unic Flow</h1><p>'+esc(info||'Seu login ainda não foi vinculado a uma empresa. Solicite o vínculo ao gestor master.')+'</p><label class="field">Seu identificador<input readonly value="'+esc(crmIdentity?.userId||'Entre para consultar seu identificador')+'"></label><a class="btn primary" href="/login.html">Entrar no Unic Flow</a><button class="btn" onclick="location.reload()">Verificar meu acesso</button></main>'};
const logout=document.createElement('button');logout.type='button';logout.className='link';logout.textContent='Sair';
logout.onclick=async()=>{if(nativeSyncBusy||nativeSyncDirty||nativeSyncError)return toast('Conclua a sincronização antes de sair para preservar suas alterações.');try{const response=await fetch('/api/auth/logout',{method:'POST'});if(!response.ok)throw Error('Não foi possível encerrar a sessão.');for(const key of Object.keys(localStorage))if(key.startsWith('flexivel'))localStorage.removeItem(key);location.replace('/login.html')}catch(error){toast(error.message)}};
document.querySelector('main>header')?.append(logout);
function vercelAccountForm(member) {
 const workspace = activeWorkspace;
 const passwordHelp = member?.login ? 'Preencha a nova senha para alterar as credenciais.' : '';
 const profileOptions = [
  ['admin', 'Administrador'], ['analyst', 'Analista']
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
  ${selectField('Usuário comercial (obrigatório para analista)', 'sellerId',
   '<option value="">Selecionar</option>' + opts(state.sellers.filter(seller => seller.active !== false), member?.seller_id || ''))}
  <p role="alert" id="vercelAccountError"></p>
  ${footer()}
 </form>`);
 const form = $('#vercelAccountForm');
 form.onsubmit = async event => {
  event.preventDefault();
  const {login, password, ...data} = Object.fromEntries(new FormData(form));
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
