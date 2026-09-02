// Módulo Frontend: 🚀 Central de Foguetes (Comunicação Interna & Despachos Rápidos)

let currentRocketBox = 'all';
let currentActiveRocket = null;

async function initRocketsTab() {
  await Promise.all([
    loadRocketStats(),
    loadRockets(),
    loadRocketRecipients()
  ]);
}

async function loadRocketStats() {
  try {
    const res = await apiFetch('/api/rockets/stats');
    const data = await res.json();
    if (res.ok && data.success) {
      const s = data.stats;
      const elActive = document.getElementById('rocket-stat-active');
      const elPendingExec = document.getElementById('rocket-stat-pending-exec');
      const elPendingKnow = document.getElementById('rocket-stat-pending-know');
      const elDone = document.getElementById('rocket-stat-done');

      if (elActive) elActive.textContent = s.total_active || 0;
      if (elPendingExec) elPendingExec.textContent = s.pending_execution || 0;
      if (elPendingKnow) elPendingKnow.textContent = s.pending_knowledge || 0;
      if (elDone) elDone.textContent = s.mission_accomplished || 0;
    }
  } catch (err) {
    console.error('[FOGUETES] Erro ao carregar métricas:', err);
  }
}

async function loadRocketRecipients() {
  try {
    const res = await apiFetch('/api/rockets/recipients');
    const data = await res.json();
    if (res.ok && data.success) {
      const select = document.getElementById('rocket-recipient-select');
      if (!select) return;

      select.innerHTML = `
        <option value="">Selecione o destinatário...</option>
        <option value="all" class="font-bold text-amber-700">📢 Toda a Equipe (Geral)</option>
      `;

      data.recipients.forEach(r => {
        const opt = document.createElement('option');
        opt.value = r.id;
        opt.textContent = r.label;
        opt.dataset.name = r.name;
        opt.dataset.type = r.type;
        select.appendChild(opt);
      });
    }
  } catch (err) {
    console.error('[FOGUETES] Erro ao carregar destinatários:', err);
  }
}

function switchRocketBox(box) {
  currentRocketBox = box;
  const boxes = ['all', 'inbox', 'outbox', 'archived'];
  const activeClass = "px-4 py-2 text-xs font-bold rounded-xl bg-amber-500 text-white shadow-sm transition-all";
  const inactiveClass = "px-4 py-2 text-xs font-semibold rounded-xl bg-slate-100 text-slate-700 hover:bg-slate-200 transition-all";

  boxes.forEach(b => {
    const btn = document.getElementById(`rocket-box-btn-${b}`);
    if (btn) btn.className = (b === box) ? activeClass : inactiveClass;
  });

  loadRockets();
}

async function loadRockets() {
  const tableBody = document.getElementById('rockets-table-body');
  const emptyState = document.getElementById('rockets-empty-state');
  const loading = document.getElementById('rockets-loading');

  if (loading) loading.classList.remove('hidden');
  if (emptyState) emptyState.classList.add('hidden');

  try {
    const typeFilter = document.getElementById('rocket-filter-type')?.value || '';
    const priorityFilter = document.getElementById('rocket-filter-priority')?.value || '';
    const statusFilter = document.getElementById('rocket-filter-status')?.value || '';
    const searchInput = document.getElementById('rocket-search-input')?.value || '';

    const params = new URLSearchParams({
      box: currentRocketBox,
      type: typeFilter,
      priority: priorityFilter,
      status: statusFilter,
      q: searchInput
    });

    const res = await apiFetch(`/api/rockets?${params.toString()}`);
    const data = await res.json();

    if (loading) loading.classList.add('hidden');

    if (res.ok && data.success && data.rockets.length > 0) {
      if (tableBody) {
        tableBody.innerHTML = data.rockets.map(r => renderRocketRow(r)).join('');
      }
      if (emptyState) emptyState.classList.add('hidden');
    } else {
      if (tableBody) tableBody.innerHTML = '';
      if (emptyState) emptyState.classList.remove('hidden');
    }
  } catch (err) {
    if (loading) loading.classList.add('hidden');
    console.error('[FOGUETES] Erro ao listar foguetes:', err);
  }
}

