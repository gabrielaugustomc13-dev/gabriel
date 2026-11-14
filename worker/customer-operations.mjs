// Mutations use the workspace CAS transaction, including their audit entries.
function customerToday() {
 return new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Sao_Paulo'}).format(new Date());
}
function customerDate(value) {
 if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))throw Error('Data inválida.');
 const date=new Date(value+'T00:00:00Z');
 if(!Number.isFinite(date.getTime())||date.toISOString().slice(0,10)!==value)throw Error('Data inválida.');
 return value;
}
function customerText(value) {
 if(typeof value!=='string'||!value.trim()||value.length>150)throw Error('Preencha nome e responsável, com até 150 caracteres.');
 return value.trim();
}
function customerInteger(value,min,max) {
 if(!Number.isSafeInteger(value)||value<min||value>max)throw Error('Quantidade ou valor fora do limite.');
 return value;
}
function customerMonth(start,index) {
 const date=new Date(start+'T00:00:00Z');
 const target=new Date(Date.UTC(date.getUTCFullYear(),date.getUTCMonth()+index,1));
 const last=new Date(Date.UTC(target.getUTCFullYear(),target.getUTCMonth()+1,0)).getUTCDate();
 target.setUTCDate(Math.min(date.getUTCDate(),last));
 return target.toISOString().slice(0,10);
}
function customerPending(state) {
 const today=customerToday(),ops=state.customerOperations||{};
 const rows=[];
 for(const payment of state.lifecycle?.payments||[])if(payment.status==='Pendente'&&payment.date<today)rows.push({key:'payment-'+payment.id,clientId:payment.clientId,title:'Pagamento vencido: '+payment.title,date:payment.date,kind:'payments'});
 for(const contract of ops.contracts||[])if(contract.status==='Ativo'&&contract.endDate>=today&&contract.endDate<=new Date(Date.now()+7*86400000).toISOString().slice(0,10))rows.push({key:'contract-'+contract.id,clientId:contract.clientId,title:'Plano próximo do vencimento: '+contract.title,date:contract.endDate,kind:'plans'});
 const cutoff=new Date(Date.now()-10*86400000).toISOString().slice(0,10);
 for(const client of state.clients.filter(c=>c.status==='Ativo')){
  const visits=(state.lifecycle?.classes||[]).filter(row=>row.clientId===client.id&&row.status==='Presente').map(row=>row.date).sort();
  if(visits.length&&visits.at(-1)<cutoff)rows.push({key:'absence-'+client.id,clientId:client.id,title:'Sem presença há mais de 10 dias',date:visits.at(-1),kind:'classes'});
 }
 return rows;
}
function customerMutate(state,command,access) {
 const today=customerToday();
 const ops=state.customerOperations||={sessions:[],bookings:[],contracts:[]};
 const history=state.lifecycle||={};
 history.classes||=[];history.payments||=[];history.plans||=[];
 const isCustomer=access.role==='customer';
 if(isCustomer&&!['book','cancel_booking'].includes(command.action))throw Error('Ação não autorizada.');
 if(!isCustomer&&!['master','admin'].includes(access.role))throw Error('Área administrativa.');
 if(!validId(command.id))throw Error('Identificador da operação inválido.');
 const clientId=isCustomer?access.clientId:command.clientId;
 const client=state.clients.find(row=>row.id===clientId);
 if(command.action==='session'){
  if(ops.sessions.some(row=>row.seriesId===command.id))return;
  const date=customerDate(command.date),time=String(command.time||'');
  if(!/^([01]\d|2[0-3]):[0-5]\d$/.test(time))throw Error('Horário inválido.');
  const title=customerText(command.title),instructor=customerText(command.instructor);
  const capacity=customerInteger(command.capacity,1,500),duration=customerInteger(command.duration,5,480),weeks=customerInteger(command.weeks,1,52);
  if(ops.sessions.length+weeks>2000)throw Error('Limite de aulas atingido. Exporte e arquive antes de ampliar a agenda.');
  for(let i=0;i<weeks;i++){
   const day=new Date(date+'T00:00:00Z');day.setUTCDate(day.getUTCDate()+i*7);
   const sessionDate=day.toISOString().slice(0,10);
   const startsAt=new Date(sessionDate+'T'+time+':00-03:00').toISOString();
   const start=Date.parse(startsAt),end=start+duration*60000;
   if(ops.sessions.some(row=>row.instructor.toLowerCase()===instructor.toLowerCase()&&!row.cancelled&&Date.parse(row.startsAt)<end&&Date.parse(row.startsAt)+row.duration*60000>start))throw Error('O professor já possui uma aula nesse horário.');
   ops.sessions.push({id:command.id+'-'+i,seriesId:command.id,title,instructor,capacity,duration,date:sessionDate,time,startsAt,cancelled:false});
  }
 }else if(command.action==='contract'){
  if(!client)throw Error('Cliente inválido.');
  if(ops.contracts.some(row=>row.id===command.id))return;
  const date=customerDate(command.date),months=customerInteger(command.months,1,36),cents=customerInteger(command.cents,1,10000000000),title=customerText(command.title);
  const contract={id:command.id,clientId,date,title,months,cents,status:'Ativo',endDate:customerMonth(date,months)};
  ops.contracts.push(contract);
  history.plans.push({id:command.id,clientId,date,endDate:contract.endDate,title,status:'Ativo',notes:''});
  for(let i=0;i<months;i++)history.payments.push({id:command.id+'-bill-'+i,contractId:command.id,clientId,title:title+' · '+(i+1)+'/'+months,date:customerMonth(date,i),cents,status:'Pendente',paidAt:'',notes:''});
 }else if(command.action==='contract_status'){
  const contract=ops.contracts.find(row=>row.id===command.id);
  if(!contract||!['Ativo','Pausado','Encerrado'].includes(command.status))throw Error('Contrato inválido.');
  if(contract.status==='Encerrado'&&command.status!=='Encerrado')throw Error('Crie uma renovação para este contrato encerrado.');
  contract.status=command.status;
  const plan=history.plans.find(row=>row.id===contract.id);if(plan)plan.status=command.status;
  for(const payment of history.payments.filter(row=>row.contractId===contract.id&&row.date>=today&&row.status!=='Pago')){
   if(command.status==='Ativo'&&payment.contractPaused){payment.status='Pendente';delete payment.contractPaused;}
   else if(command.status!=='Ativo'&&payment.status==='Pendente'){payment.status='Cancelado';payment.contractPaused=command.status==='Pausado';}
  }
 }else if(command.action==='pay'){
  const payment=history.payments.find(row=>row.id===command.id);
  if(!payment||payment.status==='Cancelado')throw Error('Cobrança não disponível.');
  if(payment.status==='Pago')return;
  const paidAt=customerDate(command.paidAt);if(paidAt>today)throw Error('Pagamento não pode estar no futuro.');
  payment.status='Pago';payment.paidAt=paidAt;
 }else if(['book','cancel_booking','attendance','cancel_session'].includes(command.action)){
  const session=ops.sessions.find(row=>row.id===command.id);if(!session)throw Error('Aula não encontrada.');
  const started=Date.parse(session.startsAt)<=Date.now();
  if(command.action==='cancel_session'){
   session.cancelled=true;
   for(const booking of ops.bookings.filter(row=>row.sessionId===session.id&&['Reservado','Espera'].includes(row.status)))booking.status='Cancelado';
   return;
  }
  if(!client)throw Error('Cliente inválido.');
  let booking=ops.bookings.find(row=>row.sessionId===session.id&&row.clientId===clientId);
  if(command.action==='book'){
   if(session.cancelled||started)throw Error('Aula indisponível para reserva.');
   if(booking&&booking.status!=='Cancelado')return;
   const activePlan=history.plans.some(row=>row.clientId===clientId&&row.status==='Ativo'&&row.date<=session.date&&(!row.endDate||row.endDate>=session.date));
   if(!activePlan)throw Error('O cliente precisa de um plano ativo na data da aula.');
   if(!booking){booking={id:crypto.randomUUID(),sessionId:session.id,clientId};ops.bookings.push(booking);}
   const occupied=ops.bookings.filter(row=>row.sessionId===session.id&&['Reservado','Presente'].includes(row.status)).length;
   Object.assign(booking,{status:occupied<session.capacity?'Reservado':'Espera',bookedAt:new Date().toISOString()});
  }else if(command.action==='cancel_booking'){
   if(!booking||booking.status==='Cancelado')return;
   if(started||!['Reservado','Espera'].includes(booking.status))throw Error('A reserva só pode ser cancelada antes do início.');
   booking.status='Cancelado';
   const waiting=ops.bookings.filter(row=>row.sessionId===session.id&&row.status==='Espera').sort((a,b)=>a.bookedAt.localeCompare(b.bookedAt));
   const occupied=ops.bookings.filter(row=>row.sessionId===session.id&&['Reservado','Presente'].includes(row.status)).length;
   if(occupied<session.capacity&&waiting.length)waiting[0].status='Reservado';
  }else{
   if(!booking||session.cancelled||!['Presente','Ausente'].includes(command.status)||!['Reservado','Presente','Ausente'].includes(booking.status))throw Error('Reserva não confirmada.');
   if(!started)throw Error('A presença pode ser registrada a partir do início da aula.');
   booking.status=command.status;
   const record={id:booking.id,clientId,title:session.title,date:session.date,status:command.status,notes:''};
   const index=history.classes.findIndex(row=>row.id===booking.id);
   if(index<0)history.classes.push(record);else history.classes[index]=record;
  }
 }else throw Error('Operação desconhecida.');
 if(ops.bookings.length>5000||ops.contracts.length>2000)throw Error('Limite de registros desta empresa atingido.');
}
function customerProjection(row,access) {
 const ops=row.state.customerOperations||{sessions:[],bookings:[],contracts:[]};
 if(access.role!=='customer')return {company:row.name,clients:row.state.clients.map(({id,name})=>({id,name})),...ops,lifecycle:row.state.lifecycle||{},pending:customerPending(row.state),usage:{bytes:new TextEncoder().encode(JSON.stringify(row.state)).length,limit:1500000}};
 const client=row.state.clients.find(client=>client.id===access.clientId);
 if(!client)throw Error('Cadastro do cliente não disponível.');
 const today=customerToday();
 return {company:row.name,client:{id:client.id,name:client.name},
  sessions:ops.sessions.filter(row=>row.date>=today&&!row.cancelled),
  bookings:ops.bookings.filter(row=>row.clientId===client.id),
  contracts:ops.contracts.filter(row=>row.clientId===client.id),
  lifecycle:Object.fromEntries(['plans','payments','classes'].map(key=>[key,(row.state.lifecycle?.[key]||[]).filter(item=>item.clientId===client.id).map(({notes,...item})=>item)]))};
}
async function customerOperationsHandler(request,env,url,access) {
 const customer=access.role==='customer';
 const wid=customer?access.workspaceId:url.searchParams.get('workspaceId');
 if(!customer&&!['master','admin'].includes(access.role)||!crmCompanyAllowed(access,wid))return json({error:'Empresa não autorizada'},403);
 if(request.method==='GET'){
  const row=await getWorkspace(env,wid);if(!row)return json({error:'Empresa não encontrada'},404);
  return json(customerProjection(row,access));
 }
 if(request.method!=='POST')return json({error:'Método não permitido'},405);
 const text=await request.text();if(text.length>10000)return json({error:'Conteúdo muito grande'},413);
 const command=JSON.parse(text);
 for(let attempt=0;attempt<3;attempt++){
  const row=await getWorkspace(env,wid);if(!row)return json({error:'Empresa não encontrada'},404);
  customerMutate(row.state,command,access);
  const result=await putWorkspace(env,wid,row.state,row.name,row.version,false,false,auditActor(request,'customer_operations'),true);
  if(!result.conflict)return json(customerProjection({...row,state:result.state},access));
 }
 return json({error:'Outra alteração ocorreu. Tente novamente.'},409);
}
