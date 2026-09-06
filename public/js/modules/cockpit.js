/**
 * ==============================================================================
 * MÓDULO COCKPIT MATINAL DO ADVOGADO & CONTROLE DE PRAZOS (FASE 2)
 * ==============================================================================
 * 1. Painel "Meu Dia Hoje" (Prazos Fatais, Audiências com link virtual, Triagem DJEN)
 * 2. Paleta Universal de Comandos & Busca Rápida (Ctrl + K / Cmd + K)
 * 3. Calculadora Inteligente de Prazos Forenses (CPC art. 219 / CLT art. 775 / CPP)
 * 4. Validador Matemático em Tempo Real (CPF, CNPJ, CNJ - Módulo 11 e Módulo 97)
 * 5. Atalhos Inteligentes Diretos aos Tribunais (TJMG, TRT3, TRF6, STJ, STF)
 * ==============================================================================
 */

(function () {
  'use strict';

  // ============================================================================
  // 1. VALIDADORES MATEMÁTICOS EM TEMPO REAL (Módulo 11 e Módulo 97)
  // ============================================================================

  function validateCPF(cpf) {
    if (!cpf) return false;
    const clean = String(cpf).replace(/\D/g, '');
    if (clean.length !== 11) return false;
    if (/^(\d)\1{10}$/.test(clean)) return false; // Elimina 111.111.111-11, etc.

    let sum = 0;
    for (let i = 0; i < 9; i++) {
      sum += parseInt(clean.charAt(i), 10) * (10 - i);
    }
    let rev = 11 - (sum % 11);
    if (rev === 10 || rev === 11) rev = 0;
    if (rev !== parseInt(clean.charAt(9), 10)) return false;

    sum = 0;
    for (let i = 0; i < 10; i++) {
      sum += parseInt(clean.charAt(i), 10) * (11 - i);
    }
    rev = 11 - (sum % 11);
    if (rev === 10 || rev === 11) rev = 0;
    if (rev !== parseInt(clean.charAt(10), 10)) return false;

    return true;
  }

  function validateCNPJ(cnpj) {
    if (!cnpj) return false;
    const clean = String(cnpj).replace(/\D/g, '');
    if (clean.length !== 14) return false;
    if (/^(\d)\1{13}$/.test(clean)) return false;

    let size = clean.length - 2;
    let numbers = clean.substring(0, size);
    const digits = clean.substring(size);
    let sum = 0;
    let pos = size - 7;

    for (let i = size; i >= 1; i--) {
      sum += parseInt(numbers.charAt(size - i), 10) * pos--;
      if (pos < 2) pos = 9;
    }
    let res = sum % 11 < 2 ? 0 : 11 - (sum % 11);
    if (res !== parseInt(digits.charAt(0), 10)) return false;

    size = size + 1;
    numbers = clean.substring(0, size);
    sum = 0;
    pos = size - 7;
    for (let i = size; i >= 1; i--) {
      sum += parseInt(numbers.charAt(size - i), 10) * pos--;
      if (pos < 2) pos = 9;
    }
    res = sum % 11 < 2 ? 0 : 11 - (sum % 11);
    if (res !== parseInt(digits.charAt(1), 10)) return false;

    return true;
  }

  /**
   * Validação CNJ Módulo 97 (Resolução CNJ nº 65/2008 e ISO 7064)
   * Formato: NNNNNNN-DD.AAAA.J.TR.OOOO (20 dígitos)
   */
  function validateCNJ(cnj) {
    if (!cnj) return false;
    const clean = String(cnj).replace(/\D/g, '');
    if (clean.length !== 20) return false;

    const n = clean.substring(0, 7);
    const d = clean.substring(7, 9);
    const a = clean.substring(9, 13);
    const j = clean.substring(13, 14);
    const tr = clean.substring(14, 16);
    const o = clean.substring(16, 20);

    // Módulo 97 nos termos da Resolução 65 do CNJ:
    // Monta: NNNNNNN + AAAA + J + TR + OOOO + DD
    const checkStr = `${n}${a}${j}${tr}${o}${d}`;
    let remainder = 0;
    for (let i = 0; i < checkStr.length; i++) {
      remainder = (remainder * 10 + parseInt(checkStr[i], 10)) % 97;
    }
    return remainder === 1;
  }

  // Anexa validação automática a inputs de CPF, CNPJ e CNJ
  function setupInputValidators() {
    document.addEventListener('input', (e) => {
      const target = e.target;
      if (!target || target.tagName !== 'INPUT') return;

      const isCpf = target.id?.includes('cpf') || target.name?.includes('cpf') || target.dataset.validate === 'cpf';
      const isCnpj = target.id?.includes('cnpj') || target.name?.includes('cnpj') || target.dataset.validate === 'cnpj';
      const isCnj = target.id?.includes('cnj') || target.name?.includes('process') || target.dataset.validate === 'cnj';

      if (!isCpf && !isCnpj && !isCnj) return;

      const val = target.value.trim();
      const clean = val.replace(/\D/g, '');

      // Não valida se estiver vazio ou digitando primeiros caracteres
      if (!val) {
        clearFieldFeedback(target);
        return;
      }

      if (isCpf && clean.length === 11) {
        const ok = validateCPF(clean);
        applyFieldFeedback(target, ok, ok ? 'CPF Válido (Receita Federal)' : 'CPF Inválido (dígitos verificadores incorretos)');
      } else if (isCnpj && clean.length === 14) {
        const ok = validateCNPJ(clean);
        applyFieldFeedback(target, ok, ok ? 'CNPJ Válido' : 'CNPJ Inválido (dígitos verificadores incorretos)');
      } else if (isCnj && clean.length === 20) {
        const ok = validateCNJ(clean);
        applyFieldFeedback(target, ok, ok ? 'CNJ Válido (Módulo 97 CNJ)' : 'Número CNJ Inválido');
      } else if (clean.length > 0) {
        clearFieldFeedback(target);
      }
    });
  }

  function applyFieldFeedback(input, isValid, message) {
    let badge = input.parentElement?.querySelector('.field-math-feedback');
    if (!badge) {
      badge = document.createElement('div');
      badge.className = 'field-math-feedback text-[11px] font-bold mt-1 transition-all flex items-center space-x-1';
      input.parentElement?.appendChild(badge);
    }

    if (isValid) {
      input.classList.remove('border-rose-500', 'focus:border-rose-500');
      input.classList.add('border-emerald-500', 'focus:border-emerald-500');
      badge.className = 'field-math-feedback text-[11px] font-bold mt-1 text-emerald-600 flex items-center space-x-1';
      badge.innerHTML = `<span>✓</span> <span>${message}</span>`;
    } else {
      input.classList.remove('border-emerald-500', 'focus:border-emerald-500');
      input.classList.add('border-rose-500', 'focus:border-rose-500');
      badge.className = 'field-math-feedback text-[11px] font-bold mt-1 text-rose-600 flex items-center space-x-1';
      badge.innerHTML = `<span>⚠️</span> <span>${message}</span>`;
    }
  }

  function clearFieldFeedback(input) {
    input.classList.remove('border-emerald-500', 'border-rose-500');
    const badge = input.parentElement?.querySelector('.field-math-feedback');
    if (badge) badge.remove();
  }

  // ============================================================================
  // 2. ATALHOS DIRETOS AOS TRIBUNAIS (PJe, Projudi, TRT-3, TJMG, TRF-6)
  // ============================================================================

  function openTribunalPortal(cnjNumber) {
    if (!cnjNumber) {
      if (window.showToast) window.showToast('Informe o número do processo CNJ.', 'warning');
      return;
    }

    const clean = String(cnjNumber).replace(/\D/g, '');
    if (clean.length !== 20) {
      if (window.showToast) window.showToast('Número CNJ deve ter 20 dígitos.', 'warning');
      return;
    }

    const j = clean.substring(13, 14);
    const tr = clean.substring(14, 16);
    const key = `${j}.${tr}`;

    // Copia número CNJ limpo para a área de transferência
    try {
      navigator.clipboard.writeText(clean);
    } catch (_e) {}

    let portalUrl = '';
    let tribunalName = '';

    if (key === '8.13') {
      tribunalName = 'TJMG (PJe Minas Gerais)';
      portalUrl = 'https://pje.tjmg.jus.br/pje/ConsultaPublica/listView.seam';
    } else if (key === '5.03') {
      tribunalName = 'TRT-3 (PJe Justiça do Trabalho MG)';
      portalUrl = 'https://pje.trt3.jus.br/consultaprocessual/';
    } else if (key === '1.06') {
      tribunalName = 'TRF-6 (Justiça Federal de Minas Gerais)';
      portalUrl = 'https://eproc.trf6.jus.br/eproc/externo_controlador.php?acao=processo_consulta_publica';
    } else if (key === '1.01') {
      tribunalName = 'TRF-1 (Justiça Federal)';
      portalUrl = 'https://pje1g.trf1.jus.br/consultapublica/';
    } else if (key === '0.00') {
      tribunalName = 'STF (Supremo Tribunal Federal)';
      portalUrl = `https://portal.stf.jus.br/processos/detalhe.asp?incidente=${clean}`;
    } else if (key === '0.01') {
      tribunalName = 'STJ (Superior Tribunal de Justiça)';
      portalUrl = `https://processo.stj.jus.br/processo/pesquisa/?num_registro=${clean}`;
    } else {
      tribunalName = 'DataJud / CNJ';
      portalUrl = `https://comunicaapi.pje.jus.br/consulta?numeroProcesso=${clean}`;
    }

    if (window.showToast) {
      window.showToast(`CNJ copiado! Redirecionando para o portal do ${tribunalName}...`, 'success');
    }
    window.open(portalUrl, '_blank', 'noopener,noreferrer');
  }

  // ============================================================================
  // 3. CALCULADORA INTELIGENTE DE PRAZOS FORENSES (CPC/CLT/CPP)
  // ============================================================================

  window.openDeadlineCalculator = function (initialData = {}) {
    let modal = document.getElementById('deadline-calculator-modal');
    if (!modal) {
      createDeadlineCalculatorModal();
      modal = document.getElementById('deadline-calculator-modal');
    }

    const today = new Date().toISOString().slice(0, 10);
    const startInput = document.getElementById('calc-start-date');
    const daysInput = document.getElementById('calc-days-count');
    const regimeInput = document.getElementById('calc-regime');
    const pubIdInput = document.getElementById('calc-pub-id');

    if (startInput) startInput.value = initialData.start_date || today;
    if (daysInput) daysInput.value = initialData.days || 15;
    if (regimeInput) regimeInput.value = initialData.regime || 'cpc';
    if (pubIdInput) pubIdInput.value = initialData.publication_id || '';

    modal.classList.remove('hidden');
    calculateDeadlineFromUI();
  };

  window.closeDeadlineCalculator = function () {
    const modal = document.getElementById('deadline-calculator-modal');
    if (modal) modal.classList.add('hidden');
  };

  function createDeadlineCalculatorModal() {
    const div = document.createElement('div');
    div.id = 'deadline-calculator-modal';
    div.className = 'fixed inset-0 z-50 flex items-center justify-center p-4 bg-navy-950/70 backdrop-blur-xs hidden';
    div.innerHTML = `
      <div class="bg-white rounded-3xl max-w-2xl w-full p-6 sm:p-8 shadow-2xl border border-slate-200 space-y-6 max-h-[90vh] overflow-y-auto">
        <!-- Header -->
        <div class="flex items-center justify-between border-b border-slate-200 pb-4">
          <div class="flex items-center space-x-3">
            <div class="w-10 h-10 rounded-xl bg-amber-50 text-gold-600 flex items-center justify-center text-xl border border-gold-200 font-bold">
              ⚖️
            </div>
            <div>
              <h3 class="font-serif font-bold text-lg text-navy-950">Calculadora Inteligente de Prazos</h3>
              <p class="text-xs text-slate-500">Contagem precisa considerando CPC (art. 219), CLT, recesso forense e feriados de MG</p>
            </div>
          </div>
          <button onclick="closeDeadlineCalculator()" class="text-slate-400 hover:text-slate-600 p-2 rounded-xl hover:bg-slate-100 transition-colors text-lg">
            ✕
          </button>
        </div>

        <input type="hidden" id="calc-pub-id" value="" />

        <!-- Parâmetros da Contagem -->
        <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label class="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
              Data Disponibilização (D0)
            </label>
            <input 
              type="date" 
              id="calc-start-date" 
              class="w-full px-3 py-2.5 rounded-xl border border-slate-300 bg-slate-50 text-xs font-semibold focus:outline-none focus:border-gold-500 focus:bg-white"
              onchange="calculateDeadlineFromUI()"
            />
          </div>

          <div>
            <label class="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
              Regime Jurídico
            </label>
            <select 
              id="calc-regime" 
              class="w-full px-3 py-2.5 rounded-xl border border-slate-300 bg-slate-50 text-xs font-semibold focus:outline-none focus:border-gold-500 focus:bg-white"
              onchange="calculateDeadlineFromUI()"
            >
              <option value="cpc">CPC/15 (Dias Úteis - Cível)</option>
              <option value="clt">CLT (Dias Úteis - Trabalhista)</option>
              <option value="cpp">CPP (Dias Corridos - Penal)</option>
            </select>
          </div>

          <div>
            <label class="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
              Prazo em Dias
            </label>
            <input 
              type="number" 
              id="calc-days-count" 
              min="1" 
              max="180" 
              value="15" 
              class="w-full px-3 py-2.5 rounded-xl border border-slate-300 bg-slate-50 text-xs font-semibold focus:outline-none focus:border-gold-500 focus:bg-white"
              oninput="calculateDeadlineFromUI()"
            />
          </div>
        </div>

        <!-- Atalhos Rápidos de Prazos do CPC / CLT -->
        <div class="flex flex-wrap items-center gap-2 pt-1 border-t border-slate-100">
          <span class="text-[11px] font-bold text-slate-400 uppercase">Atalhos Comuns:</span>
          <button type="button" onclick="setCalcDays(5)" class="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-gold-50 hover:text-gold-900 border border-slate-200 text-xs font-bold transition-colors">
            5d (Embargos)
          </button>
          <button type="button" onclick="setCalcDays(8)" class="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-gold-50 hover:text-gold-900 border border-slate-200 text-xs font-bold transition-colors">
            8d (RO Trabalhista)
          </button>
          <button type="button" onclick="setCalcDays(10)" class="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-gold-50 hover:text-gold-900 border border-slate-200 text-xs font-bold transition-colors">
            10d (Manifestação)
          </button>
          <button type="button" onclick="setCalcDays(15)" class="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-gold-50 hover:text-gold-900 border border-slate-200 text-xs font-bold transition-colors">
            15d (Apelação / Contestação)
          </button>
        </div>

        <!-- Resultado em Destaque -->
        <div id="calc-result-box" class="p-5 rounded-2xl bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200 space-y-3">
          <div class="flex items-center justify-between">
            <span class="text-xs font-bold text-amber-900 uppercase tracking-wider">Resultado da Contagem Processual</span>
            <span id="calc-result-badge" class="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-rose-100 text-rose-800 border border-rose-300">
              🚨 Data Fatal
            </span>
          </div>
          <div class="flex flex-col sm:flex-row sm:items-baseline justify-between gap-2">
            <div>
              <span class="text-xs text-slate-600 block">Vencimento Impreterível:</span>
              <div id="calc-fatal-date" class="font-serif text-2xl sm:text-3xl font-extrabold text-navy-950">
                Calculando...
              </div>
            </div>
            <div class="text-xs text-slate-600 sm:text-right">
              <div>Início Contagem: <strong id="calc-start-term">—</strong></div>
              <div>Dias Corridos Gastos: <strong id="calc-total-calendar-days">—</strong></div>
            </div>
          </div>
        </div>

        <!-- Memória de Cálculo / Dias Suspensos -->
        <div class="space-y-2">
          <span class="text-xs font-bold text-slate-700 uppercase tracking-wider block">
            Memória de Contagem Dia a Dia:
          </span>
          <div id="calc-memory-list" class="max-h-48 overflow-y-auto space-y-1.5 p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs font-mono">
            <!-- Renderizado via JS -->
          </div>
        </div>

        <!-- Botões de Ação -->
        <div class="flex justify-end items-center space-x-3 pt-4 border-t border-slate-200">
          <button 
            type="button" 
            onclick="closeDeadlineCalculator()" 
            class="px-4 py-2.5 rounded-xl bg-white hover:bg-slate-100 border border-slate-300 text-slate-700 font-bold text-xs transition-colors"
          >
            Fechar
          </button>
          <button 
            type="button" 
            id="btn-launch-to-calendar"
            onclick="launchCalculatedDeadlineToCalendar()" 
            class="px-5 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 via-gold-500 to-amber-600 hover:from-amber-600 text-white font-bold text-xs shadow-md transition-all border border-gold-400/60 flex items-center space-x-2"
          >
            <span>📅</span>
            <span>Agendar Prazo Fatal na Agenda</span>
          </button>
        </div>
      </div>
    `;
    document.body.appendChild(div);
  }

  window.setCalcDays = function (days) {
    const el = document.getElementById('calc-days-count');
    if (el) {
      el.value = days;
      calculateDeadlineFromUI();
    }
  };

  let lastCalculatedResult = null;

  async function calculateDeadlineFromUI() {
    const startDate = document.getElementById('calc-start-date')?.value;
    const days = document.getElementById('calc-days-count')?.value || 15;
    const regime = document.getElementById('calc-regime')?.value || 'cpc';

    if (!startDate) return;

    try {
      const res = await fetch('/api/court/deadline/calculate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ start_date: startDate, days: Number(days), regime })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Falha ao calcular prazo.');

      lastCalculatedResult = data;
      renderCalculationResult(data);
    } catch (err) {
      console.error('[CALCULADORA] Erro:', err);
    }
  }

  function renderCalculationResult(res) {
    const fatalEl = document.getElementById('calc-fatal-date');
    const startTermEl = document.getElementById('calc-start-term');
    const totalDaysEl = document.getElementById('calc-total-calendar-days');
    const memList = document.getElementById('calc-memory-list');

    if (fatalEl) {
      const [y, m, d] = res.data_fatal.split('-');
      fatalEl.textContent = `${d}/${m}/${y} (às 23:59)`;
    }
    if (startTermEl) {
      const [y, m, d] = res.data_inicio_prazo.split('-');
      startTermEl.textContent = `${d}/${m}/${y}`;
    }
    if (totalDaysEl) {
      totalDaysEl.textContent = `${res.total_dias_corridos} dias corridos`;
    }

    if (memList && res.memoria_calculo) {
      memList.innerHTML = res.memoria_calculo.map(m => {
        const [y, mm, d] = m.data.split('-');
        const isCounted = m.status === 'contado';
        const isProrrogado = m.status === 'prorrogado';
        const badgeColor = isCounted ? 'text-emerald-700 bg-emerald-50' : (isProrrogado ? 'text-orange-700 bg-orange-50' : 'text-slate-500 bg-slate-100');

        return `
          <div class="flex items-center justify-between p-1.5 rounded-lg ${isCounted ? 'bg-white border border-slate-200' : 'opacity-75'}">
            <span>${d}/${mm}/${y}</span>
            <span class="px-2 py-0.5 rounded text-[10px] font-bold ${badgeColor}">
              ${m.descricao}
            </span>
          </div>
        `;
      }).join('');
    }
  }

  window.launchCalculatedDeadlineToCalendar = async function () {
    if (!lastCalculatedResult || !lastCalculatedResult.data_fatal) {
      if (window.showToast) window.showToast('Nenhum prazo calculado.', 'warning');
      return;
    }

    const pubId = document.getElementById('calc-pub-id')?.value || null;
    const title = `Prazo Fatal (${lastCalculatedResult.prazo_dias}d - ${lastCalculatedResult.regime})`;
    const btn = document.getElementById('btn-launch-to-calendar');
    if (btn) btn.disabled = true;

    try {
      const res = await fetch('/api/court/deadline/launch-to-calendar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          publication_id: pubId,
          title,
          deadline_date: lastCalculatedResult.data_fatal,
          regime: lastCalculatedResult.regime,
          days_count: lastCalculatedResult.prazo_dias
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro ao lançar prazo.');

      if (window.showToast) {
        window.showToast(`Prazo para ${lastCalculatedResult.data_fatal} lançado na agenda com sucesso!`, 'success');
      }
      closeDeadlineCalculator();
      if (typeof window.loadCalendarEvents === 'function') window.loadCalendarEvents();
      if (typeof window.loadMeuDiaHoje === 'function') window.loadMeuDiaHoje();
    } catch (err) {
      if (window.showToast) window.showToast('Erro ao agendar: ' + err.message, 'error');
    } finally {
      if (btn) btn.disabled = false;
    }
  };

  // ============================================================================
  // 4. PALETA UNIVERSAL DE COMANDOS & BUSCA RÁPIDA (Ctrl + K / Cmd + K)
  // ============================================================================

  const PALETTE_ACTIONS = [
    { id: 'new-client', title: 'Novo Cliente & Contrato', category: 'Ações Rápidas', icon: '👤', run: () => window.openNewClientModal?.() },
    { id: 'new-lawsuit', title: 'Novo Processo Judicial', category: 'Ações Rápidas', icon: '⚖️', run: () => window.openNewLawsuitModal?.() },
    { id: 'new-event', title: 'Novo Prazo / Agendamento', category: 'Ações Rápidas', icon: '📅', run: () => window.openNewEventModal?.() },
    { id: 'new-alvara', title: 'Registrar Alvará Judicial', category: 'Ações Rápidas', icon: '💰', run: () => window.openNewAlvaraModal?.() },
    { id: 'deadline-calc', title: 'Calculadora Inteligente de Prazos', category: 'Ferramentas', icon: '🧮', run: () => window.openDeadlineCalculator?.() },
    { id: 'toggle-dark', title: 'Alternar Modo Escuro / Claro', category: 'Preferências', icon: '🌓', run: () => window.toggleDarkMode?.() },
    { id: 'field-request', title: 'Solicitar Novo Campo ao Programador', category: 'Ferramentas', icon: '💡', run: () => window.openProgrammerFieldRequestModal?.() },
    { id: 'tab-clients', title: 'Ir para Aba de Clientes', category: 'Navegação', icon: '👥', run: () => window.switchTab?.('clients') },
    { id: 'tab-lawsuits', title: 'Ir para Aba de Processos', category: 'Navegação', icon: '📂', run: () => window.switchTab?.('lawsuits') },
    { id: 'tab-finance', title: 'Ir para Aba de Finanças & Alvarás', category: 'Navegação', icon: '💵', run: () => window.switchTab?.('finance') },
    { id: 'tab-calendar', title: 'Ir para Agenda de Prazos', category: 'Navegação', icon: '📆', run: () => window.switchTab?.('calendar') },
    { id: 'tab-maintenance', title: 'Ir para Manutenção do Sistema', category: 'Navegação', icon: '⚙️', run: () => window.switchTab?.('maintenance') }
  ];

  let selectedPaletteIndex = 0;
  let currentFilteredItems = [];

  window.openCommandPalette = function () {
    let modal = document.getElementById('command-palette-modal');
    if (!modal) {
      createCommandPaletteModal();
      modal = document.getElementById('command-palette-modal');
    }
    modal.classList.remove('hidden');
    const input = document.getElementById('command-palette-input');
    if (input) {
      input.value = '';
      input.focus();
      filterCommandPalette('');
    }
  };

  window.closeCommandPalette = function () {
    const modal = document.getElementById('command-palette-modal');
    if (modal) modal.classList.add('hidden');
  };

  function createCommandPaletteModal() {
    const div = document.createElement('div');
    div.id = 'command-palette-modal';
    div.className = 'fixed inset-0 z-50 flex items-start justify-center pt-16 sm:pt-24 p-4 bg-navy-950/70 backdrop-blur-xs hidden';
    div.innerHTML = `
      <div class="bg-white rounded-3xl max-w-xl w-full shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[80vh]">
        <!-- Campo de Busca -->
        <div class="p-4 border-b border-slate-200 flex items-center space-x-3 bg-slate-50/70">
          <span class="text-slate-400 text-lg">🔍</span>
          <input 
            type="text" 
            id="command-palette-input" 
            placeholder="Digite uma ação, cliente, CPF ou nº de processo..." 
            class="w-full bg-transparent border-none text-sm sm:text-base font-semibold text-navy-950 focus:outline-none placeholder:text-slate-400"
            autocomplete="off"
          />
          <span class="px-2 py-0.5 rounded-lg bg-slate-200 text-slate-600 font-mono text-[10px] font-bold">ESC</span>
        </div>

        <!-- Lista Dinâmica de Resultados -->
        <div id="command-palette-results" class="overflow-y-auto p-2 space-y-1 max-h-96 custom-scrollbar-x">
          <!-- Renderizado via JS -->
        </div>

        <!-- Rodapé com Dicas de Atalho -->
        <div class="p-3 bg-slate-50 border-t border-slate-200 text-[11px] text-slate-500 flex items-center justify-between px-4">
          <div class="flex items-center space-x-3">
            <span><strong class="font-mono bg-white px-1.5 py-0.5 rounded border border-slate-200">↑</strong> <strong class="font-mono bg-white px-1.5 py-0.5 rounded border border-slate-200">↓</strong> Navegar</span>
            <span><strong class="font-mono bg-white px-1.5 py-0.5 rounded border border-slate-200">↵</strong> Executar</span>
          </div>
          <span class="text-gold-700 font-bold">Jorge Alvim • Cockpit 2.0</span>
        </div>
      </div>
    `;
    document.body.appendChild(div);

    // Eventos do Input
    const input = div.querySelector('#command-palette-input');
    input.addEventListener('input', (e) => filterCommandPalette(e.target.value));
    input.addEventListener('keydown', handlePaletteKeydown);

    // Fechar ao clicar fora
    div.addEventListener('click', (e) => {
      if (e.target === div) closeCommandPalette();
    });
  }

  function filterCommandPalette(query) {
    const q = query.trim().toLowerCase();
    const cleanQ = q.replace(/\D/g, '');

    let items = [];

    // 1. Ações do Sistema
    const filteredActions = PALETTE_ACTIONS.filter(a => a.title.toLowerCase().includes(q) || a.category.toLowerCase().includes(q));
    items.push(...filteredActions);

    // 2. Clientes em memória (se disponíveis)
    if (window.allClients && Array.isArray(window.allClients)) {
      const matchedClients = window.allClients.filter(c => {
        const nameMatch = c.full_name?.toLowerCase().includes(q);
        const cpfMatch = cleanQ && c.cpf?.replace(/\D/g, '').includes(cleanQ);
        return nameMatch || cpfMatch;
      }).slice(0, 5);

      matchedClients.forEach(c => {
        items.push({
          id: `client-${c.id}`,
          title: `${c.full_name} (${c.cpf || c.cnpj || 'Sem doc'})`,
          category: 'Clientes',
          icon: '👤',
          run: () => {
            window.switchTab?.('clients');
            const searchInput = document.getElementById('search-clients-input');
            if (searchInput) {
              searchInput.value = c.full_name;
              window.filterClients?.();
            }
          }
        });
      });
    }

    // 3. Processos em memória (se disponíveis)
    if (window.allLawsuits && Array.isArray(window.allLawsuits)) {
      const matchedLawsuits = window.allLawsuits.filter(l => {
        const cnjMatch = l.cnj_number?.toLowerCase().includes(q) || (cleanQ && l.cnj_number?.replace(/\D/g, '').includes(cleanQ));
        const clientMatch = l.client_name?.toLowerCase().includes(q);
        return cnjMatch || clientMatch;
      }).slice(0, 5);

      matchedLawsuits.forEach(l => {
        items.push({
          id: `lawsuit-${l.id}`,
          title: `Proc: ${l.cnj_number} • ${l.client_name || 'Cliente'}`,
          category: 'Processos Judiciais',
          icon: '⚖️',
          run: () => {
            window.switchTab?.('lawsuits');
            const searchInput = document.getElementById('search-lawsuits-input');
            if (searchInput) {
              searchInput.value = l.cnj_number;
              window.filterLawsuits?.();
            }
          }
        });
      });
    }

    currentFilteredItems = items;
    selectedPaletteIndex = 0;
    renderPaletteResults();
  }

  function renderPaletteResults() {
    const container = document.getElementById('command-palette-results');
    if (!container) return;

    if (currentFilteredItems.length === 0) {
      container.innerHTML = `
        <div class="p-8 text-center text-slate-400 space-y-1">
          <div class="text-2xl">🔍</div>
          <p class="text-xs font-bold">Nenhum comando ou registro encontrado.</p>
        </div>
      `;
      return;
    }

    container.innerHTML = currentFilteredItems.map((item, idx) => {
      const isSelected = idx === selectedPaletteIndex;
      return `
        <div 
          onclick="executePaletteItem(${idx})" 
          class="p-2.5 rounded-2xl flex items-center justify-between cursor-pointer transition-all ${isSelected ? 'bg-gold-50 text-navy-950 border border-gold-300 font-bold' : 'hover:bg-slate-100 text-slate-700'}"
        >
          <div class="flex items-center space-x-3 min-w-0">
            <span class="text-base flex-shrink-0">${item.icon}</span>
            <span class="text-xs truncate">${item.title}</span>
          </div>
          <span class="text-[10px] uppercase font-mono px-2 py-0.5 rounded bg-slate-100 text-slate-500 flex-shrink-0">
            ${item.category}
          </span>
        </div>
      `;
    }).join('');
  }

  function handlePaletteKeydown(e) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (currentFilteredItems.length > 0) {
        selectedPaletteIndex = (selectedPaletteIndex + 1) % currentFilteredItems.length;
        renderPaletteResults();
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (currentFilteredItems.length > 0) {
        selectedPaletteIndex = (selectedPaletteIndex - 1 + currentFilteredItems.length) % currentFilteredItems.length;
        renderPaletteResults();
      }
    } else if (e.key === 'Enter') {
      e.preventDefault();
      executePaletteItem(selectedPaletteIndex);
    } else if (e.key === 'Escape') {
      closeCommandPalette();
    }
  }

  window.executePaletteItem = function (index) {
    const item = currentFilteredItems[index];
    if (item && typeof item.run === 'function') {
      closeCommandPalette();
      item.run();
    }
  };

  // Listener global de teclado para Ctrl + K / Cmd + K
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      window.openCommandPalette();
    }
  });

  // ============================================================================
  // 5. PAINEL "MEU DIA HOJE" NO DASHBOARD
  // ============================================================================

  window.loadMeuDiaHoje = async function () {
    const container = document.getElementById('meu-dia-hoje-container');
    if (!container) return;

    try {
      const res = await fetch('/api/dashboard/meu-dia-hoje');
      if (!res.ok) return;
      const data = await res.json();
      if (!data.success) return;

      renderMeuDiaHoje(data, container);
    } catch (err) {
      console.warn('[COCKPIT] Não foi possível carregar Meu Dia Hoje:', err.message);
    }
  };

  function renderMeuDiaHoje(data, container) {
    const prazosHoje = data.prazos?.hoje || [];
    const prazosSemana = data.prazos?.semana || [];
    const audiencias = data.audiencias || [];
    const intimacoes = data.intimacoes || [];

    // 1. HTML Card Prazos Fatais
    const prazosHtml = prazosHoje.length > 0
      ? prazosHoje.map(p => `
          <div class="p-3 rounded-2xl bg-rose-50/80 border border-rose-200 flex items-center justify-between gap-2">
            <div class="min-w-0">
              <div class="flex items-center space-x-1.5">
                <span class="w-2 h-2 rounded-full bg-rose-600 animate-pulse"></span>
                <strong class="text-xs text-rose-950 truncate">${p.title}</strong>
              </div>
              <div class="text-[11px] text-slate-500 font-mono mt-0.5">${p.lawsuit_number || 'Sem nº'} • ${p.client_name || 'Escritório'}</div>
            </div>
            <span class="px-2 py-0.5 rounded-md bg-rose-600 text-white font-extrabold text-[10px] uppercase flex-shrink-0">
              Hoje 23:59
            </span>
          </div>
        `).join('')
      : `
        <div class="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 text-center text-xs text-emerald-800 font-bold flex items-center justify-center space-x-2">
          <span>🟢</span>
          <span>Nenhum prazo fatal vencendo hoje! (${prazosSemana.length} na semana)</span>
        </div>
      `;

    // 2. HTML Card Audiências
    const audienciasHtml = audiencias.length > 0
      ? audiencias.map(a => {
          const time = a.start_datetime ? a.start_datetime.slice(11, 16) : '—';
          const meetBtn = a.meeting_url
            ? `<a href="${a.meeting_url}" target="_blank" class="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-[11px] shadow-xs flex items-center space-x-1 flex-shrink-0">
                 <span>📹 Entrar na Sala Virtual</span>
               </a>`
            : `<span class="text-[10px] text-slate-400 italic">${a.location || 'Presencial'}</span>`;

          return `
            <div class="p-3 rounded-2xl bg-slate-50 border border-slate-200 flex items-center justify-between gap-3">
              <div class="min-w-0">
                <div class="flex items-center space-x-2">
                  <span class="px-2 py-0.5 rounded-md bg-gold-100 text-gold-900 font-bold text-[10px] border border-gold-300">${time}</span>
                  <strong class="text-xs text-navy-950 truncate">${a.title}</strong>
                </div>
                <div class="text-[11px] text-slate-500 mt-0.5">${a.lawsuit_number || ''} ${a.client_name ? '• ' + a.client_name : ''}</div>
              </div>
              ${meetBtn}
            </div>
          `;
        }).join('')
      : `
        <div class="p-4 rounded-2xl bg-slate-50 border border-slate-200 text-center text-xs text-slate-500 italic">
          Nenhuma audiência agendada para hoje.
        </div>
      `;

    // 3. HTML Card Intimações do DJEN (Triagem)
    const intimacoesHtml = intimacoes.length > 0
      ? intimacoes.map(i => `
          <div class="p-3 rounded-2xl bg-white border border-slate-200 space-y-2" id="djen-item-${i.id}">
            <div class="flex items-start justify-between gap-2">
              <div>
                <span class="px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-50 text-indigo-800 border border-indigo-200">${i.sigla_tribunal || 'DJEN'}</span>
                <span class="font-mono text-xs font-bold text-navy-950 ml-1.5">${i.numeroprocessocommascara || i.numero_processo || 'S/N'}</span>
              </div>
              <span class="text-[10px] text-slate-400 font-medium">${i.data_disponibilizacao || ''}</span>
            </div>
            <p class="text-xs text-slate-600 line-clamp-2 leading-relaxed bg-slate-50 p-2 rounded-xl border border-slate-100">${i.texto_resumo || i.tipo_comunicacao || 'Intimação disponível para conferência.'}</p>
            <div class="flex items-center justify-end space-x-2 pt-1 border-t border-slate-100">
              <button onclick="triageDJEN('${i.id}', 'ciente')" class="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-[10px] font-bold transition-colors">
                ✓ Ciente
              </button>
              <button onclick="openDeadlineCalcForDJEN('${i.id}', '${i.data_disponibilizacao || ''}')" class="px-2.5 py-1 rounded-lg bg-gold-50 hover:bg-gold-100 text-gold-900 border border-gold-300 text-[10px] font-bold transition-colors">
                📅 Lançar Prazo
              </button>
              <button onclick="triageDJEN('${i.id}', 'arquivar')" class="px-2 py-1 rounded-lg text-slate-400 hover:text-slate-600 text-[10px] font-bold transition-colors">
                📁 Arquivar
              </button>
            </div>
          </div>
        `).join('')
      : `
        <div class="p-4 rounded-2xl bg-slate-50 border border-slate-200 text-center text-xs text-slate-500 italic">
          Nenhuma nova intimação pendente de triagem no DJEN.
        </div>
      `;

    container.innerHTML = `
      <div class="bg-white rounded-3xl p-5 sm:p-6 border border-slate-200 shadow-sm space-y-4 mb-6">
        <!-- Topo Cockpit -->
        <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 border-b border-slate-100 pb-4">
          <div class="flex items-center space-x-3">
            <div class="w-11 h-11 rounded-2xl bg-gradient-to-br from-navy-900 to-navy-800 text-gold-400 flex items-center justify-center text-xl shadow-xs font-bold">
              ⚡
            </div>
            <div>
              <div class="flex items-center space-x-2">
                <h3 class="font-serif font-bold text-lg text-navy-950">Meu Dia Hoje • Cockpit do Advogado</h3>
                <span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-gold-100 text-gold-900 border border-gold-300">
                  ${data.hora_atual || ''}
                </span>
              </div>
              <p class="text-xs text-slate-500">Visão consolidada de prazos fatais, pautas de audiência e triagem rápida do DJEN.</p>
            </div>
          </div>
          <div class="flex items-center space-x-2">
            <button 
              onclick="openCommandPalette()" 
              class="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs transition-colors flex items-center space-x-1.5 border border-slate-200"
              title="Abrir paleta de comandos"
            >
              <span>⚡ Comandos</span>
              <kbd class="font-mono text-[10px] bg-white px-1.5 py-0.5 rounded border border-slate-300 text-slate-500">Ctrl+K</kbd>
            </button>
            <button 
              onclick="openDeadlineCalculator()" 
              class="px-3 py-1.5 rounded-xl bg-gold-50 hover:bg-gold-100 text-gold-900 font-bold text-xs transition-colors border border-gold-300"
            >
              🧮 Calculadora de Prazos
            </button>
          </div>
        </div>

        <!-- Grade com os 3 Cartões -->
        <div class="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <!-- Coluna 1: Prazos Fatais -->
          <div class="space-y-2.5">
            <div class="flex items-center justify-between">
              <span class="text-xs font-bold text-rose-700 uppercase tracking-wider flex items-center space-x-1">
                <span>🚨</span>
                <span>Prazos Fatais (${prazosHoje.length})</span>
              </span>
              <span class="text-[11px] text-slate-400">${prazosSemana.length} na semana</span>
            </div>
            <div class="space-y-2">
              ${prazosHtml}
            </div>
          </div>

          <!-- Coluna 2: Audiências de Hoje -->
          <div class="space-y-2.5">
            <div class="flex items-center justify-between">
              <span class="text-xs font-bold text-navy-950 uppercase tracking-wider flex items-center space-x-1">
                <span>🏛️</span>
                <span>Audiências & Pauta (${audiencias.length})</span>
              </span>
            </div>
            <div class="space-y-2">
              ${audienciasHtml}
            </div>
          </div>

          <!-- Coluna 3: Intimações DJEN -->
          <div class="space-y-2.5">
            <div class="flex items-center justify-between">
              <span class="text-xs font-bold text-indigo-900 uppercase tracking-wider flex items-center space-x-1">
                <span>📰</span>
                <span>Triagem DJEN (${intimacoes.length})</span>
              </span>
            </div>
            <div class="space-y-2">
              ${intimacoesHtml}
            </div>
          </div>
        </div>
      </div>
    `;
  }

  window.triageDJEN = async function (id, action) {
    try {
      const res = await fetch(`/api/juridico/publications/${id}/triage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro na triagem.');

      if (window.showToast) window.showToast(data.message || 'Triagem efetuada!', 'success');
      const itemEl = document.getElementById(`djen-item-${id}`);
      if (itemEl) {
        itemEl.classList.add('opacity-40', 'pointer-events-none');
      }
    } catch (err) {
      if (window.showToast) window.showToast('Erro: ' + err.message, 'error');
    }
  };

  window.openDeadlineCalcForDJEN = function (pubId, dataDisp) {
    window.openDeadlineCalculator({
      start_date: dataDisp || new Date().toISOString().slice(0, 10),
      publication_id: pubId,
      days: 15
    });
  };

  // Expõe helpers no escopo global
  window.validateCPF = validateCPF;
  window.validateCNPJ = validateCNPJ;
  window.validateCNJ = validateCNJ;
  window.openTribunalPortal = openTribunalPortal;

  // Inicialização Automática
  document.addEventListener('DOMContentLoaded', () => {
    setupInputValidators();
    setTimeout(() => {
      window.loadMeuDiaHoje();
    }, 400);
  });

})();
