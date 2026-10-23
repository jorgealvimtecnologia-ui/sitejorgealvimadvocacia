/**
 * ==============================================================================
 * SUBMÓDULO DA ABA DE NOTIFICAÇÕES & MARKETING: INTEGRAÇÃO BREVO
 * ==============================================================================
 * Gerencia a comunicação com a API do Brevo, configuração de credenciais,
 * fatiamento diário em lotes de 300 contatos e exportação de CSV.
 * ==============================================================================
 */

(function() {
  let brevoConfigCache = null;

  function getAuthToken() {
    if (typeof getToken === 'function') {
      const t = getToken();
      if (t) return t;
    }
    return (
      localStorage.getItem('ja_admin_token') ||
      localStorage.getItem('ja_token') ||
      localStorage.getItem('advocacia_token') ||
      localStorage.getItem('token') ||
      sessionStorage.getItem('token') ||
      ''
    );
  }

  function getHeaders(extra = {}) {
    const token = getAuthToken();
    return {
      'Content-Type': 'application/json',
      ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
      ...extra
    };
  }

  function canManageSettings() {
    if (!getAuthToken()) return false;
    if (typeof window.moduleAllowed === 'function') return window.moduleAllowed('explorer');
    const cp = window.currentUserPermissions;
    if (!cp) return false;
    return !!(cp.is_master || (cp.permissions && cp.permissions.tab_settings === 1));
  }

  async function fetchBrevoConfig() {
    if (!canManageSettings()) return;
    try {
      const res = await fetch('/api/brevo/config', {
        headers: getHeaders(),
        credentials: 'same-origin'
      });
      if (!res.ok) return;
      const data = await res.json();
      brevoConfigCache = data;
      renderBrevoUI(data);
    } catch (err) {
      console.warn('[BREVO UI] Erro ao carregar status:', err.message);
    }
  }

  function renderBrevoUI(data) {
    const badge = document.getElementById('brevo-status-badge');
    const detail = document.getElementById('brevo-status-detail');

    if (badge) {
      if (data.configured && data.status === 'connected') {
        badge.className = 'px-3 py-1 rounded-full text-xs font-extrabold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 flex items-center gap-1.5';
        badge.innerHTML = '<span class="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span> Conectado ao Brevo';
      } else if (data.configured && data.status === 'error') {
        badge.className = 'px-3 py-1 rounded-full text-xs font-extrabold bg-rose-500/20 text-rose-300 border border-rose-500/30 flex items-center gap-1.5';
        badge.innerHTML = '<span class="w-2 h-2 rounded-full bg-rose-400"></span> Erro de Autenticação';
      } else {
        badge.className = 'px-3 py-1 rounded-full text-xs font-extrabold bg-amber-500/20 text-amber-300 border border-amber-500/30 flex items-center gap-1.5';
        badge.innerHTML = '<span class="w-2 h-2 rounded-full bg-amber-400"></span> Aguardando Chave de API';
      }
    }

    if (detail) {
      const totalContatos = data.stats?.total_contacts || 0;
      const totalLotes = data.stats?.total_batches || 1;
      const limiteDiario = data.stats?.daily_batch_limit || 300;

      if (data.configured && data.status === 'connected') {
        const emailConta = data.account?.email || '';
        detail.innerHTML = `
          Conta Brevo conectada (<strong>${emailConta}</strong>). Sua base possui <strong>${totalContatos} contatos</strong> com e-mail, organizados automaticamente em <strong>${totalLotes} lote(s) diário(s)</strong> de até ${limiteDiario} envios (cota 100% gratuita).
        `;
      } else {
        detail.innerHTML = `
          Sua base possui <strong>${totalContatos} contatos</strong> com e-mail prontos para campanhas e newsletters. O sistema organiza tudo automaticamente em lotes diários de até ${limiteDiario} envios para respeitar o plano gratuito.
        `;
      }
    }

    // Carrega a listagem de lotes
    fetchBrevoBatches();
  }

  async function fetchBrevoBatches() {
    if (!canManageSettings()) return;
    const container = document.getElementById('brevo-batches-list');
    if (!container) return;

    try {
      const res = await fetch('/api/brevo/batches', {
        headers: getHeaders(),
        credentials: 'same-origin'
      });
      if (!res.ok) return;
      const data = await res.json();

      if (!data.batches || data.batches.length === 0) {
        container.innerHTML = '<p class="text-xs text-slate-400 italic">Nenhum contato com e-mail válido encontrado para campanhas.</p>';
        return;
      }

      container.innerHTML = data.batches.map(b => `
        <div class="flex items-center justify-between p-2.5 rounded-xl bg-slate-800/80 border border-slate-700 text-xs">
          <div>
            <span class="font-bold text-white">${b.name}</span>
            <span class="text-slate-400 ml-2">(${b.count} contatos: do ${b.startIndex}º ao ${b.endIndex}º)</span>
          </div>
          <button 
            type="button" 
            onclick="downloadBrevoBatch(${b.batchId})" 
            class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-teal-500/20 hover:bg-teal-500/30 text-teal-300 font-bold border border-teal-500/30 transition-all cursor-pointer active:scale-95">
            <span>📥</span>
            <span>Baixar CSV</span>
          </button>
        </div>
      `).join('');
    } catch (err) {
      console.warn('[BREVO BATCHES] Erro ao carregar lotes:', err);
    }
  }

  async function downloadBrevoBatch(batchId) {
    if (!canManageSettings()) {
      alert('Acesso restrito pela RHABAC: você não possui permissão de Configurações.');
      return;
    }
    try {
      const token = getAuthToken();
      const res = await fetch(`/api/brevo/export-batch/${batchId}?token=${encodeURIComponent(token)}`, {
        headers: getHeaders(),
        credentials: 'same-origin'
      });
      if (!res.ok) {
        throw new Error(`Erro HTTP ${res.status} ao gerar CSV`);
      }
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Brevo_Lote_${batchId}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      alert('Falha ao baixar CSV do lote: ' + err.message);
    }
  }

  function openBrevoConfigModal() {
    if (!canManageSettings()) {
      alert('Acesso restrito pela RHABAC: você não possui permissão de Configurações.');
      return;
    }
    let modal = document.getElementById('modal-brevo-config');
    if (!modal) {
      createBrevoModalHtml();
      modal = document.getElementById('modal-brevo-config');
    }

    if (brevoConfigCache?.settings) {
      const s = brevoConfigCache.settings;
      const elName = document.getElementById('brevo-input-sender-name');
      const elEmail = document.getElementById('brevo-input-sender-email');
      const elReply = document.getElementById('brevo-input-reply-email');
      const elLimit = document.getElementById('brevo-input-limit');

      if (elName && !elName.value) elName.value = s.sender_name || 'Dr. Jorge Alvim - Advocacia';
      if (elEmail && !elEmail.value) elEmail.value = s.sender_email || 'contato@jorgealvimadvocacia.com.br';
      if (elReply && !elReply.value) elReply.value = s.reply_to_email || 'jorgealvimadv@gmail.com';
      if (elLimit && !elLimit.value) elLimit.value = s.daily_batch_limit || 300;
    }

    modal.classList.remove('hidden');
  }

  function closeBrevoConfigModal() {
    const modal = document.getElementById('modal-brevo-config');
    if (modal) modal.classList.add('hidden');
  }

  async function saveBrevoConfigForm(event) {
    if (event) event.preventDefault();

    const apiKey = (document.getElementById('brevo-input-key')?.value || '').trim();
    const senderName = (document.getElementById('brevo-input-sender-name')?.value || '').trim();
    const senderEmail = (document.getElementById('brevo-input-sender-email')?.value || '').trim();
    const replyToEmail = (document.getElementById('brevo-input-reply-email')?.value || '').trim();
    const dailyLimit = (document.getElementById('brevo-input-limit')?.value || '300').trim();

    const btn = document.getElementById('btn-save-brevo-config');
    const origText = btn ? btn.innerHTML : '';
    if (btn) btn.innerHTML = 'Salvando...';

    try {
      const payload = {
        sender_name: senderName,
        sender_email: senderEmail,
        reply_to_email: replyToEmail,
        daily_batch_limit: dailyLimit
      };
      if (apiKey) payload.brevo_api_key = apiKey;

      const res = await fetch('/api/brevo/config', {
        method: 'POST',
        headers: getHeaders(),
        credentials: 'same-origin',
        body: JSON.stringify(payload)
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Falha ao salvar');

      alert('✅ Configurações do Brevo atualizadas com sucesso!');
      closeBrevoConfigModal();
      fetchBrevoConfig();
    } catch (err) {
      alert(`❌ Erro ao salvar: ${err.message}`);
    } finally {
      if (btn) btn.innerHTML = origText;
    }
  }

  async function testBrevoEmail() {
    if (!canManageSettings()) {
      alert('Acesso restrito pela RHABAC: você não possui permissão de Configurações.');
      return;
    }
    const defaultEmail = brevoConfigCache?.settings?.reply_to_email || 'jorgealvimadv@gmail.com';
    const targetEmail = prompt('Digite o e-mail de destino para o teste do Brevo:', defaultEmail);
    if (!targetEmail) return;

    try {
      const res = await fetch('/api/brevo/test', {
        method: 'POST',
        headers: getHeaders(),
        credentials: 'same-origin',
        body: JSON.stringify({ target_email: targetEmail.trim() })
      });

      const data = await res.json();
      if (res.ok) {
        alert(`✅ E-mail de teste enviado com sucesso para ${targetEmail}!\nVerifique sua caixa de entrada e clique em "Responder" para testar.`);
      } else {
        alert(`❌ Erro no envio de teste: ${data.error || 'Falha na API'}`);
      }
    } catch (err) {
      alert(`❌ Erro de rede: ${err.message}`);
    }
  }

  function createBrevoModalHtml() {
    const div = document.createElement('div');
    div.id = 'modal-brevo-config';
    div.className = 'fixed inset-0 z-50 flex items-center justify-center p-4 bg-navy-950/70 backdrop-blur-xs hidden';
    div.innerHTML = `
      <div class="bg-white rounded-3xl max-w-lg w-full shadow-2xl border border-slate-200 overflow-hidden flex flex-col animate-scale-up">
        <div class="p-5 border-b border-slate-200 flex items-center justify-between bg-slate-50">
          <div class="flex items-center gap-3">
            <span class="w-10 h-10 rounded-xl bg-teal-50 text-teal-600 border border-teal-300 flex items-center justify-center text-xl">📧</span>
            <div>
              <h3 class="font-bold text-navy-950 text-sm">Configuração da API Brevo</h3>
              <p class="text-[11px] text-slate-500 font-medium">Newsletters e Campanhas em Massa (300/dia grátis)</p>
            </div>
          </div>
          <button type="button" onclick="closeBrevoConfigModal()" class="w-8 h-8 rounded-full bg-slate-200 hover:bg-slate-300 text-slate-600 flex items-center justify-center font-bold text-xs cursor-pointer">✕</button>
        </div>

        <form onsubmit="saveBrevoConfigForm(event)" class="p-6 space-y-4 text-xs">
          <div>
            <label class="block font-bold text-slate-700 mb-1">Chave de API Brevo (v3):</label>
            <input 
              id="brevo-input-key" 
              type="password" 
              placeholder="xkeysib-..." 
              class="w-full px-3 py-2 rounded-xl border border-slate-300 font-mono text-xs focus:ring-2 focus:ring-teal-500 focus:outline-none" />
            <p class="text-[10px] text-slate-400 mt-1">Obtenha gratuitamente no painel da Brevo em: Configurações &gt; SMTP &amp; API &gt; Chaves de API.</p>
          </div>

          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label class="block font-bold text-slate-700 mb-1">Nome do Remetente:</label>
              <input 
                id="brevo-input-sender-name" 
                type="text" 
                value="Dr. Jorge Alvim - Advocacia" 
                class="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs focus:ring-2 focus:ring-teal-500 focus:outline-none" />
            </div>
            <div>
              <label class="block font-bold text-slate-700 mb-1">E-mail do Remetente:</label>
              <input 
                id="brevo-input-sender-email" 
                type="email" 
                value="contato@jorgealvimadvocacia.com.br" 
                class="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs focus:ring-2 focus:ring-teal-500 focus:outline-none" />
            </div>
          </div>

          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label class="block font-bold text-slate-700 mb-1">E-mail de Resposta (Reply-To):</label>
              <input 
                id="brevo-input-reply-email" 
                type="email" 
                value="jorgealvimadv@gmail.com" 
                class="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs focus:ring-2 focus:ring-teal-500 focus:outline-none" />
              <p class="text-[10px] text-slate-400 mt-1">Quando o cliente clica em "Responder", vai para cá.</p>
            </div>
            <div>
              <label class="block font-bold text-slate-700 mb-1">Limite do Lote Diário:</label>
              <input 
                id="brevo-input-limit" 
                type="number" 
                value="300" 
                min="10" 
                max="1000" 
                class="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs focus:ring-2 focus:ring-teal-500 focus:outline-none" />
              <p class="text-[10px] text-slate-400 mt-1">300 é a cota gratuita diária do Brevo.</p>
            </div>
          </div>

          <div class="pt-3 border-t border-slate-200 flex items-center justify-between">
            <button 
              type="button" 
              onclick="closeBrevoConfigModal()" 
              class="px-4 py-2 rounded-xl border border-slate-300 bg-white hover:bg-slate-100 text-slate-700 font-bold transition-colors">
              Cancelar
            </button>
            <button 
              id="btn-save-brevo-config" 
              type="submit" 
              class="px-5 py-2 rounded-xl bg-gradient-to-r from-teal-600 to-emerald-600 hover:from-teal-500 hover:to-emerald-500 text-white font-bold transition-all shadow-md">
              Salvar Configurações
            </button>
          </div>
        </form>
      </div>
    `;
    document.body.appendChild(div);
  }

  // Expor globalmente
  window.fetchBrevoConfig = fetchBrevoConfig;
  window.openBrevoConfigModal = openBrevoConfigModal;
  window.closeBrevoConfigModal = closeBrevoConfigModal;
  window.saveBrevoConfigForm = saveBrevoConfigForm;
  window.testBrevoEmail = testBrevoEmail;
  window.downloadBrevoBatch = downloadBrevoBatch;

  document.addEventListener('DOMContentLoaded', () => {
    fetchBrevoConfig();
  });
})();
