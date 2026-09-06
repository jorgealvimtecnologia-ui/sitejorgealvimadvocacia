// ============================================================================
// MÓDULO FRONTEND: 🤖 LEGALTECH & INOVAÇÕES TECNOLÓGICAS (FASE 4)
// - Alternador de Modo Dark / Branco (Persistente)
// - Solicitação de Novo Campo ao Programador (Governança e Controle de Schema)
// - Detector Preventivo de Conflito de Interesses (OAB)
// - Consulta Automática de CEP (ViaCEP) e CNPJ
// - Digitação por Voz Jurídica (Voice-to-Text nativo via Web Speech API)
// - Detector de Anexos Esquecidos
// - Controle de Fonte Ergonômica (A- / A+)
// ============================================================================

(function () {
  'use strict';

  function toast(msg, type = 'info') {
    if (window.showSupportToast) {
      window.showSupportToast(msg, type);
    } else if (window.JAUserSupport && window.JAUserSupport.toast) {
      window.JAUserSupport.toast(msg, type);
    } else if (typeof window.showToast === 'function') {
      window.showToast(msg, type);
    } else {
      alert(msg);
    }
  }

  // --------------------------------------------------------------------------
  // 1. MODO DARK / BRANCO (ALTERNADOR DE TEMA PERSISTENTE)
  // --------------------------------------------------------------------------
  const THEME_KEY = 'ja_theme_preference';

  function initTheme() {
    const saved = localStorage.getItem(THEME_KEY);
    const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    const isDark = saved ? saved === 'dark' : prefersDark;

    applyTheme(isDark);
  }

  function applyTheme(isDark) {
    if (isDark) {
      document.documentElement.classList.add('dark');
      document.body.classList.add('dark-mode');
    } else {
      document.documentElement.classList.remove('dark');
      document.body.classList.remove('dark-mode');
    }

    // Atualiza botões visuais
    const btn = document.getElementById('theme-toggle-btn');
    if (btn) {
      btn.innerHTML = isDark
        ? '<span>☀️</span><span class="hidden md:inline text-xs font-bold">Modo Claro</span>'
        : '<span>🌙</span><span class="hidden md:inline text-xs font-bold">Modo Escuro</span>';
      btn.title = isDark ? 'Alternar para Modo Claro (Branco)' : 'Alternar para Modo Escuro (Dark)';
    }
  }

  function toggleTheme() {
    const isCurrentlyDark = document.body.classList.contains('dark-mode');
    const newTheme = !isCurrentlyDark;
    applyTheme(newTheme);
    localStorage.setItem(THEME_KEY, newTheme ? 'dark' : 'light');
    toast(newTheme ? '🌙 Modo Escuro ativado!' : '☀️ Modo Claro ativado!', 'info');
  }

  // --------------------------------------------------------------------------
  // 2. CONTROLE ERGONÔMICO DE TAMANHO DE FONTE (A- / A+)
  // --------------------------------------------------------------------------
  const FONT_KEY = 'ja_font_scale';
  const FONT_SCALES = ['sm', 'md', 'lg', 'xl'];

  function initFontSize() {
    const saved = localStorage.getItem(FONT_KEY) || 'md';
    applyFontScale(saved);
  }

  function applyFontScale(scale) {
    FONT_SCALES.forEach(s => document.body.classList.remove(`font-size-${s}`));
    document.body.classList.add(`font-size-${scale}`);
    localStorage.setItem(FONT_KEY, scale);
  }

  function adjustFontSize(direction) {
    const current = localStorage.getItem(FONT_KEY) || 'md';
    let idx = FONT_SCALES.indexOf(current);
    if (idx === -1) idx = 1;

    if (direction === 'increase' && idx < FONT_SCALES.length - 1) {
      idx++;
    } else if (direction === 'decrease' && idx > 0) {
      idx--;
    } else if (direction === 'reset') {
      idx = 1; // 'md'
    }

    const nextScale = FONT_SCALES[idx];
    applyFontScale(nextScale);
    toast(`Fonte ajustada (${nextScale.toUpperCase()})`, 'info', 2000);
  }

  // --------------------------------------------------------------------------
  // 3. SOLICITAÇÃO DE NOVO CAMPO AO PROGRAMADOR
  // --------------------------------------------------------------------------
  function openFieldRequestModal(targetModule = 'Clientes & Contratos') {
    const modal = document.getElementById('modal-request-field');
    if (!modal) return;

    const modSelect = document.getElementById('field-req-module');
    if (modSelect && targetModule) {
      for (let i = 0; i < modSelect.options.length; i++) {
        if (modSelect.options[i].value.toLowerCase().includes(targetModule.toLowerCase()) ||
            modSelect.options[i].text.toLowerCase().includes(targetModule.toLowerCase())) {
          modSelect.selectedIndex = i;
          break;
        }
      }
    }

    const inputName = document.getElementById('field-req-name');
    if (inputName) inputName.value = '';

    const inputJust = document.getElementById('field-req-justification');
    if (inputJust) inputJust.value = '';

    const inputOpts = document.getElementById('field-req-options');
    if (inputOpts) inputOpts.value = '';

    const checkReq = document.getElementById('field-req-required');
    if (checkReq) checkReq.checked = false;

    modal.classList.remove('hidden');
    modal.classList.add('flex');
    if (inputName) inputName.focus();
  }

  function closeFieldRequestModal() {
    const modal = document.getElementById('modal-request-field');
    if (modal) {
      modal.classList.add('hidden');
      modal.classList.remove('flex');
    }
  }

  async function submitFieldRequest(e) {
    if (e) e.preventDefault();

    const target_module = document.getElementById('field-req-module')?.value || 'Geral';
    const field_label = document.getElementById('field-req-name')?.value?.trim();
    const field_type = document.getElementById('field-req-type')?.value || 'TEXTO';
    const is_required = document.getElementById('field-req-required')?.checked ? 1 : 0;
    const suggested_options = document.getElementById('field-req-options')?.value?.trim() || '';
    const business_justification = document.getElementById('field-req-justification')?.value?.trim() || '';

    if (!field_label) {
      toast('Informe o nome do campo desejado.', 'warning');
      return;
    }

    const btn = document.getElementById('btn-submit-field-req');
    if (btn) btn.disabled = true;

    try {
      const res = await window.apiFetch('/api/legaltech/field-requests', {
        method: 'POST',
        body: JSON.stringify({
          target_module,
          field_label,
          field_type,
          is_required,
          suggested_options,
          business_justification
        })
      });

      const data = await res.json();
      if (data.success) {
        toast('Pedido enviado ao programador com sucesso! Protocolo: ' + data.request.id, 'success', 6000);
        closeFieldRequestModal();
      } else {
        toast(data.error || 'Erro ao enviar solicitação.', 'error');
      }
    } catch (err) {
      console.error(err);
      toast('Erro de conexão ao enviar pedido ao programador.', 'error');
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  async function openMyFieldRequestsModal() {
    const modal = document.getElementById('modal-list-field-requests');
    if (!modal) return;

    modal.classList.remove('hidden');
    modal.classList.add('flex');

    const listBody = document.getElementById('list-field-requests-body');
    if (listBody) {
      listBody.innerHTML = '<tr><td colspan="5" class="p-4 text-center text-slate-400 text-xs">Carregando solicitações...</td></tr>';
    }

    try {
      const res = await window.apiFetch('/api/legaltech/field-requests');
      const data = await res.json();
      if (!data.success) {
        if (listBody) listBody.innerHTML = '<tr><td colspan="5" class="p-4 text-center text-rose-500 text-xs">Erro ao carregar lista.</td></tr>';
        return;
      }

      const reqs = data.requests || [];
      if (reqs.length === 0) {
        if (listBody) listBody.innerHTML = '<tr><td colspan="5" class="p-4 text-center text-slate-400 text-xs">Nenhum pedido de campo cadastrado ainda.</td></tr>';
        return;
      }

      const statusBadges = {
        'PENDENTE': '<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800">⏳ Pendente</span>',
        'EM_ANALISE': '<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-sky-100 text-sky-800">🔍 Em Análise</span>',
        'IMPLEMENTADO': '<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">✅ Implementado</span>',
        'REJEITADO': '<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-800">❌ Rejeitado</span>'
      };

      if (listBody) {
        listBody.innerHTML = reqs.map(r => {
          const dateStr = new Date(r.created_at).toLocaleDateString('pt-BR');
          return `
            <tr class="hover:bg-slate-50 transition-colors border-b border-slate-100 text-xs">
              <td class="p-3 font-semibold text-slate-800">
                <span class="block text-slate-900 font-bold">${r.field_label}</span>
                <span class="text-[10px] text-slate-400">ID: ${r.id} · Por: ${r.user_name || 'Usuário'}</span>
              </td>
              <td class="p-3 text-slate-600 font-medium">${r.target_module}</td>
              <td class="p-3 text-slate-500 font-mono text-[11px]">${r.field_type} ${r.is_required ? '<span class="text-rose-500 font-bold">*</span>' : ''}</td>
              <td class="p-3">${statusBadges[r.status] || r.status}</td>
              <td class="p-3 text-slate-500 text-right">${dateStr}</td>
            </tr>
          `;
        }).join('');
      }
    } catch (err) {
      console.error(err);
    }
  }

  function closeMyFieldRequestsModal() {
    const modal = document.getElementById('modal-list-field-requests');
    if (modal) {
      modal.classList.add('hidden');
      modal.classList.remove('flex');
    }
  }

  // --------------------------------------------------------------------------
  // 4. DETECTOR PREVENTIVO DE CONFLITO DE INTERESSES (OAB)
  // --------------------------------------------------------------------------
  let conflictTimeout = null;

  function attachConflictDetector(inputSelector, resultContainerSelector) {
    const input = document.querySelector(inputSelector);
    const container = document.querySelector(resultContainerSelector);
    if (!input || !container) return;

    input.addEventListener('input', function () {
      clearTimeout(conflictTimeout);
      const val = input.value.trim();
      if (val.length < 3) {
        container.innerHTML = '';
        container.classList.add('hidden');
        return;
      }

      conflictTimeout = setTimeout(async () => {
        try {
          const res = await window.apiFetch(`/api/legaltech/check-conflict?name=${encodeURIComponent(val)}`);
          const data = await res.json();
          if (data.success && data.hasConflict) {
            container.classList.remove('hidden');
            container.innerHTML = `
              <div class="p-3 rounded-xl bg-amber-50 border border-amber-300 text-amber-900 text-xs space-y-1.5 animate-bounce-short">
                <div class="flex items-center gap-1.5 font-bold text-amber-800">
                  <span>⚠️</span>
                  <span>ALERTA ÉTICO OAB: Possível Conflito de Interesses Detectado!</span>
                </div>
                <p class="text-[11px] text-amber-700">
                  A parte informada ("<strong>${val}</strong>") possui coincidência com registros existentes no escritório:
                </p>
                <ul class="list-disc list-inside space-y-0.5 text-[11px] font-semibold text-amber-900">
                  ${data.matches.map(m => `<li>${m.name} — <span class="font-normal text-amber-800">${m.details}</span></li>`).join('')}
                </ul>
              </div>
            `;
          } else {
            container.innerHTML = '';
            container.classList.add('hidden');
          }
        } catch (err) {
          console.error('[CONFLITO] Erro na checagem:', err);
        }
      }, 400);
    });
  }

  // --------------------------------------------------------------------------
  // 5. CONSULTA AUTOMÁTICA DE CEP (ViaCEP)
  // --------------------------------------------------------------------------
  async function lookupCepAuto(cepValue, targetFields = {}) {
    const cleanCep = (cepValue || '').replace(/\D/g, '');
    if (cleanCep.length !== 8) return;

    try {
      toast('Buscando endereço pelo CEP...', 'info', 2000);
      const res = await window.apiFetch(`/api/legaltech/cep/${cleanCep}`);
      const data = await res.json();
      if (data.success && data.data) {
        const d = data.data;
        if (targetFields.address && document.getElementById(targetFields.address)) {
          document.getElementById(targetFields.address).value = d.logradouro || '';
        }
        if (targetFields.neighborhood && document.getElementById(targetFields.neighborhood)) {
          document.getElementById(targetFields.neighborhood).value = d.bairro || '';
        }
        if (targetFields.city && document.getElementById(targetFields.city)) {
          document.getElementById(targetFields.city).value = d.cidade || '';
        }
        if (targetFields.state && document.getElementById(targetFields.state)) {
          document.getElementById(targetFields.state).value = d.uf || '';
        }
        toast(`Endereço localizado: ${d.logradouro}, ${d.bairro} - ${d.cidade}/${d.uf}`, 'success');
      } else {
        toast(data.error || 'CEP não localizado.', 'warning');
      }
    } catch (err) {
      console.error(err);
    }
  }

  // --------------------------------------------------------------------------
  // 6. DIGITAÇÃO POR VOZ JURÍDICA (Web Speech API)
  // --------------------------------------------------------------------------
  let activeRecognition = null;
  let activeTargetId = null;

  function toggleVoiceDictation(targetTextareaId, buttonId) {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      toast('Seu navegador não suporta reconhecimento de voz nativo. Recomendamos o Google Chrome ou Microsoft Edge.', 'warning');
      return;
    }

    const btn = document.getElementById(buttonId);
    const textarea = document.getElementById(targetTextareaId);

    // Se já estiver gravando neste campo, interrompe
    if (activeRecognition && activeTargetId === targetTextareaId) {
      activeRecognition.stop();
      activeRecognition = null;
      activeTargetId = null;
      if (btn) btn.classList.remove('jaw-mic-recording');
      toast('Gravação de voz pausada.', 'info', 2000);
      return;
    }

    // Se estava gravando em outro campo, para o anterior
    if (activeRecognition) {
      activeRecognition.stop();
    }

    const recognition = new SpeechRecognition();
    recognition.lang = 'pt-BR';
    recognition.continuous = true;
    recognition.interimResults = false;

    recognition.onstart = function () {
      activeRecognition = recognition;
      activeTargetId = targetTextareaId;
      if (btn) btn.classList.add('jaw-mic-recording');
      toast('🎙️ Gravando... Fale pausadamente para ditar o texto jurídico.', 'info', 4000);
    };

    recognition.onresult = function (event) {
      const results = event.results;
      const latest = results[results.length - 1];
      if (latest && latest[0]) {
        const transcript = latest[0].transcript.trim();
        if (textarea) {
          const currentText = textarea.value.trim();
          textarea.value = currentText ? `${currentText} ${transcript}` : transcript;
          // Dispara evento input para acionar auto-save
          textarea.dispatchEvent(new Event('input', { bubbles: true }));
        }
      }
    };

    recognition.onerror = function (e) {
      console.warn('[VOICE] Erro no microfone:', e.error);
      if (btn) btn.classList.remove('jaw-mic-recording');
      activeRecognition = null;
      activeTargetId = null;
      if (e.error !== 'no-speech') {
        toast('Erro no microfone: ' + e.error, 'warning');
      }
    };

    recognition.onend = function () {
      if (btn) btn.classList.remove('jaw-mic-recording');
      activeRecognition = null;
      activeTargetId = null;
    };

    try {
      recognition.start();
    } catch (err) {
      console.error(err);
    }
  }

  // --------------------------------------------------------------------------
  // 7. DETECTOR DE ANEXOS ESQUECIDOS
  // --------------------------------------------------------------------------
  function checkForgottenAttachmentWarning(text, filesArray) {
    if (!text) return false;
    const lower = text.toLowerCase();
    const mentionsAttachment =
      lower.includes('anexo') ||
      lower.includes('anexa') ||
      lower.includes('em anexo') ||
      lower.includes('segue cópia') ||
      lower.includes('junto procuração');

    const hasFiles = Array.isArray(filesArray) ? filesArray.length > 0 : !!filesArray;
    return mentionsAttachment && !hasFiles;
  }

  // --------------------------------------------------------------------------
  // Inicialização Automática no DOM
  // --------------------------------------------------------------------------
  document.addEventListener('DOMContentLoaded', function () {
    initTheme();
    initFontSize();

    // Ativa detector de conflito na aba de processos caso exista o campo
    attachConflictDetector('#lawsuit-opposing-party', '#lawsuit-conflict-warning');
  });

  // Exportações Globais
  window.JALegaltech = {
    toggleTheme,
    adjustFontSize,
    openFieldRequestModal,
    closeFieldRequestModal,
    submitFieldRequest,
    openMyFieldRequestsModal,
    closeMyFieldRequestsModal,
    lookupCepAuto,
    toggleVoiceDictation,
    checkForgottenAttachmentWarning
  };

  window.toggleTheme = toggleTheme;
  window.adjustFontSize = adjustFontSize;
  window.openFieldRequestModal = openFieldRequestModal;
  window.closeFieldRequestModal = closeFieldRequestModal;
  window.submitFieldRequest = submitFieldRequest;
  window.openMyFieldRequestsModal = openMyFieldRequestsModal;
  window.closeMyFieldRequestsModal = closeMyFieldRequestsModal;
  window.lookupCepAuto = lookupCepAuto;
  window.toggleVoiceDictation = toggleVoiceDictation;

})();
