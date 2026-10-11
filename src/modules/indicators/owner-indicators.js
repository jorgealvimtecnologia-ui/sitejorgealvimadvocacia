/**
 * Indicadores do dono (AUD-17) — tudo calculado a partir do MESMO livro caixa (financial_transactions),
 * das parcelas dos contratos, dos alvarás e do funil de leads. Nada é estimado sem avisar:
 *  - receita por área: receitas PAGAS no período, agrupadas pela área do cliente (processo > lead > "sem área");
 *  - margem direta por área = receita − despesas pagas lançadas para clientes daquela área; as despesas gerais
 *    (aluguel, folha etc.) aparecem à parte, não são rateadas;
 *  - previsão de caixa: só entradas CONTRATADAS (parcelas e receitas pendentes) e saídas lançadas ou a média
 *    dos últimos 3 meses (a maior), sem prometer o que não está lançado;
 *  - dinheiro de terceiros: alvarás (parte do cliente) fora de qualquer receita do escritório;
 *  - conferência: soma por área + "sem cliente" = total do livro caixa (diferença zero).
 */
import { classifyArea, NO_AREA } from '../../shared/legal-areas.js';
import { UNKNOWN_ORIGIN } from '../../shared/lead-origin.js';

const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const ym = (d) => d.slice(0, 7);

