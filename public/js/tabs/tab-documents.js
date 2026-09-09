/**
 * ============================================================================
 * SUBMÓDULO DESACOPLADO: MÓDULO: GERADOR DE DOCUMENTOS (PROCURAÇÃO, CONTRATO & HIPOSSUFICIÊNCIA)
 * Origem: Decomposição arquitetural do painel-1-app.js
 * ============================================================================
 */

(function () {
  'use strict';

    // ================= 5. GERADOR DE DOCUMENTOS (PROCURAÇÃO, CONTRATO & HIPOSSUFICIÊNCIA) =================

    let currentPreviewDocType = 'procuracao';

    function getCurrentFullDateFormatted() {
      const months = [
        'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
        'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'
      ];
      const now = new Date();
      const day = now.getDate();
      const month = months[now.getMonth()];
      const year = now.getFullYear();
      return `Juiz de Fora - MG, ${day} de ${month} de ${year}`;
    }

    function initDocsTab() {
      const select = document.getElementById('doc-client-select');
      if (!select) return;

      const currentVal = select.value;
      select.innerHTML = '<option value="">Selecione um cliente cadastrado...</option>' + 
        allClients.map(c => `
          <option value="${c.id}" ${c.id === currentVal ? 'selected' : ''}>
            ${c.full_name} (${c.client_type === 'PJ' ? 'CNPJ: ' + (c.cnpj || '—') : 'CPF: ' + (c.cpf || '—')}) — #${c.id}
          </option>
        `).join('');

      // Inicializa data atual se vazia
      if (!document.getElementById('doc-proc-city-date').value) {
        document.getElementById('doc-proc-city-date').value = getCurrentFullDateFormatted();
      }

      // Se nenhum cliente estiver selecionado e houver clientes, seleciona o primeiro
      if (!select.value && allClients.length > 0) {
        select.value = allClients[0].id;
        handleDocClientSelect(allClients[0].id);
      }
    }

    function handleDocClientSelect(clientId) {
      if (!clientId) return;
      const client = allClients.find(c => c.id === clientId);
      if (!client) return;

      const isPJ = client.client_type === 'PJ';
      
      // Formatação do Endereço
      const addressParts = [];
      if (client.street) addressParts.push(client.street);
      if (client.number) addressParts.push(`nº ${client.number}`);
      if (client.complement) addressParts.push(`(${client.complement})`);
      if (client.neighborhood) addressParts.push(`Bairro ${client.neighborhood}`);
      if (client.city) addressParts.push(client.city);
      if (client.state) addressParts.push(client.state);
      if (client.cep) addressParts.push(`CEP ${client.cep}`);
      const formattedAddress = addressParts.join(', ') || 'Endereço não informado';

      // 1. Preenche Box de Procuração
      document.getElementById('doc-proc-name').value = client.full_name || '';
      document.getElementById('doc-proc-nationality').value = client.nationality || 'brasileiro(a)';
      document.getElementById('doc-proc-marital').value = client.marital_status || 'solteiro(a)';
      document.getElementById('doc-proc-profession').value = client.profession || '';
      document.getElementById('doc-proc-cpf').value = isPJ ? (client.cnpj || '') : (client.cpf || '');
      document.getElementById('doc-proc-rg').value = client.rg || '';
      document.getElementById('doc-proc-address').value = formattedAddress;
      document.getElementById('doc-proc-city-date').value = getCurrentFullDateFormatted();
      document.getElementById('doc-proc-sign-name').value = client.full_name || '';

      // 2. Preenche Box de Contrato
      document.getElementById('doc-contrato-total').value = client.contract_value || 0;
      document.getElementById('doc-contrato-inst-count').value = client.installments_count || 1;
      document.getElementById('doc-contrato-due-date').value = client.due_date || '';
      recalcDocContractInst();

      // Sincroniza seletor
      const select = document.getElementById('doc-client-select');
      if (select && select.value !== clientId) {
        select.value = clientId;
      }
    }

    function setProcObjectPreset(key) {
      const field = document.getElementById('doc-proc-object');
      if (!field) return;

      if (key === 'transito') {
        field.value = 'para o fim específico e exclusivo de promover defesa e recursos administrativos e/ou medidas judiciais cabíveis perante o DETRAN/MG, JARI, CETRAN, Polícia Civil do Estado de Minas Gerais e órgãos judiciais competentes da Comarca de Juiz de Fora/MG ou de qualquer outro foro, visando anulação de penalidades administrativas, cancelamento de autos de infração e desbloqueio/regularização da Carteira Nacional de Habilitação (CNH).';
      } else if (key === 'civel') {
        field.value = 'para o fim específico de propor e defender em Ações Cíveis em geral, medidas cautelares, cumprimento de sentença, execuções de título e defesas pertinentes perante o Poder Judiciário do Estado de Minas Gerais ou qualquer outro foro competente.';
      } else if (key === 'trabalhista') {
        field.value = 'para o fim específico de propor Reclamação Trabalhista, defesas, recursos e acompanhamento integral perante as Varas do Trabalho da Comarca de Juiz de Fora/MG e o Tribunal Regional do Trabalho da 3ª Região (TRT/MG).';
      } else if (key === 'consumidor') {
        field.value = 'para o fim específico de ajuizar e acompanhar Ação Revisional de Contrato, Repetição de Indébito e Indenizatória por Danos Morais e Materiais perante o Juizado Especial Cível ou Varas Cíveis da Comarca de Juiz de Fora/MG.';
      } else if (key === 'familia') {
        field.value = 'para o fim específico de propor e defender em ações de divórcio consensual ou litigioso, partilha de bens, fixação, revisão ou execução de alimentos, guarda, convivência e união estável perante as Varas de Família ou Cartórios Notariais competentes.';
      }
    }

    function recalcDocContractInst() {
      const total = parseFloat(document.getElementById('doc-contrato-total')?.value) || 0;
      const count = parseInt(document.getElementById('doc-contrato-inst-count')?.value, 10) || 1;
      const instVal = count > 0 ? (total / count) : 0;

      const display = document.getElementById('doc-contrato-inst-val-display');
      if (display) {
        display.value = `${formatMoney(instVal)} (${count}x)`;
      }
    }

    function generateDocForClient(clientId, docType) {
      switchTab('docs');
      handleDocClientSelect(clientId);

      // Rola a tela até o box solicitado
      let targetBoxId = 'box-generator-procuracao';
      if (docType === 'contrato') targetBoxId = 'box-generator-contrato';
      if (docType === 'hipossuficiencia') targetBoxId = 'box-generator-hipo';

      setTimeout(() => {
        document.getElementById(targetBoxId)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        previewAndPrintDocument(docType);
      }, 150);
    }

    function getFormattedDocHTML(docType) {
      const clientName = document.getElementById('doc-proc-name')?.value || 'NOME DO CLIENTE';
      const nationality = document.getElementById('doc-proc-nationality')?.value || 'brasileiro(a)';
      const marital = document.getElementById('doc-proc-marital')?.value || 'solteiro(a)';
      const profession = document.getElementById('doc-proc-profession')?.value || 'autônomo(a)';
      const docCpf = document.getElementById('doc-proc-cpf')?.value || '000.000.000-00';
      const docRg = document.getElementById('doc-proc-rg')?.value || '';
      const address = document.getElementById('doc-proc-address')?.value || 'Juiz de Fora - MG';
      const cityDate = document.getElementById('doc-proc-city-date')?.value || getCurrentFullDateFormatted();
      const signName = document.getElementById('doc-proc-sign-name')?.value || clientName;

      // Qualificação completa do cliente
      let qualification = `<strong>${clientName.toUpperCase()}</strong>, ${nationality}, ${marital}, ${profession ? profession + ', ' : ''}`;
      if (docCpf.length > 14) {
        qualification += `inscrita no CNPJ sob o nº <strong>${docCpf}</strong>, `;
      } else {
        if (docRg) qualification += `portador(a) da Cédula de Identidade RG nº <strong>${docRg}</strong>, `;
        qualification += `inscrito(a) no CPF/MF sob o nº <strong>${docCpf}</strong>, `;
      }
      qualification += `residente e domiciliado(a) na ${address}.`;

      // Cabeçalho Timbrado do Escritório
      const letterheadHTML = `
        <div style="text-align: center; border-bottom: 2px solid #b8860b; padding-bottom: 14px; margin-bottom: 24px;">
          <div style="font-size: 20px; font-weight: 800; color: #0a192f; letter-spacing: 1.5px; font-family: Georgia, serif;">
            JORGE EDUARDO DA SILVA ALVIM
          </div>
          <div style="font-size: 12px; font-weight: bold; color: #996515; margin-top: 3px; letter-spacing: 2px;">
            ADVOCACIA & CONSULTORIA JURÍDICA • OAB/MG 222.943
          </div>
          <div style="font-size: 10.5px; color: #64748b; margin-top: 4px;">
            Rua Henrique Dias, nº 259, Galeria 259, Loja 5, Bairro Benfica — Juiz de Fora - MG • CEP 36.080-000
          </div>
        </div>
      `;

      if (docType === 'procuracao') {
        const procObject = document.getElementById('doc-proc-object')?.value || '';
        const procPowers = document.getElementById('doc-proc-powers')?.value || '';
        const procSpecial = document.getElementById('doc-proc-special-powers')?.value || '';

        return `
          ${letterheadHTML}
          <div style="text-align: center; margin-bottom: 26px;">
            <h2 style="font-size: 16px; font-weight: bold; letter-spacing: 2px; text-decoration: underline; color: #0a192f;">
              PROCURAÇÃO AD JUDICIA ET EXTRA
            </h2>
          </div>

          <div style="text-align: justify; line-height: 1.7; space-y-4;">
            <p style="text-indent: 2.5em; margin-bottom: 16px;">
              <strong>OUTORGANTE:</strong> ${qualification}
            </p>

            <p style="text-indent: 2.5em; margin-bottom: 16px;">
              <strong>OUTORGADO:</strong> <strong>JORGE EDUARDO DA SILVA ALVIM</strong>, brasileiro, divorciado, advogado regularmente inscrito nos quadros da Ordem dos Advogados do Brasil, Seccional de Minas Gerais, sob o <strong>nº OAB/MG 222.943</strong>, com escritório profissional estabelecido na Rua Henrique Dias, nº 259, Galeria 259, Loja 5, Bairro Benfica, Juiz de Fora - MG, CEP 36.080-000, onde recebe notificações e intimações de estilo.
            </p>

            <p style="text-indent: 2.5em; margin-bottom: 16px;">
              <strong>OBJETO:</strong> ${procObject}
            </p>

            <p style="text-indent: 2.5em; margin-bottom: 16px;">
              <strong>PODERES:</strong> ${procPowers}
            </p>

            <p style="text-indent: 2.5em; margin-bottom: 26px;">
              <strong>PODERES ESPECIAIS:</strong> ${procSpecial}
            </p>

            <div style="text-align: center; margin-top: 36px; margin-bottom: 45px;">
              <p>${cityDate}.</p>
            </div>

            <div style="text-align: center; margin-top: 60px;">
              <div style="border-top: 1px solid #000; width: 320px; margin: 0 auto 6px auto;"></div>
              <p style="font-weight: bold; margin: 0;">${signName.toUpperCase()}</p>
              <p style="font-size: 11px; color: #475569; margin: 0;">Outorgante</p>
            </div>
          </div>
        `;
      }

      if (docType === 'contrato') {
        const contratoObject = document.getElementById('doc-contrato-object')?.value || '';
        const contratoTotal = parseFloat(document.getElementById('doc-contrato-total')?.value) || 0;
        const contratoInst = parseInt(document.getElementById('doc-contrato-inst-count')?.value, 10) || 1;
        const contratoInstVal = contratoInst > 0 ? (contratoTotal / contratoInst) : 0;
        const contratoDueDate = document.getElementById('doc-contrato-due-date')?.value || '';
        const paymentNotes = document.getElementById('doc-contrato-payment-notes')?.value || '';
        const extraClauses = document.getElementById('doc-contrato-clauses')?.value || '';

        let paymentText = `Pelos serviços ora contratados, o(a) CONTRATANTE pagará ao CONTRATADO o valor total de <strong>${formatMoney(contratoTotal)}</strong>`;
        if (contratoInst > 1) {
          paymentText += `, a ser quitado em <strong>${contratoInst} parcelas</strong> de <strong>${formatMoney(contratoInstVal)}</strong>`;
          if (contratoDueDate) {
            paymentText += `, com vencimento da primeira parcela em <strong>${formatDate(contratoDueDate)}</strong> e as subsequentes no mesmo dia dos meses subsequentes.`;
          } else {
            paymentText += `.`;
          }
        } else {
          paymentText += ` em parcela única à vista.`;
        }
        if (paymentNotes) {
          paymentText += ` ${paymentNotes}`;
        }

        return `
          ${letterheadHTML}
          <div style="text-align: center; margin-bottom: 22px;">
            <h2 style="font-size: 15px; font-weight: bold; letter-spacing: 1px; text-decoration: underline; color: #0a192f;">
              CONTRATO DE PRESTAÇÃO DE SERVIÇOS E HONORÁRIOS ADVOCATÍCIOS
            </h2>
          </div>

          <div style="text-align: justify; line-height: 1.6; font-size: 11pt;">
            <p style="text-indent: 2.5em; margin-bottom: 12px;">
              Pelo presente instrumento particular de contrato de honorários advocatícios, têm entre si justo e contratado:
            </p>

            <p style="text-indent: 2.5em; margin-bottom: 12px;">
              <strong>CONTRATANTE:</strong> ${qualification}
            </p>

            <p style="text-indent: 2.5em; margin-bottom: 16px;">
              <strong>CONTRATADO:</strong> <strong>JORGE EDUARDO DA SILVA ALVIM</strong>, brasileiro, divorciado, advogado, inscrito na OAB/MG sob o nº <strong>222.943</strong>, com escritório profissional na Rua Henrique Dias, nº 259, Galeria 259, Loja 5, Bairro Benfica, Juiz de Fora - MG, CEP 36.080-000.
            </p>

            <p style="text-indent: 2.5em; margin-bottom: 12px;">
              <strong>CLÁUSULA PRIMEIRA - DO OBJETO:</strong> ${contratoObject}
            </p>

            <p style="text-indent: 2.5em; margin-bottom: 12px;">
              <strong>CLÁUSULA SEGUNDA - DOS HONORÁRIOS:</strong> ${paymentText}
            </p>

            <div style="margin-bottom: 16px; white-space: pre-line;">
              ${extraClauses}
            </div>

            <p style="text-indent: 2.5em; margin-bottom: 24px;">
              E, por estarem assim justos e contratados, assinam o presente em 02 (duas) vias de igual teor e forma para um só efeito.
            </p>

            <div style="text-align: center; margin-top: 24px; margin-bottom: 40px;">
              <p>${cityDate}.</p>
            </div>

            <!-- Bloco de Assinaturas -->
            <div style="display: flex; justify-content: space-around; margin-top: 50px; text-align: center;">
              <div style="width: 42%;">
                <div style="border-top: 1px solid #000; margin-bottom: 5px;"></div>
                <strong>${signName.toUpperCase()}</strong>
                <div style="font-size: 10px; color: #64748b;">CONTRATANTE</div>
              </div>
              <div style="width: 42%;">
                <div style="border-top: 1px solid #000; margin-bottom: 5px;"></div>
                <strong>JORGE EDUARDO DA SILVA ALVIM</strong>
                <div style="font-size: 10px; color: #64748b;">OAB/MG 222.943 — CONTRATADO</div>
              </div>
            </div>

            <!-- Testemunhas -->
            <div style="display: flex; justify-content: space-around; margin-top: 45px; text-align: left; font-size: 10.5px; color: #475569;">
              <div style="width: 42%;">
                <div style="border-top: 1px dashed #94a3b8; margin-bottom: 4px;"></div>
                1. Testemunha: ________________________<br/>CPF:
              </div>
              <div style="width: 42%;">
                <div style="border-top: 1px dashed #94a3b8; margin-bottom: 4px;"></div>
                2. Testemunha: ________________________<br/>CPF:
              </div>
            </div>

          </div>
        `;
      }

      if (docType === 'hipossuficiencia') {
        const hipoStatement = document.getElementById('doc-hipo-statement')?.value || '';

        return `
          ${letterheadHTML}
          <div style="text-align: center; margin-bottom: 30px;">
            <h2 style="font-size: 16px; font-weight: bold; letter-spacing: 2px; text-decoration: underline; color: #0a192f;">
              DECLARAÇÃO DE HIPOSSUFICIÊNCIA FINANCEIRA
            </h2>
            <div style="font-size: 12px; color: #64748b; margin-top: 4px; font-style: italic;">
              (Gratuidade da Justiça — Lei Federal nº 1.060/50 e Art. 98 do CPC)
            </div>
          </div>

          <div style="text-align: justify; line-height: 1.8; font-size: 12pt;">
            <p style="text-indent: 2.5em; margin-bottom: 24px;">
              Eu, ${qualification}
            </p>

            <p style="text-indent: 2.5em; margin-bottom: 30px;">
              ${hipoStatement}
            </p>

            <p style="text-indent: 2.5em; margin-bottom: 36px;">
              Por ser expressão da verdade, firmo a presente declaração para que surta seus jurídicos e legais efeitos.
            </p>

            <div style="text-align: center; margin-top: 40px; margin-bottom: 60px;">
              <p>${cityDate}.</p>
            </div>

            <div style="text-align: center; margin-top: 70px;">
              <div style="border-top: 1px solid #000; width: 320px; margin: 0 auto 6px auto;"></div>
              <p style="font-weight: bold; margin: 0;">${signName.toUpperCase()}</p>
              <p style="font-size: 11px; color: #475569; margin: 0;">Declarante</p>
            </div>
          </div>
        `;
      }

      return '';
    }

    function previewAndPrintDocument(docType) {
      currentPreviewDocType = docType;
      const html = getFormattedDocHTML(docType);
      const container = document.getElementById('printable-document-content');
      if (container) {
        container.innerHTML = html;
      }

      const titles = {
        'procuracao': 'Procuração Ad Judicia et Extra (OAB/MG 222.943)',
        'contrato': 'Contrato de Prestação de Serviços e Honorários Advocatícios',
        'hipossuficiencia': 'Declaração de Hipossuficiência Financeira (Gratuidade da Justiça)'
      };
      document.getElementById('doc-preview-title').textContent = titles[docType] || 'Visualização de Documento';

      // Registro de Auditoria da Geração/Impressão do Documento
      const clientSelect = document.getElementById('doc-client-select');
      const selectedClientId = clientSelect ? clientSelect.value : '';
      const selectedClient = allClients.find(c => c.id === selectedClientId);
      const docName = titles[docType] || docType;

      logAuditClientEvent(
        'GERACAO_DOC',
        `GERAR_${docType.toUpperCase()}`,
        'DOCUMENTOS',
        selectedClientId || null,
        `Geração/Impressão de ${docName} para o cliente ${selectedClient ? selectedClient.full_name : 'Cliente'} (${selectedClient ? (selectedClient.cpf || selectedClient.cnpj || 'S/N') : 'S/N'}).`,
        { docType, clientId: selectedClientId, clientName: selectedClient?.full_name, clientDoc: selectedClient?.cpf || selectedClient?.cnpj, timestamp: new Date().toISOString() }
      );

      document.getElementById('doc-preview-modal').classList.remove('hidden');
    }

    function closeDocPreviewModal() {
      document.getElementById('doc-preview-modal').classList.add('hidden');
    }

    function copyDocumentText(docType) {
      const html = getFormattedDocHTML(docType);
      const tempDiv = document.createElement('div');
      tempDiv.innerHTML = html;
      const cleanText = tempDiv.innerText.replace(/\n\s*\n/g, '\n\n');

      navigator.clipboard.writeText(cleanText).then(() => {
        alert('📋 Texto do documento copiado para a área de transferência com sucesso!');
      }).catch(() => {
        alert('Não foi possível copiar automaticamente. Por favor, selecione e copie o texto.');
      });
    }

    function copyCurrentPreviewDoc() {
      copyDocumentText(currentPreviewDocType);
    }


  // ==========================================================================
  // EXPORTAÇÕES GLOBAIS PARA INTERFACE (ONCLICK & COMPATIBILIDADE)
  // ==========================================================================
  window.getCurrentFullDateFormatted = typeof getCurrentFullDateFormatted !== 'undefined' ? getCurrentFullDateFormatted : window.getCurrentFullDateFormatted;
  window.initDocsTab = typeof initDocsTab !== 'undefined' ? initDocsTab : window.initDocsTab;
  window.handleDocClientSelect = typeof handleDocClientSelect !== 'undefined' ? handleDocClientSelect : window.handleDocClientSelect;
  window.setProcObjectPreset = typeof setProcObjectPreset !== 'undefined' ? setProcObjectPreset : window.setProcObjectPreset;
  window.recalcDocContractInst = typeof recalcDocContractInst !== 'undefined' ? recalcDocContractInst : window.recalcDocContractInst;
  window.generateDocForClient = typeof generateDocForClient !== 'undefined' ? generateDocForClient : window.generateDocForClient;
  window.getFormattedDocHTML = typeof getFormattedDocHTML !== 'undefined' ? getFormattedDocHTML : window.getFormattedDocHTML;
  window.previewAndPrintDocument = typeof previewAndPrintDocument !== 'undefined' ? previewAndPrintDocument : window.previewAndPrintDocument;
  window.closeDocPreviewModal = typeof closeDocPreviewModal !== 'undefined' ? closeDocPreviewModal : window.closeDocPreviewModal;
  window.copyDocumentText = typeof copyDocumentText !== 'undefined' ? copyDocumentText : window.copyDocumentText;
  window.copyCurrentPreviewDoc = typeof copyCurrentPreviewDoc !== 'undefined' ? copyCurrentPreviewDoc : window.copyCurrentPreviewDoc;
})();
