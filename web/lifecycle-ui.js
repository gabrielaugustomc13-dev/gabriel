const lifecycleNav = document.createElement('button');
lifecycleNav.className = 'nav';
lifecycleNav.dataset.page = 'lifecycle';
lifecycleNav.textContent = 'Gestão de clientes';
document.querySelector('aside .asidefoot').before(lifecycleNav);
let lifecycleClient = '';
lifecycleNav.hidden = true;
let lifecycleWorkspace = '';
let lifecycleTab = 'overview';

const lifecycleAllowed = () => ['master', 'admin'].includes(crmSession?.role);
const lifecycleToday = () => new Intl.DateTimeFormat('sv-SE', {timeZone: 'America/Sao_Paulo'}).format(new Date());
const lifecycleDate = date => date ? esc(date.split('-').reverse().join('/')) : '—';
const lifecycleRows = (key, id) => (state.lifecycle?.[key] || []).filter(row => !id || row.clientId === id);
function lifecycleStatus(row, key) {
  const today = lifecycleToday();
  if (key === 'payments' && row.status === 'Pendente' && row.date < today) return 'Em atraso';
  if (key === 'plans' && row.status === 'Ativo' && row.endDate && row.endDate < today) return 'Vencido';
  return row.status || 'Registrada';
}

function renderLifecycle() {
  const host = $('#app');
  if (lifecycleWorkspace !== activeWorkspace) {
    lifecycleWorkspace = activeWorkspace;
    lifecycleClient = '';
    lifecycleTab = 'overview';
  }
  const client = state.clients.find(c => c.id === lifecycleClient);
  const tabs = client ? [['overview','Resumo'], ...Object.entries(LifecycleCore.types).map(([key, type]) => [key, type.label])] :
    [['overview','Visão geral'], ['clients','Clientes'], ['classes','Agenda e presença'], ['payments','Financeiro']];
  if (!tabs.some(([key]) => key === lifecycleTab)) lifecycleTab = 'overview';
  const title = client?.name || 'Gestão de clientes';
  host.innerHTML = head(esc(title), esc(client ? [client.status, client.email, client.phone].filter(Boolean).join(' · ') : state.company),
    client ? btn('Voltar à gestão','lifecycleOpen() ',false) + btn('Editar cadastro','lifecycleClientForm(lifecycleClient)') :
      btn('Novo cliente','lifecycleClientForm()')) +
    `<div class="tabs lifecycle-tabs" aria-label="Gestão de clientes">${tabs.map(([key, label]) =>
      `<button type="button" class="btn ${key === lifecycleTab ? 'primary' : ''}" data-life-tab="${key}" aria-pressed="${key === lifecycleTab}">${label}</button>`).join('')}</div>
     <div id="lifecycleContent"></div>`;
  host.querySelectorAll('[data-life-tab]').forEach(button => button.onclick = () => {
    lifecycleTab = button.dataset.lifeTab;
    renderLifecycle();
  });
  if (lifecycleTab === 'overview') renderLifecycleOverview(client);
  else if (lifecycleTab === 'clients') renderLifecycleClients();
  else renderLifecycleRecords(lifecycleTab, client);
}

function lifecycleClientForm(id) {
  clientForm(id);
  $('#clientform h2').textContent = id ? 'Editar cadastro do cliente' : 'Novo cliente';
}

function lifecycleOpen(clientId = '') {
  lifecycleClient = clientId;
  lifecycleTab = clientId ? 'overview' : 'clients';
  renderLifecycle();
}

