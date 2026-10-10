/**
 * Alertas de prazo por WhatsApp/e-mail — configuração (só o mestre).
 * Mostrado no topo da aba "Alertas & Notificações". A regra de quem recebe é do SERVIDOR:
 * só integrante ativo com função de Advogado e OAB cadastrada (nunca estagiário,
 * secretária ou administrativo). Esta tela apenas edita as preferências desses advogados.
 */
(function () {
  const e = (s) => { const d = document.createElement('div'); d.textContent = s == null ? '' : s; return d.innerHTML; };
  const api = async (url, method, body) => {
    const r = await fetch(url, { method: method || 'GET', headers: { 'Content-Type': 'application/json', ...getAuthHeaders() }, body: body ? JSON.stringify(body) : undefined });
    const data = await r.json().catch(() => ({}));
    return { ok: r.ok, status: r.status, data };
  };
  const isMaster = () => {
    try { const u = JSON.parse(localStorage.getItem(USER_KEY) || '{}'); return u.role === 'master' || u.username === 'jorgealvimtecnologia'; } catch (err) { return false; }
  };

  function pill(ok, yes, no) {
    return `<span class="px-2 py-0.5 rounded-full text-[10px] font-bold ${ok ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-700'}">${ok ? yes : no}</span>`;
  }

  function lawyerRow(l, all) {
    const subs = all.filter((x) => x.id !== l.id).map((x) => `<option value="${e(x.id)}" ${l.substituteId === x.id ? 'selected' : ''}>${e(x.name)}</option>`).join('');
    const sem = (!l.whatsapp ? '<span class="text-red-600 font-semibold">sem WhatsApp válido</span>' : `WhatsApp ${e(l.whatsapp)}`);
    return `<div class="p-3 border-t border-slate-100 text-xs space-y-2" data-lawyer="${e(l.id)}">
      <div class="flex flex-wrap items-center justify-between gap-2">
        <div><span class="font-bold text-navy-950">${e(l.name)}</span> <span class="font-mono text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-900 border border-amber-300">OAB ${e(l.oab)}</span></div>
        <div class="text-slate-500">${sem} • ${l.email ? e(l.email) : '<span class="text-red-600 font-semibold">sem e-mail válido</span>'}</div>
      </div>
      <div class="flex flex-wrap items-center gap-x-4 gap-y-1">
        <label class="flex items-center gap-1"><input type="checkbox" class="da-wa" ${l.notifyWhatsapp ? 'checked' : ''}> WhatsApp</label>
        <label class="flex items-center gap-1"><input type="checkbox" class="da-em" ${l.notifyEmail ? 'checked' : ''}> E-mail</label>
        <label class="flex items-center gap-1 font-semibold text-purple-800"><input type="checkbox" class="da-ti" ${l.isTitular ? 'checked' : ''}> Titular (recebe o escalonamento)</label>
        <label class="flex items-center gap-1">Substituto: <select class="da-sub border border-slate-300 rounded px-1 py-0.5 bg-white"><option value="">— nenhum —</option>${subs}</select></label>
        <button onclick="saveDeadlineAlertPrefs('${e(l.id)}')" class="px-2.5 py-1 rounded-lg bg-navy-950 text-white font-bold">Salvar</button>
      </div>
    </div>`;
  }

  window.loadDeadlineAlertsCard = async function () {
    const box = document.getElementById('deadline-alerts-card');
    if (!box) return;
    if (!isMaster()) { box.innerHTML = ''; return; }
    const { ok, data } = await api('/api/deadline-alerts/config');
    if (!ok) { box.innerHTML = ''; return; }
    const warn = [];
    if (!data.hasTitular) warn.push('Nenhum <b>advogado titular</b> definido: prazos sem responsável identificado não têm quem receba o aviso externo.');
    if (!data.channels.whatsapp) warn.push('O <b>gateway de WhatsApp</b> não está configurado no servidor (WHATSAPP_GATEWAY_URL): nenhum WhatsApp será enviado.');
    if (!data.channels.email) warn.push('O <b>e-mail (SMTP)</b> não está configurado no servidor: nenhum e-mail será enviado.');
    box.innerHTML = `<div class="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      <div class="p-3 flex flex-wrap items-center justify-between gap-2 bg-slate-50">
        <div><div class="font-bold text-navy-950 text-sm">📲 Alertas de prazo por WhatsApp e e-mail — somente advogados</div>
        <div class="text-[11px] text-slate-500">Recebe quem é integrante ativo do escritório com função de Advogado e OAB cadastrada. Envio entre ${data.window.startHour}h e ${data.window.endHour}h.</div></div>
        <div class="flex gap-1.5 items-center">${pill(data.channels.whatsapp, 'WhatsApp ativo', 'WhatsApp inativo')}${pill(data.channels.email, 'E-mail ativo', 'E-mail inativo')}
          <button onclick="simulateDeadlineAlerts()" class="text-[11px] font-bold px-2.5 py-1 rounded-lg border border-slate-300 bg-white hover:bg-slate-100">Simular envio</button>
          <button onclick="showDeadlineAlertLog()" class="text-[11px] font-bold px-2.5 py-1 rounded-lg border border-slate-300 bg-white hover:bg-slate-100">Ver registro</button></div>
      </div>
      ${warn.length ? `<div class="p-3 text-[11px] bg-amber-50 text-amber-900 border-t border-amber-200 space-y-1">${warn.map((w) => `<div>⚠️ ${w}</div>`).join('')}</div>` : ''}
      ${data.lawyers.length ? data.lawyers.map((l) => lawyerRow(l, data.lawyers)).join('') : '<div class="p-4 text-xs text-slate-500 border-t border-slate-100">Nenhum advogado elegível. Cadastre o integrante em <b>Escritórios</b> com função "Advogado" e o número da OAB.</div>'}
      ${data.excluded.length ? `<details class="p-3 border-t border-slate-100 text-[11px] text-slate-500"><summary class="cursor-pointer font-semibold">Não recebem alertas externos (${data.excluded.length})</summary><ul class="mt-1 space-y-0.5">${data.excluded.map((x) => `<li>${e(x.name)} — ${e(x.reason)}</li>`).join('')}</ul></details>` : ''}
      <div id="deadline-alerts-out" class="hidden p-3 border-t border-slate-100 text-[11px] font-mono whitespace-pre-wrap bg-slate-50"></div>
    </div>`;
  };

  window.saveDeadlineAlertPrefs = async function (memberId) {
    const row = document.querySelector(`[data-lawyer="${memberId}"]`);
    if (!row) return;
    const { ok, data } = await api(`/api/deadline-alerts/prefs/${encodeURIComponent(memberId)}`, 'PUT', {
      notify_whatsapp: row.querySelector('.da-wa').checked,
      notify_email: row.querySelector('.da-em').checked,
      is_titular: row.querySelector('.da-ti').checked,
      substitute_member_id: row.querySelector('.da-sub').value || null
    });
    if (!ok) { alert(data.error || 'Não foi possível salvar.'); return; }
    loadDeadlineAlertsCard();
  };

  const out = (text) => { const o = document.getElementById('deadline-alerts-out'); if (o) { o.textContent = text; o.classList.remove('hidden'); } };

  window.simulateDeadlineAlerts = async function () {
    const { ok, data } = await api('/api/deadline-alerts/run', 'POST', { dry_run: true });
    if (!ok) return out(data.error || 'Falha na simulação.');
    out(data.items.length
      ? `Simulação (nada foi enviado): ${data.planned} aviso(s) previsto(s)\n` + data.items.map((i) => `• ${i.stage} — ${i.recipient} (${i.role}) por ${i.channel}${i.retry ? ' [reenvio]' : ''}`).join('\n')
      : 'Simulação: nenhum aviso devido agora.' + (data.noTitular ? '\n⚠ Nenhum titular definido.' : ''));
  };

  window.showDeadlineAlertLog = async function () {
    const { ok, data } = await api('/api/deadline-alerts/log?limit=30');
    if (!ok) return out(data.error || 'Falha ao ler o registro.');
    const c = data.counts || {};
    out(`Enviados: ${c.enviado || 0} • Em nova tentativa: ${c.falha || 0} • Desistências: ${c.desistiu || 0}\n` +
      (data.log.length ? data.log.map((l) => `${(l.updated_at || l.created_at || '').slice(0, 16).replace('T', ' ')}  ${l.status.toUpperCase().padEnd(8)} ${l.stage} ${l.member_name} (${l.role}) ${l.channel}${l.last_error ? ' — ' + l.last_error : ''}`).join('\n') : 'Nenhum aviso registrado ainda.') +
      (data.acks.length ? '\n\nCiências registradas:\n' + data.acks.slice(0, 15).map((a) => `${a.acked_at.slice(0, 16).replace('T', ' ')}  ${a.member_name} via ${a.via}  (${a.resource_type}:${a.resource_id})`).join('\n') : ''));
  };
})();
