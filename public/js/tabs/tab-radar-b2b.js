/**
 * ==============================================================================
 * SUBMÓDULO: RADAR / PROSPECÇÃO B2B (GOOGLE EMPRESAS & CRM KANBAN)
 * ==============================================================================
 * Jorge Alvim Advocacia — OAB/MG 222.943
 *
 * Funcionalidades:
 * - CRM estilo Kanban visual (Novo -> Contatado -> Sem Resposta -> Em Negociação -> Convertido / Descartado);
 * - Sem descarte destrutivo: contatos descartados mantidos no banco com histórico;
 * - Verificação e sincronização cruzada com Clientes e Leads do escritório (⭐ Já é Cliente);
 * - Gestão de Atendente responsável, anotações e tags/marcações;
 * - Histórico de atendimento completo com linha do tempo a cada movimentação;
 * - Disposições de atendimento padronizadas (entrou em contato, reclamou, opt-out, aguardar doc, etc.);
 * - Filtros geográficos avançados com APIs de Estado (UF), Cidade, Bairro e CEP;
 * - Varredura Google Places ao vivo ou na base local de 7.880 empresas (sem exigir chave ou nicho obrigatório);
 * - Módulo de Campanhas WhatsApp com variáveis dinâmicas ({empresa}, {bairro}, etc.) e disparo via Evolution API ou Fila Web;
 * - Exportação de públicos para Meta Ads (Facebook/Instagram) e Brevo.
 * ==============================================================================
 */

