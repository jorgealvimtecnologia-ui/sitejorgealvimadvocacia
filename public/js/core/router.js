// Módulo Core: Roteamento de Abas e Hash da URL

function switchTab(tab) {
  const tabs = [
    'leads', 'clients', 'lawsuits', 'calendar', 'publications',
    'docs', 'finance', 'nfse', 'blog', 'audit', 'pre-clients',
    'judicial', 'offices', 'drive', 'users', 'hr', 'rockets'
  ];

  const activeClass = "flex items-center space-x-1.5 px-3.5 py-1.5 rounded-xl font-bold text-xs transition-all border border-gold-400 bg-gradient-to-r from-amber-500 via-gold-500 to-amber-600 text-white shadow-sm cursor-pointer";
  const inactiveClass = "flex items-center space-x-1.5 px-3.5 py-1.5 rounded-xl font-semibold text-xs text-slate-700 hover:text-navy-950 hover:bg-slate-100 transition-all border border-slate-200 bg-white cursor-pointer";

  // Oculta todas as seções e reseta os botões
  tabs.forEach(t => {
    const el = document.getElementById(`tab-content-${t}`);
    const btn = document.getElementById(`tab-btn-${t}`);
    if (el) el.classList.add('hidden');
    if (btn) btn.className = inactiveClass;
  });

  // Ativa a aba alvo
  const targetEl = document.getElementById(`tab-content-${tab}`);
  const targetBtn = document.getElementById(`tab-btn-${tab}`);

  if (targetEl) targetEl.classList.remove('hidden');
  if (targetBtn) targetBtn.className = activeClass;

  // Dispara carregamentos específicos do módulo selecionado
  try {
    switch (tab) {
      case 'leads':
        if (typeof loadLeads === 'function') loadLeads();
        break;
      case 'clients':
        if (typeof loadClients === 'function') loadClients();
        break;
      case 'lawsuits':
        if (typeof loadLawsuits === 'function') loadLawsuits();
        break;
      case 'calendar':
        if (typeof initCalendarTab === 'function') initCalendarTab();
        break;
      case 'publications':
        if (typeof initPublicationsTab === 'function') initPublicationsTab();
        break;
      case 'docs':
        if (typeof initDocsTab === 'function') initDocsTab();
        break;
      case 'finance':
        if (typeof initFinanceTab === 'function') initFinanceTab();
        break;
      case 'nfse':
        if (typeof loadNfseList === 'function') loadNfseList();
        break;
      case 'blog':
        if (typeof loadAdminBlogPosts === 'function') loadAdminBlogPosts();
        break;
      case 'audit':
        if (typeof initAuditTab === 'function') initAuditTab();
        break;
      case 'pre-clients':
        if (typeof initPreClientsTab === 'function') initPreClientsTab();
        break;
      case 'judicial':
        if (typeof initJudicialTab === 'function') initJudicialTab();
        break;
      case 'offices':
        if (typeof initOfficesTab === 'function') initOfficesTab();
        break;
      case 'drive':
        if (typeof initDriveTab === 'function') initDriveTab();
        break;
      case 'users':
        if (typeof loadAccessControlMatrix === 'function') loadAccessControlMatrix();
        if (typeof loadUsers === 'function') loadUsers();
        break;
      case 'hr':
        if (typeof initHrTab === 'function') initHrTab();
        break;
      case 'rockets':
        if (typeof initRocketsTab === 'function') initRocketsTab();
        break;
    }
  } catch (err) {
    console.warn(`[ROUTER] Aviso ao inicializar dados da aba ${tab}:`, err);
  }

  try {
    if (typeof renderTabChart === 'function') renderTabChart(tab);
  } catch (e) {}
}

function handleHashRouting() {
  const hash = (window.location.hash || '').toLowerCase().replace('#', '').trim();
  const params = new URLSearchParams(window.location.search);
  const tabParam = (params.get('tab') || '').toLowerCase();
  const subtabParam = (params.get('subtab') || '').toLowerCase();

  if (hash === 'moderacao' || hash === 'comentarios' || hash === 'blog-moderacao' || (tabParam === 'blog' && subtabParam === 'comments')) {
    switchTab('blog');
    setTimeout(() => { if (typeof switchBlogSubTab === 'function') switchBlogSubTab('comments'); }, 50);
  } else if (hash === 'blog' || tabParam === 'blog') {
    switchTab('blog');
  } else if (hash === 'radar' || hash === 'judicial' || tabParam === 'judicial') {
    switchTab('judicial');
  } else if (hash === 'rescisao' || hash === 'rescisao-clt' || (tabParam === 'hr' && subtabParam === 'termination')) {
    switchTab('hr');
    setTimeout(() => { if (typeof switchHrSubTab === 'function') switchHrSubTab('termination'); }, 50);
  } else if (hash === 'rascunhos' || hash === 'agenda' || tabParam === 'calendar') {
    switchTab('calendar');
  } else if (hash === 'hr' || hash === 'rh' || hash === 'pessoal' || tabParam === 'hr') {
    switchTab('hr');
  } else if (hash === 'foguetes' || hash === 'foguete' || hash === 'rockets' || tabParam === 'rockets') {
    switchTab('rockets');
  } else if (hash === 'finance' || hash === 'financeiro' || tabParam === 'finance') {
    switchTab('finance');
  } else if (hash === 'clientes' || hash === 'clients' || tabParam === 'clients') {
    switchTab('clients');
  } else if (hash === 'processos' || hash === 'lawsuits' || tabParam === 'lawsuits') {
    switchTab('lawsuits');
  } else if (hash === 'leads' || hash === 'atendimentos' || tabParam === 'leads') {
    switchTab('leads');
  } else if (hash === 'pre-clients' || hash === 'visitas' || tabParam === 'pre-clients') {
    switchTab('pre-clients');
  } else if (hash === 'users' || hash === 'usuarios' || tabParam === 'users') {
    switchTab('users');
  } else if (hash === 'offices' || hash === 'escritorios' || tabParam === 'offices') {
    switchTab('offices');
  } else if (hash === 'drive' || tabParam === 'drive') {
    switchTab('drive');
  } else if (hash) {
    switchTab(hash);
  } else {
    switchTab('leads');
  }
}

window.addEventListener('hashchange', handleHashRouting);
