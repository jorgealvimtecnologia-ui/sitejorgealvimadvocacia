/**
 * ============================================================================
 * SUBMÓDULO DESACOPLADO: MÓDULO: RADAR JUDICIAL (DATAJUD CNJ, MNI & TRIBUNAIS)
 * Origem: Decomposição arquitetural do painel-1-app.js
 * ============================================================================
 */

(function () {
  'use strict';

    // FUNÇÕES DA ABA 9: RADAR JUDICIAL (DATAJUD CNJ, MNI & TRIBUNAIS)
    // =========================================================================
    let currentJudicialSearchType = 'number';
    let currentJudicialResults = [];
    let selectedJudicialProcess = null;

    function initJudicialTab() {
      // Inicialização da aba
      const input = document.getElementById('judicial-search-input');
      if (input && !input.value) {
        input.focus();
      }
    }

    function setJudicialSearchType(type) {
      currentJudicialSearchType = type;
      const btnNumber = document.getElementById('judicial-type-btn-number');
      const btnName = document.getElementById('judicial-type-btn-name');
      const btnDoc = document.getElementById('judicial-type-btn-doc');
      const btnOab = document.getElementById('judicial-type-btn-oab');
      const label = document.getElementById('judicial-input-label');
      const input = document.getElementById('judicial-search-input');

      const activeBtnClass = "px-4 py-2 rounded-xl text-xs font-bold transition-all bg-blue-50 text-blue-900 border border-blue-300 shadow-sm flex items-center space-x-2";
      const inactiveBtnClass = "px-4 py-2 rounded-xl text-xs font-bold transition-all bg-slate-100 text-slate-700 hover:bg-slate-200 border border-slate-200 flex items-center space-x-2";

      if (btnNumber) btnNumber.className = inactiveBtnClass;
      if (btnName) btnName.className = inactiveBtnClass;
      if (btnDoc) btnDoc.className = inactiveBtnClass;
      if (btnOab) btnOab.className = inactiveBtnClass;

      if (type === 'number') {
        if (btnNumber) btnNumber.className = activeBtnClass;
        label.textContent = 'Número Único do Processo (CNJ / NPU)';
        input.placeholder = 'Ex: 5006870-33.2024.8.13.0313 ou 5007788-99.2026.8.13.0145';
      } else if (type === 'name') {
        if (btnName) btnName.className = activeBtnClass;
        label.textContent = 'Nome Completo da Parte ou Empresa';
        input.placeholder = 'Ex: Mariana Souza, Carlos Alberto Santos, Banco do Brasil';
      } else if (type === 'cpf' || type === 'cnpj') {
        if (btnDoc) btnDoc.className = activeBtnClass;
        label.textContent = 'CPF ou CNPJ da Parte';
        input.placeholder = 'Ex: 123.456.789-00 ou 12.345.678/0001-99';
      } else if (type === 'oab') {
        if (btnOab) btnOab.className = activeBtnClass;
        label.textContent = 'Número da Inscrição da OAB / UF';
        input.placeholder = 'Ex: 222943, 222.943 ou OAB/MG 222943 (Dr. Jorge Alvim)';
      }
      input.focus();
    }

    function setJudicialSearchExample(val, type) {
      setJudicialSearchType(type);
      const input = document.getElementById('judicial-search-input');
      input.value = val;
      handleJudicialSearch(new Event('submit'));
    }

    function clearJudicialSearch() {
      document.getElementById('judicial-search-input').value = '';
      currentJudicialResults = [];
      document.getElementById('judicial-results-container').innerHTML = `
        <div id="judicial-empty-state" class="bg-white p-10 rounded-3xl border border-slate-200 text-center space-y-3">
          <div class="w-16 h-16 rounded-3xl bg-blue-50 text-blue-600 flex items-center justify-center text-3xl mx-auto border border-blue-200">
            🔍
          </div>
          <h5 class="font-serif font-bold text-base text-navy-950">Nenhuma pesquisa realizada ainda</h5>
          <p class="text-xs text-slate-500 max-w-md mx-auto">
            Digite um número de processo, nome da parte ou CPF/CNPJ para localizar autos judiciais com histórico completo de andamentos e peças públicas.
          </p>
        </div>
      `;
      document.getElementById('judicial-results-count-badge').textContent = '0 processos';
      document.getElementById('judicial-cache-indicator').classList.add('hidden');
      document.getElementById('judicial-search-status-text').textContent = 'Utilize o campo acima para consultar a base nacional de processos';
    }

    async function handleJudicialSearch(e) {
      if (e && e.preventDefault) e.preventDefault();

      const term = document.getElementById('judicial-search-input').value.trim();
      const tribunal = document.getElementById('judicial-tribunal-select').value;
      const submitBtn = document.getElementById('judicial-search-submit-btn');
      const spinner = document.getElementById('judicial-loading-spinner');
      const container = document.getElementById('judicial-results-container');
      const countBadge = document.getElementById('judicial-results-count-badge');
      const cacheIndicator = document.getElementById('judicial-cache-indicator');
      const statusText = document.getElementById('judicial-search-status-text');

      if (!term) {
        alert('Por favor, informe o número, nome ou documento para pesquisar.');
        return;
      }

      spinner.classList.remove('hidden');
      container.classList.add('hidden');
      cacheIndicator.classList.add('hidden');
      submitBtn.disabled = true;
      submitBtn.innerHTML = '<span>Consultando CNJ...</span>';

      try {
        const res = await fetch('/api/judicial/search', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
          body: JSON.stringify({
            query_type: currentJudicialSearchType,
            query_term: term,
            tribunal: tribunal
          })
        });

        const data = await res.json();

        if (res.ok && data.success) {
          currentJudicialResults = data.processes || [];
          countBadge.textContent = `${currentJudicialResults.length} processo(s)`;
          statusText.textContent = `Consulta realizada em ${data.source === 'cache' ? 'cache local' : 'tempo real nos tribunais'}`;
          
          if (data.source === 'cache') {
            cacheIndicator.classList.remove('hidden');
          }

          renderJudicialResults(currentJudicialResults);
        } else {
          alert(`❌ ${data.error || 'Erro ao consultar o Radar Judicial.'}`);
          container.innerHTML = `
            <div class="bg-rose-50 p-8 rounded-3xl border border-rose-200 text-center space-y-2">
              <p class="text-sm font-bold text-rose-800">Falha na consulta judicial</p>
              <p class="text-xs text-rose-600">${data.error || 'Não foi possível consultar a base do CNJ no momento.'}</p>
            </div>
          `;
        }
      } catch (err) {
        alert('Falha de conexão com o servidor ao consultar o Radar Judicial.');
      } finally {
        spinner.classList.add('hidden');
        container.classList.remove('hidden');
        submitBtn.disabled = false;
        submitBtn.innerHTML = '<span>🔍 Buscar no DataJud & MNI</span>';
      }
    }

    let currentJudicialPage = 1;
    const JUDICIAL_PAGE_SIZE = 5;

    function parseCnjSortKey(item) {
      const raw = (item.numero_processo || item.numero_formatado || '').replace(/\D/g, '');
      let year = 0;
      let seq = 0;
      if (raw.length >= 13) {
        seq = parseInt(raw.substring(0, 7), 10) || 0;
        year = parseInt(raw.substring(9, 13), 10) || 0;
      } else if (item.distribution_date) {
        const parts = item.distribution_date.split(/[-/]/);
        if (parts.length === 3) {
          year = parseInt(parts[0].length === 4 ? parts[0] : parts[2], 10) || 0;
        }
      }
      return { year, seq };
    }

    function sortJudicialProcessesNewestFirst(list) {
      return [...list].sort((a, b) => {
        const keyA = parseCnjSortKey(a);
        const keyB = parseCnjSortKey(b);
        if (keyB.year !== keyA.year) return keyB.year - keyA.year;
        return keyB.seq - keyA.seq;
      });
    }

    function renderJudicialResults(processes) {
      const container = document.getElementById('judicial-results-container');
      const pagContainer = document.getElementById('judicial-pagination-container');

      if (!processes || processes.length === 0) {
        currentJudicialResults = [];
        if (pagContainer) pagContainer.classList.add('hidden');
        container.innerHTML = `
          <div class="bg-white p-10 rounded-3xl border border-slate-200 text-center space-y-3">
            <div class="w-14 h-14 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center text-2xl mx-auto border border-amber-200">
              📂
            </div>
            <h5 class="font-serif font-bold text-base text-navy-950">Nenhum processo localizado</h5>
            <p class="text-xs text-slate-500 max-w-md mx-auto">
              Não encontramos processos públicos para os parâmetros informados. Verifique se o número do CNJ ou nome está correto ou selecione a opção "Todos os Tribunais".
            </p>
          </div>
        `;
        return;
      }

      currentJudicialResults = sortJudicialProcessesNewestFirst(processes);
      currentJudicialPage = 1;
      renderJudicialPage(1);
    }

    function renderJudicialPage(page) {
      currentJudicialPage = page;
      const total = currentJudicialResults.length;
      const totalPages = Math.ceil(total / JUDICIAL_PAGE_SIZE);
      const startIdx = (page - 1) * JUDICIAL_PAGE_SIZE;
      const endIdx = Math.min(startIdx + JUDICIAL_PAGE_SIZE, total);
      const pageItems = currentJudicialResults.slice(startIdx, endIdx);

      const container = document.getElementById('judicial-results-container');
      const pagContainer = document.getElementById('judicial-pagination-container');
      const rangeEl = document.getElementById('judicial-page-range');
      const totalEl = document.getElementById('judicial-page-total');
      const btnContainer = document.getElementById('judicial-pagination-buttons');

      if (pagContainer) {
        if (total > 0) {
          pagContainer.classList.remove('hidden');
          if (rangeEl) rangeEl.textContent = `${startIdx + 1}-${endIdx}`;
          if (totalEl) totalEl.textContent = total;
        } else {
          pagContainer.classList.add('hidden');
        }
      }

      // Renderizar botões numerados sequenciais
      let buttonsHtml = '';
      if (totalPages > 1) {
        buttonsHtml += `
          <button 
            type="button" 
            onclick="renderJudicialPage(${Math.max(1, page - 1)})" 
            ${page === 1 ? 'disabled' : ''}
            class="px-3 py-1.5 rounded-xl border ${page === 1 ? 'bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed' : 'bg-white text-navy-950 hover:bg-slate-100 border-slate-300 font-bold'} text-xs transition-all cursor-pointer"
          >
            ◀ Anterior
          </button>
        `;

        for (let i = 1; i <= totalPages; i++) {
          const isActive = i === page;
          buttonsHtml += `
            <button 
              type="button" 
              onclick="renderJudicialPage(${i})" 
              class="px-3 py-1.5 rounded-xl border text-xs font-bold transition-all cursor-pointer ${isActive ? 'bg-blue-600 text-white border-blue-600 shadow-sm' : 'bg-white text-slate-700 hover:bg-slate-100 border-slate-200'}"
            >
              ${i}
            </button>
          `;
        }

        buttonsHtml += `
          <button 
            type="button" 
            onclick="renderJudicialPage(${Math.min(totalPages, page + 1)})" 
            ${page === totalPages ? 'disabled' : ''}
            class="px-3 py-1.5 rounded-xl border ${page === totalPages ? 'bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed' : 'bg-white text-navy-950 hover:bg-slate-100 border-slate-300 font-bold'} text-xs transition-all cursor-pointer"
          >
            Próximo ▶
          </button>
        `;
      }
      if (btnContainer) btnContainer.innerHTML = buttonsHtml;

      container.innerHTML = pageItems.map((p, index) => {
        const lastMov = p.movements && p.movements[0] ? p.movements[0] : { title: 'Processo Ativo', date: p.distribution_date };
        const poloAtivoName = p.polo_ativo?.[0]?.name || 'Parte Autora';
        const poloPassivoName = p.polo_passivo?.[0]?.name || 'Parte Ré';
        const formattedDate = lastMov.date ? (lastMov.date.includes('-') ? lastMov.date.split('-').reverse().join('/') : lastMov.date) : '-';
        const numDisplay = p.numero_formatado || p.numero_processo;
        const courtDisplay = p.orgao_julgador || p.court_branch || 'Vara Cível / Juízo';

        return `
          <div class="bg-white rounded-3xl p-5 sm:p-6 border border-slate-200 shadow-sm hover:shadow-md transition-all space-y-4">
            
            <!-- Cabeçalho do Card -->
            <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 border-b border-slate-100 pb-3">
              <div>
                <div class="flex flex-wrap items-center gap-2 mb-1">
                  <span class="px-2.5 py-0.5 rounded-full bg-blue-100 text-blue-900 font-extrabold text-[10px] uppercase">
                    ${p.tribunal_code ? p.tribunal_code.toUpperCase() : 'TJMG'}
                  </span>
                  <span class="px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-900 font-bold text-[10px]">
                    ⚡ Processo Ordenado (CNJ)
                  </span>
                  <span class="text-xs text-slate-400">•</span>
                  <span class="text-xs font-semibold text-slate-500">${p.tribunal_name || 'Tribunal de Justiça'}</span>
                </div>
                <h4 class="font-mono font-black text-base sm:text-lg text-navy-950 hover:text-blue-700 cursor-pointer select-all" onclick="openJudicialProcessModal('${p.id}')">
                  ⚖️ ${numDisplay}
                </h4>
              </div>

              <span class="px-3 py-1 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200 text-xs font-bold flex items-center space-x-1">
                <span class="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                <span>${p.status || 'Em Tramitação'}</span>
              </span>
            </div>

            <!-- Dados da Ação & Partes -->
            <div class="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
              <div class="space-y-1">
                <span class="text-[10px] font-bold uppercase text-slate-400 block">Classe & Assunto:</span>
                <p class="font-bold text-slate-800">${p.class_name || 'Ação Judicial'}</p>
                <p class="text-slate-500 text-[11px]">${p.subject || 'Direito Civil e Empresarial'}</p>
              </div>

              <div class="space-y-1">
                <span class="text-[10px] font-bold uppercase text-slate-400 block">Polos da Ação:</span>
                <p class="text-slate-800"><strong class="text-emerald-700">Autor:</strong> ${poloAtivoName}</p>
                <p class="text-slate-800"><strong class="text-rose-700">Réu:</strong> ${poloPassivoName}</p>
              </div>

              <div class="space-y-1">
                <span class="text-[10px] font-bold uppercase text-slate-400 block">Comarca / Juízo:</span>
                <p class="font-bold text-slate-800">${courtDisplay}</p>
                <p class="text-slate-500 text-[11px]">Distribuído em: ${p.distribution_date || '—'}</p>
              </div>
            </div>

            <!-- Última Movimentação -->
            <div class="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div class="flex items-center space-x-2 overflow-hidden">
                <span class="px-2 py-0.5 bg-blue-100 text-blue-900 rounded font-bold text-[10px] whitespace-nowrap">Último Andamento (${formattedDate})</span>
                <span class="text-slate-700 font-medium truncate">${lastMov.title || lastMov.description || 'Movimentação Registrada'}</span>
              </div>
            </div>

            <!-- Ações do Processo -->
            <div class="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-100">
              <div class="flex items-center space-x-2">
                <button 
                  onclick="openJudicialProcessModal('${p.id}')" 
                  type="button"
                  class="px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs transition-all flex items-center space-x-1.5 cursor-pointer"
                >
                  <span>📄</span>
                  <span>Ver Autos & Movimentações</span>
                </button>

                <button 
                  onclick="openDeadlineCalculator({ lawsuit_number: '${numDisplay}', client_name: '${poloAtivoName}', title: 'Prazo: ${numDisplay}' })" 
                  type="button"
                  class="px-3.5 py-2 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-300 font-bold text-xs transition-all flex items-center space-x-1.5 cursor-pointer"
                >
                  <span>🧮</span>
                  <span>Calcular Prazo</span>
                </button>
              </div>

              <button 
                onclick="quickImportJudicialProcess('${p.id}')" 
                type="button"
                class="px-4 py-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-700 hover:from-emerald-500 hover:to-teal-600 text-white font-bold text-xs shadow-sm hover:shadow transition-all flex items-center space-x-1.5 cursor-pointer"
              >
                <span>📥</span>
                <span>Importar para o Escritório</span>
              </button>
            </div>

          </div>
        `;
      }).join('');
    }

    function openJudicialProcessModal(processId) {
      const process = currentJudicialResults.find(p => p.id === processId);
      if (!process) return;

      selectedJudicialProcess = process;

      document.getElementById('jmodal-tribunal-badge').textContent = (process.tribunal_code || 'TJ').toUpperCase();
      document.getElementById('jmodal-system-badge').textContent = process.court_system || 'PJe';
      document.getElementById('jmodal-process-number').textContent = process.numero_processo;
      document.getElementById('jmodal-class-name').textContent = process.class_name;
      document.getElementById('jmodal-subject').textContent = process.subject;
      document.getElementById('jmodal-distribution').textContent = process.distribution_date;
      document.getElementById('jmodal-court-branch').textContent = process.court_branch;

      const poloAtivoName = process.polo_ativo?.[0]?.name || 'Autor';
      const poloAtivoDoc = process.polo_ativo?.[0]?.document || '';
      document.getElementById('jmodal-polo-ativo').textContent = poloAtivoName;
      document.getElementById('jmodal-polo-ativo-doc').textContent = poloAtivoDoc ? `Documento: ${poloAtivoDoc}` : '';

      const poloPassivoName = process.polo_passivo?.[0]?.name || 'Réu';
      const poloPassivoDoc = process.polo_passivo?.[0]?.document || '';
      document.getElementById('jmodal-polo-passivo').textContent = poloPassivoName;
      document.getElementById('jmodal-polo-passivo-doc').textContent = poloPassivoDoc ? `Documento: ${poloPassivoDoc}` : '';

      const lawyerName = process.lawyers?.[0]?.name || 'Dr. Jorge Eduardo da Silva Alvim';
      const lawyerOAB = process.lawyers?.[0]?.oab || '222.943';
      document.getElementById('jmodal-lawyers').textContent = `${lawyerName} (OAB/${process.lawyers?.[0]?.uf || 'MG'} ${lawyerOAB})`;

      document.getElementById('jmodal-portal-link').href = process.direct_portal_url;

      // Renderizar Documentos Públicos
      const docsContainer = document.getElementById('jmodal-docs-container');
      const docs = process.public_documents || [];
      docsContainer.innerHTML = docs.map(d => `
        <div class="p-2.5 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between text-xs hover:bg-blue-50/50 hover:border-blue-200 transition-all cursor-pointer" onclick="alert('Documento Público dos Autos Eletrônicos: ${d.title} (Disponível no Portal do Tribunal)')">
          <div class="flex items-center space-x-2 truncate">
            <span class="p-1 rounded bg-rose-100 text-rose-700 font-bold text-[10px]">${d.type}</span>
            <span class="font-semibold text-slate-800 truncate">${d.title}</span>
          </div>
          <span class="text-[10px] text-blue-600 font-bold">Ver</span>
        </div>
      `).join('');

      // Renderizar Movimentações
      const movTimeline = document.getElementById('jmodal-movements-timeline');
      const movs = process.movements || [];
      movTimeline.innerHTML = movs.map(m => {
        const d = m.date ? new Date(m.date).toLocaleString('pt-BR') : '-';
        return `
          <div class="relative group">
            <span class="absolute -left-[21px] top-1.5 w-2.5 h-2.5 rounded-full bg-blue-500 border-2 border-white ring-2 ring-blue-200"></span>
            <div class="bg-slate-50 hover:bg-slate-100 p-3 rounded-2xl border border-slate-200 transition-all text-xs">
              <div class="flex justify-between items-center mb-1">
                <span class="font-bold text-navy-950">${m.title}</span>
                <span class="text-[10px] text-slate-400 font-mono">${d}</span>
              </div>
              ${m.details ? `<p class="text-slate-600 text-[11px] mt-0.5">${m.details}</p>` : ''}
            </div>
          </div>
        `;
      }).join('');

      document.getElementById('judicial-process-modal').classList.remove('hidden');
    }

    function closeJudicialProcessModal() {
      document.getElementById('judicial-process-modal').classList.add('hidden');
      selectedJudicialProcess = null;
    }

    async function quickImportJudicialProcess(processId) {
      const process = currentJudicialResults.find(p => p.id === processId);
      if (!process) return;
      selectedJudicialProcess = process;
      await importCurrentJudicialProcess();
    }

    async function importCurrentJudicialProcess() {
      if (!selectedJudicialProcess) {
        alert('Nenhum processo selecionado para importação.');
        return;
      }

      const importBtn = document.getElementById('jmodal-import-btn');
      if (importBtn) {
        importBtn.disabled = true;
        importBtn.textContent = 'Importando...';
      }

      try {
        const res = await fetch('/api/judicial/import-to-office', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
          body: JSON.stringify({
            process_data: selectedJudicialProcess
          })
        });

        const data = await res.json();

        if (res.ok && data.success) {
          alert(`🎉 ${data.message}\n\nO cliente e o processo foram cadastrados no sistema com todo o histórico de movimentações!`);
          closeJudicialProcessModal();
          loadClients();
          loadLawsuits();
        } else {
          alert(`❌ ${data.error || 'Erro ao importar processo para o escritório.'}`);
        }
      } catch (err) {
        alert('Falha de conexão com o servidor ao importar processo.');
      } finally {
        if (importBtn) {
          importBtn.disabled = false;
          importBtn.innerHTML = '<span>📥 Importar para o Escritório</span>';
        }
      }
    }

    // =========================================================================

  // ==========================================================================
  // EXPORTAÇÕES GLOBAIS PARA INTERFACE (ONCLICK & COMPATIBILIDADE)
  // ==========================================================================
  window.initJudicialTab = typeof initJudicialTab !== 'undefined' ? initJudicialTab : window.initJudicialTab;
  window.setJudicialSearchType = typeof setJudicialSearchType !== 'undefined' ? setJudicialSearchType : window.setJudicialSearchType;
  window.setJudicialSearchExample = typeof setJudicialSearchExample !== 'undefined' ? setJudicialSearchExample : window.setJudicialSearchExample;
  window.clearJudicialSearch = typeof clearJudicialSearch !== 'undefined' ? clearJudicialSearch : window.clearJudicialSearch;
  window.handleJudicialSearch = typeof handleJudicialSearch !== 'undefined' ? handleJudicialSearch : window.handleJudicialSearch;
  window.parseCnjSortKey = typeof parseCnjSortKey !== 'undefined' ? parseCnjSortKey : window.parseCnjSortKey;
  window.sortJudicialProcessesNewestFirst = typeof sortJudicialProcessesNewestFirst !== 'undefined' ? sortJudicialProcessesNewestFirst : window.sortJudicialProcessesNewestFirst;
  window.renderJudicialResults = typeof renderJudicialResults !== 'undefined' ? renderJudicialResults : window.renderJudicialResults;
  window.renderJudicialPage = typeof renderJudicialPage !== 'undefined' ? renderJudicialPage : window.renderJudicialPage;
  window.openJudicialProcessModal = typeof openJudicialProcessModal !== 'undefined' ? openJudicialProcessModal : window.openJudicialProcessModal;
  window.closeJudicialProcessModal = typeof closeJudicialProcessModal !== 'undefined' ? closeJudicialProcessModal : window.closeJudicialProcessModal;
  window.quickImportJudicialProcess = typeof quickImportJudicialProcess !== 'undefined' ? quickImportJudicialProcess : window.quickImportJudicialProcess;
  window.importCurrentJudicialProcess = typeof importCurrentJudicialProcess !== 'undefined' ? importCurrentJudicialProcess : window.importCurrentJudicialProcess;
})();
