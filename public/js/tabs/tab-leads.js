/**
 * ============================================================================
 * SUBMÓDULO DESACOPLADO: MÓDULO: GESTÃO DE LEADS & CAPTAÇÃO
 * Origem: Decomposição arquitetural do painel-1-app.js
 * ============================================================================
 */

(function () {
  'use strict';

    // ================= 3. GESTÃO DE LEADS =================

    async function loadLeads() {
      try {
        const response = await fetch('/api/leads', { headers: getAuthHeaders() });
        if (response.status === 401) {
          handleLogout();
          return;
        }
        const data = await response.json();
        if (data.success) {
          allLeads = data.leads;
          renderLeads(allLeads);
          updateLeadsStats(allLeads);
        }
      } catch (err) {
        console.error('Erro ao carregar leads:', err);
      }
    }

    function updateLeadsStats(leads) {
      document.getElementById('stat-total').textContent = leads.length;
      document.getElementById('stat-novos').textContent = leads.filter(l => l.status === 'Novo').length;
      document.getElementById('stat-andamento').textContent = leads.filter(l => l.status === 'Em Atendimento').length;
      
      let totalDocs = 0;
      leads.forEach(l => { totalDocs += (l.files || []).length; });
      document.getElementById('stat-docs').textContent = totalDocs;
      document.getElementById('leads-count-badge').textContent = `${leads.length} registros`;
      document.getElementById('tab-leads-count').textContent = leads.length;
    }

    function renderLeads(leads) {
      const tbody = document.getElementById('leads-table-body');
      if (leads.length === 0) {
        tbody.innerHTML = `
          <tr>
            <td colspan="8" class="text-center py-12 text-slate-400">
              Nenhum atendimento registrado no momento.
            </td>
          </tr>
        `;
        return;
      }

      tbody.innerHTML = leads.map(lead => {
        const dateObj = new Date(lead.created_at);
        const formattedDate = dateObj.toLocaleDateString('pt-BR') + ' ' + dateObj.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
        const cleanPhone = lead.phone.replace(/\D/g, '');

        const filesHtml = (lead.files && lead.files.length > 0)
          ? `<div class="space-y-1">
              <span class="inline-block px-2 py-0.5 rounded bg-indigo-50 text-indigo-700 text-[11px] font-bold">
                📁 ${lead.files.length} anexo(s)
              </span>
              <div class="flex flex-col gap-1 text-xs">
                ${lead.files.map(f => `
                  <a href="${f.url}" target="_blank" download class="text-gold-700 hover:text-gold-800 underline truncate max-w-[180px] block font-semibold" title="${f.originalName}">
                    📄 ${f.originalName}
                  </a>
                `).join('')}
              </div>
            </div>`
          : `<span class="text-xs text-slate-400">Sem anexos</span>`;

        const originLabel = lead.origin ? `${lead.origin}${lead.origin_detail ? ' (' + lead.origin_detail + ')' : ''}` : 'Formulário Site';
        const originBadge = lead.origin
          ? `<span class="inline-block px-1.5 py-0.5 rounded text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200 mt-1" title="${originLabel}">📍 ${lead.origin}</span>`
          : `<span class="inline-block px-1.5 py-0.5 rounded text-[10px] font-medium bg-slate-100 text-slate-500 mt-1">Formulário Site</span>`;

        return `
          <tr class="hover:bg-slate-50 transition-colors">
            <td class="px-4 sm:px-6 py-3 sm:py-4 font-mono font-bold text-navy-950 text-xs whitespace-nowrap">
              <span class="px-2.5 py-1 rounded-md bg-gold-50 text-gold-800 border border-gold-300">
                #${lead.id}
              </span>
            </td>
            <td class="px-4 sm:px-6 py-3 sm:py-4 text-xs text-slate-500 whitespace-nowrap">
              ${formattedDate}
            </td>
            <td class="px-4 sm:px-6 py-3 sm:py-4 min-w-[160px]">
              <div class="font-bold text-navy-950">${lead.name}</div>
              <div class="flex items-center space-x-2 mt-0.5">
                <span class="text-xs text-slate-500">${lead.phone}</span>
                <a href="https://wa.me/55${cleanPhone}?text=Ol%C3%A1%2C%20${encodeURIComponent(lead.name)}!%20Referente%20ao%20seu%20atendimento%20protocolo%20%23${lead.id}%20no%20escrit%C3%B3rio%20Jorge%20Alvim%20Advocacia." target="_blank" class="text-emerald-600 hover:text-emerald-700 text-xs font-bold whitespace-nowrap">
                  💬 WhatsApp
                </a>
              </div>
              ${originBadge}
            </td>
            <td class="px-4 sm:px-6 py-3 sm:py-4 text-xs font-semibold text-slate-700">
              ${lead.area}
            </td>
            <td class="px-4 sm:px-6 py-3 sm:py-4">
              ${filesHtml}
            </td>
            <td class="px-4 sm:px-6 py-3 sm:py-4 whitespace-nowrap">
              <select onchange="updateLeadStatus('${lead.id}', this.value)" class="text-xs font-bold px-2 py-1 rounded-lg border focus:outline-none ${getStatusClass(lead.status)}">
                <option value="Novo" ${lead.status === 'Novo' ? 'selected' : ''}>Novo</option>
                <option value="Em Atendimento" ${lead.status === 'Em Atendimento' ? 'selected' : ''}>Em Atendimento</option>
                <option value="Concluído" ${lead.status === 'Concluído' ? 'selected' : ''}>Concluído</option>
                <option value="Arquivado" ${lead.status === 'Arquivado' ? 'selected' : ''}>Arquivado</option>
              </select>
            </td>
            <td class="px-4 sm:px-6 py-3 sm:py-4 min-w-[180px]">
              <div class="text-xs font-bold text-navy-950">
                ${lead.responsible_lawyer_name ? '⚖️ ' + lead.responsible_lawyer_name : '<span class="text-slate-400 font-normal">Sem responsável</span>'}
              </div>
              ${lead.assigned_secretary_name ? `<div class="text-[11px] text-slate-500">🗂️ ${lead.assigned_secretary_name}</div>` : ''}
              ${leadStageSelectHtml(lead.id, lead.stage)}
            </td>
            <td class="px-4 sm:px-6 py-3 sm:py-4 text-right space-x-1 sm:space-x-2 whitespace-nowrap">
              <button onclick="viewLeadDetails('${lead.id}')" class="px-2.5 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-lg text-xs font-bold shadow-xs inline-flex items-center space-x-1" title="Abrir Ficha de Atendimento & Anotações">
                <span>📝</span>
                <span>Ficha & Notas</span>
              </button>
              <button onclick="convertLeadToClient('${lead.id}')" class="px-2 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300 rounded-lg text-xs font-bold shadow-xs inline-flex items-center space-x-1" title="Converter Atendimento em Cliente Cadastrado (Preenchimento Automático)">
                <span>🚀</span>
                <span>Converter</span>
              </button>
              <button onclick="deleteLead('${lead.id}')" class="p-1.5 text-rose-500 hover:text-rose-700 hover:bg-rose-50 rounded-md" title="Excluir Registro">
                🗑️
              </button>
            </td>
          </tr>
          <tr id="lead-timeline-${lead.id}" class="hidden bg-slate-50/60">
            <td colspan="8" class="px-4 sm:px-6 py-3">
              <div class="text-[11px] font-black uppercase tracking-wider text-slate-400 mb-1">🕑 Histórico do lead #${lead.id}</div>
              <div id="lead-timeline-cell-${lead.id}" data-loaded="0"></div>
            </td>
          </tr>
        `;
      }).join('');
    }

    function getStatusClass(status) {
      if (status === 'Novo') return 'bg-emerald-50 text-emerald-700 border-emerald-300';
      if (status === 'Em Atendimento') return 'bg-amber-50 text-amber-700 border-amber-300';
      if (status === 'Concluído') return 'bg-blue-50 text-blue-700 border-blue-300';
      return 'bg-slate-100 text-slate-600 border-slate-300';
    }

    // Gestão de Leads v2: vocabulário de estágios do cadastro (lead → cliente).
    const LEAD_STAGE_OPTIONS = [
      ['recebido', '📥 Recebido'],
      ['distribuido', '📤 Distribuído'],
      ['em_cadastro', '📝 Em cadastro'],
      ['falta_documento', '🟠 Falta documento'],
      ['falta_dados', '🟠 Falta dados'],
      ['aguardando_assinatura', '✍️ Aguardando assinatura'],
      ['em_analise_chefe', '⚖️ Em Análise Dr. Jorge'],
      ['concluido', '🟢 Cadastro concluído'],
      ['desistiu', '⚫ Cliente desistiu'],
      ['outros', '❔ Outros']
    ];

    function leadStageSelectHtml(leadId, stage) {
      const cur = stage || 'recebido';
      const opts = LEAD_STAGE_OPTIONS.map(function (o) {
        return '<option value="' + o[0] + '"' + (o[0] === cur ? ' selected' : '') + '>' + o[1] + '</option>';
      }).join('');
      return '<select onchange="updateLeadStage(\'' + leadId + '\', this.value)" class="mt-1 w-full text-[11px] font-semibold px-2 py-1 rounded-lg border border-slate-200 bg-white focus:outline-none">' + opts + '</select>';
    }

    // Atualiza o estágio do cadastro do lead (advogado, secretária ou mestre).
    async function updateLeadStage(id, stage) {
      try {
        const res = await fetch('/api/leads/' + encodeURIComponent(id) + '/stage', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + (localStorage.getItem('ja_admin_token') || '') },
          body: JSON.stringify({ stage })
        });
        const data = await res.json();
        if (!res.ok || !data.success) {
          alert(data.error || 'Falha ao atualizar o estágio.');
          return;
        }
        if (typeof window.wmToast === 'function') window.wmToast('Estágio atualizado: ' + stage);
      } catch (e) {
        alert('Erro de conexão ao atualizar o estágio.');
      }
    }
    window.updateLeadStage = updateLeadStage;

    // Histórico expansível (linha do tempo) por lead.
    async function toggleLeadTimeline(id) {
      const row = document.getElementById('lead-timeline-' + id);
      if (!row) return;
      const cell = document.getElementById('lead-timeline-cell-' + id);
      const willShow = row.classList.contains('hidden');
      row.classList.toggle('hidden');
      if (willShow && cell && cell.getAttribute('data-loaded') !== '1') {
        cell.innerHTML = '<span class="text-xs text-slate-400">Carregando histórico…</span>';
        try {
          const res = await fetch('/api/leads/' + encodeURIComponent(id) + '/events', {
            headers: { 'Authorization': 'Bearer ' + (localStorage.getItem('ja_admin_token') || '') }
          });
          const data = await res.json();
          const events = (data && data.events) || [];
          cell.setAttribute('data-loaded', '1');
          if (!events.length) {
            cell.innerHTML = '<span class="text-xs text-slate-400">Sem eventos registrados ainda.</span>';
            return;
          }
          cell.innerHTML = '<ol class="relative border-l-2 border-slate-200 ml-2 space-y-2 py-1">' +
            events.map(function (ev) {
              const when = ev.created_at ? new Date(ev.created_at).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '';
              const detail = (ev.detail || ev.event_type || '').replace(/</g, '&lt;').replace(/>/g, '&gt;');
              const who = (ev.performed_by || 'sistema').replace(/</g, '&lt;').replace(/>/g, '&gt;');
              return '<li class="ml-3 text-xs"><span class="absolute -left-[7px] w-3 h-3 rounded-full bg-gold-400 border-2 border-white"></span>' +
                '<span class="font-semibold text-navy-950">' + detail + '</span>' +
                '<span class="text-slate-400"> — ' + when + ' · ' + who + '</span></li>';
            }).join('') + '</ol>';
        } catch (e) {
          cell.innerHTML = '<span class="text-xs text-rose-500">Falha ao carregar o histórico.</span>';
        }
      }
    }
    window.toggleLeadTimeline = toggleLeadTimeline;

    function filterLeads() {
      const search = document.getElementById('search-input').value.toLowerCase().trim();
      const area = document.getElementById('filter-area').value;
      const status = document.getElementById('filter-status').value;

      const filtered = allLeads.filter(l => {
        const matchesSearch = !search || l.id.toLowerCase().includes(search) || l.name.toLowerCase().includes(search) || l.phone.includes(search);
        const matchesArea = !area || l.area === area;
        const matchesStatus = !status || l.status === status;
        return matchesSearch && matchesArea && matchesStatus;
      });

      renderLeads(filtered);
      document.getElementById('leads-count-badge').textContent = `${filtered.length} registros filtrados`;
    }

    async function updateLeadStatus(id, newStatus) {
      try {
        const res = await fetch(`/api/leads/${id}/status`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
          body: JSON.stringify({ status: newStatus })
        });
        if (res.ok) {
          const item = allLeads.find(l => l.id === id);
          if (item) item.status = newStatus;
          updateLeadsStats(allLeads);
        } else {
          alert('Erro ao atualizar status.');
        }
      } catch (err) {
        alert('Erro ao atualizar status.');
      }
    }

    async function deleteLead(id) {
      if (!confirm(`Deseja realmente excluir o atendimento protocolo #${id}?`)) return;
      try {
        const res = await fetch(`/api/leads/${id}`, { 
          method: 'DELETE',
          headers: getAuthHeaders()
        });
        if (res.ok) {
          allLeads = allLeads.filter(l => l.id !== id);
          filterLeads();
          updateLeadsStats(allLeads);
        } else {
          alert('Erro ao excluir registro.');
        }
      } catch (err) {
        alert('Erro ao excluir registro.');
      }
    }

    function escapeLeadHtml(str) {
      return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    async function viewLeadDetails(id) {
      const lead = allLeads.find(l => l.id === id);
      if (!lead) return;

      let modal = document.getElementById('lead-attendant-sheet-modal');
      if (!modal) {
        modal = document.createElement('div');
        modal.id = 'lead-attendant-sheet-modal';
        modal.className = 'fixed inset-0 z-[999999] bg-slate-900/40 backdrop-blur-2xs flex items-center justify-center p-3 sm:p-5 overflow-y-auto';
        modal.style.zIndex = '999999';
        document.body.appendChild(modal);
      }

      const cleanPhone = (lead.phone || '').replace(/\D/g, '');
      const waUrl = cleanPhone ? `https://wa.me/55${cleanPhone}?text=${encodeURIComponent('Olá, ' + lead.name + '! Entramos em contato do escritório Jorge Alvim Advocacia.')}` : null;
      const originDisplay = lead.origin ? `${lead.origin}${lead.origin_detail ? ' (' + lead.origin_detail + ')' : ''}` : 'Formulário do Site (Orgânico)';

      modal.innerHTML = `
        <div class="bg-white rounded-3xl max-w-2xl w-full p-5 sm:p-6 shadow-2xl border border-slate-200 text-slate-800 space-y-4 max-h-[92vh] overflow-y-auto custom-scroll">
          
          <!-- TOPO CLARO -->
          <div class="flex items-start justify-between pb-3 border-b border-slate-200">
            <div>
              <div class="flex items-center gap-2">
                <span class="px-2.5 py-0.5 rounded-md bg-amber-50 text-amber-900 border border-amber-300 font-bold text-xs">
                  #${lead.id}
                </span>
                <span class="px-2.5 py-0.5 rounded-md bg-blue-50 text-blue-800 border border-blue-200 font-bold text-xs">
                  📍 ${originDisplay}
                </span>
                ${lead.stage === 'em_analise_chefe' ? '<span class="px-2.5 py-0.5 rounded-md bg-amber-100 text-amber-900 border border-amber-300 font-black text-xs">⚖️ Em Análise Dr. Jorge</span>' : ''}
              </div>
              <h3 class="text-lg sm:text-xl font-black text-slate-900 mt-1">${escapeLeadHtml(lead.name)}</h3>
              <div class="text-xs text-slate-500 mt-0.5 flex items-center gap-2">
                <span>📞 ${escapeLeadHtml(lead.phone)}</span>
                ${waUrl ? `<a href="${waUrl}" target="_blank" class="text-emerald-600 hover:text-emerald-700 font-bold">💬 WhatsApp</a>` : ''}
                <span>• 📅 ${new Date(lead.created_at).toLocaleString('pt-BR')}</span>
              </div>
            </div>
            <button onclick="window.closeLeadAttendanceModal()" class="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold text-lg leading-none cursor-pointer">
              &times;
            </button>
          </div>

          <!-- MENSAGEM & ANEXOS -->
          <div class="bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs space-y-1">
            <div class="font-bold text-slate-700">Área Informada: <span class="text-indigo-900 font-bold">${escapeLeadHtml(lead.area || 'Geral')}</span></div>
            <div class="text-slate-600 whitespace-pre-wrap">${escapeLeadHtml(lead.message || 'Nenhuma mensagem escrita no formulário.')}</div>
            ${lead.files && lead.files.length > 0 ? `
              <div class="pt-2 border-t border-slate-200 mt-2 flex flex-wrap gap-2">
                ${lead.files.map(f => `<a href="${f.url}" target="_blank" download class="px-2 py-1 bg-white border border-slate-300 rounded text-slate-700 font-semibold hover:text-indigo-700 text-xs">📄 ${escapeLeadHtml(f.originalName || 'Anexo')}</a>`).join('')}
              </div>
            ` : ''}
          </div>

          <!-- QUALIFICAÇÃO & ADVOGADO RESPONSÁVEL -->
          <div class="bg-white border border-slate-200 rounded-xl p-3 space-y-2 shadow-2xs">
            <h4 class="text-xs font-black text-indigo-900 uppercase tracking-wide flex items-center gap-1.5">
              <span>⚖️</span> Qualificação & Advogado Responsável
            </h4>
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
              <div>
                <label class="block text-[11px] font-bold text-slate-600 mb-0.5">Advogado Titular Responsável:</label>
                <select id="lead-modal-lawyer" class="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 text-xs text-slate-800 font-semibold">
                  <option value="Dr. Jorge Alvim (OAB/MG 222.943)" ${lead.responsible_lawyer_name?.includes('Jorge') ? 'selected' : ''}>Dr. Jorge Alvim (OAB/MG 222.943)</option>
                  <option value="Dra. Mari Alvim (Advogada Associada)" ${lead.responsible_lawyer_name?.includes('Mari') ? 'selected' : ''}>Dra. Mari Alvim (Advogada Associada)</option>
                  <option value="" ${!lead.responsible_lawyer_name ? 'selected' : ''}>-- Selecionar Advogado --</option>
                </select>
              </div>
              <div>
                <label class="block text-[11px] font-bold text-slate-600 mb-0.5">Área Específica / Objeto:</label>
                <input type="text" id="lead-modal-area" value="${escapeLeadHtml(lead.area || '')}" class="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 text-xs text-slate-800" />
              </div>
            </div>
          </div>

          <!-- CAIXA DE ANOTAÇÕES DO ATENDENTE -->
          <div class="bg-white border border-slate-200 rounded-xl p-3.5 space-y-2 shadow-2xs">
            <div class="flex items-center justify-between">
              <h4 class="text-xs font-black text-amber-900 uppercase tracking-wide flex items-center gap-1.5">
                <span>📝</span> Caixa de Anotações do Atendente
              </h4>
              <span class="text-[10px] text-slate-400">Gravado no histórico do lead</span>
            </div>
            <textarea id="lead-modal-note-text" rows="2" placeholder="Digite aqui qualquer informação necessária sobre a conversa, detalhes do caso, pedidos do cliente, documentos pendentes..." class="w-full bg-slate-50 border border-slate-300 rounded-xl p-2.5 text-xs text-slate-800 placeholder-slate-400 focus:outline-hidden focus:bg-white focus:border-amber-600"></textarea>
            <div class="flex items-center justify-between">
              <label class="text-[11px] text-slate-600 flex items-center gap-1 cursor-pointer font-medium">
                <input type="checkbox" id="lead-modal-note-urgent" class="rounded border-slate-300 text-amber-600" />
                <span>Marcar como Urgente</span>
              </label>
              <button type="button" onclick="window.saveLeadNote('${lead.id}')" class="px-3.5 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-extrabold text-xs shadow-xs cursor-pointer transition-colors flex items-center gap-1">
                <span>💾</span> <span>Salvar Anotação</span>
              </button>
            </div>

            <!-- TIMELINE DE ANOTAÇÕES -->
            <div class="pt-2 border-t border-slate-100 space-y-1.5" id="lead-modal-timeline">
              <div class="text-[11px] text-slate-400 italic">Carregando histórico…</div>
            </div>
          </div>

          <!-- RODAPÉ DE AÇÕES E FINALIZAÇÃO -->
          <div class="pt-3 border-t border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <button type="button" onclick="window.closeLeadAttendanceModal()" class="px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs cursor-pointer">
              Fechar
            </button>
            <div class="flex items-center gap-2">
              <button type="button" onclick="convertLeadToClient('${lead.id}'); window.closeLeadAttendanceModal();" class="px-3.5 py-2 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300 font-bold text-xs cursor-pointer shadow-2xs">
                🏆 Converter em Cliente
              </button>
              <button type="button" onclick="window.submitLeadToChief('${lead.id}')" class="px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-black text-xs shadow-xs cursor-pointer transition-all flex items-center gap-1">
                <span>🚀</span> <span>Enviar p/ Análise do Dr. Jorge</span>
              </button>
            </div>
          </div>

        </div>
      `;

      modal.classList.remove('hidden');
      loadLeadAttendanceTimeline(lead.id);
    }

    function closeLeadAttendanceModal() {
      const modal = document.getElementById('lead-attendant-sheet-modal');
      if (modal) modal.classList.add('hidden');
    }

    async function loadLeadAttendanceTimeline(id) {
      const container = document.getElementById('lead-modal-timeline');
      if (!container) return;
      try {
        const res = await fetch('/api/leads/' + encodeURIComponent(id) + '/events', {
          headers: getAuthHeaders()
        });
        const data = await res.json();
        const events = (data && data.events) || [];
        if (!events.length) {
          container.innerHTML = '<span class="text-xs text-slate-400">Nenhuma anotação registrada ainda.</span>';
          return;
        }
        container.innerHTML = '<div class="space-y-2">' +
          events.slice().reverse().map(ev => {
            const when = ev.created_at ? new Date(ev.created_at).toLocaleString('pt-BR') : '';
            const who = escapeLeadHtml(ev.performed_by || 'Sistema');
            const isNote = ev.event_type === 'anotacao_atendente';
            const isChief = ev.event_type === 'analise_chefe' || ev.event_type === 'aprovado_chefe';
            const isUrgent = (ev.detail || '').includes('[URGENTE]');
            
            let bgClass = 'bg-slate-50 border-slate-200';
            let badgeClass = 'text-slate-600 font-bold';
            if (isUrgent) {
              bgClass = 'bg-rose-50 border-rose-200';
              badgeClass = 'text-rose-700 font-black';
            } else if (isChief) {
              bgClass = 'bg-amber-50 border-amber-200';
              badgeClass = 'text-amber-900 font-black';
            } else if (isNote) {
              bgClass = 'bg-amber-50/40 border-amber-200/60';
              badgeClass = 'text-amber-900 font-bold';
            }

            return `<div class="p-2.5 rounded-xl border ${bgClass} text-xs">
              <div class="flex items-center justify-between text-[10px] pb-1 border-b border-slate-200/50 mb-1">
                <span class="${badgeClass}">${who}</span>
                <span class="text-slate-400">${when}</span>
              </div>
              <p class="text-slate-700 font-medium">${escapeLeadHtml(ev.detail || '')}</p>
            </div>`;
          }).join('') + '</div>';
      } catch (err) {
        container.innerHTML = '<span class="text-xs text-rose-500">Erro ao carregar histórico.</span>';
      }
    }

    async function saveLeadNote(id) {
      const txt = document.getElementById('lead-modal-note-text');
      const urgentCheck = document.getElementById('lead-modal-note-urgent');
      if (!txt || !txt.value.trim()) {
        alert('Digite uma anotação antes de salvar.');
        return;
      }
      try {
        const res = await fetch('/api/leads/' + encodeURIComponent(id) + '/notes', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
          body: JSON.stringify({ text: txt.value.trim(), urgent: !!urgentCheck?.checked })
        });
        const data = await res.json();
        if (res.ok && data.success) {
          txt.value = '';
          if (urgentCheck) urgentCheck.checked = false;
          loadLeadAttendanceTimeline(id);
        } else {
          alert(data.error || 'Erro ao salvar anotação.');
        }
      } catch (e) {
        alert('Erro de conexão ao salvar anotação.');
      }
    }

    async function submitLeadToChief(id) {
      const lawyerSel = document.getElementById('lead-modal-lawyer');
      const areaInp = document.getElementById('lead-modal-area');
      const lawyerName = lawyerSel ? lawyerSel.value : '';
      const area = areaInp ? areaInp.value : '';

      try {
        const res = await fetch('/api/leads/' + encodeURIComponent(id) + '/submit-approval', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
          body: JSON.stringify({
            responsible_lawyer_name: lawyerName,
            area: area,
            notes: 'Atendimento finalizado pelo atendente e submetido para validação do Chefe do Escritório.'
          })
        });
        const data = await res.json();
        if (res.ok && data.success) {
          alert('✅ Lead finalizado e enviado com sucesso para a fila de análise do Dr. Jorge Alvim na "Visão Geral" do painel!');
          closeLeadAttendanceModal();
          loadLeads();
        } else {
          alert(data.error || 'Erro ao submeter lead.');
        }
      } catch (e) {
        alert('Erro de conexão ao enviar para o Dr. Jorge.');
      }
    }

    function closeModal() {
      closeLeadAttendanceModal();
      const legacyModal = document.getElementById('message-modal');
      if (legacyModal) legacyModal.classList.add('hidden');
    }

  // ==========================================================================
  // EXPORTAÇÕES GLOBAIS PARA INTERFACE (ONCLICK & COMPATIBILIDADE)
  // ==========================================================================
  window.loadLeads = typeof loadLeads !== 'undefined' ? loadLeads : window.loadLeads;
  window.updateLeadsStats = typeof updateLeadsStats !== 'undefined' ? updateLeadsStats : window.updateLeadsStats;
  window.renderLeads = typeof renderLeads !== 'undefined' ? renderLeads : window.renderLeads;
  window.getStatusClass = typeof getStatusClass !== 'undefined' ? getStatusClass : window.getStatusClass;
  window.filterLeads = typeof filterLeads !== 'undefined' ? filterLeads : window.filterLeads;
  window.updateLeadStatus = typeof updateLeadStatus !== 'undefined' ? updateLeadStatus : window.updateLeadStatus;
  window.deleteLead = typeof deleteLead !== 'undefined' ? deleteLead : window.deleteLead;
  window.viewLeadDetails = typeof viewLeadDetails !== 'undefined' ? viewLeadDetails : window.viewLeadDetails;
  window.closeModal = typeof closeModal !== 'undefined' ? closeModal : window.closeModal;
  window.closeLeadAttendanceModal = closeLeadAttendanceModal;
  window.saveLeadNote = saveLeadNote;
  window.submitLeadToChief = submitLeadToChief;
})();
