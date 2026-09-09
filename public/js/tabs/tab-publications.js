/**
 * ============================================================================
 * SUBMÓDULO DESACOPLADO: MÓDULO: INTIMAÇÕES JUDICIAIS (COMUNICAAPI/DJEN) & CALCULADORA DE PRAZOS
 * Origem: Decomposição arquitetural do painel-1-app.js
 * ============================================================================
 */

(function () {
  'use strict';

    // 📢 CONTROLLER DE INTIMAÇÕES (COMUNICAAPI/DJEN) & CALCULADORA DE PRAZOS
    // =========================================================================
    let publicationsState = {
      publications: [],
      stats: { total: 0, unread: 0, deadline_launched: 0 },
      selectedLawyer: 'all',
      selectedTribunal: 'all',
      selectedStatus: 'nao_lido',
      searchTerm: '',
      activePublication: null,
      calculatedResult: null
    };

    async function initPublicationsTab() {
      await loadPublicationsLawyers();
      await loadPublications();
    }

    async function loadPublicationsLawyers() {
      try {
        const filterSel = document.getElementById('pub-filter-lawyer');
        const calcLawyerSel = document.getElementById('calc-input-lawyer');

        if (!calendarState.lawyers || calendarState.lawyers.length === 0) {
          const res = await fetch('/api/calendar/lawyers', { headers: getAuthHeaders() });
          const data = await res.json();
          if (res.ok && data.success) calendarState.lawyers = data.lawyers || [];
        }

        if (filterSel && calendarState.lawyers) {
          const currentVal = filterSel.value;
          filterSel.innerHTML = `
            <option value="all">🏢 Todos os Advogados</option>
            ${calendarState.lawyers.map(l => `<option value="${l.id}">${l.name} (${l.role})</option>`).join('')}
          `;
          if (currentVal) filterSel.value = currentVal;
        }

        if (calcLawyerSel && calendarState.lawyers) {
          calcLawyerSel.innerHTML = calendarState.lawyers.map(l => `<option value="${l.id}" data-name="${l.name}">${l.name} - ${l.role}</option>`).join('');
        }
      } catch (e) {}
    }

    async function loadPublications() {
      try {
        const { selectedLawyer, selectedTribunal, selectedStatus, searchTerm } = publicationsState;
        let url = `/api/court/publications?`;
        if (selectedStatus && selectedStatus !== 'all') url += `&status=${encodeURIComponent(selectedStatus)}`;
        if (selectedLawyer && selectedLawyer !== 'all') url += `&lawyer_id=${encodeURIComponent(selectedLawyer)}`;
        if (selectedTribunal && selectedTribunal !== 'all') url += `&tribunal=${encodeURIComponent(selectedTribunal)}`;
        if (searchTerm && searchTerm.trim()) url += `&search=${encodeURIComponent(searchTerm.trim())}`;

        const res = await fetch(url, { headers: getAuthHeaders() });
        const data = await res.json();

        if (res.ok && data.success) {
          publicationsState.publications = data.publications || [];
          publicationsState.stats = data.stats || { total: 0, unread: 0, deadline_launched: 0 };
          updatePublicationsStatsDisplay();
          renderPublicationsCards();
        }
      } catch (err) {
        console.error('Erro ao buscar publicações:', err);
      }
    }

    async function loadPublicationsStats() {
      try {
        const res = await fetch('/api/court/publications?status=nao_lido', { headers: getAuthHeaders() });
        const data = await res.json();
        if (res.ok && data.success) {
          const stats = data.stats || {};
          const badge = document.getElementById('tab-publications-count');
          if (badge) {
            badge.textContent = stats.unread || 0;
            if (stats.unread > 0) {
              badge.className = 'px-1.5 py-0.5 rounded-full bg-rose-100 text-rose-800 text-[10px] font-extrabold animate-pulse';
            } else {
              badge.className = 'px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-600 text-[10px] font-bold';
            }
          }
        }
      } catch (e) {}
    }

    function updatePublicationsStatsDisplay() {
      const statTotal = document.getElementById('pub-stat-total');
      const statUnread = document.getElementById('pub-stat-unread');
      const statLaunched = document.getElementById('pub-stat-launched');
      const badge = document.getElementById('tab-publications-count');

      if (statTotal) statTotal.textContent = publicationsState.stats.total || 0;
      if (statUnread) statUnread.textContent = publicationsState.stats.unread || 0;
      if (statLaunched) statLaunched.textContent = publicationsState.stats.deadline_launched || 0;

      if (badge) {
        badge.textContent = publicationsState.stats.unread || 0;
        if (publicationsState.stats.unread > 0) {
          badge.className = 'px-1.5 py-0.5 rounded-full bg-rose-100 text-rose-800 text-[10px] font-extrabold animate-pulse';
        } else {
          badge.className = 'px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-600 text-[10px] font-bold';
        }
      }
    }

    function renderPublicationsCards() {
      const container = document.getElementById('pub-cards-list');
      if (!container) return;

      if (publicationsState.publications.length === 0) {
        container.innerHTML = `
          <div class="py-16 text-center text-slate-400 space-y-3 bg-white rounded-3xl border border-slate-200 shadow-xs">
            <div class="text-4xl">📭</div>
            <h4 class="font-bold text-slate-700 text-sm">Nenhuma publicação encontrada para este filtro.</h4>
            <p class="text-xs text-slate-500 max-w-md mx-auto">Clique em "Sincronizar DJEN Agora" para consultar publicações no Diário de Justiça Eletrônico Nacional.</p>
          </div>
        `;
        return;
      }

      container.innerHTML = publicationsState.publications.map(pub => {
        const isUnread = pub.status === 'nao_lido';
        const isLaunched = pub.status === 'prazo_lancado';
        const dateFmt = pub.data_disponibilizacao ? pub.data_disponibilizacao.split('-').reverse().join('/') : '—';
        const cleanText = pub.texto ? pub.texto.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim() : 'Sem texto disponível.';

        return `
          <div class="bg-white rounded-3xl p-5 sm:p-6 shadow-xs border ${isUnread ? 'border-rose-300 ring-2 ring-rose-100' : 'border-slate-200'} transition-all hover:shadow-md space-y-4">
            <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 border-b border-slate-100 pb-3">
              <div class="flex flex-wrap items-center gap-2">
                <span class="px-2.5 py-0.5 rounded-full bg-rose-100 text-rose-900 font-extrabold text-[10px] uppercase tracking-wider">
                  ${pub.sigla_tribunal || 'TJMG'}
                </span>
                <span class="px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-800 font-bold text-[10px]">
                  ${pub.tipo_comunicacao || 'Intimação'}
                </span>
                ${isUnread ? '<span class="px-2.5 py-0.5 rounded-full bg-red-500 text-white font-extrabold text-[10px] animate-pulse">NOVA / NÃO LIDA</span>' : ''}
                ${isLaunched ? '<span class="px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-900 font-extrabold text-[10px]">✅ PRAZO NA AGENDA</span>' : ''}
              </div>

              <div class="text-xs font-mono text-slate-500 flex items-center space-x-1.5">
                <span>📅 DJe:</span>
                <strong class="text-slate-800 font-bold">${dateFmt}</strong>
              </div>
            </div>

            <div class="space-y-1.5">
              <div class="flex flex-wrap items-center justify-between gap-2">
                <h4 class="font-extrabold text-sm sm:text-base text-navy-950">${pub.nome_orgao || 'Vara / Órgão Julgador'}</h4>
                <span class="font-mono text-xs font-bold text-amber-800 bg-amber-50 px-2.5 py-1 rounded-lg border border-amber-200 select-all">
                  ⚖️ ${pub.numeroprocessocommascara || pub.numero_processo || 'Processo s/ número'}
                </span>
              </div>
              
              <div class="text-xs text-slate-500 flex flex-wrap items-center gap-3">
                <span>👤 Advogado: <strong class="text-slate-800 font-semibold">${pub.advogado_nome || 'Banca Geral'}</strong></span>
                <span>📌 OAB: <strong class="text-slate-700 font-mono">${pub.advogado_oab || '—'}</strong></span>
                ${pub.nome_classe ? `<span>📁 Classe: <strong class="text-slate-700">${pub.nome_classe}</strong></span>` : ''}
              </div>
            </div>

            <!-- Trecho do Texto da Intimação -->
            <div class="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 text-xs text-slate-700 font-serif leading-relaxed line-clamp-3 select-text">
              ${cleanText}
            </div>

            <!-- Botões de Ação do Card -->
            <div class="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-100">
              <div class="flex items-center space-x-2">
                <button 
                  onclick="openPublicationViewModal('${pub.id}')" 
                  type="button" 
                  class="px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs transition-colors flex items-center space-x-1.5 cursor-pointer"
                >
                  <span>📄</span>
                  <span>Ver Inteiro Teor</span>
                </button>

                <button 
                  onclick="togglePublicationStatus('${pub.id}', '${isUnread ? 'lido' : 'nao_lido'}')" 
                  type="button" 
                  class="px-3.5 py-2 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-600 font-semibold text-xs transition-colors cursor-pointer"
                >
                  ${isUnread ? '👁️ Marcar como Lido' : '🔴 Marcar Não Lido'}
                </button>
              </div>

              <button 
                onclick="calculateDeadlineToPublication('${pub.id}')" 
                type="button" 
                class="px-4 py-2 rounded-xl bg-gradient-to-r from-amber-600 to-rose-600 hover:from-amber-700 hover:to-rose-700 text-white font-extrabold text-xs shadow-sm hover:shadow-md transition-all flex items-center space-x-1.5 cursor-pointer"
              >
                <span>🧮</span>
                <span>Calcular Prazo com 1 Clique</span>
              </button>
            </div>
          </div>
        `;
      }).join('');
    }

    function handlePublicationFilterChange() {
      const searchInput = document.getElementById('pub-search-input');
      const lawyerSel = document.getElementById('pub-filter-lawyer');
      const tribunalSel = document.getElementById('pub-filter-tribunal');
      const statusSel = document.getElementById('pub-filter-status');

      if (searchInput) publicationsState.searchTerm = searchInput.value;
      if (lawyerSel) publicationsState.selectedLawyer = lawyerSel.value;
      if (tribunalSel) publicationsState.selectedTribunal = tribunalSel.value;
      if (statusSel) publicationsState.selectedStatus = statusSel.value;

      loadPublications();
    }

    async function syncPublicationsNow() {
      const btn = document.getElementById('pub-sync-btn');
      if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<span>⏳ Sincronizando DJEN...</span>';
      }

      try {
        const res = await fetch('/api/court/publications/sync', {
          method: 'POST',
          headers: getAuthHeaders()
        });
        const data = await res.json();

        if (res.ok && data.success) {
          alert(`🎉 ${data.message}`);
          await loadPublications();
          await loadPublicationsStats();
        } else {
          alert(`❌ ${data.error || 'Erro ao sincronizar com a ComunicaAPI.'}`);
        }
      } catch (e) {
        alert('Falha ao comunicar com o servidor para sincronização.');
      } finally {
        if (btn) {
          btn.disabled = false;
          btn.innerHTML = '<span>🔄</span><span>Sincronizar DJEN Agora</span>';
        }
      }
    }

    async function togglePublicationStatus(pubId, newStatus) {
      try {
        const res = await fetch(`/api/court/publications/${pubId}/status`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
          body: JSON.stringify({ status: newStatus })
        });
        if (res.ok) {
          await loadPublications();
          await loadPublicationsStats();
        }
      } catch (e) {}
    }

    function openPublicationViewModal(pubId) {
      const pub = publicationsState.publications.find(p => p.id === pubId);
      if (!pub) return;

      publicationsState.activePublication = pub;
      const modal = document.getElementById('modal-publication-view');

      document.getElementById('pub-view-tribunal-badge').textContent = pub.sigla_tribunal || 'TJMG';
      document.getElementById('pub-view-type-badge').textContent = pub.tipo_comunicacao || 'Intimação';
      document.getElementById('pub-view-status-badge').textContent = pub.status.toUpperCase();
      document.getElementById('pub-view-orgao').textContent = pub.nome_orgao || 'Órgão Julgador';
      document.getElementById('pub-view-advogado').textContent = `Destinatário: ${pub.advogado_nome} (${pub.advogado_oab || ''})`;
      document.getElementById('pub-view-processo').textContent = pub.numeroprocessocommascara || pub.numero_processo || '—';
      document.getElementById('pub-view-data').textContent = pub.data_disponibilizacao ? pub.data_disponibilizacao.split('-').reverse().join('/') : '—';
      
      const cleanText = pub.texto ? pub.texto.replace(/<br\s*[\/]?>/gi, '\n').replace(/<[^>]*>/g, ' ') : '';
      document.getElementById('pub-view-texto').textContent = cleanText;

      const toggleBtn = document.getElementById('pub-view-toggle-read-btn');
      if (toggleBtn) {
        toggleBtn.textContent = pub.status === 'nao_lido' ? '👁️ Marcar como Lido' : '🔴 Marcar Não Lido';
      }

      if (modal) modal.classList.remove('hidden');
    }

    function closePublicationViewModal() {
      const modal = document.getElementById('modal-publication-view');
      if (modal) modal.classList.add('hidden');
      publicationsState.activePublication = null;
    }

    async function toggleCurrentPublicationReadStatus() {
      if (!publicationsState.activePublication) return;
      const pub = publicationsState.activePublication;
      const nextStatus = pub.status === 'nao_lido' ? 'lido' : 'nao_lido';
      await togglePublicationStatus(pub.id, nextStatus);
      closePublicationViewModal();
    }

    function calculateDeadlineToCurrentPublication() {
      if (!publicationsState.activePublication) return;
      const pub = publicationsState.activePublication;
      closePublicationViewModal();
      calculateDeadlineToPublication(pub.id);
    }

    function calculateDeadlineToPublication(pubId) {
      const pub = publicationsState.publications.find(p => p.id === pubId);
      if (!pub) return;

      openDeadlineCalculator({
        publication_id: pub.id,
        start_date: pub.data_disponibilizacao,
        lawsuit_number: pub.numeroprocessocommascara || pub.numero_processo,
        lawyer_id: pub.lawyer_id,
        lawyer_name: pub.advogado_nome,
        title: `Prazo Fatal: Intimação ${pub.sigla_tribunal} (${pub.nome_orgao || ''})`
      });
    }

    function openDeadlineCalculator(params = {}) {
      const modal = document.getElementById('modal-deadline-calculator');
      loadPublicationsLawyers();

      const pad = (n) => String(n).padStart(2, '0');
      const now = new Date();
      const defaultDate = params.start_date || `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;

      document.getElementById('calc-input-start-date').value = defaultDate;
      document.getElementById('calc-input-regime').value = params.regime || 'cpc';
      document.getElementById('calc-input-preset').value = params.days || '15';
      
      const lawyerSel = document.getElementById('calc-input-lawyer');
      if (lawyerSel && params.lawyer_id) lawyerSel.value = params.lawyer_id;

      document.getElementById('calc-input-lawsuit-number').value = params.lawsuit_number || '';
      document.getElementById('calc-input-client-name').value = params.client_name || '';
      document.getElementById('calc-input-title').value = params.title || 'Prazo Fatal: Apelação Cível';

      document.getElementById('modal-deadline-calculator').setAttribute('data-pub-id', params.publication_id || '');

      handlePresetChange();
      handleCalculateDeadline();

      if (modal) modal.classList.remove('hidden');
    }

    function closeDeadlineCalculator() {
      const modal = document.getElementById('modal-deadline-calculator');
      if (modal) modal.classList.add('hidden');
    }

    function handlePresetChange() {
      const preset = document.getElementById('calc-input-preset').value;
      const customBox = document.getElementById('calc-custom-days-box');
      if (preset === 'custom') {
        customBox.classList.remove('hidden');
      } else {
        customBox.classList.add('hidden');
      }
      handleCalculateDeadline();
    }

    async function handleCalculateDeadline() {
      const startDate = document.getElementById('calc-input-start-date').value;
      if (!startDate) return;

      const regime = document.getElementById('calc-input-regime').value;
      const preset = document.getElementById('calc-input-preset').value;
      const days = preset === 'custom' ? Number(document.getElementById('calc-input-custom-days').value) || 15 : Number(preset);

      try {
        const res = await fetch('/api/court/deadline/calculate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
          body: JSON.stringify({ start_date: startDate, days, regime })
        });
        const data = await res.json();

        if (res.ok && data.success) {
          publicationsState.calculatedResult = data;
          
          const fatalSplit = data.data_fatal.split('-');
          const fatalDateObj = new Date(Number(fatalSplit[0]), Number(fatalSplit[1]) - 1, Number(fatalSplit[2]));
          const weekdays = ['Domingo', 'Segunda-Feira', 'Terça-Feira', 'Quarta-Feira', 'Quinta-Feira', 'Sexta-Feira', 'Sábado'];
          const fatalWeekday = weekdays[fatalDateObj.getDay()];

          document.getElementById('calc-result-fatal-date').textContent = data.data_fatal.split('-').reverse().join('/');
          document.getElementById('calc-result-fatal-weekday').textContent = `${fatalWeekday} • Término às 23:59h`;
          
          document.getElementById('calc-result-d0').textContent = data.data_disponibilizacao.split('-').reverse().join('/');
          document.getElementById('calc-result-d1').textContent = data.data_publicacao.split('-').reverse().join('/');
          document.getElementById('calc-result-d2').textContent = data.data_inicio_prazo.split('-').reverse().join('/');
          document.getElementById('calc-result-days-summary').textContent = `${data.prazo_dias} Dias ${data.tipo_dias} (${data.total_dias_corridos} dias corridos totais)`;

          const holidaysList = document.getElementById('calc-holidays-list');
          if (holidaysList) {
            if (data.feriados_compensados && data.feriados_compensados.length > 0) {
              holidaysList.innerHTML = data.feriados_compensados.map(f => `
                <div class="flex items-center justify-between">
                  <span class="font-mono font-bold">${f.date.split('-').reverse().join('/')}:</span>
                  <span class="font-semibold text-slate-700">${f.reason}</span>
                </div>
              `).join('');
            } else {
              holidaysList.innerHTML = '<span class="text-slate-400">Nenhum feriado interveniente (somente dias úteis normais).</span>';
            }
          }
        }
      } catch (err) {
        console.error('Erro ao calcular prazo:', err);
      }
    }

    async function launchCalculatedDeadlineToCalendar() {
      if (!publicationsState.calculatedResult) {
        alert('Realize o cálculo antes de lançar na agenda.');
        return;
      }

      const modalEl = document.getElementById('modal-deadline-calculator');
      const publicationId = modalEl ? modalEl.getAttribute('data-pub-id') : null;

      const lawyerSel = document.getElementById('calc-input-lawyer');
      const lawyerOpt = lawyerSel.options[lawyerSel.selectedIndex];

      const payload = {
        publication_id: publicationId,
        title: document.getElementById('calc-input-title').value.trim(),
        description: `Prazo Fatal calculado de ${publicationsState.calculatedResult.prazo_dias} dias úteis (${publicationsState.calculatedResult.regime}). Início: ${publicationsState.calculatedResult.data_inicio_prazo.split('-').reverse().join('/')}.`,
        lawyer_id: lawyerSel ? lawyerSel.value : 'dr-jorge-alvim',
        lawyer_name: lawyerOpt ? (lawyerOpt.getAttribute('data-name') || lawyerOpt.textContent.split(' - ')[0]) : 'Dr. Jorge Alvim',
        client_name: document.getElementById('calc-input-client-name').value.trim(),
        lawsuit_number: document.getElementById('calc-input-lawsuit-number').value.trim(),
        deadline_date: publicationsState.calculatedResult.data_fatal,
        regime: publicationsState.calculatedResult.regime,
        days_count: publicationsState.calculatedResult.prazo_dias
      };

      const btn = document.getElementById('calc-launch-btn');
      if (btn) btn.disabled = true;

      try {
        const res = await fetch('/api/court/deadline/launch-to-calendar', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
          body: JSON.stringify(payload)
        });
        const data = await res.json();

        if (res.ok && data.success) {
          alert(`🎉 ${data.message}\n\nO prazo fatal foi lançado com sucesso na pauta do advogado e na agenda do escritório!`);
          closeDeadlineCalculator();
          if (publicationsState.publications.length > 0) loadPublications();
          loadCalendarEvents();
          loadCalendarSummary();
          loadPublicationsStats();
        } else {
          alert(`❌ ${data.error || 'Erro ao lançar prazo na agenda.'}`);
        }
      } catch (err) {
        alert('Falha ao comunicar com o servidor.');
      } finally {
        if (btn) btn.disabled = false;
      }
    }

    function copyDeadlineCalculation() {
      if (!publicationsState.calculatedResult) return;
      const res = publicationsState.calculatedResult;
      const title = document.getElementById('calc-input-title').value;
      const lawsuitNum = document.getElementById('calc-input-lawsuit-number').value;

      let text = `📅 MEMÓRIA DE CÁLCULO DE PRAZO PROCESSUAL\n`;
      text += `Assunto: ${title}\n`;
      if (lawsuitNum) text += `Processo CNJ: ${lawsuitNum}\n`;
      text += `Regime: ${res.regime} (${res.prazo_dias} Dias ${res.tipo_dias})\n\n`;
      text += `• D0 (Disponibilização DJe): ${res.data_disponibilizacao.split('-').reverse().join('/')}\n`;
      text += `• D1 (Publicação Oficial): ${res.data_publicacao.split('-').reverse().join('/')}\n`;
      text += `• D2 (Início da Contagem): ${res.data_inicio_prazo.split('-').reverse().join('/')}\n`;
      text += `🚨 DATA FATAL (VENCIMENTO): ${res.data_fatal.split('-').reverse().join('/')} às 23:59h\n\n`;
      if (res.feriados_compensados && res.feriados_compensados.length > 0) {
        text += `Feriados e Fins de Semana Compensados:\n`;
        res.feriados_compensados.forEach(f => {
          text += ` - ${f.date.split('-').reverse().join('/')}: ${f.reason}\n`;
        });
      }
      text += `\nGerado por: Jorge Alvim Advocacia & Tecnologia`;

      navigator.clipboard.writeText(text).then(() => {
        alert('📋 Memória de cálculo copiada para a área de transferência!');
      });
    }

    // =============================================================================

  // ==========================================================================
  // EXPORTAÇÕES GLOBAIS PARA INTERFACE (ONCLICK & COMPATIBILIDADE)
  // ==========================================================================
  window.initPublicationsTab = typeof initPublicationsTab !== 'undefined' ? initPublicationsTab : window.initPublicationsTab;
  window.loadPublicationsLawyers = typeof loadPublicationsLawyers !== 'undefined' ? loadPublicationsLawyers : window.loadPublicationsLawyers;
  window.loadPublications = typeof loadPublications !== 'undefined' ? loadPublications : window.loadPublications;
  window.loadPublicationsStats = typeof loadPublicationsStats !== 'undefined' ? loadPublicationsStats : window.loadPublicationsStats;
  window.updatePublicationsStatsDisplay = typeof updatePublicationsStatsDisplay !== 'undefined' ? updatePublicationsStatsDisplay : window.updatePublicationsStatsDisplay;
  window.renderPublicationsCards = typeof renderPublicationsCards !== 'undefined' ? renderPublicationsCards : window.renderPublicationsCards;
  window.handlePublicationFilterChange = typeof handlePublicationFilterChange !== 'undefined' ? handlePublicationFilterChange : window.handlePublicationFilterChange;
  window.syncPublicationsNow = typeof syncPublicationsNow !== 'undefined' ? syncPublicationsNow : window.syncPublicationsNow;
  window.togglePublicationStatus = typeof togglePublicationStatus !== 'undefined' ? togglePublicationStatus : window.togglePublicationStatus;
  window.openPublicationViewModal = typeof openPublicationViewModal !== 'undefined' ? openPublicationViewModal : window.openPublicationViewModal;
  window.closePublicationViewModal = typeof closePublicationViewModal !== 'undefined' ? closePublicationViewModal : window.closePublicationViewModal;
  window.toggleCurrentPublicationReadStatus = typeof toggleCurrentPublicationReadStatus !== 'undefined' ? toggleCurrentPublicationReadStatus : window.toggleCurrentPublicationReadStatus;
  window.calculateDeadlineToCurrentPublication = typeof calculateDeadlineToCurrentPublication !== 'undefined' ? calculateDeadlineToCurrentPublication : window.calculateDeadlineToCurrentPublication;
  window.calculateDeadlineToPublication = typeof calculateDeadlineToPublication !== 'undefined' ? calculateDeadlineToPublication : window.calculateDeadlineToPublication;
  window.openDeadlineCalculator = typeof openDeadlineCalculator !== 'undefined' ? openDeadlineCalculator : window.openDeadlineCalculator;
  window.closeDeadlineCalculator = typeof closeDeadlineCalculator !== 'undefined' ? closeDeadlineCalculator : window.closeDeadlineCalculator;
  window.handlePresetChange = typeof handlePresetChange !== 'undefined' ? handlePresetChange : window.handlePresetChange;
  window.handleCalculateDeadline = typeof handleCalculateDeadline !== 'undefined' ? handleCalculateDeadline : window.handleCalculateDeadline;
  window.launchCalculatedDeadlineToCalendar = typeof launchCalculatedDeadlineToCalendar !== 'undefined' ? launchCalculatedDeadlineToCalendar : window.launchCalculatedDeadlineToCalendar;
  window.copyDeadlineCalculation = typeof copyDeadlineCalculation !== 'undefined' ? copyDeadlineCalculation : window.copyDeadlineCalculation;
})();
