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
            <td colspan="7" class="text-center py-12 text-slate-400">
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
            <td class="px-4 sm:px-6 py-3 sm:py-4 text-right space-x-1 sm:space-x-2 whitespace-nowrap">
              <button onclick="convertLeadToClient('${lead.id}')" class="px-2.5 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300 rounded-lg text-xs font-bold shadow-xs inline-flex items-center space-x-1" title="Converter Atendimento em Cliente Cadastrado (Preenchimento Automático)">
                <span>🚀</span>
                <span>Converter</span>
              </button>
              <button onclick="viewLeadDetails('${lead.id}')" class="p-1.5 text-slate-500 hover:text-navy-950 hover:bg-slate-100 rounded-md" title="Ver Mensagem">
                👁️
              </button>
              <button onclick="deleteLead('${lead.id}')" class="p-1.5 text-rose-500 hover:text-rose-700 hover:bg-rose-50 rounded-md" title="Excluir Registro">
                🗑️
              </button>
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

    function viewLeadDetails(id) {
      const lead = allLeads.find(l => l.id === id);
      if (!lead) return;
      document.getElementById('modal-title').textContent = `Protocolo #${lead.id} - ${lead.name}`;
      document.getElementById('modal-content').textContent = `Área: ${lead.area}\nTelefone: ${lead.phone}\nData: ${new Date(lead.created_at).toLocaleString('pt-BR')}\n\nDescrição / Mensagem:\n${lead.message || 'Nenhuma mensagem escrita.'}`;
      document.getElementById('message-modal').classList.remove('hidden');
    }

    function closeModal() {
      document.getElementById('message-modal').classList.add('hidden');
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
})();
