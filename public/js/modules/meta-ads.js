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
    return localStorage.getItem('ja_token') || localStorage.getItem('token') || '';
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
        destBadge = '<span class="px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 text-[10px] font-bold">🎯 Meta Ads (PAUSED)</span>';
      } else if (p.destination_type === 'FACEBOOK_PAGE_POST') {
        destBadge = '<span class="px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-800 text-[10px] font-bold">📘 Facebook Feed</span>';
      } else if (p.destination_type === 'INSTAGRAM_FEED') {
        destBadge = '<span class="px-2 py-0.5 rounded-full bg-fuchsia-100 text-fuchsia-800 text-[10px] font-bold">📸 Instagram Feed</span>';
      } else {
        destBadge = '<span class="px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 text-[10px] font-bold">📁 Rascunho Local</span>';
      }

      let statusBadge = '';
      if (p.status === 'SENT_TO_META_PAUSED') {
        statusBadge = '<span class="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-bold">✓ No Gerenciador (PAUSED)</span>';
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

      return `
        <tr class="hover:bg-slate-50/80 transition-colors border-b border-slate-100">
          <td class="p-3.5">${mediaThumb}</td>
          <td class="p-3.5">
            <div class="font-bold text-xs text-navy-950">${escapeHtml(p.title)}</div>
            <div class="text-[11px] text-slate-500 truncate max-w-xs mt-0.5">${escapeHtml(p.message)}</div>
            <div class="text-[10px] text-blue-700 font-semibold mt-0.5 flex items-center gap-1">
              <span>💰 R$ ${(p.daily_budget_cents ? (p.daily_budget_cents/100).toFixed(2) : '20.00').replace('.', ',')}/dia</span>
              <span>•</span>
              <span>📍 ${escapeHtml(p.target_city || 'Juiz de Fora')} (+${p.target_radius_km || 40}km)</span>
              <span>•</span>
              <span>👥 ${p.target_age_min || 25}-${p.target_age_max || 65}a</span>
            </div>
            <div class="text-[10px] text-slate-400 font-mono mt-0.5">${p.meta_ad_id ? `ID Meta: ${p.meta_ad_id}` : `Ref: #${p.id}`}</div>
          </td>
          <td class="p-3.5">${destBadge}</td>
          <td class="p-3.5">${statusBadge}</td>
          <td class="p-3.5 text-[11px] text-slate-500">${dateStr}</td>
          <td class="p-3.5 text-right space-x-1">
            <button onclick="previewMetaPost('${p.id}')" class="p-1.5 rounded-lg text-blue-600 hover:bg-blue-50 transition-colors" title="Ver Mockup Detalhado">
              👁️
            </button>
            <button onclick="deleteMetaPost('${p.id}', '${escapeHtml(p.title)}')" class="p-1.5 rounded-lg text-rose-600 hover:bg-rose-50 transition-colors" title="Excluir Material">
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

    // Configuração Ampla de Segmentação e Orçamento
    formData.append('daily_budget', budgetInput ? budgetInput.value : '20');
    formData.append('campaign_goal', goalSelect ? goalSelect.value : 'OUTCOME_LEADS');
    formData.append('target_city', cityInput && cityInput.value.trim() ? cityInput.value.trim() : 'Juiz de Fora');
    formData.append('target_radius_km', radiusSelect ? radiusSelect.value : '40');
    formData.append('target_age_min', ageMinSelect ? ageMinSelect.value : '25');
    formData.append('target_age_max', ageMaxSelect ? ageMaxSelect.value : '65');
    formData.append('target_gender', genderSelect ? genderSelect.value : 'ALL');
    formData.append('target_interests', JSON.stringify(activeInterests));

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
        toast(data.message || 'Material enviado com sucesso!', 'success');
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
                <span class="text-slate-500 block">Objetivo:</span>
                <span class="font-bold text-slate-800">${post.campaign_goal || 'OUTCOME_LEADS'}</span>
              </div>
              <div>
                <span class="text-slate-500 block">Praça / Raio:</span>
                <span class="font-bold text-slate-800">${escapeHtml(post.target_city || 'Juiz de Fora')} (+${post.target_radius_km || 40}km)</span>
              </div>
              <div>
                <span class="text-slate-500 block">Público / Idade:</span>
                <span class="font-bold text-slate-800">${post.target_age_min || 25} a ${post.target_age_max || 65} anos (${post.target_gender === 'WOMEN' ? 'Mulheres' : post.target_gender === 'MEN' ? 'Homens' : 'Todos'})</span>
              </div>
            </div>
          </div>
        </div>
      `;
    }
    if (modal) modal.classList.remove('hidden');
  }

  function closeMetaPreviewModal() {
    const modal = document.getElementById('modal-meta-preview');
    if (modal) modal.classList.add('hidden');
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
  // Expor Globalmente no Escopo do Window
  // --------------------------------------------------------------------------
  window.loadMetaAdsTab = loadMetaAdsTab;
  window.handleMetaAdSubmit = handleMetaAdSubmit;
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

})();