function renderRocketRow(r) {
  const isUrgent = r.priority === 'urgente' || r.priority === 'altissima';
  const priorityBadge = isUrgent
    ? `<span class="px-2 py-0.5 text-[10px] font-bold rounded-md bg-rose-100 text-rose-800 border border-rose-200">🔥 ${r.priority.toUpperCase()}</span>`
    : `<span class="px-2 py-0.5 text-[10px] font-medium rounded-md bg-slate-100 text-slate-700">Normal</span>`;

  const typeBadge = r.message_type === 'execucao'
    ? `<span class="px-2 py-0.5 text-[10px] font-bold rounded-md bg-amber-100 text-amber-900 border border-amber-300">🎯 Execução</span>`
    : `<span class="px-2 py-0.5 text-[10px] font-semibold rounded-md bg-blue-100 text-blue-900 border border-blue-200">👁️ Conhecimento</span>`;

  let statusBadge = `<span class="px-2.5 py-1 text-xs font-semibold rounded-full bg-amber-50 text-amber-700 border border-amber-200">⏳ Pendente</span>`;
  if (r.status === 'ciente') {
    statusBadge = `<span class="px-2.5 py-1 text-xs font-semibold rounded-full bg-blue-50 text-blue-700 border border-blue-200">👁️ Ciente</span>`;
  } else if (r.status === 'em_andamento') {
    statusBadge = `<span class="px-2.5 py-1 text-xs font-semibold rounded-full bg-purple-50 text-purple-700 border border-purple-200">⚡ Em Andamento</span>`;
  } else if (r.status === 'missao_cumprida') {
    statusBadge = `<span class="px-2.5 py-1 text-xs font-bold rounded-full bg-emerald-100 text-emerald-800 border border-emerald-300">🎯 Missão Cumprida</span>`;
  }

  const dateFormatted = new Date(r.created_at).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
  const deadlineFormatted = r.deadline ? new Date(r.deadline).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '—';

  return `
    <tr class="hover:bg-slate-50 transition-colors border-b border-slate-100 text-xs">
      <td class="px-4 py-3 font-mono font-bold text-navy-950">
        <button onclick="viewRocketDetails(${r.id})" class="text-amber-600 hover:text-amber-800 underline flex items-center space-x-1">
          <span>🚀</span>
          <span>#${r.protocol_number}</span>
        </button>
      </td>
      <td class="px-4 py-3 font-medium text-slate-800">
        <div>${escapeHtml(r.sender_name)}</div>
        <div class="text-[10px] text-slate-400">${dateFormatted}</div>
      </td>
      <td class="px-4 py-3 font-medium text-slate-800">
        ${r.recipient_id === 'all' ? '<span class="font-bold text-amber-700">📢 Toda a Equipe</span>' : escapeHtml(r.recipient_name)}
      </td>
      <td class="px-4 py-3">
        <div class="font-bold text-navy-950 truncate max-w-xs">${escapeHtml(r.subject)}</div>
        <div class="text-[11px] text-slate-500 truncate max-w-md">${escapeHtml(r.message)}</div>
      </td>
      <td class="px-4 py-3">${typeBadge}</td>
      <td class="px-4 py-3">${priorityBadge}</td>
      <td class="px-4 py-3 font-mono text-[11px] text-slate-600">${deadlineFormatted}</td>
      <td class="px-4 py-3">${statusBadge}</td>
      <td class="px-4 py-3 text-right">
        <button onclick="viewRocketDetails(${r.id})" class="px-2.5 py-1 rounded-lg bg-navy-950 hover:bg-gold-600 text-white font-medium text-xs shadow-sm transition-all" title="Abrir Thread">
          Abrir
        </button>
      </td>
    </tr>
  `;
}

