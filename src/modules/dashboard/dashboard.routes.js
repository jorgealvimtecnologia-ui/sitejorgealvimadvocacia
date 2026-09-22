import express from 'express';
import { db } from '../../config/db.js';
import { requireAuth } from '../../middleware/auth.js';

export const dashboardRouter = express.Router();

// ============================================================================
//  DASHBOARD EXECUTIVO UNIFICADO
//  Uma única chamada que consolida os KPIs do escritório (financeiro,
//  jurídico, prazos, comercial, RH e compliance) para a aba "Visão Geral".
//  Cada bloco é isolado em try/catch: se uma tabela não existir ou estiver
//  vazia, o bloco retorna zero em vez de derrubar o painel inteiro.
// ============================================================================

let overviewCache = null;
let overviewCacheExpires = 0;

function safe(fn, fallback) {
  try { const v = fn(); return v == null ? fallback : v; } catch (e) { return fallback; }
}

/** GET /api/dashboard/overview — visão geral consolidada do Painel de Comando Executivo. */
dashboardRouter.get('/api/dashboard/overview', requireAuth, (req, res) => {
  try {
    const forceRefresh = req.query.refresh === '1' || req.query.refresh === 'true';
    if (!forceRefresh && overviewCache && Date.now() < overviewCacheExpires) {
      return res.json(overviewCache);
    }

    const now = new Date();
    const monthPrefix = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const in15 = new Date(now.getTime() + 15 * 86400000).toISOString();
    const nowIso = now.toISOString();
    const todayStr = nowIso.slice(0, 10);

    // ---- FINANCEIRO ----
    const receitaMes = safe(() => db.prepare(
      `SELECT COALESCE(SUM(amount),0) v FROM financial_transactions WHERE type='Receita' AND status='Pago' AND (payment_date LIKE ? OR (payment_date IS NULL AND created_at LIKE ?))`
    ).get(`${monthPrefix}%`, `${monthPrefix}%`).v, 0);
    const despesaMes = safe(() => db.prepare(
      `SELECT COALESCE(SUM(amount),0) v FROM financial_transactions WHERE type='Despesa' AND status='Pago' AND (payment_date LIKE ? OR (payment_date IS NULL AND created_at LIKE ?))`
    ).get(`${monthPrefix}%`, `${monthPrefix}%`).v, 0);
    const aReceber = safe(() => db.prepare(
      `SELECT COALESCE(SUM(amount),0) v FROM financial_transactions WHERE type='Receita' AND status='Pendente'`
    ).get().v, 0);
    const inadimplenteRow = safe(() => db.prepare(
      `SELECT COALESCE(SUM(amount),0) v, COUNT(*) c FROM financial_transactions WHERE type='Receita' AND status='Pendente' AND due_date IS NOT NULL AND due_date < ?`
    ).get(todayStr), { v: 0, c: 0 });
    const inadimplente = inadimplenteRow.v || 0;
    const inadimplenteQtd = inadimplenteRow.c || 0;

    // ---- ALVARÁS & RPVs JUDICIAIS ----
    const alvarasRow = safe(() => db.prepare(
      `SELECT COUNT(*) c, COALESCE(SUM(gross_amount),0) gross, COALESCE(SUM(fee_amount),0) fees FROM alvaras WHERE status LIKE '%Pendente%'`
    ).get(), { c: 0, gross: 0, fees: 0 });
    const alvarasPendentesQtd = alvarasRow.c || 0;
    const alvarasPendentesGross = alvarasRow.gross || 0;
    const alvarasPendentesFees = alvarasRow.fees || 0;

    // ---- JURÍDICO ----
    const clientesTotal = safe(() => db.prepare(`SELECT COUNT(*) c FROM clients WHERE deleted_at IS NULL`).get().c, 0);
    const clientesAtivos = safe(() => db.prepare(`SELECT COUNT(*) c FROM clients WHERE deleted_at IS NULL AND contract_status='Ativo'`).get().c, 0);
    const processosTotal = safe(() => db.prepare(`SELECT COUNT(*) c FROM lawsuits`).get().c, 0);
    const processosAndamento = safe(() => db.prepare(`SELECT COUNT(*) c FROM lawsuits WHERE status='Em Andamento'`).get().c, 0);

    // ---- PRAZOS (próximos 15 dias) ----
    const prazosAgenda = safe(() => db.prepare(
      `SELECT id, title, start_datetime AS date, event_type AS kind, priority, lawyer_name, client_name, lawsuit_number
       FROM calendar_events
       WHERE status NOT IN ('concluido','cancelado') AND start_datetime >= ? AND start_datetime <= ?`
    ).all(nowIso.slice(0, 10), in15), []);
    const prazosPub = safe(() => db.prepare(
      `SELECT id, tipo_comunicacao AS title, deadline_date AS date, 'publicacao' AS kind, numeroprocessocommascara AS lawsuit_number, advogado_nome AS lawyer_name
       FROM court_publications
       WHERE status NOT IN ('arquivado') AND deadline_date IS NOT NULL AND deadline_date >= ? AND deadline_date <= ?`
    ).all(todayStr, in15.slice(0, 10)), []);
    const prazos = [...prazosAgenda, ...prazosPub]
      .filter(p => p.date)
      .sort((a, b) => String(a.date).localeCompare(String(b.date)))
      .slice(0, 12);
    
    // Prazos hoje e nos próximos 3 dias
    const prazosHoje = prazos.filter(p => String(p.date).slice(0, 10) === todayStr).length;
    const prazosFatais = prazos.filter(p => {
      const d = new Date(String(p.date).length <= 10 ? p.date + 'T23:59:59' : p.date);
      return (d - now) / 86400000 <= 3;
    }).length;

    // Audiências do dia
    const audienciasHoje = safe(() => db.prepare(
      `SELECT COUNT(*) c FROM calendar_events WHERE status NOT IN ('concluido','cancelado') AND (event_type LIKE '%audi%' OR title LIKE '%audi%') AND start_datetime LIKE ?`
    ).get(`${todayStr}%`).c, 0);

    // ---- COMERCIAL ----
    const leadsNovos = safe(() => db.prepare(`SELECT COUNT(*) c FROM leads WHERE status='novo' OR status='Novo' OR status IS NULL`).get().c, 0);
    const leadsMes = safe(() => db.prepare(`SELECT COUNT(*) c FROM leads WHERE created_at LIKE ?`).get(`${monthPrefix}%`).c, 0);

    // ---- RH & EQUIPE ----
    const funcionarios = safe(() => db.prepare(`SELECT COUNT(*) c FROM hr_employees WHERE status='Ativo' OR status='ativo' OR status IS NULL`).get().c, 0);
    const pontoHoje = safe(() => db.prepare(`SELECT COUNT(DISTINCT employee_id) c FROM hr_time_clock WHERE record_date = ?`).get(todayStr).c, 0);

    // ---- FOGUETES / DESPACHOS ----
    const foguetesPendentes = safe(() => db.prepare(`SELECT COUNT(*) c FROM rockets WHERE status='pendente' AND is_archived = 0`).get().c, 0);

    // ---- COMPLIANCE / NOVOS MÓDULOS ----
    const assinaturasPendentes = safe(() => db.prepare(`SELECT COUNT(*) c FROM signature_requests WHERE status='pendente'`).get().c, 0);
    const assinaturasConcluidas = safe(() => db.prepare(`SELECT COUNT(*) c FROM signature_requests WHERE status='assinado'`).get().c, 0);
    const lgpdAbertas = safe(() => db.prepare(`SELECT COUNT(*) c FROM lgpd_requests WHERE status IN ('aberto','em_andamento')`).get().c, 0);
    const notificacoes = safe(() => db.prepare(`SELECT COUNT(*) c FROM notifications WHERE is_read=0`).get().c, 0);

    // ---- CÁLCULO DO STATUS DO SEMÁFORO DE RISCO ----
    let riskLevel = 'VERDE';
    let riskMessage = 'Operação em ordem. Nenhum prazo fatal vencendo hoje.';
    if (prazosHoje > 0) {
      riskLevel = 'VERMELHO';
      riskMessage = `Atenção Imediata: ${prazosHoje} prazo(s) fatal(is) com vencimento HOJE!`;
    } else if (prazosFatais > 0 || audienciasHoje > 0) {
      riskLevel = 'AMARELO';
      riskMessage = `Atenção: ${prazosFatais} prazo(s) nos próximos 3 dias • ${audienciasHoje} audiência(s) hoje.`;
    }

    const payload = {
      success: true,
      generated_at: nowIso,
      risco: {
        nivel: riskLevel,
        mensagem: riskMessage,
        prazos_hoje: prazosHoje,
        prazos_3dias: prazosFatais,
        audiencias_hoje: audienciasHoje
      },
      financeiro: {
        receita_mes: receitaMes,
        despesa_mes: despesaMes,
        saldo_mes: receitaMes - despesaMes,
        a_receber: aReceber,
        inadimplente,
        inadimplente_qtd: inadimplenteQtd,
        alvaras_pendentes_qtd: alvarasPendentesQtd,
        alvaras_pendentes_gross: alvarasPendentesGross,
        alvaras_pendentes_fees: alvarasPendentesFees
      },
      juridico: {
        clientes_total: clientesTotal,
        clientes_ativos: clientesAtivos,
        processos_total: processosTotal,
        processos_andamento: processosAndamento
      },
      prazos: {
        proximos: prazos,
        hoje: prazosHoje,
        fatais_3dias: prazosFatais,
        total_15dias: prazos.length
      },
      comercial: {
        leads_novos: leadsNovos,
        leads_mes: leadsMes
      },
      equipe: {
        funcionarios_ativos: funcionarios,
        ponto_hoje: pontoHoje,
        foguetes_pendentes: foguetesPendentes
      },
      compliance: {
        assinaturas_pendentes: assinaturasPendentes,
        assinaturas_concluidas: assinaturasConcluidas,
        lgpd_abertas: lgpdAbertas,
        notificacoes_nao_lidas: notificacoes
      }
    };

    overviewCache = payload;
    overviewCacheExpires = Date.now() + 30000; // TTL 30s

    return res.json(payload);
  } catch (err) {
    console.error('[DASHBOARD] Falha ao consolidar visão geral:', err);
    return res.status(500).json({ error: 'Erro ao carregar a visão geral.' });
  }
});

