import express from 'express';
import { db } from '../../config/db.js';
import { requireAuth } from '../../middleware/auth.js';
import { logAudit } from '../../middleware/audit.js';
import { createNotification } from '../notifications/notifications.routes.js';

export const syncRouter = express.Router();

// ============================================================================
//  MOTOR DE SINCRONIZAÇÃO (Fase 1)
//  Amarra o sistema "em todos os sentidos":
//   - EXTERNO: puxa automaticamente as publicações da ComunicaAPI/DJEN das
//     OABs do escritório (paginado, com dedupe e vínculo ao processo/cliente).
//   - INTERNO: cada intimação NOVA gera um alerta para revisão; publicações
//     que já têm PRAZO calculado viram evento na agenda automaticamente.
//   - AGENDADOR: roda sozinho de tempos em tempos; registra o status da
//     última sincronização (visível no painel).
//
//  Segurança jurídica: o motor NÃO calcula prazo fatal sozinho (isso depende
//  do tipo de ato). Ele só materializa na agenda os prazos JÁ calculados e
//  alerta o advogado sobre intimações novas para que ele lance o prazo.
// ============================================================================

const OFFICE_LAWYERS = [
  { id: 'dr-jorge-alvim', name: 'Dr. Jorge Alvim', oab: '222943', uf: 'MG' },
  { id: 'MEM-2026-0001', name: 'Dr. Jorge Eduardo Alvim', oab: '198765', uf: 'MG' },
  { id: 'MEM-2026-0002', name: 'Dra. Mariana Fonseca Alvim', oab: '210450', uf: 'MG' },
  { id: 'MEM-2026-0006', name: 'Dr. Roberto Medeiros Fonseca', oab: '165430', uf: 'MG' },
  { id: 'MEM-2026-0007', name: 'Dra. Camila Vasconcelos', oab: '225890', uf: 'MG' }
];

/** Monta a lista de advogados a sincronizar (padrão do escritório + office_members, ou uma OAB-alvo). */
export function resolveLawyers({ targetOab, targetUf = 'MG', targetName } = {}) {
  let lawyers = [...OFFICE_LAWYERS];
  try {
    const members = db.prepare(
      `SELECT id, name, oab_number, oab_uf FROM office_members WHERE status = 'Ativo' AND oab_number IS NOT NULL AND oab_number != ''`
    ).all();
    members.forEach(m => {
      const clean = String(m.oab_number).replace(/\D/g, '');
      if (clean && !lawyers.some(l => l.oab === clean)) {
        lawyers.push({ id: m.id, name: m.name, oab: clean, uf: m.oab_uf || 'MG' });
      }
    });
  } catch (e) { /* office_members pode não existir */ }

  if (targetOab) {
    const clean = String(targetOab).replace(/\D/g, '');
    const known = lawyers.find(l => l.oab === clean);
    lawyers = [known || { id: 'OAB-' + clean, name: targetName || `OAB/${targetUf} ${clean}`, oab: clean, uf: (targetUf || 'MG').toUpperCase() }];
  }
  return lawyers;
}

const insertPublicationStmt = db.prepare(`
  INSERT OR IGNORE INTO court_publications (
    id, comunicacao_id, numero_processo, numeroprocessocommascara,
    sigla_tribunal, nome_orgao, tipo_comunicacao, data_disponibilizacao,
    data_publicacao, texto, nome_classe, destinatarios_json,
    advogado_oab, advogado_nome, lawyer_id, client_id, lawsuit_id,
    status, created_at, updated_at
  ) VALUES (
    @id, @comunicacao_id, @numero_processo, @numeroprocessocommascara,
    @sigla_tribunal, @nome_orgao, @tipo_comunicacao, @data_disponibilizacao,
    @data_publicacao, @texto, @nome_classe, @destinatarios_json,
    @advogado_oab, @advogado_nome, @lawyer_id, @client_id, @lawsuit_id,
    'nao_lido', datetime('now'), datetime('now')
  )
`);

/**
 * EXTERNO → INTERNO: puxa publicações da ComunicaAPI (paginado), grava com dedupe,
 * vincula ao processo interno e emite alerta para cada intimação NOVA.
 */