function openNewRocketModal() {
  const modal = document.getElementById('rocket-new-modal');
  if (modal) modal.classList.remove('hidden');
}

function closeNewRocketModal() {
  const modal = document.getElementById('rocket-new-modal');
  if (modal) modal.classList.add('hidden');
  const form = document.getElementById('rocket-new-form');
  if (form) form.reset();
}

async function handleCreateRocket(e) {
  if (e && e.preventDefault) e.preventDefault();

  const select = document.getElementById('rocket-recipient-select');
  const recipient_id = select ? select.value : '';
  const selectedOpt = select ? select.options[select.selectedIndex] : null;
  const recipient_name = selectedOpt ? (selectedOpt.dataset.name || selectedOpt.text) : '';
  const recipient_type = selectedOpt ? (selectedOpt.dataset.type || (recipient_id === 'all' ? 'all' : 'individual')) : 'individual';

  const subject = document.getElementById('rocket-subject')?.value;
  const message = document.getElementById('rocket-message')?.value;
  const message_type = document.querySelector('input[name="rocket-type"]:checked')?.value || 'execucao';
  const priority = document.getElementById('rocket-priority')?.value || 'normal';
  const deadline = document.getElementById('rocket-deadline')?.value || null;

  if (!recipient_id || !subject || !message) {
    alert('Por favor, preencha o destinatário, o assunto e a mensagem do foguete.');
    return;
  }

  try {
    const res = await apiFetch('/api/rockets', {
      method: 'POST',
      body: JSON.stringify({
        recipient_id,
        recipient_name,
        recipient_type,
        subject,
        message,
        message_type,
        priority,
        deadline
      })
    });

    const data = await res.json();
    if (res.ok && data.success) {
      closeNewRocketModal();
      await Promise.all([loadRocketStats(), loadRockets()]);
      alert(`🚀 Foguete #${data.rocket.protocol_number} lançado com sucesso!`);
    } else {
      alert(data.error || 'Erro ao lançar foguete.');
    }
  } catch (err) {
    console.error('[FOGUETES] Erro ao criar foguete:', err);
    alert('Erro de comunicação com o servidor.');
  }
}

async function viewRocketDetails(id) {
  try {
    const res = await apiFetch(`/api/rockets/${id}`);
    const data = await res.json();
    if (res.ok && data.success) {
      currentActiveRocket = data.rocket;
      renderRocketModal(data.rocket, data.replies);
      const modal = document.getElementById('rocket-view-modal');
      if (modal) modal.classList.remove('hidden');
    } else {
      alert(data.error || 'Foguete não encontrado.');
    }
  } catch (err) {
    console.error('[FOGUETES] Erro ao carregar detalhes:', err);
  }
}

function closeViewRocketModal() {
  const modal = document.getElementById('rocket-view-modal');
  if (modal) modal.classList.add('hidden');
  currentActiveRocket = null;
}