function renderLifecycleOverview(client) {
  const id = client?.id;
  const payments = lifecycleRows('payments', id);
  const classes = lifecycleRows('classes', id);
  const overdue = payments.filter(row => lifecycleStatus(row, 'payments') === 'Em atraso');
  const totals = rows => money(rows.reduce((sum, row) => sum + row.cents, 0) / 100);
  const activePlans = lifecycleRows('plans', id).filter(row => lifecycleStatus(row, 'plans') === 'Ativo' && row.date <= lifecycleToday());
  const metrics = client ? [
    ['Planos ativos', activePlans.length],
    ['Presenças', classes.filter(row => row.status === 'Presente').length],
    ['Total pago', totals(payments.filter(row => row.status === 'Pago'))],
    ['Em atraso', totals(overdue)]
  ] : [
    ['Clientes ativos', state.clients.filter(row => row.status === 'Ativo').length],
    ['Em prospecção', state.clients.filter(row => row.status === 'Em prospecção').length],
    ['Aulas agendadas', classes.filter(row => row.status === 'Agendada' && row.date >= lifecycleToday()).length],
    ['Em atraso', totals(overdue)]
  ];
  $('#lifecycleContent').innerHTML = `<div class="lifecycle-metrics">${metrics.map(([label,value]) =>
    `<div class="card"><span class="muted">${label}</span><strong>${esc(value)}</strong></div>`).join('')}</div>
    ${client ? `<section class="card lifecycle-section"><h2>Negociações</h2>${state.deals.filter(deal => deal.contactId === id)
      .map(deal => `<p>${esc(deal.name)} <span class="muted">· ${esc(deal.status)} · ${money(deal.value || 0)}</span></p>`).join('') || '<p class="muted">Nenhuma negociação vinculada.</p>'}</section>` :
      '<div id="lifecycleClients"></div>'}`;
  if (!client) renderLifecycleClients($('#lifecycleClients'));
}

function renderLifecycleClients(host = $('#lifecycleContent')) {
  host.innerHTML = `<section class="card lifecycle-section"><div class="sectionhead"><h2>Carteira de clientes</h2></div>
   <div class="lifecycle-filters">
    <label class="field">Buscar<input id="lifeSearch" type="search" placeholder="Nome, telefone ou e-mail"></label>
    <label class="field">Status<select id="lifeStatus"><option value="">Todos</option>${[...new Set(state.clients.map(c => c.status).filter(Boolean))].sort().map(status => `<option>${esc(status)}</option>`).join('')}</select></label>
   </div><div class="lifecycle-table"><table><thead><tr><th>Cliente</th><th>Status</th><th>Última presença</th><th></th></tr></thead><tbody id="lifeClientsRows"></tbody></table></div></section>`;
  const lastVisits = new Map();
  for (const row of lifecycleRows('classes').filter(row => row.status === 'Presente')) {
    if (row.date > (lastVisits.get(row.clientId) || '')) lastVisits.set(row.clientId, row.date);
  }
  const filter = () => {
    const search = $('#lifeSearch').value.trim().toLowerCase();
    const status = $('#lifeStatus').value;
    $('#lifeClientsRows').innerHTML = state.clients.filter(c => (!status || c.status === status) &&
      [c.name,c.email,c.phone].some(value => String(value || '').toLowerCase().includes(search)))
      .map(c => `<tr><td><b>${esc(c.name)}</b><small>${esc(c.email || c.phone || '')}</small></td><td>${esc(c.status)}</td>
      <td>${lifecycleDate(lastVisits.get(c.id))}</td><td><button type="button" class="link" data-life-client="${esc(c.id)}">Abrir ficha</button></td></tr>`).join('') ||
      '<tr><td colspan="4">Nenhum cliente encontrado.</td></tr>';
    host.querySelectorAll('[data-life-client]').forEach(button => button.onclick = () => lifecycleOpen(button.dataset.lifeClient));
  };
  $('#lifeSearch').oninput = filter;
  $('#lifeStatus').onchange = filter;
  filter();
}

function renderLifecycleRecords(key, client) {
  const type = LifecycleCore.types[key];
  const rows = lifecycleRows(key, client?.id).slice().sort((a,b) => b.date.localeCompare(a.date));
  const clients = new Map(state.clients.map(c => [c.id,c.name]));
  const host = $('#lifecycleContent');
  host.innerHTML = `<section class="card lifecycle-section"><div class="sectionhead"><h2>${type.label}</h2>
   <button class="btn primary" id="lifeAdd" ${clients.size ? '' : 'disabled'}>Registrar ${type.singular.toLowerCase()}</button></div>
   <div class="lifecycle-table"><table><thead><tr><th>Registro</th>${client ? '' : '<th>Cliente</th>'}<th>Data</th><th>Status</th><th></th></tr></thead>
   <tbody>${rows.map(row => `<tr><td><b>${esc(row.title)}</b><small>${esc(row.notes)}${key === 'payments' ? ' · ' + money(row.cents/100) : ''}</small></td>
     ${client ? '' : `<td>${esc(clients.get(row.clientId))}</td>`}<td>${lifecycleDate(row.date)}${row.endDate ? ' a ' + lifecycleDate(row.endDate) : ''}${row.paidAt ? '<small>Pago em ' + lifecycleDate(row.paidAt) + '</small>' : ''}</td>
     <td>${esc(lifecycleStatus(row,key))}</td><td><button class="link" data-life-edit="${esc(row.id)}">Editar</button></td></tr>`).join('') ||
     '<tr><td colspan="5">Nenhum registro.</td></tr>'}</tbody></table></div></section>`;
  $('#lifeAdd').onclick = () => lifecycleForm(key, client?.id);
  host.querySelectorAll('[data-life-edit]').forEach(button => button.onclick = () => lifecycleForm(key, client?.id, rows.find(row => row.id === button.dataset.lifeEdit)));
}

