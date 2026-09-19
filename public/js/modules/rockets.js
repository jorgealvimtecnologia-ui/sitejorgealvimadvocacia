// Módulo Frontend: 🚀 Central de Foguetes (Comunicação Interna & Despachos Rápidos)

let currentRocketBox = 'inbox';
let currentRocketScope = 'personal';
let currentActiveRocket = null;
let currentLoadedTemplates = [];

function getActiveUserData() {
  try {
    const raw = localStorage.getItem('ja_admin_user');
    if (raw) return JSON.parse(raw);
  } catch (e) {}
  return { id: 'USR-MASTER-01', name: 'Dr. Jorge Alvim', role: 'master', username: 'jorgealvimtecnologia' };
}

async function initRocketsTab() {
  updateUserBanner();
  await Promise.all([
    loadRocketStats(),
    loadRockets(),
    loadRocketRecipients()
  ]);
}

function updateUserBanner() {
  const user = getActiveUserData();
  const elName = document.getElementById('rocket-active-username');
  const elRole = document.getElementById('rocket-active-role');
  const elSender = document.getElementById('rocket-sender-display');
  const btnGlobal = document.getElementById('rocket-box-btn-global');

  const roleLabels = {
    master: 'Sócio Mestre',
    dono_escritorio: 'Sócio Titular',
    advogado: 'Advogado(a)',
    estagiario: 'Estagiário(a)',
    secretaria: 'Secretária / Atendimento',
    gerente: 'Gerência / Administrativo',
    motorista: 'Motorista / Apoio Operacional',
    cliente: 'Cliente',
    colaborador: 'Colaborador(a)'
  };

  const roleKey = user.role_template || user.role || 'colaborador';
  const roleLabel = (user.role === 'master' || user.username === 'jorgealvimtecnologia')
    ? 'Sócio Mestre'
    : (roleLabels[roleKey] || (user.role === 'admin' ? 'Operador' : user.role));

  if (elName) elName.textContent = user.name || user.username || 'Dr. Jorge Alvim';
  if (elRole) elRole.textContent = roleLabel;
  if (elSender) elSender.textContent = `${user.name || user.username} (${roleLabel})`;

  // Visão Geral do Escritório visível se for Sócio Mestre
  const isMaster = user.role === 'master' || user.username === 'jorgealvimtecnologia';
  if (btnGlobal) {
    if (isMaster) btnGlobal.classList.remove('hidden');
    else btnGlobal.classList.add('hidden');
  }
}

