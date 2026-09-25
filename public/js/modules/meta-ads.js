// ============================================================================
// MÓDULO FRONTEND: 📢 META ADS & MARKETING (Facebook & Instagram Hub)
// - Upload de Imagens e Vídeos com Pré-visualização em Tempo Real
// - Live Mockup de Smartphone (Feed do Instagram e Facebook)
// - Validador de Compliance Ético OAB (Prov. 205/2021) & Diretrizes Meta
// - Envio de Rascunhos de Anúncios (status: PAUSED) para a Meta Marketing API
// - Gestão de Histórico e Configurações de Acesso da Meta
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

  function getAuthToken() {
    if (typeof getToken === 'function') {
      const t = getToken();
      if (t) return t;
    }
    return localStorage.getItem('ja_admin_token') || localStorage.getItem('ja_token') || localStorage.getItem('token') || '';
  }

  let complianceTimer = null;
  let cachedConfig = null;
  let cachedPosts = [];

  // --------------------------------------------------------------------------
  // 1. CARREGAMENTO INICIAL DA ABA META ADS
  // --------------------------------------------------------------------------
  async function loadMetaAdsTab() {
    await Promise.all([
      fetchMetaConfig(),
      fetchMetaPosts()
    ]);
    initLiveMockupListeners();
    syncMetaAudienceMockup();
    calculateAndRenderMetaBudget(20);
  }

  // --------------------------------------------------------------------------
  // 2. CONSULTA DE CONFIGURAÇÕES DA META API
  // --------------------------------------------------------------------------
  async function fetchMetaConfig() {
    const token = getAuthToken();
    try {
      const res = await fetch('/api/meta-ads/config', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (res.ok && data.success) {
        cachedConfig = data;
        renderMetaConfigStatus(data);
      }
    } catch (err) {
      console.warn('[META ADS] Falha ao consultar config:', err);
    }
  }

  function renderMetaConfigStatus(cfg) {
    const badge = document.getElementById('meta-api-status-badge');
    const badgeDetail = document.getElementById('meta-api-status-detail');
    if (!badge) return;

    if (cfg.isConfigured && cfg.hasToken) {
      badge.className = 'inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-700 border border-emerald-300 text-xs font-extrabold';
      badge.innerHTML = '<span class="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span> Meta API Conectada';
      if (badgeDetail) badgeDetail.innerText = `Conta: ${cfg.adAccountId || 'Página Vinculada'}`;
    } else {
      badge.className = 'inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/10 text-amber-800 border border-amber-300 text-xs font-extrabold';
      badge.innerHTML = '<span class="w-2 h-2 rounded-full bg-amber-500"></span> Modo Homologação (Simulado)';
      if (badgeDetail) badgeDetail.innerText = 'Rascunhos gravados com segurança local';
    }
  }

  // --------------------------------------------------------------------------
  // 3. CONSULTA DE MATERIAIS & RASCUNHOS
  // --------------------------------------------------------------------------
  async function fetchMetaPosts() {
    const token = getAuthToken();
    const listEl = document.getElementById('meta-posts-table-body');
    const countTotalEl = document.getElementById('meta-kpi-total');
    const countDraftsEl = document.getElementById('meta-kpi-drafts');
    const countOrgEl = document.getElementById('meta-kpi-organic');

    try {
      const res = await fetch('/api/meta-ads/posts', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();

      if (res.ok && data.success) {
        cachedPosts = data.posts || [];

        // Atualiza KPIs
        if (countTotalEl) countTotalEl.innerText = cachedPosts.length;
        if (countDraftsEl) {
          countDraftsEl.innerText = cachedPosts.filter(p => p.status.includes('DRAFT') || p.status.includes('PAUSED')).length;
        }
        if (countOrgEl) {
          countOrgEl.innerText = cachedPosts.filter(p => p.destination_type.includes('FACEBOOK') || p.destination_type.includes('INSTAGRAM')).length;
        }

        renderMetaPostsList(cachedPosts);
      }
    } catch (err) {
      console.error('[META ADS] Erro ao carregar posts:', err);
      if (listEl) {
        listEl.innerHTML = `<tr><td colspan="6" class="p-6 text-center text-xs text-rose-600 font-bold">Erro ao carregar materiais: ${err.message}</td></tr>`;
      }
    }
  }

  function renderMetaPostsList(posts) {
    const tbody = document.getElementById('meta-posts-table-body');
    if (!tbody) return;

    if (!posts || posts.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="6" class="p-8 text-center text-xs text-slate-500 font-medium">
            <div class="text-2xl mb-1">📢</div>
            Nenhum material de marketing criado ainda.<br>
            Use o formulário ao lado para criar seu primeiro rascunho de anúncio ou publicação.
          </td>
        </tr>
      `;
      return;
    }

    tbody.innerHTML = posts.map(p => {
      let destBadge = '';
      if (p.destination_type === 'AD_DRAFT_PAUSED') {
        const isAdActive = (p.ad_status === 'ACTIVE' || p.status === 'ACTIVE');
        destBadge = `<span class="px-2 py-0.5 rounded-full ${isAdActive ? 'bg-emerald-100 text-emerald-800' : 'bg-blue-100 text-blue-800'} text-[10px] font-bold">🎯 Meta Ads (${isAdActive ? 'ATIVO' : 'PAUSADO'})</span>`;
      } else if (p.destination_type === 'FACEBOOK_PAGE_POST') {
        destBadge = '<span class="px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-800 text-[10px] font-bold">📘 Facebook Feed</span>';
      } else if (p.destination_type === 'INSTAGRAM_FEED') {
        destBadge = '<span class="px-2 py-0.5 rounded-full bg-fuchsia-100 text-fuchsia-800 text-[10px] font-bold">📸 Instagram Feed</span>';
      } else {
        destBadge = '<span class="px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 text-[10px] font-bold">📁 Rascunho Local</span>';
      }

      let statusBadge = '';
      if (p.status === 'ACTIVE' || p.ad_status === 'ACTIVE') {
        statusBadge = '<span class="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-bold">▶️ Ativo (Veiculando)</span>';
      } else if (p.status === 'SENT_TO_META_PAUSED' || p.ad_status === 'PAUSED') {
        statusBadge = '<span class="px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 text-[10px] font-bold">⏸️ Pausado</span>';
      } else if (p.status === 'SIMULATED_DRAFT') {
        statusBadge = '<span class="px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 text-[10px] font-bold">🟡 Rascunho Homologado</span>';
      } else if (p.status === 'PUBLISHED_ORGANIC') {
        statusBadge = '<span class="px-2 py-0.5 rounded-full bg-green-100 text-green-800 text-[10px] font-bold">✓ Publicado</span>';
      } else {
        statusBadge = '<span class="px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 text-[10px] font-bold">Rascunho</span>';
      }

      const mediaThumb = p.media_path
        ? (p.media_type === 'video'
            ? `<div class="w-11 h-11 rounded-lg bg-slate-900 text-white flex items-center justify-center text-xs font-bold shadow-sm">🎬 MP4</div>`
            : `<img src="${p.media_path}" alt="Mídia" class="w-11 h-11 rounded-lg object-cover border border-slate-200 shadow-sm">`)
        : `<div class="w-11 h-11 rounded-lg bg-slate-100 text-slate-400 flex items-center justify-center text-xs font-bold">📄</div>`;

      const dateStr = p.created_at ? new Date(p.created_at).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '--';
      const endDateLabel = p.end_date ? `🏁 Até ${new Date(p.end_date).toLocaleDateString('pt-BR')}` : `♾️ Contínuo`;

      return `
        <tr class="hover:bg-slate-50/80 transition-colors border-b border-slate-100">
          <td class="p-3.5">${mediaThumb}</td>
          <td class="p-3.5">
            <div class="font-bold text-xs text-navy-950">${escapeHtml(p.title)}</div>
            <div class="text-[11px] text-slate-500 truncate max-w-xs mt-0.5">${escapeHtml(p.message)}</div>
            <div class="text-[10px] text-blue-700 font-semibold mt-0.5 flex flex-wrap items-center gap-1.5">
              <span>💰 R$ ${(p.daily_budget_cents ? (p.daily_budget_cents/100).toFixed(2) : '20.00').replace('.', ',')}/dia</span>
              <span>•</span>
              <span>📍 ${escapeHtml(p.target_city || 'Juiz de Fora')} (+${p.target_radius_km || 40}km)</span>
              <span>•</span>
              <span>👥 ${p.target_age_min || 25}-${p.target_age_max || 65}a</span>
              <span>•</span>
              <span class="text-slate-600 font-bold">${endDateLabel}</span>
            </div>
            <div class="text-[10px] text-slate-400 font-mono mt-0.5">${p.meta_ad_id ? `ID Meta: ${p.meta_ad_id}` : `Ref: #${p.id}`}</div>
          </td>
          <td class="p-3.5">${destBadge}</td>
          <td class="p-3.5">${statusBadge}</td>
          <td class="p-3.5 text-[11px] text-slate-500">${dateStr}</td>
          <td class="p-3.5 text-right space-x-1 whitespace-nowrap">
            ${p.destination_type === 'AD_DRAFT_PAUSED' ? `
              <button onclick="toggleMetaPostStatus('${p.id}')" class="px-2.5 py-1.5 rounded-xl ${(p.ad_status === 'ACTIVE' || p.status === 'ACTIVE') ? 'bg-amber-100 text-amber-900 hover:bg-amber-200' : 'bg-emerald-100 text-emerald-900 hover:bg-emerald-200'} font-bold text-xs transition-colors inline-flex items-center gap-1 cursor-pointer" title="${(p.ad_status === 'ACTIVE' || p.status === 'ACTIVE') ? 'Pausar anúncio' : 'Ativar veiculação do anúncio'}">
                <span>${(p.ad_status === 'ACTIVE' || p.status === 'ACTIVE') ? '⏸️ Pausar' : '▶️ Ativar'}</span>
              </button>
            ` : ''}
            <button type="button" onclick="startMetaPostPublish('${p.id}')" class="px-2.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs transition-all inline-flex items-center gap-1 cursor-pointer shadow-2xs" title="Publicar este material no Meta Business Suite / Instagram">
              <span>🚀</span><span>Publicar</span>
            </button>
            <button onclick="loadMetaPostIntoForm('${p.id}')" class="px-2.5 py-1.5 rounded-xl bg-blue-50 text-blue-700 hover:bg-blue-100 font-bold text-xs transition-colors inline-flex items-center gap-1 cursor-pointer" title="Carregar este material no formulário">
              <span>🔁</span><span>Usar</span>
            </button>
            <button onclick="previewMetaPost('${p.id}')" class="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 transition-colors cursor-pointer" title="Ver Detalhes e Copiar Legenda">
              👁️
            </button>
            <button onclick="deleteMetaPost('${p.id}', '${escapeHtml(p.title)}')" class="p-1.5 rounded-lg text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer" title="Excluir Material">
              🗑️
            </button>
          </td>
        </tr>
      `;
    }).join('');
  }

  // --------------------------------------------------------------------------
  // 4. LIVE MOCKUP & VERIFICADOR DE COMPLIANCE ÉTICO EM TEMPO REAL
  // --------------------------------------------------------------------------
  function initLiveMockupListeners() {
    const titleInput = document.getElementById('meta-ad-title');
    const msgInput = document.getElementById('meta-ad-message');
    const linkInput = document.getElementById('meta-ad-link');
    const ctaSelect = document.getElementById('meta-ad-cta');
    const mediaInput = document.getElementById('meta-ad-media');

    if (titleInput) titleInput.addEventListener('input', updateMockupAndCompliance);
    if (msgInput) msgInput.addEventListener('input', updateMockupAndCompliance);
    if (linkInput) linkInput.addEventListener('input', updateMockupAndCompliance);
    if (ctaSelect) ctaSelect.addEventListener('change', updateMockupAndCompliance);

    if (mediaInput) {
      mediaInput.addEventListener('change', handleMediaPreview);
    }
  }

  function handleMediaPreview(e) {
    const file = e.target.files && e.target.files[0];
    const previewContainer = document.getElementById('mockup-media-container');
    const thumbName = document.getElementById('meta-media-filename-display');

    if (!file) {
      if (thumbName) thumbName.innerText = 'Nenhum arquivo selecionado';
      if (previewContainer) {
        previewContainer.innerHTML = `
          <div class="w-full h-44 bg-gradient-to-br from-slate-100 to-slate-200 flex flex-col items-center justify-center text-slate-400 text-xs gap-1 border-y border-slate-200">
            <span class="text-2xl">🖼️</span>
            <span>Prévia da Imagem / Vídeo</span>
          </div>
        `;
      }
      return;
    }

    if (thumbName) thumbName.innerText = `${file.name} (${(file.size / 1024 / 1024).toFixed(2)} MB)`;

    const url = URL.createObjectURL(file);
    if (previewContainer) {
      if (file.type.startsWith('video/')) {
        previewContainer.innerHTML = `
          <video src="${url}" controls class="w-full h-52 object-cover bg-black border-y border-slate-200"></video>
        `;
      } else {
        previewContainer.innerHTML = `
          <img src="${url}" alt="Prévia" class="w-full h-52 object-cover border-y border-slate-200">
        `;
      }
    }
  }

  function updateMockupAndCompliance() {
    const title = (document.getElementById('meta-ad-title')?.value || '').trim();
    const msg = (document.getElementById('meta-ad-message')?.value || '').trim();
    const link = (document.getElementById('meta-ad-link')?.value || '').trim();
    const cta = document.getElementById('meta-ad-cta')?.value || 'LEARN_MORE';

    // 1. Atualiza elementos no Mockup
    const mockHeadline = document.getElementById('mockup-headline-text');
    const mockBody = document.getElementById('mockup-body-text');
    const mockLink = document.getElementById('mockup-link-text');
    const mockCta = document.getElementById('mockup-cta-btn');

    if (mockHeadline) mockHeadline.innerText = title || 'Título do Anúncio (Headline)';
    if (mockBody) mockBody.innerText = msg || 'Texto descritivo do material que aparecerá no feed dos usuários do Facebook e Instagram.';
    if (mockLink) {
      try {
        const u = new URL(link || 'https://jorgealvimadvocacia.com.br');
        mockLink.innerText = u.hostname.toUpperCase();
      } catch (_) {
        mockLink.innerText = 'JORGEALVIMADVOCACIA.COM.BR';
      }
    }

    const ctaLabels = {
      'LEARN_MORE': 'Saiba mais',
      'CONTACT_US': 'Fale conosco',
      'MESSAGE_PAGE': 'Enviar mensagem',
      'SIGN_UP': 'Cadastre-se',
      'APPLY_NOW': 'Inscrever-se'
    };
    if (mockCta) mockCta.innerText = ctaLabels[cta] || 'Saiba mais';

    // 2. Debounce na checagem de compliance ético OAB
    clearTimeout(complianceTimer);
    complianceTimer = setTimeout(() => {
      runComplianceCheck(title, msg);
    }, 250);
  }

  async function runComplianceCheck(title, message) {
    const box = document.getElementById('meta-compliance-box');
    if (!box) return;

    const token = getAuthToken();
    try {
      const res = await fetch('/api/meta-ads/compliance-check', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ title, message })
      });
      const data = await res.json();

      if (data.compliant) {
        box.className = 'p-3 rounded-2xl bg-emerald-50 border border-emerald-200 text-xs space-y-1 transition-all';
        box.innerHTML = `
          <div class="flex items-center gap-1.5 text-emerald-800 font-bold">
            <span>🛡️</span>
            <span>Conformidade Ética OAB & Diretrizes Meta: APROVADO</span>
          </div>
          <p class="text-[11px] text-emerald-700">O texto respeita o caráter informativo do Provimento 205/2021 da OAB e as políticas antidiscriminação da Meta.</p>
        `;
      } else {
        box.className = 'p-3 rounded-2xl bg-amber-50 border border-amber-300 text-xs space-y-1 transition-all';
        box.innerHTML = `
          <div class="flex items-center gap-1.5 text-amber-900 font-bold">
            <span>⚠️</span>
            <span>Atenção: Termos Sujeitos a Restrição Ética / Reprovação</span>
          </div>
          <ul class="list-disc list-inside text-[11px] text-amber-800 space-y-0.5">
            ${data.warnings.map(w => `<li>${escapeHtml(w)}</li>`).join('')}
          </ul>
        `;
      }
    } catch (_) {
      // Fallback local caso offline
    }
  }

  // --------------------------------------------------------------------------
  // 5. CONTROLE DINÂMICO DE ORÇAMENTO E SEGMENTAÇÃO DE PÚBLICO
  // --------------------------------------------------------------------------
  function setMetaDailyBudget(amount) {
    const input = document.getElementById('meta-ad-budget-input');
    if (input) input.value = amount;

    document.querySelectorAll('.meta-budget-chip').forEach(btn => {
      const isMatch = btn.innerText.includes(`R$ ${amount}/`);
      if (isMatch) {
        btn.classList.add('active', 'border-2', 'border-blue-600', 'bg-blue-50', 'text-blue-800', 'shadow-2xs');
        btn.classList.remove('border-slate-200', 'bg-white', 'text-slate-700');
      } else {
        btn.classList.remove('active', 'border-2', 'border-blue-600', 'bg-blue-50', 'text-blue-800', 'shadow-2xs');
        btn.classList.add('border-slate-200', 'bg-white', 'text-slate-700');
      }
    });

    calculateAndRenderMetaBudget(amount);
  }

  function onMetaBudgetInputChange(val) {
    const parsed = parseFloat(val);
    document.querySelectorAll('.meta-budget-chip').forEach(btn => {
      const isMatch = btn.innerText.includes(`R$ ${parsed}/`);
      if (isMatch) {
        btn.classList.add('active', 'border-2', 'border-blue-600', 'bg-blue-50', 'text-blue-800', 'shadow-2xs');
        btn.classList.remove('border-slate-200', 'bg-white', 'text-slate-700');
      } else {
        btn.classList.remove('active', 'border-2', 'border-blue-600', 'bg-blue-50', 'text-blue-800', 'shadow-2xs');
        btn.classList.add('border-slate-200', 'bg-white', 'text-slate-700');
      }
    });
    calculateAndRenderMetaBudget(val);
  }

  function calculateAndRenderMetaBudget(val) {
    const amount = Math.max(6, parseFloat(val) || 20);
    const badge = document.getElementById('meta-budget-display-badge');
    const pill = document.getElementById('mockup-budget-pill');
    const reachDisplay = document.getElementById('meta-reach-calc-display');
    const reachSummary = document.getElementById('mockup-reach-summary');
    const monthlyDisplay = document.getElementById('meta-monthly-calc-display');

    const formatted = `R$ ${amount.toFixed(2).replace('.', ',')} / dia`;
    if (badge) badge.innerText = formatted;
    if (pill) pill.innerText = `R$ ${amount.toFixed(2).replace('.', ',')}/dia`;

    // CPM médio de advocacia/serviços no Brasil: R$ 8 a R$ 18 por mil impressões
    const reachMin = Math.round((amount / 16) * 1000).toLocaleString('pt-BR');
    const reachMax = Math.round((amount / 6.5) * 1000).toLocaleString('pt-BR');
    const reachText = `${reachMin} a ${reachMax} pessoas/dia`;
    const reachShort = `${reachMin} - ${reachMax}`;

    if (reachDisplay) reachDisplay.innerText = reachText;
    if (reachSummary) reachSummary.innerText = reachShort;

    const monthlyTotal = (amount * 30).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    if (monthlyDisplay) monthlyDisplay.innerText = monthlyTotal;
  }

  function toggleMetaInterestChip(btn, interestName) {
    if (!btn) return;
    const isActive = btn.classList.contains('active');
    if (isActive) {
      btn.classList.remove('active', 'border-blue-500', 'bg-blue-100', 'text-blue-800', 'shadow-2xs');
      btn.classList.add('border-slate-200', 'bg-white', 'text-slate-700');
    } else {
      btn.classList.add('active', 'border-blue-500', 'bg-blue-100', 'text-blue-800', 'shadow-2xs');
      btn.classList.remove('border-slate-200', 'bg-white', 'text-slate-700');
    }
    syncMetaAudienceMockup();
  }

  function syncMetaAudienceMockup() {
    const goalSelect = document.getElementById('meta-ad-goal');
    const cityInput = document.getElementById('meta-ad-city');
    const radiusSelect = document.getElementById('meta-ad-radius');
    const ageMinSelect = document.getElementById('meta-ad-age-min');
    const ageMaxSelect = document.getElementById('meta-ad-age-max');
    const genderSelect = document.getElementById('meta-ad-gender');

    const goalSummary = document.getElementById('mockup-goal-summary');
    const geoSummary = document.getElementById('mockup-geo-summary');
    const ageSummary = document.getElementById('mockup-age-summary');
    const interestsContainer = document.getElementById('mockup-interests-summary');

    if (goalSummary && goalSelect) {
      const goalMap = {
        'OUTCOME_LEADS': 'Leads & WhatsApp',
        'OUTCOME_TRAFFIC': 'Tráfego no Site',
        'OUTCOME_AWARENESS': 'Reconhecimento'
      };
      goalSummary.innerText = goalMap[goalSelect.value] || 'Leads & WhatsApp';
    }

    if (geoSummary) {
      const city = cityInput && cityInput.value.trim() ? cityInput.value.trim() : 'Juiz de Fora';
      const rad = radiusSelect ? radiusSelect.value : '40';
      let radText = `(+${rad}km)`;
      if (rad === '0') radText = '(Estado de MG)';
      if (rad === '-1') radText = '(Brasil Inteiro)';
      geoSummary.innerText = `${city} ${radText}`;
    }

    if (ageSummary) {
      const min = ageMinSelect ? ageMinSelect.value : '25';
      const max = ageMaxSelect ? ageMaxSelect.value : '65';
      const gen = genderSelect ? genderSelect.value : 'ALL';
      const genText = gen === 'WOMEN' ? 'Mulheres' : gen === 'MEN' ? 'Homens' : 'Todos';
      ageSummary.innerText = `${min} a ${max} anos (${genText})`;
    }

    if (interestsContainer) {
      const activeBtns = document.querySelectorAll('#meta-interests-chips-container .meta-interest-chip.active');
      if (activeBtns.length === 0) {
        interestsContainer.innerHTML = `<span class="text-slate-400 italic">Geral / Amplo (sem filtro de nicho)</span>`;
      } else {
        interestsContainer.innerHTML = Array.from(activeBtns).map(btn => {
          return `<span class="px-2 py-0.5 rounded-md bg-blue-100 text-blue-800 font-semibold">${btn.innerText.trim()}</span>`;
        }).join('');
      }
    }
  }

  // --------------------------------------------------------------------------
  // 6. ENVIO DO FORMULÁRIO (UPLOAD & CRIAÇÃO)
  // --------------------------------------------------------------------------
  async function handleMetaAdSubmit(e) {
    if (e && e.preventDefault) e.preventDefault();

    const titleInput = document.getElementById('meta-ad-title');
    const msgInput = document.getElementById('meta-ad-message');
    const linkInput = document.getElementById('meta-ad-link');
    const ctaSelect = document.getElementById('meta-ad-cta');
    const destSelect = document.getElementById('meta-ad-destination');
    const mediaInput = document.getElementById('meta-ad-media');
    const submitBtn = document.getElementById('btn-submit-meta-ad');

    const budgetInput = document.getElementById('meta-ad-budget-input');
    const goalSelect = document.getElementById('meta-ad-goal');
    const cityInput = document.getElementById('meta-ad-city');
    const radiusSelect = document.getElementById('meta-ad-radius');
    const ageMinSelect = document.getElementById('meta-ad-age-min');
    const ageMaxSelect = document.getElementById('meta-ad-age-max');
    const genderSelect = document.getElementById('meta-ad-gender');

    const title = titleInput ? titleInput.value.trim() : '';
    const message = msgInput ? msgInput.value.trim() : '';

    if (!title || !message) {
      toast('Por favor, informe o título e o texto da publicação.', 'error');
      return;
    }

    const activeInterests = Array.from(document.querySelectorAll('#meta-interests-chips-container .meta-interest-chip.active'))
      .map(btn => btn.innerText.replace(/^[^\wÀ-ÿ]+/i, '').trim());

    const formData = new FormData();
    formData.append('title', title);
    formData.append('message', message);
    formData.append('link_url', linkInput ? linkInput.value.trim() : '');
    formData.append('call_to_action', ctaSelect ? ctaSelect.value : 'LEARN_MORE');
    formData.append('destination_type', destSelect ? destSelect.value : 'AD_DRAFT_PAUSED');

    // Capa do artigo (URL pública) usada como imagem quando não há upload de mídia — essencial para o feed do Instagram.
    const mediaUrlInput = document.getElementById('meta-ad-media-url');
    if (mediaUrlInput && mediaUrlInput.value.trim()) {
      formData.append('media_url', mediaUrlInput.value.trim());
    }

    // Configuração Ampla de Segmentação e Orçamento
    formData.append('daily_budget', budgetInput ? budgetInput.value : '20');
    formData.append('campaign_goal', goalSelect ? goalSelect.value : 'OUTCOME_LEADS');
    formData.append('target_city', cityInput && cityInput.value.trim() ? cityInput.value.trim() : 'Juiz de Fora');
    formData.append('target_radius_km', radiusSelect ? radiusSelect.value : '40');
    formData.append('target_age_min', ageMinSelect ? ageMinSelect.value : '25');
    formData.append('target_age_max', ageMaxSelect ? ageMaxSelect.value : '65');
    formData.append('target_gender', genderSelect ? genderSelect.value : 'ALL');
    formData.append('target_interests', JSON.stringify(activeInterests));

    // Status do anúncio (Ativo vs Pausado) e Programação com Data Final
    const statusRadio = document.querySelector('input[name="meta_ad_status"]:checked');
    const adStatus = statusRadio ? statusRadio.value : 'ACTIVE';
    formData.append('ad_status', adStatus);

    const scheduleRadio = document.querySelector('input[name="meta_schedule_type"]:checked');
    const scheduleType = scheduleRadio ? scheduleRadio.value : 'CONTINUOUS';
    const startDateInput = document.getElementById('meta-ad-start-date');
    const endDateInput = document.getElementById('meta-ad-end-date');

    if (scheduleType === 'SET_END_DATE') {
      if (startDateInput && startDateInput.value) formData.append('start_date', startDateInput.value);
      if (endDateInput && endDateInput.value) formData.append('end_date', endDateInput.value);
    }

    if (mediaInput && mediaInput.files && mediaInput.files[0]) {
      formData.append('media', mediaInput.files[0]);
    }

    const originalBtnText = submitBtn ? submitBtn.innerHTML : '';
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.innerHTML = '<span>⏳</span><span>Processando no Meta Ads...</span>';
    }

    const token = getAuthToken();

    try {
      const res = await fetch('/api/meta-ads/posts', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        },
        body: formData
      });
      const data = await res.json();

      if (res.ok && data.success) {
        if (typeof window.clearUnsavedChanges === 'function') {
          window.clearUnsavedChanges('tab-content-meta-ads');
        }
        // Verde só quando de fato publicou/enviou à Meta; laranja quando ficou apenas em rascunho.
        toast(data.message || 'Material enviado com sucesso!', data.published ? 'success' : 'warning');
        resetMetaForm();
        await fetchMetaPosts();
      } else {
        toast(data.error || 'Erro ao processar envio para a Meta.', 'error');
      }
    } catch (err) {
      toast('Falha de rede ao conectar com o servidor: ' + err.message, 'error');
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.innerHTML = originalBtnText;
      }
    }
  }

  function resetMetaForm() {
    const form = document.getElementById('form-meta-ad-create');
    if (form) form.reset();
    if (typeof window.clearUnsavedChanges === 'function') {
      window.clearUnsavedChanges('tab-content-meta-ads');
    }
    handleMediaPreview({ target: { files: [] } });
    updateMockupAndCompliance();
    setMetaDailyBudget(20);

    // Resetar chips de interesses para o padrão
    document.querySelectorAll('#meta-interests-chips-container .meta-interest-chip').forEach((btn, idx) => {
      if (idx === 0) {
        btn.classList.add('active', 'border-blue-500', 'bg-blue-100', 'text-blue-800', 'shadow-2xs');
        btn.classList.remove('border-slate-200', 'bg-white', 'text-slate-700');
      } else {
        btn.classList.remove('active', 'border-blue-500', 'bg-blue-100', 'text-blue-800', 'shadow-2xs');
        btn.classList.add('border-slate-200', 'bg-white', 'text-slate-700');
      }
    });

    syncMetaAudienceMockup();
  }

  // --------------------------------------------------------------------------
  // 6. EXCLUSÃO E PRÉ-VISUALIZAÇÃO DE POSTS
  // --------------------------------------------------------------------------
  async function deleteMetaPost(id, title) {
    if (!confirm(`Deseja realmente excluir o material "${title}"?`)) return;

    const token = getAuthToken();
    try {
      const res = await fetch(`/api/meta-ads/posts/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (res.ok && data.success) {
        toast('Material excluído com sucesso!', 'success');
        await fetchMetaPosts();
      } else {
        toast(data.error || 'Erro ao excluir material.', 'error');
      }
    } catch (err) {
      toast('Erro de rede: ' + err.message, 'error');
    }
  }

  function previewMetaPost(id) {
    const post = cachedPosts.find(p => p.id === id);
    if (!post) return;

    const titleEl = document.getElementById('modal-preview-title');
    const bodyEl = document.getElementById('modal-preview-body');
    const modal = document.getElementById('modal-meta-preview');

    if (titleEl) titleEl.innerText = post.title;
    if (bodyEl) {
      bodyEl.innerHTML = `
        <div class="space-y-3 text-xs">
          ${post.media_path ? `<img src="${post.media_path}" class="w-full h-56 object-cover rounded-2xl border border-slate-200">` : ''}
          <div class="p-3 bg-slate-50 rounded-xl border border-slate-200">
            <div class="text-[11px] font-bold text-slate-500 uppercase mb-1">Texto do Criativo</div>
            <p class="text-slate-800 whitespace-pre-wrap">${escapeHtml(post.message)}</p>
          </div>
          <div class="grid grid-cols-2 gap-2 text-[11px]">
            <div class="p-2.5 bg-slate-50 rounded-xl border border-slate-200">
              <span class="text-slate-500 block">Link de Destino:</span>
              <a href="${post.link_url}" target="_blank" class="font-bold text-blue-600 truncate block">${post.link_url}</a>
            </div>
            <div class="p-2.5 bg-slate-50 rounded-xl border border-slate-200">
              <span class="text-slate-500 block">Botão de Ação (CTA):</span>
              <span class="font-bold text-slate-800">${post.call_to_action}</span>
            </div>
            <div class="p-2.5 bg-slate-50 rounded-xl border border-slate-200">
              <span class="text-slate-500 block">ID do Anúncio na Meta:</span>
              <span class="font-mono font-bold text-slate-800">${post.meta_ad_id || 'Modo Simulado'}</span>
            </div>
            <div class="p-2.5 bg-slate-50 rounded-xl border border-slate-200">
              <span class="text-slate-500 block">Status:</span>
              <span class="font-bold text-emerald-700">${post.status}</span>
            </div>
          </div>
          <div class="p-3 bg-blue-50/60 rounded-xl border border-blue-200">
            <div class="text-[11px] font-bold text-blue-900 uppercase mb-1.5 flex items-center gap-1">
              <span>🎯</span><span>Configuração de Segmentação & Orçamento</span>
            </div>
              <div class="grid grid-cols-2 gap-2 text-[11px]">
                <div>
                  <span class="text-slate-500 block">Orçamento Diário:</span>
                  <span class="font-bold text-blue-800 font-mono">R$ ${(post.daily_budget_cents ? (post.daily_budget_cents / 100).toFixed(2) : '20.00').replace('.', ',')}/dia</span>
                </div>
                <div>
                  <span class="text-slate-500 block">Status de Veiculação:</span>
                  <span class="font-bold ${(post.ad_status === 'ACTIVE' || post.status === 'ACTIVE') ? 'text-emerald-700' : 'text-amber-700'}">
                    ${(post.ad_status === 'ACTIVE' || post.status === 'ACTIVE') ? '▶️ Ativo (Veiculando)' : '⏸️ Pausado'}
                  </span>
                </div>
                <div>
                  <span class="text-slate-500 block">Praça / Raio:</span>
                  <span class="font-bold text-slate-800">${escapeHtml(post.target_city || 'Juiz de Fora')} (+${post.target_radius_km || 40}km)</span>
                </div>
                <div>
                  <span class="text-slate-500 block">Programação / Término:</span>
                  <span class="font-bold text-slate-800">${post.end_date ? `🏁 Até ${new Date(post.end_date).toLocaleDateString('pt-BR')}` : `♾️ Veiculação Contínua`}</span>
                </div>
                <div>
                  <span class="text-slate-500 block">Público / Idade:</span>
                  <span class="font-bold text-slate-800">${post.target_age_min || 25} a ${post.target_age_max || 65} anos (${post.target_gender === 'WOMEN' ? 'Mulheres' : post.target_gender === 'MEN' ? 'Homens' : 'Todos'})</span>
                </div>
                <div>
                  <span class="text-slate-500 block">Objetivo:</span>
                  <span class="font-bold text-slate-800">${post.campaign_goal || 'OUTCOME_LEADS'}</span>
                </div>
              </div>
            </div>
          </div>
          ${(post.status === 'SIMULATED_DRAFT' || post.status === 'DRAFT_LOCAL') ? `
          <div class="p-3.5 bg-amber-50/80 border border-amber-200 rounded-2xl text-xs space-y-2 text-amber-900">
            <div class="font-bold flex items-center gap-1.5 text-xs">
              <span class="text-sm">💡</span><span>Pronto para Publicar no Instagram & Facebook</span>
            </div>
            <p class="text-[11px] text-amber-800 leading-relaxed">
              O material foi homologado com ética OAB. Para veicular no feed agora mesmo, clique em <strong>Publicar no Meta Suite</strong> (já abre com seu Instagram e Página prontos para postar) ou configure o Token da API para envio automático sem sair do painel.
            </p>
            <div class="pt-0.5 flex flex-wrap gap-2">
              <button type="button" onclick="closeMetaPreviewModal(); startMetaPostPublish('${post.id}')" class="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[11px] flex items-center gap-1 shadow-xs cursor-pointer">
                <span>🚀</span><span>Publicar no Meta Business Suite</span>
              </button>
              <button type="button" onclick="closeMetaPreviewModal(); openMetaConfigModal();" class="px-3 py-1.5 rounded-xl bg-white border border-amber-300 text-amber-900 hover:bg-amber-100 font-bold text-[11px] flex items-center gap-1">
                <span>⚙️</span><span>Configurar Token da API</span>
              </button>
            </div>
          </div>` : ''}
          <div class="pt-3 flex flex-wrap gap-2 justify-end border-t border-slate-100">
            ${post.destination_type === 'AD_DRAFT_PAUSED' ? `
              <button type="button" onclick="toggleMetaPostStatus('${post.id}'); closeMetaPreviewModal();" class="px-3.5 py-2 rounded-xl ${(post.ad_status === 'ACTIVE' || post.status === 'ACTIVE') ? 'bg-amber-100 text-amber-900 hover:bg-amber-200' : 'bg-emerald-100 text-emerald-900 hover:bg-emerald-200'} font-bold text-xs flex items-center gap-1.5 transition-all cursor-pointer">
                <span>${(post.ad_status === 'ACTIVE' || post.status === 'ACTIVE') ? '⏸️ Pausar Anúncio' : '▶️ Ativar Anúncio'}</span>
              </button>
            ` : ''}
            <button type="button" onclick="copyMetaPostText('${post.id}')" class="px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs flex items-center gap-1.5 transition-all cursor-pointer">
              <span>📋</span><span>Copiar Legenda</span>
            </button>
            ${post.media_path ? `
            <a href="${post.media_path}" target="_blank" download class="px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs flex items-center gap-1.5 transition-all cursor-pointer">
              <span>📥</span><span>Baixar Imagem</span>
            </a>` : ''}
            <button type="button" onclick="closeMetaPreviewModal(); loadMetaPostIntoForm('${post.id}')" class="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs flex items-center gap-1.5 transition-all shadow-sm cursor-pointer">
              <span>🔁</span><span>Carregar no Formulário e Postar</span>
            </button>
          </div>
        </div>
      `;
    }
    if (modal) modal.classList.remove('hidden');
  }

  function copyMetaPostText(id) {
    const post = cachedPosts.find(p => p.id === id);
    if (!post) return;
    const fullText = `${post.title}\n\n${post.message}${post.link_url ? `\n\nSaiba mais: ${post.link_url}` : ''}\n\n⚖️ Jorge Alvim Advocacia | OAB/MG 222.943\n#Direito #Advocacia #JorgeAlvimAdvocacia`;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(fullText).then(() => {
        toast('Legenda copiada com sucesso! Pronto para colar no Instagram ou Facebook (Ctrl+V).', 'success');
      }).catch(() => {
        toast('Não foi possível copiar automaticamente. Selecione e copie o texto.', 'info');
      });
    } else {
      toast('Selecione e copie o texto manualmente.', 'info');
    }
  }

  async function startMetaPostPublish(id) {
    const post = cachedPosts.find(p => p.id === id);
    if (!post) {
      toast('Material não encontrado.', 'error');
      return;
    }

    const token = getAuthToken();
    // 1. Se houver integração com API ativa, tenta publicar direto via servidor
    try {
      const res = await fetch(`/api/meta-ads/posts/${id}/publish`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        }
      });
      const data = await res.json();
      if (res.ok && data.success && !data.requiresToken) {
        toast('🚀 Material publicado na Meta com sucesso!', 'success');
        await fetchMetaPosts();
        return;
      }
    } catch (_) {}

    // 2. Modo Assistido (contingência e facilidade sem precisar digitar nada):
    // Monta texto completo
    const fullText = `${post.title}\n\n${post.message}${post.link_url ? `\n\nSaiba mais: ${post.link_url}` : ''}\n\n⚖️ Jorge Alvim Advocacia | OAB/MG 222.943\n#Direito #Advocacia #JorgeAlvimAdvocacia`;

    // Copia imediatamente para o clipboard
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(fullText);
      }
    } catch (_) {}

    // Dispara download da imagem automaticamente se houver
    if (post.media_path) {
      try {
        const a = document.createElement('a');
        a.href = post.media_path;
        a.download = post.media_path.split('/').pop() || 'criativo-jorge-alvim.png';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      } catch (_) {}
    }

    // Abre modal de assistência
    openMetaPublishAssistModal(post, fullText);
  }

  function openMetaPublishAssistModal(post, fullText) {
    const modal = document.getElementById('modal-meta-publish-assist');
    const body = document.getElementById('modal-publish-assist-body');
    if (!modal || !body) return;

    body.innerHTML = `
      <div class="p-3.5 bg-emerald-50 border border-emerald-200 rounded-2xl text-emerald-900 space-y-1.5">
        <div class="font-bold flex items-center gap-1.5 text-xs">
          <span class="text-base">✅</span><span>Texto e Legenda Copiados para a Área de Transferência!</span>
        </div>
        <p class="text-[11px] text-emerald-800 leading-relaxed">
          O título, texto e dados éticos do escritório já estão na memória do computador. No Facebook/Instagram, basta clicar no campo de texto e apertar <strong>Ctrl + V</strong> (ou botão direito > Colar).
        </p>
      </div>

      ${post.media_path ? `
      <div class="p-3 bg-blue-50 border border-blue-200 rounded-2xl flex items-center justify-between gap-3">
        <div class="flex items-center gap-2.5 min-w-0">
          <img src="${post.media_path}" class="w-12 h-12 object-cover rounded-xl border border-blue-200 flex-shrink-0">
          <div class="min-w-0">
            <div class="font-bold text-blue-950 text-xs truncate">Imagem do Post</div>
            <div class="text-[10px] text-blue-700">Arquivo baixado para anexar na postagem</div>
          </div>
        </div>
        <a href="${post.media_path}" download target="_blank" class="px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-[11px] flex-shrink-0 flex items-center gap-1 cursor-pointer">
          <span>📥</span><span>Baixar Novamente</span>
        </a>
      </div>` : ''}

      <div class="bg-slate-50 border border-slate-200 rounded-2xl p-3.5 space-y-2.5">
        <div class="font-bold text-slate-800 text-xs flex items-center gap-1">
          <span>📋</span><span>Como publicar na Meta em 3 passos:</span>
        </div>
        <div class="space-y-2 text-[11px] text-slate-600">
          <div class="flex items-start gap-2">
            <span class="w-5 h-5 rounded-full bg-blue-100 text-blue-800 font-bold flex items-center justify-center flex-shrink-0 text-[10px]">1</span>
            <div>Volte na aba do <strong>Meta Business Suite</strong> (ou clique no botão azul abaixo).</div>
          </div>
          <div class="flex items-start gap-2">
            <span class="w-5 h-5 rounded-full bg-blue-100 text-blue-800 font-bold flex items-center justify-center flex-shrink-0 text-[10px]">2</span>
            <div>No campo <strong>Texto</strong>, aperte <strong>Ctrl + V</strong> (o texto aparecerá na hora na prévia!).</div>
          </div>
          ${post.media_path ? `
          <div class="flex items-start gap-2">
            <span class="w-5 h-5 rounded-full bg-blue-100 text-blue-800 font-bold flex items-center justify-center flex-shrink-0 text-[10px]">3</span>
            <div>Clique em <strong>"Adicionar foto/vídeo"</strong> e escolha a imagem baixada.</div>
          </div>` : ''}
          <div class="flex items-start gap-2">
            <span class="w-5 h-5 rounded-full bg-blue-100 text-blue-800 font-bold flex items-center justify-center flex-shrink-0 text-[10px]">${post.media_path ? '4' : '3'}</span>
            <div>Clique no botão azul <strong>"Publicar"</strong> no canto da tela da Meta!</div>
          </div>
        </div>
      </div>

      <div class="space-y-2 pt-1">
        <a href="https://business.facebook.com/latest/composer?business_id=670238677973768" target="_blank" rel="noopener noreferrer" class="w-full py-2.5 px-4 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-sm cursor-pointer">
          <span>🚀</span><span>Ir para o Criador no Meta Business Suite</span>
        </a>
        <div class="grid grid-cols-2 gap-2">
          <button type="button" onclick="copyMetaPostText('${post.id}')" class="py-2 px-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-[11px] flex items-center justify-center gap-1 cursor-pointer">
            <span>📋</span><span>Copiar Texto Novamente</span>
          </button>
          <button type="button" onclick="markMetaPostAsPublished('${post.id}')" class="py-2 px-3 rounded-xl bg-emerald-100 hover:bg-emerald-200 text-emerald-900 font-bold text-[11px] flex items-center justify-center gap-1 cursor-pointer">
            <span>✅</span><span>Marcar como Publicado</span>
          </button>
        </div>
      </div>
    `;

    modal.classList.remove('hidden');
  }

  function closeMetaPublishAssistModal() {
    const modal = document.getElementById('modal-meta-publish-assist');
    if (modal) modal.classList.add('hidden');
  }

  async function markMetaPostAsPublished(id) {
    const token = getAuthToken();
    try {
      const res = await fetch(`/api/meta-ads/posts/${id}/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ status: 'PUBLISHED' })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        toast('✅ Material marcado como PUBLICADO no painel!', 'success');
        closeMetaPublishAssistModal();
        await fetchMetaPosts();
      } else {
        toast(data.error || 'Erro ao atualizar status.', 'error');
      }
    } catch (err) {
      toast('Falha de rede: ' + err.message, 'error');
    }
  }

  function loadMetaPostIntoForm(id) {
    const post = cachedPosts.find(p => p.id === id);
    if (!post) return;

    const titleInput = document.getElementById('meta-ad-title');
    const msgInput = document.getElementById('meta-ad-message');
    const linkInput = document.getElementById('meta-ad-link');
    const destSelect = document.getElementById('meta-ad-destination');
    const ctaSelect = document.getElementById('meta-ad-cta');
    const budgetInput = document.getElementById('meta-ad-budget-input');
    const cityInput = document.getElementById('meta-ad-city');
    const radiusSelect = document.getElementById('meta-ad-radius');
    const ageMinSelect = document.getElementById('meta-ad-age-min');
    const ageMaxSelect = document.getElementById('meta-ad-age-max');
    const genderSelect = document.getElementById('meta-ad-gender');

    if (titleInput) titleInput.value = post.title || '';
    if (msgInput) msgInput.value = post.message || '';
    if (linkInput) linkInput.value = post.link_url || 'https://jorgealvimadvocacia.com.br';
    if (destSelect) destSelect.value = post.destination_type || 'FACEBOOK_PAGE_POST';
    if (ctaSelect) ctaSelect.value = post.call_to_action || 'LEARN_MORE';

    if (budgetInput && post.daily_budget_cents) {
      const budgetReais = Math.round(post.daily_budget_cents / 100);
      budgetInput.value = budgetReais;
      if (typeof setMetaDailyBudget === 'function') {
        setMetaDailyBudget(budgetReais);
      }
    }
    if (cityInput && post.target_city) cityInput.value = post.target_city;
    if (radiusSelect && post.target_radius_km) radiusSelect.value = post.target_radius_km;
    if (ageMinSelect && post.target_age_min) ageMinSelect.value = post.target_age_min;
    if (ageMaxSelect && post.target_age_max) ageMaxSelect.value = post.target_age_max;
    if (genderSelect && post.target_gender) genderSelect.value = post.target_gender;

    const previewContainer = document.getElementById('mockup-media-container');
    const thumbName = document.getElementById('meta-media-filename-display');
    if (post.media_path && previewContainer) {
      if (post.media_type === 'video') {
        previewContainer.innerHTML = `<video src="${post.media_path}" controls class="w-full h-52 object-cover border-y border-slate-200"></video>`;
      } else {
        previewContainer.innerHTML = `<img src="${post.media_path}" alt="${escapeHtml(post.title)}" class="w-full h-52 object-cover border-y border-slate-200">`;
      }
      if (thumbName) thumbName.innerText = `Mídia importada: ${post.title.slice(0, 30)}...`;
    }

    if (post.ad_status) {
      const radActive = document.querySelector('input[name="meta_ad_status"][value="ACTIVE"]');
      const radPaused = document.querySelector('input[name="meta_ad_status"][value="PAUSED"]');
      if (post.ad_status === 'PAUSED') {
        if (radPaused) radPaused.checked = true;
        onMetaStatusChange('PAUSED');
      } else {
        if (radActive) radActive.checked = true;
        onMetaStatusChange('ACTIVE');
      }
    }

    if (post.end_date) {
      const radEnd = document.querySelector('input[name="meta_schedule_type"][value="SET_END_DATE"]');
      if (radEnd) radEnd.checked = true;
      toggleMetaScheduleMode('SET_END_DATE');
      const startInput = document.getElementById('meta-ad-start-date');
      const endInput = document.getElementById('meta-ad-end-date');
      if (startInput && post.start_date) startInput.value = post.start_date;
      if (endInput && post.end_date) endInput.value = post.end_date;
      calcTotalAdInvestment();
    } else {
      const radCont = document.querySelector('input[name="meta_schedule_type"][value="CONTINUOUS"]');
      if (radCont) radCont.checked = true;
      toggleMetaScheduleMode('CONTINUOUS');
    }

    updateMockupAndCompliance();
    syncMetaAudienceMockup();

    const formEl = document.getElementById('form-meta-ad-create');
    if (formEl) {
      formEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    toast('Material carregado no formulário! Escolha o canal e clique no botão de postar.', 'success');
  }

  function closeMetaPreviewModal() {
    const modal = document.getElementById('modal-meta-preview');
    if (modal) modal.classList.add('hidden');
  }

  // --------------------------------------------------------------------------
  // CONTROLE DE STATUS (ATIVO vs PAUSADO) E PROGRAMAÇÃO COM DATA FINAL
  // --------------------------------------------------------------------------
  function onMetaStatusChange(status) {
    const lblActive = document.getElementById('label-status-active');
    const lblPaused = document.getElementById('label-status-paused');
    const indicator = document.getElementById('meta-status-badge-indicator');
    const helpText = document.getElementById('meta-status-help-text');
    const btnText = document.getElementById('btn-submit-meta-text');

    if (status === 'ACTIVE') {
      if (lblActive) {
        lblActive.className = 'flex items-center gap-2 p-2.5 rounded-xl border-2 border-emerald-500 bg-emerald-50/60 cursor-pointer text-xs font-bold text-emerald-950 transition-all';
      }
      if (lblPaused) {
        lblPaused.className = 'flex items-center gap-2 p-2.5 rounded-xl border border-slate-200 bg-white cursor-pointer text-xs font-semibold text-slate-700 transition-all';
      }
      if (indicator) {
        indicator.className = 'text-[10px] text-emerald-700 font-bold bg-emerald-100/80 px-2 py-0.5 rounded-full';
        indicator.innerText = '▶️ Modo Ativo';
      }
      if (helpText) {
        helpText.innerHTML = '<strong>Modo Ativo:</strong> O anúncio começará a veicular na conta da Meta assim que for aprovado.';
      }
      if (btnText) {
        btnText.innerText = 'Publicar Anúncio no Meta Ads (Campanha ATIVA)';
      }
    } else {
      if (lblActive) {
        lblActive.className = 'flex items-center gap-2 p-2.5 rounded-xl border border-slate-200 bg-white cursor-pointer text-xs font-semibold text-slate-700 transition-all';
      }
      if (lblPaused) {
        lblPaused.className = 'flex items-center gap-2 p-2.5 rounded-xl border-2 border-amber-500 bg-amber-50/60 cursor-pointer text-xs font-bold text-amber-950 transition-all';
      }
      if (indicator) {
        indicator.className = 'text-[10px] text-amber-800 font-bold bg-amber-100/80 px-2 py-0.5 rounded-full';
        indicator.innerText = '⏸️ Modo Pausado';
      }
      if (helpText) {
        helpText.innerHTML = '<strong>Modo Pausado:</strong> O anúncio será salvo como rascunho pausado no Gerenciador para revisão antes de ligar.';
      }
      if (btnText) {
        btnText.innerText = 'Salvar Rascunho no Meta Ads (PAUSADO)';
      }
    }
  }

  function toggleMetaScheduleMode(mode) {
    const lblCont = document.getElementById('label-sched-continuous');
    const lblEnd = document.getElementById('label-sched-enddate');
    const container = document.getElementById('meta-schedule-dates-container');
    const startInput = document.getElementById('meta-ad-start-date');
    const endInput = document.getElementById('meta-ad-end-date');

    if (mode === 'SET_END_DATE') {
      if (lblCont) lblCont.className = 'flex items-center gap-2 p-2 rounded-xl border border-slate-200 bg-white cursor-pointer text-xs font-semibold text-slate-700';
      if (lblEnd) lblEnd.className = 'flex items-center gap-2 p-2 rounded-xl border-2 border-blue-500 bg-blue-50/50 cursor-pointer text-xs font-bold text-blue-950';
      if (container) container.classList.remove('hidden');

      const today = new Date();
      if (startInput && !startInput.value) {
        startInput.value = today.toISOString().split('T')[0];
      }
      if (endInput && !endInput.value) {
        const in15Days = new Date(today);
        in15Days.setDate(today.getDate() + 15);
        endInput.value = in15Days.toISOString().split('T')[0];
      }
      calcTotalAdInvestment();
    } else {
      if (lblCont) lblCont.className = 'flex items-center gap-2 p-2 rounded-xl border-2 border-blue-500 bg-blue-50/50 cursor-pointer text-xs font-bold text-blue-950';
      if (lblEnd) lblEnd.className = 'flex items-center gap-2 p-2 rounded-xl border border-slate-200 bg-white cursor-pointer text-xs font-semibold text-slate-700';
      if (container) container.classList.add('hidden');
    }
  }

  function setAdDurationDays(days) {
    const startInput = document.getElementById('meta-ad-start-date');
    const endInput = document.getElementById('meta-ad-end-date');
    const today = new Date();
    if (startInput) startInput.value = today.toISOString().split('T')[0];
    if (endInput) {
      const target = new Date(today);
      target.setDate(today.getDate() + days);
      endInput.value = target.toISOString().split('T')[0];
    }
    calcTotalAdInvestment();
  }

  function calcTotalAdInvestment() {
    const startInput = document.getElementById('meta-ad-start-date');
    const endInput = document.getElementById('meta-ad-end-date');
    const budgetInput = document.getElementById('meta-ad-budget-input');
    const totalEl = document.getElementById('meta-total-budget-val');
    if (!startInput || !endInput || !budgetInput || !totalEl) return;

    const dailyVal = parseFloat(budgetInput.value) || 20;
    const d1 = new Date(startInput.value);
    const d2 = new Date(endInput.value);
    if (isNaN(d1) || isNaN(d2) || d2 <= d1) {
      totalEl.innerText = `R$ ${(dailyVal * 7).toFixed(2).replace('.', ',')} (mínimo 7d)`;
      return;
    }
    const diffTime = Math.abs(d2 - d1);
    const diffDays = Math.max(1, Math.ceil(diffTime / (1000 * 60 * 60 * 24)));
    const total = diffDays * dailyVal;
    totalEl.innerText = `R$ ${total.toFixed(2).replace('.', ',')} (${diffDays} dias a R$ ${dailyVal}/dia)`;
  }

  function onMetaDestinationSelectChange(dest) {
    const btnText = document.getElementById('btn-submit-meta-text');
    if (!btnText) return;
    if (dest === 'AD_DRAFT_PAUSED') {
      const statusRadio = document.querySelector('input[name="meta_ad_status"]:checked');
      btnText.innerText = (statusRadio && statusRadio.value === 'PAUSED')
        ? 'Salvar Rascunho no Meta Ads (PAUSADO)'
        : 'Publicar Anúncio no Meta Ads (Campanha ATIVA)';
    } else if (dest === 'INSTAGRAM_FEED') {
      btnText.innerText = 'Publicar no Instagram (@jorgealvim10advocacia)';
    } else if (dest === 'FACEBOOK_PAGE_POST') {
      btnText.innerText = 'Publicar na Página do Facebook';
    } else {
      btnText.innerText = 'Salvar Rascunho no Sistema';
    }
  }

  async function toggleMetaPostStatus(id) {
    const post = cachedPosts.find(p => p.id === id);
    if (!post) return;

    const isCurrentlyActive = (post.ad_status === 'ACTIVE' || post.status === 'ACTIVE');
    const nextStatus = isCurrentlyActive ? 'PAUSED' : 'ACTIVE';
    const actionLabel = isCurrentlyActive ? 'pausar' : 'ativar';

    if (!confirm(`Deseja realmente ${actionLabel} a veiculação do anúncio "${post.title}"?`)) return;

    const token = getAuthToken();
    try {
      const res = await fetch(`/api/meta-ads/posts/${id}/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ status: nextStatus })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        toast(data.message || `Status alterado para ${nextStatus}!`, 'success');
        await fetchMetaPosts();
      } else {
        toast(data.error || 'Erro ao alterar status.', 'error');
      }
    } catch (err) {
      toast('Falha de rede ao alterar status: ' + err.message, 'error');
    }
  }

  // --------------------------------------------------------------------------
  // 7. MODAL DE CONFIGURAÇÕES DA META API
  // --------------------------------------------------------------------------
  function openMetaConfigModal() {
    const modal = document.getElementById('modal-meta-config');
    if (!modal) return;

    if (cachedConfig) {
      const fToken = document.getElementById('meta-cfg-token');
      const fAct = document.getElementById('meta-cfg-ad-account');
      const fPage = document.getElementById('meta-cfg-page-id');
      const fInsta = document.getElementById('meta-cfg-insta-id');
      const fAdset = document.getElementById('meta-cfg-default-adset');

      if (fToken && !fToken.value && cachedConfig.hasToken) fToken.placeholder = '•••••••••••••••••••••• (Token Ativo)';
      if (fAct) fAct.value = cachedConfig.adAccountId || '';
      if (fPage) fPage.value = cachedConfig.pageId || '';
      if (fInsta) fInsta.value = cachedConfig.instagramAccountId || '';
      if (fAdset) fAdset.value = cachedConfig.defaultAdsetId || '';
    }

    modal.classList.remove('hidden');
  }

  function closeMetaConfigModal() {
    if (typeof window.hasUnsavedChangesIn === 'function' && window.hasUnsavedChangesIn('modal-meta-config')) {
      if (!confirm('⚠️ Você possui alterações não salvas nas configurações da API Meta.\n\nDeseja fechar sem salvar?')) {
        return;
      }
      if (typeof window.clearUnsavedChanges === 'function') {
        window.clearUnsavedChanges('modal-meta-config');
      }
    }
    const modal = document.getElementById('modal-meta-config');
    if (modal) modal.classList.add('hidden');
  }

  async function handleMetaConfigSave(e) {
    if (e && e.preventDefault) e.preventDefault();

    const tokenInput = document.getElementById('meta-cfg-token');
    const actInput = document.getElementById('meta-cfg-ad-account');
    const pageInput = document.getElementById('meta-cfg-page-id');
    const instaInput = document.getElementById('meta-cfg-insta-id');
    const adsetInput = document.getElementById('meta-cfg-default-adset');

    const payload = {
      systemUserToken: tokenInput ? tokenInput.value.trim() : '',
      adAccountId: actInput ? actInput.value.trim() : '',
      pageId: pageInput ? pageInput.value.trim() : '',
      instagramAccountId: instaInput ? instaInput.value.trim() : '',
      defaultAdsetId: adsetInput ? adsetInput.value.trim() : ''
    };

    const token = getAuthToken();

    try {
      const res = await fetch('/api/meta-ads/config', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      });
      const data = await res.json();

      if (res.ok && data.success) {
        if (typeof window.clearUnsavedChanges === 'function') {
          window.clearUnsavedChanges('modal-meta-config');
        }
        toast('Configurações da Meta salvas com sucesso!', 'success');
        closeMetaConfigModal();
        await fetchMetaConfig();
      } else {
        toast(data.error || 'Erro ao salvar configurações.', 'error');
      }
    } catch (err) {
      toast('Erro de rede: ' + err.message, 'error');
    }
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

  // --------------------------------------------------------------------------
  // INTEGRAÇÃO BLOG -> META MARKETING (Instagram & Facebook)
  // --------------------------------------------------------------------------
  function loadArticleIntoMetaMarketing(post) {
    if (!post) return;
    if (typeof window.switchTab === 'function') {
      window.switchTab('meta-ads');
    }

    const titleInput = document.getElementById('meta-ad-title');
    const msgInput = document.getElementById('meta-ad-message');
    const linkInput = document.getElementById('meta-ad-link');
    const destSelect = document.getElementById('meta-ad-destination');
    const ctaSelect = document.getElementById('meta-ad-cta');
    const mediaUrlInput = document.getElementById('meta-ad-media-url');

    const origin = window.location.origin || 'https://jorgealvimadvocacia.com.br';
    const articleUrl = `${origin}/blog/${post.slug}`;

    if (titleInput) titleInput.value = post.title || '';
    if (linkInput) linkInput.value = articleUrl;
    if (destSelect) destSelect.value = 'INSTAGRAM_FEED';
    if (ctaSelect) ctaSelect.value = 'LEARN_MORE';
    // Guarda a capa do artigo para ser enviada como imagem da publicação (IG exige imagem).
    if (mediaUrlInput) mediaUrlInput.value = post.cover_image || '';

    const cleanSummary = (post.summary || post.title || '').trim();
    const copy = `📢 NOVO ARTIGO JURÍDICO:\n\n${cleanSummary}\n\n👉 Acesse o artigo completo em nosso blog oficial:\n${articleUrl}\n\n⚖️ Jorge Alvim Advocacia & Consultoria Jurídica\n📍 Benfica — Juiz de Fora - MG\n#direito #advocacia #juizdefora #jorgealvim #noticiasjuridicas`;

    if (msgInput) msgInput.value = copy;

    const previewContainer = document.getElementById('mockup-media-container');
    const thumbName = document.getElementById('meta-media-filename-display');
    if (post.cover_image && previewContainer) {
      previewContainer.innerHTML = `<img src="${post.cover_image}" alt="${escapeHtml(post.title)}" class="w-full h-52 object-cover border-y border-slate-200">`;
      if (thumbName) thumbName.innerText = `Capa do artigo importada: ${post.title.slice(0, 30)}...`;
    }

    updateMockupAndCompliance();
    toast('Artigo carregado no Hub de Marketing! Escolha o destino (Instagram ou Facebook) e revise a prévia.', 'success');
  }

  // --------------------------------------------------------------------------
  // Ações Rápidas de Destino e Publicação
  // --------------------------------------------------------------------------
  function quickSetDestinationAndFocus(dest) {
    const destSelect = document.getElementById('meta-ad-destination');
    if (destSelect) {
      destSelect.value = dest;
    }
    const mediaInput = document.getElementById('meta-ad-media');
    if (mediaInput) {
      mediaInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    const destNames = {
      'INSTAGRAM_FEED': 'Instagram Feed',
      'FACEBOOK_PAGE_POST': 'Página do Facebook',
      'AD_DRAFT_PAUSED': 'Meta Ads (Anúncio Pago)'
    };
    toast(`Destino selecionado: ${destNames[dest] || dest}. Selecione ou revise a mídia e a mensagem!`, 'info');
  }

  function submitMetaWithDestination(dest) {
    const destSelect = document.getElementById('meta-ad-destination');
    if (destSelect) {
      destSelect.value = dest;
    }
    handleMetaAdSubmit();
  }

  // --------------------------------------------------------------------------
  // Expor Globalmente no Escopo do Window
  // --------------------------------------------------------------------------
  window.loadMetaAdsTab = loadMetaAdsTab;
  window.handleMetaAdSubmit = handleMetaAdSubmit;
  window.submitMetaWithDestination = submitMetaWithDestination;
  window.quickSetDestinationAndFocus = quickSetDestinationAndFocus;
  window.resetMetaForm = resetMetaForm;
  window.deleteMetaPost = deleteMetaPost;
  window.previewMetaPost = previewMetaPost;
  window.closeMetaPreviewModal = closeMetaPreviewModal;
  window.openMetaConfigModal = openMetaConfigModal;
  window.closeMetaConfigModal = closeMetaConfigModal;
  window.handleMetaConfigSave = handleMetaConfigSave;
  window.setMetaDailyBudget = setMetaDailyBudget;
  window.onMetaBudgetInputChange = onMetaBudgetInputChange;
  window.toggleMetaInterestChip = toggleMetaInterestChip;
  window.syncMetaAudienceMockup = syncMetaAudienceMockup;
  window.loadArticleIntoMetaMarketing = loadArticleIntoMetaMarketing;
  window.loadMetaPostIntoForm = loadMetaPostIntoForm;
  window.copyMetaPostText = copyMetaPostText;
  window.onMetaStatusChange = onMetaStatusChange;
  window.toggleMetaScheduleMode = toggleMetaScheduleMode;
  window.setAdDurationDays = setAdDurationDays;
  window.calcTotalAdInvestment = calcTotalAdInvestment;
  window.onMetaDestinationSelectChange = onMetaDestinationSelectChange;
  window.toggleMetaPostStatus = toggleMetaPostStatus;
  window.startMetaPostPublish = startMetaPostPublish;
  window.openMetaPublishAssistModal = openMetaPublishAssistModal;
  window.closeMetaPublishAssistModal = closeMetaPublishAssistModal;
  window.markMetaPostAsPublished = markMetaPostAsPublished;

})();
