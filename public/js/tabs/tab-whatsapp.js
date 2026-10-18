/**
 * ==============================================================================
 * SUBMÓDULO DESACOPLADO: WHATSAPP DEDICADO & EVOLUTION API
 * ==============================================================================
 * Interface para conexão do chip exclusivo via QR Code, monitoramento
 * de status, auto-resposta e teste de envio de mensagens.
 * ==============================================================================
 */

(function () {
  'use strict';

  function toast(msg, type = 'info') {
    if (window.showSupportToast) {
      window.showSupportToast(msg, type);
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

  async function fetchWhatsAppStatus() {
    const badgeEl = document.getElementById('wa-status-badge');
    const badgeDetail = document.getElementById('wa-status-detail');
    const dedicatedPhoneEl = document.getElementById('wa-dedicated-phone');

    try {
      const res = await fetch('/api/whatsapp/config', {
        headers: { 'Authorization': `Bearer ${getAuthToken()}` }
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro ao carregar status');

      if (badgeEl) {
        if (data.isConnected) {
          badgeEl.className = 'px-3 py-1 rounded-full text-xs font-extrabold bg-emerald-100 text-emerald-800 border border-emerald-300 flex items-center gap-1.5';
          badgeEl.innerHTML = '<span class="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span> Conectado (Online)';
          if (badgeDetail) badgeDetail.innerText = 'Chip dedicado ativo e pronto para disparos automáticos.';
        } else {
          badgeEl.className = 'px-3 py-1 rounded-full text-xs font-extrabold bg-amber-100 text-amber-900 border border-amber-300 flex items-center gap-1.5';
          badgeEl.innerHTML = '<span class="w-2 h-2 rounded-full bg-amber-500"></span> Aguardando Ativação do Chip';
          if (badgeDetail) badgeDetail.innerText = 'Compre o chip na operadora, instale o WhatsApp Business e leia o QR Code aqui.';
        }
      }

      if (dedicatedPhoneEl && data.dedicatedPhone) {
        dedicatedPhoneEl.innerText = data.dedicatedPhone;
      }
    } catch (err) {
      console.warn('[WHATSAPP] Falha ao consultar status:', err.message);
    }
  }

  async function openWhatsAppConnectModal() {
    let modal = document.getElementById('modal-whatsapp-connect');
    if (!modal) {
      createWhatsAppModalHtml();
      modal = document.getElementById('modal-whatsapp-connect');
    }

    modal.classList.remove('hidden');
    await loadQRCode();
  }

  function closeWhatsAppConnectModal() {
    const modal = document.getElementById('modal-whatsapp-connect');
    if (modal) modal.classList.add('hidden');
  }

  async function loadQRCode() {
    const qrContainer = document.getElementById('wa-qrcode-container');
    const qrStatusMsg = document.getElementById('wa-qrcode-status-msg');
    if (!qrContainer) return;

    qrContainer.innerHTML = '<div class="p-8 text-center text-slate-500 text-xs animate-pulse">⏳ Conectando à Evolution API e gerando QR Code...</div>';
    if (qrStatusMsg) qrStatusMsg.innerText = 'Aguarde um instante...';

    try {
      const res = await fetch('/api/whatsapp/qrcode', {
        headers: { 'Authorization': `Bearer ${getAuthToken()}` }
      });
      const data = await res.json();

      if (data.success && data.qrcode) {
        qrContainer.innerHTML = `
          <div class="p-3 bg-white rounded-2xl border border-slate-200 inline-block shadow-md">
            <img src="${data.qrcode}" alt="QR Code WhatsApp" class="w-64 h-64 object-contain rounded-xl" />
          </div>
        `;
        if (qrStatusMsg) {
          qrStatusMsg.innerHTML = '📱 <strong>Aponte a câmera do seu WhatsApp Business:</strong><br>Vá em <em>Configurações &gt; Aparelhos Conectados &gt; Conectar um aparelho</em>.';
        }
      } else {
        qrContainer.innerHTML = `
          <div class="p-6 bg-amber-50 border border-amber-200 rounded-2xl text-amber-900 text-xs space-y-2 max-w-sm text-center">
            <div class="text-2xl">⏳</div>
            <div class="font-bold">O sistema está pronto e aguardando o seu chip dedicado!</div>
            <p class="text-slate-600 text-[11px] leading-relaxed">
              Quando você adquirir o chip novo na operadora e cadastrar no WhatsApp Business, basta iniciar a Evolution API e clicar em atualizar para ler o QR Code nesta tela.
            </p>
          </div>
        `;
        if (qrStatusMsg) {
          qrStatusMsg.innerText = data.message || 'Aguardando inicialização da Evolution API e chip dedicado.';
        }
      }
    } catch (err) {
      qrContainer.innerHTML = `<div class="p-4 bg-red-50 text-red-700 text-xs rounded-xl">Falha ao obter QR Code: ${err.message}</div>`;
    }
  }

  async function testWhatsAppSend() {
    const phoneInput = prompt('Informe o número de telefone para teste (com DDD):', '32998153429');
    if (!phoneInput) return;

    toast('Enviando mensagem de teste...', 'info');

    try {
      const res = await fetch('/api/whatsapp/test', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${getAuthToken()}`
        },
        body: JSON.stringify({ phone: phoneInput })
      });
      const data = await res.json();

      if (data.sent) {
        toast('✅ Mensagem de teste enviada com sucesso no WhatsApp!', 'success');
      } else {
        toast(`ℹ️ Status: ${data.details || 'Simulado'}. Abrindo link direto como fallback...`, 'info');
        if (data.fallbackLink) window.open(data.fallbackLink, '_blank');
      }
    } catch (err) {
      toast('Erro no teste de envio: ' + err.message, 'error');
    }
  }

  function createWhatsAppModalHtml() {
    const div = document.createElement('div');
    div.id = 'modal-whatsapp-connect';
    div.className = 'fixed inset-0 z-50 flex items-center justify-center p-4 bg-navy-950/70 backdrop-blur-xs hidden';
    div.innerHTML = `
      <div class="bg-white rounded-3xl max-w-md w-full shadow-2xl border border-slate-200 overflow-hidden flex flex-col animate-scale-up">
        <div class="p-5 border-b border-slate-200 flex items-center justify-between bg-slate-50">
          <div class="flex items-center gap-3">
            <span class="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 border border-emerald-300 flex items-center justify-center text-xl">📲</span>
            <div>
              <h3 class="font-bold text-navy-950 text-sm">Conectar Chip Dedicado (WhatsApp)</h3>
              <p class="text-[11px] text-slate-500 font-medium">Evolution API & WhatsApp Business</p>
            </div>
          </div>
          <button type="button" onclick="closeWhatsAppConnectModal()" class="w-8 h-8 rounded-full bg-slate-200 hover:bg-slate-300 text-slate-600 flex items-center justify-center font-bold text-xs cursor-pointer">✕</button>
        </div>

        <div class="p-6 flex flex-col items-center justify-center space-y-4">
          <div id="wa-qrcode-container" class="min-h-[200px] flex items-center justify-center"></div>
          <p id="wa-qrcode-status-msg" class="text-xs text-slate-600 text-center max-w-xs leading-relaxed"></p>
        </div>

        <div class="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
          <button type="button" onclick="loadQRCode()" class="px-3 py-1.5 rounded-xl border border-slate-300 bg-white hover:bg-slate-100 text-slate-700 text-xs font-bold transition-colors">
            🔄 Atualizar QR Code
          </button>
          <button type="button" onclick="closeWhatsAppConnectModal()" class="px-4 py-1.5 rounded-xl bg-navy-950 hover:bg-slate-800 text-white text-xs font-bold transition-colors">
            Fechar
          </button>
        </div>
      </div>
    `;
    document.body.appendChild(div);
  }

  // Expor globalmente
  window.fetchWhatsAppStatus = fetchWhatsAppStatus;
  window.openWhatsAppConnectModal = openWhatsAppConnectModal;
  window.closeWhatsAppConnectModal = closeWhatsAppConnectModal;
  window.testWhatsAppSend = testWhatsAppSend;

})();
