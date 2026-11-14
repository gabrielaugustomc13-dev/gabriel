const operationsNav=document.createElement('button');
operationsNav.className='nav';operationsNav.dataset.page='customer_operations';operationsNav.textContent='Operação e agenda';operationsNav.hidden=true;
document.querySelector('aside .asidefoot').before(operationsNav);
let customerOperationsTab='agenda';
let customerOperationsData;
let customerOperationsSequence=0;
const operationNames={agenda:'Agenda de turmas',contracts:'Contratos',payments:'Mensalidades',pending:'Pendências',setup:'Começar'};
function operationTable(headers,rows){
 return '<div class="lifecycle-table"><table><thead><tr>'+headers.map(value=>'<th>'+value+'</th>').join('')+'</tr></thead><tbody>'+
 (rows.length?rows.join(''):'<tr><td colspan="'+headers.length+'">Nenhum registro.</td></tr>')+'</tbody></table></div>';
}
function operationAction(label,action,id,clientId='',status=''){
 return `<button type="button" class="link" data-operation="${action}" data-id="${esc(id)}" data-client="${esc(clientId)}" data-status="${esc(status)}">${label}</button>`;
}
async function operationCommand(command,portal=false){
 const workspace=activeWorkspace;
 if(!portal){
  if(liveProfilePreview)throw Error('Visão somente leitura.');
  if(nativeSyncDirty&&!nativeSyncBusy)await syncNative();
  if(nativeSyncBusy||nativeSyncDirty||nativeSyncError||!nativeSyncReady)throw Error('Sincronize os dados antes de continuar.');
 }
 const data=await nativeFetch('customer-operations'+(portal?'':'?workspaceId='+encodeURIComponent(workspace)),{method:'POST',body:JSON.stringify(command)});
 if(!portal&&workspace===activeWorkspace)await loadNativeWorkspace(workspace);
 return data;
}
async function renderCustomerOperations(){
 const sequence=++customerOperationsSequence,workspace=activeWorkspace;
 const host=$('#app');
 host.innerHTML=head('Operação e agenda',esc(state.company))+'<p role="status">Carregando…</p>';
 try{
  const data=await nativeFetch('customer-operations?workspaceId='+encodeURIComponent(workspace));
  if(sequence!==customerOperationsSequence||workspace!==activeWorkspace||page!=='customer_operations')return;
  customerOperationsData=data;
  const clients=new Map(data.clients.map(client=>[client.id,client.name]));
  const tabs='<div class="tabs lifecycle-tabs">'+Object.entries(operationNames).map(([key,label])=>
   `<button class="btn ${customerOperationsTab===key?'primary':''}" data-operation-tab="${key}">${label}</button>`).join('')+'</div>';
  let content='';
  if(customerOperationsTab==='agenda'){
   content='<button class="btn primary" id="createOperationSession">Criar turma</button>'+
    operationTable(['Aula','Professor','Data e horário','Vagas','Ações'],data.sessions.slice().sort((a,b)=>a.startsAt.localeCompare(b.startsAt)).map(row=>{
     const bookings=data.bookings.filter(b=>b.sessionId===row.id);
     const occupied=bookings.filter(b=>['Reservado','Presente'].includes(b.status)).length;
     return `<tr><td>${esc(row.title)}${row.cancelled?' · Cancelada':''}<small>${row.duration} minutos</small></td><td>${esc(row.instructor)}</td><td>${lifecycleDate(row.date)} ${esc(row.time)}<small>Horário de Brasília</small></td><td>${occupied}/${row.capacity}<small>${bookings.filter(b=>b.status==='Espera').length} em espera</small></td><td>${operationAction('Participantes','participants',row.id)} ${!row.cancelled?operationAction('Cancelar aula','cancel_session',row.id):''}</td></tr>`;
    }));
  }else if(customerOperationsTab==='contracts'){
   content='<button class="btn primary" id="createOperationContract">Novo contrato</button>'+
    operationTable(['Cliente','Plano','Vigência','Mensalidade','Situação','Ações'],data.contracts.map(row=>
     `<tr><td>${esc(clients.get(row.clientId))}</td><td>${esc(row.title)}</td><td>${lifecycleDate(row.date)} a ${lifecycleDate(row.endDate)}</td><td>${money(row.cents/100)} · ${row.months} parcelas</td><td>${row.status}</td><td>${row.status!=='Encerrado'?operationAction(row.status==='Ativo'?'Pausar':'Retomar','contract_status',row.id,'',row.status==='Ativo'?'Pausado':'Ativo')+' '+operationAction('Encerrar','contract_status',row.id,'','Encerrado'):''}</td></tr>`));
  }else if(customerOperationsTab==='payments'){
   content=operationTable(['Cliente','Cobrança','Vencimento','Valor','Situação','Ação'],(data.lifecycle.payments||[]).slice().sort((a,b)=>a.date.localeCompare(b.date)).map(row=>
    `<tr><td>${esc(clients.get(row.clientId))}</td><td>${esc(row.title)}</td><td>${lifecycleDate(row.date)}</td><td>${money(row.cents/100)}</td><td>${esc(lifecycleStatus(row,'payments'))}</td><td>${row.status==='Pendente'?operationAction('Registrar pagamento','pay',row.id):lifecycleDate(row.paidAt)}</td></tr>`));
  }else if(customerOperationsTab==='pending'){
   content='<p>Vencimentos, planos a renovar em até 7 dias e clientes ativos com última presença há mais de 10 dias.</p>'+
    operationTable(['Cliente','Pendência','Data','Ação'],data.pending.map(row=>`<tr><td>${esc(clients.get(row.clientId))}</td><td>${esc(row.title)}</td><td>${lifecycleDate(row.date)}</td><td>${operationAction('Abrir ficha','client',row.key,row.clientId)}</td></tr>`));
  }else{
   content=`<div class="card"><h2>Preparar a empresa</h2><ol><li>Cadastre os clientes em Gestão de clientes. A importação por planilha está em CRM → Clientes.</li><li>Crie contratos para gerar as mensalidades.</li><li>Cadastre as turmas com professor, horário e vagas.</li><li>Como Master, crie o acesso Cliente (portal) em Acessos da empresa e vincule a ficha correta.</li><li>Confira Pendências para acompanhar atrasos e ausências.</li></ol><p>Armazenamento utilizado: ${Math.round(data.usage.bytes/1024)} KB de ${Math.round(data.usage.limit/1024)} KB.</p><p>Pagamentos são confirmados manualmente. Pausar ou encerrar um contrato cancela as parcelas pendentes com vencimento a partir de hoje. Retomar reabre as parcelas canceladas pela pausa que ainda não venceram.</p></div>`;
  }
  host.innerHTML=head('Operação e agenda',esc(data.company))+tabs+'<section class="card lifecycle-section">'+content+'</section><p role="alert" id="operationError"></p>';
  host.querySelectorAll('[data-operation-tab]').forEach(button=>button.onclick=()=>{customerOperationsTab=button.dataset.operationTab;renderCustomerOperations();});
  $('#createOperationSession')?.addEventListener('click',()=>operationForm('session'));
  $('#createOperationContract')?.addEventListener('click',()=>operationForm('contract'));
  bindOperationActions(host,data);
 }catch(error){if(sequence===customerOperationsSequence&&page==='customer_operations')host.innerHTML='<p role="alert">'+esc(error.message)+'</p>';}
}
function operationForm(action,id){
 const workspace=activeWorkspace;
 const commandId=id||uid();
 const clients=customerOperationsData.clients;
 let fields='';
 if(action==='session')fields=`${field('Nome da turma','title','','text',true)}${field('Professor','instructor','','text',true)}${field('Primeira aula','date',lifecycleToday(),'date',true)}${field('Horário de Brasília','time','08:00','time',true)}${field('Duração em minutos','duration',60,'number',true)}${field('Vagas','capacity',8,'number',true)}${field('Repetir semanalmente por quantas semanas','weeks',1,'number',true)}`;
 if(action==='contract')fields=`${selectField('Cliente','clientId','<option value="">Selecionar</option>'+opts(clients,''))}${field('Plano contratado','title','','text',true)}${field('Início e primeiro vencimento','date',lifecycleToday(),'date',true)}${field('Quantidade de mensalidades','months',1,'number',true)}${field('Valor mensal (R$)','amount','','number',true)}`;
 if(action==='pay')fields=field('Data do pagamento','paidAt',lifecycleToday(),'date',true);
 openModal(`<form id="operationForm"><h2>${{session:'Criar turma',contract:'Novo contrato',pay:'Registrar pagamento'}[action]}</h2>${fields}<p role="alert" id="operationFormError"></p>${footer()}</form>`);
 const form=$('#operationForm');
 form.onsubmit=async event=>{
  event.preventDefault();const button=event.submitter;button.disabled=true;
  try{
   if(workspace!==activeWorkspace)throw Error('A empresa mudou. Abra o cadastro novamente.');
   const command={...Object.fromEntries(new FormData(form)),action,id:commandId};
   for(const key of ['duration','capacity','weeks','months'])if(key in command)command[key]=Number(command[key]);
   if('amount' in command)command.cents=Math.round(Number(command.amount)*100);
   await operationCommand(command);
   if(form.isConnected)closeModal();
   if(workspace===activeWorkspace&&page==='customer_operations')renderCustomerOperations();
  }catch(error){form.querySelector('[role=alert]').textContent=error.message;}finally{button.disabled=false;}
 };
}
function operationParticipants(data,id){
 const session=data.sessions.find(row=>row.id===id),clients=new Map(data.clients.map(client=>[client.id,client.name]));
 openModal(`<h2>${esc(session.title)}</h2>
  ${operationTable(['Cliente','Situação','Ações'],data.bookings.filter(row=>row.sessionId===id).map(row=>
   `<tr><td>${esc(clients.get(row.clientId))}</td><td>${row.status}</td><td>${['Reservado','Presente','Ausente'].includes(row.status)?operationAction('Presente','attendance',id,row.clientId,'Presente')+' '+operationAction('Ausente','attendance',id,row.clientId,'Ausente'):''}${['Reservado','Espera'].includes(row.status)?operationAction('Cancelar reserva','cancel_booking',id,row.clientId):''}</td></tr>`))}
  <form id="bookingForm">${selectField('Cliente','clientId','<option value="">Selecionar</option>'+opts(data.clients,''))}<button class="btn primary">Reservar vaga</button></form>
  <p role="alert" id="operationError"></p><button type="button" class="btn" onclick="closeModal()">Fechar</button>`);
 const modal=$('#modal');
 bindOperationActions(modal,data);
 $('#bookingForm').onsubmit=async event=>{
  event.preventDefault();const button=event.submitter;button.disabled=true;
  try{const result=await operationCommand({action:'book',id,clientId:new FormData(event.target).get('clientId')});operationParticipants(result,id);}
  catch(error){modal.querySelector('[role=alert]').textContent=error.message;button.disabled=false;}
 };
}
function bindOperationActions(host,data){
 host.querySelectorAll('[data-operation]').forEach(button=>button.onclick=async()=>{
  const {operation:action,id,client:clientId,status}=button.dataset;
  if(action==='participants')return operationParticipants(data,id);
  if(action==='pay')return operationForm(action,id);
  if(action==='client'){lifecycleWorkspace=activeWorkspace;lifecycleClient=clientId;lifecycleTab='overview';page='lifecycle';return render();}
  if(['cancel_session','contract_status'].includes(action)&&!confirm('Confirmar esta alteração?'))return;
  button.disabled=true;
  try{
   const result=await operationCommand({action,id,clientId,status});
   if(host.id==='modal')operationParticipants(result,id);
   else renderCustomerOperations();
  }catch(error){host.querySelector('[role=alert]').textContent=error.message;button.disabled=false;}
 });
}
async function renderCustomerPortal(){
 const data=await nativeFetch('customer-operations');
 for(const key of Object.keys(localStorage))if(key.startsWith('flexivel'))localStorage.removeItem(key);
 document.querySelector('body > aside').hidden=true;
 const main=document.querySelector('main');
 main.replaceChildren();main.style.margin='0 auto';main.style.maxWidth='1000px';
 const header=document.createElement('header');header.innerHTML='<strong>FLEXÍVEL</strong>';header.append(logout);main.append(header);
 const host=document.createElement('section');main.append(host);
 host.innerHTML=head('Olá, '+esc(data.client.name),esc(data.company))+
  '<h2>Próximas aulas</h2>'+operationTable(['Aula','Professor','Quando','Sua reserva','Ação'],data.sessions.slice().sort((a,b)=>a.startsAt.localeCompare(b.startsAt)).map(row=>{
   const booking=data.bookings.find(b=>b.sessionId===row.id&&b.status!=='Cancelado');
   const action=booking?'cancel_booking':'book';
   return `<tr><td>${esc(row.title)}</td><td>${esc(row.instructor)}</td><td>${lifecycleDate(row.date)} ${esc(row.time)}<small>Horário de Brasília</small></td><td>${booking?.status||'—'}</td><td>${Date.parse(row.startsAt)>Date.now()?operationAction(booking?'Cancelar reserva':'Reservar ou entrar na espera',action,row.id):''}</td></tr>`;
  }))+
  '<h2>Meus planos</h2>'+operationTable(['Plano','Vigência','Situação'],(data.lifecycle.plans||[]).map(row=>`<tr><td>${esc(row.title)}</td><td>${lifecycleDate(row.date)} a ${lifecycleDate(row.endDate)}</td><td>${esc(lifecycleStatus(row,'plans'))}</td></tr>`))+
  '<h2>Minhas mensalidades</h2>'+operationTable(['Descrição','Vencimento','Valor','Situação'],(data.lifecycle.payments||[]).map(row=>`<tr><td>${esc(row.title)}</td><td>${lifecycleDate(row.date)}</td><td>${money(row.cents/100)}</td><td>${esc(lifecycleStatus(row,'payments'))}</td></tr>`))+
  '<h2>Minha frequência</h2>'+operationTable(['Aula','Data','Situação'],(data.lifecycle.classes||[]).map(row=>`<tr><td>${esc(row.title)}</td><td>${lifecycleDate(row.date)}</td><td>${esc(row.status)}</td></tr>`))+
  '<p role="alert"></p>';
 host.querySelectorAll('[data-operation]').forEach(button=>button.onclick=async()=>{
  button.disabled=true;
  try{await operationCommand({action:button.dataset.operation,id:button.dataset.id},true);await renderCustomerPortal();}
  catch(error){host.querySelector('[role=alert]').textContent=error.message;button.disabled=false;}
 });
 document.documentElement.classList.remove('access-pending');
}
const operationsPreviousRender=render;
render=function(){
 operationsPreviousRender();
 operationsNav.hidden=!['master','admin'].includes(crmSession?.role)||!!liveProfilePreview;
 if(page==='customer_operations'&&!operationsNav.hidden)renderCustomerOperations();
};
