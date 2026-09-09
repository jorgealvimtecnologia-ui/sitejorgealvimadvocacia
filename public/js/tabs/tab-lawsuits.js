/**
 * ============================================================================
 * SUBMÓDULO DESACOPLADO: MÓDULO: PROCESSOS JUDICIAIS, ANDAMENTOS (CNJ) & WHATSAPP
 * Origem: Decomposição arquitetural do painel-1-app.js
 * ============================================================================
 */

(function () {
  'use strict';

    // ================= 3. GESTÃO DE PROCESSOS JUDICIAIS & ANDAMENTOS (CNJ) =================

    function getDeadlineBadge(deadlineDate, deadlineStatus) {
      if (deadlineStatus === 'Cumprido') {
        return `<span class="inline-flex items-center space-x-1 px-2.5 py-1 rounded-md bg-emerald-50 text-emerald-800 border border-emerald-300 font-bold text-[11px]">
          <span>✓</span>
          <span>Cumprido</span>
        </span>`;
      }
      if (deadlineStatus === 'Informativo') {
        return `<span class="inline-flex items-center space-x-1 px-2.5 py-1 rounded-md bg-slate-100 text-slate-600 border border-slate-200 text-[11px]">
          <span>ℹ️</span>
          <span>Informativo</span>
        </span>`;
      }
      if (!deadlineDate) {
        return `<span class="text-slate-400 text-xs italic">Sem prazo fatal</span>`;
      }

      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const [y, m, d] = deadlineDate.split('-');
      const target = new Date(y, m - 1, d);
      target.setHours(0, 0, 0, 0);

      const diffTime = target - today;
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

      if (diffDays < 0) {
        return `<span class="inline-flex items-center space-x-1 px-2.5 py-1 rounded-md bg-rose-100 text-rose-900 border border-rose-400 font-extrabold text-[11px] animate-pulse shadow-xs">
          <span>🚨 VENCIDO</span>
          <span>(${Math.abs(diffDays)}d atrás - ${formatDate(deadlineDate)})</span>
        </span>`;
      } else if (diffDays === 0) {
        return `<span class="inline-flex items-center space-x-1 px-2.5 py-1 rounded-md bg-rose-600 text-white font-extrabold text-[11px] shadow-sm animate-bounce">
          <span>🔥 VENCE HOJE!</span>
          <span>(${formatDate(deadlineDate)})</span>
        </span>`;
      } else if (diffDays <= 3) {
        return `<span class="inline-flex items-center space-x-1 px-2.5 py-1 rounded-md bg-amber-100 text-amber-900 border border-amber-400 font-bold text-[11px] shadow-xs">
          <span>⚠️ Vence em ${diffDays} dias</span>
          <span>(${formatDate(deadlineDate)})</span>
        </span>`;
      } else if (diffDays <= 7) {
        return `<span class="inline-flex items-center space-x-1 px-2.5 py-1 rounded-md bg-amber-50 text-amber-800 border border-amber-300 font-semibold text-[11px]">
          <span>⏰ Vence em ${diffDays} dias</span>
          <span>(${formatDate(deadlineDate)})</span>
        </span>`;
      } else {
        return `<span class="inline-flex items-center space-x-1 px-2.5 py-1 rounded-md bg-slate-100 text-slate-700 border border-slate-300 text-[11px]">
          <span>📅 Prazo: ${formatDate(deadlineDate)}</span>
          <span class="text-slate-400">(${diffDays}d)</span>
        </span>`;
      }
    }

    function renderSingleLawsuitCard(law, showClientBadge = false) {
      const movements = law.movements || [];
      const movCount = movements.length;

      const statusClass = law.status === 'Julgado Procedente' 
        ? 'bg-emerald-50 text-emerald-800 border-emerald-300' 
        : (law.status === 'Aguardando Audiência' 
          ? 'bg-amber-50 text-amber-800 border-amber-300' 
          : (law.status === 'Arquivado' 
            ? 'bg-slate-100 text-slate-600 border-slate-300' 
            : 'bg-indigo-50 text-indigo-800 border-indigo-200'));

      // Link para consulta pública de tribunal
      let tribunalUrl = `https://www.google.com/search?q=consulta+processual+${encodeURIComponent(law.tribunal)}+${encodeURIComponent(law.cnj_number)}`;
      if (law.tribunal.includes('TJMG')) {
        tribunalUrl = `https://pje.tjmg.jus.br/pje/ConsultaPublica/listView.seam`;
      } else if (law.tribunal.includes('TRF6')) {
        tribunalUrl = `https://pje1g.trf6.jus.br/consultapublica/ConsultaPublica/listView.seam`;
      }

      return `
        <div class="bg-white rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition-all overflow-hidden" id="lawsuit-card-${law.id}">
          
          <!-- Cabeçalho do Processo -->
          <div class="p-4 sm:p-5 bg-gradient-to-r from-slate-50 to-white border-b border-slate-200 flex flex-col md:flex-row justify-between items-start md:items-center gap-3">
            
            <div class="space-y-1 min-w-0">
              <div class="flex flex-wrap items-center gap-2">
                <span class="px-2 py-0.5 rounded-md bg-gold-100 text-gold-900 font-mono text-[11px] font-bold border border-gold-300">
                  #${law.id}
                </span>
                <span class="px-2.5 py-0.5 rounded-md bg-indigo-50 text-indigo-800 font-bold text-xs border border-indigo-200">
                  🏛️ ${law.tribunal}
                </span>
                <span class="px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 text-xs border border-slate-200">
                  ${law.instance}
                </span>
                <span class="px-2.5 py-0.5 rounded-md font-bold text-xs border ${statusClass}">
                  ● ${law.status}
                </span>
                ${showClientBadge ? `
                  <span class="px-2.5 py-0.5 rounded-md bg-amber-50 text-amber-900 font-bold text-xs border border-amber-200">
                    👤 ${law.client_name || 'Cliente'}
                  </span>
                ` : ''}
              </div>

              <!-- CNJ e Ações Rápidas -->
              <div class="flex flex-wrap items-center gap-2 pt-1">
                <span class="text-xs text-slate-400 font-bold uppercase">CNJ:</span>
                <strong class="font-mono text-sm sm:text-base text-navy-950 tracking-wide select-all">${law.cnj_number}</strong>
                <button 
                  onclick="copyToClipboard('${law.cnj_number}', this)" 
                  class="px-2 py-0.5 rounded bg-slate-100 hover:bg-slate-200 text-slate-600 text-[10px] font-bold border border-slate-300 transition-colors"
                  title="Copiar número CNJ"
                >
                  📋 Copiar
                </button>
                <button 
                  type="button"
                  onclick="openTribunalPortal('${law.cnj_number}')" 
                  class="px-2 py-0.5 rounded bg-blue-50 hover:bg-blue-100 text-blue-700 text-[10px] font-bold border border-blue-200 inline-flex items-center space-x-1 cursor-pointer"
                  title="Copiar CNJ e abrir consulta oficial no Tribunal correspondente"
                >
                  <span>🔗 Consultar Tribunal</span>
                </button>
              </div>
            </div>

            <!-- Botões de Ação do Processo -->
            <div class="flex flex-wrap items-center gap-2 w-full md:w-auto justify-start md:justify-end">
              <button 
                onclick="openLegalDocModal('procuracao', '${law.client_id}', '${law.id}')" 
                class="inline-flex items-center space-x-1 px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-navy-950 font-bold text-xs shadow-xs transition-colors cursor-pointer border border-amber-600"
                title="Gerar Peça/Procuração vinculada a este Processo CNJ"
              >
                <span>📄</span>
                <span>Gerar Doc</span>
              </button>

              <button 
                onclick="openNewMovementModal('${law.id}')" 
                class="inline-flex items-center space-x-1 px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs shadow-xs transition-colors cursor-pointer"
                title="Adicionar movimentação, publicação ou prazo fatal"
              >
                <span>➕</span>
                <span>Novo Andamento</span>
              </button>

              <button 
                onclick="openEditLawsuitModal('${law.id}')" 
                class="inline-flex items-center space-x-1 px-3 py-1.5 rounded-xl bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 font-bold text-xs transition-colors shadow-xs cursor-pointer"
                title="Editar dados do processo"
              >
                <span>✏️</span>
                <span>Editar</span>
              </button>

              <button 
                onclick="deleteLawsuit('${law.id}', '${law.cnj_number}')" 
                class="inline-flex items-center space-x-1 px-3 py-1.5 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 font-bold text-xs transition-colors shadow-xs cursor-pointer"
                title="Excluir processo e andamentos"
              >
                <span>🗑️</span>
                <span>Excluir</span>
              </button>
            </div>

          </div>

          <!-- Detalhes do Processo (Vara, Ação, Juiz, Obs) -->
          <div class="p-4 sm:p-5 space-y-3 bg-white">
            <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 text-xs text-slate-700">
              <div>
                <span class="text-slate-400 block text-[10px] uppercase font-bold">Vara / Órgão Julgador</span>
                <strong class="text-slate-900">${law.court_branch || 'Não informada'}</strong>
              </div>
              <div>
                <span class="text-slate-400 block text-[10px] uppercase font-bold">Tipo de Ação / Assunto</span>
                <strong class="text-slate-900">${law.action_type || 'Não especificado'}</strong>
              </div>
              <div>
                <span class="text-slate-400 block text-[10px] uppercase font-bold">Data de Distribuição</span>
                <strong class="text-slate-900">${formatDate(law.distribution_date)}</strong>
              </div>
              ${law.judge_name ? `
                <div>
                  <span class="text-slate-400 block text-[10px] uppercase font-bold">Magistrado / Relator</span>
                  <strong class="text-slate-900">${law.judge_name}</strong>
                </div>
              ` : ''}
              ${law.notes ? `
                <div class="sm:col-span-2 md:col-span-3 bg-amber-50/40 p-2.5 rounded-xl border border-amber-200/70 text-slate-700">
                  <span class="text-amber-900 block text-[10px] uppercase font-bold mb-0.5">Observações Estratégicas</span>
                  <p class="text-xs italic">${law.notes}</p>
                </div>
              ` : ''}
            </div>

            <!-- Tabela / Linhas de Andamentos do Processo -->
            <div class="pt-3 border-t border-slate-100 space-y-2">
              <div class="flex items-center justify-between">
                <span class="text-slate-600 block text-xs uppercase font-bold flex items-center space-x-1.5">
                  <span>📅</span>
                  <span>Andamentos & Prazos Judiciais (${movCount}):</span>
                </span>
                <button 
                  onclick="openNewMovementModal('${law.id}')" 
                  class="text-[11px] font-bold text-indigo-600 hover:text-indigo-800 underline flex items-center space-x-1"
                >
                  <span>➕ Adicionar Linha de Andamento</span>
                </button>
              </div>

              ${movCount === 0 ? `
                <div class="p-3 bg-slate-50 rounded-xl border border-slate-200 text-center text-slate-400 text-xs italic">
                  Nenhum andamento ou prazo cadastrado ainda. Clique em <strong>[+ Novo Andamento]</strong> para registrar a primeira publicação.
                </div>
              ` : `
                <div class="space-y-2">
                  ${movements.map(mov => `
                    <div class="p-3 sm:p-3.5 rounded-xl border ${mov.deadline_status === 'Cumprido' ? 'bg-slate-50/60 border-slate-200' : 'bg-white border-slate-200 hover:border-indigo-300 shadow-xs'} transition-all flex flex-col md:flex-row justify-between items-start md:items-center gap-2.5">
                      
                      <div class="space-y-1 min-w-0 flex-1">
                        <div class="flex flex-wrap items-center gap-2">
                          <span class="font-mono text-xs font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded">
                            ${formatDate(mov.movement_date)}
                          </span>
                          <strong class="text-xs sm:text-sm text-navy-950 font-semibold">${mov.title}</strong>
                          ${getDeadlineBadge(mov.deadline_date, mov.deadline_status)}
                        </div>
                        ${mov.description ? `
                          <p class="text-xs text-slate-600 pl-1 leading-relaxed">${mov.description}</p>
                        ` : ''}
                      </div>

                      <div class="flex items-center space-x-1.5 self-end md:self-auto flex-shrink-0">
                        <!-- Botão de Notificação no WhatsApp com Autorização do Advogado -->
                        <button 
                          onclick="openAuthorizeMovementWhatsAppModal('${mov.id}')" 
                          class="px-2.5 py-1 rounded-lg text-xs font-bold transition-all flex items-center space-x-1 cursor-pointer ${mov.whatsapp_notified_at ? 'bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300' : 'bg-green-50 hover:bg-green-100 text-green-800 border border-green-300 hover:shadow-xs'}"
                          title="${mov.whatsapp_notified_at ? 'Notificação já autorizada. Clique para reenviar se desejar.' : 'Autorizar envio de notificação via WhatsApp ao cliente'}"
                        >
                          <span>${mov.whatsapp_notified_at ? '✓' : '📲'}</span>
                          <span>${mov.whatsapp_notified_at ? 'Notificado' : 'WhatsApp'}</span>
                        </button>

                        ${mov.deadline_date && mov.deadline_status !== 'Informativo' ? `
                          <button 
                            onclick="toggleMovementStatus('${mov.id}', '${mov.deadline_status}')" 
                            class="px-2.5 py-1 rounded-lg text-xs font-bold transition-colors cursor-pointer ${mov.deadline_status === 'Cumprido' ? 'bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200' : 'bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200'}"
                            title="${mov.deadline_status === 'Cumprido' ? 'Reabrir prazo como pendente' : 'Marcar prazo como cumprido / peticionado'}"
                          >
                            ${mov.deadline_status === 'Cumprido' ? '↩ Reabrir' : '✓ Marcar Cumprido'}
                          </button>
                        ` : ''}

                        <button 
                          onclick="deleteMovement('${mov.id}')" 
                          class="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer" 
                          title="Excluir andamento"
                        >
                          🗑️
                        </button>
                      </div>

                    </div>
                  `).join('')}
                </div>
              `}
            </div>

          </div>

        </div>
      `;
    }

    async function loadLawsuits() {
      try {
        const res = await fetch('/api/lawsuits', { headers: getAuthHeaders() });
        if (res.status === 401) {
          handleLogout();
          return;
        }
        const data = await res.json();
        if (data.success) {
          allLawsuits = data.lawsuits || [];
          updateLawsuitsKPIs();
          renderGlobalLawsuits(allLawsuits);
          
          // Re-renderiza clientes para atualizar os boxes de processos internos
          if (allClients.length > 0) {
            renderClients(allClients);
          }
        }
      } catch (err) {
        console.error('Erro ao carregar processos judiciais:', err);
      }
    }

    function updateLawsuitsKPIs() {
      const count = allLawsuits.length;
      document.getElementById('tab-lawsuits-count').textContent = count;

      const activeLaws = allLawsuits.filter(l => l.status !== 'Arquivado');
      document.getElementById('stat-law-total').textContent = activeLaws.length;

      // Prazos nos próximos 7 dias
      let upcomingCount = 0;
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      allLawsuits.forEach(law => {
        (law.movements || []).forEach(mov => {
          if (mov.deadline_date && mov.deadline_status === 'Pendente') {
            const [y, m, d] = mov.deadline_date.split('-');
            const target = new Date(y, m - 1, d);
            target.setHours(0, 0, 0, 0);
            const diffDays = Math.ceil((target - today) / (1000 * 60 * 60 * 24));
            if (diffDays <= 7) {
              upcomingCount++;
            }
          }
        });
      });
      document.getElementById('stat-law-deadlines').textContent = upcomingCount;

      const hearings = allLawsuits.filter(l => l.status === 'Aguardando Audiência' || (l.action_type && l.action_type.toLowerCase().includes('audiência')));
      document.getElementById('stat-law-hearings').textContent = hearings.length;

      const done = allLawsuits.filter(l => l.status === 'Julgado Procedente' || l.status === 'Arquivado');
      document.getElementById('stat-law-done').textContent = done.length;
    }

    function filterLawsuits() {
      const query = (document.getElementById('search-lawsuits-input')?.value || '').toLowerCase().trim();
      const tribunal = document.getElementById('filter-lawsuit-tribunal')?.value;
      const status = document.getElementById('filter-lawsuit-status')?.value;

      const filtered = allLawsuits.filter(l => {
        const matchesQuery = !query || 
          l.cnj_number.toLowerCase().includes(query) ||
          (l.client_name && l.client_name.toLowerCase().includes(query)) ||
          (l.tribunal && l.tribunal.toLowerCase().includes(query)) ||
          (l.court_branch && l.court_branch.toLowerCase().includes(query)) ||
          (l.action_type && l.action_type.toLowerCase().includes(query)) ||
          l.id.toLowerCase().includes(query);

        const matchesTribunal = !tribunal || tribunal === 'ALL' || l.tribunal === tribunal || (tribunal === 'OUTRO' && !['TJMG','TRF6','TRT3','JEF','STJ','STF'].includes(l.tribunal));
        const matchesStatus = !status || status === 'ALL' || l.status === status;

        return matchesQuery && matchesTribunal && matchesStatus;
      });

      renderGlobalLawsuits(filtered);
    }

    function renderGlobalLawsuits(lawsuits) {
      const container = document.getElementById('lawsuits-global-container');
      if (!container) return;

      if (lawsuits.length === 0) {
        container.innerHTML = `
          <div class="bg-white rounded-3xl border border-slate-200 p-12 text-center text-slate-400 space-y-3 shadow-sm">
            <div class="text-4xl">⚖️</div>
            <p class="font-bold text-slate-600">Nenhum processo judicial localizado no momento.</p>
            <p class="text-xs">Clique no botão <strong>➕ Novo Processo Judicial</strong> acima para cadastrar o primeiro processo com número CNJ.</p>
          </div>
        `;
        return;
      }

      container.innerHTML = `
        <div class="space-y-6">
          ${lawsuits.map(law => renderSingleLawsuitCard(law, true)).join('')}
        </div>
      `;
    }

    // Modal Processo Judicial
    function populateClientSelect(preselectedId = '') {
      const select = document.getElementById('lawsuit-client-id');
      if (!select) return;

      select.innerHTML = '<option value="">Selecione o cliente cadastrado...</option>' + 
        allClients.map(c => `
          <option value="${c.id}" ${c.id === preselectedId ? 'selected' : ''}>
            ${c.full_name} (${c.client_type === 'PJ' ? 'CNPJ: ' + (c.cnpj || '—') : 'CPF: ' + (c.cpf || '—')}) — #${c.id}
          </option>
        `).join('');
    }

    function openNewLawsuitModal(clientId = '') {
      document.getElementById('lawsuit-form').reset();
      document.getElementById('lawsuit-edit-id').value = '';
      document.getElementById('lawsuit-modal-title').textContent = 'Cadastrar Novo Processo Judicial (CNJ)';
      populateClientSelect(clientId);

      const today = new Date().toISOString().split('T')[0];
      document.getElementById('lawsuit-dist-date').value = today;

      document.getElementById('lawsuit-modal').classList.remove('hidden');
      setTimeout(() => { document.getElementById('lawsuit-cnj')?.focus(); }, 100);
    }

    function openEditLawsuitModal(id) {
      const law = allLawsuits.find(l => l.id === id);
      if (!law) return;

      document.getElementById('lawsuit-form').reset();
      document.getElementById('lawsuit-edit-id').value = law.id;
      document.getElementById('lawsuit-modal-title').textContent = `Alterar Processo Judicial (#${law.id})`;
      populateClientSelect(law.client_id);

      document.getElementById('lawsuit-client-id').value = law.client_id;
      document.getElementById('lawsuit-cnj').value = law.cnj_number;
      document.getElementById('lawsuit-tribunal').value = law.tribunal || 'TJMG';
      document.getElementById('lawsuit-instance').value = law.instance || '1ª Instância';
      document.getElementById('lawsuit-status').value = law.status || 'Em Andamento';
      document.getElementById('lawsuit-court-branch').value = law.court_branch || '';
      document.getElementById('lawsuit-action-type').value = law.action_type || '';
      document.getElementById('lawsuit-dist-date').value = law.distribution_date || '';
      document.getElementById('lawsuit-judge').value = law.judge_name || '';
      document.getElementById('lawsuit-notes').value = law.notes || '';

      document.getElementById('lawsuit-modal').classList.remove('hidden');
    }

    function closeLawsuitModal(force) {
      if (!force && typeof window.confirmDiscardModalChanges === 'function') {
        if (!window.confirmDiscardModalChanges('lawsuit-modal', 'no cadastro do processo')) return;
      }
      document.getElementById('lawsuit-modal').classList.add('hidden');
    }

    async function handleLawsuitSubmit(e) {
      e.preventDefault();
      const editId = document.getElementById('lawsuit-edit-id').value;
      const isEditing = !!editId;

      const payload = {
        client_id: document.getElementById('lawsuit-client-id').value,
        cnj_number: document.getElementById('lawsuit-cnj').value.trim(),
        tribunal: document.getElementById('lawsuit-tribunal').value,
        instance: document.getElementById('lawsuit-instance').value,
        status: document.getElementById('lawsuit-status').value,
        court_branch: document.getElementById('lawsuit-court-branch').value.trim(),
        action_type: document.getElementById('lawsuit-action-type').value.trim(),
        distribution_date: document.getElementById('lawsuit-dist-date').value,
        judge_name: document.getElementById('lawsuit-judge').value.trim(),
        notes: document.getElementById('lawsuit-notes').value.trim()
      };

      try {
        const url = isEditing ? `/api/lawsuits/${editId}` : '/api/lawsuits';
        const method = isEditing ? 'PUT' : 'POST';

        const res = await fetch(url, {
          method,
          headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
          body: JSON.stringify(payload)
        });

        const data = await res.json();
        if (res.ok && data.success) {
          if (typeof window.clearUnsavedChanges === 'function') window.clearUnsavedChanges('lawsuit-modal');
          closeLawsuitModal(true);
          await loadLawsuits();
          alert(isEditing ? '✅ Processo atualizado com sucesso!' : '✅ Processo cadastrado com sucesso!');
        } else {
          alert(data.error || 'Erro ao salvar processo.');
        }
      } catch (err) {
        alert('Erro ao conectar ao servidor.');
      }
    }

    async function deleteLawsuit(id, cnj) {
      if (!confirm(`⚠️ Deseja realmente excluir o processo CNJ "${cnj}" e todo o histórico de andamentos?`)) return;
      try {
        const res = await fetch(`/api/lawsuits/${id}`, {
          method: 'DELETE',
          headers: getAuthHeaders()
        });
        const data = await res.json();
        if (res.ok && data.success) {
          await loadLawsuits();
          alert('🗑️ Processo e andamentos excluídos com sucesso.');
        } else {
          alert(data.error || 'Erro ao excluir processo.');
        }
      } catch (err) {
        alert('Erro ao comunicar com o servidor.');
      }
    }

    // Modal Andamentos / Prazos
    function openNewMovementModal(lawsuitId) {
      const law = allLawsuits.find(l => l.id === lawsuitId);
      if (!law) return;

      document.getElementById('movement-form').reset();
      document.getElementById('movement-edit-id').value = '';
      document.getElementById('movement-lawsuit-id').value = law.id;
      document.getElementById('movement-lawsuit-info').textContent = `Processo: ${law.cnj_number} (${law.tribunal}) • Cliente: ${law.client_name || 'Cliente'}`;

      const today = new Date().toISOString().split('T')[0];
      document.getElementById('movement-date').value = today;
      document.getElementById('movement-deadline-status').value = 'Pendente';

      document.getElementById('movement-modal').classList.remove('hidden');
      setTimeout(() => { document.getElementById('movement-title')?.focus(); }, 100);
    }

    function closeMovementModal(force) {
      if (!force && typeof window.confirmDiscardModalChanges === 'function') {
        if (!window.confirmDiscardModalChanges('movement-modal', 'no andamento processual')) return;
      }
      document.getElementById('movement-modal').classList.add('hidden');
    }

    async function handleMovementSubmit(e) {
      e.preventDefault();
      const lawsuitId = document.getElementById('movement-lawsuit-id').value;
      const editId = document.getElementById('movement-edit-id').value;
      const isEditing = !!editId;

      const payload = {
        movement_date: document.getElementById('movement-date').value,
        title: document.getElementById('movement-title').value.trim(),
        deadline_date: document.getElementById('movement-deadline-date').value,
        deadline_status: document.getElementById('movement-deadline-status').value,
        description: document.getElementById('movement-desc').value.trim()
      };

      try {
        const url = isEditing 
          ? `/api/lawsuits/movements/${editId}` 
          : `/api/lawsuits/${lawsuitId}/movements`;
        const method = isEditing ? 'PUT' : 'POST';

        const res = await fetch(url, {
          method,
          headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
          body: JSON.stringify(payload)
        });

        const data = await res.json();
        if (res.ok && data.success) {
          if (typeof window.clearUnsavedChanges === 'function') window.clearUnsavedChanges('movement-modal');
          closeMovementModal(true);
          await loadLawsuits();
          const newMovementId = data.movementId || editId;
          if (!isEditing && newMovementId) {
            if (confirm('✅ Andamento registrado com sucesso!\n\nDeseja autorizar o envio de notificação no WhatsApp para o cliente agora?')) {
              openAuthorizeMovementWhatsAppModal(newMovementId);
            }
          } else {
            alert('✅ Andamento atualizado com sucesso!');
          }
        } else {
          alert(data.error || 'Erro ao registrar andamento.');
        }
      } catch (err) {
        alert('Erro ao conectar com o servidor.');
      }
    }

    async function toggleMovementStatus(movementId, currentStatus) {
      const newStatus = currentStatus === 'Cumprido' ? 'Pendente' : 'Cumprido';
      try {
        const res = await fetch(`/api/lawsuits/movements/${movementId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
          body: JSON.stringify({ deadline_status: newStatus })
        });
        const data = await res.json();
        if (res.ok && data.success) {
          await loadLawsuits();
        } else {
          alert(data.error || 'Erro ao alterar status do prazo.');
        }
      } catch (err) {
        alert('Erro ao comunicar com o servidor.');
      }
    }

    async function deleteMovement(movementId) {
      if (!confirm('Deseja realmente excluir este andamento do processo?')) return;
      try {
        const res = await fetch(`/api/lawsuits/movements/${movementId}`, {
          method: 'DELETE',
          headers: getAuthHeaders()
        });
        const data = await res.json();
        if (res.ok && data.success) {
          await loadLawsuits();
        } else {
          alert(data.error || 'Erro ao excluir andamento.');
        }
      } catch (err) {
        alert('Erro ao comunicar com o servidor.');
      }
    }

    // =============================================================================
    // 📲 AUTORIZAÇÃO DE NOTIFICAÇÃO NO WHATSAPP PARA O CLIENTE (COM APROVAÇÃO DO ADVOGADO)
    // =============================================================================

    let currentNotifMovementId = null;

    window.openAuthorizeMovementWhatsAppModal = async function(movementId) {
      currentNotifMovementId = movementId;
      let modal = document.getElementById('movement-whatsapp-auth-modal');
      if (!modal) {
        createMovementWhatsAppAuthModal();
        modal = document.getElementById('movement-whatsapp-auth-modal');
      }

      modal.classList.remove('hidden');
      document.getElementById('mwa-client-name').textContent = 'Carregando dados...';
      document.getElementById('mwa-process-cnj').textContent = '...';
      document.getElementById('mwa-message-preview').value = 'Carregando mensagem estruturada...';

      try {
        const res = await fetch(`/api/lawsuits/movements/${movementId}/preview-whatsapp`, {
          headers: getAuthHeaders()
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Erro ao carregar pré-visualização.');

        document.getElementById('mwa-client-name').textContent = data.clientName;
        document.getElementById('mwa-process-cnj').textContent = data.cnj_number || 'Sem número CNJ';
        document.getElementById('mwa-phone-input').value = data.clientPhone || '';
        document.getElementById('mwa-message-preview').value = data.suggestedMessage || '';

        const statusBadge = document.getElementById('mwa-status-badge');
        if (data.whatsapp_notified_at) {
          statusBadge.textContent = '✓ Já notificado anteriormente';
          statusBadge.className = 'px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-900 border border-amber-300';
        } else {
          statusBadge.textContent = 'Aguardando sua autorização';
          statusBadge.className = 'px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-100 text-indigo-900 border border-indigo-300';
        }
      } catch (err) {
        alert('Erro ao carregar notificação: ' + err.message);
        closeAuthorizeMovementWhatsAppModal();
      }
    };

    window.closeAuthorizeMovementWhatsAppModal = function() {
      const modal = document.getElementById('movement-whatsapp-auth-modal');
      if (modal) modal.classList.add('hidden');
    };

    window.handleConfirmAuthorizeWhatsApp = async function() {
      if (!currentNotifMovementId) return;

      const phone = document.getElementById('mwa-phone-input').value.trim();
      const message = document.getElementById('mwa-message-preview').value.trim();

      if (!phone) {
        alert('Por favor, informe o WhatsApp do cliente para envio.');
        return;
      }
      if (!message) {
        alert('A mensagem de notificação não pode ficar em branco.');
        return;
      }

      const btn = document.getElementById('btn-confirm-authorize-whatsapp');
      const origText = btn.innerHTML;
      btn.disabled = true;
      btn.innerHTML = '<span class="inline-block animate-spin mr-1">⏳</span> Autorizando...';

      try {
        const res = await fetch(`/api/lawsuits/movements/${currentNotifMovementId}/authorize-whatsapp`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
          body: JSON.stringify({ phone, message })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Falha ao autorizar.');

        alert('✅ Notificação autorizada pelo advogado! Abrindo WhatsApp com o cliente...');
        window.open(data.whatsapp_link, '_blank');
        closeAuthorizeMovementWhatsAppModal();
        await loadLawsuits();
      } catch (err) {
        alert('Erro ao autorizar disparo: ' + err.message);
      } finally {
        btn.disabled = false;
        btn.innerHTML = origText;
      }
    };

    function createMovementWhatsAppAuthModal() {
      const div = document.createElement('div');
      div.id = 'movement-whatsapp-auth-modal';
      div.className = 'fixed inset-0 z-50 flex items-center justify-center p-4 bg-navy-950/70 backdrop-blur-xs hidden';
      div.innerHTML = `
        <div class="bg-white rounded-3xl max-w-xl w-full shadow-2xl border border-slate-200 flex flex-col overflow-hidden animate-scale-up">
          <div class="p-5 border-b border-slate-200 flex items-center justify-between bg-slate-50">
            <div class="flex items-center space-x-3 min-w-0">
              <div class="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 border border-emerald-300 flex items-center justify-center text-xl flex-shrink-0">
                📲
              </div>
              <div class="min-w-0">
                <div class="flex items-center space-x-2">
                  <h3 class="font-serif font-bold text-base text-navy-950">
                    Autorizar Notificação no WhatsApp
                  </h3>
                  <span id="mwa-status-badge" class="px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-100 text-indigo-900 border border-indigo-300 flex-shrink-0">
                    Aguardando sua autorização
                  </span>
                </div>
                <p class="text-xs text-slate-500 mt-0.5 truncate">
                  Cliente: <span id="mwa-client-name" class="font-bold text-slate-700"></span> • CNJ: <span id="mwa-process-cnj" class="font-mono"></span>
                </p>
              </div>
            </div>
            <button onclick="closeAuthorizeMovementWhatsAppModal()" class="text-slate-400 hover:text-slate-600 p-2 rounded-xl hover:bg-slate-100 text-lg cursor-pointer">✕</button>
          </div>

          <div class="p-5 sm:p-6 space-y-4 text-xs">
            <div class="p-3 bg-amber-50/90 rounded-xl border border-amber-200 text-amber-900 leading-relaxed">
              <strong>🔒 Controle Ético & Profissional:</strong> A notificação só é enviada após a sua autorização expressa. Você pode revisar, adicionar notas ou editar a mensagem abaixo antes de abrir a conversa.
            </div>

            <div>
              <label class="block font-bold text-slate-700 uppercase tracking-wider mb-1">
                WhatsApp do Cliente (com DDD):
              </label>
              <input type="text" id="mwa-phone-input" class="w-full px-3.5 py-2 rounded-xl border border-slate-300 font-mono text-xs focus:ring-2 focus:ring-emerald-500 focus:outline-none" />
            </div>

            <div>
              <label class="block font-bold text-slate-700 uppercase tracking-wider mb-1">
                Mensagem Amigável (Sem Juridiquês):
              </label>
              <textarea id="mwa-message-preview" rows="8" class="w-full px-3.5 py-2 rounded-xl border border-slate-300 text-xs font-mono leading-relaxed focus:ring-2 focus:ring-emerald-500 focus:outline-none resize-none"></textarea>
            </div>
          </div>

          <div class="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-end space-x-2">
            <button onclick="closeAuthorizeMovementWhatsAppModal()" class="px-4 py-2 rounded-xl text-slate-600 hover:text-slate-800 font-bold text-xs cursor-pointer">
              Cancelar
            </button>
            <button id="btn-confirm-authorize-whatsapp" onclick="handleConfirmAuthorizeWhatsApp()" class="px-5 py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white font-bold text-xs shadow-md transition-all flex items-center space-x-2 cursor-pointer border border-emerald-500">
              <span>✅</span>
              <span>Autorizar & Disparar no WhatsApp</span>
            </button>
          </div>
        </div>
      `;
      document.body.appendChild(div);
    }

    // =============================================================================

  // ==========================================================================
  // EXPORTAÇÕES GLOBAIS PARA INTERFACE (ONCLICK & COMPATIBILIDADE)
  // ==========================================================================
  window.getDeadlineBadge = typeof getDeadlineBadge !== 'undefined' ? getDeadlineBadge : window.getDeadlineBadge;
  window.renderSingleLawsuitCard = typeof renderSingleLawsuitCard !== 'undefined' ? renderSingleLawsuitCard : window.renderSingleLawsuitCard;
  window.loadLawsuits = typeof loadLawsuits !== 'undefined' ? loadLawsuits : window.loadLawsuits;
  window.updateLawsuitsKPIs = typeof updateLawsuitsKPIs !== 'undefined' ? updateLawsuitsKPIs : window.updateLawsuitsKPIs;
  window.filterLawsuits = typeof filterLawsuits !== 'undefined' ? filterLawsuits : window.filterLawsuits;
  window.renderGlobalLawsuits = typeof renderGlobalLawsuits !== 'undefined' ? renderGlobalLawsuits : window.renderGlobalLawsuits;
  window.populateClientSelect = typeof populateClientSelect !== 'undefined' ? populateClientSelect : window.populateClientSelect;
  window.openNewLawsuitModal = typeof openNewLawsuitModal !== 'undefined' ? openNewLawsuitModal : window.openNewLawsuitModal;
  window.openEditLawsuitModal = typeof openEditLawsuitModal !== 'undefined' ? openEditLawsuitModal : window.openEditLawsuitModal;
  window.closeLawsuitModal = typeof closeLawsuitModal !== 'undefined' ? closeLawsuitModal : window.closeLawsuitModal;
  window.handleLawsuitSubmit = typeof handleLawsuitSubmit !== 'undefined' ? handleLawsuitSubmit : window.handleLawsuitSubmit;
  window.deleteLawsuit = typeof deleteLawsuit !== 'undefined' ? deleteLawsuit : window.deleteLawsuit;
  window.openNewMovementModal = typeof openNewMovementModal !== 'undefined' ? openNewMovementModal : window.openNewMovementModal;
  window.closeMovementModal = typeof closeMovementModal !== 'undefined' ? closeMovementModal : window.closeMovementModal;
  window.handleMovementSubmit = typeof handleMovementSubmit !== 'undefined' ? handleMovementSubmit : window.handleMovementSubmit;
  window.toggleMovementStatus = typeof toggleMovementStatus !== 'undefined' ? toggleMovementStatus : window.toggleMovementStatus;
  window.deleteMovement = typeof deleteMovement !== 'undefined' ? deleteMovement : window.deleteMovement;
  window.createMovementWhatsAppAuthModal = typeof createMovementWhatsAppAuthModal !== 'undefined' ? createMovementWhatsAppAuthModal : window.createMovementWhatsAppAuthModal;
})();
