// Módulo Frontend: ✍️ Gestão de Assinaturas Digitais & Validade Jurídica

function openSignatureModal(docType = 'procuracao', clientId = '', clientName = '', docContent = '') {
  const modal = document.getElementById('signature-request-modal');
  if (modal) {
    modal.classList.remove('hidden');
    if (document.getElementById('sig-client-name')) document.getElementById('sig-client-name').value = clientName;
    if (document.getElementById('sig-client-id')) document.getElementById('sig-client-id').value = clientId;
    if (document.getElementById('sig-doc-type')) document.getElementById('sig-doc-type').value = docType;
    if (document.getElementById('sig-doc-content')) document.getElementById('sig-doc-content').value = docContent;
  }
}

function closeSignatureModal() {
  const modal = document.getElementById('signature-request-modal');
  if (modal) modal.classList.add('hidden');
  const result = document.getElementById('signature-created-result');
  if (result) result.classList.add('hidden');
}

async function createSignatureRequest(e) {
  if (e && e.preventDefault) e.preventDefault();

  const client_id = document.getElementById('sig-client-id')?.value || '';
  const client_name = document.getElementById('sig-client-name')?.value || '';
  const client_cpf_cnpj = document.getElementById('sig-client-cpf')?.value || '';
  const client_phone = document.getElementById('sig-client-phone')?.value || '';
  const client_email = document.getElementById('sig-client-email')?.value || '';
  const document_type = document.getElementById('sig-doc-type')?.value || 'procuracao';
  const document_title = document.getElementById('sig-doc-title')?.value || '';
  const document_content = document.getElementById('sig-doc-content')?.value || '';

  if (!client_name || !document_content) {
    alert('Preencha o nome do signatário e o teor do documento.');
    return;
  }

  try {
    const res = await apiFetch('/api/signatures/request', {
      method: 'POST',
      body: JSON.stringify({
        client_id,
        client_name,
        client_cpf_cnpj,
        client_phone,
        client_email,
        document_type,
        document_title,
        document_content
      })
    });

    const data = await res.json();
    if (res.ok && data.success) {
      document.getElementById('signature-created-link').value = data.sign_url;
      document.getElementById('signature-created-result').classList.remove('hidden');

      // Configura botão de envio no WhatsApp
      const waBtn = document.getElementById('sig-send-whatsapp-btn');
      if (waBtn) {
        waBtn.onclick = () => {
          sendSignatureViaWhatsApp(data.sign_url, client_phone, client_name);
        };
      }
    } else {
      alert(data.error || 'Erro ao gerar solicitação de assinatura.');
    }
  } catch (err) {
    console.error('[ASSINATURAS] Erro ao criar solicitação:', err);
    alert('Erro de comunicação com o servidor.');
  }
}

async function sendSignatureViaWhatsApp(signUrl, phone, name) {
  try {
    const res = await apiFetch('/api/notifications/whatsapp-template', {
      method: 'POST',
      body: JSON.stringify({
        client_phone: phone,
        client_name: name,
        template_type: 'assinatura',
        action_link: signUrl
      })
    });

    const data = await res.json();
    if (res.ok && data.success && data.whatsapp_url) {
      window.open(data.whatsapp_url, '_blank');
    } else {
      alert('Número de telefone do cliente não informado para disparo do WhatsApp.');
    }
  } catch (err) {
    console.error('Erro ao gerar link WhatsApp:', err);
  }
}

function copySignatureLink() {
  const input = document.getElementById('signature-created-link');
  if (!input) return;
  navigator.clipboard.writeText(input.value).then(() => {
    alert('✓ Link de assinatura copiado com sucesso! Envie para o cliente pelo WhatsApp.');
  });
}
