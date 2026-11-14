const formSettingsNav=document.createElement('button');
formSettingsNav.type='button';
formSettingsNav.className='nav';
formSettingsNav.dataset.page='form_settings';
formSettingsNav.textContent='Formulários e opções';
formSettingsNav.hidden=true;
document.querySelector('aside .asidefoot').before(formSettingsNav);
let selectedSettingsForm='session';
let formSettingsDraft=null;
let formSettingsWorkspace='';
const canConfigureForms=()=>['master','admin'].includes(crmSession?.role)&&!liveProfilePreview;

function enhanceConfiguredForm(form,formKey,isNew){
 const definitions=FormSettingsCore.forms[formKey];
 if(!definitions||!form)return;
 for(const [key,setting] of Object.entries(state.formSettings?.[formKey]||{})){
  const input=form.elements.namedItem(key);
  if(!input||input.tagName!=='INPUT')continue;
  const spec=definitions.fields[key];
  const value=isNew?(setting.defaultValue!==''?setting.defaultValue:setting.mode==='list'&&!setting.options.includes(input.value)?'':input.value):input.value;
  if(setting.mode==='list'){
   const select=document.createElement('select');
   select.name=input.name;select.id=input.id;select.required=input.required;select.disabled=input.disabled;
   select.append(new Option('Selecionar',''));
   const options=[...setting.options];
   if(!isNew&&value&&!options.includes(value))options.push(value);
   for(const option of options)select.append(new Option(option,option));
   select.value=value;
   input.replaceWith(select);
  }else{
   input.value=value;
   if(setting.mode==='suggestions'){
    const list=document.createElement('datalist');
    list.id='suggestions-'+uid();
    for(const value of setting.options)list.append(new Option(value,value));
    input.setAttribute('list',list.id);
    input.after(list);
   }
  }
  const control=form.elements.namedItem(key);
  if(spec.type==='number'&&control.tagName==='INPUT'){
   control.min=String(spec.min);control.max=String(spec.max);
   control.step=spec.integer?'1':'any';
  }
 }
 if(canConfigureForms()){
  const helper=document.createElement('p');helper.className='muted';
  helper.textContent='Listas e valores padrão podem ser configurados em Formulários e opções.';
  form.querySelector('.actions')?.before(helper);
 }
}

