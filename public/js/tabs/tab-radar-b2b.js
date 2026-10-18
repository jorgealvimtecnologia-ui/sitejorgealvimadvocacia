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
  let currentSearchQuery = '';
  let cachedProspects = [];
  let cachedStats = null;
  let activeProspectIdForModal = null;

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
    } else {
      alert(msg);
    }
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
        if (inputCity && cities.length > 0) {
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
        <h4 class="font-bold text-slate-900 text-xs sm:text-sm leading-snug line-clamp-2 cursor-pointer hover:text-indigo-600 transition-colors" onclick="window.openLeadHistoryModal(${p.id})" title="${escapeHtml(p.name)}">
          ${escapeHtml(p.name)}
        </h4>
        <span class="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 whitespace-nowrap">
          ${escapeHtml(p.neighborhood || 'JF')}
        </span>
      </div>

      ${badgesTop ? `<div class="flex flex-wrap items-center gap-1.5">${badgesTop}</div>` : ''}

      <div class="text-[11px] text-slate-500 flex flex-wrap items-center gap-2">
        <span class="px-2 py-0.5 rounded-md bg-blue-50 text-blue-700 border border-blue-100 font-semibold text-[10px]">
          ${escapeHtml(p.primary_type_display || p.primary_type || 'Comércio')}
        </span>
        <span class="text-amber-600 font-bold text-[10px]">${stars}</span>
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
          <td colspan="8" class="py-12 text-center text-slate-500 text-xs">
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
      return;
    }

    prospects.forEach(p => {
      const tr = document.createElement('tr');
      tr.className = 'hover:bg-slate-50 transition-colors border-b border-slate-100 text-xs text-slate-700';

      const waUrl = getWhatsAppUrl(p.whatsapp || p.phone, p.name);
      const isOfficeClient = !!p.is_office_client || p.status === 'convertido' || !!p.converted_client_id;

      tr.innerHTML = `
        <td class="py-3 px-3 font-bold text-slate-900">
          <div class="flex flex-col">
            <span class="cursor-pointer hover:text-indigo-600" onclick="window.openLeadHistoryModal(${p.id})">${escapeHtml(p.name)}</span>
            <span class="text-[10px] text-slate-400 font-normal">${escapeHtml(p.address || '')}</span>
            <div class="flex items-center gap-1 mt-0.5">
              ${isOfficeClient ? '<span class="text-[10px] font-bold text-amber-700">⭐ Cliente Escritório</span>' : ''}
              ${p.opt_out ? '<span class="text-[10px] font-bold text-rose-700">🚫 Opt-Out</span>' : ''}
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
          <button 
            type="button" 
            onclick="window.openLeadHistoryModal(${p.id})"
            class="px-2.5 py-1 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 font-bold text-[11px] shadow-2xs cursor-pointer">
            Atendimento
          </button>
        </td>
      `;

      tbody.appendChild(tr);
    });
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
    const selCity = document.getElementById('b2b-filter-city');
    const selState = document.getElementById('b2b-filter-state');
    const inputSearch = document.getElementById('b2b-search-input');

    if (selStatus) currentFilterStatus = selStatus.value;
    if (selCat) currentFilterCategory = selCat.value;
    if (selNb) currentFilterNeighborhood = selNb.value;
    if (selAssigned) currentFilterAssigned = selAssigned.value;
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

      if (statusSel) statusSel.value = p.status || 'novo';
      if (assignedSel) assignedSel.value = p.assigned_to || 'Dr. Jorge Alvim';
      if (dispSel && p.disposition) dispSel.value = p.disposition;
      if (tagsInp) tagsInp.value = p.tags || '';
      if (emailInp) emailInp.value = p.email || '';
      if (phoneInp) phoneInp.value = p.whatsapp || p.phone || '';
      if (notesInp) notesInp.value = '';
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

    try {
      const res = await fetch('/api/radar-b2b/buscar-google', {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({ query, neighborhood, state, city, cep, apiKey, limit })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Falha na busca');

      const totalFound = data.found !== undefined ? data.found : (data.matched || data.inserted || 0);
      toast(`✅ Varredura concluída! ${totalFound} empresas localizadas e ${data.inserted} novos registros adicionados ao Radar B2B.`, 'success');
      closeGooglePlacesSearchModal();
      await fetchStats();
      await fetchProspects();
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
    } catch (e) {
      toast('Erro na importação: ' + e.message, 'error');
    }
  };

  // Exportar Meta Ads
  window.exportarMetaAdsB2b = function () {
    const token = getAuthToken();
    const url = `/api/radar-b2b/export/meta-ads?token=${encodeURIComponent(token)}`;
    window.location.href = url;
  };

  // Exportar Brevo
  window.exportarBrevoB2b = function () {
    const token = getAuthToken();
    const url = `/api/radar-b2b/export/brevo?token=${encodeURIComponent(token)}`;
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