function lifecycleForm(key, clientId, row) {
  if (liveProfilePreview || !lifecycleAllowed()) return;
  const formWorkspace = activeWorkspace;
  const draftId = row?.id || uid();
  const type = LifecycleCore.types[key];
  const selectedClient = row?.clientId || clientId;
  const dateLabel = {plans:'Início do plano',classes:'Data da aula',payments:'Vencimento',notes:'Data da interação'}[key];
  openModal(`<form id="lifeForm"><h2>${row ? 'Editar' : 'Registrar'} ${type.singular.toLowerCase()}</h2>
   ${selectedClient ? '' : selectField('Cliente','clientId','<option value="">Selecionar</option>'+opts(state.clients,''))}
   ${field(type.singular,'title',row?.title || '', 'text',true)}
   ${field(dateLabel,'date',row?.date || lifecycleToday(),'date',true)}
   ${key === 'plans' ? field('Término do plano','endDate',row?.endDate || '','date') : ''}
   ${key === 'payments' ? `<label class="field">Valor (R$)<input name="amount" type="number" min="0.01" max="100000000" step="0.01" required value="${row ? row.cents/100 : ''}"></label>${field('Pago em','paidAt',row?.paidAt || '','date')}` : ''}
   ${type.statuses.length ? selectField('Status','status',type.statuses.map(status => `<option ${status === row?.status ? 'selected' : ''}>${status}</option>`).join('')) : ''}
   <label class="field">Observações<textarea name="notes" maxlength="2000">${esc(row?.notes)}</textarea></label>
   <p id="lifeError" role="alert"></p>${footer()}</form>`);
  $('#lifeForm').onsubmit = async event => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = Object.fromEntries(new FormData(form));
    const record = {id:draftId, clientId:selectedClient || data.clientId, title:data.title.trim(), date:data.date, notes:data.notes.trim()};
    if (type.statuses.length) record.status = data.status;
    if (key === 'plans') record.endDate = data.endDate;
    if (key === 'payments') {
      record.cents = Math.round(Number(data.amount)*100);
      record.paidAt = data.status === 'Pago' ? data.paidAt : '';
    }
    const workspace = formWorkspace;
    const submit = event.submitter;
    if (submit) submit.disabled = true;
    try {
      if (nativeSyncDirty && !nativeSyncBusy) await syncNative();
      if (nativeSyncBusy || nativeSyncDirty || nativeSyncError || !nativeSyncReady || workspace !== activeWorkspace) throw Error('Sincronize os dados da empresa antes de salvar.');
      const updated = {...state.lifecycle, [key]: [...lifecycleRows(key).filter(item => item.id !== record.id), record]};
      const next = {...state, lifecycle:updated};
      LifecycleCore.validate(next);
      // Use the normal versioned save flow for company switching, conflict handling and audit.
      state = next;
      save();
      await syncNative();
      if (nativeSyncError || !nativeSyncReady) throw Error(nativeSyncError || 'Não foi possível confirmar a gravação.');
      closeModal();
      render();
      toast('Registro salvo');
    } catch (error) {
      form.querySelector('#lifeError').textContent = error.message;
    } finally {
      if (submit) submit.disabled = false;
    }
  };
}

const lifecyclePreviousRender = render;
render = function () {
  lifecyclePreviousRender();
  lifecycleNav.hidden = !lifecycleAllowed() || !!liveProfilePreview;
  if (page === 'lifecycle' && lifecycleAllowed() && !liveProfilePreview) {
    $('#breadcrumb').textContent = 'Gestão de clientes';
    renderLifecycle();
  }
};
