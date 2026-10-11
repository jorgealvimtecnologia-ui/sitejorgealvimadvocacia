/**
 * Agendamento online (AUD-15) — painel do escritório, dentro da aba Agenda.
 * Abre um painel com: liga/desliga, horários de atendimento, link público e as marcações recebidas.
 * Só o mestre grava a configuração (o servidor recusa os demais); quem tem a aba Agenda vê as marcações.
 */
(function () {
  'use strict';

  var DAYS = [['1', 'Seg'], ['2', 'Ter'], ['3', 'Qua'], ['4', 'Qui'], ['5', 'Sex'], ['6', 'Sáb'], ['0', 'Dom']];
  var ID = 'booking-admin-modal';

  function esc(t) { return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function br(dt) { return dt.slice(8, 10) + '/' + dt.slice(5, 7) + ' às ' + dt.slice(11, 16); }
  function headers() { return (typeof getAuthHeaders === 'function') ? getAuthHeaders() : { 'Content-Type': 'application/json' }; }
  function field(id, label, input) { return '<label class="block text-[11px] font-bold text-slate-700 mb-1" for="' + id + '">' + label + '</label>' + input; }
  var INPUT = 'w-full px-3 py-2 rounded-xl bg-white border border-slate-300 text-xs text-slate-800';

  function shell() {
    var m = document.getElementById(ID);
    if (m) return m;
    m = document.createElement('div');
    m.id = ID;
    m.className = 'hidden fixed inset-0 z-[999999] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-3 overflow-y-auto';
    m.setAttribute('role', 'dialog'); m.setAttribute('aria-modal', 'true'); m.setAttribute('aria-labelledby', 'booking-title');
    m.innerHTML =
      '<div class="bg-white rounded-3xl max-w-3xl w-full p-5 sm:p-6 shadow-2xl border border-slate-200 relative my-auto space-y-4">' +
      '<button type="button" onclick="closeBookingAdmin()" class="absolute right-4 top-3 text-slate-400 hover:text-slate-700 text-2xl font-bold" aria-label="Fechar">&times;</button>' +
      '<h3 id="booking-title" class="font-serif font-bold text-lg text-navy-950">🌐 Agendamento online de consultas</h3>' +
      '<div id="booking-body" class="space-y-4 text-xs text-slate-700">Carregando…</div></div>';
    document.body.appendChild(m);
    return m;
  }

  async function loadBookingAdmin() {
    var body = document.getElementById('booking-body');
    try {
      var rs = await fetch('/api/booking/settings', { headers: headers() });
      var ra = await fetch('/api/booking/appointments', { headers: headers() });
      var s = await rs.json();
      var a = await ra.json();
      var c = s.config || {};
      var link = location.origin + '/agendar';
      var dias = DAYS.map(function (d) {
        return '<label class="inline-flex items-center gap-1 mr-2"><input type="checkbox" class="bk-day" value="' + d[0] + '"' + (c.weekdays && c.weekdays.indexOf(Number(d[0])) >= 0 ? ' checked' : '') + '> ' + d[1] + '</label>';
      }).join('');
      var futuras = (a.appointments || []).filter(function (x) { return x.status === 'confirmado'; }).sort(function (x, y) { return x.start_datetime < y.start_datetime ? -1 : 1; });
      body.innerHTML =
        '<div class="flex items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 p-3">' +
        '<label class="inline-flex items-center gap-2 font-bold text-sm text-navy-950"><input type="checkbox" id="bk-enabled"' + (c.enabled ? ' checked' : '') + '> Receber agendamentos pelo site</label>' +
        '<span class="text-[11px] ' + (s.email_configured ? 'text-emerald-700' : 'text-rose-700') + '">' + (s.email_configured ? '✉️ E-mail de confirmação ativo' : '⚠️ E-mail (SMTP) não configurado: o cliente verá só o link na tela') + '</span></div>' +
        '<div><span class="font-bold">Dias de atendimento:</span> ' + dias + '</div>' +
        '<div class="grid grid-cols-2 sm:grid-cols-4 gap-3">' +
        '<div>' + field('bk-start', 'Início', '<input type="time" id="bk-start" class="' + INPUT + '" value="' + esc(c.start) + '">') + '</div>' +
        '<div>' + field('bk-end', 'Fim', '<input type="time" id="bk-end" class="' + INPUT + '" value="' + esc(c.end) + '">') + '</div>' +
        '<div>' + field('bk-bs', 'Almoço (início)', '<input type="time" id="bk-bs" class="' + INPUT + '" value="' + esc(c.break_start) + '">') + '</div>' +
        '<div>' + field('bk-be', 'Almoço (fim)', '<input type="time" id="bk-be" class="' + INPUT + '" value="' + esc(c.break_end) + '">') + '</div>' +
        '<div>' + field('bk-slot', 'Duração (min)', '<input type="number" id="bk-slot" min="15" max="240" step="5" class="' + INPUT + '" value="' + esc(c.slot_minutes) + '">') + '</div>' +
        '<div>' + field('bk-buf', 'Intervalo entre consultas (min)', '<input type="number" id="bk-buf" min="0" max="120" step="5" class="' + INPUT + '" value="' + esc(c.buffer_minutes) + '">') + '</div>' +
        '<div>' + field('bk-notice', 'Antecedência mínima (h)', '<input type="number" id="bk-notice" min="0" max="168" class="' + INPUT + '" value="' + esc(c.min_notice_hours) + '">') + '</div>' +
        '<div>' + field('bk-ahead', 'Quantos dias à frente', '<input type="number" id="bk-ahead" min="1" max="90" class="' + INPUT + '" value="' + esc(c.max_days_ahead) + '">') + '</div></div>' +
        '<div class="grid sm:grid-cols-2 gap-3">' +
        '<div>' + field('bk-lawyer', 'Advogado que atende', '<input type="text" id="bk-lawyer" class="' + INPUT + '" value="' + esc(c.lawyer_name) + '">') + '</div>' +
        '<div>' + field('bk-loc', 'Local do atendimento', '<input type="text" id="bk-loc" class="' + INPUT + '" value="' + esc(c.location) + '">') + '</div>' +
        '<div class="sm:col-span-2">' + field('bk-url', 'Link de videochamada (opcional; se preencher, a consulta vira online)', '<input type="url" id="bk-url" placeholder="https://meet.google.com/..." class="' + INPUT + '" value="' + esc(c.meeting_url) + '">') + '</div></div>' +
        '<div id="bk-msg" class="text-[11px] font-semibold" role="status" aria-live="polite"></div>' +
        '<div class="flex flex-wrap items-center gap-2">' +
        '<button type="button" onclick="saveBookingSettings()" class="px-4 py-2 rounded-xl bg-navy-950 text-white font-bold text-xs">Salvar</button>' +
        '<button type="button" onclick="navigator.clipboard && navigator.clipboard.writeText(\'' + link + '\').then(function(){document.getElementById(\'bk-msg\').textContent=\'Link copiado.\'})" class="px-4 py-2 rounded-xl bg-white border border-slate-300 font-bold text-xs">Copiar link da página pública</button>' +
        '<a href="/agendar" target="_blank" rel="noopener" class="text-gold-700 font-bold underline">Abrir ' + esc(link) + '</a></div>' +
        '<div><h4 class="font-extrabold text-xs uppercase tracking-wider text-navy-950 mb-2">Consultas marcadas (' + futuras.length + ')</h4>' +
        (futuras.length ? futuras.map(function (x) {
          return '<div class="flex items-center justify-between gap-2 rounded-xl border border-slate-200 px-3 py-2 mb-1.5"><span><b>' + esc(br(x.start_datetime)) + '</b> — ' + esc(x.name) + ' • ' + esc(x.phone) + (x.area ? ' • ' + esc(x.area) : '') + '</span>' +
            '<button type="button" class="text-rose-600 font-bold" onclick="cancelBookingAdmin(\'' + esc(x.id) + '\')">Cancelar</button></div>';
        }).join('') : '<p class="text-slate-400">Nenhuma consulta marcada ainda.</p>') + '</div>';
    } catch (e) {
      body.textContent = 'Não foi possível carregar o agendamento online.';
    }
  }

  async function saveBookingSettings() {
    var msg = document.getElementById('bk-msg');
    var days = Array.prototype.map.call(document.querySelectorAll('.bk-day:checked'), function (i) { return Number(i.value); });
    var v = function (id) { return document.getElementById(id).value; };
    var payload = {
      enabled: document.getElementById('bk-enabled').checked, weekdays: days, start: v('bk-start'), end: v('bk-end'), break_start: v('bk-bs'), break_end: v('bk-be'),
      slot_minutes: Number(v('bk-slot')), buffer_minutes: Number(v('bk-buf')), min_notice_hours: Number(v('bk-notice')), max_days_ahead: Number(v('bk-ahead')),
      lawyer_name: v('bk-lawyer'), location: v('bk-loc'), meeting_url: v('bk-url')
    };
    try {
      var r = await fetch('/api/booking/settings', { method: 'PUT', headers: headers(), body: JSON.stringify(payload) });
      var d = await r.json();
      msg.className = 'text-[11px] font-semibold ' + (r.ok ? 'text-emerald-700' : 'text-rose-700');
      msg.textContent = r.ok ? (d.config.enabled ? '✅ Salvo. O agendamento online está LIGADO no site.' : '✅ Salvo. O agendamento online está desligado.') : (r.status === 403 ? 'Só o administrador mestre pode alterar estas configurações.' : (d.error || 'Não foi possível salvar.'));
    } catch (e) {
      msg.className = 'text-[11px] font-semibold text-rose-700';
      msg.textContent = 'Erro ao conectar ao servidor.';
    }
  }

  async function cancelBookingAdmin(id) {
    if (!confirm('Cancelar esta consulta? O cliente receberá um e-mail avisando.')) return;
    await fetch('/api/booking/appointments/' + encodeURIComponent(id) + '/cancel', { method: 'POST', headers: headers() });
    loadBookingAdmin();
    if (typeof window.initCalendarTab === 'function') window.initCalendarTab();
  }

  function openBookingAdmin() { shell().classList.remove('hidden'); loadBookingAdmin(); }
  function closeBookingAdmin() { var m = document.getElementById(ID); if (m) m.classList.add('hidden'); }

  window.openBookingAdmin = openBookingAdmin;
  window.closeBookingAdmin = closeBookingAdmin;
  window.saveBookingSettings = saveBookingSettings;
  window.cancelBookingAdmin = cancelBookingAdmin;
})();
