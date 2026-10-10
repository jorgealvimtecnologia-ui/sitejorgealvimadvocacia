/**
 * Indicadores do dono (AUD-17) — dentro da aba Financeiro (mesma permissão: tab_financial).
 * Lê GET /api/financial/owner-indicators e mostra: receita e margem por área, inadimplência, previsão de caixa,
 * origem dos clientes e o dinheiro de terceiros (sempre separado). Termina com a conferência contra o livro caixa.
 */
(function () {
  'use strict';

  var ID = 'owner-indicators-modal';
  var state = { months: 12, horizon: 6 };

  function esc(t) { return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function money(v) { return 'R$ ' + (Number(v) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
  function monthLabel(m) { var p = m.split('-'); return ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'][Number(p[1]) - 1] + '/' + p[0].slice(2); }
  function headers() { return (typeof getAuthHeaders === 'function') ? getAuthHeaders() : {}; }

  function bar(pct, color) {
    return '<div class="h-2.5 rounded-full bg-slate-100 overflow-hidden" aria-hidden="true"><div class="h-2.5 rounded-full ' + color + '" style="width:' + Math.max(0, Math.min(100, pct)) + '%"></div></div>';
  }
  function tile(label, value, sub, tone) {
    var tones = { ok: 'border-emerald-200 bg-emerald-50', warn: 'border-amber-300 bg-amber-50', bad: 'border-rose-200 bg-rose-50', info: 'border-sky-200 bg-sky-50', neutral: 'border-slate-200 bg-white' };
    return '<div class="rounded-2xl border p-3.5 ' + (tones[tone] || tones.neutral) + '"><div class="text-[10px] font-extrabold uppercase tracking-wider text-slate-600">' + label + '</div><div class="text-xl font-extrabold text-navy-950 font-serif mt-0.5">' + value + '</div><div class="text-[11px] text-slate-600 mt-0.5">' + sub + '</div></div>';
  }
  function section(title, note, body) {
    return '<section class="rounded-2xl border border-slate-200 bg-white p-4"><h4 class="font-extrabold text-sm text-navy-950">' + title + '</h4>' + (note ? '<p class="text-[11px] text-slate-500 mb-3">' + esc(note) + '</p>' : '<div class="mb-2"></div>') + body + '</section>';
  }

  function shell() {
    var m = document.getElementById(ID);
    if (m) return m;
    m = document.createElement('div');
    m.id = ID;
    m.className = 'hidden fixed inset-0 z-[999999] bg-slate-900/60 backdrop-blur-sm flex items-start justify-center p-2 sm:p-5 overflow-y-auto';
    m.setAttribute('role', 'dialog'); m.setAttribute('aria-modal', 'true'); m.setAttribute('aria-labelledby', 'oi-title');
    m.innerHTML = '<div class="bg-slate-50 rounded-3xl max-w-5xl w-full p-4 sm:p-6 shadow-2xl border border-slate-200 relative my-4 space-y-4 text-xs text-slate-700">' +
      '<button type="button" onclick="closeOwnerIndicators()" class="absolute right-4 top-3 text-slate-400 hover:text-slate-700 text-2xl font-bold" aria-label="Fechar">&times;</button>' +
      '<div class="flex flex-wrap items-end justify-between gap-3 pr-8"><div><h3 id="oi-title" class="font-serif font-bold text-xl text-navy-950">📊 Indicadores do dono</h3><p class="text-[11px] text-slate-500">Tudo calculado a partir do livro caixa, das parcelas dos contratos, dos alvarás e do funil de contatos.</p></div>' +
      '<div class="flex gap-2"><label class="text-[11px] font-bold">Histórico <select id="oi-months" class="ml-1 px-2 py-1 rounded-lg border border-slate-300 bg-white"><option value="3">3 meses</option><option value="6">6 meses</option><option value="12" selected>12 meses</option><option value="24">24 meses</option></select></label>' +
      '<label class="text-[11px] font-bold">Previsão <select id="oi-horizon" class="ml-1 px-2 py-1 rounded-lg border border-slate-300 bg-white"><option value="3">3 meses</option><option value="6" selected>6 meses</option></select></label></div></div>' +
      '<div id="oi-body" aria-live="polite">Carregando…</div></div>';
    document.body.appendChild(m);
    m.querySelector('#oi-months').addEventListener('change', function (e) { state.months = Number(e.target.value); loadOwnerIndicators(); });
    m.querySelector('#oi-horizon').addEventListener('change', function (e) { state.horizon = Number(e.target.value); loadOwnerIndicators(); });
    return m;
  }

  function renderAreas(d) {
    var a = d.revenue_by_area;
    if (!a.rows.length && !a.revenue_without_client) return '<p class="text-slate-400">Sem receitas pagas no período.</p>';
    var rows = a.rows.map(function (r) {
      return '<tr class="border-t border-slate-100"><td class="py-1.5 pr-2 font-bold text-slate-800">' + esc(r.area) + '</td><td class="py-1.5 pr-2 w-1/3">' + bar(r.share, 'bg-gradient-to-r from-gold-500 to-amber-500') + '</td><td class="py-1.5 pr-2 text-right font-mono">' + money(r.revenue) + ' <span class="text-slate-500">(' + r.share + '%)</span></td><td class="py-1.5 text-right font-mono ' + (r.direct_margin < 0 ? 'text-rose-700' : 'text-emerald-700') + '">' + money(r.direct_margin) + '</td></tr>';
    }).join('');
    return '<div class="overflow-x-auto"><table class="w-full text-left"><caption class="sr-only">Receita e margem direta por área do direito</caption><thead><tr class="text-[10px] uppercase text-slate-500"><th class="pb-1">Área</th><th></th><th class="pb-1 text-right">Receita (% do total)</th><th class="pb-1 text-right">Margem direta</th></tr></thead><tbody>' + rows + '</tbody></table></div>' +
      '<p class="mt-2 text-[11px] text-slate-600">Receitas sem cliente vinculado: <b>' + money(a.revenue_without_client) + '</b> • Despesas gerais (não rateadas): <b>' + money(a.general_expense) + '</b></p>';
  }

  function renderDelinquency(d) {
    var q = d.delinquency;
    var max = Math.max(1, q.aging['1-30'], q.aging['31-60'], q.aging['61-90'], q.aging['90+']);
    var aging = [['1-30', '1 a 30 dias', 'bg-amber-400'], ['31-60', '31 a 60 dias', 'bg-orange-500'], ['61-90', '61 a 90 dias', 'bg-rose-500'], ['90+', 'Mais de 90 dias', 'bg-rose-700']].map(function (x) {
      return '<div class="flex items-center gap-2 mb-1.5"><span class="w-28 text-[11px]">' + x[1] + '</span><div class="flex-1">' + bar(q.aging[x[0]] / max * 100, x[2]) + '</div><span class="w-28 text-right font-mono">' + money(q.aging[x[0]]) + '</span></div>';
    }).join('');
    var top = q.top_debtors.length ? '<table class="w-full text-left mt-3"><caption class="sr-only">Maiores valores em atraso</caption><thead><tr class="text-[10px] uppercase text-slate-500"><th>Cliente</th><th class="text-right">Em atraso</th><th class="text-right">Parcelas</th><th class="text-right">Mais antiga</th></tr></thead><tbody>' +
      q.top_debtors.map(function (t) { return '<tr class="border-t border-slate-100"><td class="py-1 font-semibold">' + esc(t.name) + '</td><td class="py-1 text-right font-mono">' + money(t.amount) + '</td><td class="py-1 text-right">' + t.installments + '</td><td class="py-1 text-right">' + t.oldest_days + ' dias</td></tr>'; }).join('') + '</tbody></table>' : '<p class="text-emerald-700 font-bold mt-2">Nenhuma parcela em atraso. 🎉</p>';
    return aging + top + (q.other_receivables_overdue ? '<p class="mt-2 text-[11px] text-amber-800">Outras receitas lançadas e vencidas (fora de parcelas): <b>' + money(q.other_receivables_overdue) + '</b></p>' : '');
  }

  function renderForecast(d) {
    var f = d.cash_forecast;
    var max = Math.max(1, Math.max.apply(null, f.months.map(function (m) { return Math.max(m.inflow, m.outflow_projected); })));
    var rows = f.months.map(function (m) {
      return '<tr class="border-t border-slate-100"><td class="py-1.5 font-bold">' + monthLabel(m.month) + '</td>' +
        '<td class="py-1.5 pr-2"><div class="flex items-center gap-2">' + bar(m.inflow / max * 100, 'bg-emerald-500') + '<span class="font-mono whitespace-nowrap">' + money(m.inflow) + '</span></div></td>' +
        '<td class="py-1.5 pr-2"><div class="flex items-center gap-2">' + bar(m.outflow_projected / max * 100, 'bg-rose-400') + '<span class="font-mono whitespace-nowrap">' + money(m.outflow_projected) + '</span></div></td>' +
        '<td class="py-1.5 text-right font-mono ' + (m.net < 0 ? 'text-rose-700' : 'text-emerald-700') + '">' + money(m.net) + '</td>' +
        '<td class="py-1.5 text-right font-mono font-bold ' + (m.accumulated < 0 ? 'text-rose-700' : 'text-slate-800') + '">' + money(m.accumulated) + '</td></tr>';
    }).join('');
    return '<div class="overflow-x-auto"><table class="w-full text-left"><caption class="sr-only">Previsão de caixa por mês</caption><thead><tr class="text-[10px] uppercase text-slate-500"><th>Mês</th><th>Entradas previstas</th><th>Saídas previstas</th><th class="text-right">Resultado</th><th class="text-right">Acumulado</th></tr></thead><tbody>' + rows + '</tbody></table></div>' +
      '<p class="mt-2 text-[11px] text-slate-600">Média mensal de despesas dos últimos 3 meses: <b>' + money(f.avg_monthly_expense_3m) + '</b></p>';
  }

  function renderOrigins(d) {
    var o = d.lead_origins;
    if (!o.rows.length) return '<p class="text-slate-400">Nenhum contato recebido no período.</p>';
    return '<div class="overflow-x-auto"><table class="w-full text-left"><caption class="sr-only">Contatos, clientes e contratos por origem</caption><thead><tr class="text-[10px] uppercase text-slate-500"><th>Origem</th><th class="text-right">Contatos</th><th class="text-right">Viraram cliente</th><th class="text-right">Contratos</th><th class="text-right">Conversão</th><th class="text-right">Receita</th></tr></thead><tbody>' +
      o.rows.map(function (r) { return '<tr class="border-t border-slate-100"><td class="py-1.5 font-semibold">' + esc(r.origin) + '</td><td class="py-1.5 text-right">' + r.leads + '</td><td class="py-1.5 text-right">' + r.clients + '</td><td class="py-1.5 text-right">' + r.contracts + '</td><td class="py-1.5 text-right font-bold">' + r.conversion_percent + '%</td><td class="py-1.5 text-right font-mono">' + money(r.revenue) + '</td></tr>'; }).join('') + '</tbody></table></div>';
  }

  async function loadOwnerIndicators() {
    var body = document.getElementById('oi-body');
    body.textContent = 'Carregando…';
    try {
      var r = await fetch('/api/financial/owner-indicators?months=' + state.months + '&horizon=' + state.horizon, { headers: headers() });
      var d = await r.json();
      if (!r.ok) { body.textContent = r.status === 403 ? 'Você não tem permissão para ver os indicadores financeiros.' : (d.error || 'Não foi possível carregar.'); return; }
      var rc = d.reconciliation;
      var resultado = rc.ledger_revenue - rc.ledger_expense;
      body.innerHTML =
        '<div class="grid grid-cols-2 lg:grid-cols-4 gap-3">' +
        tile('Receita no período', money(rc.ledger_revenue), 'Honorários recebidos (livro caixa)', 'ok') +
        tile('Resultado no período', money(resultado), 'Receitas − despesas pagas', resultado < 0 ? 'bad' : 'neutral') +
        tile('Em atraso (parcelas)', money(d.delinquency.overdue_total), d.delinquency.overdue_count + ' parcela(s) • ' + d.delinquency.rate_percent + '% do que era devido', d.delinquency.overdue_total > 0 ? 'warn' : 'ok') +
        tile('Dinheiro de terceiros', money(d.third_party.held_amount), d.third_party.held_count + ' alvará(s) a repassar — NÃO é do escritório', 'info') + '</div>' +
        section('Receita e margem por área do direito', d.revenue_by_area.note, renderAreas(d)) +
        section('Inadimplência', 'Parcelas vencidas e não pagas, por tempo de atraso.', renderDelinquency(d)) +
        section('Previsão de caixa (próximos ' + d.cash_forecast.horizon_months + ' meses)', d.cash_forecast.note, renderForecast(d)) +
        section('De onde vêm os clientes', d.lead_origins.note, renderOrigins(d)) +
        section('Dinheiro de terceiros (alvarás)', d.third_party.note, '<p>A repassar: <b>' + money(d.third_party.held_amount) + '</b> em ' + d.third_party.held_count + ' alvará(s) • Já repassado no período: <b>' + money(d.third_party.transferred_amount) + '</b> em ' + d.third_party.transferred_count + '.</p>') +
        '<div class="rounded-2xl p-3 text-[11px] font-semibold ' + (rc.ok ? 'bg-emerald-50 border border-emerald-200 text-emerald-800' : 'bg-rose-50 border border-rose-300 text-rose-800') + '" role="status">' +
        (rc.ok ? '✅ Conferência: a soma por área bate com o livro caixa (receitas ' + money(rc.ledger_revenue) + ' e despesas ' + money(rc.ledger_expense) + ', diferença R$ 0,00).' : '⚠️ Atenção: há diferença entre os indicadores e o livro caixa (receitas ' + money(rc.revenue_diff) + ', despesas ' + money(rc.expense_diff) + '). Avise o suporte.') + '</div>';
    } catch (e) {
      body.textContent = 'Erro ao conectar ao servidor.';
    }
  }

  function openOwnerIndicators() { shell().classList.remove('hidden'); loadOwnerIndicators(); }
  function closeOwnerIndicators() { var m = document.getElementById(ID); if (m) m.classList.add('hidden'); }

  window.openOwnerIndicators = openOwnerIndicators;
  window.closeOwnerIndicators = closeOwnerIndicators;
})();
