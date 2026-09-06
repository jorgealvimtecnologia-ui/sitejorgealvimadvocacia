/**
 * ==============================================================================
 * JORGE ALVIM ADVOCACIA & TECNOLOGIA — MÓDULO DE APOIO & RESILIÊNCIA AO USUÁRIO
 * ==============================================================================
 * Recursos incluídos:
 *  1. Auto-Save Contínuo (Rascunhos em localStorage com restauração)
 *  2. Atalho Universal Ctrl+S / Cmd+S (Salvar sem rolar página)
 *  3. Feedback Visual nos Botões com Trava Anti-Duplo Clique (Spinners)
 *  4. Alerta Inteligente de Alterações Não Salvas (Anti-Perda de Dados)
 *  5. Rastreamento e Scroll Automático para Campos com Erro
 *  6. Lixeira com Desfazer (Undo de 10 segundos estilo Gmail)
 *  7. Monitor de Conexão em Tempo Real (Online / Offline)
 *  8. Helper de Impressão Jurídica A4 Limpa
 * ==============================================================================
 */

(function() {
  'use strict';

  // Namespace Global
  window.JawSupport = window.JawSupport || {};

  // Configurações
  const DRAFT_PREFIX = 'jaw_draft_';
  const TOAST_CONTAINER_ID = 'jaw-support-toasts';

  // ============================================================================
  // 1. GERENCIADOR DE NOTIFICAÇÕES (TOASTS HUMANIZADOS)
  // ============================================================================
  function ensureToastContainer() {
    let container = document.getElementById(TOAST_CONTAINER_ID);
    if (!container) {
      container = document.createElement('div');
      container.id = TOAST_CONTAINER_ID;
      container.className = 'fixed bottom-4 right-4 z-[99999] flex flex-col gap-2 pointer-events-none max-w-sm w-full px-4';
      document.body.appendChild(container);
    }
    return container;
  }

  function showToast(message, type = 'info', duration = 4000) {
    const container = ensureToastContainer();
    const toast = document.createElement('div');
    toast.className = 'pointer-events-auto flex items-center gap-3 p-3.5 rounded-2xl shadow-xl border text-xs font-semibold transform transition-all duration-300 translate-y-4 opacity-0';

    let icon = 'ℹ️';
    let bgClasses = 'bg-slate-900/95 text-white border-slate-700 backdrop-blur-md';

    if (type === 'success') {
      icon = '✅';
      bgClasses = 'bg-emerald-900/95 text-emerald-100 border-emerald-700 backdrop-blur-md';
    } else if (type === 'error') {
      icon = '❌';
      bgClasses = 'bg-rose-900/95 text-rose-100 border-rose-700 backdrop-blur-md';
    } else if (type === 'warning') {
      icon = '⚠️';
      bgClasses = 'bg-amber-900/95 text-amber-100 border-amber-700 backdrop-blur-md';
    } else if (type === 'save') {
      icon = '💾';
      bgClasses = 'bg-navy-900/95 text-gold-100 border-gold-500/40 backdrop-blur-md';
    }

    toast.className += ` ${bgClasses}`;
    toast.innerHTML = `
      <span class="text-base flex-shrink-0">${icon}</span>
      <div class="flex-1 leading-snug">${message}</div>
      <button type="button" class="text-white/60 hover:text-white flex-shrink-0 text-sm ml-1">&times;</button>
    `;

    toast.querySelector('button').onclick = () => {
      toast.classList.add('opacity-0', 'translate-y-2');
      setTimeout(() => toast.remove(), 300);
    };

    container.appendChild(toast);

    // Anima entrada
    requestAnimationFrame(() => {
      toast.classList.remove('translate-y-4', 'opacity-0');
    });

    // Auto remoção
    if (duration > 0) {
      setTimeout(() => {
        if (toast.parentElement) {
          toast.classList.add('opacity-0', 'translate-y-2');
          setTimeout(() => toast.remove(), 300);
        }
      }, duration);
    }

    return toast;
  }

  window.JawSupport.toast = showToast;

  // ============================================================================
  // 2. AUTO-SAVE CONTÍNUO (RASCUNHOS EM LOCALSTORAGE)
  // ============================================================================
  function getFormIdentifier(form) {
    if (form.id) return form.id;
    const parentModal = form.closest('[id]');
    if (parentModal && parentModal.id) return `form_in_${parentModal.id}`;
    if (form.name) return form.name;
    const action = form.getAttribute('action');
    if (action) return action.replace(/[^a-zA-Z0-9]/g, '_');
    return 'unnamed_form';
  }

  function serializeForm(form) {
    const data = {};
    const elements = form.querySelectorAll('input, select, textarea');
    elements.forEach(el => {
      if (!el.name && !el.id) return;
      const key = el.name || el.id;
      if (el.type === 'password') return; // NUNCA salvar senhas em rascunho
      if (el.type === 'checkbox') {
        data[key] = el.checked;
      } else if (el.type === 'radio') {
        if (el.checked) data[key] = el.value;
      } else {
        data[key] = el.value;
      }
    });
    return data;
  }

  function deserializeForm(form, data) {
    let restoredCount = 0;
    Object.keys(data).forEach(key => {
      const el = form.querySelector(`[name="${key}"], #${key}`);
      if (!el) return;
      if (el.type === 'password') return;
      if (el.type === 'checkbox') {
        el.checked = Boolean(data[key]);
        restoredCount++;
      } else if (el.type === 'radio') {
        if (el.value === data[key]) {
          el.checked = true;
          restoredCount++;
        }
      } else if (data[key] !== undefined && data[key] !== null) {
        el.value = data[key];
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
        restoredCount++;
      }
    });
    return restoredCount;
  }

  const saveTimers = new Map();

  function triggerAutoSave(form) {
    const formId = getFormIdentifier(form);
    if (!formId || formId === 'unnamed_form') return;

    if (saveTimers.has(formId)) {
      clearTimeout(saveTimers.get(formId));
    }

    saveTimers.set(formId, setTimeout(() => {
      try {
        const formData = serializeForm(form);
        const hasData = Object.values(formData).some(v => v !== '' && v !== false && v !== null && v !== undefined);
        const storageKey = DRAFT_PREFIX + formId;

        if (hasData) {
          const draftPayload = {
            updatedAt: new Date().toISOString(),
            data: formData
          };
          localStorage.setItem(storageKey, JSON.stringify(draftPayload));
        }
      } catch (err) {
        console.warn('[JawSupport] Falha ao salvar rascunho:', err);
      }
    }, 1200)); // Debounce de 1.2 segundos
  }

  function clearDraft(form) {
    const formId = getFormIdentifier(form);
    const storageKey = DRAFT_PREFIX + formId;
    localStorage.removeItem(storageKey);
    removeDraftBanner(form);
  }

  function removeDraftBanner(form) {
    const existing = form.querySelector('.jaw-draft-banner');
    if (existing) existing.remove();
  }

  function checkAndPromptDraft(form) {
    const formId = getFormIdentifier(form);
    const storageKey = DRAFT_PREFIX + formId;
    const raw = localStorage.getItem(storageKey);
    if (!raw) return;

    try {
      const draft = JSON.parse(raw);
      if (!draft || !draft.data) return;

      removeDraftBanner(form);

      const draftTime = new Date(draft.updatedAt);
      const timeFormatted = draftTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      const dateFormatted = draftTime.toLocaleDateString();

      const banner = document.createElement('div');
      banner.className = 'jaw-draft-banner mb-4 p-3 rounded-2xl bg-amber-50 border border-amber-300/80 text-amber-950 text-xs flex items-center justify-between gap-3 shadow-xs animate-fade-in';
      banner.innerHTML = `
        <div class="flex items-center gap-2">
          <span class="text-base">📝</span>
          <span>Identificamos um rascunho salvo deste formulário (<strong>${dateFormatted} às ${timeFormatted}</strong>).</span>
        </div>
        <div class="flex items-center gap-1.5 flex-shrink-0">
          <button type="button" class="btn-restore-draft px-3 py-1 bg-amber-600 hover:bg-amber-700 text-white rounded-lg font-bold text-[11px] shadow-xs transition-colors">
            Restaurar
          </button>
          <button type="button" class="btn-discard-draft px-2 py-1 text-amber-800 hover:text-amber-950 text-[11px] font-medium">
            Descartar
          </button>
        </div>
      `;

      banner.querySelector('.btn-restore-draft').onclick = () => {
        const count = deserializeForm(form, draft.data);
        banner.remove();
        showToast(`Rascunho restaurado com sucesso (${count} campos preenchidos).`, 'success');
      };

      banner.querySelector('.btn-discard-draft').onclick = () => {
        clearDraft(form);
        banner.remove();
        showToast('Rascunho descartado.', 'info');
      };

      // Insere no início do formulário
      form.insertBefore(banner, form.firstChild);
    } catch (e) {
      localStorage.removeItem(storageKey);
    }
  }

  // Monitora digitação em todos os formulários da página
  document.addEventListener('input', (e) => {
    const form = e.target.closest('form');
    if (form) triggerAutoSave(form);
  });

  document.addEventListener('change', (e) => {
    const form = e.target.closest('form');
    if (form) triggerAutoSave(form);
  });

  // Limpa o rascunho quando o formulário for enviado com sucesso
  document.addEventListener('submit', (e) => {
    const form = e.target;
    if (form && form.tagName === 'FORM') {
      setTimeout(() => clearDraft(form), 500);
    }
  });

  // ============================================================================
  // 3. ATALHO UNIVERSAL CTRL+S / CMD+S (SALVAMENTO ÁGIL)
  // ============================================================================
  window.addEventListener('keydown', (e) => {
    // Detecta Ctrl+S ou Cmd+S
    if ((e.ctrlKey || e.metaKey) && (e.key === 's' || e.key === 'S')) {
      e.preventDefault(); // Impede o "Salvar como página HTML" do navegador

      // Localiza o formulário ativo ou mais próximo do foco
      const activeEl = document.activeElement;
      let targetForm = activeEl ? activeEl.closest('form') : null;

      if (!targetForm) {
        // Se nenhum campo estava focado, procura na janela modal ativa ou visível
        const visibleModal = document.querySelector('.modal:not(.hidden), [id$="-modal"]:not(.hidden), [id$="-view"]:not(.hidden)');
        if (visibleModal) {
          targetForm = visibleModal.querySelector('form');
        }
      }

      if (targetForm) {
        const submitBtn = targetForm.querySelector('button[type="submit"], input[type="submit"], .btn-save, [id*="salvar"], [id*="submit"]');
        if (submitBtn) {
          showToast('Salvando formulário via atalho (Ctrl+S)...', 'save', 2000);
          submitBtn.click();
          return;
        }
      }

      // Se nenhum formulário específico estiver aberto, emite feedback informativo
      showToast('Nenhum formulário ativo para salvar no momento.', 'info', 2000);
    }

    // Atalho Esc para fechar janelas/modais abertos
    if (e.key === 'Escape') {
      const openModalCloseBtn = document.querySelector('.modal:not(.hidden) .btn-close, [id$="-modal"]:not(.hidden) [onclick*="close"], [id$="-modal"]:not(.hidden) [onclick*="fechar"]');
      if (openModalCloseBtn) {
        openModalCloseBtn.click();
      }
    }
  });

  // ============================================================================
  // 4. GUARDIÃO DE BOTÕES (ANTI-DUPLO CLIQUE & SPINNERS)
  // ============================================================================
  document.addEventListener('submit', (e) => {
    const form = e.target;
    if (!form || form.tagName !== 'FORM') return;

    const submitBtn = form.querySelector('button[type="submit"], input[type="submit"]');
    if (!submitBtn || submitBtn.disabled) return;

    // Salva estado original
    const originalContent = submitBtn.innerHTML;
    const originalWidth = submitBtn.offsetWidth;

    // Aplica spinner e trava
    submitBtn.style.minWidth = `${originalWidth}px`;
    submitBtn.disabled = true;
    submitBtn.innerHTML = `
      <span class="inline-flex items-center justify-center gap-2">
        <svg class="animate-spin h-3.5 w-3.5 text-current" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
        <span>Salvando...</span>
      </span>
    `;

    // Restaura o botão após 4 segundos automaticamente caso o formulário não recarregue a página
    setTimeout(() => {
      if (submitBtn && submitBtn.disabled) {
        submitBtn.disabled = false;
        submitBtn.innerHTML = originalContent;
      }
    }, 4500);
  });

  // ============================================================================
  // 5. RASTREAMENTO VISUAL DE ERROS COM SCROLL SUAVE
  // ============================================================================
  document.addEventListener('invalid', (e) => {
    const input = e.target;
    if (!input || !input.scrollIntoView) return;

    // Rola suavemente até o primeiro campo inválido
    setTimeout(() => {
      input.scrollIntoView({ behavior: 'smooth', block: 'center' });
      input.focus();

      // Adiciona animação de pulso vermelho
      input.classList.add('ring-2', 'ring-rose-500', 'border-rose-500');
      setTimeout(() => {
        input.classList.remove('ring-2', 'ring-rose-500');
      }, 3500);

      showToast(`Por favor, preencha o campo "${input.getAttribute('placeholder') || input.name || 'obrigatório'}" corretamente.`, 'warning');
    }, 50);
  }, true);

  // ============================================================================
  // 6. LIXEIRA SEGURA COM DESFAZER (UNDO DE 10 SEGUNDOS ESTILO GMAIL)
  // ============================================================================
  window.JawSupport.deleteWithUndo = function(options) {
    const {
      title = 'Item',
      message = 'movido para a lixeira.',
      onConfirm = () => {},
      onCancel = () => {},
      timeoutSeconds = 10
    } = options;

    const container = ensureToastContainer();
    const toast = document.createElement('div');
    toast.className = 'pointer-events-auto flex flex-col p-4 rounded-2xl bg-slate-950 text-white shadow-2xl border border-slate-700 text-xs font-semibold transform transition-all duration-300 translate-y-4 opacity-0';

    let secondsLeft = timeoutSeconds;
    let timerId = null;
    let confirmed = false;

    toast.innerHTML = `
      <div class="flex items-center justify-between gap-3 mb-2">
        <div class="flex items-center gap-2">
          <span class="text-base">🗑️</span>
          <span><strong>${title}</strong> ${message}</span>
        </div>
        <button type="button" class="btn-undo px-2.5 py-1 bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-lg font-bold text-[11px] shadow-xs uppercase tracking-wider transition-all transform hover:scale-105">
          Desfazer (<span class="sec-left">${secondsLeft}s</span>)
        </button>
      </div>
      <div class="w-full bg-slate-800 h-1 rounded-full overflow-hidden">
        <div class="undo-progress bg-amber-500 h-full w-full transition-all duration-1000 ease-linear"></div>
      </div>
    `;

    const progressEl = toast.querySelector('.undo-progress');
    const secEl = toast.querySelector('.sec-left');
    const undoBtn = toast.querySelector('.btn-undo');

    undoBtn.onclick = () => {
      clearInterval(timerId);
      confirmed = true;
      toast.classList.add('opacity-0', 'translate-y-2');
      setTimeout(() => toast.remove(), 300);
      onCancel();
      showToast(`Ação cancelada. ${title} foi restaurado!`, 'success');
    };

    container.appendChild(toast);
    requestAnimationFrame(() => {
      toast.classList.remove('translate-y-4', 'opacity-0');
      progressEl.style.width = '0%';
    });

    timerId = setInterval(() => {
      secondsLeft--;
      if (secEl) secEl.textContent = `${secondsLeft}s`;

      if (secondsLeft <= 0) {
        clearInterval(timerId);
        if (!confirmed) {
          toast.classList.add('opacity-0', 'translate-y-2');
          setTimeout(() => toast.remove(), 300);
          onConfirm(); // Executa a exclusão definitiva
        }
      }
    }, 1000);
  };

  // ============================================================================
  // 7. MONITOR DE CONEXÃO EM TEMPO REAL (ONLINE / OFFLINE)
  // ============================================================================
  function initConnectionBadge() {
    let badge = document.getElementById('jaw-connection-badge');
    if (!badge) {
      badge = document.createElement('div');
      badge.id = 'jaw-connection-badge';
      badge.className = 'fixed bottom-3 left-3 z-[9999] flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold shadow-md border backdrop-blur-md transition-all duration-300';
      document.body.appendChild(badge);
    }

    function updateStatus(isOnline) {
      if (isOnline) {
        badge.className = 'fixed bottom-3 left-3 z-[9999] flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold shadow-md border backdrop-blur-md transition-all duration-300 bg-emerald-500/10 text-emerald-800 border-emerald-500/30';
        badge.innerHTML = '<span class="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span><span>Online</span>';
      } else {
        badge.className = 'fixed bottom-3 left-3 z-[9999] flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold shadow-md border backdrop-blur-md transition-all duration-300 bg-rose-500/15 text-rose-800 border-rose-500/40';
        badge.innerHTML = '<span class="w-2 h-2 rounded-full bg-rose-600"></span><span>Sem conexão • Dados salvos localmente</span>';
        showToast('Conexão oscilando. Seus dados estão sendo salvos localmente com segurança.', 'warning', 6000);
      }
    }

    window.addEventListener('online', () => updateStatus(true));
    window.addEventListener('offline', () => updateStatus(false));
    updateStatus(navigator.onLine);
  }

  // ============================================================================
  // 8. HELPER DE IMPRESSÃO JURÍDICA A4
  // ============================================================================
  window.JawSupport.print = function() {
    window.print();
  };

  // ============================================================================
  // 9. EXPANSÃO DE MODAL / FORMULÁRIO EM TELA CHEIA (100VW x 100VH)
  // ============================================================================
  window.toggleModalFullscreen = function(btn) {
    if (!btn) return;
    const modalContainer = btn.closest('.fixed.inset-0, [id$="-modal"], [id$="Modal"], [id^="modal-"]') || btn.closest('div[class*="fixed"]');
    if (!modalContainer) return;

    // Procura a caixa interna de conteúdo branco/card do modal
    const modalBox = modalContainer.querySelector('div.bg-white, div.rounded-3xl, div.rounded-2xl, div.bg-slate-900') || modalContainer.firstElementChild;
    if (!modalBox) return;

    modalBox.classList.toggle('modal-box-fullscreen');
    const isFull = modalBox.classList.contains('modal-box-fullscreen');

    btn.innerHTML = isFull ? '❐' : '⛶';
    btn.title = isFull ? 'Restaurar tamanho padrão' : 'Expandir para tela cheia (100% da tela)';

    if (isFull) {
      modalContainer.dataset.origClasses = modalContainer.className;
      modalContainer.classList.remove('p-1', 'p-2', 'p-3', 'p-4', 'p-5', 'sm:p-4', 'sm:p-5', 'sm:p-7', 'sm:p-8', 'items-center', 'justify-center');
      modalContainer.classList.add('p-0');
      modalContainer.style.setProperty('padding', '0px', 'important');

      modalBox.dataset.origMaxHeight = modalBox.style.maxHeight || '';
      modalBox.dataset.origHeight = modalBox.style.height || '';
      modalBox.dataset.origWidth = modalBox.style.width || '';
      modalBox.dataset.origMaxWidth = modalBox.style.maxWidth || '';
      modalBox.dataset.origMargin = modalBox.style.margin || '';
      modalBox.dataset.origBorderRadius = modalBox.style.borderRadius || '';

      modalBox.style.setProperty('width', '100vw', 'important');
      modalBox.style.setProperty('max-width', '100vw', 'important');
      modalBox.style.setProperty('height', '100vh', 'important');
      modalBox.style.setProperty('min-height', '100vh', 'important');
      modalBox.style.setProperty('max-height', '100vh', 'important');
      modalBox.style.setProperty('margin', '0px', 'important');
      modalBox.style.setProperty('border-radius', '0px', 'important');
      modalBox.style.setProperty('border', 'none', 'important');
    } else {
      if (modalContainer.dataset.origClasses) {
        modalContainer.className = modalContainer.dataset.origClasses;
      }
      modalContainer.style.padding = '';

      modalBox.style.width = modalBox.dataset.origWidth || '';
      modalBox.style.maxWidth = modalBox.dataset.origMaxWidth || '';
      modalBox.style.height = modalBox.dataset.origHeight || '';
      modalBox.style.minHeight = '';
      modalBox.style.maxHeight = modalBox.dataset.origMaxHeight || '';
      modalBox.style.margin = modalBox.dataset.origMargin || '';
      modalBox.style.borderRadius = modalBox.dataset.origBorderRadius || '';
      modalBox.style.border = '';
    }
  };

  // Força z-index máximo (999999) em todos os modais da página para impedir sobreposição de barras
  function enforceModalZIndex() {
    document.querySelectorAll('.fixed.inset-0, [id$="-modal"], [id$="Modal"], [id^="modal-"]').forEach(function(el) {
      el.style.setProperty('z-index', '999999', 'important');
    });
  }

  // Auto-injeta botão de Tela Cheia (⛶) nos cabeçalhos de todos os modais que ainda não tiverem
  function autoInjectFullscreenButtons() {
    document.querySelectorAll('.fixed.inset-0, [id$="-modal"], [id$="Modal"], [id^="modal-"]').forEach(function(modal) {
      if (modal.querySelector('.jaw-fullscreen-btn') || modal.querySelector('[onclick*="toggleModalFullscreen"]')) {
        return; // Já possui botão de tela cheia
      }

      // Procura o botão de fechar do modal para posicionar o botão ⛶ ao lado dele
      const closeBtn = modal.querySelector('button[onclick*="close"], button[onclick*="toggle"], button[title*="Fechar"], button[title*="fechar"]') ||
                       modal.querySelector('div.flex.justify-between button, div.flex.items-center button:last-child');
      if (closeBtn && closeBtn.parentNode) {
        const fsBtn = document.createElement('button');
        fsBtn.type = 'button';
        fsBtn.className = 'jaw-fullscreen-btn text-slate-400 hover:text-slate-700 p-1.5 rounded-lg hover:bg-slate-100 transition-colors text-base font-bold leading-none inline-flex items-center justify-center';
        fsBtn.title = 'Expandir para tela cheia (100% da tela)';
        fsBtn.innerHTML = '⛶';
        fsBtn.onclick = function(e) {
          e.preventDefault();
          e.stopPropagation();
          window.toggleModalFullscreen(this);
        };
        closeBtn.parentNode.insertBefore(fsBtn, closeBtn);
      }
    });
  }

  // ============================================================================
  // INICIALIZAÇÃO NO CARREGAMENTO DA PÁGINA
  // ============================================================================
  function init() {
    initConnectionBadge();
    enforceModalZIndex();
    autoInjectFullscreenButtons();

    // Checa rascunhos em todos os formulários visíveis
    document.querySelectorAll('form').forEach(checkAndPromptDraft);

    // Observer para detectar formulários e modais que aparecem dinamicamente
    const observer = new MutationObserver((mutations) => {
      enforceModalZIndex();
      autoInjectFullscreenButtons();
      mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => {
          if (node.nodeType === 1) {
            if (node.tagName === 'FORM') {
              checkAndPromptDraft(node);
            } else if (node.querySelectorAll) {
              node.querySelectorAll('form').forEach(checkAndPromptDraft);
            }
          }
        });
      });
    });

    observer.observe(document.body, { childList: true, subtree: true });
    document.addEventListener('click', () => {
      setTimeout(() => {
        enforceModalZIndex();
        autoInjectFullscreenButtons();
      }, 50);
    });
    console.log('🛡️ [JawSupport] Módulo de Apoio ao Usuário e Resiliência Ativo com Sucesso!');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
