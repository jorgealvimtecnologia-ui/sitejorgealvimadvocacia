/**
 * ROADMAP VIVO — ABA "🧪 TESTES FÍSICOS" (ordens ORD-MUFSK5A6-V21 e ORD-MUFSMMFL-IJ4)
 *
 * Checklist de cada página e botão do site, distribuído em um cronograma por dia útil.
 * O Dr. Jorge marca cada teste como OK ou Falhou (com observação); a aba mostra o teste
 * de hoje, os atrasados, as falhas a corrigir e o cronograma completo. Ao abrir o painel,
 * o sistema pergunta se o teste do dia foi feito.
 */
(function () {
  'use strict';

  var _data = null;       // resposta de /api/admin/qa
  var _all = null;        // todos os itens (carregado só quando há busca)
  var _root = null;       // elemento onde a aba é desenhada
  var _query = '';
  var _openDay = null;    // dia do cronograma aberto { number, date, items }

  function token() {
    try { return localStorage.getItem('ja_admin_token') || sessionStorage.getItem('ja_admin_token') || ''; } catch (e) { return ''; }
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function fmtDate(iso) {
    if (!iso) return '';
    var p = String(iso).slice(0, 10).split('-');
    return p.length === 3 ? p[2] + '/' + p[1] + '/' + p[0] : iso;
  }

  function weekday(iso) {
    return new Date(iso + 'T12:00:00Z').toLocaleDateString('pt-BR', { weekday: 'long', timeZone: 'UTC' });
  }

  async function api(method, url, body) {
    var res = await fetch(url, {
      method: method,
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token() },
      body: body ? JSON.stringify(body) : undefined
    });
    var data = await res.json().catch(function () { return {}; });
    if (!res.ok) throw new Error(data.error || ('HTTP ' + res.status));
    return data;
  }

  // ---------------------------------------------------------------------------
  // Itens
  // ---------------------------------------------------------------------------
  var STATUS_META = {
    pendente: { label: '⏳ Pendente', cls: 'bg-slate-100 text-slate-700 border-slate-200' },
    ok: { label: '✅ OK', cls: 'bg-emerald-100 text-emerald-800 border-emerald-200' },
    falhou: { label: '❌ Falhou', cls: 'bg-rose-100 text-rose-800 border-rose-200' }
  };

  function renderItem(it) {
    var meta = STATUS_META[it.status] || STATUS_META.pendente;
    var id = esc(it.id);
    var done = it.status !== 'pendente';
    return '' +
      '<div class="p-3 rounded-2xl border border-slate-200 bg-white space-y-1.5" data-qa-item="' + id + '">' +
        '<div class="flex flex-wrap items-center justify-between gap-2">' +
          '<div class="text-[10px] text-slate-500">' + esc(it.page) + ' › <strong>' + esc(it.section) + '</strong> • ' + esc(it.kind) + ' • Dia ' + esc(it.day) + ' (' + fmtDate(it.date) + ')</div>' +
          '<div class="flex items-center gap-1.5">' +
            '<span class="text-[10px] font-bold px-2 py-0.5 rounded-full border ' + meta.cls + '">' + meta.label + '</span>' +
            '<a href="' + esc(it.url) + '" target="_blank" rel="noopener" class="text-[10px] font-bold text-indigo-700 hover:underline">Abrir ↗</a>' +
          '</div>' +
        '</div>' +
        '<div class="text-xs font-bold text-slate-900">' + esc(it.label) + '</div>' +
        '<div class="text-[11px] text-slate-600 leading-snug">' + esc(it.how) + '</div>' +
        (it.note ? '<div class="text-[11px] ' + (it.status === 'falhou' ? 'text-rose-700' : 'text-slate-600') + '">📝 ' + esc(it.note) + '</div>' : '') +
        (it.tested_at ? '<div class="text-[10px] text-slate-400">Registrado por ' + esc(it.tested_by) + ' em ' + new Date(it.tested_at).toLocaleString('pt-BR') + '</div>' : '') +
        '<div class="flex flex-wrap gap-1.5 pt-1">' +
          '<button type="button" onclick="window.QA.mark(\'' + id + '\', \'ok\')" class="px-2.5 py-1 rounded-lg text-[11px] font-bold bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer">✅ OK</button>' +
          '<button type="button" onclick="window.QA.mark(\'' + id + '\', \'falhou\')" class="px-2.5 py-1 rounded-lg text-[11px] font-bold bg-rose-600 hover:bg-rose-700 text-white cursor-pointer">❌ Falhou</button>' +
          (done ? '<button type="button" onclick="window.QA.mark(\'' + id + '\', \'refazer\')" class="px-2.5 py-1 rounded-lg text-[11px] font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 cursor-pointer">↺ Refazer</button>' : '') +
        '</div>' +
      '</div>';
  }

  function renderList(title, items, emptyText, openByDefault) {
    return '' +
      '<details class="rounded-2xl border border-slate-200 bg-slate-50/60 p-3"' + (openByDefault ? ' open' : '') + '>' +
        '<summary class="text-xs font-black text-slate-800 cursor-pointer">' + title + ' (' + items.length + ')</summary>' +
        (items.length
          ? '<div class="grid grid-cols-1 lg:grid-cols-2 gap-2.5 mt-3">' + items.map(renderItem).join('') + '</div>'
          : '<div class="text-xs text-slate-500 mt-2">' + emptyText + '</div>') +
      '</details>';
  }

  // ---------------------------------------------------------------------------
  // Painel
  // ---------------------------------------------------------------------------
  function renderHeader(d) {
    var s = d.summary;
    var banner;
    if (!d.today.scheduled) {
      banner = '<div class="p-3 rounded-xl bg-slate-100 border border-slate-200 text-xs text-slate-700">Hoje não há teste programado' +
        (d.today.is_workday ? '' : ' (fim de semana)') + '.' +
        (d.next_day ? ' Próximo: <strong>Dia ' + d.next_day.number + '</strong> — ' + weekday(d.next_day.date) + ', ' + fmtDate(d.next_day.date) + '.' : '') +
        (s.overdue ? ' <strong class="text-rose-700">Há ' + s.overdue + ' teste(s) atrasado(s).</strong>' : '') + '</div>';
    } else if (s.today_done >= s.today_total && !s.overdue) {
      banner = '<div class="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-sm font-black text-emerald-800">✅ Teste do dia concluído (' + s.today_done + '/' + s.today_total + ').</div>';
    } else {
      banner = '<div class="p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs font-bold text-amber-900">🧪 Você fez o teste do dia? Faltam ' +
        (s.today_total - s.today_done) + ' de ' + s.today_total + ' de hoje' + (s.overdue ? ' e ' + s.overdue + ' atrasado(s)' : '') + '.</div>';
    }
    var allDone = s.done >= s.total;
    return '' +
      '<div class="rounded-2xl border border-slate-200 bg-white p-4 space-y-3">' +
        '<div class="flex flex-wrap items-center justify-between gap-2">' +
          '<div>' +
            '<div class="text-sm font-black text-slate-900">🧪 Testes físicos do site — cada página e cada botão</div>' +
            '<div class="text-[11px] text-slate-500">' + s.total + ' testes em ' + d.days.length + ' dias úteis • ' + d.settings.per_day + ' por dia • início ' + fmtDate(d.settings.start_date) + '</div>' +
          '</div>' +
          '<div class="text-right"><div class="text-2xl font-black text-emerald-700">' + s.progress_percentage + '%</div><div class="text-[10px] text-slate-500">' + s.done + '/' + s.total + ' feitos</div></div>' +
        '</div>' +
        '<div class="w-full bg-slate-100 rounded-full h-2 overflow-hidden"><div class="h-2 rounded-full bg-emerald-500" style="width:' + s.progress_percentage + '%"></div></div>' +
        '<div class="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">' +
          stat('Hoje', s.today_done + '/' + s.today_total, '#0f766e') +
          stat('Atrasados', s.overdue, s.overdue ? '#be123c' : '#475569') +
          stat('Falhas a corrigir', s.failed, s.failed ? '#be123c' : '#475569') +
          stat('OK', s.ok, '#047857') +
        '</div>' +
        (allDone ? '<div class="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-sm font-black text-emerald-800">🏁 Todos os testes do cronograma foram feitos.</div>' : banner) +
        '<details class="text-xs"><summary class="cursor-pointer font-bold text-slate-600">⚙️ Reprogramar cronograma</summary>' +
          '<div class="flex flex-wrap items-end gap-2 mt-2">' +
            '<label class="text-[11px] text-slate-600">Início<br><input id="qa-start" type="date" value="' + esc(d.settings.start_date) + '" class="px-2 py-1 rounded-lg border border-slate-300 text-xs"></label>' +
            '<label class="text-[11px] text-slate-600">Testes por dia<br><input id="qa-perday" type="number" min="5" max="200" value="' + esc(d.settings.per_day) + '" class="w-24 px-2 py-1 rounded-lg border border-slate-300 text-xs"></label>' +
            '<button type="button" onclick="window.QA.saveSettings()" class="px-3 py-1.5 rounded-lg bg-slate-900 text-white text-[11px] font-bold cursor-pointer">Salvar</button>' +
          '</div>' +
        '</details>' +
      '</div>';
  }

  function stat(label, value, color) {
    return '<div class="rounded-xl border border-slate-200 p-2"><div class="text-[10px] uppercase font-semibold text-slate-500">' + label + '</div><div class="text-lg font-black" style="color:' + color + '">' + value + '</div></div>';
  }

  var DAY_META = {
    concluido: '✅', atrasado: '⚠️', hoje: '🟡', futuro: '📅'
  };

  function renderSchedule(d) {
    return '' +
      '<details class="rounded-2xl border border-slate-200 bg-white p-3"' + (_openDay ? ' open' : '') + '>' +
        '<summary class="text-xs font-black text-slate-800 cursor-pointer">🗓️ Cronograma completo por dia (' + d.days.length + ' dias)</summary>' +
        '<div class="mt-3 divide-y divide-slate-100">' +
          d.days.map(function (day) {
            var more = day.pages.length > 3 ? ' +' + (day.pages.length - 3) : '';
            return '<button type="button" onclick="window.QA.openDay(' + day.number + ')" class="w-full text-left py-2 px-1 hover:bg-slate-50 flex flex-wrap items-center justify-between gap-2 cursor-pointer">' +
              '<span class="text-xs"><strong>' + DAY_META[day.status] + ' Dia ' + day.number + '</strong> — ' + weekday(day.date) + ', ' + fmtDate(day.date) + '<br><span class="text-[10px] text-slate-500">' + esc(day.pages.slice(0, 3).join(' • ')) + more + '</span></span>' +
              '<span class="text-[11px] font-bold ' + (day.failed ? 'text-rose-700' : 'text-slate-600') + '">' + day.done + '/' + day.total + (day.failed ? ' • ' + day.failed + ' falha(s)' : '') + '</span>' +
            '</button>';
          }).join('') +
        '</div>' +
        (_openDay ? '<div class="mt-3">' + renderList('📋 Dia ' + _openDay.number + ' — ' + fmtDate(_openDay.date), _openDay.items, 'Nenhum item.', true) + '</div>' : '') +
      '</details>';
  }

  function matches(it, q) {
    return [it.page, it.section, it.kind, it.label, it.how, it.note, it.id].some(function (v) {
      return String(v || '').toLowerCase().indexOf(q) !== -1;
    });
  }

  function render() {
    if (!_root || !_data) return;
    var d = _data;
    var q = (_query || '').toLowerCase().trim();
    if (q && _all) {
      var hits = _all.filter(function (it) { return matches(it, q); });
      _root.innerHTML = '<div class="space-y-3">' + renderHeader(d) +
        renderList('🔍 Resultados da busca "' + esc(_query) + '" em todo o checklist', hits.slice(0, 200), 'Nenhum teste encontrado.', true) +
        (hits.length > 200 ? '<div class="text-[11px] text-slate-500">Mostrando 200 de ' + hits.length + '. Refine a busca.</div>' : '') +
        '</div>';
      return;
    }
    _root.innerHTML = '<div class="space-y-3">' +
      renderHeader(d) +
      renderList('📅 Hoje — ' + (d.today.scheduled ? 'Dia ' + (d.today_items[0] && d.today_items[0].day) + ', ' : '') + fmtDate(d.today.date), d.today_items, 'Nenhum teste programado para hoje.', true) +
      renderList('⚠️ Atrasados', d.overdue_items, 'Nenhum teste atrasado. 👏', d.overdue_items.length > 0) +
      renderList('❌ Falhas a corrigir', d.failed_items, 'Nenhuma falha registrada.', d.failed_items.length > 0) +
      renderSchedule(d) +
      '</div>';
  }

  async function load() {
    _data = await api('GET', '/api/admin/qa' + ((_query || '').trim() ? '?all=1' : ''));
    if (_data.all_items) _all = _data.all_items;
    if (_openDay) {
      var r = await api('GET', '/api/admin/qa/day/' + _openDay.number);
      _openDay = r.day;
    }
  }

  // ---------------------------------------------------------------------------
  // API pública (usada pela aba do Roadmap e pelos botões)
  // ---------------------------------------------------------------------------
  window.QA = {
    mount: async function (root, query) {
      _root = root;
      _query = query || '';
      if (!_root) return;
      try {
        await load();
        render();
      } catch (err) {
        _root.innerHTML = '<div class="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-xs text-rose-700">Não foi possível carregar os testes físicos: ' + esc(err.message) + '</div>';
      }
    },

    filter: async function (query) {
      _query = query || '';
      if (_query.trim() && !_all) {
        try { await load(); } catch (e) { /* mantém a tela atual */ }
      }
      render();
    },

    mark: async function (itemId, result) {
      var note = '';
      if (result === 'falhou') {
        note = window.prompt('O que falhou? Descreva o problema (obrigatório):', '');
        if (note === null) return;
        if (!note.trim()) { alert('Descreva o que falhou para registrar.'); return; }
      } else if (result === 'ok') {
        note = '';
      }
      try {
        await api('POST', '/api/admin/qa/results', { item_id: itemId, result: result, note: note });
        _all = null;
        await load();
        render();
      } catch (err) {
        alert('Não foi possível registrar: ' + err.message);
      }
    },

    openDay: async function (number) {
      try {
        var r = await api('GET', '/api/admin/qa/day/' + number);
        _openDay = r.day;
        render();
      } catch (err) {
        alert('Não foi possível abrir o dia: ' + err.message);
      }
    },

    saveSettings: async function () {
      var start = (document.getElementById('qa-start') || {}).value;
      var perDay = Number((document.getElementById('qa-perday') || {}).value);
      if (!confirm('Reprogramar o cronograma? Os testes já feitos continuam registrados; só as datas mudam.')) return;
      try {
        await api('POST', '/api/admin/qa/settings', { start_date: start, per_day: perDay });
        _openDay = null;
        await load();
        render();
      } catch (err) {
        alert('Não foi possível salvar: ' + err.message);
      }
    },

    checkDaily: checkDaily
  };

  // ---------------------------------------------------------------------------
  // Pergunta do dia ao abrir o painel
  // ---------------------------------------------------------------------------
  var SNOOZE_KEY = 'ja_qa_snooze_until';

  function snoozedUntil() {
    try { return Number(localStorage.getItem(SNOOZE_KEY)) || 0; } catch (e) { return 0; }
  }
  function snooze(ms) {
    try { localStorage.setItem(SNOOZE_KEY, String(Date.now() + ms)); } catch (e) { /* sem storage */ }
  }
  function endOfTodayMs() {
    var d = new Date();
    d.setHours(23, 59, 59, 999);
    return d.getTime() - Date.now();
  }

  function showDailyPrompt(d) {
    if (document.getElementById('qa-daily-prompt')) return;
    var s = d.summary;
    var el = document.createElement('div');
    el.id = 'qa-daily-prompt';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-modal', 'true');
    el.style.cssText = 'position:fixed;inset:0;z-index:2147483000;background:rgba(2,6,23,.55);display:flex;align-items:center;justify-content:center;padding:16px;';
    var todayLine = s.today_total ? 'Hoje: <strong>' + (s.today_total - s.today_done) + ' de ' + s.today_total + '</strong> testes por fazer.' : 'Hoje não há teste programado.';
    el.innerHTML = '' +
      '<div style="max-width:420px;width:100%;background:#fff;border-radius:20px;padding:22px;box-shadow:0 24px 60px rgba(0,0,0,.35);font-family:system-ui,sans-serif;color:#0f172a">' +
        '<div style="font-size:30px;line-height:1">🧪</div>' +
        '<div style="font-size:17px;font-weight:800;margin-top:8px">Você fez o teste do dia?</div>' +
        '<div style="font-size:13px;color:#475569;margin-top:8px;line-height:1.5">' + todayLine +
          (s.overdue ? '<br><span style="color:#be123c;font-weight:700">' + s.overdue + ' teste(s) atrasado(s).</span>' : '') +
          '<br>Progresso geral: ' + s.done + '/' + s.total + ' (' + s.progress_percentage + '%).</div>' +
        '<div style="display:flex;flex-direction:column;gap:8px;margin-top:16px">' +
          '<button type="button" data-qa="now" style="padding:10px;border-radius:12px;border:0;background:#047857;color:#fff;font-weight:800;cursor:pointer">Fazer os testes agora</button>' +
          '<button type="button" data-qa="later" style="padding:10px;border-radius:12px;border:1px solid #cbd5e1;background:#fff;color:#0f172a;font-weight:700;cursor:pointer">Lembrar em 2 horas</button>' +
          '<button type="button" data-qa="today" style="padding:8px;border-radius:12px;border:0;background:transparent;color:#64748b;font-weight:600;cursor:pointer">Hoje não</button>' +
        '</div>' +
      '</div>';
    el.addEventListener('click', function (ev) {
      var action = ev.target && ev.target.getAttribute('data-qa');
      if (!action) return;
      el.remove();
      if (action === 'now') {
        snooze(2 * 60 * 60 * 1000);
        if (typeof window.openRoadmapView === 'function') window.openRoadmapView('qa');
      } else if (action === 'later') {
        snooze(2 * 60 * 60 * 1000);
      } else {
        snooze(endOfTodayMs());
      }
    });
    document.body.appendChild(el);
  }

  async function checkDaily() {
    if (!token() || Date.now() < snoozedUntil()) return;
    try {
      var d = await api('GET', '/api/admin/qa');
      if (d.ask_today) showDailyPrompt(d);
    } catch (e) { /* não é o mestre ou sem sessão: não pergunta */ }
  }

  // Pergunta ao entrar no painel e, com o painel aberto, a cada 30 min (respeitando o "lembrar depois")
  var started = false;
  function boot() {
    if (started || !token()) return;
    started = true;
    setTimeout(checkDaily, 4000);
    setInterval(checkDaily, 30 * 60 * 1000);
  }
  document.addEventListener('DOMContentLoaded', function () {
    boot();
    var tries = 0;
    var wait = setInterval(function () {
      tries++;
      if (started || tries > 720) { clearInterval(wait); return; }
      boot(); // espera o login (token aparece no localStorage)
    }, 5000);
  });
})();