async function loadRocketStats() {
  try {
    const res = await apiFetch(`/api/rockets/stats?scope=${currentRocketScope}`);
    const data = await res.json();
    if (res.ok && data.success) {
      const s = data.stats;
      const elActive = document.getElementById('rocket-stat-active');
      const elPendingExec = document.getElementById('rocket-stat-pending-exec');
      const elPendingKnow = document.getElementById('rocket-stat-pending-know');
      const elDone = document.getElementById('rocket-stat-done');
      const badgeInbox = document.getElementById('rocket-badge-inbox');

      if (elActive) elActive.textContent = s.total_active || 0;
      if (elPendingExec) elPendingExec.textContent = s.pending_execution || 0;
      if (elPendingKnow) elPendingKnow.textContent = s.pending_knowledge || 0;
      if (elDone) elDone.textContent = s.mission_accomplished || 0;

      // Badge numérico de mensagens pendentes na Caixa de Entrada
      const unread = s.unread_inbox || (data.personal_stats ? data.personal_stats.unread_inbox : 0);
      if (badgeInbox) {
        if (unread > 0) {
          badgeInbox.textContent = unread;
          badgeInbox.classList.remove('hidden');
        } else {
          badgeInbox.classList.add('hidden');
        }
      }
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
  currentRocketScope = 'personal';

  const boxes = ['inbox', 'outbox', 'saved', 'all', 'archived'];
  const activeClass = "px-4 py-2 text-xs font-bold rounded-xl bg-amber-500 text-white shadow-sm transition-all cursor-pointer flex items-center space-x-1.5";
  const inactiveClass = "px-4 py-2 text-xs font-semibold rounded-xl bg-slate-100 text-slate-700 hover:bg-slate-200 transition-all cursor-pointer flex items-center space-x-1.5";

  boxes.forEach(b => {
    const btn = document.getElementById(`rocket-box-btn-${b}`);
    if (btn) btn.className = (b === box) ? activeClass : inactiveClass;
  });

  const btnGlobal = document.getElementById('rocket-box-btn-global');
  if (btnGlobal) {
    btnGlobal.className = "px-4 py-2 text-xs font-semibold rounded-xl bg-slate-900 text-amber-300 hover:bg-slate-800 transition-all cursor-pointer border border-amber-500/40";
  }

  loadRockets();
}

function toggleRocketGlobalScope() {
  currentRocketScope = 'global';
  currentRocketBox = 'all';

  const boxes = ['inbox', 'outbox', 'saved', 'all', 'archived'];
  const inactiveClass = "px-4 py-2 text-xs font-semibold rounded-xl bg-slate-100 text-slate-700 hover:bg-slate-200 transition-all cursor-pointer flex items-center space-x-1.5";

  boxes.forEach(b => {
    const btn = document.getElementById(`rocket-box-btn-${b}`);
    if (btn) btn.className = inactiveClass;
  });

  const btnGlobal = document.getElementById('rocket-box-btn-global');
  if (btnGlobal) {
    btnGlobal.className = "px-4 py-2 text-xs font-bold rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 text-white shadow-md transition-all cursor-pointer border border-amber-400";
  }

  loadRocketStats();
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
      scope: currentRocketScope,
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
        tableBody.innerHTML = data.rockets.map(r => renderRocketRow(r, data.current_user_id, data.is_master)).join('');
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

function renderRocketRow(r, currentUserId, isMaster) {
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

  // Ícone de estrela salvo/favorito
  const starIcon = r.is_saved ? '⭐' : '☆';
  const starTitle = r.is_saved ? 'Remover dos Salvos' : 'Salvar / Favoritar Despacho';
  const starClass = r.is_saved ? 'text-amber-500 hover:text-amber-600' : 'text-slate-300 hover:text-amber-400';

  // Exibição de Remetente / Destinatário
  let partyDisplay = '';
  if (currentRocketBox === 'inbox') {
    partyDisplay = `<div><span class="text-[10px] text-slate-400 block uppercase font-bold">De:</span><span class="font-bold text-slate-800">${escapeHtml(r.sender_name)}</span></div>`;
  } else if (currentRocketBox === 'outbox') {
    partyDisplay = `<div><span class="text-[10px] text-slate-400 block uppercase font-bold">Para:</span><span class="font-bold text-slate-800">${r.recipient_id === 'all' ? '📢 Toda a Equipe' : escapeHtml(r.recipient_name)}</span></div>`;
  } else {
    partyDisplay = `
      <div class="text-[11px] leading-tight">
        <span class="text-slate-600 font-semibold">${escapeHtml(r.sender_name)}</span>
        <span class="text-amber-500 font-bold mx-1">➔</span>
        <span class="text-slate-800 font-bold">${r.recipient_id === 'all' ? '📢 Equipe' : escapeHtml(r.recipient_name)}</span>
      </div>
    `;
  }

  // Ações Rápidas por Linha
  const isAuthor = r.sender_id === currentUserId;
  const canDelete = isAuthor || isMaster;
  let quickActionBtn = '';
  if (r.status === 'pendente') {
    quickActionBtn = `
      <button onclick="quickReplyFromRow(${r.id}, 'ciente', event)" class="px-2 py-1 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-800 border border-blue-200 text-[10px] font-bold" title="Dar Ciência Imediata">
        👁️ Ciente
      </button>
    `;
  } else if (r.status === 'ciente' && r.message_type === 'execucao') {
    quickActionBtn = `
      <button onclick="quickReplyFromRow(${r.id}, 'missao_cumprida', event)" class="px-2 py-1 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300 text-[10px] font-bold" title="Cumprir Missão">
        🎯 Concluir
      </button>
    `;
  }

  return `
    <tr class="hover:bg-slate-50 transition-colors border-b border-slate-100 text-xs">
      <td class="px-4 py-3 font-mono font-bold text-navy-950">
        <div class="flex items-center space-x-1.5">
          <button onclick="toggleSaveRocketRow(${r.id}, event)" class="text-base cursor-pointer ${starClass} transition-colors" title="${starTitle}">
            ${starIcon}
          </button>
          <button onclick="viewRocketDetails(${r.id})" class="text-amber-600 hover:text-amber-800 underline flex items-center space-x-1 font-mono font-bold">
            <span>🚀</span>
            <span>#${r.protocol_number}</span>
          </button>
        </div>
        <div class="text-[10px] text-slate-400 mt-0.5">${dateFormatted}</div>
      </td>
      <td class="px-4 py-3 font-medium text-slate-800">
        ${partyDisplay}
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
        <div class="flex items-center justify-end space-x-1.5">
          ${quickActionBtn}
          <button onclick="viewRocketDetails(${r.id})" class="px-2.5 py-1 rounded-lg bg-navy-950 hover:bg-gold-600 text-white font-medium text-xs shadow-sm transition-all" title="Abrir Despacho Completo">
            Abrir
          </button>
          ${canDelete ? `
            <button onclick="deleteRocketRow(${r.id}, event)" class="p-1 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors" title="Excluir Despacho">
              🗑️
            </button>
          ` : ''}
        </div>
      </td>
    </tr>
  `;
}

async function toggleSaveRocketRow(id, e) {
  if (e && e.stopPropagation) e.stopPropagation();
  try {
    const res = await apiFetch(`/api/rockets/${id}/save`, { method: 'PATCH' });
    const data = await res.json();
    if (res.ok && data.success) {
      await Promise.all([loadRocketStats(), loadRockets()]);
    } else {
      alert(data.error || 'Erro ao salvar despacho.');
    }
  } catch (err) {
    console.error('[FOGUETES] Erro ao alternar salvo:', err);
  }
}

async function toggleSaveActiveRocket() {
  if (!currentActiveRocket) return;
  await toggleSaveRocketRow(currentActiveRocket.id);
  // Atualiza detalhes do modal aberto
  await viewRocketDetails(currentActiveRocket.id);
}

async function quickReplyFromRow(id, type, e) {
  if (e && e.stopPropagation) e.stopPropagation();
  try {
    const res = await apiFetch(`/api/rockets/${id}/reply`, {
      method: 'POST',
      body: JSON.stringify({ reply_type: type })
    });
    const data = await res.json();
    if (res.ok && data.success) {
      await Promise.all([loadRocketStats(), loadRockets()]);
    } else {
      alert(data.error || 'Erro ao registrar ciência.');
    }
  } catch (err) {
    console.error('[FOGUETES] Erro ao responder despacho:', err);
  }
}

async function deleteRocketRow(id, e) {
  if (e && e.stopPropagation) e.stopPropagation();
  if (!confirm('Deseja realmente excluir este despacho permanentemente? Esta ação não pode ser desfeita.')) {
    return;
  }

  try {
    const res = await apiFetch(`/api/rockets/${id}`, { method: 'DELETE' });
    const data = await res.json();
    if (res.ok && data.success) {
      if (currentActiveRocket && currentActiveRocket.id === id) {
        closeViewRocketModal();
      }
      await Promise.all([loadRocketStats(), loadRockets()]);
    } else {
      alert(data.error || 'Erro ao excluir despacho.');
    }
  } catch (err) {
    console.error('[FOGUETES] Erro ao excluir foguete:', err);
  }
}

async function deleteActiveRocket() {
  if (!currentActiveRocket) return;
  await deleteRocketRow(currentActiveRocket.id);
}

function openNewRocketModal() {
  updateUserBanner();
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
  const saveText = document.getElementById('rocket-view-save-text');
  const saveIcon = document.getElementById('rocket-view-save-icon');

  if (elProtocol) elProtocol.textContent = `#${rocket.protocol_number}`;
  if (elSubject) elSubject.textContent = rocket.subject;
  if (elSender) elSender.textContent = `${rocket.sender_name} (${rocket.sender_role || 'Membro'})`;
  if (elRecipient) elRecipient.textContent = rocket.recipient_id === 'all' ? '📢 Toda a Equipe' : rocket.recipient_name;
  if (elDate) elDate.textContent = new Date(rocket.created_at).toLocaleString('pt-BR');
  if (elDeadline) elDeadline.textContent = rocket.deadline ? new Date(rocket.deadline).toLocaleString('pt-BR') : 'Sem prazo fatal';
  if (elOriginalMsg) elOriginalMsg.textContent = rocket.message;

  if (saveIcon) saveIcon.textContent = rocket.is_saved ? '⭐' : '☆';
  if (saveText) saveText.textContent = rocket.is_saved ? 'Salvo' : 'Salvar';

  if (elStatus) {
    let stText = '⏳ Pendente';
    if (rocket.status === 'ciente') stText = '👁️ Ciente';
    if (rocket.status === 'em_andamento') stText = '⚡ Em Andamento';
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

// ============================================================
// MODAL: CONTROLE DE USUÁRIOS DO FOGUETE
// ============================================================
function openRocketUsersModal() {
  const modal = document.getElementById('rocket-users-modal');
  if (modal) modal.classList.remove('hidden');
  loadRocketUsers();
}

function closeRocketUsersModal() {
  const modal = document.getElementById('rocket-users-modal');
  if (modal) modal.classList.add('hidden');
  const form = document.getElementById('rocket-new-user-form');
  if (form) form.reset();
}

async function loadRocketUsers() {
  const tbody = document.getElementById('rusers-table-body');
  const badge = document.getElementById('rusers-count-badge');
  if (tbody) tbody.innerHTML = `<tr><td colspan="6" class="text-center py-6 text-slate-400">Carregando usuários...</td></tr>`;

  try {
    const res = await apiFetch('/api/rockets/users');
    const data = await res.json();
    if (res.ok && data.success) {
      if (badge) badge.textContent = `${data.users.length} usuários cadastrados`;
      if (!tbody) return;

      if (data.users.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" class="text-center py-6 text-slate-400">Nenhum usuário encontrado.</td></tr>`;
        return;
      }

      const currentUser = getActiveUserData();
      tbody.innerHTML = data.users.map(u => {
        const isMaster = u.is_master || u.role === 'master' || u.username === 'jorgealvimtecnologia';
        const isSelf = u.id === currentUser.id || u.username === currentUser.username;
        const roleBadge = isMaster
          ? `<span class="px-2 py-0.5 rounded-full bg-amber-100 text-amber-900 font-bold border border-amber-300 text-[10px]">👑 Sócio Mestre</span>`
          : `<span class="px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 font-medium text-[10px]">${escapeHtml(u.role || 'Operador')}</span>`;

        return `
          <tr class="hover:bg-slate-50 transition-colors border-b border-slate-100">
            <td class="px-4 py-3 font-bold text-navy-950">
              ${escapeHtml(u.name)}
              ${isSelf ? '<span class="ml-1 text-[10px] text-amber-600 font-bold">(Você)</span>' : ''}
            </td>
            <td class="px-4 py-3 font-mono text-slate-600">@${escapeHtml(u.username)}</td>
            <td class="px-4 py-3">${roleBadge}</td>
            <td class="px-4 py-3 text-center font-mono font-bold text-slate-700">${u.sent_count || 0}</td>
            <td class="px-4 py-3 text-center font-mono font-bold text-slate-700">${u.received_count || 0}</td>
            <td class="px-4 py-3 text-right">
              ${(!isMaster && !isSelf) ? `
                <button onclick="deleteRocketUser('${u.id}', '${escapeHtml(u.name)}')" class="px-2.5 py-1 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-xs font-bold transition-all cursor-pointer">
                  Excluir
                </button>
              ` : '<span class="text-slate-400 text-[10px]">—</span>'}
            </td>
          </tr>
        `;
      }).join('');
    }
  } catch (err) {
    console.error('[FOGUETES] Erro ao carregar usuários:', err);
    if (tbody) tbody.innerHTML = `<tr><td colspan="6" class="text-center py-6 text-rose-500 font-bold">Erro ao carregar lista de usuários.</td></tr>`;
  }
}

async function handleCreateRocketUser(e) {
  if (e && e.preventDefault) e.preventDefault();
  const name = document.getElementById('ruser-name')?.value.trim();
  const username = document.getElementById('ruser-username')?.value.trim();
  const role = document.getElementById('ruser-role')?.value || 'admin';
  const password = document.getElementById('ruser-password')?.value;

  if (!name || !username || !password) {
    alert('Preencha nome, login e senha inicial.');
    return;
  }

  try {
    const res = await apiFetch('/api/rockets/users', {
      method: 'POST',
      body: JSON.stringify({ name, username, role, password })
    });
    const data = await res.json();
    if (res.ok && data.success) {
      alert(`Usuário ${name} cadastrado com sucesso!`);
      const form = document.getElementById('rocket-new-user-form');
      if (form) form.reset();
      await Promise.all([loadRocketUsers(), loadRocketRecipients()]);
    } else {
      alert(data.error || 'Erro ao cadastrar usuário.');
    }
  } catch (err) {
    console.error('[FOGUETES] Erro ao cadastrar usuário:', err);
    alert('Erro de comunicação ao criar usuário.');
  }
}

async function deleteRocketUser(id, name) {
  if (!confirm(`Deseja realmente remover o usuário "${name}" do sistema de foguetes?`)) {
    return;
  }

  try {
    const res = await apiFetch(`/api/rockets/users/${id}`, { method: 'DELETE' });
    const data = await res.json();
    if (res.ok && data.success) {
      await Promise.all([loadRocketUsers(), loadRocketRecipients()]);
    } else {
      alert(data.error || 'Erro ao excluir usuário.');
    }
  } catch (err) {
    console.error('[FOGUETES] Erro ao excluir usuário:', err);
  }
}

// ============================================================
// MODAL: MODELOS DE MENSAGENS SALVAS (TEMPLATES)
// ============================================================
function openRocketTemplatesModal() {
  const modal = document.getElementById('rocket-templates-modal');
  if (modal) modal.classList.remove('hidden');
  loadRocketTemplates();
}

function closeRocketTemplatesModal() {
  const modal = document.getElementById('rocket-templates-modal');
  if (modal) modal.classList.add('hidden');
  const form = document.getElementById('rocket-new-tpl-form');
  if (form) form.reset();
}

async function loadRocketTemplates() {
  const container = document.getElementById('rtpl-cards-container');
  if (container) container.innerHTML = `<div class="text-xs text-slate-400 py-4 text-center">Carregando modelos...</div>`;

  try {
    const res = await apiFetch('/api/rockets/templates');
    const data = await res.json();
    if (res.ok && data.success) {
      currentLoadedTemplates = data.templates || [];
      if (!container) return;

      if (currentLoadedTemplates.length === 0) {
        container.innerHTML = `<div class="text-xs text-slate-400 py-4 text-center">Nenhum modelo salvo ainda. Crie um acima!</div>`;
        return;
      }

      container.innerHTML = currentLoadedTemplates.map(tpl => {
        const typeBadge = tpl.message_type === 'execucao'
          ? `<span class="px-2 py-0.5 rounded-md bg-amber-100 text-amber-900 text-[10px] font-bold">🎯 Execução</span>`
          : `<span class="px-2 py-0.5 rounded-md bg-blue-100 text-blue-900 text-[10px] font-bold">👁️ Conhecimento</span>`;

        return `
          <div class="p-3.5 rounded-2xl bg-white border border-slate-200 hover:border-amber-400 transition-all space-y-2 shadow-xs">
            <div class="flex items-center justify-between">
              <div class="flex items-center space-x-2">
                <span class="font-bold text-navy-950 text-xs">${escapeHtml(tpl.title)}</span>
                ${typeBadge}
              </div>
              <div class="flex items-center space-x-1.5">
                <button onclick="useRocketTemplate(${tpl.id})" class="px-2.5 py-1 rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-bold text-xs shadow-xs transition-all flex items-center space-x-1 cursor-pointer">
                  <span>🚀</span>
                  <span>Usar Modelo</span>
                </button>
                <button onclick="deleteRocketTemplate(${tpl.id})" class="p-1 rounded-lg text-slate-400 hover:text-rose-600 transition-colors" title="Excluir Modelo">
                  🗑️
                </button>
              </div>
            </div>
            <div class="text-[11px] font-semibold text-slate-700">Assunto: "${escapeHtml(tpl.subject)}"</div>
            <div class="text-[11px] text-slate-500 line-clamp-2 bg-slate-50 p-2 rounded-xl">${escapeHtml(tpl.message)}</div>
          </div>
        `;
      }).join('');
    }
  } catch (err) {
    console.error('[FOGUETES] Erro ao carregar modelos:', err);
    if (container) container.innerHTML = `<div class="text-xs text-rose-500 py-4 text-center font-bold">Erro ao listar modelos.</div>`;
  }
}

function useRocketTemplate(tplId) {
  const tpl = currentLoadedTemplates.find(t => t.id === tplId);
  if (!tpl) return;

  closeRocketTemplatesModal();
  openNewRocketModal();

  const elSubject = document.getElementById('rocket-subject');
  const elMessage = document.getElementById('rocket-message');
  const elPriority = document.getElementById('rocket-priority');
  const radios = document.querySelectorAll('input[name="rocket-type"]');

  if (elSubject) elSubject.value = tpl.subject;
  if (elMessage) elMessage.value = tpl.message;
  if (elPriority && tpl.priority) elPriority.value = tpl.priority;
  radios.forEach(r => {
    r.checked = (r.value === tpl.message_type);
  });
}

async function handleCreateRocketTemplate(e) {
  if (e && e.preventDefault) e.preventDefault();

  const title = document.getElementById('rtpl-title')?.value.trim();
  const subject = document.getElementById('rtpl-subject')?.value.trim();
  const message = document.getElementById('rtpl-message')?.value.trim();
  const message_type = document.getElementById('rtpl-type')?.value || 'execucao';

  if (!title || !subject || !message) {
    alert('Preencha título, assunto e texto do modelo.');
    return;
  }

  try {
    const res = await apiFetch('/api/rockets/templates', {
      method: 'POST',
      body: JSON.stringify({ title, subject, message, message_type })
    });
    const data = await res.json();
    if (res.ok && data.success) {
      const form = document.getElementById('rocket-new-tpl-form');
      if (form) form.reset();
      await loadRocketTemplates();
    } else {
      alert(data.error || 'Erro ao salvar modelo.');
    }
  } catch (err) {
    console.error('[FOGUETES] Erro ao salvar modelo:', err);
  }
}

async function saveCurrentRocketAsTemplate() {
  const subject = document.getElementById('rocket-subject')?.value.trim();
  const message = document.getElementById('rocket-message')?.value.trim();
  const message_type = document.querySelector('input[name="rocket-type"]:checked')?.value || 'execucao';
  const priority = document.getElementById('rocket-priority')?.value || 'normal';

  if (!subject || !message) {
    alert('Preencha ao menos o assunto e a mensagem do foguete para salvar como modelo.');
    return;
  }

  const title = prompt('Digite um título para identificar este modelo:', subject.substring(0, 40));
  if (!title) return;

  try {
    const res = await apiFetch('/api/rockets/templates', {
      method: 'POST',
      body: JSON.stringify({ title, subject, message, message_type, priority })
    });
    const data = await res.json();
    if (res.ok && data.success) {
      alert(`Modelo "${title}" salvo com sucesso! Você pode reutilizá-lo sempre que precisar.`);
    } else {
      alert(data.error || 'Erro ao salvar modelo.');
    }
  } catch (err) {
    console.error('[FOGUETES] Erro ao salvar como modelo:', err);
  }
}

async function deleteRocketTemplate(id) {
  if (!confirm('Deseja excluir este modelo salvo?')) return;
  try {
    const res = await apiFetch(`/api/rockets/templates/${id}`, { method: 'DELETE' });
    const data = await res.json();
    if (res.ok && data.success) {
      await loadRocketTemplates();
    } else {
      alert(data.error || 'Erro ao excluir modelo.');
    }
  } catch (err) {
    console.error('[FOGUETES] Erro ao excluir modelo:', err);
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
