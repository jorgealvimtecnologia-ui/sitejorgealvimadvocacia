/**
 * MÓDULO DE PERGUNTAS FREQUENTES (FAQ & SEO LOCAL)
 * Jorge Alvim Advocacia — OAB/MG 222.943
 *
 * Submódulo desacoplado para a aba FAQ em Conteúdo & Compliance.
 * Permite listar, criar, editar, reordenar, alternar status e excluir
 * as dúvidas frequentes exibidas no site oficial (index.html).
 */
(function () {
  'use strict';

  var _adminFaqsList = [];

  var CATEGORY_MAP = {
    militar: { label: 'Direito Militar • Forças Armadas', icon: '🎖️', badgeClass: 'bg-emerald-50 text-emerald-800 border-emerald-200' },
    trabalhista: { label: 'Direito do Trabalho • Rescisão', icon: '💼', badgeClass: 'bg-blue-50 text-blue-800 border-blue-200' },
    previdenciario: { label: 'Previdência Social • INSS', icon: '🏛️', badgeClass: 'bg-amber-50 text-amber-800 border-amber-200' },
    transito: { label: 'Trânsito • CNH Suspensa • DETRAN-MG', icon: '🚗', badgeClass: 'bg-orange-50 text-orange-800 border-orange-200' },
    familia: { label: 'Direito de Família • Divórcio & Pensão', icon: '👨‍👩‍👧', badgeClass: 'bg-purple-50 text-purple-800 border-purple-200' },
    atendimento: { label: 'Atendimento • Sede Física • Digital', icon: '📍', badgeClass: 'bg-indigo-50 text-indigo-800 border-indigo-200' }
  };

  function getToken() {
    if (typeof window.getToken === 'function') {
      var t = window.getToken();
      if (t) return t;
    }
    return localStorage.getItem('ja_admin_token') || localStorage.getItem('token') || sessionStorage.getItem('ja_admin_token') || sessionStorage.getItem('token') || '';
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

  function wmToast(msg) {
    if (typeof window.wmToast === 'function') {
      window.wmToast(msg);
    } else {
      alert(msg);
    }
  }

  // 1. Carregar lista de FAQs do servidor
  async function loadFaqTab() {
    var container = document.getElementById('faq-admin-list');
    if (!container) return;

    container.innerHTML = '<div class="p-12 text-center text-slate-400 bg-white rounded-3xl border border-slate-200"><div class="inline-block animate-spin text-2xl mb-2">🔄</div><div>Carregando perguntas de FAQ...</div></div>';

    var token = getToken();
    try {
      var res = await fetch('/api/admin/site/faqs', {
        headers: { 'Authorization': 'Bearer ' + token }
      });
      var data = await res.json();
      if (res.ok && data.success && Array.isArray(data.faqs)) {
        _adminFaqsList = data.faqs;
        renderAdminFaqList(_adminFaqsList);
        updateFaqStats(_adminFaqsList);
      } else {
        container.innerHTML = '<div class="p-8 text-center text-rose-600 bg-rose-50 rounded-3xl border border-rose-200 text-xs">Falha ao carregar FAQs: ' + escapeHtml(data.error || 'Erro desconhecido.') + '</div>';
      }
    } catch (err) {
      console.error('[FAQ] Erro de rede ao carregar FAQs:', err);
      container.innerHTML = '<div class="p-8 text-center text-rose-600 bg-rose-50 rounded-3xl border border-rose-200 text-xs">Erro de conexão ao carregar FAQs: ' + escapeHtml(err.message) + '</div>';
    }
  }

  // 2. Atualizar contadores de resumo no topo
  function updateFaqStats(list) {
    var totalEl = document.getElementById('faq-stat-total');
    var activeEl = document.getElementById('faq-stat-active');
    var inactiveEl = document.getElementById('faq-stat-inactive');

    if (totalEl) totalEl.textContent = list.length;
    if (activeEl) {
      var activeCount = list.filter(function (f) { return f.is_active === 1; }).length;
      activeEl.textContent = activeCount;
    }
    if (inactiveEl) {
      var inactiveCount = list.filter(function (f) { return f.is_active === 0; }).length;
      inactiveEl.textContent = inactiveCount;
    }
  }

  // 3. Renderizar listagem de cartões de FAQ
  function renderAdminFaqList(list) {
    var container = document.getElementById('faq-admin-list');
    if (!container) return;

    if (!list || list.length === 0) {
      container.innerHTML = '<div class="p-12 text-center text-slate-400 bg-white rounded-3xl border border-slate-200 space-y-3"><div class="text-3xl">❓</div><div class="font-bold text-slate-700">Nenhuma pergunta de FAQ cadastrada</div><p class="text-xs text-slate-500 max-w-md mx-auto">Clique no botão acima para adicionar a primeira pergunta frequente do escritório.</p></div>';
      return;
    }

    var html = list.map(function (faq, index) {
      var catInfo = CATEGORY_MAP[faq.category] || { label: faq.category_label || faq.category, icon: '⚖️', badgeClass: 'bg-slate-100 text-slate-700 border-slate-200' };
      var isActive = faq.is_active === 1;

      var noteHtml = faq.highlight_note
        ? '<div class="mt-2.5 p-2.5 rounded-xl bg-amber-50/80 border border-amber-200 text-slate-800 text-xs flex items-center gap-2"><span class="flex-shrink-0">📌</span><span class="italic font-medium">' + escapeHtml(faq.highlight_note) + '</span></div>'
        : '';

      var isFirst = index === 0;
      var isLast = index === list.length - 1;

      return '<div class="bg-white rounded-3xl border ' + (isActive ? 'border-slate-200' : 'border-slate-200 bg-slate-50/60 opacity-75') + ' shadow-sm p-5 sm:p-6 hover:shadow-md transition-all space-y-4" id="faq-card-' + faq.id + '">' +
        '<div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3.5">' +
          '<div class="flex flex-wrap items-center gap-2.5">' +
            '<span class="w-8 h-8 rounded-xl bg-gradient-to-br from-amber-50 to-gold-100 border border-gold-300 text-navy-950 font-extrabold text-xs flex items-center justify-center shadow-xs">#' + faq.faq_order + '</span>' +
            '<span class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold border ' + catInfo.badgeClass + '">' +
              '<span>' + catInfo.icon + '</span>' +
              '<span>' + escapeHtml(faq.category_label || catInfo.label) + '</span>' +
            '</span>' +
            (isActive
              ? '<span class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-extrabold bg-emerald-100 text-emerald-800 border border-emerald-200">🟢 Visível no Site</span>'
              : '<span class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-extrabold bg-slate-200 text-slate-700 border border-slate-300">⚪ Oculto</span>') +
          '</div>' +

          '<div class="flex items-center gap-1.5 self-end sm:self-auto">' +
            '<button type="button" onclick="window.moveFaqOrder(' + faq.id + ', -1)" ' + (isFirst ? 'disabled class="p-1.5 rounded-lg text-slate-300 cursor-not-allowed"' : 'class="p-1.5 rounded-lg text-slate-600 hover:bg-slate-100 hover:text-navy-950 transition-colors cursor-pointer" title="Subir posição"') + '>' +
              '▲' +
            '</button>' +
            '<button type="button" onclick="window.moveFaqOrder(' + faq.id + ', 1)" ' + (isLast ? 'disabled class="p-1.5 rounded-lg text-slate-300 cursor-not-allowed"' : 'class="p-1.5 rounded-lg text-slate-600 hover:bg-slate-100 hover:text-navy-950 transition-colors cursor-pointer" title="Descer posição"') + '>' +
              '▼' +
            '</button>' +
            '<button type="button" onclick="window.toggleFaqStatus(' + faq.id + ')" class="px-2.5 py-1 rounded-xl text-xs font-bold ' + (isActive ? 'bg-amber-50 text-amber-900 hover:bg-amber-100 border border-amber-200' : 'bg-emerald-50 text-emerald-900 hover:bg-emerald-100 border border-emerald-200') + ' transition-colors cursor-pointer" title="Alternar visibilidade no site">' +
              (isActive ? 'Ocultar' : 'Ativar') +
            '</button>' +
            '<button type="button" onclick="window.editFaq(' + faq.id + ')" class="px-3 py-1 rounded-xl bg-blue-50 text-blue-700 hover:bg-blue-100 font-bold text-xs border border-blue-200 transition-colors cursor-pointer flex items-center gap-1">' +
              '<span>✏️</span><span>Editar</span>' +
            '</button>' +
            '<button type="button" onclick="window.deleteFaq(' + faq.id + ')" class="px-3 py-1 rounded-xl bg-rose-50 text-rose-700 hover:bg-rose-100 font-bold text-xs border border-rose-200 transition-colors cursor-pointer flex items-center gap-1">' +
              '<span>🗑️</span><span>Excluir</span>' +
            '</button>' +
          '</div>' +
        '</div>' +

        '<div class="space-y-2">' +
          '<h3 class="font-serif font-bold text-base sm:text-lg text-navy-950 leading-snug">' + escapeHtml(faq.question) + '</h3>' +
          '<div class="text-xs sm:text-sm text-slate-600 leading-relaxed whitespace-pre-line">' + escapeHtml(faq.answer) + '</div>' +
          noteHtml +
        '</div>' +

        '<div class="pt-2 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-400">' +
          '<span>Última atualização: ' + (faq.updated_at ? new Date(faq.updated_at).toLocaleString('pt-BR') : '—') + '</span>' +
          '<a href="/#faq" target="_blank" class="text-gold-700 hover:text-gold-800 font-bold underline flex items-center gap-1"><span>Ver no site oficial</span><span>→</span></a>' +
        '</div>' +
      '</div>';
    }).join('');

    container.innerHTML = html;
  }

  // 4. Abrir modal para nova pergunta
  function openNewFaqModal() {
    var form = document.getElementById('faq-editor-form');
    if (form) form.reset();

    var idInput = document.getElementById('faq-edit-id');
    if (idInput) idInput.value = '';

    var orderInput = document.getElementById('faq-edit-order');
    if (orderInput) orderInput.value = _adminFaqsList.length + 1;

    var activeInput = document.getElementById('faq-edit-active');
    if (activeInput) activeInput.checked = true;

    var titleEl = document.getElementById('faq-modal-title');
    if (titleEl) titleEl.textContent = 'Nova Pergunta Frequente (FAQ)';

    updateCategoryLabelField();

    var modal = document.getElementById('modal-faq-editor');
    if (modal) {
      modal.classList.remove('hidden');
      modal.classList.add('flex');
    }
  }

  // 5. Atualizar automaticamente o label da categoria selecionada
  function updateCategoryLabelField() {
    var catSelect = document.getElementById('faq-edit-category');
    var labelInput = document.getElementById('faq-edit-category-label');
    if (catSelect && labelInput) {
      var cat = catSelect.value;
      if (CATEGORY_MAP[cat]) {
        labelInput.value = CATEGORY_MAP[cat].label;
      }
    }
  }

  // 6. Abrir modal para edição de pergunta existente
  function editFaq(id) {
    var faq = _adminFaqsList.find(function (f) { return f.id === id; });
    if (!faq) {
      wmToast('Pergunta de FAQ não encontrada.');
      return;
    }

    document.getElementById('faq-edit-id').value = faq.id;
    document.getElementById('faq-edit-order').value = faq.faq_order;
    document.getElementById('faq-edit-category').value = faq.category;
    document.getElementById('faq-edit-category-label').value = faq.category_label || (CATEGORY_MAP[faq.category] ? CATEGORY_MAP[faq.category].label : '');
    document.getElementById('faq-edit-question').value = faq.question;
    document.getElementById('faq-edit-answer').value = faq.answer;
    document.getElementById('faq-edit-highlight-note').value = faq.highlight_note || '';
    document.getElementById('faq-edit-active').checked = faq.is_active === 1;

    var titleEl = document.getElementById('faq-modal-title');
    if (titleEl) titleEl.textContent = 'Editar Pergunta de FAQ #' + faq.id;

    var modal = document.getElementById('modal-faq-editor');
    if (modal) {
      modal.classList.remove('hidden');
      modal.classList.add('flex');
    }
  }

  // 7. Fechar modal de edição
  function closeFaqModal() {
    var modal = document.getElementById('modal-faq-editor');
    if (modal) {
      modal.classList.add('hidden');
      modal.classList.remove('flex');
    }
  }

  // 8. Salvar pergunta (Criar ou Atualizar)
  async function handleFaqFormSubmit(event) {
    if (event) event.preventDefault();

    var id = document.getElementById('faq-edit-id').value;
    var order = parseInt(document.getElementById('faq-edit-order').value, 10) || 1;
    var category = document.getElementById('faq-edit-category').value;
    var categoryLabel = document.getElementById('faq-edit-category-label').value.trim() || (CATEGORY_MAP[category] ? CATEGORY_MAP[category].label : category);
    var question = document.getElementById('faq-edit-question').value.trim();
    var answer = document.getElementById('faq-edit-answer').value.trim();
    var highlightNote = document.getElementById('faq-edit-highlight-note').value.trim() || null;
    var isActive = document.getElementById('faq-edit-active').checked ? 1 : 0;

    if (!question || !answer) {
      wmToast('Por favor, preencha a pergunta e a resposta.');
      return;
    }

    var body = {
      faq_order: order,
      category: category,
      category_label: categoryLabel,
      question: question,
      answer: answer,
      highlight_note: highlightNote,
      is_active: isActive
    };

    var token = getToken();
    var url = id ? '/api/admin/site/faqs/' + id : '/api/admin/site/faqs';
    var method = id ? 'PUT' : 'POST';

    try {
      var res = await fetch(url, {
        method: method,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + token
        },
        body: JSON.stringify(body)
      });
      var data = await res.json();
      if (res.ok && data.success) {
        wmToast(id ? 'Pergunta de FAQ atualizada com sucesso!' : 'Pergunta de FAQ cadastrada com sucesso!');
        closeFaqModal();
        loadFaqTab();
      } else {
        wmToast('Erro ao salvar FAQ: ' + (data.error || 'Erro desconhecido.'));
      }
    } catch (err) {
      console.error('[FAQ] Erro ao salvar:', err);
      wmToast('Erro de conexão ao salvar pergunta: ' + err.message);
    }
  }

  // 9. Excluir pergunta
  async function deleteFaq(id) {
    var faq = _adminFaqsList.find(function (f) { return f.id === id; });
    var qTitle = faq ? faq.question : 'esta pergunta';
    if (!confirm('Deseja realmente excluir ' + qTitle + '?\n\nEsta dúvida deixará de ser exibida na página inicial do site imediatamente.')) {
      return;
    }

    var token = getToken();
    try {
      var res = await fetch('/api/admin/site/faqs/' + id, {
        method: 'DELETE',
        headers: { 'Authorization': 'Bearer ' + token }
      });
      var data = await res.json();
      if (res.ok && data.success) {
        wmToast('Pergunta de FAQ excluída com sucesso.');
        loadFaqTab();
      } else {
        wmToast('Erro ao excluir FAQ: ' + (data.error || 'Erro desconhecido.'));
      }
    } catch (err) {
      console.error('[FAQ] Erro ao excluir:', err);
      wmToast('Erro de conexão ao excluir pergunta: ' + err.message);
    }
  }

  // 10. Alternar status ativo/inativo rapidamente
  async function toggleFaqStatus(id) {
    var faq = _adminFaqsList.find(function (f) { return f.id === id; });
    if (!faq) return;

    var newStatus = faq.is_active === 1 ? 0 : 1;
    var token = getToken();

    try {
      var res = await fetch('/api/admin/site/faqs/' + id, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + token
        },
        body: JSON.stringify({ is_active: newStatus })
      });
      var data = await res.json();
      if (res.ok && data.success) {
        faq.is_active = newStatus;
        renderAdminFaqList(_adminFaqsList);
        updateFaqStats(_adminFaqsList);
        wmToast(newStatus === 1 ? 'Pergunta ativada no site oficial.' : 'Pergunta ocultada do site oficial.');
      } else {
        wmToast('Falha ao alternar status: ' + (data.error || 'Erro desconhecido.'));
      }
    } catch (err) {
      console.error('[FAQ] Erro ao alternar status:', err);
      wmToast('Erro de conexão ao atualizar status: ' + err.message);
    }
  }

  // 11. Reordenar pergunta (subir ou descer)
  async function moveFaqOrder(id, delta) {
    var index = _adminFaqsList.findIndex(function (f) { return f.id === id; });
    if (index === -1) return;
    var targetIndex = index + delta;
    if (targetIndex < 0 || targetIndex >= _adminFaqsList.length) return;

    var current = _adminFaqsList[index];
    var adjacent = _adminFaqsList[targetIndex];

    var oldOrder = current.faq_order;
    var newOrder = adjacent.faq_order;

    // Se as ordens forem iguais, re-indexa
    if (oldOrder === newOrder) {
      newOrder = oldOrder + delta;
    }

    var token = getToken();
    try {
      await Promise.all([
        fetch('/api/admin/site/faqs/' + current.id, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
          body: JSON.stringify({ faq_order: newOrder })
        }),
        fetch('/api/admin/site/faqs/' + adjacent.id, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
          body: JSON.stringify({ faq_order: oldOrder })
        })
      ]);
      loadFaqTab();
    } catch (err) {
      console.error('[FAQ] Erro ao reordenar:', err);
      wmToast('Erro ao reordenar perguntas.');
    }
  }

  // 12. Filtragem de busca no painel
  function filterAdminFaq(query) {
    var q = (query || '').toLowerCase().trim();
    if (!q) {
      renderAdminFaqList(_adminFaqsList);
      return;
    }

    var filtered = _adminFaqsList.filter(function (f) {
      var question = (f.question || '').toLowerCase();
      var answer = (f.answer || '').toLowerCase();
      var category = (f.category || '').toLowerCase();
      var label = (f.category_label || '').toLowerCase();
      var note = (f.highlight_note || '').toLowerCase();
      return question.includes(q) || answer.includes(q) || category.includes(q) || label.includes(q) || note.includes(q);
    });

    renderAdminFaqList(filtered);
  }

  // Exportar funções para o escopo global do painel
  window.loadFaqTab = loadFaqTab;
  window.openNewFaqModal = openNewFaqModal;
  window.editFaq = editFaq;
  window.closeFaqModal = closeFaqModal;
  window.handleFaqFormSubmit = handleFaqFormSubmit;
  window.deleteFaq = deleteFaq;
  window.toggleFaqStatus = toggleFaqStatus;
  window.moveFaqOrder = moveFaqOrder;
  window.filterAdminFaq = filterAdminFaq;
  window.updateCategoryLabelField = updateCategoryLabelField;

})();
