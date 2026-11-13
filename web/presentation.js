/* Shared symbols and compact navigation. Access rules stay in access-ui.js. */
const crmIcons = {
  overview: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
  clients: '<circle cx="9" cy="8" r="3"/><path d="M3 20v-2a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v2m1-14a3 3 0 0 1 0 6m4 8v-2a4 4 0 0 0-2-3.5"/>',
  pipeline: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M9 8v8m6-8v5"/>',
  companies: '<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M9 8h1m4 0h1m-6 4h1m4 0h1m-4 9v-4h2v4"/>',
  automations: '<path d="M13 2 4 14h7l-1 8 10-12h-7l1-8Z"/>',
  branding: '<circle cx="12" cy="12" r="8"/><path d="M12 4v16"/>',
  whatsapp: '<path d="M20 11.5a8 8 0 0 1-8 8H4l1.6-3.8A8 8 0 1 1 20 11.5Z"/><path d="M8 12h8"/>',
  activity_log: '<circle cx="12" cy="12" r="8"/><path d="M12 7v5l3 2"/>',
  access_members: '<path d="m12 3 7 3v5c0 4-3 8-7 10-4-2-7-6-7-10V6l7-3Z"/><path d="m9 12 2 2 4-4"/>',
  all_pipelines: '<rect x="3" y="8" width="14" height="12" rx="2"/><path d="M7 4h12a2 2 0 0 1 2 2v10M8 12h4m-4 4h4"/>',
  value: '<path d="M4 19V5m0 14h16m-13-5 4-4 3 2 5-5m-4 0h4v4"/>',
  arrow: '<path d="M4 12h15m-6-6 6 6-6 6"/>',
  menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
  moon: '<path d="M20 15a8 8 0 0 1-11-11 8 8 0 1 0 11 11Z"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1 1m12 12 1 1M5 19l1-1M18 6l1-1"/>',
  expand: '<path d="M4 9V4h5m6 0h5v5m0 6v5h-5m-6 0H4v-5"/>',
  restore: '<path d="M9 4v5H4m16 0h-5V4m0 16v-5h5m-16 0h5v5"/>'
};
function crmIcon(name) {
  return `<svg class="crm-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${crmIcons[name] || crmIcons.overview}</svg>`;
}
function overviewContent() {
  const open = state.deals.filter(d => !d.status || d.status === 'Aberta');
  const value = open.reduce((sum, d) => sum + (Number(d.value) || 0), 0);
  const metrics = [
    ['clients', 'Clientes cadastrados', state.clients.length, 'Contatos da empresa'],
    ['pipeline', 'Negociações abertas', open.length, 'Em andamento nos funis'],
    ['value', 'Valor em negociação', money(value), 'Soma das negociações abertas']
  ];
  const pipelines = (state.pipelines || []).map(p => ({
    name: p.name, count: open.filter(d => d.pipelineId === p.id).length
  }));
  const max = Math.max(1, ...pipelines.map(p => p.count));
  return head('Visão geral', 'Acompanhe os resultados comerciais de ' + esc(state.company) + '.', btn('＋ Novo cliente', 'clientForm()'))
    + `<section class="stats" aria-label="Indicadores comerciais">${metrics.map(([icon, label, total, note]) => `
      <div class="card stat"><div class="stat-label"><span class="stat-icon">${crmIcon(icon)}</span>${label}</div>
      <strong>${total}</strong><span class="muted">${note}</span></div>`).join('')}</section>
    <div class="overview-grid">
      <section class="card overview-panel">
        <div class="sectionhead"><h2>Carteira por funil</h2><button class="link" onclick="go('pipeline')">Ver funis ${crmIcon('arrow')}</button></div>
        <p class="muted overview-caption">Negociações abertas por funil</p>
        <ul class="pipeline-summary">${pipelines.map(p => `<li><div><span>${esc(p.name)}</span><strong>${p.count}</strong></div>
          <div class="progress" aria-hidden="true"><span style="width:${p.count / max * 100}%"></span></div></li>`).join('') || '<li class="empty">Nenhum funil cadastrado.</li>'}</ul>
      </section>
      <section class="card overview-panel">
        <div class="sectionhead"><h2>Clientes</h2><button class="link" onclick="go('clients')">Ver todos ${crmIcon('arrow')}</button></div>
        <div class="tablewrap"><table><thead><tr><th>CLIENTE</th><th>EMPRESA</th><th>STATUS</th><th><span class="visually-hidden">Ações</span></th></tr></thead>
        <tbody>${clientRows(state.clients.slice(-4).reverse())}</tbody></table></div>
      </section>
    </div>`;
}
function installCrmPresentation() {
  const sidebar = document.querySelector('body > aside');
  const mobileMenu = document.getElementById('mobileMenu');
  const navKeys = new Map([['Acessos da empresa', 'access_members'], ['Todos os funis', 'all_pipelines']]);
  for (const button of sidebar.querySelectorAll('.nav')) {
    const label = button.textContent.trim().replace(/^[^\p{L}\p{N}]+/u, '');
    const key = button.dataset.page || navKeys.get(label);
    button.classList.add('crm-nav-item');
    button.dataset.icon = key === 'sales_teams' ? 'clients' : key;
    button.replaceChildren();
    button.insertAdjacentHTML('afterbegin', crmIcon(button.dataset.icon));
    const text = document.createElement('span');
    text.textContent = label;
    button.append(text);
  }
  function setMobileMenu(open) {
    sidebar.classList.toggle('mobile-menu-open', open);
    mobileMenu.setAttribute('aria-expanded', String(open));
  }
  mobileMenu.innerHTML = crmIcon('menu');
  mobileMenu.onclick = () => setMobileMenu(mobileMenu.getAttribute('aria-expanded') !== 'true');
  sidebar.addEventListener('click', e => {
    if (e.target.closest('.nav, .brand') && getComputedStyle(mobileMenu).display !== 'none') {
      setMobileMenu(false);
      mobileMenu.focus();
    }
  });
  sidebar.addEventListener('keydown', e => {
    if (e.key === 'Escape' && sidebar.classList.contains('mobile-menu-open')) {
      setMobileMenu(false);
      mobileMenu.focus();
    }
  });
}
