/**
 * ==============================================================================
 * SUBMÓDULO: RADAR / PROSPECÇÃO B2B (GOOGLE EMPRESAS & CRM KANBAN)
 * ==============================================================================
 * Jorge Alvim Advocacia — OAB/MG 222.943
 *
 * Funcionalidades:
 * - CRM estilo Kanban visual (Novo -> Contatado -> Sem Resposta -> Em Negociação -> Convertido / Descartado);
 * - Alternância entre visão Kanban e Tabela de dados rápida;
 * - Disparo de mensagens pré-formatadas para WhatsApp (DDD 32);
 * - Conversão de empresa prospectada em Cliente PJ oficial com 1 clique;
 * - Varredura ao vivo da API do Google Places (New v1);
 * - Importação instantânea da base local (1.041 empresas / 7.880 brutas);
 * - Exportação de públicos para Meta Ads (Facebook/Instagram) e Brevo.
 * ==============================================================================
 */

(function () {
  'use strict';

  let currentView = 'kanban'; // 'kanban' ou 'table'
  let currentFilterStatus = 'todos';
  let currentFilterCategory = 'todos';
  let currentFilterNeighborhood = 'todos';
  let currentSearchQuery = '';
  let cachedProspects = [];
  let cachedStats = null;

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

  // Carrega toda a aba
  async function loadRadarB2bTab() {
    await fetchStats();
    await fetchProspects();
  }
  window.loadRadarB2bTab = loadRadarB2bTab;

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

    if (elTotal) elTotal.textContent = Number(data.total || 0).toLocaleString('pt-BR');
    if (elNovos) elNovos.textContent = Number(data.statusCounts?.novo || 0).toLocaleString('pt-BR');
    if (elContatados) elContatados.textContent = Number((data.statusCounts?.contatado || 0) + (data.statusCounts?.sem_resposta || 0)).toLocaleString('pt-BR');
    if (elNegociando) elNegociando.textContent = Number(data.statusCounts?.negociando || 0).toLocaleString('pt-BR');
    if (elConvertidos) elConvertidos.textContent = Number(data.statusCounts?.convertido || 0).toLocaleString('pt-BR');

    // Popula categorias e bairros nos selects se ainda estiverem vazios
    const selCat = document.getElementById('b2b-filter-category');
    if (selCat && selCat.options.length <= 1 && data.topCategories) {
      data.topCategories.forEach(cat => {
        const opt = document.createElement('option');
        opt.value = cat.primary_type_display;
        opt.textContent = `${cat.primary_type_display} (${cat.count})`;
        selCat.appendChild(opt);
      });
    }

    const selNb = document.getElementById('b2b-filter-neighborhood');
    if (selNb && selNb.options.length <= 1 && data.topNeighborhoods) {
      data.topNeighborhoods.forEach(nb => {
        const opt = document.createElement('option');
        opt.value = nb.neighborhood;
        opt.textContent = `${nb.neighborhood} (${nb.count})`;
        selNb.appendChild(opt);
      });
    }
  }

  // Busca prospects com filtros
  async function fetchProspects() {
    const container = document.getElementById('b2b-kanban-board');
    const tableBody = document.getElementById('b2b-table-body');
    if (container) container.classList.add('opacity-50');

    try {
      const q = new URLSearchParams();
      if (currentFilterStatus !== 'todos') q.set('status', currentFilterStatus);
      if (currentFilterCategory !== 'todos') q.set('category', currentFilterCategory);
      if (currentFilterNeighborhood !== 'todos') q.set('neighborhood', currentFilterNeighborhood);
      if (currentSearchQuery) q.set('search', currentSearchQuery);
      q.set('view', currentView);
      q.set('limit', '250');

      const res = await fetch(`/api/radar-b2b/prospects?${q.toString()}`, {
        headers: getHeaders(),
        credentials: 'same-origin'
      });
      if (!res.ok) throw new Error('Falha ao buscar empresas');
      const data = await res.json();
      cachedProspects = data.prospects || [];

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

  // Renderiza Kanban em 6 colunas
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
    Object.keys(columns).forEach(st => {
      const col = columns[st];
      if (col && col.children.length === 0) {
        col.innerHTML = `
          <div class="p-6 text-center text-xs text-slate-400 border border-dashed border-slate-200 rounded-2xl bg-white/50">
            Nenhuma empresa nesta etapa
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

    const waUrl = getWhatsAppUrl(p.phone, p.name);
    const stars = p.rating ? `⭐ ${Number(p.rating).toFixed(1)} (${p.user_ratings_total || 0})` : 'Sem avaliações';
    const isConverted = p.status === 'convertido' || !!p.converted_client_id;

    let actionsHtml = '';
    if (isConverted) {
      actionsHtml = `
        <div class="px-2.5 py-1 rounded-xl bg-emerald-50 text-emerald-800 border border-emerald-300 font-extrabold text-[11px] flex items-center justify-center gap-1">
          <span>🏆</span>
          <span>Cliente Ativo (${p.converted_client_id || 'PJ'})</span>
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
            <option value="convertido" ${p.status === 'convertido' ? 'selected' : ''}>🏆 Converter p/ Cliente</option>
            <option value="descartado" ${p.status === 'descartado' ? 'selected' : ''}>🚫 Descartar</option>
          </select>
          <button 
            type="button" 
            onclick="window.handleB2bConvertToClient(${p.id})"
            class="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold text-[11px] shadow-xs transition-all flex items-center gap-1 cursor-pointer active:scale-95"
            title="Promover a Cliente PJ do Escritório">
            <span>⭐</span>
            <span class="hidden sm:inline">Virar Cliente</span>
          </button>
        </div>
      `;
    }

    card.innerHTML = `
      <div class="flex items-start justify-between gap-2">
        <h4 class="font-bold text-slate-900 text-xs sm:text-sm leading-snug line-clamp-2" title="${escapeHtml(p.name)}">
          ${escapeHtml(p.name)}
        </h4>
        <span class="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 whitespace-nowrap">
          ${escapeHtml(p.neighborhood || 'JF')}
        </span>
      </div>

      <div class="text-[11px] text-slate-500 flex flex-wrap items-center gap-2">
        <span class="px-2 py-0.5 rounded-md bg-blue-50 text-blue-700 border border-blue-100 font-semibold text-[10px]">
          ${escapeHtml(p.primary_type_display || p.primary_type || 'Comércio')}
        </span>
        <span class="text-amber-600 font-bold text-[10px]">${stars}</span>
      </div>

      <div class="text-xs text-slate-600 space-y-1">
        ${p.phone ? `
          <div class="flex items-center justify-between gap-1">
            <span class="font-medium text-slate-700">${escapeHtml(p.phone)}</span>
            ${waUrl ? `
              <a href="${waUrl}" target="_blank" rel="noopener noreferrer" class="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-500 hover:bg-emerald-600 text-white text-[10px] font-bold transition-all shadow-xs" title="Conversar no WhatsApp">
                <span>💬</span>
                <span>WhatsApp</span>
              </a>
            ` : ''}
          </div>
        ` : '<span class="text-[11px] text-slate-400 italic">Sem telefone cadastrado</span>'}

        ${p.address ? `
          <p class="text-[11px] text-slate-400 line-clamp-1" title="${escapeHtml(p.address)}">
            📍 ${escapeHtml(p.address)}
          </p>
        ` : ''}
      </div>

      <div class="flex items-center gap-2 text-[11px] text-slate-400 pt-1">
        ${p.website ? `
          <a href="${escapeHtml(p.website)}" target="_blank" rel="noopener noreferrer" class="text-blue-600 hover:underline flex items-center gap-0.5" title="${escapeHtml(p.website)}">
            <span>🌐</span>
            <span>Site</span>
          </a>
        ` : ''}
        ${p.google_maps_url ? `
          <a href="${escapeHtml(p.google_maps_url)}" target="_blank" rel="noopener noreferrer" class="text-amber-600 hover:underline flex items-center gap-0.5">
            <span>🗺️</span>
            <span>Maps</span>
          </a>
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
      tbody.innerHTML = `
        <tr>
          <td colspan="7" class="py-12 text-center text-slate-400 text-sm">
            Nenhuma empresa encontrada com os filtros selecionados.
          </td>
        </tr>
      `;
      return;
    }

    prospects.forEach(p => {
      const tr = document.createElement('tr');
      tr.className = 'hover:bg-slate-50 transition-colors border-b border-slate-100 text-xs text-slate-700';

      const waUrl = getWhatsAppUrl(p.phone, p.name);
      const isConverted = p.status === 'convertido' || !!p.converted_client_id;

      tr.innerHTML = `
        <td class="py-3 px-3 font-bold text-slate-900">
          <div class="flex flex-col">
            <span>${escapeHtml(p.name)}</span>
            <span class="text-[10px] text-slate-400 font-normal">${escapeHtml(p.address || '')}</span>
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
          ${p.phone ? `
            <div class="flex items-center gap-1.5">
              <span>${escapeHtml(p.phone)}</span>
              ${waUrl ? `
                <a href="${waUrl}" target="_blank" rel="noopener noreferrer" class="p-1 rounded bg-emerald-500 hover:bg-emerald-600 text-white text-[10px] font-bold" title="WhatsApp">
                  💬
                </a>
              ` : ''}
            </div>
          ` : '<span class="text-slate-400 italic">--</span>'}
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
          ${isConverted ? `
            <span class="px-2 py-1 rounded bg-emerald-100 text-emerald-800 font-bold text-[11px]">
              Cliente ${p.converted_client_id || ''}
            </span>
          ` : `
            <button 
              type="button" 
              onclick="window.handleB2bConvertToClient(${p.id})"
              class="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold text-[11px] shadow-xs cursor-pointer">
              Virar Cliente
            </button>
          `}
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

  // Promover prospect a Cliente PJ formal
  window.handleB2bConvertToClient = async function (id) {
    const p = cachedProspects.find(item => item.id === id);
    const companyName = p ? p.name : 'esta empresa';

    const ok = confirm(`Deseja promover a empresa "${companyName}" a Cliente PJ oficial do escritório Jorge Alvim Advocacia?\n\nEla será cadastrada formalmente na tabela de clientes com processos e contratos.`);
    if (!ok) return;

    try {
      const res = await fetch(`/api/radar-b2b/prospects/${id}/convert`, {
        method: 'POST',
        headers: getHeaders()
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Falha ao converter');

      toast(`🎉 ${data.message}`, 'success');
      await fetchStats();
      await fetchProspects();

      // Recarrega lista de clientes se estiver em cache
      if (typeof window.loadClients === 'function') {
        window.loadClients();
      }
    } catch (e) {
      toast('Erro ao converter empresa: ' + e.message, 'error');
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
    const inputSearch = document.getElementById('b2b-search-input');

    if (selStatus) currentFilterStatus = selStatus.value;
    if (selCat) currentFilterCategory = selCat.value;
    if (selNb) currentFilterNeighborhood = selNb.value;
    if (inputSearch) currentSearchQuery = inputSearch.value.trim();

    fetchProspects();
  };

  // Importar base local extraída
  window.importarBaseLocalB2b = async function () {
    const ok = confirm('Deseja importar as empresas da pasta local para o Radar B2B?\n\nRegistros repetidos serão automaticamente ignorados para evitar duplicatas.');
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

  // Abrir modal de varredura Google Places
  window.openGooglePlacesSearchModal = function () {
    const m = document.getElementById('modal-google-places-search');
    if (m) m.classList.remove('hidden');
  };

  window.closeGooglePlacesSearchModal = function () {
    const m = document.getElementById('modal-google-places-search');
    if (m) m.classList.add('hidden');
  };

  // Disparar busca ao vivo no Google Places
  window.executarBuscaGooglePlaces = async function () {
    const query = document.getElementById('b2b-search-keyword')?.value?.trim();
    const neighborhood = document.getElementById('b2b-search-neighborhood')?.value;
    const apiKey = document.getElementById('b2b-search-apikey')?.value?.trim();

    if (!query) {
      toast('Informe o termo ou nicho a pesquisar (ex: contabilidade, clínica, construtora).', 'warning');
      return;
    }

    const btn = document.getElementById('btn-executar-busca-google');
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = '<span>⏳</span> Buscando no Google Places…';
    }

    try {
      const res = await fetch('/api/radar-b2b/buscar-google', {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({ query, neighborhood, apiKey })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Falha na busca Google Places');

      toast(`✅ Google Places retornou ${data.found} locais. Inseridas ${data.inserted} novas empresas no Radar!`, 'success');
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
