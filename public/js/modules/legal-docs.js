/**
 * ==============================================================================
 * MÓDULO KIT INICIAL, LINK MÁGICO & AGILIDADE COMERCIAL (FASE 3)
 * ==============================================================================
 * 1. Gerador de Kit Inicial em 1 Clique (Procuração, Contrato, Hipossuficiência)
 * 2. Assinatura Eletrônica Mobile pelo WhatsApp
 * 3. Link Mágico de Documentos sem Senha
 * 4. Lembrete Amigável de Honorários com Chave PIX
 * ==============================================================================
 */

(function () {
  'use strict';

  let currentKitData = null;
  let currentClientId = null;

  // ============================================================================
  // 1. MODAL DO KIT INICIAL EM 1 CLIQUE
  // ============================================================================

  window.openKitInicialModal = async function (clientId) {
    currentClientId = clientId;
    let modal = document.getElementById('kit-inicial-modal');
    if (!modal) {
      createKitInicialModal();
      modal = document.getElementById('kit-inicial-modal');
    }

    modal.classList.remove('hidden');
    document.getElementById('kit-client-name').textContent = 'Carregando qualificação...';
    document.getElementById('kit-doc-preview-content').innerHTML = `
      <div class="p-12 text-center text-slate-400">
        <div class="text-3xl animate-spin mb-2">⚖️</div>
        <p class="text-xs font-bold">Compilando Procuração, Contrato e Declaração de Hipossuficiência...</p>
      </div>
    `;

    try {
      const res = await fetch(`/api/legal-docs/kit/${clientId}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro ao carregar kit.');

      currentKitData = data;
      document.getElementById('kit-client-name').textContent = `${data.client.full_name} (${data.client.cpf || data.client.cnpj || 'Sem CPF/CNPJ'})`;
      switchKitDocTab('procuracao');
    } catch (err) {
      if (window.showToast) window.showToast('Erro ao carregar Kit Inicial: ' + err.message, 'error');
      closeKitInicialModal();
    }
  };

  window.closeKitInicialModal = function () {
    const modal = document.getElementById('kit-inicial-modal');
    if (modal) modal.classList.add('hidden');
  };

  function createKitInicialModal() {
    const div = document.createElement('div');
    div.id = 'kit-inicial-modal';
    div.className = 'fixed inset-0 z-50 flex items-center justify-center p-4 bg-navy-950/70 backdrop-blur-xs hidden';
    div.innerHTML = `
      <div class="bg-white rounded-3xl max-w-3xl w-full shadow-2xl border border-slate-200 flex flex-col max-h-[90vh] overflow-hidden">
        <!-- Topo da Modal -->
        <div class="p-5 sm:p-6 border-b border-slate-200 flex items-center justify-between bg-slate-50">
          <div class="flex items-center space-x-3 min-w-0">
            <div class="w-11 h-11 rounded-2xl bg-amber-50 text-gold-600 flex items-center justify-center text-2xl border border-gold-300 flex-shrink-0">
              📑
            </div>
            <div class="min-w-0">
              <div class="flex items-center space-x-2">
                <span class="px-2 py-0.5 rounded text-[10px] font-extrabold bg-gold-100 text-gold-900 border border-gold-300 uppercase">
                  1 Clique
                </span>
                <h3 class="font-serif font-bold text-base sm:text-lg text-navy-950 truncate">
                  Kit Inicial Jurídico Timbrado
                </h3>
              </div>
              <p id="kit-client-name" class="text-xs text-slate-500 truncate mt-0.5">Carregando...</p>
            </div>
          </div>
          <button onclick="closeKitInicialModal()" class="text-slate-400 hover:text-slate-600 p-2 rounded-xl hover:bg-slate-100 transition-colors text-lg">
            ✕
          </button>
        </div>

        <!-- Abas dos 3 Documentos -->
        <div class="flex border-b border-slate-200 bg-white px-5 pt-3 gap-2 overflow-x-auto text-xs font-bold">
          <button 
            id="kit-tab-btn-procuracao"
            onclick="switchKitDocTab('procuracao')" 
            class="pb-3 border-b-2 border-gold-600 text-navy-950 px-3 cursor-pointer"
          >
            1. Procuração Ad Judicia
          </button>
          <button 
            id="kit-tab-btn-contrato"
            onclick="switchKitDocTab('contrato')" 
            class="pb-3 border-b-2 border-transparent text-slate-500 hover:text-slate-800 px-3 cursor-pointer"
          >
            2. Contrato de Honorários
          </button>
          <button 
            id="kit-tab-btn-hipossuficiencia"
            onclick="switchKitDocTab('hipossuficiencia')" 
            class="pb-3 border-b-2 border-transparent text-slate-500 hover:text-slate-800 px-3 cursor-pointer"
          >
            3. Justiça Gratuita (Hipossuficiência)
          </button>
        </div>

        <!-- Área de Pré-visualização com Folha Timbrada -->
        <div class="flex-1 overflow-y-auto p-5 sm:p-8 bg-slate-100/70">
          <div id="kit-doc-preview-content" class="bg-white p-6 sm:p-8 rounded-2xl shadow-sm border border-slate-200 max-w-2xl mx-auto text-xs leading-relaxed font-serif">
            <!-- Renderizado via JS -->
          </div>
        </div>

        <!-- Rodapé com Ações -->
        <div class="p-4 sm:p-5 bg-white border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3">
          <button 
            type="button" 
            onclick="printCurrentKitDoc()" 
            class="w-full sm:w-auto px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs transition-colors flex items-center justify-center space-x-1.5 border border-slate-300"
          >
            <span>🖨️</span>
            <span>Imprimir / Salvar PDF</span>
          </button>

          <div class="flex items-center space-x-2 w-full sm:w-auto">
            <button 
              type="button" 
              onclick="closeKitInicialModal()" 
              class="px-4 py-2.5 rounded-xl text-slate-500 hover:text-slate-700 font-bold text-xs"
            >
              Fechar
            </button>
            <button 
              type="button" 
              id="btn-dispatch-kit-whatsapp"
              onclick="dispatchKitToWhatsApp()" 
              class="flex-1 sm:flex-none px-5 py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 text-white font-bold text-xs shadow-md transition-all flex items-center justify-center space-x-2 border border-emerald-500"
            >
              <span>📱</span>
              <span>Enviar Kit para Assinar no WhatsApp</span>
            </button>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(div);
  }

  let activeKitTab = 'procuracao';

  window.switchKitDocTab = function (tab) {
    activeKitTab = tab;
    ['procuracao', 'contrato', 'hipossuficiencia'].forEach(t => {
      const btn = document.getElementById(`kit-tab-btn-${t}`);
      if (btn) {
        if (t === tab) {
          btn.className = 'pb-3 border-b-2 border-gold-600 text-navy-950 font-bold px-3 cursor-pointer';
        } else {
          btn.className = 'pb-3 border-b-2 border-transparent text-slate-500 hover:text-slate-800 font-semibold px-3 cursor-pointer';
        }
      }
    });

    const contentEl = document.getElementById('kit-doc-preview-content');
    if (!contentEl || !currentKitData) return;

    const doc = currentKitData.docs[tab];
    if (doc) {
      contentEl.innerHTML = doc.html;
    }
  };

  window.printCurrentKitDoc = function () {
    if (!currentClientId) return;
    const url = `/api/legal-docs/render/${currentClientId}/${activeKitTab}`;
    window.open(url, '_blank');
  };

  window.dispatchKitToWhatsApp = async function () {
    if (!currentClientId) return;
    const btn = document.getElementById('btn-dispatch-kit-whatsapp');
    if (btn) btn.disabled = true;

    try {
      const res = await fetch('/api/legal-docs/dispatch-kit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientId: currentClientId,
          docTypes: ['procuracao', 'contrato', 'hipossuficiencia']
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro ao gerar solicitações.');

      if (window.showToast) {
        window.showToast('Solicitação de assinatura gerada! Abrindo WhatsApp...', 'success');
      }

      // Abre o WhatsApp
      window.open(data.whatsapp_link, '_blank');
      closeKitInicialModal();
    } catch (err) {
      if (window.showToast) window.showToast('Erro: ' + err.message, 'error');
    } finally {
      if (btn) btn.disabled = false;
    }
  };

  // ============================================================================
  // 2. LINK MÁGICO DE DOCUMENTOS SEM SENHA (WhatsApp)
  // ============================================================================

  window.generateClientMagicUploadLink = async function (clientId) {
    try {
      const res = await fetch('/api/client-portal/magic-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro ao gerar link.');

      // Copia link para clipboard
      try {
        navigator.clipboard.writeText(data.upload_url);
      } catch (_e) {}

      if (window.showToast) {
        window.showToast(`Link de documentos (72h) copiado! Abrindo WhatsApp de ${data.client_name}...`, 'success');
      }

      window.open(data.whatsapp_link, '_blank');
    } catch (err) {
      if (window.showToast) window.showToast('Erro: ' + err.message, 'error');
    }
  };

  // ============================================================================
  // 3. LEMBRETE AMIGÁVEL DE HONORÁRIOS COM PIX COPIA-E-COLA
  // ============================================================================

  window.sendPixPaymentReminder = function (clientId, clientName, phone, balanceDue) {
    const cleanPhone = (phone || '').replace(/\D/g, '');
    const cleanVal = parseFloat(balanceDue) || 0;
    const formattedVal = cleanVal > 0 
      ? cleanVal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) 
      : 'parcela pendente';

    const pixKey = 'contato@jorgealvimadvocacia.com.br'; // Chave PIX oficial do escritório

    const text = `Olá, *${clientName || 'Cliente'}*!%0A%0ATudo bem? Passando para lembrar do seu contrato de honorários no escritório *Jorge Alvim Advocacia*.%0A%0A💰 *Valor:* ${formattedVal}%0A🔑 *Chave PIX (E-mail):* ${pixKey}%0A%0AAssim que efetuar o pagamento, basta enviar o comprovante por aqui. Muito obrigado e estamos à disposição!`;

    const waUrl = cleanPhone 
      ? `https://wa.me/55${cleanPhone}?text=${text}` 
      : `https://wa.me/?text=${text}`;

    try {
      navigator.clipboard.writeText(pixKey);
    } catch (_e) {}

    if (window.showToast) {
      window.showToast('Chave PIX copiada para a área de transferência! Abrindo WhatsApp...', 'success');
    }

    window.open(waUrl, '_blank');
  };

})();
