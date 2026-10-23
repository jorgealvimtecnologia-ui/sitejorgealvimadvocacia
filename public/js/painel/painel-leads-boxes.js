/**
 * Gestão de Leads v2 — Caixas da Visão Geral (Onda 1).
 *
 * Renderiza, no dashboard:
 *  1) Caixa "Novos Leads" (não distribuídos) + botão Distribuir (só o Mestre).
 *  2) Caixa "Novos Contratos" (contadores dia/mês/ano) + tabela drill-down.
 *
 * Consome os endpoints do módulo de leads:
 *  GET  /api/leads/dashboard-summary
 *  GET  /api/leads/contracts-list
 *  GET  /api/users                       (para os seletores de responsável/secretária)
 *  POST /api/leads/:id/distribute        (somente Mestre)
 */
(function () {
  'use strict';

  function token() {
    try {
      return (typeof window.getToken === 'function' && window.getToken()) ||
             localStorage.getItem('ja_admin_token') ||
             localStorage.getItem('ja_token') || '';
    } catch (_) { return ''; }
  }

  function authHeaders() {
    return { 'Authorization': 'Bearer ' + token(), 'Content-Type': 'application/json' };
  }

  function isMaster() {
    return !!(window.currentUserPermissions && window.currentUserPermissions.is_master);
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function fmtDateTime(iso) {
    if (!iso) return '';
    try { return new Date(iso).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }); }
    catch (_) { return iso; }
  }

  const ANDAMENTO_LABEL = {
    assinado: '🟢 Assinado',
    falta_assinatura: '🟡 Falta assinatura',
    falta_documento: '🟠 Falta documento',
    falta_dados: '🟠 Falta dados'
  };

  // ---- Caixas do dashboard -------------------------------------------------
  async function loadLeadsBoxes() {
    const listEl = document.getElementById('dash-leads-list');
    const badge = document.getElementById('dash-leads-badge');
    try {
      const res = await fetch('/api/leads/dashboard-summary', { headers: authHeaders() });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const data = await res.json();

      // Contadores de contratos
      const c = data.contracts || { day: 0, month: 0, year: 0 };
      const setTxt = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
      setTxt('dash-contracts-day', c.day || 0);
      setTxt('dash-contracts-month', c.month || 0);
      setTxt('dash-contracts-year', c.year || 0);

      // Caixa de novos leads
      const nl = data.newLeads || { count: 0, items: [] };
      if (badge) {
        badge.textContent = nl.count || 0;
        badge.classList.toggle('hidden', !(nl.count > 0));
      }
      if (!listEl) return;
      if (!nl.items || nl.items.length === 0) {
        listEl.innerHTML = '<p class="text-xs text-slate-400 py-2">Nenhum lead novo aguardando distribuição. 🎉</p>';
        return;
      }
      const canDistribute = isMaster();
      listEl.innerHTML = nl.items.map(function (l) {
        return '<div class="flex items-center justify-between gap-2 p-2 rounded-xl border border-slate-100 hover:bg-slate-50">' +
          '<div class="min-w-0">' +
            '<div class="font-bold text-navy-950 text-sm truncate">' + esc(l.name) + '</div>' +
            '<div class="text-[11px] text-slate-500 truncate">' + esc(l.area || 'Geral') + ' · ' + esc(l.phone || '') + ' · ' + fmtDateTime(l.created_at) + '</div>' +
          '</div>' +
          (canDistribute
            ? '<button type="button" data-lead-id="' + esc(l.id) + '" data-lead-name="' + esc(l.name) + '" class="js-distribute-btn shrink-0 px-2.5 py-1 rounded-lg bg-amber-50 hover:bg-amber-100 border border-amber-300 text-amber-800 text-xs font-bold">Distribuir</button>'
            : '<span class="shrink-0 text-[10px] text-slate-400">aguardando Dr. Jorge</span>') +
        '</div>';
      }).join('');
      // Liga os botões (evita inline handlers para nomes com aspas).
      listEl.querySelectorAll('.js-distribute-btn').forEach(function (b) {
        b.addEventListener('click', function () {
          openLeadDistributeModal(b.getAttribute('data-lead-id'), b.getAttribute('data-lead-name'));
        });
      });

      // Caixa: Leads Aguardando Análise do Chefe do Escritório (Dr. Jorge)
      const paListEl = document.getElementById('dash-approval-list');
      const paBadge = document.getElementById('dash-approval-badge');
      const pa = data.pendingApproval || { count: 0, items: [] };
      if (paBadge) {
        paBadge.textContent = pa.count || 0;
        paBadge.classList.toggle('hidden', !(pa.count > 0));
      }
      if (paListEl) {
        if (!pa.items || pa.items.length === 0) {
          paListEl.innerHTML = '<p class="text-xs text-slate-400 py-2">Nenhum lead pendente de análise pelo Dr. Jorge no momento. 👍</p>';
        } else {
          paListEl.innerHTML = pa.items.map(function (l) {
            return '<div class="flex items-center justify-between gap-2 p-2.5 rounded-xl border border-amber-200 bg-amber-50/50 hover:bg-amber-50">' +
              '<div class="min-w-0 flex-1">' +
                '<div class="font-bold text-navy-950 text-sm truncate flex items-center gap-1.5">' +
                  '<span>⚖️</span> <span>' + esc(l.name) + '</span>' +
                '</div>' +
                '<div class="text-[11px] text-slate-600 truncate mt-0.5">' +
                  '<strong>' + esc(l.area || 'Geral') + '</strong> · ' + esc(l.phone || '') + ' · ' + fmtDateTime(l.created_at) +
                '</div>' +
                (l.stage_note ? '<div class="text-[10px] text-amber-900 bg-amber-100/70 px-2 py-0.5 rounded mt-1 line-clamp-1 italic">📝 ' + esc(l.stage_note) + '</div>' : '') +
              '</div>' +
              '<div class="flex items-center gap-1 shrink-0">' +
                '<button type="button" onclick="if(window.viewLeadDetails) window.viewLeadDetails(\'' + esc(l.id) + '\')" class="px-2 py-1 rounded-lg bg-white hover:bg-slate-100 border border-slate-300 text-slate-700 text-xs font-bold shadow-2xs cursor-pointer">Ficha</button>' +
                (canDistribute
                  ? '<button type="button" onclick="window.approveLeadFromDashboard(\'' + esc(l.id) + '\', \'' + esc(l.name) + '\')" class="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-2xs cursor-pointer">Aprovar</button>'
                  : '') +
              '</div>' +
            '</div>';
          }).join('');
        }
      }
    } catch (e) {
      if (listEl) listEl.innerHTML = '<p class="text-xs text-rose-500 py-2">Falha ao carregar os leads.</p>';
      console.warn('[LEADS BOXES] erro:', e.message);
    }
  }

  // Ação de aprovação pelo Dr. Jorge Alvim a partir da Visão Geral
  window.approveLeadFromDashboard = async function (id, name) {
    if (!confirm('Deseja APROVAR o lead "' + name + '" e convertê-lo oficialmente em Cliente da carteira?')) return;
    try {
      const res = await fetch('/api/leads/' + encodeURIComponent(id) + '/approve', {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ convert_to_client: true, notes: 'Aprovado pelo Dr. Jorge Alvim via Visão Geral.' })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        if (typeof window.wmToast === 'function') {
          window.wmToast('Lead aprovado e cliente cadastrado com sucesso!');
        } else if (typeof window.showToast === 'function') {
          window.showToast('Lead aprovado com sucesso!', 'success');
        } else {
          alert('Lead aprovado e cliente cadastrado com sucesso!');
        }
        loadLeadsBoxes();
        if (typeof window.loadLeads === 'function') window.loadLeads();
      } else {
        alert(data.error || 'Erro ao aprovar lead.');
      }
    } catch (e) {
      alert('Erro de conexão ao aprovar lead.');
    }
  };

  // ---- Distribuição --------------------------------------------------------
  let _distLeadId = '';

  async function openLeadDistributeModal(leadId, leadName) {
    _distLeadId = leadId;
    const modal = document.getElementById('lead-distribute-modal');
    const target = document.getElementById('lead-distribute-target');
    const lawyerSel = document.getElementById('lead-distribute-lawyer');
    const secSel = document.getElementById('lead-distribute-secretary');
    const alert = document.getElementById('lead-distribute-alert');
    if (alert) alert.classList.add('hidden');
    if (target) target.textContent = 'Lead: ' + (leadName || leadId);

    // Popula os seletores com os operadores do escritório.
    try {
      const res = await fetch('/api/users', { headers: authHeaders() });
      const data = await res.json();
      const users = (data && data.users) || [];
      const lawyers = users.filter(function (u) { return ['advogado', 'master', 'gerente'].includes((u.role || '').toLowerCase()); });
      const secs = users.filter(function (u) { return ['secretaria', 'estagiario'].includes((u.role || '').toLowerCase()); });
      if (lawyerSel) {
        lawyerSel.innerHTML = '<option value="">Selecione o advogado responsável…</option>' +
          lawyers.map(function (u) { return '<option value="' + esc(u.id) + '">' + esc(u.name) + ' (' + esc(u.role) + ')</option>'; }).join('');
      }
      if (secSel) {
        secSel.innerHTML = '<option value="">Sem secretária</option>' +
          secs.map(function (u) { return '<option value="' + esc(u.id) + '">' + esc(u.name) + ' (' + esc(u.role) + ')</option>'; }).join('');
      }
    } catch (_) { /* selects ficam vazios; o backend valida */ }

    if (modal) modal.classList.remove('hidden');
  }

  async function submitLeadDistribution() {
    const lawyerSel = document.getElementById('lead-distribute-lawyer');
    const secSel = document.getElementById('lead-distribute-secretary');
    const alert = document.getElementById('lead-distribute-alert');
    const btn = document.getElementById('lead-distribute-btn');
    const showAlert = function (msg, ok) {
      if (!alert) return;
      alert.textContent = msg;
      alert.className = 'text-xs font-semibold p-2 rounded-lg ' + (ok ? 'bg-emerald-50 text-emerald-800' : 'bg-rose-50 text-rose-700');
      alert.classList.remove('hidden');
    };
    const lawyerId = lawyerSel ? lawyerSel.value : '';
    const lawyerName = lawyerSel && lawyerSel.selectedOptions[0] ? lawyerSel.selectedOptions[0].textContent : '';
    if (!lawyerId) { showAlert('Selecione o advogado responsável.', false); return; }
    const secId = secSel ? secSel.value : '';
    const secName = secId && secSel.selectedOptions[0] ? secSel.selectedOptions[0].textContent : '';

    if (btn) { btn.disabled = true; btn.textContent = 'Distribuindo…'; }
    try {
      const res = await fetch('/api/leads/' + encodeURIComponent(_distLeadId) + '/distribute', {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({
          responsible_lawyer_id: lawyerId,
          responsible_lawyer_name: (lawyerName || '').replace(/\s*\(.*\)\s*$/, ''),
          assigned_secretary_id: secId || null,
          assigned_secretary_name: secId ? (secName || '').replace(/\s*\(.*\)\s*$/, '') : null
        })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        showAlert('Lead distribuído com sucesso!', true);
        setTimeout(function () {
          const modal = document.getElementById('lead-distribute-modal');
          if (modal) modal.classList.add('hidden');
          loadLeadsBoxes();
          if (typeof window.loadLeads === 'function') window.loadLeads();
        }, 700);
      } else {
        showAlert(data.error || 'Falha ao distribuir.', false);
      }
    } catch (e) {
      showAlert('Erro de conexão ao distribuir.', false);
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = 'Confirmar Distribuição'; }
    }
  }

  // ---- Tabela de contratos (drill-down) -----------------------------------
  async function openContractsTable() {
    const modal = document.getElementById('contracts-table-modal');
    const body = document.getElementById('contracts-table-body');
    if (modal) modal.classList.remove('hidden');
    if (body) body.innerHTML = 'Carregando…';
    try {
      const res = await fetch('/api/leads/contracts-list', { headers: authHeaders() });
      const data = await res.json();
      const rows = (data && data.contracts) || [];
      if (!rows.length) {
        if (body) body.innerHTML = '<p class="text-xs text-slate-400 py-3">Nenhum contrato registrado ainda.</p>';
        return;
      }
      if (body) {
        body.innerHTML =
          '<table class="w-full text-xs"><thead><tr class="text-left text-slate-400 border-b border-slate-100">' +
          '<th class="py-2 pr-2">Cliente</th><th class="py-2 pr-2">Documento</th><th class="py-2 pr-2">Andamento</th><th class="py-2 pr-2">Data</th><th class="py-2">Link</th>' +
          '</tr></thead><tbody>' +
          rows.map(function (r) {
            return '<tr class="border-b border-slate-50">' +
              '<td class="py-2 pr-2 font-semibold text-navy-950">' + esc(r.client_name || r.signer_name || '—') + '</td>' +
              '<td class="py-2 pr-2 text-slate-600">' + esc(r.doc_title || 'Contrato de Honorários') + '</td>' +
              '<td class="py-2 pr-2">' + (ANDAMENTO_LABEL[r.andamento] || esc(r.andamento || '')) + '</td>' +
              '<td class="py-2 pr-2 text-slate-500">' + fmtDateTime(r.created_at) + '</td>' +
              '<td class="py-2"><a href="' + esc(r.link) + '" target="_blank" class="text-gold-700 hover:text-gold-800 font-bold underline">abrir →</a></td>' +
            '</tr>';
          }).join('') +
          '</tbody></table>';
      }
    } catch (e) {
      if (body) body.innerHTML = '<p class="text-xs text-rose-500 py-3">Falha ao carregar os contratos.</p>';
    }
  }

  // Exposição global (o dashboard chama estes nomes).
  window.loadLeadsBoxes = loadLeadsBoxes;
  window.openLeadDistributeModal = openLeadDistributeModal;
  window.submitLeadDistribution = submitLeadDistribution;
  window.openContractsTable = openContractsTable;
})();
