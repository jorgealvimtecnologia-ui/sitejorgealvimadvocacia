/**
 * ============================================================================
 * SUBMÓDULO DESACOPLADO: MÓDULO: AUDITORIA, HISTÓRICO GERAL & BACKUPS EM 1-CLIQUE
 * Origem: Decomposição arquitetural do painel-1-app.js
 * ============================================================================
 */

(function () {
  'use strict';

    // ================= 7. MÓDULO DE AUDITORIA & HISTÓRICO GERAL =================

    let currentAuditPage = 1;
    let totalAuditPages = 1;
    let currentAuditLogs = [];

    function initAuditTab() {
      loadAuditStats();
      loadAuditLogs(1);
    }

    async function loadAuditStats() {
      const token = getToken();
      if (!token) return;

      try {
        const res = await fetch('/api/admin/audit-logs/stats', {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (res.ok) {
          const data = await res.json();
          if (data.success && data.stats) {
            const s = data.stats;
            document.getElementById('audit-kpi-total').textContent = s.total || 0;
            document.getElementById('audit-kpi-creations').textContent = s.creations || 0;
            document.getElementById('audit-kpi-updates').textContent = s.updates || 0;
            document.getElementById('audit-kpi-deletions').textContent = s.deletions || 0;
            document.getElementById('audit-kpi-docs').textContent = s.documents || 0;
          }
        }
      } catch (err) {
        console.error('Erro ao carregar estatísticas de auditoria:', err);
      }
    }

    async function loadAuditLogs(page = 1) {
      const token = getToken();
      if (!token) return;

      currentAuditPage = page;

      const search = document.getElementById('audit-search-input')?.value || '';
      const module = document.getElementById('audit-module-filter')?.value || 'ALL';
      const event_type = document.getElementById('audit-type-filter')?.value || 'ALL';
      const start_date = document.getElementById('audit-date-start')?.value || '';
      const end_date = document.getElementById('audit-date-end')?.value || '';

      const queryParams = new URLSearchParams({
        page,
        limit: 30,
        search,
        module,
        event_type,
        start_date,
        end_date
      });

      const tbody = document.getElementById('audit-table-body');
      tbody.innerHTML = `
        <tr>
          <td colspan="7" class="text-center py-8 text-slate-400 text-xs">
            <svg class="animate-spin h-5 w-5 mx-auto mb-2 text-sky-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path>
            </svg>
            Carregando trilha de auditoria...
          </td>
        </tr>
      `;

      try {
        const res = await fetch(`/api/admin/audit-logs?${queryParams.toString()}`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });

        if (res.ok) {
          const data = await res.json();
          currentAuditLogs = data.logs || [];
          totalAuditPages = data.pagination?.totalPages || 1;

          document.getElementById('audit-total-records').textContent = `${data.pagination?.total || 0} registros encontrados`;
          document.getElementById('audit-pagination-info').textContent = `Página ${data.pagination?.page || 1} de ${totalAuditPages || 1}`;

          document.getElementById('audit-prev-btn').disabled = currentAuditPage <= 1;
          document.getElementById('audit-next-btn').disabled = currentAuditPage >= totalAuditPages;

          renderAuditTable(currentAuditLogs);
        } else {
          tbody.innerHTML = `<tr><td colspan="7" class="text-center py-6 text-rose-500 font-semibold">Erro ao carregar registros de auditoria.</td></tr>`;
        }
      } catch (err) {
        tbody.innerHTML = `<tr><td colspan="7" class="text-center py-6 text-rose-500 font-semibold">Falha de conexão com o servidor.</td></tr>`;
      }
    }

    function renderAuditTable(logs) {
      const tbody = document.getElementById('audit-table-body');
      if (!logs || logs.length === 0) {
        tbody.innerHTML = `
          <tr>
            <td colspan="7" class="text-center py-8 text-slate-400">
              <p class="font-semibold text-xs">Nenhum registro de auditoria encontrado para os filtros selecionados.</p>
            </td>
          </tr>
        `;
        return;
      }

      tbody.innerHTML = logs.map(log => {
        // Formatar Data e Hora
        let dateFormatted = '—';
        let timeFormatted = '';
        if (log.created_at) {
          try {
            const d = new Date(log.created_at);
            dateFormatted = d.toLocaleDateString('pt-BR');
            timeFormatted = d.toLocaleTimeString('pt-BR');
          } catch (e) {
            dateFormatted = log.created_at;
          }
        }

        // Badge do Tipo de Evento
        let typeBadge = '';
        if (log.event_type === 'CRIACAO') {
          typeBadge = '<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">🟢 Inclusão</span>';
        } else if (log.event_type === 'ALTERACAO') {
          typeBadge = '<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-sky-100 text-sky-800 border border-sky-200">🔵 Alteração</span>';
        } else if (log.event_type === 'EXCLUSAO') {
          typeBadge = '<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-800 border border-rose-200 font-black">🔴 Exclusão</span>';
        } else if (log.event_type === 'GERACAO_DOC') {
          typeBadge = '<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-100 text-indigo-800 border border-indigo-200">🟣 Documento</span>';
        } else if (log.event_type === 'AUTENTICACAO') {
          typeBadge = '<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-900 border border-amber-200">🟡 Autenticação</span>';
        } else {
          typeBadge = `<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-700 border border-slate-200">${log.event_type}</span>`;
        }

        // Badge de Papel (Role) do Operador
        let roleBadge = '';
        if (log.user_role === 'master') {
          roleBadge = '<span class="text-[9px] px-1.5 py-0.2 rounded bg-amber-200 text-amber-900 font-bold ml-1">👑 Mestre</span>';
        } else if (log.user_role === 'client') {
          roleBadge = '<span class="text-[9px] px-1.5 py-0.2 rounded bg-purple-100 text-purple-800 font-bold ml-1">👤 Cliente</span>';
        } else if (log.user_role === 'sistema') {
          roleBadge = '<span class="text-[9px] px-1.5 py-0.2 rounded bg-slate-200 text-slate-800 font-bold ml-1">⚙️ Sistema</span>';
        } else {
          roleBadge = '<span class="text-[9px] px-1.5 py-0.2 rounded bg-slate-100 text-slate-700 font-semibold ml-1">Admin</span>';
        }

        // Identificador de CPF / Usuário
        const authorCpf = log.user_cpf ? `<span class="text-[10px] text-slate-500 font-mono block">CPF/ID: ${log.user_cpf}</span>` : '';

        return `
          <tr class="hover:bg-slate-50/80 transition-colors">
            <td class="px-4 py-3 whitespace-nowrap">
              <span class="font-bold text-slate-800 block">${dateFormatted}</span>
              <span class="text-[10px] text-slate-500 font-mono">${timeFormatted}</span>
            </td>
            <td class="px-4 py-3">
              <div class="flex items-center">
                <span class="font-bold text-navy-950">${log.user_name || 'Desconhecido'}</span>
                ${roleBadge}
              </div>
              ${authorCpf}
            </td>
            <td class="px-4 py-3 whitespace-nowrap">
              <span class="font-semibold text-slate-700">${log.module || '—'}</span>
              ${log.resource_id ? `<span class="text-[10px] text-slate-400 font-mono block">#${log.resource_id}</span>` : ''}
            </td>
            <td class="px-4 py-3 whitespace-nowrap">
              ${typeBadge}
            </td>
            <td class="px-4 py-3">
              <p class="text-slate-800 leading-snug font-medium line-clamp-2" title="${log.description}">
                ${log.description}
              </p>
            </td>
            <td class="px-4 py-3 whitespace-nowrap">
              <span class="font-mono text-[11px] text-slate-500">${log.ip_address || '127.0.0.1'}</span>
            </td>
            <td class="px-4 py-3 text-right whitespace-nowrap">
              <button 
                onclick="openAuditDetailsModal(${log.id})" 
                class="px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-gold-50 hover:text-gold-900 text-slate-700 font-bold text-[11px] transition-all flex items-center space-x-1 ml-auto"
                title="Ver Ficha Completa do Log"
              >
                <svg class="w-3.5 h-3.5 text-gold-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/>
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/>
                </svg>
                <span>Ficha</span>
              </button>
            </td>
          </tr>
        `;
      }).join('');
    }

    function clearAuditFilters() {
      document.getElementById('audit-search-input').value = '';
      document.getElementById('audit-module-filter').value = 'ALL';
      document.getElementById('audit-type-filter').value = 'ALL';
      document.getElementById('audit-date-start').value = '';
      document.getElementById('audit-date-end').value = '';
      loadAuditLogs(1);
    }

    function changeAuditPage(delta) {
      const target = currentAuditPage + delta;
      if (target >= 1 && target <= totalAuditPages) {
        loadAuditLogs(target);
      }
    }

    function openAuditDetailsModal(logId) {
      const log = currentAuditLogs.find(l => l.id === logId);
      if (!log) return;

      document.getElementById('audit-modal-subtitle').textContent = `ID do Log: #${log.id} • Evento: ${log.event_name || 'N/A'}`;
      
      let dateFull = log.created_at;
      try {
        dateFull = new Date(log.created_at).toLocaleString('pt-BR');
      } catch (e) {}

      document.getElementById('audit-modal-date').textContent = dateFull;
      document.getElementById('audit-modal-author').textContent = `${log.user_name} (${log.user_role})`;
      document.getElementById('audit-modal-cpf').textContent = log.user_cpf || 'Não informado';
      document.getElementById('audit-modal-module').textContent = `${log.module} ${log.resource_id ? '(Ref: ' + log.resource_id + ')' : ''}`;
      document.getElementById('audit-modal-event').textContent = `${log.event_type} - ${log.event_name}`;
      document.getElementById('audit-modal-ip').textContent = log.ip_address || '127.0.0.1';
      document.getElementById('audit-modal-desc').textContent = log.description || 'Sem descrição.';
      document.getElementById('audit-modal-ua').textContent = log.user_agent || 'Desconhecido';

      let parsedDetails = {};
      try {
        if (log.details) {
          parsedDetails = typeof log.details === 'string' ? JSON.parse(log.details) : log.details;
        }
      } catch (e) {
        parsedDetails = { raw: log.details };
      }

      document.getElementById('audit-modal-json').textContent = JSON.stringify(parsedDetails, null, 2);
      document.getElementById('audit-details-modal').classList.remove('hidden');
    }

    function closeAuditModal() {
      document.getElementById('audit-details-modal').classList.add('hidden');
    }

    // ================= ROTINAS DE BACKUP ADMINISTRATIVO EM 1-CLIQUE =================
    async function downloadDatabaseBackup() {
      const token = getToken();
      try {
        const res = await fetch('/api/admin/backup/download-db', {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!res.ok) {
          const err = await res.json();
          alert(err.error || 'Erro ao gerar backup do banco de dados.');
          return;
        }
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        const timestamp = new Date().toISOString().slice(0, 10);
        a.href = url;
        a.download = `backup-jorgealvim-${timestamp}.sqlite`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      } catch (err) {
        alert('Erro ao realizar download do backup SQLite.');
      }
    }

    async function downloadJsonDumpBackup() {
      const token = getToken();
      try {
        const res = await fetch('/api/admin/backup/export-full-json', {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!res.ok) {
          const err = await res.json();
          alert(err.error || 'Erro ao exportar dump JSON.');
          return;
        }
        const data = await res.json();
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        const timestamp = new Date().toISOString().slice(0, 10);
        a.href = url;
        a.download = `dump-jorgealvim-total-${timestamp}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      } catch (err) {
        alert('Erro ao realizar exportação completa JSON.');
      }
    }

    function exportAuditLogsCSV() {
      if (!currentAuditLogs || currentAuditLogs.length === 0) {
        alert('Não há registros de auditoria carregados para exportação.');
        return;
      }

      const headers = ['ID', 'Data/Hora', 'Operador/Autor', 'CPF', 'Perfil', 'Modulo', 'Tipo Evento', 'Nome Evento', 'ID Recurso', 'IP', 'Descricao'];
      
      const rows = currentAuditLogs.map(l => {
        let dateFull = l.created_at;
        try { dateFull = new Date(l.created_at).toLocaleString('pt-BR'); } catch (e) {}
        
        return [
          l.id,
          `"${dateFull}"`,
          `"${(l.user_name || '').replace(/"/g, '""')}"`,
          `"${l.user_cpf || ''}"`,
          `"${l.user_role || ''}"`,
          `"${l.module || ''}"`,
          `"${l.event_type || ''}"`,
          `"${l.event_name || ''}"`,
          `"${l.resource_id || ''}"`,
          `"${l.ip_address || ''}"`,
          `"${(l.description || '').replace(/"/g, '""')}"`
        ].join(';');
      });

      const csvContent = '\uFEFF' + [headers.join(';'), ...rows].join('\r\n');
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      const todayStr = new Date().toISOString().split('T')[0];
      link.setAttribute('href', url);
      link.setAttribute('download', `auditoria-jorgealvim-${todayStr}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }

    function printAuditTable() {
      const printArea = document.getElementById('audit-table-print-area').innerHTML;
      const printWindow = window.open('', '_blank');
      printWindow.document.write(
        '<!DOCTYPE html>' +
        '<html>' +
        '<head>' +
        '  <title>Relatório Oficial de Auditoria & Compliance - Dr. Jorge Alvim Advocacia</title>' +
        '  <' + 'script src="https://cdn.tailwindcss.com"><' + '/script>' +
        '  <style>' +
        '    @media print {' +
        '      body { font-size: 10pt; background: white; color: black; }' +
        '      button { display: none !important; }' +
        '    }' +
        '  </style>' +
        '</head>' +
        '<body class="p-8 bg-white text-slate-900 font-sans">' +
        '  <div class="text-center border-b pb-4 mb-6">' +
        '    <h1 class="text-xl font-bold text-navy-950">JORGE EDUARDO DA SILVA ALVIM • ADVOCACIA</h1>' +
        '    <p class="text-xs text-slate-600">OAB/MG 222.943 • Rua Henrique Dias, nº 259, Galeria 259, Loja 5, Benfica, Juiz de Fora - MG</p>' +
        '    <h2 class="text-sm font-bold text-slate-800 uppercase tracking-widest mt-3">Relatório Oficial de Trilha de Auditoria & Compliance LGPD</h2>' +
        '    <p class="text-[11px] text-slate-500">Emitido em: ' + new Date().toLocaleString('pt-BR') + '</p>' +
        '  </div>' +
        printArea +
        '  <' + 'script>' +
        '    window.onload = function() { window.print(); };' +
        '  <' + '/script>' +
        '</body>' +
        '</html>'
      );
      printWindow.document.close();
    }

    // Helper para envio assíncrono de eventos de auditoria do lado do cliente
    function logAuditClientEvent(event_type, event_name, module, resource_id, description, details) {
      const token = getToken();
      if (!token) return;

      fetch('/api/audit/log-event', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          event_type,
          event_name,
          module,
          resource_id,
          description,
          details
        })
      }).catch(err => console.warn('[AUDITORIA CLIENTE] Falha ao enviar evento:', err));
    }


  // ==========================================================================
  // EXPORTAÇÕES GLOBAIS PARA INTERFACE (ONCLICK & COMPATIBILIDADE)
  // ==========================================================================
  window.initAuditTab = typeof initAuditTab !== 'undefined' ? initAuditTab : window.initAuditTab;
  window.loadAuditStats = typeof loadAuditStats !== 'undefined' ? loadAuditStats : window.loadAuditStats;
  window.loadAuditLogs = typeof loadAuditLogs !== 'undefined' ? loadAuditLogs : window.loadAuditLogs;
  window.renderAuditTable = typeof renderAuditTable !== 'undefined' ? renderAuditTable : window.renderAuditTable;
  window.clearAuditFilters = typeof clearAuditFilters !== 'undefined' ? clearAuditFilters : window.clearAuditFilters;
  window.changeAuditPage = typeof changeAuditPage !== 'undefined' ? changeAuditPage : window.changeAuditPage;
  window.openAuditDetailsModal = typeof openAuditDetailsModal !== 'undefined' ? openAuditDetailsModal : window.openAuditDetailsModal;
  window.closeAuditModal = typeof closeAuditModal !== 'undefined' ? closeAuditModal : window.closeAuditModal;
  window.downloadDatabaseBackup = typeof downloadDatabaseBackup !== 'undefined' ? downloadDatabaseBackup : window.downloadDatabaseBackup;
  window.downloadJsonDumpBackup = typeof downloadJsonDumpBackup !== 'undefined' ? downloadJsonDumpBackup : window.downloadJsonDumpBackup;
  window.exportAuditLogsCSV = typeof exportAuditLogsCSV !== 'undefined' ? exportAuditLogsCSV : window.exportAuditLogsCSV;
  window.printAuditTable = typeof printAuditTable !== 'undefined' ? printAuditTable : window.printAuditTable;
  window.logAuditClientEvent = typeof logAuditClientEvent !== 'undefined' ? logAuditClientEvent : window.logAuditClientEvent;
})();