function renderRocketModal(rocket, replies = []) {
  const elProtocol = document.getElementById('rocket-view-protocol');
  const elSubject = document.getElementById('rocket-view-subject');
  const elSender = document.getElementById('rocket-view-sender');
  const elRecipient = document.getElementById('rocket-view-recipient');
  const elDate = document.getElementById('rocket-view-date');
  const elDeadline = document.getElementById('rocket-view-deadline');
  const elStatus = document.getElementById('rocket-view-status');
  const elOriginalMsg = document.getElementById('rocket-view-original-msg');
  const timeline = document.getElementById('rocket-view-timeline');

  if (elProtocol) elProtocol.textContent = `#${rocket.protocol_number}`;
  if (elSubject) elSubject.textContent = rocket.subject;
  if (elSender) elSender.textContent = `${rocket.sender_name} (${rocket.sender_role || 'Mestre'})`;
  if (elRecipient) elRecipient.textContent = rocket.recipient_id === 'all' ? '📢 Toda a Equipe' : rocket.recipient_name;
  if (elDate) elDate.textContent = new Date(rocket.created_at).toLocaleString('pt-BR');
  if (elDeadline) elDeadline.textContent = rocket.deadline ? new Date(rocket.deadline).toLocaleString('pt-BR') : 'Sem prazo fatal';
  if (elOriginalMsg) elOriginalMsg.textContent = rocket.message;

  if (elStatus) {
    let stText = '⏳ Pendente';
    if (rocket.status === 'ciente') stText = '👁️ Ciente';
    if (rocket.status === 'missao_cumprida') stText = '🎯 Missão Cumprida';
    elStatus.textContent = stText;
  }

  if (timeline) {
    if (replies.length === 0) {
      timeline.innerHTML = `<div class="text-xs text-slate-400 italic py-2">Nenhuma réplica registrada ainda nesta thread.</div>`;
    } else {
      timeline.innerHTML = replies.map(rep => {
        const repDate = new Date(rep.created_at).toLocaleString('pt-BR');
        let icon = '💬';
        let bgClass = 'bg-slate-50 border-slate-200';
        if (rep.reply_type === 'ciente') {
          icon = '👁️';
          bgClass = 'bg-blue-50/70 border-blue-200 text-blue-900';
        } else if (rep.reply_type === 'missao_cumprida') {
          icon = '🎯';
          bgClass = 'bg-emerald-50/70 border-emerald-300 text-emerald-900';
        }

        return `
          <div class="p-3 rounded-xl border ${bgClass} text-xs space-y-1">
            <div class="flex items-center justify-between font-bold text-navy-950">
              <div class="flex items-center space-x-1.5">
                <span>${icon}</span>
                <span>${escapeHtml(rep.author_name)}</span>
                <span class="text-[10px] font-normal text-slate-500">(${escapeHtml(rep.author_role || 'Equipe')})</span>
              </div>
              <span class="text-[10px] font-normal text-slate-400">${repDate}</span>
            </div>
            <div class="text-slate-700 whitespace-pre-wrap">${escapeHtml(rep.message)}</div>
          </div>
        `;
      }).join('');
    }
  }
}

async function quickReplyRocket(type) {
  if (!currentActiveRocket) return;
  try {
    const res = await apiFetch(`/api/rockets/${currentActiveRocket.id}/reply`, {
      method: 'POST',
      body: JSON.stringify({ reply_type: type })
    });

    const data = await res.json();
    if (res.ok && data.success) {
      currentActiveRocket = data.rocket;
      renderRocketModal(data.rocket, data.replies);
      await Promise.all([loadRocketStats(), loadRockets()]);
    } else {
      alert(data.error || 'Erro ao responder.');
    }
  } catch (err) {
    console.error('[FOGUETES] Erro ao responder:', err);
  }
}

async function submitRocketReply(e) {
  if (e && e.preventDefault) e.preventDefault();
  if (!currentActiveRocket) return;

  const msgInput = document.getElementById('rocket-reply-input');
  const message = msgInput ? msgInput.value.trim() : '';

  if (!message) {
    alert('Digite uma mensagem para responder.');
    return;
  }

  try {
    const res = await apiFetch(`/api/rockets/${currentActiveRocket.id}/reply`, {
      method: 'POST',
      body: JSON.stringify({ reply_type: 'comentario', message })
    });

    const data = await res.json();
    if (res.ok && data.success) {
      if (msgInput) msgInput.value = '';
      currentActiveRocket = data.rocket;
      renderRocketModal(data.rocket, data.replies);
      await Promise.all([loadRocketStats(), loadRockets()]);
    } else {
      alert(data.error || 'Erro ao registrar réplica.');
    }
  } catch (err) {
    console.error('[FOGUETES] Erro ao registrar réplica:', err);
  }
}

function printRocketSlip() {
  if (!currentActiveRocket) return;
  window.print();
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