function readSettingsDraft(){
 const form=$('#formSettingsEditor');if(!form)return;
 const fields={};
 for(const [key,spec] of Object.entries(FormSettingsCore.forms[selectedSettingsForm].fields)){
  const mode=form.elements.namedItem(key+'-mode').value;
  const normalize=value=>spec.type==='number'?value.replace(',','.'):value;
  const options=[...new Set(form.elements.namedItem(key+'-options').value.split('\n').map(value=>normalize(value.trim())).filter(Boolean))];
  const defaultValue=normalize(form.elements.namedItem(key+'-default').value.trim());
  if(mode!=='text'||options.length||defaultValue)fields[key]={mode,options,defaultValue};
 }
 formSettingsDraft[selectedSettingsForm]=fields;
}
function applyAcademyFormExample(){
 readSettingsDraft();
 const titles={mode:'suggestions',options:['Musculação','Pilates','Funcional','Yoga'],defaultValue:''};
 formSettingsDraft.session={...formSettingsDraft.session,title:structuredClone(titles),
  duration:{mode:'list',options:['30','45','60','90'],defaultValue:'60'},
  capacity:{mode:'text',options:[],defaultValue:'8'},
  weeks:{mode:'text',options:[],defaultValue:'1'}};
 formSettingsDraft.classes={...formSettingsDraft.classes,title:structuredClone(titles)};
 selectedSettingsForm='session';
 renderFormSettings();
 $('#formSettingsStatus').textContent='Exemplo carregado na prévia. Ajuste e salve para aplicar à empresa.';
}
function renderFormSettings(){
 if(!canConfigureForms())return;
 if(formSettingsWorkspace!==activeWorkspace||!formSettingsDraft){
  formSettingsDraft=structuredClone(state.formSettings||{});
  formSettingsWorkspace=activeWorkspace;
 }
 const definition=FormSettingsCore.forms[selectedSettingsForm];
 const settings=formSettingsDraft[selectedSettingsForm]||{};
 $('#breadcrumb').textContent='Formulários e opções';
 $('#app').innerHTML=head('Formulários e opções',esc(state.company))+
  `<p>Escolha o que pode ser selecionado e o que já vem preenchido ao cadastrar. Cada empresa tem suas próprias opções.</p>
  <button type="button" class="btn" id="academyFormExample">Carregar exemplo de academia</button><label class="field">Formulário<select id="settingsFormChoice">${Object.entries(FormSettingsCore.forms).map(([key,form])=>`<option value="${key}" ${key===selectedSettingsForm?'selected':''}>${form.label}</option>`).join('')}</select></label>
  <form id="formSettingsEditor">${Object.entries(definition.fields).map(([key,spec])=>{
   const setting=settings[key]||{mode:'text',options:[],defaultValue:''};
   return `<section class="card form-setting"><h2>${spec.label}</h2>
    <div class="form-setting-grid">
     <label class="field">Como preencher<select name="${key}-mode" data-setting-mode="${key}">
      <option value="text" ${setting.mode==='text'?'selected':''}>Digitar livremente</option>
      <option value="list" ${setting.mode==='list'?'selected':''}>Escolher na lista</option>
      <option value="suggestions" ${setting.mode==='suggestions'?'selected':''}>Sugerir opções e permitir digitação</option>
     </select></label>
     <label class="field">Valor padrão<input name="${key}-default" value="${esc(setting.defaultValue)}" maxlength="500"></label>
    </div>
    <label class="field" data-options-for="${key}" ${setting.mode==='text'?'hidden':''}>Opções, uma por linha<textarea name="${key}-options" rows="4" maxlength="16000">${esc(setting.options.join('\n'))}</textarea></label>
    ${spec.type==='number'?`<p class="muted">Valores entre ${spec.min} e ${spec.max}${spec.integer?', em números inteiros':''}.</p>`:''}
   </section>`;
  }).join('')}
  <div class="actions"><button class="btn" type="button" id="previewSettingsForm">Testar formulário</button><button class="btn" type="button" id="discardSettingsForm">Descartar</button><button class="btn primary" type="submit">Salvar configurações</button></div>
  <p role="alert" id="formSettingsError"></p><p role="status" id="formSettingsStatus"></p></form>`;
 $('#academyFormExample').onclick=()=>{
  if(confirm('Carregar nomes de aulas e padrões de duração, vagas e repetição no rascunho?'))applyAcademyFormExample();
 };
 $('#settingsFormChoice').onchange=event=>{
  readSettingsDraft();selectedSettingsForm=event.target.value;renderFormSettings();
 };
 $('#formSettingsEditor').querySelectorAll('[data-setting-mode]').forEach(select=>select.onchange=()=>{
  $('#formSettingsEditor').querySelector('[data-options-for="'+select.dataset.settingMode+'"]').hidden=select.value==='text';
 });
 $('#discardSettingsForm').onclick=()=>{formSettingsDraft=null;renderFormSettings();};
 $('#previewSettingsForm').onclick=()=>{
  try{
   readSettingsDraft();FormSettingsCore.validate(formSettingsDraft);
   openModal('<form id="settingsPreview"><h2>Prévia de '+esc(definition.label)+'</h2>'+
    Object.entries(definition.fields).map(([key,spec])=>field(spec.label,key,'',spec.type,false)).join('')+
    '<button type="button" class="btn" onclick="closeModal()">Fechar prévia</button></form>');
   const original=state.formSettings;
   try{state.formSettings=formSettingsDraft;enhanceConfiguredForm($('#settingsPreview'),selectedSettingsForm,true);}
   finally{state.formSettings=original;}
   $('#settingsPreview').onsubmit=event=>event.preventDefault();
  }catch(error){$('#formSettingsError').textContent=error.message;}
 };
 const editor=$('#formSettingsEditor'),workspace=activeWorkspace;
 editor.onsubmit=async event=>{
  event.preventDefault();const submit=event.submitter;submit.disabled=true;
  const error=editor.querySelector('[role=alert]');error.textContent='';
  try{
   readSettingsDraft();FormSettingsCore.validate(formSettingsDraft);
   if(nativeSyncDirty&&!nativeSyncBusy)await syncNative();
   if(workspace!==activeWorkspace||nativeSyncBusy||nativeSyncDirty||nativeSyncError||!nativeSyncReady)throw Error('Sincronize os dados da empresa antes de salvar.');
   state.formSettings=structuredClone(formSettingsDraft);save();
   clearTimeout(nativeSyncTimer);await syncNative();
   if(nativeSyncError||nativeSyncDirty)throw Error(nativeSyncError||'Aguardando sincronização.');
   editor.querySelector('[role=status]').textContent='Configurações salvas. Os próximos cadastros usarão estas opções.';
  }catch(failure){error.textContent=failure.message;}
  finally{submit.disabled=false;}
 };
}

const configuredClientForm=clientForm;
clientForm=function(id){
 configuredClientForm(id);
 enhanceConfiguredForm($('#clientform'),'client',!id);
};
const formsPreviousRender=render;
render=function(){
 formsPreviousRender();
 formSettingsNav.hidden=!canConfigureForms();
 if(page==='form_settings'&&!formSettingsNav.hidden)renderFormSettings();
};
