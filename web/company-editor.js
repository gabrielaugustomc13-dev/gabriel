function companyEditButton(box){
 const button=document.createElement('button');button.type='button';button.className='sidebar-company-edit';button.textContent='Editar empresa';button.onclick=editCurrentCompany;button.disabled=companySwitchBusy;box.append(button);
}
function editCurrentCompany(){
 if(!crmSession||!['master','admin'].includes(crmSession.role))return;
 const wid=activeWorkspace,p=state.companyProfile||{};
 openModal(`<form id="editTenant"><div class="overline">EMPRESA CONTRATANTE</div><h2>Editar empresa</h2><p>Atualize os dados de ${esc(state.company)}.</p><div class="company-edit-grid">${field('Nome da empresa','company',state.company,'text',true)}${field('Razão social','legalName',p.legalName)}${field('CNPJ','cnpj',p.cnpj)}${field('Segmento de atuação','segment',state.segment)}${field('Porte / número de colaboradores','size',state.size)}${field('E-mail da empresa','email',p.email,'email')}${field('Telefone / WhatsApp','phone',p.phone)}${field('Site (https://...)','website',p.website,'url')}</div><details class="company-address"><summary>Endereço</summary>${field('Endereço completo','address',p.address)}<div class="company-edit-grid">${field('Cidade','city',p.city)}${field('UF','region',p.region)}${field('CEP','postalCode',p.postalCode)}</div></details><label class="field">Descrição / necessidades da operação<textarea name="needs" rows="3" maxlength="3000">${esc(state.needs||'')}</textarea></label><p class="muted">As logos e cores continuam em Identidade visual, no menu lateral.</p><p id="companyEditError" role="alert"></p><div class="actions"><button type="button" class="btn" id="companyEditCancel">Cancelar</button><button class="btn primary" id="companyEditSave">Salvar empresa</button></div></form>`);
 const form=$('#editTenant');for(const input of form.querySelectorAll('input')){const key=input.name;input.maxLength=({company:100,legalName:160,cnpj:18,segment:100,size:100,email:160,phone:40,website:250,address:500,city:100,region:2,postalCode:10})[key]||100}
 $('#companyEditCancel').onclick=closeModal;
 form.onsubmit=async e=>{
  e.preventDefault();const error=$('#companyEditError');
  if(wid!==activeWorkspace)return error.textContent='A empresa selecionada mudou. Feche e abra a edição novamente.';
  if(!nativeSyncReady||nativeSyncBusy||nativeSyncError)return error.textContent='Aguarde a sincronização do CRM antes de salvar. Se houver uma pendência, use Sincronizar agora.';
  const data=Object.fromEntries([...new FormData(form)].map(([k,v])=>[k,v.trim()]));data.region=data.region.toUpperCase();
  const {company,segment,size,needs,...profile}=data,changes={company,segment,size,needs,companyProfile:{...(state.companyProfile||{}),...profile}};
  try{CompanyCore.validate(changes)}catch(err){return error.textContent=err.message}
  Object.assign(state,changes);const item=workspaces.items.find(w=>w.id===wid);if(item)item.name=company;
  save();const button=$('#companyEditSave');button.disabled=true;button.textContent='Salvando…';error.textContent='';
  clearTimeout(nativeSyncTimer);await syncNative();
  if(!form.isConnected)return;
  button.disabled=false;button.textContent='Salvar empresa';
  if(nativeSyncError)return error.textContent='Dados mantidos neste navegador; falta confirmar no servidor: '+nativeSyncError;
  closeModal();render();toast('Dados da empresa atualizados.');
 };
}
const companyEditorStyles=document.createElement('style');companyEditorStyles.textContent=`.sidebar-company-edit{display:block;border:0;background:transparent;color:inherit;padding:8px 0 0;margin-top:7px;font:inherit;font-size:11px;text-align:left;cursor:pointer;opacity:.75}.sidebar-company-edit:hover{opacity:1;text-decoration:underline}.sidebar-company-edit:focus-visible{outline:2px solid currentColor;outline-offset:3px}.company-edit-grid{display:grid;grid-template-columns:1fr 1fr;gap:0 18px}dialog:has(#editTenant){max-width:790px}.company-address{border-top:1px solid #829c6c33;border-bottom:1px solid #829c6c33;padding:15px 0;margin:10px 0 22px}.company-address summary{cursor:pointer;font-weight:600}.company-address[open] summary{margin-bottom:16px}#companyEditError{color:#b34a35}@media(max-width:600px){.company-edit-grid{grid-template-columns:1fr}}`;document.head.append(companyEditorStyles);
