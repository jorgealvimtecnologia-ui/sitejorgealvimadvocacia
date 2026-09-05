    const BRL = v => (Number(v) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    const esc = s => { const d = document.createElement('div'); d.textContent = s == null ? '' : s; return d.innerHTML; };
    const fmtDate = s => { if (!s) return '—'; const d = new Date(String(s).length <= 10 ? s + 'T00:00:00' : s); return isNaN(d) ? esc(s) : d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }); };
    async function jget(url) { const r = await fetch(url, { headers: getAuthHeaders() }); if (r.status === 401) { handleLogout(); throw new Error('401'); } return r.json(); }
    async function jsend(url, method, body) { const r = await fetch(url, { method, headers: { 'Content-Type': 'application/json', ...getAuthHeaders() }, body: body ? JSON.stringify(body) : undefined }); const d = await r.json().catch(() => ({})); return { ok: r.ok, data: d }; }

    // ---------------- DASHBOARD ----------------
    async function loadDashboardOverview() {
      try {
        const d = await jget('/api/dashboard/overview');
        if (!d.success) return;
        const card = (label, value, tone) => `<div class="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
          <div class="text-[11px] uppercase tracking-wide text-slate-400 font-bold">${label}</div>
          <div class="text-lg sm:text-xl font-bold ${tone || 'text-navy-950'} mt-1">${value}</div></div>`;
        document.getElementById('dash-cards').innerHTML =
          card('Receita do mês', BRL(d.financeiro.receita_mes), 'text-emerald-600') +
          card('Despesa do mês', BRL(d.financeiro.despesa_mes), 'text-red-600') +
          card('Saldo do mês', BRL(d.financeiro.saldo_mes), d.financeiro.saldo_mes >= 0 ? 'text-emerald-700' : 'text-red-700') +
          card('A receber', BRL(d.financeiro.a_receber), 'text-amber-600') +
          card('Clientes ativos', d.juridico.clientes_ativos + '/' + d.juridico.clientes_total) +
          card('Processos em andamento', d.juridico.processos_andamento) +
          card('Prazos fatais (3 dias)', d.prazos.fatais_3dias, d.prazos.fatais_3dias ? 'text-red-600' : 'text-navy-950') +
          card('Leads no mês', d.comercial.leads_mes);
        document.getElementById('dash-deadlines').innerHTML = d.prazos.proximos.length
          ? d.prazos.proximos.map(p => `<div class="flex items-center justify-between gap-2 border-b border-slate-50 pb-1">
              <span class="truncate">${esc(p.title)} ${p.lawsuit_number ? '<span class=\"text-slate-400\">• ' + esc(p.lawsuit_number) + '</span>' : ''}</span>
              <span class="text-xs font-bold text-slate-500 whitespace-nowrap">${fmtDate(p.date)}</span></div>`).join('')
          : '<span class="text-slate-400">Nenhum prazo nos próximos 15 dias.</span>';
        const c = d.compliance;
        document.getElementById('dash-compliance').innerHTML = [
          ['Assinaturas pendentes', c.assinaturas_pendentes, '#tab:esign'],
          ['Assinaturas concluídas', c.assinaturas_concluidas, '#tab:esign'],
          ['Solicitações LGPD abertas', c.lgpd_abertas, '#tab:lgpd'],
          ['Notificações não lidas', c.notificacoes_nao_lidas, '#tab:notifications']
        ].map(([l, v]) => `<div class="flex justify-between border-b border-slate-50 pb-1"><span>${l}</span><span class="font-bold text-navy-950">${v}</span></div>`).join('');
        loadDashboardFunnel();
        loadSyncStatus();
      } catch (e) { console.error('[dashboard]', e); }
    }
    async function loadSyncStatus() {
      const el = document.getElementById('sync-status-text');
      if (!el) return;
      try {
        const d = await jget('/api/sync/status');
        if (d.running) { el.textContent = 'Sincronizando agora…'; return; }
        const s = d.status;
        if (!s) { el.textContent = 'Ainda não sincronizado nesta sessão. Roda automaticamente a cada 12h.'; return; }
        const when = s.finished_at ? fmtDate(s.finished_at) : '—';
        el.innerHTML = `Última: <strong>${when}</strong> • ${s.publicacoes_novas || 0} intimação(ões), ${s.prazos_criados || 0} prazo(s), ${s.movimentos_novos || 0} andamento(s)`;
      } catch (e) { el.textContent = 'Status indisponível.'; }
    }
    async function loadSyncHistory() {
      const box = document.getElementById('sync-history');
      if (!box) return;
      box.textContent = 'Carregando…';
      try {
        const d = await jget('/api/sync/history');
        if (!d.success || !d.runs.length) { box.innerHTML = '<span class="text-slate-400">Nenhuma rodada registrada ainda.</span>'; return; }
        box.innerHTML = `<table class="w-full text-left"><thead><tr class="text-slate-400 border-b border-slate-100">
          <th class="py-1 font-semibold">Quando</th><th class="font-semibold">Origem</th><th class="font-semibold text-right">Intim.</th><th class="font-semibold text-right">Prazos</th><th class="font-semibold text-right">Andam.</th><th class="font-semibold text-right">Religadas</th></tr></thead><tbody>` +
          d.runs.map(r => `<tr class="border-b border-slate-50">
            <td class="py-1">${fmtDate(r.finished_at || r.started_at)}</td>
            <td>${r.trigger === 'manual' ? '👤 manual' : '🤖 auto'}</td>
            <td class="text-right">${r.publicacoes_novas || 0}</td>
            <td class="text-right">${r.prazos_criados || 0}</td>
            <td class="text-right">${r.movimentos_novos || 0}</td>
            <td class="text-right">${r.publicacoes_religadas || 0}</td></tr>`).join('') + '</tbody></table>';
      } catch (e) { box.textContent = 'Erro ao carregar histórico.'; }
    }
    async function runFullSyncNow() {
      const btn = document.getElementById('btn-sync-all');
      const el = document.getElementById('sync-status-text');
      btn.disabled = true; const orig = btn.textContent; btn.textContent = 'Sincronizando…';
      if (el) el.textContent = 'Buscando publicações na ComunicaAPI/DJEN…';
      try {
        const { ok, data } = await jsend('/api/sync/run', 'POST');
        if (ok && data.success) {
          if (el) el.innerHTML = `✅ ${data.publicacoes_novas || 0} intimação(ões), ${data.prazos_criados || 0} prazo(s), ${data.movimentos_novos || 0} andamento(s).`;
          loadDashboardOverview();
          refreshNotifBadge();
          loadSyncHistory();
        } else {
          if (el) el.textContent = data.error || 'Falha ao sincronizar.';
        }
      } catch (e) { if (el) el.textContent = 'Erro de conexão.'; }
      finally { btn.disabled = false; btn.textContent = orig; }
    }
    async function loadDashboardFunnel() {
      const box = document.getElementById('dash-funnel');
      if (!box) return;
      try {
        const d = await jget('/api/analytics/summary?days=30');
        if (!d.success) { box.textContent = 'Sem dados.'; return; }
        if (!d.total_events) {
          box.innerHTML = '<span class="text-slate-400">Ainda sem eventos. O funil começa a preencher quando os visitantes aceitarem os cookies e navegarem no site.</span>';
          return;
        }
        const colors = ['bg-slate-400', 'bg-blue-400', 'bg-amber-400', 'bg-emerald-500'];
        box.innerHTML = d.funnel.map((s, i) => `
          <div>
            <div class="flex justify-between text-xs mb-0.5"><span class="font-semibold text-navy-950">${s.stage}</span><span class="text-slate-500">${s.sessions} sessão(ões) • ${s.pct}%</span></div>
            <div class="h-2.5 rounded-full bg-slate-100 overflow-hidden"><div class="h-full ${colors[i]} rounded-full" style="width:${Math.max(s.pct, 2)}%"></div></div>
          </div>`).join('');
      } catch (e) { box.textContent = 'Erro ao carregar funil.'; }
    }

    // ---------------- NOTIFICAÇÕES ----------------
    function notifIcon(level) { return level === 'critical' ? '🔴' : (level === 'warning' ? '🟠' : '🔵'); }
    async function loadNotificationsList() {
      try {
        const d = await jget('/api/notifications?box=all&limit=100');
        updateNotifBadge(d.unread, d.critical);
        document.getElementById('notif-list').innerHTML = d.notifications.length
          ? d.notifications.map(n => `<div class="bg-white rounded-xl border ${n.is_read ? 'border-slate-200' : 'border-amber-300'} shadow-sm p-3 flex items-start gap-3">
              <span>${notifIcon(n.level)}</span>
              <div class="flex-1 min-w-0">
                <div class="font-semibold text-navy-950 ${n.is_read ? 'opacity-60' : ''}">${esc(n.title)}</div>
                ${n.message ? `<div class="text-xs text-slate-500">${esc(n.message)}</div>` : ''}
                <div class="text-[10px] text-slate-400 mt-0.5">${fmtDate(n.created_at)}${n.link ? ` • <a class="underline cursor-pointer" onclick="gotoFromLink('${n.link}')">abrir</a>` : ''}</div>
              </div>
              ${n.is_read ? '' : `<button onclick="markNotifRead(${n.id})" class="text-[11px] text-slate-400 hover:text-slate-700">marcar lida</button>`}
            </div>`).join('')
          : '<div class="text-slate-400 text-sm p-4">Nenhuma notificação.</div>';
      } catch (e) { console.error('[notif]', e); }
    }
    function updateNotifBadge(unread, critical) {
      const b = document.getElementById('notif-badge'); if (!b) return;
      if (unread > 0) { b.textContent = unread; b.classList.remove('hidden'); b.className = 'px-1.5 py-0.5 rounded-full text-white text-[10px] font-bold ' + (critical > 0 ? 'bg-red-600 animate-pulse' : 'bg-amber-500'); }
      else { b.classList.add('hidden'); }
    }
    async function refreshNotifBadge() { try { const d = await jget('/api/notifications?box=unread&limit=1'); updateNotifBadge(d.unread, d.critical); } catch (e) {} }
    async function markNotifRead(id) { await jsend('/api/notifications/' + id + '/read', 'PATCH', { is_read: true }); loadNotificationsList(); }
    async function markAllNotificationsRead() { await jsend('/api/notifications/read-all', 'POST'); loadNotificationsList(); }
    async function scanDeadlinesNow() { const { data } = await jsend('/api/notifications/scan', 'POST'); if (data.message) alert(data.message); loadNotificationsList(); }
    function gotoFromLink(link) { if (link && link.startsWith('#tab:')) switchTab(link.slice(5)); }

    // ---------------- ASSINATURAS ----------------
    async function loadEsignRequests() {
      try {
        const d = await jget('/api/esign/requests');
        const st = d.stats || {};
        const stat = (l, v, t) => `<div class="bg-white p-3 rounded-xl border border-slate-200 text-center"><div class="text-xl font-bold ${t}">${v || 0}</div><div class="text-[11px] text-slate-500">${l}</div></div>`;
        document.getElementById('esign-stats').innerHTML = stat('Pendentes', st.pendente, 'text-amber-600') + stat('Assinados', st.assinado, 'text-emerald-600') + stat('Encerrados', st.cancelado, 'text-slate-500');
        document.getElementById('esign-list').innerHTML = d.requests.length
          ? d.requests.map(r => {
              const badge = { pendente: 'bg-amber-100 text-amber-800', assinado: 'bg-emerald-100 text-emerald-800' }[r.status] || 'bg-slate-100 text-slate-600';
              return `<div class="p-3 flex items-center justify-between gap-2">
                <div class="min-w-0"><div class="font-semibold text-navy-950 truncate">${esc(r.doc_title)}</div>
                <div class="text-xs text-slate-500">${esc(r.signer_name)} • ${esc(r.id)} • ${fmtDate(r.created_at)}</div></div>
                <div class="flex items-center gap-2 flex-shrink-0">
                  <span class="px-2 py-0.5 rounded-full text-[10px] font-bold ${badge}">${esc(r.status)}</span>
                  ${r.status === 'pendente' ? `<button onclick="copyEsignLink('${r.token}')" class="text-[11px] text-emerald-700 underline">copiar link</button>` : ''}
                  ${r.status === 'assinado' && r.evidence_hash ? `<a target="_blank" href="/validar-assinatura/${r.evidence_hash}" class="text-[11px] text-slate-500 underline">validar</a>` : ''}
                </div></div>`;
            }).join('')
          : '<div class="p-4 text-slate-400">Nenhuma solicitação ainda.</div>';
      } catch (e) { console.error('[esign]', e); }
    }
    function copyEsignLink(token) { const url = location.origin + '/assinar/' + token; navigator.clipboard.writeText(url).then(() => alert('Link copiado:\n' + url), () => prompt('Copie o link:', url)); }
    async function createEsignRequest() {
      const g = id => document.getElementById(id);
      const msg = g('es-msg'); msg.textContent = ''; msg.className = 'text-sm mt-2';
      const body = { doc_title: g('es-title').value.trim(), doc_type: g('es-type').value, signer_name: g('es-signer').value.trim(), signer_email: g('es-email').value.trim(), signer_cpf: g('es-cpf').value.trim(), content_html: g('es-content').value.trim() };
      if (!body.doc_title || !body.signer_name || !body.content_html) { msg.textContent = 'Preencha título, signatário e conteúdo.'; msg.className = 'text-sm mt-2 text-red-600'; return; }
      const { ok, data } = await jsend('/api/esign/requests', 'POST', body);
      if (!ok) { msg.textContent = data.error || 'Falha.'; msg.className = 'text-sm mt-2 text-red-600'; return; }
      msg.innerHTML = '✅ ' + esc(data.message) + '<br>Link: <a class="underline text-emerald-700" href="' + data.sign_url + '" target="_blank">' + esc(data.sign_url) + '</a>';
      msg.className = 'text-sm mt-2 text-emerald-700';
      ['es-title', 'es-signer', 'es-email', 'es-cpf', 'es-content'].forEach(i => g(i).value = '');
      loadEsignRequests();
    }

    // ---------------- LGPD ----------------
    async function loadLgpdRequests() {
      try {
        const d = await jget('/api/lgpd/requests');
        const st = d.stats || {}, types = d.types || {};
        const stat = (l, v, t) => `<div class="bg-white p-3 rounded-xl border border-slate-200 text-center"><div class="text-xl font-bold ${t}">${v || 0}</div><div class="text-[11px] text-slate-500">${l}</div></div>`;
        document.getElementById('lgpd-stats').innerHTML = stat('Abertas', st.aberto, 'text-amber-600') + stat('Em andamento', st.em_andamento, 'text-blue-600') + stat('Concluídas', st.concluido, 'text-emerald-600') + stat('Vencendo (3d)', st.vencendo, 'text-red-600');
        document.getElementById('lgpd-list').innerHTML = d.requests.length
          ? d.requests.map(r => {
              const badge = { aberto: 'bg-amber-100 text-amber-800', em_andamento: 'bg-blue-100 text-blue-800', concluido: 'bg-emerald-100 text-emerald-800' }[r.status] || 'bg-slate-100 text-slate-600';
              return `<div class="p-3">
                <div class="flex items-center justify-between gap-2">
                  <div class="min-w-0"><span class="font-semibold text-navy-950">${esc(r.subject_name)}</span> <span class="text-xs text-slate-400">${esc(r.protocol)}</span>
                  <div class="text-xs text-slate-500">${esc(types[r.request_type] || r.request_type)} • prazo: ${fmtDate(r.due_date)} • ${esc(r.subject_email || '')}</div></div>
                  <span class="px-2 py-0.5 rounded-full text-[10px] font-bold ${badge} flex-shrink-0">${esc(r.status)}</span>
                </div>
                ${r.description ? `<div class="text-xs text-slate-500 mt-1 italic">"${esc(r.description)}"</div>` : ''}
                <div class="flex gap-2 mt-2">
                  <button onclick="setLgpdStatus(${r.id}, 'em_andamento')" class="text-[11px] text-blue-700 underline">em andamento</button>
                  <button onclick="setLgpdStatus(${r.id}, 'concluido')" class="text-[11px] text-emerald-700 underline">concluir</button>
                  <button onclick="setLgpdStatus(${r.id}, 'recusado')" class="text-[11px] text-red-600 underline">recusar</button>
                </div></div>`;
            }).join('')
          : '<div class="p-4 text-slate-400">Nenhuma solicitação.</div>';
      } catch (e) { console.error('[lgpd]', e); }
    }
    async function setLgpdStatus(id, status) {
      let response = null;
      if (status === 'concluido' || status === 'recusado') { response = prompt('Resposta ao titular (opcional):') || null; }
      await jsend('/api/lgpd/requests/' + id, 'PATCH', { status, response });
      loadLgpdRequests();
    }
    async function runDataMap() {
      const q = document.getElementById('lgpd-map-q').value.trim();
      const box = document.getElementById('lgpd-map-result');
      if (!q) { box.textContent = 'Informe um termo.'; return; }
      box.textContent = 'Buscando…';
      try {
        const d = await jget('/api/lgpd/data-map?q=' + encodeURIComponent(q));
        if (!d.success) { box.textContent = d.error || 'Erro.'; return; }
        box.innerHTML = d.total === 0 ? '<span class="text-slate-400">Nenhum dado encontrado.</span>'
          : `<div class="font-bold text-navy-950 mb-2">${d.total} registro(s) em ${d.sources.length} fonte(s):</div>` +
            d.sources.map(s => `<div class="mb-1"><span class="font-semibold">${esc(s.source)}</span> <span class="text-slate-400">(${s.table})</span>: <span class="text-slate-700">${s.count}</span></div>`).join('');
      } catch (e) { box.textContent = 'Erro na busca.'; }
    }

    // ---------------- REQUERIMENTOS ADMINISTRATIVOS ----------------
    let _areqStatuses = {}, _areqSpheres = {}, _areqSelectsReady = false;
    const AREQ_BADGE = { protocolado: 'bg-slate-100 text-slate-700', em_analise: 'bg-blue-100 text-blue-800', exigencia: 'bg-amber-100 text-amber-800', deferido: 'bg-emerald-100 text-emerald-800', indeferido: 'bg-red-100 text-red-800', recurso: 'bg-purple-100 text-purple-800', concluido: 'bg-emerald-100 text-emerald-800', arquivado: 'bg-slate-100 text-slate-500' };
    function daysLeftLabel(dateStr) {
      if (!dateStr) return '';
      const d = new Date(dateStr + 'T23:59:59'); if (isNaN(d)) return '';
      const diff = Math.round((d - new Date(new Date().toDateString())) / 86400000);
      if (diff < 0) return `<span class="text-red-600 font-bold">vencido ${Math.abs(diff)}d</span>`;
      if (diff === 0) return '<span class="text-red-600 font-bold">vence hoje</span>';
      if (diff <= 7) return `<span class="text-amber-600 font-bold">${diff}d</span>`;
      return `<span class="text-slate-400">${diff}d</span>`;
    }
    async function loadAdminRequests() {
      try {
        const g = id => document.getElementById(id);
        const params = new URLSearchParams();
        if (g('areq-search').value.trim()) params.set('q', g('areq-search').value.trim());
        if (g('areq-filter-status').value !== 'all') params.set('status', g('areq-filter-status').value);
        if (g('areq-filter-sphere').value !== 'all') params.set('sphere', g('areq-filter-sphere').value);
        const d = await jget('/api/admin-requests?' + params.toString());
        if (!d.success) return;
        _areqStatuses = d.statuses; _areqSpheres = d.spheres;
        if (!_areqSelectsReady) {
          const opts = Object.entries(d.statuses).map(([k, v]) => `<option value="${k}">${v}</option>`).join('');
          g('areq-status').innerHTML = opts;
          g('areq-filter-status').innerHTML = '<option value="all">Todos os status</option>' + opts;
          _areqSelectsReady = true;
        }
        const st = d.stats;
        const card = (l, v, t) => `<div class="bg-white p-3 rounded-xl border border-slate-200 text-center"><div class="text-lg font-bold ${t || 'text-navy-950'}">${v || 0}</div><div class="text-[11px] text-slate-500">${l}</div></div>`;
        g('areq-stats').innerHTML = card('Total', st.total) + card('Em aberto', st.em_aberto, 'text-blue-600') + card('Em exigência', st.exigencia, 'text-amber-600') + card('Prazo ≤7d', st.prazo_proximo, 'text-amber-600') + card('Vencidos', st.vencidos, 'text-red-600');
        g('areq-list').innerHTML = d.requests.length ? d.requests.map(r => `
          <div class="p-3">
            <div class="flex items-start justify-between gap-2">
              <div class="min-w-0">
                <div class="font-semibold text-navy-950">${esc(r.title)} <span class="text-xs text-slate-400">${esc(r.id)}</span></div>
                <div class="text-xs text-slate-500">${esc(r.agency_name)} • ${esc((_areqSpheres[r.agency_sphere] || r.agency_sphere))}${r.client_name ? ' • ' + esc(r.client_name) : ''}${r.protocol_number ? ' • protocolo ' + esc(r.protocol_number) : ''}</div>
                <div class="text-xs text-slate-500 mt-0.5">${r.deadline_date ? 'Prazo: ' + fmtDate(r.deadline_date) + ' ' + daysLeftLabel(r.deadline_date) : '<span class="text-slate-300">sem prazo</span>'}${r.responsible ? ' • ' + esc(r.responsible) : ''}</div>
              </div>
              <span class="px-2 py-0.5 rounded-full text-[10px] font-bold ${AREQ_BADGE[r.status] || 'bg-slate-100 text-slate-600'} flex-shrink-0">${esc(_areqStatuses[r.status] || r.status)}</span>
            </div>
            <div class="flex flex-wrap gap-2 mt-2 text-[11px]">
              <button onclick="editAdminReq('${r.id}')" class="text-blue-700 underline">editar</button>
              <button onclick="changeAdminReqStatus('${r.id}')" class="text-amber-700 underline">mudar status</button>
              <button onclick="addAdminReqUpdate('${r.id}')" class="text-slate-600 underline">+ andamento</button>
              <button onclick="viewAdminReqUpdates('${r.id}')" class="text-slate-600 underline">andamentos</button>
              <button onclick="deleteAdminReq('${r.id}')" class="text-red-600 underline">excluir</button>
            </div>
          </div>`).join('') : '<div class="p-4 text-slate-400">Nenhum requerimento. Clique em "+ Novo requerimento".</div>';
      } catch (e) { console.error('[areq]', e); }
    }
    function openAdminReqForm() { document.getElementById('areq-form').classList.remove('hidden'); document.getElementById('areq-form').scrollIntoView({ block: 'center' }); }
    function closeAdminReqForm() {
      const g = id => document.getElementById(id);
      ['areq-id', 'areq-title', 'areq-client', 'areq-agency', 'areq-type', 'areq-protocol', 'areq-filed', 'areq-deadline', 'areq-responsible', 'areq-desc'].forEach(i => g(i).value = '');
      g('areq-sphere').value = 'federal'; if (g('areq-status').options.length) g('areq-status').selectedIndex = 0;
      g('areq-form-title').textContent = 'Novo requerimento'; g('areq-msg').textContent = '';
      g('areq-form').classList.add('hidden');
    }
    async function editAdminReq(id) {
      const g = i => document.getElementById(i);
      const d = await jget('/api/admin-requests/' + id);
      if (!d.success) return;
      const r = d.request;
      g('areq-id').value = r.id; g('areq-title').value = r.title || ''; g('areq-client').value = r.client_name || '';
      g('areq-agency').value = r.agency_name || ''; g('areq-sphere').value = r.agency_sphere || 'federal';
      g('areq-type').value = r.request_type || ''; g('areq-protocol').value = r.protocol_number || '';
      g('areq-status').value = r.status || 'protocolado'; g('areq-filed').value = (r.filed_date || '').slice(0, 10);
      g('areq-deadline').value = (r.deadline_date || '').slice(0, 10); g('areq-responsible').value = r.responsible || '';
      g('areq-desc').value = r.description || '';
      g('areq-form-title').textContent = 'Editar requerimento ' + r.id;
      openAdminReqForm();
    }
    async function saveAdminReq() {
      const g = i => document.getElementById(i);
      const msg = g('areq-msg'); msg.textContent = ''; msg.className = 'text-sm self-center';
      const body = { title: g('areq-title').value.trim(), client_name: g('areq-client').value.trim(), agency_name: g('areq-agency').value.trim(),
        agency_sphere: g('areq-sphere').value, request_type: g('areq-type').value.trim(), protocol_number: g('areq-protocol').value.trim(),
        status: g('areq-status').value, filed_date: g('areq-filed').value || null, deadline_date: g('areq-deadline').value || null,
        responsible: g('areq-responsible').value.trim(), description: g('areq-desc').value.trim() };
      if (!body.title || !body.agency_name) { msg.textContent = 'Informe objeto e órgão.'; msg.className = 'text-sm self-center text-red-600'; return; }
      const id = g('areq-id').value;
      const { ok, data } = id ? await jsend('/api/admin-requests/' + id, 'PUT', body) : await jsend('/api/admin-requests', 'POST', body);
      if (!ok) { msg.textContent = data.error || 'Falha.'; msg.className = 'text-sm self-center text-red-600'; return; }
      closeAdminReqForm(); loadAdminRequests(); refreshNotifBadge();
    }
    async function changeAdminReqStatus(id) {
      const keys = Object.keys(_areqStatuses);
      const list = keys.map((k, i) => `${i + 1}) ${_areqStatuses[k]}`).join('\n');
      const pick = prompt('Novo status:\n' + list + '\n\nDigite o número:');
      if (!pick) return;
      const k = keys[parseInt(pick, 10) - 1];
      if (!k) return;
      await jsend('/api/admin-requests/' + id + '/status', 'PATCH', { status: k });
      loadAdminRequests();
    }
    async function addAdminReqUpdate(id) {
      const desc = prompt('Descreva o andamento:');
      if (!desc) return;
      await jsend('/api/admin-requests/' + id + '/updates', 'POST', { description: desc });
      alert('Andamento registrado.');
    }
    async function viewAdminReqUpdates(id) {
      const d = await jget('/api/admin-requests/' + id);
      if (!d.success) return;
      const txt = d.updates.length ? d.updates.map(u => `• ${fmtDate(u.update_date)} — ${u.description}`).join('\n') : 'Nenhum andamento registrado.';
      alert('Andamentos de ' + id + ':\n\n' + txt);
    }
    async function deleteAdminReq(id) {
      if (!confirm('Excluir o requerimento ' + id + '?')) return;
      await jsend('/api/admin-requests/' + id, 'DELETE');
      loadAdminRequests();
    }

    // ---------------- POLLING DO SINO ----------------
    setInterval(() => { if (getToken()) refreshNotifBadge(); }, 120000);
    setTimeout(() => { if (getToken()) refreshNotifBadge(); }, 3000);