export async function syncComunicaApi({ targetOab, targetUf, targetName, notify = true } = {}) {
  const lawyers = resolveLawyers({ targetOab, targetUf, targetName });
  let totalFound = 0, totalSaved = 0;
  const errors = [];
  const ITENS = 100, MAX_PAGES = 60;

  for (const lawyer of lawyers) {
    try {
      let pagina = 0;
      while (++pagina <= MAX_PAGES) {
        const url = `https://comunicaapi.pje.jus.br/api/v1/comunicacao?numeroOab=${lawyer.oab}&ufOab=${lawyer.uf}&pagina=${pagina}&itensPorPagina=${ITENS}`;
        const apiRes = await fetch(url, { headers: { 'Accept': 'application/json', 'User-Agent': 'JorgeAlvimAdvocacia/1.0' } });
        if (!apiRes.ok) break;
        const data = await apiRes.json();
        const items = data.items || [];
        if (items.length === 0) break;
        totalFound += items.length;

        for (const item of items) {
          const pubId = `PUB-${item.id}`;
          const cleanNum = (item.numero_processo || '').replace(/\D/g, '');
          let matchedLawsuitId = null, matchedClientId = null;
          if (cleanNum) {
            try {
              const ml = db.prepare(`SELECT id, client_id FROM lawsuits WHERE REPLACE(REPLACE(REPLACE(cnj_number, '.', ''), '-', ''), '/', '') = ? OR cnj_number LIKE ?`).get(cleanNum, `%${cleanNum}%`);
              if (ml) { matchedLawsuitId = ml.id; matchedClientId = ml.client_id; }
            } catch (e) { /* ignora */ }
          }
          const info = insertPublicationStmt.run({
            id: pubId, comunicacao_id: item.id,
            numero_processo: item.numero_processo || '',
            numeroprocessocommascara: item.numeroprocessocommascara || item.numero_processo || '',
            sigla_tribunal: item.siglaTribunal || 'TJMG', nome_orgao: item.nomeOrgao || '',
            tipo_comunicacao: item.tipoComunicacao || 'Intimação',
            data_disponibilizacao: item.data_disponibilizacao || '',
            data_publicacao: item.datadisponibilizacao || item.data_disponibilizacao || '',
            texto: item.texto || '', nome_classe: item.nomeClasse || '',
            destinatarios_json: JSON.stringify(item.destinatarios || []),
            advogado_oab: `OAB/${lawyer.uf} ${lawyer.oab}`, advogado_nome: lawyer.name,
            lawyer_id: lawyer.id, client_id: matchedClientId, lawsuit_id: matchedLawsuitId
          });
          if (info.changes > 0) {
            totalSaved++;
            if (notify) {
              createNotification({
                category: 'prazo', level: 'warning',
                title: `📢 Nova intimação — ${item.tipoComunicacao || 'publicação'}`,
                message: `${item.numeroprocessocommascara || item.numero_processo || 'processo'} • ${item.siglaTribunal || ''} • ${lawyer.name}. Revise e lance o prazo.`,
                link: '#tab:publications', resource_type: 'court_publication', resource_id: pubId,
                dedupe_key: `intimacao:nova:${pubId}`
              });
            }
          }
        }
        if (items.length < ITENS) break;
      }
    } catch (e) {
      errors.push(`OAB ${lawyer.oab}: ${e.message}`);
    }
  }
  return { totalFound, totalSaved, lawyersChecked: lawyers.length, errors };
}

/**
 * INTERNO: materializa na AGENDA os prazos JÁ calculados nas publicações
 * (deadline_date preenchido) que ainda não viraram evento. Não calcula prazo.
 */
export function reconcileDeadlinesToCalendar() {
  let created = 0;
  let pubs = [];
  try {
    pubs = db.prepare(`
      SELECT id, numeroprocessocommascara, tipo_comunicacao, deadline_date,
             lawsuit_id, client_id, advogado_nome, sigla_tribunal
      FROM court_publications
      WHERE deadline_date IS NOT NULL AND deadline_date != '' AND status NOT IN ('arquivado', 'prazo_lancado')
    `).all();
  } catch (e) { return { created: 0 }; }

  const now = new Date().toISOString();
  for (const p of pubs) {
    const evtId = `EVT-${p.id}`; // p.id já vem como "PUB-<n>", evita prefixo duplicado
    try {
      const exists = db.prepare(`SELECT id FROM calendar_events WHERE id = ?`).get(evtId);
      if (!exists) {
        db.prepare(`
          INSERT INTO calendar_events (
            id, title, description, event_type, start_datetime, all_day,
            lawyer_name, client_id, lawsuit_id, lawsuit_number, priority, status,
            notes, created_at, updated_at
          ) VALUES (?, ?, ?, 'prazo_fatal', ?, 1, ?, ?, ?, ?, 'fatal', 'agendado', ?, ?, ?)
        `).run(
          evtId,
          `Prazo: ${p.tipo_comunicacao || 'Intimação'} — ${p.numeroprocessocommascara || 'processo'}`,
          `Prazo materializado automaticamente a partir da publicação ${p.id} (${p.sigla_tribunal || ''}).`,
          p.deadline_date, p.advogado_nome || null, p.client_id || null,
          p.lawsuit_id || null, p.numeroprocessocommascara || null,
          `Origem: publicação ${p.id}`, now, now
        );
        created++;
      }
      db.prepare(`UPDATE court_publications SET status = 'prazo_lancado', updated_at = ? WHERE id = ?`).run(now, p.id);
    } catch (e) { /* segue para a próxima */ }
  }
  return { created };
}

