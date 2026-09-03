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

function safe(fn, fallback) {
  try { const v = fn(); return v == null ? fallback : v; } catch (e) { return fallback; }
}

/** GET /api/dashboard/overview — visão geral consolidada. */
dashboardRouter.get('/api/dashboard/overview', requireAuth, (req, res) => {
  try {
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
    const inadimplente = safe(() => db.prepare(
      `SELECT COALESCE(SUM(amount),0) v FROM financial_transactions WHERE type='Receita' AND status='Pendente' AND due_date IS NOT NULL AND due_date < ?`
    ).get(todayStr).v, 0);

    // ---- JURÍDICO ----
    const clientesTotal = safe(() => db.prepare(`SELECT COUNT(*) c FROM clients`).get().c, 0);
    const clientesAtivos = safe(() => db.prepare(`SELECT COUNT(*) c FROM clients WHERE contract_status='Ativo'`).get().c, 0);
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
    const prazosFatais = prazos.filter(p => {
      const d = new Date(String(p.date).length <= 10 ? p.date + 'T23:59:59' : p.date);
      return (d - now) / 86400000 <= 3;
    }).length;

    // ---- COMERCIAL ----
    const leadsNovos = safe(() => db.prepare(`SELECT COUNT(*) c FROM leads WHERE status='novo' OR status='Novo' OR status IS NULL`).get().c, 0);
    const leadsMes = safe(() => db.prepare(`SELECT COUNT(*) c FROM leads WHERE created_at LIKE ?`).get(`${monthPrefix}%`).c, 0);

    // ---- RH ----
    const funcionarios = safe(() => db.prepare(`SELECT COUNT(*) c FROM hr_employees WHERE status='Ativo' OR status='ativo' OR status IS NULL`).get().c, 0);

    // ---- COMPLIANCE / NOVOS MÓDULOS ----
    const assinaturasPendentes = safe(() => db.prepare(`SELECT COUNT(*) c FROM signature_requests WHERE status='pendente'`).get().c, 0);
    const assinaturasConcluidas = safe(() => db.prepare(`SELECT COUNT(*) c FROM signature_requests WHERE status='assinado'`).get().c, 0);
    const lgpdAbertas = safe(() => db.prepare(`SELECT COUNT(*) c FROM lgpd_requests WHERE status IN ('aberto','em_andamento')`).get().c, 0);
    const notificacoes = safe(() => db.prepare(`SELECT COUNT(*) c FROM notifications WHERE is_read=0`).get().c, 0);

    return res.json({
      success: true,
      generated_at: nowIso,
      financeiro: {
        receita_mes: receitaMes, despesa_mes: despesaMes, saldo_mes: receitaMes - despesaMes,
        a_receber: aReceber, inadimplente
      },
      juridico: {
        clientes_total: clientesTotal, clientes_ativos: clientesAtivos,
        processos_total: processosTotal, processos_andamento: processosAndamento
      },
      prazos: { proximos: prazos, fatais_3dias: prazosFatais, total_15dias: prazos.length },
      comercial: { leads_novos: leadsNovos, leads_mes: leadsMes },
      rh: { funcionarios_ativos: funcionarios },
      compliance: {
        assinaturas_pendentes: assinaturasPendentes, assinaturas_concluidas: assinaturasConcluidas,
        lgpd_abertas: lgpdAbertas, notificacoes_nao_lidas: notificacoes
      }
    });
  } catch (err) {
    console.error('[DASHBOARD] Falha ao consolidar visão geral:', err);
    return res.status(500).json({ error: 'Erro ao carregar a visão geral.' });
  }
});
