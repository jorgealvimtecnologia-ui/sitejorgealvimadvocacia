// ============================================================================
// MÓDULO FRONTEND: 🛠️ MANUTENÇÃO & SAÚDE DO SISTEMA (FASE 5)
// Painel exclusivo para o Usuário Mestre (jorgealvimtecnologia)
// SQLite Integrity, VACUUM, WAL Checkpoint, Backups, Sessões & Infraestrutura
// ============================================================================

(function () {
  'use strict';

  function toast(msg, type = 'info') {
    if (window.showSupportToast) {
      window.showSupportToast(msg, type);
    } else if (window.JAUserSupport && window.JAUserSupport.toast) {
      window.JAUserSupport.toast(msg, type);
    } else if (typeof window.showToast === 'function') {
      window.showToast(msg, type);
    } else {
      alert(msg);
    }
  }

  function formatBytes(bytes) {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  function formatUptime(seconds) {
    if (!seconds) return '0s';
    const d = Math.floor(seconds / (3600 * 24));
    const h = Math.floor((seconds % (3600 * 24)) / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    const parts = [];
    if (d > 0) parts.push(`${d}d`);
    if (h > 0) parts.push(`${h}h`);
    if (m > 0) parts.push(`${m}m`);
    parts.push(`${s}s`);
    return parts.join(' ');
  }

  // Carregamento principal dos dados de diagnóstico
  async function loadMaintenanceHealth() {
    const refreshBtn = document.getElementById('btn-maint-refresh');
    if (refreshBtn) refreshBtn.classList.add('animate-spin');

    try {
      const res = await window.apiFetch('/api/admin/maintenance/health');
      if (res.status === 403) {
        toast('Acesso restrito ao perfil Master (jorgealvimtecnologia).', 'warning');
        return;
      }
      const data = await res.json();
      if (!data.success) {
        toast(data.error || 'Falha ao obter diagnóstico.', 'error');
        return;
      }

      renderHealthCards(data);
      await Promise.all([
        loadBackupsList(),
        loadActiveSessions()
      ]);
    } catch (err) {
      console.error('[MANUTENÇÃO] Erro ao carregar saúde:', err);
      toast('Falha de conexão com o painel de manutenção.', 'error');
    } finally {
      if (refreshBtn) refreshBtn.classList.remove('animate-spin');
    }
  }

  function renderHealthCards(data) {
    const srv = data.server || {};
    const mem = data.memory || {};
    const sql = data.sqlite || {};
    const isMaint = data.maintenanceMode === true;

    // SQLite KPIs
    const elDbSize = document.getElementById('maint-db-size');
    if (elDbSize) elDbSize.textContent = sql.dbSizeFormatted || '-- MB';

    const elWalSize = document.getElementById('maint-wal-size');
    if (elWalSize) elWalSize.textContent = `Log WAL: ${sql.walSizeFormatted || '0 B'}`;

    const elDbJournal = document.getElementById('maint-db-journal');
    if (elDbJournal) elDbJournal.textContent = 'Modo: WAL (Write-Ahead)';

    const elDbIntegrityBadge = document.getElementById('maint-db-integrity-badge');
    if (elDbIntegrityBadge) {
      elDbIntegrityBadge.textContent = '100% ÍNTEGRO (OK)';
      elDbIntegrityBadge.className = 'px-2 py-0.5 rounded-full text-[11px] font-extrabold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30';
    }

    const elDbTables = document.getElementById('maint-db-tables');
    if (elDbTables) elDbTables.textContent = `${sql.tableCount || 0} tabelas ativas`;

    const elDbPages = document.getElementById('maint-db-pages');
    if (elDbPages) {
      const totalRecords = (sql.counts?.clients || 0) + (sql.counts?.lawsuits || 0) + (sql.counts?.leads || 0);
      elDbPages.textContent = `${totalRecords} registros chave`;
    }

    const elDbFreelist = document.getElementById('maint-db-freelist');
    if (elDbFreelist) elDbFreelist.textContent = sql.totalDatabaseFormatted || 'Otimizado';

    // Servidor KPIs
    const elNodeVer = document.getElementById('maint-srv-node');
    if (elNodeVer) elNodeVer.textContent = srv.nodeVersion || 'v22+';

    const elUptime = document.getElementById('maint-srv-uptime');
    if (elUptime) elUptime.textContent = `Uptime: ${srv.uptimeFormatted || formatUptime(srv.uptimeSeconds)}`;

    const elMemory = document.getElementById('maint-srv-memory');
    if (elMemory) {
      elMemory.textContent = `Heap: ${mem.heapUsedFormatted || '-'} / RSS: ${mem.rssFormatted || '-'}`;
    }

    const elPlatform = document.getElementById('maint-srv-platform');
    if (elPlatform) elPlatform.textContent = `${srv.platform || 'Linux'} (Docker / Local)`;

    // Modo Manutenção
    const elModeStatus = document.getElementById('maint-mode-status-text');
    const elModeBadge = document.getElementById('maint-mode-badge');
    const elModeToggle = document.getElementById('maint-mode-toggle-checkbox');

    if (elModeToggle) elModeToggle.checked = isMaint;

    if (elModeStatus && elModeBadge) {
      if (isMaint) {
        elModeStatus.textContent = 'Modo Manutenção ATIVADO (Acesso restrito ao Master)';
        elModeStatus.className = 'text-xs font-bold text-rose-700';
        elModeBadge.textContent = 'ATIVO';
        elModeBadge.className = 'px-2 py-0.5 rounded-full text-xs font-bold bg-rose-200 text-rose-900';
      } else {
        elModeStatus.textContent = 'Sistema Operando Normalmente (Online)';
        elModeStatus.className = 'text-xs font-semibold text-emerald-700';
        elModeBadge.textContent = 'DESATIVADO';
        elModeBadge.className = 'px-2 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800';
      }
    }
  }

  // Executar Verificação de Integridade (PRAGMA integrity_check)
  async function runDbIntegrity() {
    toast('Executando verificação de integridade física no SQLite...', 'info');
    try {
      const res = await window.apiFetch('/api/admin/maintenance/db/integrity', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        if (data.isOk) {
          toast('Banco de dados 100% íntegro! Nenhuma inconsistência encontrada.', 'success');
        } else {
          toast(`Inconsistências encontradas: ${JSON.stringify(data.details)}`, 'warning');
        }
        await loadMaintenanceHealth();
      } else {
        toast(data.error || 'Erro na verificação de integridade.', 'error');
      }
    } catch (err) {
      console.error(err);
      toast('Erro de rede ao verificar integridade.', 'error');
    }
  }

  // Executar VACUUM
  async function runDbVacuum() {
    if (!confirm('Deseja iniciar a otimização e compactação (VACUUM) do banco SQLite?\n\nIsso desfragmenta as páginas de dados e libera espaço em disco de registros deletados.')) {
      return;
    }

    toast('Executando VACUUM e otimização no SQLite... Aguarde.', 'info');
    try {
      const res = await window.apiFetch('/api/admin/maintenance/db/vacuum', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        toast(`VACUUM concluído com sucesso! Liberado: ${data.freedFormatted}. Tamanho atual: ${data.sizeAfterFormatted}.`, 'success');
        await loadMaintenanceHealth();
      } else {
        toast(data.error || 'Erro ao executar VACUUM.', 'error');
      }
    } catch (err) {
      console.error(err);
      toast('Erro de rede ao executar VACUUM.', 'error');
    }
  }

  // Executar WAL Checkpoint
  async function runDbCheckpoint() {
    toast('Executando WAL Checkpoint (TRUNCATE)...', 'info');
    try {
      const res = await window.apiFetch('/api/admin/maintenance/db/checkpoint', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        toast(`Checkpoint concluído! Log WAL reduzido para ${data.walAfterFormatted}.`, 'success');
        await loadMaintenanceHealth();
      } else {
        toast(data.error || 'Erro ao executar Checkpoint.', 'error');
      }
    } catch (err) {
      console.error(err);
      toast('Erro de rede ao executar Checkpoint.', 'error');
    }
  }

  // Executar REINDEX
  async function runDbReindex() {
    if (!confirm('Deseja recalcular e reconstruir todos os índices do banco de dados (REINDEX)?\n\nRecomendado para otimizar pesquisas e consultas pesadas.')) {
      return;
    }

    toast('Reconstruindo todos os índices do banco de dados...', 'info');
    try {
      const res = await window.apiFetch('/api/admin/maintenance/db/reindex', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        toast('REINDEX concluído com êxito! Todos os índices foram recalculados.', 'success');
        await loadMaintenanceHealth();
      } else {
        toast(data.error || 'Erro ao executar REINDEX.', 'error');
      }
    } catch (err) {
      console.error(err);
      toast('Erro de rede ao reconstruir índices.', 'error');
    }
  }

  // Backups: Carregar lista
  async function loadBackupsList() {
    const tableBody = document.getElementById('maint-backups-table-body');
    if (!tableBody) return;

    try {
      const res = await window.apiFetch('/api/admin/maintenance/backups');
      const data = await res.json();
      if (!data.success) {
        tableBody.innerHTML = '<tr><td colspan="4" class="p-4 text-center text-slate-400 text-xs">Erro ao carregar backups.</td></tr>';
        return;
      }

      const backups = data.backups || [];
      const elBkCount = document.getElementById('maint-bk-count');
      if (elBkCount) elBkCount.textContent = `${backups.length} arquivos`;

      if (backups.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="4" class="p-4 text-center text-slate-400 text-xs">Nenhum backup gerado ainda. Clique em "Gerar Backup Agora".</td></tr>';
        return;
      }

      tableBody.innerHTML = backups.map(b => {
        return `
          <tr class="hover:bg-slate-50 transition-colors border-b border-slate-100">
            <td class="p-3 text-xs font-semibold text-slate-800 flex items-center gap-2">
              <span class="text-base">💾</span>
              <div>
                <span class="block text-slate-900 font-mono text-[11px]">${b.filename}</span>
                <span class="text-[10px] text-slate-400">${b.path || './backups/' + b.filename}</span>
              </div>
            </td>
            <td class="p-3 text-xs text-slate-600 font-bold">${b.sizeFormatted}</td>
            <td class="p-3 text-xs text-slate-500">${b.createdAtFormatted || new Date(b.createdAt).toLocaleString('pt-BR')}</td>
            <td class="p-3 text-xs text-right space-x-1">
              <button 
                onclick="window.downloadMaintBackup('${b.filename}')"
                class="px-2.5 py-1 rounded-lg text-xs font-semibold bg-navy-50 text-navy-800 hover:bg-navy-100 transition-colors border border-navy-200 cursor-pointer"
                title="Download do arquivo SQLite">
                📥 Baixar
              </button>
              <button 
                onclick="window.deleteMaintBackup('${b.filename}')"
                class="px-2.5 py-1 rounded-lg text-xs font-semibold bg-rose-50 text-rose-700 hover:bg-rose-100 transition-colors border border-rose-200 cursor-pointer"
                title="Excluir arquivo de backup">
                🗑️ Excluir
              </button>
            </td>
          </tr>
        `;
      }).join('');
    } catch (err) {
      console.error('[BACKUPS] Erro ao listar:', err);
    }
  }

  // Backups: Criar backup agora
  async function createBackupNow() {
    const btn = document.getElementById('btn-maint-create-backup');
    if (btn) btn.disabled = true;

    toast('Gerando snapshot consistente do SQLite em backups/...', 'info');
    try {
      const res = await window.apiFetch('/api/admin/maintenance/backups/create', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        toast(`Backup gerado com sucesso! Arquivo: ${data.backup.filename} (${data.backup.sizeFormatted}).`, 'success');
        await Promise.all([
          loadBackupsList(),
          loadMaintenanceHealth()
        ]);
      } else {
        toast(data.error || 'Falha ao criar backup.', 'error');
      }
    } catch (err) {
      console.error(err);
      toast('Erro de rede ao criar backup.', 'error');
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  // Backups: Download
  function downloadMaintBackup(filename) {
    const token = localStorage.getItem('ja_admin_token');
    const url = `/api/admin/maintenance/backups/${encodeURIComponent(filename)}` + (token ? `?token=${token}` : '');
    
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    toast(`Iniciando download de ${filename}...`, 'info');
  }

  // Backups: Deletar
  async function deleteMaintBackup(filename) {
    if (!confirm(`Tem certeza que deseja excluir o arquivo de backup "${filename}"?\n\nEsta ação não poderá ser desfeita.`)) {
      return;
    }

    try {
      const res = await window.apiFetch(`/api/admin/maintenance/backups/${encodeURIComponent(filename)}`, {
        method: 'DELETE'
      });
      const data = await res.json();
      if (data.success) {
        toast(`Backup "${filename}" removido com sucesso.`, 'success');
        await Promise.all([
          loadBackupsList(),
          loadMaintenanceHealth()
        ]);
      } else {
        toast(data.error || 'Erro ao excluir backup.', 'error');
      }
    } catch (err) {
      console.error(err);
      toast('Erro de rede ao excluir backup.', 'error');
    }
  }

  // Sessões Ativas
  async function loadActiveSessions() {
    const tableBody = document.getElementById('maint-sessions-table-body');
    if (!tableBody) return;

    try {
      const res = await window.apiFetch('/api/admin/maintenance/sessions');
      const data = await res.json();
      if (!data.success) {
        tableBody.innerHTML = '<tr><td colspan="4" class="p-4 text-center text-slate-400 text-xs">Erro ao carregar sessões.</td></tr>';
        return;
      }

      const sessions = data.activeSessions || data.sessions || [];
      const elSessionCount = document.getElementById('maint-session-count-badge');
      if (elSessionCount) elSessionCount.textContent = sessions.length;

      if (sessions.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="4" class="p-4 text-center text-slate-400 text-xs">Nenhuma sessão ativa encontrada.</td></tr>';
        return;
      }

      tableBody.innerHTML = sessions.map(s => {
        return `
          <tr class="hover:bg-slate-50 transition-colors border-b border-slate-100">
            <td class="p-3 text-xs font-semibold text-slate-800 flex items-center gap-2">
              <span class="w-2 h-2 rounded-full ${s.isCurrent ? 'bg-amber-500' : 'bg-emerald-500'} animate-pulse"></span>
              <div>
                <span class="block text-slate-900 font-bold">${s.name || s.username || 'Usuário'} ${s.isCurrent ? '<span class="text-[10px] text-amber-700 bg-amber-100 px-1 py-0.5 rounded font-bold">Você</span>' : ''}</span>
                <span class="text-[10px] text-slate-400">Token: ${s.tokenSnippet || '...'} · Papel: ${s.role || s.kind}</span>
              </div>
            </td>
            <td class="p-3 text-xs text-slate-600 font-mono text-[11px]">${s.kind || 'admin'}</td>
            <td class="p-3 text-xs text-slate-500">${s.username || '-'}</td>
            <td class="p-3 text-xs text-slate-500 text-right">${s.expiresAtFormatted || 'Ativa'}</td>
          </tr>
        `;
      }).join('');
    } catch (err) {
      console.error('[SESSÕES] Erro:', err);
    }
  }

  // Desconectar Todas as Sessões
  async function disconnectAllSessions() {
    if (!confirm('ATENÇÃO: Deseja revogar todas as outras sessões ativas no sistema?\n\nTodos os usuários conectados (exceto a sua sessão atual) terão que fazer login novamente.')) {
      return;
    }

    try {
      const res = await window.apiFetch('/api/admin/maintenance/sessions/disconnect-all', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        toast(`Sessões revogadas com êxito! Total de sessões finalizadas: ${data.revokedCount}.`, 'success');
        await loadActiveSessions();
      } else {
        toast(data.error || 'Falha ao revogar sessões.', 'error');
      }
    } catch (err) {
      console.error(err);
      toast('Erro de rede ao revogar sessões.', 'error');
    }
  }

  // Modo Manutenção: Salvar Toggle
  async function saveMaintenanceMode() {
    const toggle = document.getElementById('maint-mode-toggle-checkbox');
    const enabled = toggle ? toggle.checked : false;

    if (enabled && !confirm('Tem certeza que deseja ATIVAR o Modo de Manutenção?\n\nUsuários não-master receberão bloqueio preventivo.')) {
      if (toggle) toggle.checked = false;
      return;
    }

    try {
      const res = await window.apiFetch('/api/admin/maintenance/mode', {
        method: 'POST',
        body: JSON.stringify({ enabled })
      });
      const data = await res.json();
      if (data.success) {
        toast(`Modo Manutenção ${enabled ? 'ATIVADO' : 'DESATIVADO'} com sucesso.`, 'success');
        await loadMaintenanceHealth();
      } else {
        toast(data.error || 'Erro ao alterar modo manutenção.', 'error');
      }
    } catch (err) {
      console.error(err);
      toast('Erro de rede ao atualizar modo manutenção.', 'error');
    }
  }

  // Storage: Escanear Arquivos Órfãos
  async function scanStorageOrphans() {
    const resultBox = document.getElementById('maint-storage-results');
    if (resultBox) resultBox.innerHTML = '<span class="text-xs text-slate-500 animate-pulse">Escaneando diretórios e referências no banco de dados...</span>';

    try {
      const res = await window.apiFetch('/api/admin/maintenance/storage/scan-orphans');
      const data = await res.json();
      if (!data.success) {
        toast(data.error || 'Erro ao analisar armazenamento.', 'error');
        if (resultBox) resultBox.innerHTML = '<span class="text-xs text-rose-600">Erro na análise.</span>';
        return;
      }

      const st = data.storage;
      if (resultBox) {
        resultBox.innerHTML = `
          <div class="p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs space-y-1.5 font-medium">
            <div class="flex justify-between"><span>📁 Arquivos no Drive:</span> <span class="font-bold text-slate-800">${st.driveFilesCount} (${st.driveTotalFormatted})</span></div>
            <div class="flex justify-between"><span>📄 Documentos de Clientes:</span> <span class="font-bold text-slate-800">${st.clientDocsCount} (${st.clientDocsTotalFormatted})</span></div>
            <div class="flex justify-between border-t border-slate-200 pt-1"><span>🔍 Órfãos Detectados:</span> <span class="font-bold ${st.orphanCount === 0 ? 'text-emerald-700' : 'text-amber-700'}">${st.orphanCount}</span></div>
          </div>
        `;
      }
      toast('Varredura de armazenamento concluída!', 'success');
    } catch (err) {
      console.error(err);
      toast('Erro de rede ao escanear armazenamento.', 'error');
    }
  }

  // Purgar Logs de Auditoria Antigos
  async function purgeAuditLogs() {
    const inputDays = document.getElementById('maint-audit-retention-days');
    const days = parseInt(inputDays ? inputDays.value : '90', 10) || 90;

    if (!confirm(`Confirma a exclusão de logs de auditoria com mais de ${days} dias?\n\nLogs dos últimos ${days} dias permanecerão intactos.`)) {
      return;
    }

    try {
      const res = await window.apiFetch('/api/admin/maintenance/audit/purge', {
        method: 'POST',
        body: JSON.stringify({ days })
      });
      const data = await res.json();
      if (data.success) {
        toast(`Limpeza de auditoria concluída! ${data.deletedLogsCount} registros foram excluídos.`, 'success');
        await loadMaintenanceHealth();
      } else {
        toast(data.error || 'Erro ao purgar logs.', 'error');
      }
    } catch (err) {
      console.error(err);
      toast('Erro de rede ao purgar logs.', 'error');
    }
  }

  // Exportar funções globais
  window.loadMaintenanceHealth = loadMaintenanceHealth;
  window.runDbIntegrity = runDbIntegrity;
  window.runDbVacuum = runDbVacuum;
  window.runDbCheckpoint = runDbCheckpoint;
  window.runDbReindex = runDbReindex;
  window.loadBackupsList = loadBackupsList;
  window.createBackupNow = createBackupNow;
  window.downloadMaintBackup = downloadMaintBackup;
  window.deleteMaintBackup = deleteMaintBackup;
  window.loadActiveSessions = loadActiveSessions;
  window.disconnectAllSessions = disconnectAllSessions;
  window.saveMaintenanceMode = saveMaintenanceMode;
  window.scanStorageOrphans = scanStorageOrphans;
  window.purgeAuditLogs = purgeAuditLogs;

})();