/** GET /api/dashboard/meu-dia-hoje — Cockpit Matinal do Advogado (Prazos, Audiências, DJEN) */
dashboardRouter.get('/api/dashboard/meu-dia-hoje', requireAuth, (req, res) => {
  try {
    const now = new Date();
    const todayStr = now.toISOString().slice(0, 10);
    const tomorrow = new Date(now.getTime() + 86400000);
    const tomorrowStr = tomorrow.toISOString().slice(0, 10);
    const in7Days = new Date(now.getTime() + 7 * 86400000);
    const in7DaysStr = in7Days.toISOString().slice(0, 10);

    // 1. Prazos Fatais de Hoje
    const prazosHoje = safe(() => db.prepare(`
      SELECT id, title, start_datetime as date, 'agenda' as source, lawsuit_number, client_name, priority
      FROM calendar_events
      WHERE status NOT IN ('concluido', 'cancelado') AND (event_type = 'prazo_fatal' OR priority = 'fatal')
        AND start_datetime LIKE ?
    `).all(`${todayStr}%`), []);

    const prazosPubHoje = safe(() => db.prepare(`
      SELECT id, tipo_comunicacao as title, deadline_date as date, 'djen' as source, numeroprocessocommascara as lawsuit_number, nome_orgao as client_name, 'fatal' as priority
      FROM court_publications
      WHERE status NOT IN ('arquivado') AND deadline_date = ?
    `).all(todayStr), []);

    const fatalToday = [...prazosHoje, ...prazosPubHoje];

    // Prazos de Amanhã
    const prazosAmanha = safe(() => db.prepare(`
      SELECT id, title, start_datetime as date, lawsuit_number, client_name
      FROM calendar_events
      WHERE status NOT IN ('concluido', 'cancelado') AND (event_type = 'prazo_fatal' OR priority = 'fatal')
        AND start_datetime LIKE ?
    `).all(`${tomorrowStr}%`), []);

    // Prazos da Semana (próximos 7 dias)
    const prazosSemana = safe(() => db.prepare(`
      SELECT id, title, start_datetime as date, lawsuit_number, client_name
      FROM calendar_events
      WHERE status NOT IN ('concluido', 'cancelado') AND (event_type = 'prazo_fatal' OR priority = 'fatal')
        AND start_datetime > ? AND start_datetime <= ?
      ORDER BY start_datetime ASC
    `).all(`${tomorrowStr}T23:59:59`, `${in7DaysStr}T23:59:59`), []);

    // 2. Audiências de Hoje (com link de sala virtual, cliente e horário)
    const audienciasHoje = safe(() => db.prepare(`
      SELECT id, title, description, event_type, start_datetime, end_datetime, location, meeting_url, lawsuit_number, client_name, status
      FROM calendar_events
      WHERE status NOT IN ('cancelado') AND event_type IN ('audiencia', 'consulta', 'reuniao')
        AND start_datetime LIKE ?
      ORDER BY start_datetime ASC
    `).all(`${todayStr}%`), []);

    // 3. Intimações Recentes do DJEN (para triagem matinal)
    const intimacoesDjen = safe(() => db.prepare(`
      SELECT id, comunicacao_id, numero_processo, numeroprocessocommascara, sigla_tribunal, nome_orgao, tipo_comunicacao, data_disponibilizacao, texto_resumo, status
      FROM court_publications
      WHERE status IN ('nao_lido', 'novo', 'pendente')
      ORDER BY data_disponibilizacao DESC, created_at DESC
      LIMIT 6
    `).all(), []);

    return res.json({
      success: true,
      data_hoje: todayStr,
      hora_atual: now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
      prazos: {
        hoje: fatalToday,
        amanha: prazosAmanha,
        semana: prazosSemana,
        total_hoje: fatalToday.length,
        total_semana: fatalToday.length + prazosAmanha.length + prazosSemana.length
      },
      audiencias: audienciasHoje,
      intimacoes: intimacoesDjen
    });
  } catch (err) {
    console.error('[COCKPIT] Erro ao obter dados de Meu Dia Hoje:', err);
    return res.status(500).json({ error: 'Erro ao carregar dados matinais do advogado.' });
  }
});