/** Salva/lê o status da última sincronização em system_settings. */
function saveStatus(status) {
  try {
    db.prepare(`INSERT INTO system_settings (key, value, updated_at) VALUES ('sync_last_run', ?, ?)
                ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`)
      .run(JSON.stringify(status), new Date().toISOString());
  } catch (e) { /* system_settings criada pelo server.js */ }
}
export function getSyncStatus() {
  try {
    const row = db.prepare(`SELECT value, updated_at FROM system_settings WHERE key = 'sync_last_run'`).get();
    if (row) { const s = JSON.parse(row.value); s.updated_at = row.updated_at; return s; }
  } catch (e) {}
  return null;
}

let _syncing = false;
/** Ciclo completo: externo (ComunicaAPI) + reconciliação interna (agenda). */
export async function runFullSync(reqOrNull = null) {
  if (_syncing) return { skipped: true, reason: 'Sincronização já em andamento.' };
  _syncing = true;
  const startedAt = new Date().toISOString();
  try {
    const ext = await syncComunicaApi({});
    const rec = reconcileDeadlinesToCalendar();
    const status = {
      started_at: startedAt, finished_at: new Date().toISOString(),
      publicacoes_novas: ext.totalSaved, publicacoes_analisadas: ext.totalFound,
      prazos_criados: rec.created, advogados: ext.lawyersChecked, errors: ext.errors
    };
    saveStatus(status);
    if (ext.totalSaved > 0 || rec.created > 0) {
      console.log(`🔄 [SYNC] ${ext.totalSaved} intimação(ões) nova(s), ${rec.created} prazo(s) na agenda.`);
    }
    if (reqOrNull) {
      logAudit(reqOrNull, {
        event_type: 'SINCRONIZACAO', event_name: 'SYNC_TOTAL', module: 'SYNC',
        resource_id: 'MOTOR-SYNC',
        description: `Sincronização total: ${ext.totalSaved} intimações novas, ${rec.created} prazos criados.`,
        details: status
      });
    }
    return { success: true, ...status };
  } finally {
    _syncing = false;
  }
}

let _started = false;
/** Agendador automático (idempotente). Intervalo configurável via SYNC_INTERVAL_HOURS. */
export function startSyncScheduler() {
  if (_started) return;
  _started = true;
  const hours = Math.max(1, Number(process.env.SYNC_INTERVAL_HOURS) || 12);
  const intervalMs = hours * 60 * 60 * 1000;
  const run = () => { runFullSync().catch(e => console.error('[SYNC] Erro no ciclo automático:', e.message)); };
  setTimeout(run, 30000).unref?.();        // primeira sync ~30s após o boot
  setInterval(run, intervalMs).unref?.();
  console.log(`🔄 [SYNC] Agendador ativo: sincronização automática a cada ${hours}h.`);
}

// ----------------------------------------------------------------------------
//  ROTAS
// ----------------------------------------------------------------------------

/** POST /api/sync/run — "Sincronizar Tudo" manual. */
syncRouter.post('/api/sync/run', requireAuth, async (req, res) => {
  try {
    const result = await runFullSync(req);
    return res.json(result);
  } catch (err) {
    console.error('[SYNC] Falha na sincronização manual:', err);
    return res.status(500).json({ error: 'Erro ao sincronizar: ' + err.message });
  }
});

/** GET /api/sync/status — status da última sincronização. */
syncRouter.get('/api/sync/status', requireAuth, (req, res) => {
  return res.json({ success: true, status: getSyncStatus(), running: _syncing });
});