(function () {
  'use strict';

  let currentView = 'kanban'; // 'kanban' ou 'table'
  let currentFilterStatus = 'todos';
  let currentFilterCategory = 'todos';
  let currentFilterNeighborhood = 'todos';
  let currentFilterState = 'MG';
  let currentFilterCity = 'Juiz de Fora';
  let currentFilterAssigned = 'todos';
  let currentFilterEnrichment = 'todos';
  let currentSearchQuery = '';
  let cachedProspects = [];
  let cachedStats = null;
  let activeProspectIdForModal = null;
  let selectedProspectIds = new Set();

  function getAuthToken() {
    if (typeof getToken === 'function') {
      const t = getToken();
      if (t) return t;
    }
    return (
      localStorage.getItem('ja_admin_token') ||
      localStorage.getItem('ja_token') ||
      localStorage.getItem('advocacia_token') ||
      localStorage.getItem('token') ||
      sessionStorage.getItem('token') ||
      ''
    );
  }

  function getHeaders(extra = {}) {
    const token = getAuthToken();
    return {
      'Content-Type': 'application/json',
      ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
      ...extra
    };
  }

  function toast(msg, type = 'info') {
    if (typeof window.wmToast === 'function') {
      window.wmToast(msg);
      return;
    }
    let t = document.getElementById('b2b-floating-toast');
    if (!t) {
      t = document.createElement('div');
      t.id = 'b2b-floating-toast';
      document.body.appendChild(t);
    }
    const bg = type === 'error' 
      ? 'bg-rose-900/95 text-rose-100 border-rose-500/50' 
      : (type === 'success' ? 'bg-emerald-900/95 text-emerald-100 border-emerald-500/50' : 'bg-slate-900/95 text-white border-indigo-500/50');
    t.className = `fixed top-5 right-5 z-[99999999] px-4 py-3 rounded-2xl shadow-2xl text-xs font-bold border backdrop-blur-md transition-all duration-300 pointer-events-none flex items-center gap-2 ${bg}`;
    t.innerHTML = `<span>${msg}</span>`;
    t.style.opacity = '1';
    t.style.transform = 'translateY(0)';
    clearTimeout(t._timeout);
    t._timeout = setTimeout(() => {
      t.style.opacity = '0';
      t.style.transform = 'translateY(-10px)';
    }, 3200);
  }

  const DISPOSITION_LABELS = {
    cliente_entrou_em_contato: '📞 Cliente entrou em contato',
    contato_realizado: '💬 Contato telefônico / WhatsApp realizado',
    cliente_agendado: '📅 Cliente agendado para consulta',
    aguardar_documentacao: '📁 Em atendimento: aguardar documentação',
    aguardar_assinatura: '✍️ Em atendimento: aguardar assinatura',
    enviar_retorno: '✉️ Enviar retorno ao cliente',
    proposta_enviada: '💼 Proposta jurídica enviada',
    cadastrado: '✅ Cadastrado no sistema',
    cliente_reclamou: '⚠️ Cliente reclamou de ser contatado',
    nao_incomodar: '🚫 Não quer ser incomodado (Opt-Out)'
  };

  // Carrega toda a aba
  async function loadRadarB2bTab() {
    await initLocationDropdowns();
    await fetchStats();
    await fetchProspects();
  }
  window.loadRadarB2bTab = loadRadarB2bTab;

  // Inicializa dropdowns geográficos
  async function initLocationDropdowns() {
    try {
      const res = await fetch('/api/radar-b2b/locations/states', {
        headers: getHeaders(),
        credentials: 'same-origin'
      });
      if (!res.ok) return;
      const data = await res.json();
      const states = Array.isArray(data) ? data : (data.states || []);
      
      const filterState = document.getElementById('b2b-filter-state');
      const searchState = document.getElementById('b2b-search-state');

      if (filterState && states && states.length > 0) {
        filterState.innerHTML = '<option value="todos">Todos os Estados</option>' + states.map(s => 
          `<option value="${s.sigla}" ${s.sigla === 'MG' ? 'selected' : ''}>${s.sigla} - ${s.nome}</option>`
        ).join('');
      }

      if (searchState && states && states.length > 0) {
        searchState.innerHTML = states.map(s => 
          `<option value="${s.sigla}" ${s.sigla === 'MG' ? 'selected' : ''}>${s.sigla} - ${s.nome}</option>`
        ).join('');
      }

      // Popula cidades para MG
      await handleStateChange('MG', false);
      await handleSearchModalStateChange('MG');
    } catch (e) {
      console.warn('[RADAR B2B] Erro ao carregar estados:', e);
    }
  }

  // Manipula mudança de estado no filtro
  window.handleStateChange = async function (uf, reload = true) {
    currentFilterState = uf;
    const filterCity = document.getElementById('b2b-filter-city');
    if (!filterCity) return;

    if (uf === 'todos') {
      filterCity.innerHTML = '<option value="todos" selected>Todas as Cidades</option>';
      currentFilterCity = 'todos';
      if (reload) fetchProspects();
      return;
    }

    try {
      const res = await fetch(`/api/radar-b2b/locations/cities?uf=${encodeURIComponent(uf)}`, {
        headers: getHeaders(),
        credentials: 'same-origin'
      });
      if (res.ok) {
        const data = await res.json();
        const cities = Array.isArray(data) ? data : (data.cities || []);
        const optionsHtml = '<option value="todos">Todas as Cidades</option>' + cities.map(c => {
          const cName = typeof c === 'string' ? c : (c.nome || '');
          return `<option value="${escapeHtml(cName)}" ${cName === 'Juiz de Fora' ? 'selected' : ''}>${escapeHtml(cName)}</option>`;
        }).join('');
        filterCity.innerHTML = optionsHtml;
        currentFilterCity = filterCity.value || 'todos';
      }
    } catch (e) {
      console.warn('[RADAR B2B] Erro ao carregar cidades:', e);
    }

    if (reload) {
      fetchProspects();
    }
  };

  // Manipula mudança de estado no modal de busca
  window.handleSearchModalStateChange = async function (uf) {
    const listEl = document.getElementById('b2b-search-cities-list');
    const inputCity = document.getElementById('b2b-search-city');

    try {
      const res = await fetch(`/api/radar-b2b/locations/cities?uf=${encodeURIComponent(uf)}`, {
        headers: getHeaders(),
        credentials: 'same-origin'
      });
      if (res.ok) {
        const data = await res.json();
        const cities = Array.isArray(data) ? data : (data.cities || []);
        if (listEl) {
          listEl.innerHTML = cities.map(c => {
            const cName = typeof c === 'string' ? c : (c.nome || '');
            return `<option value="${escapeHtml(cName)}">`;
          }).join('');
        }
        if (inputCity && !inputCity.value && cities.length > 0) {
          const first = typeof cities[0] === 'string' ? cities[0] : (cities[0].nome || '');
          inputCity.value = uf === 'MG' ? 'Juiz de Fora' : first;
        }
      }
    } catch (e) {
      console.warn('[RADAR B2B] Erro ao carregar cidades no modal:', e);
    }
  };

  // Consulta automática de CEP no modal
  window.handleSearchCepLookup = async function (cep) {
    if (!cep) return;
    const cleanCep = String(cep).replace(/\D/g, '');
    if (cleanCep.length < 8) return;

    try {
      const res = await fetch(`/api/radar-b2b/locations/cep/${cleanCep}`, {
        headers: getHeaders(),
        credentials: 'same-origin'
      });
      if (res.ok) {
        const data = await res.json();
        if (data && !data.error) {
          const searchState = document.getElementById('b2b-search-state');
          const searchCity = document.getElementById('b2b-search-city');
          const searchNb = document.getElementById('b2b-search-neighborhood-input');

          if (searchState && data.uf) searchState.value = data.uf;
          if (searchCity && data.localidade) {
            searchCity.innerHTML = `<option value="${data.localidade}" selected>${data.localidade}</option>`;
          }
          if (searchNb && data.bairro) {
            searchNb.value = data.bairro;
          }
          toast(`📍 CEP localizado: ${data.localidade} - ${data.bairro || ''}`);
        }
      }
    } catch (e) {
      console.warn('[RADAR B2B] Erro na consulta de CEP:', e);
    }
  };

  // Alterna Sub-Tabs (CRM vs Campanhas)
  window.switchB2bSubTab = function (subTab) {
    const crmSec = document.getElementById('b2b-crm-section');
    const campSec = document.getElementById('b2b-campaigns-section');
    const btnCrm = document.getElementById('b2b-tab-btn-crm');
    const btnCamp = document.getElementById('b2b-tab-btn-campaigns');

    if (subTab === 'crm') {
      if (crmSec) crmSec.classList.remove('hidden');
      if (campSec) campSec.classList.add('hidden');
      if (btnCrm) {
        btnCrm.className = 'px-4 py-2 rounded-xl text-xs font-bold transition-all bg-indigo-900 text-white shadow-xs cursor-pointer';
      }
      if (btnCamp) {
        btnCamp.className = 'px-4 py-2 rounded-xl text-xs font-bold transition-all bg-slate-100 hover:bg-slate-200 text-slate-700 cursor-pointer';
      }
    } else {
      if (crmSec) crmSec.classList.add('hidden');
      if (campSec) campSec.classList.remove('hidden');
      if (btnCrm) {
        btnCrm.className = 'px-4 py-2 rounded-xl text-xs font-bold transition-all bg-slate-100 hover:bg-slate-200 text-slate-700 cursor-pointer';
      }
      if (btnCamp) {
        btnCamp.className = 'px-4 py-2 rounded-xl text-xs font-bold transition-all bg-indigo-900 text-white shadow-xs cursor-pointer';
      }
      loadB2bCampaigns();
      window.updateCampTargetEstimate();
    }
  };

  // Busca estatísticas
  async function fetchStats() {
    try {
      const res = await fetch('/api/radar-b2b/stats', {
        headers: getHeaders(),
        credentials: 'same-origin'
      });
      if (!res.ok) return;
      const data = await res.json();
      cachedStats = data;
      renderStatsUI(data);
    } catch (e) {
      console.warn('[RADAR B2B] Erro ao carregar stats:', e);
    }
  }

  function renderStatsUI(data) {
    const elTotal = document.getElementById('b2b-stat-total');
    const elNovos = document.getElementById('b2b-stat-novos');
    const elContatados = document.getElementById('b2b-stat-contatados');
    const elNegociando = document.getElementById('b2b-stat-negociando');
    const elConvertidos = document.getElementById('b2b-stat-convertidos');
    const elOptOut = document.getElementById('b2b-stat-optout');

    if (elTotal) elTotal.textContent = Number(data.total || 0).toLocaleString('pt-BR');
    if (elNovos) elNovos.textContent = Number(data.statusCounts?.novo || 0).toLocaleString('pt-BR');
    if (elContatados) elContatados.textContent = Number((data.statusCounts?.contatado || 0) + (data.statusCounts?.sem_resposta || 0)).toLocaleString('pt-BR');
    if (elNegociando) elNegociando.textContent = Number(data.statusCounts?.negociando || 0).toLocaleString('pt-BR');
    if (elConvertidos) elConvertidos.textContent = Number((data.statusCounts?.convertido || 0) + (data.officeClientCount || 0)).toLocaleString('pt-BR');
    if (elOptOut) elOptOut.textContent = Number(data.optOutCount || 0).toLocaleString('pt-BR');

    const elRobotEnriched = document.getElementById('b2b-stat-robot-enriched');
    const elRobotPending = document.getElementById('b2b-stat-robot-pending');
    if (elRobotEnriched) elRobotEnriched.textContent = Number(data.enrichedCount || 0).toLocaleString('pt-BR');
    if (elRobotPending) elRobotPending.textContent = Number(data.pendingCount || 0).toLocaleString('pt-BR');

    // Popula categorias e bairros nos selects se ainda estiverem vazios
    const selCat = document.getElementById('b2b-filter-category');
    const campCat = document.getElementById('b2b-camp-target-category');
    if (selCat && selCat.options.length <= 1 && data.topCategories) {
      data.topCategories.forEach(cat => {
        const opt = document.createElement('option');
        opt.value = cat.primary_type_display;
        opt.textContent = `${cat.primary_type_display} (${cat.count})`;
        selCat.appendChild(opt);

        if (campCat) {
          const opt2 = document.createElement('option');
          opt2.value = cat.primary_type_display;
          opt2.textContent = `${cat.primary_type_display} (${cat.count})`;
          campCat.appendChild(opt2);
        }
      });
    }

    const selNb = document.getElementById('b2b-filter-neighborhood');
    const campNb = document.getElementById('b2b-camp-target-neighborhood');
    if (selNb && selNb.options.length <= 1 && data.topNeighborhoods) {
      data.topNeighborhoods.forEach(nb => {
        const opt = document.createElement('option');
        opt.value = nb.neighborhood;
        opt.textContent = `${nb.neighborhood} (${nb.count})`;
        selNb.appendChild(opt);

        if (campNb) {
          const opt2 = document.createElement('option');
          opt2.value = nb.neighborhood;
          opt2.textContent = `${nb.neighborhood} (${nb.count})`;
          campNb.appendChild(opt2);
        }
      });
    }
  }

  // Busca prospects com filtros
  async function fetchProspects() {
    const container = document.getElementById('b2b-kanban-board');
    if (container) container.classList.add('opacity-50');

    try {
      const q = new URLSearchParams();
      if (currentFilterStatus !== 'todos') q.set('status', currentFilterStatus);
      if (currentFilterCategory !== 'todos') q.set('category', currentFilterCategory);
      if (currentFilterNeighborhood !== 'todos') q.set('neighborhood', currentFilterNeighborhood);
      if (currentFilterAssigned !== 'todos') q.set('assigned_to', currentFilterAssigned);
      if (currentFilterEnrichment !== 'todos') q.set('enrichment', currentFilterEnrichment);
      if (currentFilterCity && currentFilterCity !== 'todos') q.set('city', currentFilterCity);
      if (currentFilterState && currentFilterState !== 'todos') q.set('state', currentFilterState);
      if (currentSearchQuery) q.set('search', currentSearchQuery);
      q.set('view', currentView);
      q.set('limit', '500');

      const res = await fetch(`/api/radar-b2b/prospects?${q.toString()}`, {
        headers: getHeaders(),
        credentials: 'same-origin'
      });
      if (!res.ok) throw new Error('Falha ao buscar empresas');
      const data = await res.json();
      cachedProspects = data.prospects || [];

      const filteredCount = document.getElementById('b2b-filtered-count');
      if (filteredCount) filteredCount.textContent = cachedProspects.length.toLocaleString('pt-BR');

      if (currentView === 'kanban') {
        renderKanban(cachedProspects);
      } else {
        renderTable(cachedProspects);
      }
    } catch (e) {
      console.error('[RADAR B2B] Erro:', e);
      toast('Erro ao buscar empresas: ' + e.message, 'error');
    } finally {
      if (container) container.classList.remove('opacity-50');
    }
  }

  // Formata link de WhatsApp direto
  function getWhatsAppUrl(phone, companyName) {
    if (!phone) return null;
    const digits = String(phone).replace(/\D/g, '');
    if (!digits) return null;
    const ddi = digits.startsWith('55') ? digits : '55' + digits;
    const msg = `Olá! Tudo bem? Falo com o responsável pela ${companyName}? Aqui é do escritório Dr. Jorge Alvim Advocacia (OAB/MG 222.943), em Juiz de Fora.`;
    return `https://wa.me/${ddi}?text=${encodeURIComponent(msg)}`;
  }

  // Renderiza Kanban em 6 colunas completas
  function renderKanban(prospects) {
    const columns = {
      novo: document.getElementById('b2b-col-novo'),
      contatado: document.getElementById('b2b-col-contatado'),
      sem_resposta: document.getElementById('b2b-col-sem_resposta'),
      negociando: document.getElementById('b2b-col-negociando'),
      convertido: document.getElementById('b2b-col-convertido'),
      descartado: document.getElementById('b2b-col-descartado')
    };

    const counts = { novo: 0, contatado: 0, sem_resposta: 0, negociando: 0, convertido: 0, descartado: 0 };

    // Limpa todas as colunas
    Object.keys(columns).forEach(st => {
      if (columns[st]) columns[st].innerHTML = '';
    });

    prospects.forEach(p => {
      const st = p.status || 'novo';
      if (counts[st] !== undefined) counts[st]++;
      const targetCol = columns[st];
      if (!targetCol) return;

      const card = createKanbanCard(p);
      targetCol.appendChild(card);
    });

    // Atualiza contadores dos títulos das colunas
    Object.keys(counts).forEach(st => {
      const badge = document.getElementById(`b2b-count-${st}`);
      if (badge) badge.textContent = counts[st];
    });

    // Empty states para colunas vazias
    const cityLabel = (currentFilterCity && currentFilterCity !== 'todos') ? ` (${escapeHtml(currentFilterCity)})` : '';
    Object.keys(columns).forEach(st => {
      const col = columns[st];
      if (col && col.children.length === 0) {
        col.innerHTML = `
          <div class="p-6 text-center text-xs text-slate-400 border border-dashed border-slate-200 rounded-2xl bg-white/50">
            Nenhuma empresa nesta etapa${cityLabel}
          </div>
        `;
      }
    });

    updateBulkActionBar();
  }

  // Cria o card de uma empresa no Kanban
  function createKanbanCard(p) {
    const card = document.createElement('div');
    card.className = 'p-4 rounded-2xl bg-white border border-slate-200/90 shadow-xs hover:shadow-md transition-all space-y-2.5 relative group';
    card.id = `b2b-card-${p.id}`;

    const waUrl = getWhatsAppUrl(p.whatsapp || p.phone, p.name);
    const stars = p.rating ? `⭐ ${Number(p.rating).toFixed(1)} (${p.user_ratings_total || 0})` : 'Sem avaliações';
    const isOfficeClient = !!p.is_office_client || p.status === 'convertido' || !!p.converted_client_id;
    const isOptOut = !!p.opt_out;

    // Badges de Status Especiais
    let badgesTop = '';
    if (isOfficeClient) {
      badgesTop += `
        <span class="px-2 py-0.5 rounded-full bg-amber-100 text-amber-900 border border-amber-300 font-extrabold text-[10px] flex items-center gap-1 shadow-2xs">
          <span>⭐</span>
          <span>Já é Cliente</span>
        </span>
      `;
    }
    if (isOptOut) {
      badgesTop += `
        <span class="px-2 py-0.5 rounded-full bg-rose-100 text-rose-800 border border-rose-300 font-extrabold text-[10px] flex items-center gap-1 shadow-2xs">
          <span>🚫</span>
          <span>Não Perturbar</span>
        </span>
      `;
    }

    let actionsHtml = '';
    if (isOfficeClient) {
      actionsHtml = `
        <div class="flex items-center justify-between gap-1 pt-1 border-t border-slate-100">
          <div class="px-2.5 py-1 rounded-xl bg-emerald-50 text-emerald-800 border border-emerald-300 font-extrabold text-[11px] flex items-center gap-1">
            <span>🏆</span>
            <span>Cliente Ativo</span>
          </div>
          <button 
            type="button" 
            onclick="window.openLeadHistoryModal(${p.id})"
            class="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-[11px] transition-all cursor-pointer">
            📝 Histórico
          </button>
        </div>
      `;
    } else {
      actionsHtml = `
        <div class="flex items-center gap-1.5 pt-1 border-t border-slate-100">
          <select onchange="window.handleB2bMoveStage(${p.id}, this.value)" class="text-[11px] font-bold bg-slate-50 border border-slate-200 rounded-lg px-2 py-1 text-slate-700 hover:bg-slate-100 cursor-pointer flex-1">
            <option value="novo" ${p.status === 'novo' ? 'selected' : ''}>📥 Novo</option>
            <option value="contatado" ${p.status === 'contatado' ? 'selected' : ''}>📞 Contatado</option>
            <option value="sem_resposta" ${p.status === 'sem_resposta' ? 'selected' : ''}>⏳ Sem Resposta</option>
            <option value="negociando" ${p.status === 'negociando' ? 'selected' : ''}>🤝 Em Negociação</option>
            <option value="convertido" ${p.status === 'convertido' ? 'selected' : ''}>🏆 Virar Cliente</option>
            <option value="descartado" ${p.status === 'descartado' ? 'selected' : ''}>🚫 Descartar</option>
          </select>
          <button 
            type="button" 
            onclick="window.enrichProspectFromCard(${p.id}, this)"
            class="px-2 py-1 rounded-lg bg-violet-50 hover:bg-violet-100 text-violet-700 border border-violet-200 font-bold text-[11px] transition-all cursor-pointer"
            title="Enriquecer com Robô (Sócios, CNPJ, E-mail)">
            ⚡
          </button>
          <button 
            type="button" 
            onclick="window.openLeadHistoryModal(${p.id})"
            class="px-2 py-1 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 font-bold text-[11px] transition-all cursor-pointer"
            title="Abrir Histórico e Atendimento">
            📝
          </button>
        </div>
      `;
    }

    card.innerHTML = `
      <div class="flex items-start justify-between gap-2">
        <div class="flex items-start gap-2 flex-1 min-w-0">
          <input 
            type="checkbox" 
            class="b2b-card-checkbox w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer shrink-0 mt-0.5" 
            data-id="${p.id}" 
            ${selectedProspectIds.has(p.id) ? 'checked' : ''} 
            onchange="window.handleRowCheckboxChange(${p.id}, this.checked)" 
            title="Selecionar empresa" 
          />
          <h4 class="font-bold text-slate-900 text-xs sm:text-sm leading-snug line-clamp-2 cursor-pointer hover:text-indigo-600 transition-colors" onclick="window.openLeadHistoryModal(${p.id})" title="${escapeHtml(p.name)}">
            ${escapeHtml(p.name)}
          </h4>
        </div>
        <span class="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 whitespace-nowrap shrink-0">
          ${escapeHtml(p.neighborhood || 'JF')}
        </span>
      </div>

      ${badgesTop ? `<div class="flex flex-wrap items-center gap-1.5">${badgesTop}</div>` : ''}

      <div class="text-[11px] text-slate-500 flex flex-wrap items-center gap-1.5">
        <span class="px-2 py-0.5 rounded-md bg-blue-50 text-blue-700 border border-blue-100 font-semibold text-[10px]">
          ${escapeHtml(p.primary_type_display || p.primary_type || 'Comércio')}
        </span>
        <span class="text-amber-600 font-bold text-[10px]">${stars}</span>
        ${p.enriched_at ? `
          <span class="px-1.5 py-0.5 rounded-md bg-emerald-50 text-emerald-800 border border-emerald-200 font-extrabold text-[9px] flex items-center gap-0.5" title="Enriquecido pelo Robô">
            <span>⚡</span><span>Robô OK</span>
          </span>
        ` : `
          <span class="px-1.5 py-0.5 rounded-md bg-slate-100 text-slate-500 font-medium text-[9px]" title="Pendente de enriquecimento">
            <span>⏳</span><span>Pendente</span>
          </span>
        `}
      </div>

      <div class="text-xs text-slate-600 space-y-1">
        ${p.phone || p.whatsapp ? `
          <div class="flex items-center justify-between gap-1">
            <span class="font-medium text-slate-700">${escapeHtml(p.whatsapp || p.phone)}</span>
            ${waUrl ? `
              <a href="${waUrl}" target="_blank" rel="noopener noreferrer" class="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-500 hover:bg-emerald-600 text-white text-[10px] font-bold transition-all shadow-xs" title="Conversar no WhatsApp">
                <span>💬</span>
                <span>WhatsApp</span>
              </a>
            ` : ''}
          </div>
        ` : '<span class="text-[11px] text-slate-400 italic">Sem telefone cadastrado</span>'}

        ${p.email ? `
          <div class="flex items-center gap-1.5 text-[11px] text-slate-700 truncate" title="${escapeHtml(p.email)}">
            <span class="text-indigo-600 font-bold">✉️</span>
            <a href="mailto:${escapeHtml(p.email)}" class="hover:text-indigo-600 font-semibold underline truncate">${escapeHtml(p.email)}</a>
          </div>
        ` : `
          <div class="flex items-center justify-between gap-1 text-[11px] text-slate-400 bg-slate-50 px-2 py-0.5 rounded-lg border border-slate-100">
            <span class="truncate">✉️ E-mail: não cadastrado</span>
            <button type="button" onclick="window.openLeadHistoryModal(${p.id})" class="text-[10px] text-indigo-600 hover:text-indigo-800 font-bold hover:underline shrink-0 cursor-pointer">+ Inserir</button>
          </div>
        `}

        ${p.address ? `
          <p class="text-[11px] text-slate-400 line-clamp-1" title="${escapeHtml(p.address)}">
            📍 ${escapeHtml(p.address)}
          </p>
        ` : ''}

        ${p.socios ? `
          <div class="text-[10px] text-indigo-900 bg-indigo-50/80 px-2 py-1 rounded-lg border border-indigo-100 font-medium line-clamp-1" title="Sócios / QSA: ${escapeHtml(p.socios)}">
            👤 Sócios: <strong>${escapeHtml(p.socios)}</strong>
          </div>
        ` : ''}

        ${p.cnpj || p.instagram ? `
          <div class="flex items-center justify-between text-[10px] pt-0.5">
            ${p.cnpj ? `<span class="font-mono text-slate-500">🏢 ${escapeHtml(p.cnpj)}</span>` : '<span></span>'}
            ${p.instagram ? `<a href="${escapeHtml(p.instagram)}" target="_blank" class="text-pink-600 hover:text-pink-700 font-semibold flex items-center gap-0.5"><span>📸</span><span>Insta</span></a>` : ''}
          </div>
        ` : ''}
      </div>

      <!-- Atendente e Disposição -->
      <div class="flex flex-wrap items-center gap-1.5 text-[10px] pt-1">
        <span class="px-2 py-0.5 rounded bg-slate-100 text-slate-700 font-semibold">
          👤 ${escapeHtml(p.assigned_to || 'Sem Atendente')}
        </span>
        ${p.disposition && DISPOSITION_LABELS[p.disposition] ? `
          <span class="px-2 py-0.5 rounded bg-indigo-50 text-indigo-700 border border-indigo-100 font-bold">
            ${escapeHtml(DISPOSITION_LABELS[p.disposition])}
          </span>
        ` : ''}
      </div>

      ${p.notes ? `
        <div class="p-2 rounded-lg bg-amber-50/70 border border-amber-200/60 text-[11px] text-amber-900 leading-tight">
          📝 <i>${escapeHtml(p.notes)}</i>
        </div>
      ` : ''}

      ${actionsHtml}
    `;

    return card;
  }

  // Renderiza visão Tabela
  function renderTable(prospects) {
    const tbody = document.getElementById('b2b-table-body');
    if (!tbody) return;
    tbody.innerHTML = '';

    if (prospects.length === 0) {
      const cityDesc = (currentFilterCity && currentFilterCity !== 'todos') 
        ? `${escapeHtml(currentFilterCity)} - ${escapeHtml(currentFilterState || '')}`
        : 'esta pesquisa';
      tbody.innerHTML = `
        <tr>
          <td colspan="9" class="py-12 text-center text-slate-500 text-xs">
            <div class="max-w-md mx-auto space-y-2">
              <div class="text-3xl">🏢</div>
              <p class="font-bold text-slate-800 text-sm">Nenhuma empresa encontrada para ${cityDesc}.</p>
              <p class="text-slate-500 leading-relaxed">
                Esta cidade ainda não possui empresas cadastradas no seu banco local.<br>
                Para mapear empresas em tempo real no Google Maps, clique em 
                <button type="button" onclick="openGooglePlacesSearchModal()" class="text-indigo-600 hover:underline font-bold cursor-pointer">"Varredura Google Places"</button> no topo.
              </p>
            </div>
          </td>
        </tr>
      `;
      updateBulkActionBar();
      return;
    }

    prospects.forEach(p => {
      const tr = document.createElement('tr');
      tr.className = 'hover:bg-slate-50 transition-colors border-b border-slate-100 text-xs text-slate-700';

      const waUrl = getWhatsAppUrl(p.whatsapp || p.phone, p.name);
      const isOfficeClient = !!p.is_office_client || p.status === 'convertido' || !!p.converted_client_id;

      tr.innerHTML = `
        <td class="py-3 px-3 text-center">
          <input 
            type="checkbox" 
            class="b2b-row-checkbox w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer" 
            data-id="${p.id}" 
            ${selectedProspectIds.has(p.id) ? 'checked' : ''} 
            onchange="window.handleRowCheckboxChange(${p.id}, this.checked)" 
            title="Selecionar empresa" 
          />
        </td>
        <td class="py-3 px-3 font-bold text-slate-900">
          <div class="flex flex-col">
            <span class="cursor-pointer hover:text-indigo-600" onclick="window.openLeadHistoryModal(${p.id})">${escapeHtml(p.name)}</span>
            <span class="text-[10px] text-slate-400 font-normal">${escapeHtml(p.address || '')}</span>
            ${p.socios ? `<span class="text-[10px] text-indigo-700 font-medium line-clamp-1" title="${escapeHtml(p.socios)}">👤 Sócios: ${escapeHtml(p.socios)}</span>` : ''}
            ${p.cnpj ? `<span class="text-[10px] text-slate-500 font-mono">🏢 ${escapeHtml(p.cnpj)}</span>` : ''}
            <div class="flex items-center gap-1 mt-0.5">
              ${isOfficeClient ? '<span class="text-[10px] font-bold text-amber-700">⭐ Cliente Escritório</span>' : ''}
              ${p.opt_out ? '<span class="text-[10px] font-bold text-rose-700">🚫 Opt-Out</span>' : ''}
              ${p.enriched_at ? `<span class="px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-800 border border-emerald-200 font-extrabold text-[9px]" title="Enriquecido pelo Robô">⚡ Robô OK</span>` : `<span class="px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 font-medium text-[9px]">⏳ Pendente</span>`}
            </div>
          </div>
        </td>
        <td class="py-3 px-3 font-semibold text-slate-600">
          ${escapeHtml(p.neighborhood || 'Centro')}
        </td>
        <td class="py-3 px-3">
          <span class="px-2 py-0.5 rounded-md bg-blue-50 text-blue-700 border border-blue-100 font-semibold text-[11px]">
            ${escapeHtml(p.primary_type_display || p.primary_type || 'Geral')}
          </span>
        </td>
        <td class="py-3 px-3">
          ${p.phone || p.whatsapp ? `
            <div class="flex items-center gap-1.5">
              <span>${escapeHtml(p.whatsapp || p.phone)}</span>
              ${waUrl ? `
                <a href="${waUrl}" target="_blank" rel="noopener noreferrer" class="p-1 rounded bg-emerald-500 hover:bg-emerald-600 text-white text-[10px] font-bold" title="WhatsApp">
                  💬
                </a>
              ` : ''}
            </div>
          ` : '<span class="text-slate-400 italic">--</span>'}
        </td>
        <td class="py-3 px-3">
          ${p.email ? `
            <a href="mailto:${escapeHtml(p.email)}" class="text-indigo-600 font-semibold hover:underline flex items-center gap-1 truncate max-w-[180px]" title="${escapeHtml(p.email)}">
              <span>✉️</span>
              <span class="truncate">${escapeHtml(p.email)}</span>
            </a>
          ` : `
            <span class="text-slate-400 italic text-[11px] flex items-center gap-1">
              <span>Não informado</span>
              <button type="button" onclick="window.openLeadHistoryModal(${p.id})" class="text-indigo-600 hover:underline font-bold text-[10px] ml-1 cursor-pointer">+ Inserir</button>
            </span>
          `}
        </td>
        <td class="py-3 px-3 text-amber-600 font-bold">
          ${p.rating ? `⭐ ${Number(p.rating).toFixed(1)}` : '--'}
        </td>
        <td class="py-3 px-3">
          <select onchange="window.handleB2bMoveStage(${p.id}, this.value)" class="text-xs font-semibold bg-white border border-slate-200 rounded-lg px-2 py-1 text-slate-700">
            <option value="novo" ${p.status === 'novo' ? 'selected' : ''}>📥 Novo</option>
            <option value="contatado" ${p.status === 'contatado' ? 'selected' : ''}>📞 Contatado</option>
            <option value="sem_resposta" ${p.status === 'sem_resposta' ? 'selected' : ''}>⏳ Sem Resposta</option>
            <option value="negociando" ${p.status === 'negociando' ? 'selected' : ''}>🤝 Negociando</option>
            <option value="convertido" ${p.status === 'convertido' ? 'selected' : ''}>🏆 Convertido</option>
            <option value="descartado" ${p.status === 'descartado' ? 'selected' : ''}>🚫 Descartado</option>
          </select>
        </td>
        <td class="py-3 px-3 text-right">
          <div class="flex items-center justify-end gap-1">
            <button 
              type="button" 
              onclick="window.enrichProspectFromCard(${p.id}, this)"
              class="p-1.5 rounded-lg bg-violet-50 hover:bg-violet-100 text-violet-700 border border-violet-200 font-bold text-[11px] cursor-pointer"
              title="Enriquecer com Robô (Sócios, CNPJ, E-mail)">
              ⚡
            </button>
            <button 
              type="button" 
              onclick="window.openLeadHistoryModal(${p.id})"
              class="px-2.5 py-1 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 font-bold text-[11px] shadow-2xs cursor-pointer">
              Atendimento
            </button>
          </div>
        </td>
      `;

      tbody.appendChild(tr);
    });

    updateBulkActionBar();
  }

  // Mover etapa Kanban
  window.handleB2bMoveStage = async function (id, newStatus) {
    try {
      const res = await fetch(`/api/radar-b2b/prospects/${id}/status`, {
        method: 'PUT',
        headers: getHeaders(),
        body: JSON.stringify({ status: newStatus })
      });
      if (!res.ok) throw new Error('Erro ao atualizar status');
      await fetchStats();
      await fetchProspects();
    } catch (e) {
      toast('Erro: ' + e.message, 'error');
    }
  };

  // Alterna entre Kanban e Tabela
  window.setB2bView = function (mode) {
    currentView = mode;
    const btnKanban = document.getElementById('b2b-btn-view-kanban');
    const btnTable = document.getElementById('b2b-btn-view-table');
    const board = document.getElementById('b2b-kanban-board');
    const tableContainer = document.getElementById('b2b-table-container');

    if (mode === 'kanban') {
      if (btnKanban) btnKanban.className = 'px-3 py-1.5 rounded-lg text-xs font-bold bg-white text-navy-950 shadow-xs border border-slate-200 cursor-pointer';
      if (btnTable) btnTable.className = 'px-3 py-1.5 rounded-lg text-xs font-bold text-slate-500 hover:text-slate-800 cursor-pointer';
      if (board) board.classList.remove('hidden');
      if (tableContainer) tableContainer.classList.add('hidden');
      renderKanban(cachedProspects);
    } else {
      if (btnTable) btnTable.className = 'px-3 py-1.5 rounded-lg text-xs font-bold bg-white text-navy-950 shadow-xs border border-slate-200 cursor-pointer';
      if (btnKanban) btnKanban.className = 'px-3 py-1.5 rounded-lg text-xs font-bold text-slate-500 hover:text-slate-800 cursor-pointer';
      if (board) board.classList.add('hidden');
      if (tableContainer) tableContainer.classList.remove('hidden');
      renderTable(cachedProspects);
    }
  };

  // Filtros
  window.handleB2bFilterChange = function () {
    const selStatus = document.getElementById('b2b-filter-status');
    const selCat = document.getElementById('b2b-filter-category');
    const selNb = document.getElementById('b2b-filter-neighborhood');
    const selAssigned = document.getElementById('b2b-filter-assigned');
    const selEnrich = document.getElementById('b2b-filter-enrichment');
    const selCity = document.getElementById('b2b-filter-city');
    const selState = document.getElementById('b2b-filter-state');
    const inputSearch = document.getElementById('b2b-search-input');

    if (selStatus) currentFilterStatus = selStatus.value;
    if (selCat) currentFilterCategory = selCat.value;
    if (selNb) currentFilterNeighborhood = selNb.value;
    if (selAssigned) currentFilterAssigned = selAssigned.value;
    if (selEnrich) currentFilterEnrichment = selEnrich.value;
    if (selCity) currentFilterCity = selCity.value;
    if (selState) currentFilterState = selState.value;
    if (inputSearch) currentSearchQuery = inputSearch.value.trim();

    fetchProspects();
  };

  // Sincronizar e cruzar com base de clientes existente
  window.syncClientsB2b = async function () {
    try {
      toast('Cruzando base de leads com clientes do escritório…');
      const res = await fetch('/api/radar-b2b/sync-clients', {
        method: 'POST',
        headers: getHeaders()
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro no cruzamento');

      toast(`✅ Sucesso! ${data.matched} empresas identificadas como clientes do escritório de um total de ${data.totalChecked} verificadas.`, 'success');
      await fetchStats();
      await fetchProspects();
    } catch (e) {
      toast('Erro no cruzamento: ' + e.message, 'error');
    }
  };

  // ============================================================================
  // MODAL DE HISTÓRICO & ATENDIMENTO DETALHADO DO LEAD
  // ============================================================================

  window.openLeadHistoryModal = async function (id) {
    activeProspectIdForModal = id;
    const p = cachedProspects.find(item => item.id === id);

    const m = document.getElementById('modal-lead-history');
    if (!m) return;
    if (m.parentNode !== document.body) {
      document.body.appendChild(m);
    }
    m.classList.remove('hidden');
    m.style.display = 'flex';

    const infoCard = document.getElementById('lead-history-info-card');
    const titleEl = document.getElementById('lead-history-title');
    const subTitleEl = document.getElementById('lead-history-subtitle');

    if (titleEl && p) titleEl.textContent = p.name;
    if (subTitleEl && p) subTitleEl.textContent = `${p.primary_type_display || p.primary_type || 'Empresa'} • ${p.neighborhood || 'Juiz de Fora'}`;

    const waUrl = p ? getWhatsAppUrl(p.whatsapp || p.phone, p.name) : null;

    if (infoCard && p) {
      infoCard.innerHTML = `
        <div class="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-slate-200">
          <div class="flex items-center gap-2">
            <span class="font-bold text-slate-800 text-sm">${escapeHtml(p.name)}</span>
            ${p.is_office_client ? '<span class="px-2 py-0.5 rounded-full bg-amber-100 text-amber-900 border border-amber-300 font-extrabold text-[10px]">⭐ Já é Cliente</span>' : ''}
            ${p.opt_out ? '<span class="px-2 py-0.5 rounded-full bg-rose-100 text-rose-800 border border-rose-300 font-extrabold text-[10px]">🚫 Não Perturbar</span>' : ''}
          </div>
          <div class="flex items-center gap-1.5">
            ${waUrl ? `
              <a href="${waUrl}" target="_blank" class="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center gap-1 shadow-xs">
                <span>💬</span>
                <span>WhatsApp</span>
              </a>
            ` : ''}
            ${p.email ? `
              <a href="mailto:${escapeHtml(p.email)}" class="px-2.5 py-1 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 font-bold text-xs flex items-center gap-1">
                <span>✉️</span>
                <span>E-mail</span>
              </a>
            ` : ''}
            ${p.google_maps_url ? `
              <a href="${escapeHtml(p.google_maps_url)}" target="_blank" class="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs flex items-center gap-1">
                <span>🗺️</span>
                <span>Maps</span>
              </a>
            ` : ''}
          </div>
        </div>
        <div class="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px] text-slate-600">
          <div><span class="font-bold text-slate-500">Telefone:</span> ${escapeHtml(p.phone || '--')}</div>
          <div><span class="font-bold text-slate-500">WhatsApp:</span> ${escapeHtml(p.whatsapp || p.phone || '--')}</div>
          <div><span class="font-bold text-slate-500">E-mail:</span> ${p.email ? `<strong class="text-indigo-700 font-semibold">${escapeHtml(p.email)}</strong>` : '<span class="text-amber-600 font-medium italic">Não cadastrado (insira abaixo)</span>'}</div>
          <div><span class="font-bold text-slate-500">Bairro:</span> ${escapeHtml(p.neighborhood || '--')}</div>
        </div>
      `;
    }

    // Preenche campos do formulário
    if (p) {
      const statusSel = document.getElementById('modal-lead-status');
      const assignedSel = document.getElementById('modal-lead-assigned');
      const dispSel = document.getElementById('modal-lead-disposition');
      const tagsInp = document.getElementById('modal-lead-tags');
      const emailInp = document.getElementById('modal-lead-email');
      const phoneInp = document.getElementById('modal-lead-phone');
      const notesInp = document.getElementById('modal-lead-notes');

      const cnpjInp = document.getElementById('modal-lead-cnpj');
      const razaoInp = document.getElementById('modal-lead-razao');
      const sociosInp = document.getElementById('modal-lead-socios');
      const igInp = document.getElementById('modal-lead-instagram');
      const igLink = document.getElementById('modal-lead-instagram-link');
      const capitalInp = document.getElementById('modal-lead-capital');

      if (statusSel) statusSel.value = p.status || 'novo';
      if (assignedSel) assignedSel.value = p.assigned_to || 'Dr. Jorge Alvim';
      if (dispSel && p.disposition) dispSel.value = p.disposition;
      if (tagsInp) tagsInp.value = p.tags || '';
      if (emailInp) emailInp.value = p.email || '';
      if (phoneInp) phoneInp.value = p.whatsapp || p.phone || '';
      if (notesInp) notesInp.value = '';

      if (cnpjInp) cnpjInp.value = p.cnpj || '';
      if (razaoInp) razaoInp.value = p.razao_social || '';
      if (sociosInp) sociosInp.value = p.socios || '';
      if (igInp) igInp.value = p.instagram || '';
      if (igLink) {
        if (p.instagram) {
          igLink.href = p.instagram;
          igLink.classList.remove('hidden');
        } else {
          igLink.classList.add('hidden');
        }
      }
      if (capitalInp) capitalInp.value = [p.capital_social, p.cnae].filter(Boolean).join(' • ') || '';
    }

    // Carrega histórico
    await loadLeadTimeline(id);
  };

  window.closeLeadHistoryModal = function () {
    const m = document.getElementById('modal-lead-history');
    if (m) {
      m.classList.add('hidden');
      m.style.display = 'none';
    }
    activeProspectIdForModal = null;
  };

  async function loadLeadTimeline(id) {
    const container = document.getElementById('lead-timeline-container');
    if (!container) return;
    container.innerHTML = '<p class="text-xs text-slate-400 italic">Carregando histórico...</p>';

    try {
      const res = await fetch(`/api/radar-b2b/prospects/${id}/history`, {
        headers: getHeaders(),
        credentials: 'same-origin'
      });
      if (!res.ok) throw new Error('Erro ao buscar linha do tempo');
      const data = await res.json();
      const logs = data.history || [];

      if (logs.length === 0) {
        container.innerHTML = '<p class="text-xs text-slate-400 text-center py-4 italic">Nenhuma movimentação registrada para este lead ainda.</p>';
        return;
      }

      container.innerHTML = logs.map(l => {
        const dateStr = l.created_at ? new Date(l.created_at).toLocaleString('pt-BR') : '';
        const dispLabel = DISPOSITION_LABELS[l.disposition] || l.disposition || 'Movimentação';
        return `
          <div class="p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs space-y-1">
            <div class="flex items-center justify-between text-[11px]">
              <span class="font-bold text-indigo-700">${escapeHtml(dispLabel)}</span>
              <span class="text-slate-400 font-mono">${dateStr}</span>
            </div>
            <div class="flex items-center gap-2 text-[10px] text-slate-500">
              <span>👤 <strong>${escapeHtml(l.created_by || 'Sistema')}</strong></span>
              ${l.status_to ? `<span>• Etapa: <strong>${escapeHtml(l.status_to)}</strong></span>` : ''}
            </div>
            ${l.notes ? `
              <p class="text-slate-700 bg-white p-2 rounded-lg border border-slate-100 font-medium leading-relaxed mt-1">
                ${escapeHtml(l.notes)}
              </p>
            ` : ''}
          </div>
        `;
      }).join('');
    } catch (e) {
      container.innerHTML = `<p class="text-xs text-rose-500">Erro: ${e.message}</p>`;
    }
  }

  window.saveLeadHistory = async function () {
    if (!activeProspectIdForModal) return;

    const status = document.getElementById('modal-lead-status')?.value;
    const assigned_to = document.getElementById('modal-lead-assigned')?.value;
    const disposition = document.getElementById('modal-lead-disposition')?.value;
    const tags = document.getElementById('modal-lead-tags')?.value;
    const email = document.getElementById('modal-lead-email')?.value;
    const whatsapp = document.getElementById('modal-lead-phone')?.value;
    const notes = document.getElementById('modal-lead-notes')?.value;

    const cnpj = document.getElementById('modal-lead-cnpj')?.value?.trim();
    const razao_social = document.getElementById('modal-lead-razao')?.value?.trim();
    const socios = document.getElementById('modal-lead-socios')?.value?.trim();
    const instagram = document.getElementById('modal-lead-instagram')?.value?.trim();
    const capital_social = document.getElementById('modal-lead-capital')?.value?.trim();

    try {
      const res = await fetch(`/api/radar-b2b/prospects/${activeProspectIdForModal}/status`, {
        method: 'PUT',
        headers: getHeaders(),
        body: JSON.stringify({
          status,
          assigned_to,
          disposition,
          tags,
          email,
          whatsapp,
          cnpj,
          razao_social,
          socios,
          instagram,
          capital_social,
          notes
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro ao salvar histórico');

      toast('✅ Movimentação registrada com sucesso!', 'success');
      
      // Limpa campo de notas após salvar
      const notesInp = document.getElementById('modal-lead-notes');
      if (notesInp) notesInp.value = '';

      await loadLeadTimeline(activeProspectIdForModal);
      await fetchStats();
      await fetchProspects();
    } catch (e) {
      toast('Erro: ' + e.message, 'error');
    }
  };

  // Enriquecer prospect ativo no modal
  window.enrichCurrentModalLead = async function () {
    if (!activeProspectIdForModal) return;
    const btn = document.getElementById('btn-modal-lead-enrich');
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = '<span>⏳</span><span>Varrendo Web & Receita...</span>';
    }

    try {
      toast('🤖 Robô iniciando: lendo site e consultando Receita Federal...', 'info');
      const res = await fetch(`/api/radar-b2b/prospects/${activeProspectIdForModal}/enrich`, {
        method: 'POST',
        headers: getHeaders(),
        credentials: 'same-origin'
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro ao enriquecer');

      const enriched = data.enriched || {};
      const cnpjInp = document.getElementById('modal-lead-cnpj');
      const razaoInp = document.getElementById('modal-lead-razao');
      const sociosInp = document.getElementById('modal-lead-socios');
      const igInp = document.getElementById('modal-lead-instagram');
      const igLink = document.getElementById('modal-lead-instagram-link');
      const emailInp = document.getElementById('modal-lead-email');
      const capitalInp = document.getElementById('modal-lead-capital');

      if (cnpjInp && enriched.cnpj) cnpjInp.value = enriched.cnpj;
      if (razaoInp && enriched.razao_social) razaoInp.value = enriched.razao_social;
      if (sociosInp && enriched.socios) sociosInp.value = enriched.socios;
      if (igInp && enriched.instagram) {
        igInp.value = enriched.instagram;
        if (igLink) {
          igLink.href = enriched.instagram;
          igLink.classList.remove('hidden');
        }
      }
      if (emailInp && enriched.email) emailInp.value = enriched.email;
      if (capitalInp && (enriched.capital_social || enriched.cnae)) {
        capitalInp.value = [enriched.capital_social, enriched.cnae].filter(Boolean).join(' • ');
      }

      toast(`✅ Sucesso! ${enriched.socios ? 'Sócios: ' + enriched.socios : 'Dados cadastrais atualizados!'}`, 'success');
      await fetchProspects();
      await fetchStats();
      await loadLeadTimeline(activeProspectIdForModal);
    } catch (e) {
      toast('Erro no robô: ' + e.message, 'error');
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = '<span>⚡</span><span>Enriquecer c/ Robô</span>';
      }
    }
  };

  // Consulta manual de CNPJ no modal
  window.lookupCnpjModal = async function () {
    const cnpjInp = document.getElementById('modal-lead-cnpj');
    const cnpj = (cnpjInp?.value || '').replace(/\D/g, '');
    if (!cnpj || cnpj.length !== 14) {
      toast('Informe um CNPJ válido com 14 dígitos.', 'warning');
      return;
    }

    try {
      toast('Consultando Receita Federal...', 'info');
      const res = await fetch(`/api/radar-b2b/consultar-cnpj/${cnpj}`, {
        headers: getHeaders(),
        credentials: 'same-origin'
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro na consulta');
      const info = data.data || {};

      const razaoInp = document.getElementById('modal-lead-razao');
      const sociosInp = document.getElementById('modal-lead-socios');
      const emailInp = document.getElementById('modal-lead-email');
      const capitalInp = document.getElementById('modal-lead-capital');

      if (razaoInp && info.razao_social) razaoInp.value = info.razao_social;
      if (sociosInp && info.socios) sociosInp.value = info.socios;
      if (emailInp && info.email && !emailInp.value) emailInp.value = info.email.toLowerCase();
      if (capitalInp && (info.capital_social || info.cnae)) {
        capitalInp.value = [info.capital_social, info.cnae].filter(Boolean).join(' • ');
      }

      toast(`✅ Receita: ${info.razao_social} (${info.socios || 'Sem sócios listados'})`, 'success');
    } catch (e) {
      toast('Erro na Receita: ' + e.message, 'error');
    }
  };

  // Enriquecer a partir do card do Kanban
  window.enrichProspectFromCard = async function (id, btn) {
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = '⏳';
    }
    try {
      toast('🤖 Robô buscando dados do site e Receita Federal...', 'info');
      const res = await fetch(`/api/radar-b2b/prospects/${id}/enrich`, {
        method: 'POST',
        headers: getHeaders(),
        credentials: 'same-origin'
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro ao enriquecer');
      const en = data.enriched || {};
      toast(`✅ ${en.name}: ${en.socios ? 'Sócios: ' + en.socios : (en.email ? 'E-mail: ' + en.email : 'Enriquecido!')}`, 'success');
      await fetchProspects();
      await fetchStats();
    } catch (e) {
      toast('Erro: ' + e.message, 'error');
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = '⚡';
      }
    }
  };

  // ============================================================================
  // SELEÇÃO EM LOTE & ROBÔ ENRIQUECEDOR AUTOMÁTICO
  // ============================================================================

  function updateBulkActionBar() {
    const bar = document.getElementById('b2b-bulk-actions-bar');
    const countEl = document.getElementById('b2b-selected-count');
    const selectAllCheckbox = document.getElementById('b2b-select-all');

    const totalSelected = selectedProspectIds.size;
    if (countEl) countEl.textContent = totalSelected.toLocaleString('pt-BR');

    if (totalSelected > 0) {
      if (bar) bar.classList.remove('hidden');
    } else {
      if (bar) bar.classList.add('hidden');
    }

    if (selectAllCheckbox) {
      const visibleIds = cachedProspects.map(p => p.id);
      if (visibleIds.length > 0 && visibleIds.every(id => selectedProspectIds.has(id))) {
        selectAllCheckbox.checked = true;
        selectAllCheckbox.indeterminate = false;
      } else if (visibleIds.some(id => selectedProspectIds.has(id))) {
        selectAllCheckbox.checked = false;
        selectAllCheckbox.indeterminate = true;
      } else {
        selectAllCheckbox.checked = false;
        selectAllCheckbox.indeterminate = false;
      }
    }
  }

  window.toggleSelectAllB2b = function (checked) {
    if (checked) {
      cachedProspects.forEach(p => selectedProspectIds.add(p.id));
    } else {
      cachedProspects.forEach(p => selectedProspectIds.delete(p.id));
    }
    document.querySelectorAll('.b2b-row-checkbox, .b2b-card-checkbox').forEach(cb => {
      const id = parseInt(cb.getAttribute('data-id'), 10);
      cb.checked = selectedProspectIds.has(id);
    });
    updateBulkActionBar();
  };

  window.handleRowCheckboxChange = function (id, checked) {
    const numId = parseInt(id, 10);
    if (checked) {
      selectedProspectIds.add(numId);
    } else {
      selectedProspectIds.delete(numId);
    }
    document.querySelectorAll(`.b2b-row-checkbox[data-id="${numId}"], .b2b-card-checkbox[data-id="${numId}"]`).forEach(cb => {
      cb.checked = checked;
    });
    updateBulkActionBar();
  };

  window.clearSelectedProspects = function () {
    selectedProspectIds.clear();
    document.querySelectorAll('.b2b-row-checkbox, .b2b-card-checkbox').forEach(cb => {
      cb.checked = false;
    });
    const selectAllCheckbox = document.getElementById('b2b-select-all');
    if (selectAllCheckbox) {
      selectAllCheckbox.checked = false;
      selectAllCheckbox.indeterminate = false;
    }
    updateBulkActionBar();
  };

  window.applyBulkStatusChange = async function () {
    const sel = document.getElementById('b2b-bulk-status-select');
    const newStatus = sel?.value;
    if (!newStatus) {
      toast('Selecione uma etapa para mover as empresas.', 'warning');
      return;
    }
    const ids = Array.from(selectedProspectIds);
    if (ids.length === 0) {
      toast('Nenhuma empresa selecionada.', 'warning');
      return;
    }

    try {
      toast(`Atualizando status de ${ids.length} empresas...`, 'info');
      const res = await fetch('/api/radar-b2b/prospects/batch-status', {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({ ids, status: newStatus })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro ao atualizar');

      toast(`✅ Sucesso! ${data.updated || ids.length} empresas movidas para "${newStatus}".`, 'success');
      window.clearSelectedProspects();
      await fetchStats();
      await fetchProspects();
    } catch (e) {
      toast('Erro: ' + e.message, 'error');
    }
  };

  // Executa o Robô Enriquecedor com modal de progresso em tempo real
  let isRobotRunning = false;

  async function executeRobotProgress(ids) {
    if (!ids || ids.length === 0) {
      toast('Nenhuma empresa para enriquecer.', 'warning');
      return;
    }
    if (isRobotRunning) {
      toast('O robô já está em execução.', 'warning');
      return;
    }

    isRobotRunning = true;
    const modal = document.getElementById('modal-robot-progress');
    const statusEl = document.getElementById('robot-progress-status');
    const stepEl = document.getElementById('robot-progress-step');
    const percentEl = document.getElementById('robot-progress-percent');
    const barEl = document.getElementById('robot-progress-bar');
    const logEl = document.getElementById('robot-progress-log');
    const btnClose = document.getElementById('btn-close-robot-progress');

    if (modal) modal.classList.remove('hidden');
    if (statusEl) statusEl.textContent = 'Varrendo páginas web e consultando Receita Federal...';
    if (stepEl) stepEl.textContent = `Processando 0 de ${ids.length}...`;
    if (percentEl) percentEl.textContent = '0%';
    if (barEl) barEl.style.width = '0%';
    if (logEl) logEl.innerHTML = '<p class="text-slate-400 italic">🤖 Robô iniciado. Conectando aos serviços...</p>';
    if (btnClose) btnClose.classList.add('hidden');

    let processed = 0;
    let enrichedCount = 0;

    // Processa sequencialmente garantindo logs ao vivo e respeito a limites das APIs
    for (const id of ids) {
      const prospect = cachedProspects.find(p => p.id === id) || { id, name: `Empresa #${id}` };
      
      if (stepEl) stepEl.textContent = `Processando ${processed + 1} de ${ids.length}: ${prospect.name}...`;

      try {
        const res = await fetch(`/api/radar-b2b/prospects/${id}/enrich`, {
          method: 'POST',
          headers: getHeaders(),
          credentials: 'same-origin'
        });
        const data = await res.json();

        if (res.ok && data.success) {
          enrichedCount++;
          const en = data.enriched || {};
          const details = [];
          if (en.cnpj) details.push(`CNPJ: ${en.cnpj}`);
          if (en.socios) details.push(`Sócios: ${en.socios}`);
          if (en.email) details.push(`E-mail: ${en.email}`);
          if (en.instagram) details.push(`Insta: ${en.instagram}`);

          const detailStr = details.length > 0 ? details.join(' | ') : 'Dados cadastrais confirmados';
          appendRobotLog(`✅ <strong>${escapeHtml(prospect.name)}</strong>: ${escapeHtml(detailStr)}`, 'text-emerald-700');
        } else {
          appendRobotLog(`⚠️ <strong>${escapeHtml(prospect.name)}</strong>: ${escapeHtml(data.error || 'Nenhum dado novo encontrado')}`, 'text-amber-700');
        }
      } catch (err) {
        appendRobotLog(`❌ <strong>${escapeHtml(prospect.name)}</strong>: Falha de conexão (${escapeHtml(err.message)})`, 'text-rose-600');
      }

      processed++;
      const pct = Math.round((processed / ids.length) * 100);
      if (percentEl) percentEl.textContent = `${pct}%`;
      if (barEl) barEl.style.width = `${pct}%`;
    }

    if (statusEl) statusEl.textContent = '🎉 Concluído! Todas as empresas foram processadas.';
    if (stepEl) stepEl.textContent = `${enrichedCount} de ${ids.length} empresas enriquecidas com sucesso.`;
    if (percentEl) percentEl.textContent = '100%';
    if (barEl) barEl.style.width = '100%';
    appendRobotLog(`🏁 Processo finalizado com sucesso! ${enrichedCount} empresas enriquecidas.`, 'text-indigo-900 font-bold');

    if (btnClose) btnClose.classList.remove('hidden');
    isRobotRunning = false;
    window.clearSelectedProspects();
    await fetchStats();
    await fetchProspects();
  }

  function appendRobotLog(html, textClass = 'text-slate-700') {
    const logEl = document.getElementById('robot-progress-log');
    if (!logEl) return;
    const p = document.createElement('p');
    p.className = `leading-relaxed ${textClass}`;
    p.innerHTML = html;
    logEl.appendChild(p);
    logEl.scrollTop = logEl.scrollHeight;
  }

  window.closeRobotProgressModal = function () {
    const modal = document.getElementById('modal-robot-progress');
    if (modal) modal.classList.add('hidden');
  };

  // Ação: Enriquecer selecionados
  window.enrichSelectedProspects = function () {
    const ids = Array.from(selectedProspectIds);
    if (ids.length === 0) {
      toast('Selecione pelo menos uma empresa na tabela ou Kanban.', 'warning');
      return;
    }
    executeRobotProgress(ids);
  };

  // Ação 1-Click: "Completar com o Google & Receita"
  window.completarTabelaComGoogle = function () {
    if (selectedProspectIds.size > 0) {
      return executeRobotProgress(Array.from(selectedProspectIds));
    }

    if (!cachedProspects || cachedProspects.length === 0) {
      toast('Nenhuma empresa na tabela para enriquecer.', 'warning');
      return;
    }

    // Prioriza empresas que ainda NÃO foram enriquecidas pelo robô (pendentes)
    const pending = cachedProspects.filter(p => !p.enriched_at);
    const incomplete = cachedProspects.filter(p => !p.cnpj || !p.socios || !p.email);
    const candidates = pending.length > 0 ? pending : (incomplete.length > 0 ? incomplete : cachedProspects);

    // Limita lote a 50 por vez para garantir velocidade e estabilidade
    const batch = candidates.slice(0, 50);
    const ids = batch.map(p => p.id);

    const desc = pending.length > 0 
      ? `Foram identificadas ${pending.length} empresas pendentes nesta visualização.\n\nO Robô irá buscar CNPJ, Sócios (QSA), E-mail e Redes Sociais das próximas ${ids.length} empresas pendentes.\n\nDeseja iniciar?`
      : `Deseja executar o Robô nas próximas ${ids.length} empresas da tabela?`;

    if (!confirm(desc)) return;
    executeRobotProgress(ids);
  };

  // Atalhos de Filtro: Feitas vs Faltam Fazer
  window.filterOnlyPendingEnrichment = function () {
    const sel = document.getElementById('b2b-filter-enrichment');
    if (sel) {
      sel.value = 'pendente';
      window.handleB2bFilterChange();
      toast('🔍 Filtrando apenas empresas PENDENTES de enriquecimento.', 'info');
    }
  };

  window.filterOnlyCompletedEnrichment = function () {
    const sel = document.getElementById('b2b-filter-enrichment');
    if (sel) {
      sel.value = 'enriquecido';
      window.handleB2bFilterChange();
      toast('🔍 Filtrando apenas empresas CONCLUÍDAS pelo Robô.', 'info');
    }
  };

  // Ação da Barra de Busca Estilo Google (Botão ⚡ Robô ou Enter)
  window.enrichFromSearchInput = function () {
    const input = document.getElementById('b2b-search-input');
    const query = (input?.value || '').trim();
    if (!query) {
      toast('Digite o nome ou segmento de uma empresa no campo de busca.', 'warning');
      return;
    }

    // Procura na lista local se já existe
    const qLower = query.toLowerCase();
    const match = cachedProspects.find(p => 
      (p.name && p.name.toLowerCase().includes(qLower)) ||
      (p.cnpj && p.cnpj.includes(query)) ||
      (p.phone && p.phone.includes(query))
    );

    if (match) {
      toast(`Empresa "${match.name}" localizada! Abrindo atendimento...`, 'info');
      window.openLeadHistoryModal(match.id);
      window.enrichCurrentModalLead();
    } else {
      const ok = confirm(`A empresa "${query}" não foi encontrada na visualização atual.\n\nDeseja realizar a Varredura do Google Places para adicioná-la agora?`);
      if (ok) {
        window.openGooglePlacesSearchModal();
        const searchInput = document.getElementById('b2b-search-query');
        if (searchInput) searchInput.value = query;
      }
    }
  };

  // ============================================================================
  // MÓDULO DE CAMPANHAS WHATSAPP & DISPARO
  // ============================================================================

  window.insertCampVariable = function (v) {
    const txt = document.getElementById('b2b-camp-message');
    if (!txt) return;
    const start = txt.selectionStart || 0;
    const end = txt.selectionEnd || 0;
    const val = txt.value;
    txt.value = val.substring(0, start) + v + val.substring(end);
    txt.focus();
    txt.selectionStart = txt.selectionEnd = start + v.length;
  };

  window.updateCampTargetEstimate = function () {
    const targetStatus = document.getElementById('b2b-camp-target-status')?.value || 'novo';
    const targetNb = document.getElementById('b2b-camp-target-neighborhood')?.value || '';
    const targetCat = document.getElementById('b2b-camp-target-category')?.value || '';

    let matches = cachedProspects.filter(p => {
      if (p.opt_out) return false;
      if (p.is_office_client) return false;
      if (!p.phone && !p.whatsapp) return false;
      if (targetStatus !== 'todos' && p.status !== targetStatus) return false;
      if (targetNb && p.neighborhood !== targetNb) return false;
      if (targetCat && p.primary_type_display !== targetCat && p.primary_type !== targetCat) return false;
      return true;
    });

    const elCount = document.getElementById('b2b-camp-target-count');
    if (elCount) elCount.textContent = matches.length.toLocaleString('pt-BR');
  };

  window.saveB2bCampaign = async function () {
    const name = document.getElementById('b2b-camp-name')?.value?.trim();
    const message_template = document.getElementById('b2b-camp-message')?.value?.trim();
    const target_status = document.getElementById('b2b-camp-target-status')?.value;
    const target_neighborhood = document.getElementById('b2b-camp-target-neighborhood')?.value;
    const target_category = document.getElementById('b2b-camp-target-category')?.value;

    if (!name || !message_template) {
      toast('Preencha o nome da campanha e o texto da mensagem.', 'warning');
      return;
    }

    try {
      const res = await fetch('/api/radar-b2b/campaigns', {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({
          name,
          message_template,
          target_status,
          target_neighborhood,
          target_category
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro ao salvar campanha');

      toast('✅ Campanha salva com sucesso!', 'success');
      loadB2bCampaigns();
    } catch (e) {
      toast('Erro: ' + e.message, 'error');
    }
  };

  async function loadB2bCampaigns() {
    const listEl = document.getElementById('b2b-campaigns-list');
    if (!listEl) return;

    try {
      const res = await fetch('/api/radar-b2b/campaigns', {
        headers: getHeaders(),
        credentials: 'same-origin'
      });
      if (!res.ok) return;
      const data = await res.json();
      const camps = data.campaigns || [];

      if (camps.length === 0) {
        listEl.innerHTML = '<p class="text-xs text-slate-400 text-center py-8">Nenhuma campanha criada ainda.</p>';
        return;
      }

      listEl.innerHTML = camps.map(c => `
        <div class="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 text-xs space-y-2">
          <div class="flex items-center justify-between">
            <h5 class="font-bold text-slate-900">${escapeHtml(c.name)}</h5>
            <span class="px-2 py-0.5 rounded text-[10px] font-extrabold ${c.status === 'enviada' ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-700'}">
              ${escapeHtml(c.status)}
            </span>
          </div>
          <p class="text-[11px] text-slate-500 line-clamp-2 italic">"${escapeHtml(c.message_template)}"</p>
          <div class="flex items-center justify-between text-[10px] text-slate-400 pt-1 border-t border-slate-200">
            <span>Enviados: <strong>${c.sent_count || 0}</strong> / ${c.total_targets || 0}</span>
            <span>${c.created_at ? new Date(c.created_at).toLocaleDateString('pt-BR') : ''}</span>
          </div>
        </div>
      `).join('');
    } catch (e) {
      console.warn('[RADAR B2B] Erro ao listar campanhas:', e);
    }
  }

  window.dispatchB2bCampaignBatch = async function (channel) {
    const name = document.getElementById('b2b-camp-name')?.value?.trim();
    const message_template = document.getElementById('b2b-camp-message')?.value?.trim();
    const target_status = document.getElementById('b2b-camp-target-status')?.value;
    const target_neighborhood = document.getElementById('b2b-camp-target-neighborhood')?.value;
    const target_category = document.getElementById('b2b-camp-target-category')?.value;

    if (!message_template) {
      toast('Informe o texto da mensagem para disparar.', 'warning');
      return;
    }

    const actionDesc = channel === 'evolution' 
      ? 'disparar as mensagens em lote via Evolution API' 
      : 'gerar a fila de links seguros para disparo no WhatsApp Web';

    const ok = confirm(`Deseja realmente ${actionDesc}?\n\nContatos com "Não Perturbar" e empresas já clientes serão automaticamente preservados e excluídos.`);
    if (!ok) return;

    try {
      toast('Processando lote da campanha…');
      const res = await fetch('/api/radar-b2b/campaigns/send-batch', {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({
          channel,
          name: name || 'Campanha B2B',
          message_template,
          target_status,
          target_neighborhood,
          target_category
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro no processamento');

      if (channel === 'web') {
        const queue = data.webQueue || [];
        if (queue.length === 0) {
          toast('Nenhum destinatário válido encontrado para esta segmentação.', 'warning');
          return;
        }

        // Abre modal ou janela com a fila do WhatsApp Web
        openWebWhatsAppQueueModal(queue);
      } else {
        toast(`🚀 Disparo concluído! Enviados: ${data.sentCount}, Falhas: ${data.failedCount}`, 'success');
        loadB2bCampaigns();
        fetchProspects();
      }
    } catch (e) {
      toast('Erro no disparo: ' + e.message, 'error');
    }
  };

  function openWebWhatsAppQueueModal(queue) {
    const count = queue.length;
    let listHtml = queue.map((item, idx) => `
      <div class="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 border border-slate-200 text-xs">
        <div>
          <span class="font-bold text-slate-800">${idx + 1}. ${escapeHtml(item.name)}</span>
          <span class="text-[11px] text-slate-500 ml-2">${escapeHtml(item.phone)}</span>
        </div>
        <a href="${item.waUrl}" target="_blank" class="px-3 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center gap-1 shadow-2xs">
          <span>💬</span>
          <span>Enviar (${idx + 1}/${count})</span>
        </a>
      </div>
    `).join('');

    const modalId = 'modal-whatsapp-web-queue';
    let m = document.getElementById(modalId);
    if (!m) {
      m = document.createElement('div');
      m.id = modalId;
      m.className = 'fixed inset-0 z-[9999999] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-3 sm:p-5 overflow-y-auto';
      document.body.appendChild(m);
    }

    m.innerHTML = `
      <div class="bg-white rounded-3xl max-w-xl w-full p-6 shadow-2xl space-y-4 border border-slate-200 my-auto max-h-[90vh] flex flex-col">
        <div class="flex items-center justify-between border-b border-slate-100 pb-3">
          <div class="flex items-center gap-2">
            <span class="p-2 rounded-xl bg-emerald-50 text-emerald-600 text-lg">💬</span>
            <div>
              <h3 class="font-bold text-base text-slate-900">Fila de Disparo WhatsApp Web (${count} leads)</h3>
              <p class="text-xs text-slate-500">Clique em cada botão para abrir a conversa com mensagem pré-preenchida</p>
            </div>
          </div>
          <button type="button" onclick="document.getElementById('${modalId}').remove()" class="text-slate-400 hover:text-slate-600 font-bold text-xl p-1 cursor-pointer">✕</button>
        </div>
        <div class="space-y-2 overflow-y-auto flex-1 pr-1 max-h-[60vh]">
          ${listHtml}
        </div>
        <div class="pt-3 border-t border-slate-100 flex justify-end">
          <button type="button" onclick="document.getElementById('${modalId}').remove()" class="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs">Concluído</button>
        </div>
      </div>
    `;
  }

  // ============================================================================
  // BUSCA GOOGLE PLACES & BASE LOCAL ENRIQUECIDA
  // ============================================================================

  window.openGooglePlacesSearchModal = function () {
    const m = document.getElementById('modal-google-places-search');
    if (m) {
      if (m.parentNode !== document.body) {
        document.body.appendChild(m);
      }
      m.classList.remove('hidden');
      m.style.display = 'flex';
      setTimeout(() => document.getElementById('b2b-search-keyword')?.focus(), 100);
    }
  };

  window.closeGooglePlacesSearchModal = function () {
    const m = document.getElementById('modal-google-places-search');
    if (m) {
      m.classList.add('hidden');
      m.style.display = 'none';
    }
  };

  // Disparar busca ao vivo ou fallback local inteligente
  window.executarBuscaGooglePlaces = async function () {
    const query = document.getElementById('b2b-search-keyword')?.value?.trim() || '';
    const state = document.getElementById('b2b-search-state')?.value || 'MG';
    const city = document.getElementById('b2b-search-city')?.value || 'Juiz de Fora';
    const neighborhood = document.getElementById('b2b-search-neighborhood-input')?.value?.trim() || '';
    const cep = document.getElementById('b2b-search-cep')?.value?.trim() || '';
    const limit = document.getElementById('b2b-search-limit')?.value || '500';
    const apiKey = document.getElementById('b2b-search-apikey')?.value?.trim() || '';

    const btn = document.getElementById('btn-executar-busca-google');
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = '<span>⏳</span> Buscando empresas…';
    }

    const autoEnrich = document.getElementById('b2b-search-auto-enrich')?.checked ?? true;

    try {
      const res = await fetch('/api/radar-b2b/buscar-google', {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({ query, neighborhood, state, city, cep, apiKey, limit })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Falha na busca');

      const totalFound = data.found !== undefined ? data.found : (data.matched || data.inserted || 0);
      closeGooglePlacesSearchModal();
      await fetchStats();
      await fetchProspects();

      if (data.inserted > 0 && Array.isArray(data.insertedIds) && data.insertedIds.length > 0) {
        if (autoEnrich) {
          toast(`✅ ${data.inserted} empresas importadas! Iniciando Robô Enriquecedor para completar os dados...`, 'info');
          setTimeout(() => {
            executeRobotProgress(data.insertedIds);
          }, 350);
        } else {
          toast(`✅ Varredura concluída! ${totalFound} empresas localizadas e ${data.inserted} novos registros adicionados.`, 'success');
          setTimeout(() => {
            if (confirm(`Foram adicionadas ${data.inserted} novas empresas ao seu Radar.\n\nDeseja executar o Robô Enriquecedor agora para buscar CNPJ, Sócios e E-mail desse novo lote?`)) {
              executeRobotProgress(data.insertedIds);
            }
          }, 300);
        }
      } else {
        toast(`✅ Varredura concluída! ${totalFound} empresas verificadas (nenhuma nova duplicata inserida).`, 'info');
      }
    } catch (e) {
      toast('Erro na busca: ' + e.message, 'error');
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = '<span>🔍</span> Iniciar Varredura';
      }
    }
  };

  // Importar base local extraída
  window.importarBaseLocalB2b = async function () {
    const ok = confirm('Deseja carregar a base de empresas locais para o Radar B2B?\n\nRegistros repetidos serão automaticamente ignorados para evitar duplicatas.');
    if (!ok) return;

    try {
      toast('Carregando base de empresas locais…');
      const res = await fetch('/api/radar-b2b/importar-local', {
        method: 'POST',
        headers: getHeaders()
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Falha ao importar');

      toast(`✅ Sucesso! Inseridas ${data.inserted} novas empresas (${data.skipped} já existiam). Total ativo: ${data.totalNow}`, 'success');
      await fetchStats();
      await fetchProspects();

      if (data.inserted > 0 && Array.isArray(data.insertedIds) && data.insertedIds.length > 0) {
        setTimeout(() => {
          if (confirm(`Foram importadas ${data.inserted} novas empresas!\n\nDeseja executar o Robô Enriquecedor agora para buscar CNPJ, Sócios (QSA) e E-mail desse novo lote?`)) {
            executeRobotProgress(data.insertedIds);
          }
        }, 300);
      }
    } catch (e) {
      toast('Erro na importação: ' + e.message, 'error');
    }
  };

  // Exportar Meta Ads (apenas dados necessários para Público Personalizado)
  window.exportarMetaAdsB2b = function () {
    const token = getAuthToken();
    const url = `/api/radar-b2b/export/meta-ads?token=${encodeURIComponent(token)}`;
    toast('📢 Gerando público do Meta Ads com dados estritamente necessários (Telefones, E-mails e Sócios)...', 'info');
    window.location.href = url;
  };

  // Exportar Brevo (apenas dados necessários para campanhas de E-mail/SMS)
  window.exportarBrevoB2b = function () {
    const token = getAuthToken();
    const url = `/api/radar-b2b/export/brevo?token=${encodeURIComponent(token)}`;
    toast('📧 Gerando arquivo Brevo com atributos estritamente necessários (E-mails, Sócios, WhatsApp e CNPJ)...', 'info');
    window.location.href = url;
  };

  // Exportar CSV Completo
  window.exportarCsvCompletoB2b = function () {
    const token = getAuthToken();
    const url = `/api/radar-b2b/export/csv?token=${encodeURIComponent(token)}`;
    window.location.href = url;
  };

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

})();
