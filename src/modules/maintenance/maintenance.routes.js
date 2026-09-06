/**
 * ==============================================================================
 * MÓDULO DE MANUTENÇÃO & SAÚDE DO SISTEMA (PAINEL DO MESTRE)
 * ==============================================================================
 * Fornece ferramentas de diagnóstico em tempo real, integridade do SQLite,
 * VACUUM, Checkpoint WAL, Reindex, Central de Backups, Monitor de Recursos,
 * Gestão de Sessões, Storage e Modo Manutenção.
 * Restrito exclusivamente ao Usuário Mestre (requireMaster).
 * ==============================================================================
 */

import express from 'express';
import fs from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'node:crypto';
import { db } from '../../config/db.js';
import { DB_PATH, ROOT_DIR, STORAGE_DIR, STORAGE_DRIVE_DIR } from '../../config/constants.js';
import { requireMaster, sessions, clientSessions, employeeSessions } from '../../middleware/auth.js';
import { logAudit } from '../../middleware/audit.js';

export const maintenanceRouter = express.Router();

const BACKUPS_DIR = path.join(ROOT_DIR, 'backups');
if (!fs.existsSync(BACKUPS_DIR)) {
  fs.mkdirSync(BACKUPS_DIR, { recursive: true });
}

// Formata bytes para exibição humana (KB, MB, GB)
function formatBytes(bytes, decimals = 2) {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

// Helper para calcular tamanho recursivo de diretório
function getDirSize(dirPath) {
  let total = 0;
  try {
    if (!fs.existsSync(dirPath)) return 0;
    const files = fs.readdirSync(dirPath);
    for (const file of files) {
      const fullPath = path.join(dirPath, file);
      const stat = fs.statSync(fullPath);
      if (stat.isDirectory()) {
        total += getDirSize(fullPath);
      } else {
        total += stat.size;
      }
    }
  } catch (_e) {
    // Ignora erros de permissão pontuais
  }
  return total;
}

// ------------------------------------------------------------------------------
// 1. HEALTH CHECK & DIAGNÓSTICO DO SERVIDOR EM TEMPO REAL
// ------------------------------------------------------------------------------
maintenanceRouter.get('/api/admin/maintenance/health', requireMaster, (req, res) => {
  try {
    // Uptime
    const uptimeSec = process.uptime();
    const days = Math.floor(uptimeSec / 86400);
    const hours = Math.floor((uptimeSec % 86400) / 3600);
    const minutes = Math.floor((uptimeSec % 3600) / 60);
    const uptimeFormatted = `${days}d ${hours}h ${minutes}m`;

    // Memória
    const memUsage = process.memoryUsage();
    const osFreeMem = os.freemem();
    const osTotalMem = os.totalmem();

    // Espaço em Disco
    let diskStats = { total: 0, free: 0, used: 0, freeFormatted: 'N/D', totalFormatted: 'N/D', percentFree: 0 };
    try {
      if (typeof fs.statfsSync === 'function') {
        const stat = fs.statfsSync(ROOT_DIR);
        const total = stat.bsize * stat.blocks;
        const free = stat.bsize * stat.bavail;
        const used = total - free;
        diskStats = {
          total,
          free,
          used,
          freeFormatted: formatBytes(free),
          totalFormatted: formatBytes(total),
          percentFree: total > 0 ? Math.round((free / total) * 100) : 0
        };
      }
    } catch (_e) {}

    // Estatísticas do Banco de Dados SQLite
    let dbSize = 0;
    let walSize = 0;
    let shmSize = 0;
    try {
      if (fs.existsSync(DB_PATH)) dbSize = fs.statSync(DB_PATH).size;
      const walPath = `${DB_PATH}-wal`;
      if (fs.existsSync(walPath)) walSize = fs.statSync(walPath).size;
      const shmPath = `${DB_PATH}-shm`;
      if (fs.existsSync(shmPath)) shmSize = fs.statSync(shmPath).size;
    } catch (_e) {}

    // Contagem de Tabelas e Registros Chave
    let tableCount = 0;
    let clientCount = 0;
    let lawsuitCount = 0;
    let leadCount = 0;
    let auditLogCount = 0;
    try {
      const tables = db.prepare("SELECT COUNT(*) as c FROM sqlite_master WHERE type='table'").get();
      tableCount = tables ? tables.c : 0;
      clientCount = db.prepare("SELECT COUNT(*) as c FROM clients").get()?.c || 0;
      lawsuitCount = db.prepare("SELECT COUNT(*) as c FROM lawsuits").get()?.c || 0;
      leadCount = db.prepare("SELECT COUNT(*) as c FROM leads").get()?.c || 0;
      auditLogCount = db.prepare("SELECT COUNT(*) as c FROM audit_logs").get()?.c || 0;
    } catch (_e) {}

    // Certificado SSL
    let sslStatus = { active: false, daysRemaining: null, validTo: null, subject: null };
    try {
      const certPath = path.join(ROOT_DIR, 'nginx', 'ssl', 'cert.pem');
      if (fs.existsSync(certPath)) {
        const certRaw = fs.readFileSync(certPath, 'utf8');
        const x509 = new crypto.X509Certificate(certRaw);
        const validTo = new Date(x509.validTo);
        const diffMs = validTo.getTime() - Date.now();
        const daysRemaining = Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
        sslStatus = {
          active: true,
          daysRemaining,
          validTo: validTo.toLocaleDateString('pt-BR'),
          subject: x509.subject
        };
      }
    } catch (_e) {}

    // Modo Manutenção
    let maintenanceMode = false;
    try {
      const row = db.prepare("SELECT value FROM system_settings WHERE key = 'maintenance_mode'").get();
      maintenanceMode = row ? row.value === 'true' || row.value === '1' : false;
    } catch (_e) {}

    res.json({
      success: true,
      server: {
        nodeVersion: process.version,
        platform: process.platform,
        uptimeSeconds: Math.floor(uptimeSec),
        uptimeFormatted
      },
      memory: {
        rssFormatted: formatBytes(memUsage.rss),
        heapUsedFormatted: formatBytes(memUsage.heapUsed),
        heapTotalFormatted: formatBytes(memUsage.heapTotal),
        osTotalFormatted: formatBytes(osTotalMem),
        osFreeFormatted: formatBytes(osFreeMem)
      },
      disk: diskStats,
      sqlite: {
        dbSizeFormatted: formatBytes(dbSize),
        walSizeFormatted: formatBytes(walSize),
        shmSizeFormatted: formatBytes(shmSize),
        totalDatabaseBytes: dbSize + walSize + shmSize,
        totalDatabaseFormatted: formatBytes(dbSize + walSize + shmSize),
        tableCount,
        counts: {
          clients: clientCount,
          lawsuits: lawsuitCount,
          leads: leadCount,
          auditLogs: auditLogCount
        }
      },
      ssl: sslStatus,
      maintenanceMode
    });
  } catch (err) {
    console.error('[MAINTENANCE] Erro ao obter status do sistema:', err);
    res.status(500).json({ error: 'Erro ao obter métricas do sistema: ' + err.message });
  }
});

// ------------------------------------------------------------------------------
// 2. INTEGRIDADE DO BANCO DE DADOS (PRAGMA integrity_check)
// ------------------------------------------------------------------------------
maintenanceRouter.post('/api/admin/maintenance/db/integrity', requireMaster, (req, res) => {
  try {
    const result = db.prepare('PRAGMA integrity_check;').all();
    const isOk = result.length === 1 && result[0].integrity_check === 'ok';

    logAudit(req, {
      event_type: 'MANUTENCAO',
      event_name: 'DB_INTEGRITY_CHECK',
      module: 'MAINTENANCE',
      description: `Checagem de integridade do SQLite executada. Resultado: ${isOk ? '100% Íntegro (ok)' : JSON.stringify(result)}`,
      details: JSON.stringify(result)
    });

    res.json({
      success: true,
      isOk,
      details: result
    });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao checar integridade do banco: ' + err.message });
  }
});

// ------------------------------------------------------------------------------
// 3. DESFRAGMENTAÇÃO & OTIMIZAÇÃO (VACUUM & PRAGMA optimize)
// ------------------------------------------------------------------------------
maintenanceRouter.post('/api/admin/maintenance/db/vacuum', requireMaster, (req, res) => {
  try {
    const sizeBefore = fs.existsSync(DB_PATH) ? fs.statSync(DB_PATH).size : 0;
    
    db.exec('VACUUM;');
    try { db.exec('PRAGMA optimize;'); } catch (_e) {}

    const sizeAfter = fs.existsSync(DB_PATH) ? fs.statSync(DB_PATH).size : 0;
    const freed = Math.max(0, sizeBefore - sizeAfter);

    logAudit(req, {
      event_type: 'MANUTENCAO',
      event_name: 'DB_VACUUM',
      module: 'MAINTENANCE',
      description: `Otimização VACUUM executada. Antes: ${formatBytes(sizeBefore)}, Depois: ${formatBytes(sizeAfter)}, Liberado: ${formatBytes(freed)}.`,
      details: JSON.stringify({ sizeBefore, sizeAfter, freed })
    });

    res.json({
      success: true,
      message: 'Banco de dados otimizado e desfragmentado com sucesso!',
      sizeBeforeFormatted: formatBytes(sizeBefore),
      sizeAfterFormatted: formatBytes(sizeAfter),
      freedBytes: freed,
      freedFormatted: formatBytes(freed)
    });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao otimizar banco de dados: ' + err.message });
  }
});

// ------------------------------------------------------------------------------
// 4. CONSOLIDAÇÃO DO ARQUIVO WAL (PRAGMA wal_checkpoint(TRUNCATE))
// ------------------------------------------------------------------------------
maintenanceRouter.post('/api/admin/maintenance/db/checkpoint', requireMaster, (req, res) => {
  try {
    const walPath = `${DB_PATH}-wal`;
    const walBefore = fs.existsSync(walPath) ? fs.statSync(walPath).size : 0;

    db.exec('PRAGMA wal_checkpoint(TRUNCATE);');

    const walAfter = fs.existsSync(walPath) ? fs.statSync(walPath).size : 0;

    logAudit(req, {
      event_type: 'MANUTENCAO',
      event_name: 'DB_WAL_CHECKPOINT',
      module: 'MAINTENANCE',
      description: `Checkpoint WAL executado. WAL antes: ${formatBytes(walBefore)}, WAL depois: ${formatBytes(walAfter)}.`,
      details: JSON.stringify({ walBefore, walAfter })
    });

    res.json({
      success: true,
      message: 'Checkpoint WAL concluído! Arquivo temporário de transações consolidado.',
      walBeforeFormatted: formatBytes(walBefore),
      walAfterFormatted: formatBytes(walAfter)
    });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao executar checkpoint WAL: ' + err.message });
  }
});

// ------------------------------------------------------------------------------
// 5. RECONSTRUÇÃO DE ÍNDICES (REINDEX)
// ------------------------------------------------------------------------------
maintenanceRouter.post('/api/admin/maintenance/db/reindex', requireMaster, (req, res) => {
  try {
    db.exec('REINDEX;');

    logAudit(req, {
      event_type: 'MANUTENCAO',
      event_name: 'DB_REINDEX',
      module: 'MAINTENANCE',
      description: 'Reconstrução de todos os índices do SQLite concluída.',
      details: 'REINDEX executado com sucesso'
    });

    res.json({
      success: true,
      message: 'Todos os 41 índices de busca foram reconstruídos com sucesso!'
    });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao reconstruir índices: ' + err.message });
  }
});

// ------------------------------------------------------------------------------
// 6. CENTRAL DE BACKUPS — LISTAGEM & SNAPSHOT
// ------------------------------------------------------------------------------
maintenanceRouter.get('/api/admin/maintenance/backups', requireMaster, (req, res) => {
  try {
    const items = [];
    if (fs.existsSync(BACKUPS_DIR)) {
      const files = fs.readdirSync(BACKUPS_DIR);
      for (const file of files) {
        if (file.startsWith('.')) continue;
        const fullPath = path.join(BACKUPS_DIR, file);
        try {
          const stat = fs.statSync(fullPath);
          if (stat.isFile()) {
            items.push({
              filename: file,
              sizeBytes: stat.size,
              sizeFormatted: formatBytes(stat.size),
              createdAt: stat.mtime.toISOString(),
              createdAtFormatted: stat.mtime.toLocaleString('pt-BR')
            });
          }
        } catch (_e) {}
      }
    }

    // Ordena do mais recente para o mais antigo
    items.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    res.json({
      success: true,
      backups: items
    });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao listar backups: ' + err.message });
  }
});

// Criação de Snapshot Imediato a Quente
maintenanceRouter.post('/api/admin/maintenance/backups/create', requireMaster, (req, res) => {
  try {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupFileName = `backup_jorgealvim_${timestamp}.sqlite`;
    const targetPath = path.join(BACKUPS_DIR, backupFileName);

    // Snapshot a quente via VACUUM INTO sem travar conexões
    db.exec(`VACUUM INTO '${targetPath}';`);

    const stat = fs.statSync(targetPath);

    logAudit(req, {
      event_type: 'MANUTENCAO',
      event_name: 'BACKUP_CREATE_SNAPSHOT',
      module: 'MAINTENANCE',
      description: `Novo snapshot gerado com sucesso: ${backupFileName} (${formatBytes(stat.size)}).`,
      details: JSON.stringify({ filename: backupFileName, size: stat.size })
    });

    res.json({
      success: true,
      message: 'Snapshot de backup gerado com sucesso!',
      backup: {
        filename: backupFileName,
        sizeBytes: stat.size,
        sizeFormatted: formatBytes(stat.size),
        createdAtFormatted: new Date().toLocaleString('pt-BR')
      }
    });
  } catch (err) {
    console.error('[MAINTENANCE] Erro ao criar backup:', err);
    res.status(500).json({ error: 'Erro ao criar backup: ' + err.message });
  }
});

// Download Seguro de Arquivo de Backup
maintenanceRouter.get('/api/admin/maintenance/backups/download/:filename', requireMaster, (req, res) => {
  try {
    const safeName = path.basename(req.params.filename);
    const fullPath = path.join(BACKUPS_DIR, safeName);

    if (!fs.existsSync(fullPath)) {
      return res.status(404).json({ error: 'Arquivo de backup não encontrado.' });
    }

    logAudit(req, {
      event_type: 'MANUTENCAO',
      event_name: 'BACKUP_DOWNLOAD',
      module: 'MAINTENANCE',
      description: `Download do backup ${safeName} realizado pelo mestre.`,
      details: safeName
    });

    res.download(fullPath, safeName);
  } catch (err) {
    res.status(500).json({ error: 'Erro ao baixar backup: ' + err.message });
  }
});

// ------------------------------------------------------------------------------
// 7. GESTÃO DE SESSÕES ATIVAS & DESCONEXÃO GERAL
// ------------------------------------------------------------------------------
maintenanceRouter.get('/api/admin/maintenance/sessions', requireMaster, (req, res) => {
  try {
    const rows = db.prepare(`
      SELECT token, kind, data, expires_at 
      FROM auth_sessions 
      WHERE expires_at > ?
      ORDER BY expires_at DESC
    `).all(Date.now());

    const activeList = rows.map(r => {
      let parsed = {};
      try { parsed = JSON.parse(r.data); } catch (_e) {}
      return {
        tokenSnippet: r.token.slice(0, 8) + '...',
        isCurrent: req.user.token ? r.token === req.user.token : false,
        kind: r.kind,
        name: parsed.name || parsed.fullName || 'Usuário',
        username: parsed.username || parsed.email || parsed.cpf || 'N/D',
        role: parsed.role || r.kind,
        expiresAtFormatted: new Date(r.expires_at).toLocaleString('pt-BR')
      };
    });

    res.json({
      success: true,
      count: activeList.length,
      sessions: activeList
    });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao listar sessões: ' + err.message });
  }
});

// Desconectar Todos (Exceto a Sessão do Próprio Mestre)
maintenanceRouter.post('/api/admin/maintenance/sessions/disconnect-all', requireMaster, (req, res) => {
  try {
    const currentToken = req.headers['authorization']?.replace('Bearer ', '') || req.query.token;

    // Limpa todas do SQLite, exceto a atual
    if (currentToken) {
      db.prepare(`DELETE FROM auth_sessions WHERE token != ?`).run(currentToken);
    } else {
      db.exec(`DELETE FROM auth_sessions;`);
    }

    // Limpa Maps em memória
    for (const [tk] of sessions.entries()) {
      if (tk !== currentToken) sessions.delete(tk);
    }
    clientSessions.clear();
    employeeSessions.clear();

    logAudit(req, {
      event_type: 'MANUTENCAO',
      event_name: 'DISCONNECT_ALL_SESSIONS',
      module: 'MAINTENANCE',
      description: 'Desconexão global de usuários executada pelo Usuário Mestre.',
      details: 'Sessões limpas'
    });

    res.json({
      success: true,
      message: 'Todas as outras sessões ativas foram desconectadas com sucesso!'
    });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao desconectar sessões: ' + err.message });
  }
});

// ------------------------------------------------------------------------------
// 8. GESTÃO DE STORAGE & ARQUIVOS ÓRFÃOS
// ------------------------------------------------------------------------------
maintenanceRouter.get('/api/admin/maintenance/storage', requireMaster, (req, res) => {
  try {
    const clientsSize = getDirSize(STORAGE_DIR);
    const driveSize = getDirSize(STORAGE_DRIVE_DIR);

    // Caçador de arquivos órfãos em storage/clients
    let orphanCount = 0;
    let orphanBytes = 0;
    if (fs.existsSync(STORAGE_DIR)) {
      const clientFolders = fs.readdirSync(STORAGE_DIR);
      for (const folder of clientFolders) {
        if (folder.startsWith('.')) continue;
        const existsInDb = db.prepare('SELECT id FROM clients WHERE id = ?').get(folder);
        if (!existsInDb) {
          orphanCount++;
          orphanBytes += getDirSize(path.join(STORAGE_DIR, folder));
        }
      }
    }

    res.json({
      success: true,
      storage: {
        clientsStorageFormatted: formatBytes(clientsSize),
        driveStorageFormatted: formatBytes(driveSize),
        totalStorageFormatted: formatBytes(clientsSize + driveSize),
        orphanFoldersCount: orphanCount,
        orphanBytesFormatted: formatBytes(orphanBytes)
      }
    });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao analisar storage: ' + err.message });
  }
});

// ------------------------------------------------------------------------------
// 9. PURGA DE AUDIT LOGS ANTIGOS (LGPD)
// ------------------------------------------------------------------------------
maintenanceRouter.post('/api/admin/maintenance/audit/purge', requireMaster, (req, res) => {
  try {
    const days = parseInt(req.body.days) || 180;
    const cutoffDate = new Date(Date.now() - days * 86400 * 1000).toISOString();

    const info = db.prepare(`DELETE FROM audit_logs WHERE created_at < ?`).run(cutoffDate);

    logAudit(req, {
      event_type: 'MANUTENCAO',
      event_name: 'PURGE_AUDIT_LOGS',
      module: 'MAINTENANCE',
      description: `Purga de logs com mais de ${days} dias executada (${info.changes} registros excluídos).`,
      details: JSON.stringify({ days, deleted: info.changes })
    });

    res.json({
      success: true,
      deletedCount: info.changes,
      message: `${info.changes} registros de auditoria antigos excluídos com sucesso!`
    });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao purgar logs: ' + err.message });
  }
});

// ------------------------------------------------------------------------------
// 10. INTERRUPTOR DE MODO MANUTENÇÃO
// ------------------------------------------------------------------------------
maintenanceRouter.get('/api/admin/maintenance/mode', requireMaster, (req, res) => {
  try {
    const row = db.prepare("SELECT value FROM system_settings WHERE key = 'maintenance_mode'").get();
    const active = row ? row.value === 'true' || row.value === '1' : false;
    res.json({ success: true, active });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao obter modo manutenção: ' + err.message });
  }
});

maintenanceRouter.post('/api/admin/maintenance/mode', requireMaster, (req, res) => {
  try {
    const { active } = req.body;
    const valStr = active ? 'true' : 'false';

    db.prepare(`
      INSERT INTO system_settings (key, value, updated_at)
      VALUES ('maintenance_mode', ?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
    `).run(valStr, new Date().toISOString());

    logAudit(req, {
      event_type: 'MANUTENCAO',
      event_name: 'TOGGLE_MAINTENANCE_MODE',
      module: 'MAINTENANCE',
      description: `Modo de manutenção alterado para: ${active ? 'ATIVADO' : 'DESATIVADO'}`,
      details: JSON.stringify({ active })
    });

    res.json({
      success: true,
      active: Boolean(active),
      message: active 
        ? 'Modo de Manutenção ATIVADO. Apenas o Usuário Mestre tem acesso irrestrito.' 
        : 'Modo de Manutenção DESATIVADO. Acesso normal restabelecido para todos.'
    });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao alterar modo manutenção: ' + err.message });
  }
});