function addMonths(isoDate, n) {
  const [y, m] = isoDate.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

function daysBetween(a, b) {
  return Math.round((new Date(`${b}T12:00:00Z`) - new Date(`${a}T12:00:00Z`)) / 86400000);
}

/** Área de cada cliente: processo (mais recente com área reconhecida) > área do lead > sem área. */
function clientAreaMap(db) {
  const map = new Map();
  const laws = db.prepare(`SELECT client_id, action_type, subject FROM lawsuits WHERE deleted_at IS NULL ORDER BY created_at DESC`).all();
  for (const l of laws) {
    if (map.has(l.client_id)) continue;
    const area = classifyArea(l.action_type) || classifyArea(l.subject);
    if (area) map.set(l.client_id, area);
  }
  const leads = db.prepare(`SELECT client_id, area FROM leads WHERE client_id IS NOT NULL`).all();
  for (const l of leads) {
    if (map.has(l.client_id)) continue;
    const area = classifyArea(l.area);
    if (area) map.set(l.client_id, area);
  }
  return map;
}

export function buildOwnerIndicators(db, { today = new Date().toISOString().slice(0, 10), months = 12, horizon = 6 } = {}) {
  months = Math.min(Math.max(parseInt(months, 10) || 12, 1), 24);
  horizon = [3, 6].includes(Number(horizon)) ? Number(horizon) : 6;
  const fromMonth = addMonths(today, -(months - 1));
  const fromDate = `${fromMonth}-01`;
  const areas = clientAreaMap(db);
  const areaOf = (clientId) => (clientId ? areas.get(clientId) || NO_AREA : null);

  // ---------------------------------------------------------------- 1) livro caixa do período
  const paid = db.prepare(`SELECT type, amount, client_id, payment_date FROM financial_transactions
                           WHERE status = 'Pago' AND deleted_at IS NULL AND payment_date >= ? AND payment_date <= ?`).all(fromDate, `${today}T23:59:59`);
  const byArea = new Map();
  const slot = (a) => { if (!byArea.has(a)) byArea.set(a, { area: a, revenue: 0, direct_expense: 0 }); return byArea.get(a); };
  let revenueNoClient = 0;
  let generalExpense = 0;
  let ledgerRevenue = 0;
  let ledgerExpense = 0;
  for (const t of paid) {
    const a = areaOf(t.client_id);
    if (t.type === 'Receita') {
      ledgerRevenue += t.amount;
      if (a) slot(a).revenue += t.amount; else revenueNoClient += t.amount;
    } else if (t.type === 'Despesa') {
      ledgerExpense += t.amount;
      if (a) slot(a).direct_expense += t.amount; else generalExpense += t.amount;
    }
  }
  const areaRows = [...byArea.values()].map((r) => ({
    area: r.area, revenue: r2(r.revenue), direct_expense: r2(r.direct_expense), direct_margin: r2(r.revenue - r.direct_expense),
    share: ledgerRevenue ? Math.round((r.revenue / ledgerRevenue) * 1000) / 10 : 0,
  })).sort((x, y) => y.revenue - x.revenue);
  const sumAreaRevenue = areaRows.reduce((s, r) => s + r.revenue, 0) + revenueNoClient;
  const sumAreaExpense = areaRows.reduce((s, r) => s + r.direct_expense, 0) + generalExpense;

  // ---------------------------------------------------------------- 2) inadimplência
  const overdue = db.prepare(`SELECT i.id, i.client_id, i.amount, i.due_date, c.full_name FROM contract_installments i
                              LEFT JOIN clients c ON c.id = i.client_id WHERE i.status IN ('Pendente', 'Vencido') AND i.due_date < ?`).all(today);
  const aging = { '1-30': 0, '31-60': 0, '61-90': 0, '90+': 0 };
  const debtors = new Map();
  for (const o of overdue) {
    const d = daysBetween(o.due_date, today);
    aging[d <= 30 ? '1-30' : d <= 60 ? '31-60' : d <= 90 ? '61-90' : '90+'] += o.amount;
    const cur = debtors.get(o.client_id) || { client_id: o.client_id, name: o.full_name || o.client_id, amount: 0, installments: 0, oldest_days: 0 };
    cur.amount += o.amount; cur.installments++; cur.oldest_days = Math.max(cur.oldest_days, d);
    debtors.set(o.client_id, cur);
  }
  const overdueTotal = overdue.reduce((s, o) => s + o.amount, 0);
  const openFuture = db.prepare(`SELECT COALESCE(SUM(amount), 0) AS t FROM contract_installments WHERE status IN ('Pendente', 'Vencido') AND due_date >= ?`).get(today).t;
  const paidInst = db.prepare(`SELECT COALESCE(SUM(COALESCE(NULLIF(paid_amount, 0), amount)), 0) AS t FROM contract_installments WHERE status = 'Pago' AND paid_date >= ? AND paid_date <= ?`).get(fromDate, `${today}T23:59:59`).t;
  const billedBase = paidInst + overdueTotal;
  const delinquency = {
    overdue_total: r2(overdueTotal), overdue_count: overdue.length,
    rate_percent: billedBase ? Math.round((overdueTotal / billedBase) * 1000) / 10 : 0, // vencido ÷ (recebido no período + vencido)
    aging: Object.fromEntries(Object.entries(aging).map(([k, v]) => [k, r2(v)])),
    top_debtors: [...debtors.values()].sort((a, b) => b.amount - a.amount).slice(0, 8).map((d) => ({ ...d, amount: r2(d.amount) })),
    other_receivables_overdue: r2(db.prepare(`SELECT COALESCE(SUM(amount), 0) AS t FROM financial_transactions WHERE type = 'Receita' AND status = 'Pendente' AND deleted_at IS NULL AND installment_id IS NULL AND due_date < ?`).get(today).t),
  };

  // ---------------------------------------------------------------- 3) previsão de caixa (próximos meses)
  const months3 = [];
  const avgBase = [1, 2, 3].map((i) => ym(`${addMonths(today, -i)}-01`));
  const avgExpense = avgBase.reduce((s, m) => s + db.prepare(`SELECT COALESCE(SUM(amount), 0) AS t FROM financial_transactions WHERE type = 'Despesa' AND status = 'Pago' AND deleted_at IS NULL AND payment_date LIKE ?`).get(`${m}%`).t, 0) / 3;
  let accumulated = 0;
  for (let i = 0; i < horizon; i++) {
    const m = addMonths(today, i);
    const lo = i === 0 ? today : `${m}-01`;
    const hi = `${m}-31`;
    const inInst = db.prepare(`SELECT COALESCE(SUM(amount), 0) AS t FROM contract_installments WHERE status IN ('Pendente', 'Vencido') AND due_date >= ? AND due_date <= ?`).get(lo, hi).t;
    const inOther = db.prepare(`SELECT COALESCE(SUM(amount), 0) AS t FROM financial_transactions WHERE type = 'Receita' AND status = 'Pendente' AND deleted_at IS NULL AND installment_id IS NULL AND due_date >= ? AND due_date <= ?`).get(lo, hi).t;
    const outBooked = db.prepare(`SELECT COALESCE(SUM(amount), 0) AS t FROM financial_transactions WHERE type = 'Despesa' AND status = 'Pendente' AND deleted_at IS NULL AND due_date >= ? AND due_date <= ?`).get(lo, hi).t;
    const inflow = inInst + inOther;
    const outflow = Math.max(outBooked, avgExpense);
    accumulated += inflow - outflow;
    months3.push({ month: m, inflow: r2(inflow), outflow_booked: r2(outBooked), outflow_projected: r2(outflow), net: r2(inflow - outflow), accumulated: r2(accumulated) });
  }

  // ---------------------------------------------------------------- 4) origem dos clientes (funil por origem)
  const leads = db.prepare(`SELECT l.id, l.origin, l.client_id, l.stage, l.created_at FROM leads l WHERE l.created_at >= ?`).all(fromDate);
  const hasContract = db.prepare(`SELECT (SELECT COALESCE(contract_value, 0) FROM clients WHERE id = ?) AS v, (SELECT COUNT(*) FROM contract_installments WHERE client_id = ?) AS n`);
  const revenueOf = db.prepare(`SELECT COALESCE(SUM(amount), 0) AS t FROM financial_transactions WHERE type = 'Receita' AND status = 'Pago' AND deleted_at IS NULL AND client_id = ? AND payment_date >= ? AND payment_date <= ?`);
  const byOrigin = new Map();
  for (const l of leads) {
    const o = l.origin || UNKNOWN_ORIGIN;
    const cur = byOrigin.get(o) || { origin: o, leads: 0, clients: 0, contracts: 0, revenue: 0 };
    cur.leads++;
    if (l.client_id) {
      cur.clients++;
      const c = hasContract.get(l.client_id, l.client_id);
      if ((c?.v || 0) > 0 || (c?.n || 0) > 0) cur.contracts++;
      cur.revenue += revenueOf.get(l.client_id, fromDate, `${today}T23:59:59`).t;
    }
    byOrigin.set(o, cur);
  }
  const origins = [...byOrigin.values()].map((r) => ({ ...r, revenue: r2(r.revenue), conversion_percent: r.leads ? Math.round((r.contracts / r.leads) * 1000) / 10 : 0 })).sort((a, b) => b.leads - a.leads);

  // ---------------------------------------------------------------- 5) dinheiro de terceiros (alvarás)
  const held = db.prepare(`SELECT COUNT(*) AS n, COALESCE(SUM(net_client_amount), 0) AS t FROM alvaras WHERE transfer_date IS NULL AND (status IS NULL OR status NOT LIKE 'Repassado%')`).get();
  const transferred = db.prepare(`SELECT COUNT(*) AS n, COALESCE(SUM(net_client_amount), 0) AS t FROM alvaras WHERE (transfer_date IS NOT NULL OR status LIKE 'Repassado%') AND release_date >= ?`).get(fromDate);

  return {
    generated_at: new Date().toISOString(),
    period: { from: fromDate, to: today, months },
    revenue_by_area: { rows: areaRows, revenue_without_client: r2(revenueNoClient), general_expense: r2(generalExpense), note: 'Margem direta = receita − despesas lançadas para clientes da área. Despesas gerais não são rateadas.' },
    delinquency,
    cash_forecast: { horizon_months: horizon, avg_monthly_expense_3m: r2(avgExpense), months: months3, note: 'Considera só entradas já contratadas/lançadas; saídas = a maior entre as lançadas e a média dos últimos 3 meses. Não inclui o saldo atual em conta.' },
    lead_origins: { rows: origins, note: `Leads recebidos desde ${fromDate}. "${UNKNOWN_ORIGIN}" = anteriores à captura de origem ou cadastrados à mão.` },
    third_party: { held_count: held.n, held_amount: r2(held.t), transferred_count: transferred.n, transferred_amount: r2(transferred.t), note: 'Parte do cliente nos alvarás: NÃO é receita do escritório e fica fora de todos os indicadores acima.' },
    reconciliation: {
      ledger_revenue: r2(ledgerRevenue), revenue_by_area_sum: r2(sumAreaRevenue), revenue_diff: r2(ledgerRevenue - sumAreaRevenue),
      ledger_expense: r2(ledgerExpense), expense_by_area_sum: r2(sumAreaExpense), expense_diff: r2(ledgerExpense - sumAreaExpense),
      ok: Math.abs(ledgerRevenue - sumAreaRevenue) < 0.005 && Math.abs(ledgerExpense - sumAreaExpense) < 0.005,
    },
  };
}
