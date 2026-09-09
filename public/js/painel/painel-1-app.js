/**
 * ==============================================================================
 * PAINEL DE CONTROLE - CORE SHELL & COORDENADOR DE ABAS (JORGE ALVIM ADVOCACIA)
 * ==============================================================================
 * Este arquivo atua como orquestrador central e provedor de utilitários globais.
 * Todas as 16 abas funcionais foram decompostas e modularizadas em:
 * `public/js/tabs/tab-<modulo>.js`.
 * ==============================================================================
 */

    // TOKEN_KEY e USER_KEY são declarados em /js/core/api.js (escopo global dos
    // scripts). Não redeclarar aqui — a duplicação com `const` quebrava o painel
    // ("Identifier 'TOKEN_KEY' has already been declared").

    let allLeads = [];
    let allUsers = [];
    let allClients = [];
    let allLawsuits = [];

    const _pwdVisibilityTimers = {};
    function togglePasswordVisibility(inputId) {
      const input = document.getElementById(inputId);
      if (!input) return;

      if (_pwdVisibilityTimers[inputId]) {
        clearTimeout(_pwdVisibilityTimers[inputId]);
        delete _pwdVisibilityTimers[inputId];
      }

      if (input.type === 'password') {
        input.type = 'text';
        // Auto-reverter para protegido (password) após 3.5 segundos por privacidade e segurança
        _pwdVisibilityTimers[inputId] = setTimeout(() => {
          if (input) input.type = 'password';
          delete _pwdVisibilityTimers[inputId];
        }, 3500);
      } else {
        input.type = 'password';
      }

      // Reverter imediatamente ao perder o foco (blur)
      if (!input._hasAutoSecureBlur) {
        input._hasAutoSecureBlur = true;
        input.addEventListener('blur', () => {
          input.type = 'password';
          if (_pwdVisibilityTimers[inputId]) {
            clearTimeout(_pwdVisibilityTimers[inputId]);
            delete _pwdVisibilityTimers[inputId];
          }
        });
      }
    }

    function getToken() {
      return localStorage.getItem(TOKEN_KEY);
    }

    function getAuthHeaders() {
      return {
        'Authorization': `Bearer ${getToken()}`
      };
    }

    function formatMoney(val) {
      const num = parseFloat(val) || 0;
      return num.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    }

    function formatDate(dateStr) {
      if (!dateStr) return '—';
      try {
        const [year, month, day] = dateStr.split('T')[0].split('-');
        if (year && month && day) {
          return `${day}/${month}/${year}`;
        }
        return dateStr;
      } catch (e) {
        return dateStr;
      }
    }

    function copyToClipboard(text, btnElement) {
      navigator.clipboard.writeText(text).then(() => {
        if (btnElement) {
          const originalText = btnElement.innerHTML;
          btnElement.innerHTML = '<span>✓ Copiado!</span>';
          setTimeout(() => {
            btnElement.innerHTML = originalText;
          }, 1500);
        }
      });
    }

    // ================= MÁSCARAS E PREENCHIMENTO UNIVERSAL =================
    function maskCPF(input) {
      let v = input.value.replace(/\D/g, '').slice(0, 11);
      if (v.length > 9) v = v.replace(/(\d{3})(\d{3})(\d{3})(\d{1,2})/, '$1.$2.$3-$4');
      else if (v.length > 6) v = v.replace(/(\d{3})(\d{3})(\d{1,3})/, '$1.$2.$3');
      else if (v.length > 3) v = v.replace(/(\d{3})(\d{1,3})/, '$1.$2');
      input.value = v;
    }

    function maskCNPJ(input) {
      let v = input.value.replace(/\D/g, '').slice(0, 14);
      if (v.length > 12) v = v.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{1,2})/, '$1.$2.$3/$4-$5');
      else if (v.length > 8) v = v.replace(/(\d{2})(\d{3})(\d{3})(\d{1,4})/, '$1.$2.$3/$4');
      else if (v.length > 5) v = v.replace(/(\d{2})(\d{3})(\d{1,3})/, '$1.$2.$3');
      else if (v.length > 2) v = v.replace(/(\d{2})(\d{1,3})/, '$1.$2');
      input.value = v;
    }

    function maskCEP(input) {
      let v = input.value.replace(/\D/g, '').slice(0, 8);
      if (v.length > 5) v = v.replace(/(\d{5})(\d{1,3})/, '$1-$2');
      input.value = v;
    }

    function maskCNJ(input) {
      let v = input.value.replace(/\D/g, '').slice(0, 20);
      if (v.length > 16) v = v.replace(/(\d{7})(\d{2})(\d{4})(\d{1})(\d{2})(\d{1,4})/, '$1-$2.$3.$4.$5.$6');
      else if (v.length > 14) v = v.replace(/(\d{7})(\d{2})(\d{4})(\d{1})(\d{1,2})/, '$1-$2.$3.$4.$5');
      else if (v.length > 13) v = v.replace(/(\d{7})(\d{2})(\d{4})(\d{1})/, '$1-$2.$3.$4');
      else if (v.length > 9) v = v.replace(/(\d{7})(\d{2})(\d{1,4})/, '$1-$2.$3');
      else if (v.length > 7) v = v.replace(/(\d{7})(\d{1,2})/, '$1-$2');
      input.value = v;
    }

    // 1. Auto-Busca Universal por CEP
    async function lookupAndFillCep(cepValue, streetId, neighId, cityId, stateId, numId) {
      const clean = (cepValue || '').replace(/\D/g, '');
      if (clean.length !== 8) return;

      try {
        const res = await fetch(`/api/lookup/cep/${clean}`);
        const data = await res.json();
        if (data.success && data.address) {
          const a = data.address;
          if (streetId && document.getElementById(streetId)) document.getElementById(streetId).value = a.street || '';
          if (neighId && document.getElementById(neighId)) document.getElementById(neighId).value = a.neighborhood || '';
          if (cityId && document.getElementById(cityId)) document.getElementById(cityId).value = a.city || '';
          if (stateId && document.getElementById(stateId)) document.getElementById(stateId).value = a.state || '';
          if (numId && document.getElementById(numId)) {
            document.getElementById(numId).focus();
          }
        }
      } catch (err) {
        console.error('Erro na busca de CEP:', err);
      }
    }

    function autoLookupClientCep() {
      lookupAndFillCep(document.getElementById('cli-cep')?.value, 'cli-street', 'cli-neighborhood', 'cli-city', 'cli-state', 'cli-number');
    }

    function autoLookupOfficeCep() {
      lookupAndFillCep(document.getElementById('off-modal-cep')?.value, 'off-modal-street', 'off-modal-neighborhood', 'off-modal-city', 'off-modal-state', 'off-modal-number');
    }

    function autoLookupEmployeeCep() {
      lookupAndFillCep(document.getElementById('emp-cep')?.value, 'emp-street', 'emp-neighborhood', 'emp-city', 'emp-state', 'emp-number');
    }

    function autoLookupMemberCep() {
      lookupAndFillCep(document.getElementById('mem-modal-cep')?.value, 'mem-modal-street', 'mem-modal-neighborhood', 'mem-modal-city', 'mem-modal-state', 'mem-modal-number');
    }

    // 2. Auto-Busca de CNPJ na Receita Federal
    async function autoLookupClientCnpj() {
      const cnpjInput = document.getElementById('cli-cnpj');
      if (!cnpjInput) return;
      const clean = cnpjInput.value.replace(/\D/g, '');
      if (clean.length !== 14) return;

      try {
        const res = await fetch(`/api/lookup/cnpj/${clean}`);
        const data = await res.json();
        if (data.success && data.company) {
          const c = data.company;
          if (document.getElementById('cli-fullname') && c.corporate_name) {
            document.getElementById('cli-fullname').value = c.corporate_name;
          }
          if (document.getElementById('cli-email') && c.email) {
            document.getElementById('cli-email').value = c.email;
          }
          if (document.getElementById('cli-phone') && c.phone) {
            document.getElementById('cli-phone').value = c.phone;
          }
          if (document.getElementById('cli-street') && c.street) {
            document.getElementById('cli-street').value = c.street;
          }
          if (document.getElementById('cli-number') && c.number) {
            document.getElementById('cli-number').value = c.number;
          }
          if (document.getElementById('cli-complement') && c.complement) {
            document.getElementById('cli-complement').value = c.complement;
          }
          if (document.getElementById('cli-neighborhood') && c.neighborhood) {
            document.getElementById('cli-neighborhood').value = c.neighborhood;
          }
          if (document.getElementById('cli-city') && c.city) {
            document.getElementById('cli-city').value = c.city;
          }
          if (document.getElementById('cli-state') && c.state) {
            document.getElementById('cli-state').value = c.state;
          }
          if (document.getElementById('cli-cep') && c.cep) {
            document.getElementById('cli-cep').value = c.cep;
          }
          if (c.representative_name && document.getElementById('cli-rep-name')) {
            document.getElementById('cli-rep-name').value = c.representative_name;
          }
          if (c.representative_cpf && document.getElementById('cli-rep-cpf')) {
            document.getElementById('cli-rep-cpf').value = c.representative_cpf;
          }
        }
      } catch (err) {
        console.error('Erro na consulta CNPJ:', err);
      }
    }

    // 3. Auto-Detecção Inteligente de CPF de Pessoa
    async function autoLookupClientCpf() {
      const cpfInput = document.getElementById('cli-cpf');
      if (!cpfInput) return;
      const clean = cpfInput.value.replace(/\D/g, '');
      if (clean.length !== 11) return;

      try {
        const res = await fetch(`/api/lookup/person/${clean}`);
        const data = await res.json();
        const badge = document.getElementById('cli-cpf-found-badge');
        const applyBtn = document.getElementById('cli-cpf-apply-btn');

        if (data.success && data.person && badge) {
          const p = data.person;
          document.getElementById('cli-cpf-found-name').textContent = `${p.full_name} (${p.source_type})`;
          document.getElementById('cli-cpf-found-detail').textContent = `Encontrado em ${p.source_type} • Telefone: ${p.phone || '—'} • ${p.city || ''}/${p.state || ''}`;
          badge.classList.remove('hidden');

          applyBtn.onclick = () => {
            if (p.full_name && document.getElementById('cli-fullname')) document.getElementById('cli-fullname').value = p.full_name;
            if (p.rg && document.getElementById('cli-rg')) document.getElementById('cli-rg').value = p.rg;
            if (p.nationality && document.getElementById('cli-nationality')) document.getElementById('cli-nationality').value = p.nationality;
            if (p.marital_status && document.getElementById('cli-marital-status')) document.getElementById('cli-marital-status').value = p.marital_status;
            if (p.profession && document.getElementById('cli-profession')) document.getElementById('cli-profession').value = p.profession;
            if (p.phone && document.getElementById('cli-phone')) document.getElementById('cli-phone').value = p.phone;
            if (p.email && document.getElementById('cli-email')) document.getElementById('cli-email').value = p.email;
            if (p.street && document.getElementById('cli-street')) document.getElementById('cli-street').value = p.street;
            if (p.number && document.getElementById('cli-number')) document.getElementById('cli-number').value = p.number;
            if (p.complement && document.getElementById('cli-complement')) document.getElementById('cli-complement').value = p.complement;
            if (p.neighborhood && document.getElementById('cli-neighborhood')) document.getElementById('cli-neighborhood').value = p.neighborhood;
            if (p.city && document.getElementById('cli-city')) document.getElementById('cli-city').value = p.city;
            if (p.state && document.getElementById('cli-state')) document.getElementById('cli-state').value = p.state;
            if (p.cep && document.getElementById('cli-cep')) document.getElementById('cli-cep').value = p.cep;
            if (p.filiation_father && document.getElementById('cli-father')) document.getElementById('cli-father').value = p.filiation_father;
            if (p.filiation_mother && document.getElementById('cli-mother')) document.getElementById('cli-mother').value = p.filiation_mother;
            badge.classList.add('hidden');
          };
        } else if (badge) {
          badge.classList.add('hidden');
        }
      } catch (err) {
        console.error('Erro na consulta de CPF:', err);
      }
    }

    // 4. Auto-Decodificação e Preenchimento de Processo por CNJ
    async function autoLookupLawsuitCnj() {
      const cnjInput = document.getElementById('lawsuit-cnj');
      if (!cnjInput) return;
      const clean = cnjInput.value.replace(/\D/g, '');
      if (clean.length !== 20) return;

      try {
        const res = await fetch(`/api/lookup/cnj/${clean}`);
        const data = await res.json();
        if (data.success && data.lawsuit) {
          const l = data.lawsuit;
          if (l.tribunal && document.getElementById('lawsuit-tribunal')) {
            document.getElementById('lawsuit-tribunal').value = l.tribunal;
          }
          if (l.instance && document.getElementById('lawsuit-instance')) {
            document.getElementById('lawsuit-instance').value = l.instance;
          }
          if (l.court_branch && document.getElementById('lawsuit-court-branch')) {
            document.getElementById('lawsuit-court-branch').value = l.court_branch;
          }
          if (l.action_type && document.getElementById('lawsuit-action-type')) {
            document.getElementById('lawsuit-action-type').value = l.action_type;
          }
          if (l.distribution_date && document.getElementById('lawsuit-dist-date')) {
            document.getElementById('lawsuit-dist-date').value = l.distribution_date;
          }
          if (l.judge_name && document.getElementById('lawsuit-judge')) {
            document.getElementById('lawsuit-judge').value = l.judge_name;
          }
        }
      } catch (err) {
        console.error('Erro ao decodificar CNJ:', err);
      }
    }

    // 5. Conversão Direta de Lead em Cliente em 1-Clique
    function convertLeadToClient(leadId) {
      const lead = allLeads.find(l => String(l.id) === String(leadId));
      if (!lead) return;

      // Abre o modal de cliente em modo novo
      openNewClientModal();

      // Preenche os campos vindos do lead
      if (document.getElementById('cli-fullname')) document.getElementById('cli-fullname').value = lead.name || '';
      if (document.getElementById('cli-phone')) document.getElementById('cli-phone').value = lead.phone || '';
      if (document.getElementById('cli-email')) document.getElementById('cli-email').value = lead.email || '';
      if (document.getElementById('cli-city')) document.getElementById('cli-city').value = lead.city || 'Juiz de Fora';
      if (document.getElementById('cli-notes')) {
        document.getElementById('cli-notes').value = `[Convertido do Atendimento #${lead.id} - Área: ${lead.area || 'Geral'}]\n${lead.message || ''}`;
      }
    }

    // 6. Gerador Inteligente de Documentos Timbrados com Qualificação Automática
    let currentGeneratedDoc = { title: '', content: '', date: '', clientName: '' };

    function openLegalDocModal(docType = 'procuracao', clientId = '', lawsuitId = '') {
      populateLegalDocSelects(clientId, lawsuitId);
      if (document.getElementById('doc-select-type')) {
        document.getElementById('doc-select-type').value = docType;
      }
      document.getElementById('legal-doc-modal')?.classList.remove('hidden');
      generateLegalDocLive();
    }

    function closeLegalDocModal(force) {
      if (!force && typeof window.confirmDiscardModalChanges === 'function') {
        if (!window.confirmDiscardModalChanges('legal-doc-modal', 'no documento jurídico')) return;
      }
      document.getElementById('legal-doc-modal')?.classList.add('hidden');
    }

    function populateLegalDocSelects(preselectedClientId = '', preselectedLawsuitId = '') {
      const clientSelect = document.getElementById('doc-select-client');
      const lawsuitSelect = document.getElementById('doc-select-lawsuit');

      if (clientSelect) {
        clientSelect.innerHTML = '<option value="">Selecione o cliente cadastrado...</option>' +
          allClients.map(c => `
            <option value="${c.id}" ${String(c.id) === String(preselectedClientId) ? 'selected' : ''}>
              ${c.full_name} (${c.client_type === 'PJ' ? 'CNPJ: ' + (c.cnpj || '—') : 'CPF: ' + (c.cpf || '—')})
            </option>
          `).join('');
      }

      if (lawsuitSelect) {
        const availableLaws = preselectedClientId 
          ? allLawsuits.filter(l => String(l.client_id) === String(preselectedClientId))
          : allLawsuits;

        lawsuitSelect.innerHTML = '<option value="">Nenhum processo específico (Finalidade Geral)</option>' +
          availableLaws.map(l => `
            <option value="${l.id}" ${String(l.id) === String(preselectedLawsuitId) ? 'selected' : ''}>
              CNJ: ${l.cnj_number} (${l.tribunal || 'Tribunal'} - ${l.action_type || 'Ação'})
            </option>
          `).join('');
      }
    }

    async function generateLegalDocLive() {
      const docType = document.getElementById('doc-select-type')?.value || 'procuracao';
      const clientId = document.getElementById('doc-select-client')?.value;
      const lawsuitId = document.getElementById('doc-select-lawsuit')?.value;

      if (!clientId) {
        document.getElementById('doc-preview-title').textContent = 'SELECIONE UM CLIENTE';
        document.getElementById('doc-preview-body').innerHTML = '<p class="text-center py-6 text-slate-400 italic">Por favor, selecione um cliente no menu acima para carregar automaticamente a qualificação completa, endereço e poderes legais.</p>';
        document.getElementById('doc-preview-client-name').textContent = 'Nome do Cliente';
        return;
      }

      try {
        const res = await fetch('/api/documents/generate-template', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
          body: JSON.stringify({
            template_type: docType,
            client_id: clientId,
            lawsuit_id: lawsuitId || undefined
          })
        });

        const data = await res.json();
        if (data.success && data.document) {
          const doc = data.document;
          currentGeneratedDoc = doc;
          document.getElementById('doc-preview-title').textContent = doc.title;
          document.getElementById('doc-preview-body').innerHTML = doc.content;
          document.getElementById('doc-preview-date').textContent = doc.date_formatted;
          document.getElementById('doc-preview-client-name').textContent = doc.client_name;
        } else {
          document.getElementById('doc-preview-body').innerHTML = `<p class="text-rose-600 font-bold">${data.error || 'Erro ao gerar documento.'}</p>`;
        }
      } catch (err) {
        console.error('Erro ao gerar documento live:', err);
      }
    }

    function printLegalDoc() {
      const printContents = document.getElementById('legal-doc-printable-area').innerHTML;
      const printWindow = window.open('', '_blank');
      printWindow.document.write(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>${currentGeneratedDoc.title || 'Documento Jurídico'}</title>
          <style>
            @page { size: A4; margin: 20mm; }
            body { font-family: 'Times New Roman', Times, serif; font-size: 12pt; line-height: 1.6; color: #111; padding: 20px; }
            h2 { text-transform: uppercase; font-size: 14pt; margin-bottom: 2px; }
            h3 { text-transform: uppercase; font-size: 13pt; text-align: center; margin: 20px 0; }
            p { text-align: justify; margin-bottom: 12px; }
            .header-timbrado { text-align: center; border-bottom: 2px solid #333; padding-bottom: 15px; margin-bottom: 25px; }
            .signature-area { margin-top: 50px; text-align: center; }
            .signature-line { width: 300px; border-top: 1px solid #111; margin: 0 auto 5px auto; }
          </style>
        </head>
        <body onload="window.print();">
          ${printContents}
        </body>
        </html>
      `);
      printWindow.document.close();
    }

    function copyLegalDocText() {
      const area = document.getElementById('legal-doc-printable-area');
      if (!area) return;
      const text = area.innerText;
      navigator.clipboard.writeText(text).then(() => {
        alert('📋 Texto do documento copiado para a área de transferência com sucesso!');
      });
    }

    // =========================================================================
    // SISTEMA DE PROTEÇÃO CONTRA PERDA DE DADOS NÃO SALVOS (UNSAVED CHANGES)
    // =========================================================================
    const _dirtyFormElements = new Set();

    const TAB_MODAL_MAP = {
      leads: ['lead-modal', 'modal-lead-details'],
      clients: ['client-modal', 'modal-import-clients'],
      lawsuits: ['lawsuit-modal', 'movement-modal', 'judicial-process-modal'],
      calendar: ['modal-calendar-event', 'calendar-event-modal', 'modal-calendar-sync', 'calendar-sync-modal', 'modal-calendar-view', 'calendar-view-modal', 'modal-activity-draft', 'modal-deadline-calculator'],
      publications: ['modal-publication-view'],
      finance: ['transaction-modal', 'alvara-modal', 'asaas-charge-modal', 'manual-pay-modal'],
      nfse: ['nfse-issue-modal', 'nfse-modal', 'nfse-preview-modal'],
      docs: ['legal-doc-modal', 'doc-preview-modal'],
      blog: ['blog-post-editor-modal'],
      'site-boxes': ['card-site-box', 'tab-content-site-boxes'],
      'meta-ads': ['modal-meta-config', 'modal-meta-preview'],
      users: ['user-modal', 'edit-user-modal', 'new-user-modal'],
      hr: ['hr-modal-time-sign', 'hr-modal-time-punch', 'hr-modal-payslip', 'hr-modal-vacation-form', 'hr-modal-employee', 'hr-modal-exam-form', 'modal-labor-termination', 'hr-modal', 'labor-termination-modal'],
      offices: ['office-modal'],
      drive: ['drive-upload-modal'],
      audit: ['audit-details-modal', 'audit-modal'],
      'pre-clients': ['pre-client-detail-modal', 'pre-client-modal'],
      'admin-requests': ['modal-request-field', 'modal-list-field-requests', 'admin-request-modal'],
      rockets: ['rocket-new-modal', 'rocket-modal']
    };

    function _isDirtyTrackingCandidate(el) {
      if (!el || !el.tagName) return false;
      if (el.isContentEditable) return true;
      const tag = el.tagName.toLowerCase();
      if (tag === 'textarea') return true;
      if (tag === 'select') return true;
      if (tag === 'input') {
        const type = (el.type || 'text').toLowerCase();
        if (['button', 'submit', 'reset', 'hidden'].includes(type)) return false;
        // Ignora campos de pesquisa rápida e filtros para não bloquear navegação
        if (el.id && (el.id.includes('search') || el.id.includes('filter') || el.id.includes('busca') || el.id.includes('quick'))) return false;
        return true;
      }
      return false;
    }

    document.addEventListener('input', function (e) {
      if (_isDirtyTrackingCandidate(e.target)) {
        _dirtyFormElements.add(e.target);
      }
    }, true);

    document.addEventListener('change', function (e) {
      if (_isDirtyTrackingCandidate(e.target)) {
        _dirtyFormElements.add(e.target);
      }
    }, true);

    // Quando qualquer form é submetido ou resetado, limpa seus elementos do rastreador
    document.addEventListener('submit', function (e) {
      if (e.target && e.target.elements) {
        Array.from(e.target.elements).forEach(el => _dirtyFormElements.delete(el));
      }
    }, true);

    document.addEventListener('reset', function (e) {
      if (e.target && e.target.elements) {
        Array.from(e.target.elements).forEach(el => _dirtyFormElements.delete(el));
      }
    }, true);

    window.hasUnsavedChangesIn = function (containerOrTabId) {
      // Limpar referências de elementos desconectados da árvore DOM
      for (const el of Array.from(_dirtyFormElements)) {
        if (!document.body.contains(el)) {
          _dirtyFormElements.delete(el);
        }
      }

      if (!containerOrTabId) {
        return _dirtyFormElements.size > 0;
      }

      const targetContainers = [];
      if (typeof containerOrTabId === 'string') {
        const cleanId = containerOrTabId.replace(/^tab-content-/, '');
        
        // Elemento direto por ID
        const direct = document.getElementById(containerOrTabId);
        if (direct) targetContainers.push(direct);

        // Container padrão da aba
        const tabContent = document.getElementById('tab-content-' + cleanId);
        if (tabContent && !targetContainers.includes(tabContent)) targetContainers.push(tabContent);

        // Janela do Gerenciador de Janelas (painel-3.js)
        const winEl = document.getElementById('jaw-win-' + cleanId);
        if (winEl && !targetContainers.includes(winEl)) targetContainers.push(winEl);

        // Modais vinculados ao módulo
        const modals = TAB_MODAL_MAP[cleanId] || [];
        modals.forEach(mId => {
          const m = document.getElementById(mId);
          if (m && !targetContainers.includes(m)) targetContainers.push(m);
        });
      } else if (containerOrTabId && containerOrTabId.nodeType) {
        targetContainers.push(containerOrTabId);
      }

      if (targetContainers.length === 0) return false;

      for (const el of _dirtyFormElements) {
        for (const c of targetContainers) {
          if (c.contains(el)) return true;
        }
      }
      return false;
    };

    window.clearUnsavedChanges = function (containerOrTabId) {
      if (!containerOrTabId) {
        _dirtyFormElements.clear();
        return;
      }

      const targetContainers = [];
      if (typeof containerOrTabId === 'string') {
        const cleanId = containerOrTabId.replace(/^tab-content-/, '');
        const direct = document.getElementById(containerOrTabId);
        if (direct) targetContainers.push(direct);
        const tabContent = document.getElementById('tab-content-' + cleanId);
        if (tabContent) targetContainers.push(tabContent);
        const winEl = document.getElementById('jaw-win-' + cleanId);
        if (winEl) targetContainers.push(winEl);
        const modals = TAB_MODAL_MAP[cleanId] || [];
        modals.forEach(mId => {
          const m = document.getElementById(mId);
          if (m) targetContainers.push(m);
        });
      } else if (containerOrTabId && containerOrTabId.nodeType) {
        targetContainers.push(containerOrTabId);
      }

      for (const el of Array.from(_dirtyFormElements)) {
        if (!document.body.contains(el)) {
          _dirtyFormElements.delete(el);
          continue;
        }
        for (const c of targetContainers) {
          if (c.contains(el)) {
            _dirtyFormElements.delete(el);
            break;
          }
        }
      }
    };

    window.confirmDiscardModalChanges = function (modalId, label) {
      if (typeof window.hasUnsavedChangesIn === 'function' && window.hasUnsavedChangesIn(modalId)) {
        const text = label || 'neste formulário';
        if (!confirm(`⚠️ Você possui alterações não salvas ${text}.\n\nDeseja fechar e descartar as alterações?`)) {
          return false;
        }
        if (typeof window.clearUnsavedChanges === 'function') {
          window.clearUnsavedChanges(modalId);
        }
      }
      return true;
    };

    window.addEventListener('beforeunload', function (e) {
      if (typeof window.hasUnsavedChangesIn === 'function' && window.hasUnsavedChangesIn()) {
        e.preventDefault();
        e.returnValue = 'Você possui alterações não salvas. Deseja realmente sair sem salvar?';
        return e.returnValue;
      }
    });

    // Alternar entre Abas
    function switchTab(tab) {
      if (typeof window.moduleAllowed === 'function' && !window.moduleAllowed(tab)) {
        if (typeof window.wmToast === 'function') {
          window.wmToast('Acesso Restrito (RBAC): Seu perfil de operador não possui permissão para acessar o módulo "' + tab + '".');
        } else {
          alert('Acesso Restrito (RBAC): Seu perfil de operador não possui permissão para acessar o módulo "' + tab + '".');
        }
        return;
      }

      const currentTab = window._currentActiveTab || (window.location.hash ? window.location.hash.replace('#', '') : 'leads');
      if (currentTab !== tab && typeof window.hasUnsavedChangesIn === 'function' && window.hasUnsavedChangesIn(currentTab)) {
        const proceed = confirm('⚠️ Atenção: Você possui alterações não salvas nesta tela.\n\nSe trocar de aba agora, os dados que você digitou serão descartados.\n\nDeseja realmente sair sem salvar?');
        if (!proceed) {
          if (window.location.hash && window.location.hash !== '#' + currentTab) {
            history.replaceState(null, '', '#' + currentTab);
          }
          return;
        }
        if (typeof window.clearUnsavedChanges === 'function') {
          window.clearUnsavedChanges(currentTab);
        }
      }
      window._currentActiveTab = tab;

      const tabLeads = document.getElementById('tab-content-leads');
      const tabClients = document.getElementById('tab-content-clients');
      const tabLawsuits = document.getElementById('tab-content-lawsuits');
      const tabCalendar = document.getElementById('tab-content-calendar');
      const tabPublications = document.getElementById('tab-content-publications');
      const tabDocs = document.getElementById('tab-content-docs');
      const tabFinance = document.getElementById('tab-content-finance');
      const tabNfse = document.getElementById('tab-content-nfse');
      const tabBlog = document.getElementById('tab-content-blog');
      const tabAudit = document.getElementById('tab-content-audit');
      const tabPreClients = document.getElementById('tab-content-pre-clients');
      const tabJudicial = document.getElementById('tab-content-judicial');
      const tabOffices = document.getElementById('tab-content-offices');
      const tabDrive = document.getElementById('tab-content-drive');
      const tabUsers = document.getElementById('tab-content-users');
      const tabHr = document.getElementById('tab-content-hr');

      const btnLeads = document.getElementById('tab-btn-leads');
      const btnClients = document.getElementById('tab-btn-clients');
      const btnLawsuits = document.getElementById('tab-btn-lawsuits');
      const btnCalendar = document.getElementById('tab-btn-calendar');
      const btnPublications = document.getElementById('tab-btn-publications');
      const btnDocs = document.getElementById('tab-btn-docs');
      const btnFinance = document.getElementById('tab-btn-finance');
      const btnNfse = document.getElementById('tab-btn-nfse');
      const btnBlog = document.getElementById('tab-btn-blog');
      const btnAudit = document.getElementById('tab-btn-audit');
      const btnPreClients = document.getElementById('tab-btn-pre-clients');
      const btnJudicial = document.getElementById('tab-btn-judicial');
      const btnOffices = document.getElementById('tab-btn-offices');
      const btnDrive = document.getElementById('tab-btn-drive');
      const btnUsers = document.getElementById('tab-btn-users');
      const btnHr = document.getElementById('tab-btn-hr');

      const activeClass = "flex items-center space-x-1.5 px-3.5 py-1.5 rounded-xl font-bold text-xs transition-all border border-gold-400 bg-gradient-to-r from-amber-500 via-gold-500 to-amber-600 text-white shadow-sm cursor-pointer";
      const inactiveClass = "flex items-center space-x-1.5 px-3.5 py-1.5 rounded-xl font-semibold text-xs text-slate-700 hover:text-navy-950 hover:bg-slate-100 transition-all border border-slate-200 bg-white cursor-pointer";

      tabLeads.classList.add('hidden');
      tabClients.classList.add('hidden');
      tabLawsuits.classList.add('hidden');
      if (tabCalendar) tabCalendar.classList.add('hidden');
      if (tabPublications) tabPublications.classList.add('hidden');
      tabDocs.classList.add('hidden');
      if (tabFinance) tabFinance.classList.add('hidden');
      if (tabNfse) tabNfse.classList.add('hidden');
      if (tabBlog) tabBlog.classList.add('hidden');
      if (tabAudit) tabAudit.classList.add('hidden');
      if (tabPreClients) tabPreClients.classList.add('hidden');
      if (tabJudicial) tabJudicial.classList.add('hidden');
      if (tabOffices) tabOffices.classList.add('hidden');
      if (tabDrive) tabDrive.classList.add('hidden');
      if (tabHr) tabHr.classList.add('hidden');
      tabUsers.classList.add('hidden');

      btnLeads.className = inactiveClass;
      btnClients.className = inactiveClass;
      btnLawsuits.className = inactiveClass;
      if (btnCalendar) btnCalendar.className = inactiveClass;
      if (btnPublications) btnPublications.className = inactiveClass;
      btnDocs.className = inactiveClass;
      if (btnFinance) btnFinance.className = inactiveClass;
      if (btnNfse) btnNfse.className = inactiveClass;
      if (btnBlog) btnBlog.className = inactiveClass;
      if (btnAudit) btnAudit.className = inactiveClass;
      if (btnPreClients) btnPreClients.className = inactiveClass;
      if (btnJudicial) btnJudicial.className = inactiveClass;
      if (btnOffices) btnOffices.className = inactiveClass;
      if (btnDrive) btnDrive.className = inactiveClass;
      if (btnHr) btnHr.className = inactiveClass;
      btnUsers.className = inactiveClass;

      // Foguetes: aba adicionada na modularização; não constava no switchTab inline.
      const tabRockets = document.getElementById('tab-content-rockets');
      const btnRockets = document.getElementById('tab-btn-rockets');
      if (tabRockets) tabRockets.classList.add('hidden');
      if (btnRockets) btnRockets.className = inactiveClass;

      // Novas abas (dashboard, assinaturas, LGPD, notificações, manutenção, meta-ads, site-boxes, faq) — módulos de gestão.
      ['dashboard', 'esign', 'lgpd', 'notifications', 'admin-requests', 'maintenance', 'meta-ads', 'site-boxes', 'faq'].forEach(function (t) {
        const c = document.getElementById('tab-content-' + t);
        const b = document.getElementById('tab-btn-' + t);
        if (c) c.classList.add('hidden');
        if (b) b.className = inactiveClass;
      });
      const btnSiteBoxesTop = document.getElementById('tab-btn-site-boxes-top');
      if (btnSiteBoxesTop) btnSiteBoxesTop.className = inactiveClass;
      const btnFaqTop = document.getElementById('tab-btn-faq-top');
      if (btnFaqTop) btnFaqTop.className = inactiveClass;

      if (tab === 'leads') {
        tabLeads.classList.remove('hidden');
        btnLeads.className = activeClass;
        loadLeads();
      } else if (tab === 'clients') {
        tabClients.classList.remove('hidden');
        btnClients.className = activeClass;
        loadClients();
      } else if (tab === 'lawsuits') {
        tabLawsuits.classList.remove('hidden');
        btnLawsuits.className = activeClass;
        loadLawsuits();
      } else if (tab === 'calendar') {
        if (tabCalendar) tabCalendar.classList.remove('hidden');
        if (btnCalendar) btnCalendar.className = activeClass;
        initCalendarTab();
      } else if (tab === 'publications') {
        if (tabPublications) tabPublications.classList.remove('hidden');
        if (btnPublications) btnPublications.className = activeClass;
        initPublicationsTab();
      } else if (tab === 'docs') {
        tabDocs.classList.remove('hidden');
        btnDocs.className = activeClass;
        initDocsTab();
      } else if (tab === 'finance') {
        if (tabFinance) tabFinance.classList.remove('hidden');
        if (btnFinance) btnFinance.className = activeClass;
        initFinanceTab();
      } else if (tab === 'nfse') {
        if (tabNfse) tabNfse.classList.remove('hidden');
        if (btnNfse) btnNfse.className = activeClass;
        loadNfseList();
      } else if (tab === 'blog') {
        if (tabBlog) tabBlog.classList.remove('hidden');
        if (btnBlog) btnBlog.className = activeClass;
        loadAdminBlogPosts();
      } else if (tab === 'audit') {
        if (tabAudit) tabAudit.classList.remove('hidden');
        if (btnAudit) btnAudit.className = activeClass;
        initAuditTab();
      } else if (tab === 'pre-clients') {
        if (tabPreClients) tabPreClients.classList.remove('hidden');
        if (btnPreClients) btnPreClients.className = activeClass;
        initPreClientsTab();
      } else if (tab === 'judicial') {
        if (tabJudicial) tabJudicial.classList.remove('hidden');
        if (btnJudicial) btnJudicial.className = activeClass;
        initJudicialTab();
      } else if (tab === 'offices') {
        if (tabOffices) tabOffices.classList.remove('hidden');
        if (btnOffices) btnOffices.className = activeClass;
        initOfficesTab();
      } else if (tab === 'drive') {
        if (tabDrive) tabDrive.classList.remove('hidden');
        if (btnDrive) btnDrive.className = activeClass;
        initDriveTab();
      } else if (tab === 'users') {
        tabUsers.classList.remove('hidden');
        btnUsers.className = activeClass;
        loadAccessControlMatrix();
        loadUsers();
      } else if (tab === 'hr') {
        if (tabHr) tabHr.classList.remove('hidden');
        if (btnHr) btnHr.className = activeClass;
        initHrTab();
      } else if (tab === 'rockets') {
        if (tabRockets) tabRockets.classList.remove('hidden');
        if (btnRockets) btnRockets.className = activeClass;
        if (typeof initRocketsTab === 'function') initRocketsTab();
      } else if (tab === 'dashboard') {
        document.getElementById('tab-content-dashboard').classList.remove('hidden');
        document.getElementById('tab-btn-dashboard').className = activeClass;
        loadDashboardOverview();
        if (typeof window.loadMeuDiaHoje === 'function') window.loadMeuDiaHoje();
      } else if (tab === 'esign') {
        document.getElementById('tab-content-esign').classList.remove('hidden');
        document.getElementById('tab-btn-esign').className = activeClass;
        loadEsignRequests();
      } else if (tab === 'lgpd') {
        document.getElementById('tab-content-lgpd').classList.remove('hidden');
        document.getElementById('tab-btn-lgpd').className = activeClass;
        loadLgpdRequests();
      } else if (tab === 'notifications') {
        document.getElementById('tab-content-notifications').classList.remove('hidden');
        document.getElementById('tab-btn-notifications').className = activeClass;
        loadNotificationsList();
      } else if (tab === 'admin-requests') {
        document.getElementById('tab-content-admin-requests').classList.remove('hidden');
        document.getElementById('tab-btn-admin-requests').className = activeClass;
        loadAdminRequests();
      } else if (tab === 'maintenance') {
        const c = document.getElementById('tab-content-maintenance');
        const b = document.getElementById('tab-btn-maintenance');
        if (c) c.classList.remove('hidden');
        if (b) b.className = activeClass;
        if (typeof window.loadMaintenanceHealth === 'function') {
          window.loadMaintenanceHealth();
        }
      } else if (tab === 'meta-ads') {
        const c = document.getElementById('tab-content-meta-ads');
        const b = document.getElementById('tab-btn-meta-ads');
        if (c) c.classList.remove('hidden');
        if (b) b.className = activeClass;
        if (typeof window.loadMetaAdsTab === 'function') {
          window.loadMetaAdsTab();
        }
      } else if (tab === 'site-boxes') {
        const c = document.getElementById('tab-content-site-boxes');
        const b = document.getElementById('tab-btn-site-boxes');
        const bTop = document.getElementById('tab-btn-site-boxes-top');
        if (c) c.classList.remove('hidden');
        if (b) b.className = activeClass;
        if (bTop) bTop.className = activeClass;
        if (typeof window.loadSiteBoxesTab === 'function') {
          window.loadSiteBoxesTab();
        }
      } else if (tab === 'faq') {
        const c = document.getElementById('tab-content-faq');
        const b = document.getElementById('tab-btn-faq');
        const bTop = document.getElementById('tab-btn-faq-top');
        if (c) c.classList.remove('hidden');
        if (b) b.className = activeClass;
        if (bTop) bTop.className = activeClass;
        if (typeof window.loadFaqTab === 'function') {
          window.loadFaqTab();
        }
      }

      renderTabChart(tab);
    }

    // 1. Autenticação & Inicialização
    async function checkAuth() {
      const token = getToken();
      if (!token) {
        showLoginScreen();
        return;
      }

      try {
        const res = await fetch('/api/auth/me', { headers: { 'Authorization': `Bearer ${token}` } });
        if (res.ok) {
          const data = await res.json();
          showPanelScreen(data.user);
          loadLeads(); // popula o badge "Atendimentos" já na carga inicial
          loadClients();
          loadLawsuits();
          loadOffices();
          loadDriveFiles();
          loadCalendarSummary();
          loadPublicationsStats();
        } else {
          localStorage.removeItem(TOKEN_KEY);
          localStorage.removeItem(USER_KEY);
          showLoginScreen();
        }
      } catch (err) {
        showLoginScreen();
      }
    }

    function showLoginScreen() {
      document.documentElement.classList.remove('has-admin-session');
      document.getElementById('login-view').classList.remove('hidden');
      document.getElementById('panel-view').classList.add('hidden');
      const form = document.getElementById('login-form');
      if (form) form.reset();
      const pwd = document.getElementById('login-password');
      if (pwd) { pwd.value = ''; pwd.type = 'password'; }
      const usr = document.getElementById('login-username');
      if (usr) usr.value = '';
      initAdminGoogleAuth();
    }

    function handleHashRouting() {
      const hash = (window.location.hash || '').toLowerCase().replace('#', '').trim();
      const params = new URLSearchParams(window.location.search);
      const tabParam = (params.get('tab') || '').toLowerCase();
      const subtabParam = (params.get('subtab') || '').toLowerCase();

      if (hash === 'moderacao' || hash === 'comentarios' || hash === 'blog-moderacao' || (tabParam === 'blog' && subtabParam === 'comments')) {
        switchTab('blog');
        setTimeout(() => switchBlogSubTab('comments'), 50);
      } else if (hash === 'blog' || tabParam === 'blog') {
        switchTab('blog');
      } else if (hash === 'radar' || hash === 'judicial' || tabParam === 'judicial') {
        switchTab('judicial');
      } else if (hash === 'rescisao' || hash === 'rescisao-clt' || (tabParam === 'hr' && subtabParam === 'termination')) {
        switchTab('hr');
        setTimeout(() => switchHrSubTab('termination'), 50);
      } else if (hash === 'rascunhos' || hash === 'agenda' || tabParam === 'calendar') {
        switchTab('calendar');
      } else if (hash === 'hr' || hash === 'rh' || hash === 'pessoal' || tabParam === 'hr') {
        switchTab('hr');
      } else if (hash === 'finance' || hash === 'financeiro' || tabParam === 'finance') {
        switchTab('finance');
      } else if (hash === 'clientes' || hash === 'clients' || tabParam === 'clients') {
        switchTab('clients');
      } else if (hash === 'processos' || hash === 'lawsuits' || tabParam === 'lawsuits') {
        switchTab('lawsuits');
      } else if (hash === 'leads' || hash === 'atendimentos' || tabParam === 'leads') {
        switchTab('leads');
      } else if (hash === 'pre-clients' || hash === 'visitas' || tabParam === 'pre-clients') {
        switchTab('pre-clients');
      } else if (hash) {
        switchTab(hash);
      }
    }

    window.addEventListener('hashchange', handleHashRouting);

    function showPanelScreen(user) {
      document.documentElement.classList.add('has-admin-session');
      document.getElementById('login-view').classList.add('hidden');
      document.getElementById('panel-view').classList.remove('hidden');
      const form = document.getElementById('login-form');
      if (form) form.reset();
      const pwd = document.getElementById('login-password');
      if (pwd) { pwd.value = ''; pwd.type = 'password'; }
      const usr = document.getElementById('login-username');
      if (usr) usr.value = '';
      const name = user ? user.name || user.username : 'Administrador';
      const usrDisplay = document.getElementById('current-user-display');
      if (usrDisplay) usrDisplay.textContent = name;
      const usrDisplayMob = document.getElementById('current-user-display-mobile');
      if (usrDisplayMob) usrDisplayMob.textContent = name;
      if (typeof window.fetchPerms === 'function') {
        window.fetchPerms();
      }
      handleHashRouting();
    }

    async function handleLogin(e) {
      e.preventDefault();
      const usernameInput = document.getElementById('login-username');
      const passwordInput = document.getElementById('login-password');
      const username = usernameInput ? usernameInput.value.trim() : '';
      const password = passwordInput ? passwordInput.value : '';
      const errorMsg = document.getElementById('login-error-msg');
      const errorText = document.getElementById('login-error-text');

      // Limpeza imediata da senha da interface por segurança e privacidade
      if (passwordInput) {
        passwordInput.value = '';
        passwordInput.type = 'password';
      }

      errorMsg.classList.add('hidden');

      try {
        const res = await fetch('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username, password })
        });

        const data = await res.json();

        if (res.ok && data.success) {
          if (usernameInput) usernameInput.value = '';
          const form = document.getElementById('login-form');
          if (form) form.reset();
          localStorage.setItem(TOKEN_KEY, data.token);
          localStorage.setItem(USER_KEY, JSON.stringify(data.user));
          showPanelScreen(data.user);
          loadLeads(); // popula o badge "Atendimentos" já na carga inicial
          loadClients();
          loadLawsuits();
          loadOffices();
          loadDriveFiles();
          loadCalendarSummary();
          loadPublicationsStats();
          loadHrDashboard();
        } else {
          errorText.textContent = data.error || 'Credenciais inválidas.';
          errorMsg.classList.remove('hidden');
        }
      } catch (err) {
        errorText.textContent = 'Erro ao comunicar com o servidor.';
        errorMsg.classList.remove('hidden');
      }
    }

    let adminGoogleClientId = null;
    let adminGoogleTokenClient = null;

    async function initAdminGoogleAuth() {
      try {
        const res = await fetch('/api/auth/google-config');
        if (res.ok) {
          const data = await res.json();
          if (data.clientId) {
            adminGoogleClientId = data.clientId;
            if (window.google && window.google.accounts) {
              if (window.google.accounts.id) {
                window.google.accounts.id.initialize({
                  client_id: adminGoogleClientId,
                  callback: handleAdminGoogleCredentialResponse,
                  auto_select: false,
                  cancel_on_tap_outside: true
                });
                try { window.google.accounts.id.disableAutoSelect(); } catch (e) {}
              }

              if (window.google.accounts.oauth2) {
                adminGoogleTokenClient = window.google.accounts.oauth2.initTokenClient({
                  client_id: adminGoogleClientId,
                  scope: 'email profile openid',
                  callback: async (tokenResponse) => {
                    if (tokenResponse && tokenResponse.access_token) {
                      await handleAdminGoogleAccessToken(tokenResponse.access_token);
                    }
                  }
                });
              }
              // NÃO chamamos renderButton para manter o botão corporativo limpo sem estampar foto ou email
            }
          }
        }
      } catch (err) {
        console.warn('[GOOGLE AUTH ADMIN] Configuração indisponível:', err);
      }
    }

    async function handleAdminGoogleCredentialResponse(response) {
      const credential = response ? response.credential : null;
      if (!credential) return;
      await submitAdminGooglePayload({ credential });
    }

    async function handleAdminGoogleAccessToken(accessToken) {
      if (!accessToken) return;
      await submitAdminGooglePayload({ access_token: accessToken });
    }

    async function submitAdminGooglePayload(payload) {
      const errorMsg = document.getElementById('login-error-msg');
      const errorText = document.getElementById('login-error-text');
      if (errorMsg) errorMsg.classList.add('hidden');

      try {
        const res = await fetch('/api/auth/google', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        const data = await res.json();

        if (res.ok && data.success) {
          const form = document.getElementById('login-form');
          if (form) form.reset();
          const pwd = document.getElementById('login-password');
          if (pwd) { 
            pwd.value = ''; 
            pwd.type = 'password'; 
            pwd.setAttribute('readonly', 'readonly');
          }
          const usr = document.getElementById('login-username');
          if (usr) usr.value = '';
          localStorage.setItem(TOKEN_KEY, data.token);
          localStorage.setItem(USER_KEY, JSON.stringify(data.user));
          showPanelScreen(data.user);
          loadLeads();
          loadClients();
          loadLawsuits();
          loadOffices();
          loadDriveFiles();
          loadCalendarSummary();
          loadPublicationsStats();
          loadHrDashboard();
        } else {
          if (errorText) errorText.textContent = data.error || 'Conta Google não autorizada para este painel.';
          if (errorMsg) errorMsg.classList.remove('hidden');
        }
      } catch (err) {
        if (errorText) errorText.textContent = 'Erro ao conectar ao servidor para autenticação Google.';
        if (errorMsg) errorMsg.classList.remove('hidden');
      }
    }

    function handleAdminGoogleAuth() {
      const errorMsg = document.getElementById('login-error-msg');
      const errorText = document.getElementById('login-error-text');
      if (errorMsg) errorMsg.classList.add('hidden');

      if (window.GoogleAuthClient) {
        window.GoogleAuthClient.triggerAuth({
          buttonId: 'btn-admin-google',
          prompt: 'select_account',
          onSuccess: async (payload) => {
            await handleAdminGoogleAccessToken(payload.access_token);
          },
          onError: (err) => {
            const isBlocked = err && (err.message === 'GOOGLE_BLOCKED_OR_UNAVAILABLE' || err.type === 'popup_failed_to_open');
            const msg = isBlocked
              ? 'A janela do Google não pôde ser aberta. Se estiver usando bloqueador de anúncios (ex: AdBlock, Brave Shields) ou bloqueio de popups, permita o site ou utilize seu Usuário e Senha.'
              : 'Autenticação com a conta Google cancelada ou não concluída.';
            if (errorText) errorText.textContent = msg;
            if (errorMsg) errorMsg.classList.remove('hidden');
          }
        });
      } else {
        if (errorText) errorText.textContent = 'Carregando serviço de autenticação Google. Tente novamente em instantes.';
        if (errorMsg) errorMsg.classList.remove('hidden');
      }
    }

    // ================= RECUPERAÇÃO DE SENHA DO ADMINISTRADOR =================
    function showAdminResetAlert(msg, type = 'error') {
      const alertBox = document.getElementById('admin-reset-alert');
      const alertText = document.getElementById('admin-reset-alert-text');
      if (!alertBox || !alertText) return;
      alertText.textContent = msg;
      if (type === 'success') {
        alertBox.className = 'my-4 p-3 rounded-xl text-xs font-semibold flex items-center space-x-2 bg-emerald-50 border border-emerald-200 text-emerald-800';
      } else {
        alertBox.className = 'my-4 p-3 rounded-xl text-xs font-semibold flex items-center space-x-2 bg-rose-50 border border-rose-200 text-rose-700';
      }
      alertBox.classList.remove('hidden');
    }

    function openAdminForgotPasswordModal() {
      const modal = document.getElementById('admin-password-reset-modal');
      if (modal) modal.classList.remove('hidden');
      const step1 = document.getElementById('admin-reset-step-1');
      const step2 = document.getElementById('admin-reset-step-2');
      const alertBox = document.getElementById('admin-reset-alert');
      if (step1) step1.classList.remove('hidden');
      if (step2) step2.classList.add('hidden');
      if (alertBox) alertBox.classList.add('hidden');

      const loginUser = document.getElementById('login-username');
      const resetUser = document.getElementById('admin-reset-username');
      if (loginUser && resetUser && loginUser.value.trim()) {
        resetUser.value = loginUser.value.trim();
      }
      setTimeout(() => { resetUser?.focus(); }, 150);
    }

    function closeAdminForgotPasswordModal() {
      const modal = document.getElementById('admin-password-reset-modal');
      if (modal) modal.classList.add('hidden');
      const step1 = document.getElementById('admin-reset-step-1');
      const step2 = document.getElementById('admin-reset-step-2');
      if (step1) step1.classList.remove('hidden');
      if (step2) step2.classList.add('hidden');
      const alertBox = document.getElementById('admin-reset-alert');
      if (alertBox) alertBox.classList.add('hidden');
    }

    async function requestAdminResetCode() {
      const userInput = document.getElementById('admin-reset-username');
      const sendBtn = document.getElementById('btn-admin-send-code');
      const username = userInput ? userInput.value.trim() : '';

      if (!username) {
        showAdminResetAlert('Por favor, informe seu usuário ou e-mail de acesso.', 'error');
        return;
      }

      if (sendBtn) {
        sendBtn.disabled = true;
        sendBtn.innerHTML = `<span>Enviando código...</span>`;
      }

      try {
        const res = await fetch('/api/auth/forgot-password', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username })
        });
        const data = await res.json();

        if (res.ok && data.success) {
          showAdminResetAlert('Código enviado com sucesso para o WhatsApp do Dr. Jorge Alvim!', 'success');
          document.getElementById('admin-reset-step-1')?.classList.add('hidden');
          document.getElementById('admin-reset-step-2')?.classList.remove('hidden');
          setTimeout(() => { document.getElementById('admin-reset-code')?.focus(); }, 150);
        } else {
          showAdminResetAlert(data.error || 'Não foi possível solicitar o código de recuperação.', 'error');
        }
      } catch (err) {
        showAdminResetAlert('Erro ao conectar ao servidor.', 'error');
      } finally {
        if (sendBtn) {
          sendBtn.disabled = false;
          sendBtn.innerHTML = `<span>Enviar Código via WhatsApp</span> <span>📲</span>`;
        }
      }
    }

    async function confirmAdminResetPassword() {
      const userInput = document.getElementById('admin-reset-username');
      const codeInput = document.getElementById('admin-reset-code');
      const passInput = document.getElementById('admin-reset-newpassword');
      const confirmBtn = document.getElementById('btn-admin-confirm-reset');

      const username = userInput ? userInput.value.trim() : '';
      const code = codeInput ? codeInput.value.trim() : '';
      const new_password = passInput ? passInput.value.trim() : '';

      if (!code || !new_password) {
        showAdminResetAlert('Informe o código de 6 dígitos e a nova senha.', 'error');
        return;
      }

      if (new_password.length < 4 || new_password.length > 12) {
        showAdminResetAlert('A nova senha deve ter entre 4 e 12 caracteres.', 'error');
        return;
      }

      if (confirmBtn) {
        confirmBtn.disabled = true;
        confirmBtn.innerHTML = `<span>Atualizando credencial...</span>`;
      }

      try {
        const res = await fetch('/api/auth/reset-password', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username, code, new_password })
        });
        const data = await res.json();

        if (res.ok && data.success) {
          closeAdminForgotPasswordModal();
          const errorMsg = document.getElementById('login-error-msg');
          const errorText = document.getElementById('login-error-text');
          if (errorMsg && errorText) {
            errorText.textContent = 'Senha redefinida com sucesso! Entre com a nova senha.';
            errorMsg.className = 'p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-semibold flex items-center space-x-2';
            errorMsg.classList.remove('hidden');
          }
          const pwd = document.getElementById('login-password');
          if (pwd) {
            pwd.removeAttribute('readonly');
            pwd.value = '';
            pwd.focus();
          }
        } else {
          showAdminResetAlert(data.error || 'Código incorreto ou inválido.', 'error');
        }
      } catch (err) {
        showAdminResetAlert('Erro ao conectar ao servidor.', 'error');
      } finally {
        if (confirmBtn) {
          confirmBtn.disabled = false;
          confirmBtn.innerHTML = `<span>Confirmar Nova Senha</span> <span>✓</span>`;
        }
      }
    }

    window.openAdminForgotPasswordModal = openAdminForgotPasswordModal;
    window.closeAdminForgotPasswordModal = closeAdminForgotPasswordModal;
    window.requestAdminResetCode = requestAdminResetCode;
    window.confirmAdminResetPassword = confirmAdminResetPassword;

    async function handleLogout() {
      try {
        await fetch('/api/auth/logout', {
          method: 'POST',
          headers: getAuthHeaders()
        });
      } catch (e) {}
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(USER_KEY);
      const form = document.getElementById('login-form');
      if (form) form.reset();
      const usr = document.getElementById('login-username');
      if (usr) usr.value = '';
      const pwd = document.getElementById('login-password');
      if (pwd) { 
        pwd.value = ''; 
        pwd.type = 'password'; 
        pwd.setAttribute('readonly', 'readonly');
      }
      if (window.google && window.google.accounts && window.google.accounts.id) {
        try { 
          window.google.accounts.id.disableAutoSelect(); 
          window.google.accounts.id.cancel();
        } catch (e) {}
      }
      setTimeout(() => {
        if (pwd) pwd.value = '';
      }, 100);
      showLoginScreen();
    }

    // Proteção contra retenção de senha e formulário ao voltar no histórico do navegador (bfcache) e autofill
    function _wipeAdminAuthFields() {
      if (!getToken()) {
        const usr = document.getElementById('login-username');
        const pwd = document.getElementById('login-password');
        if (document.activeElement === usr || document.activeElement === pwd) return;
        if (usr && usr.value.trim().length > 0) return;
        if (pwd) {
          if (!pwd._hasUnlockListener) {
            pwd._hasUnlockListener = true;
            pwd.addEventListener('focus', function() { this.removeAttribute('readonly'); });
            pwd.addEventListener('pointerdown', function() { this.removeAttribute('readonly'); });
          }
          pwd.value = '';
          pwd.type = 'password';
          pwd.setAttribute('readonly', 'readonly');
        }
        if (usr) usr.value = '';
      }
    }

    window.addEventListener('pageshow', () => {
      _wipeAdminAuthFields();
      setTimeout(_wipeAdminAuthFields, 120);
      setTimeout(_wipeAdminAuthFields, 350);
    });

    document.addEventListener('DOMContentLoaded', () => {
      _wipeAdminAuthFields();
      setTimeout(_wipeAdminAuthFields, 120);
      setTimeout(_wipeAdminAuthFields, 350);
    });

    function refreshData() {
      loadLeads();
      loadClients();
      loadOffices();
      loadAccessControlMatrix();
      loadUsers();
    }


    // ================= EXPORTAÇÃO DE UTILITÁRIOS GLOBAIS =================
    window.allLeads = allLeads;
    function maskPhone(input) {
      if (!input) return;
      let v = input.value.replace(/\D/g, '').slice(0, 11);
      if (v.length > 10) v = v.replace(/(\d{2})(\d{5})(\d{4})/, '($1) $2-$3');
      else if (v.length > 5) v = v.replace(/(\d{2})(\d{4})(\d{0,4})/, '($1) $2-$3');
      else if (v.length > 2) v = v.replace(/(\d{2})(\d{0,5})/, '($1) $2');
      input.value = v;
    }

    window.allLeads = allLeads;
    window.allUsers = allUsers;
    window.allClients = allClients;
    window.allLawsuits = allLawsuits;
    window.getToken = getToken;
    window.getAuthHeaders = getAuthHeaders;
    window.formatMoney = formatMoney;
    window.formatDate = formatDate;
    window.copyToClipboard = copyToClipboard;
    window.maskCPF = maskCPF;
    window.maskCNPJ = maskCNPJ;
    window.maskCEP = maskCEP;
    window.maskCNJ = maskCNJ;
    window.maskPhone = maskPhone;
    window.switchTab = switchTab;
    window.showPanelScreen = showPanelScreen;
    window.showLoginScreen = showLoginScreen;

    // ================= REGISTRO DE SERVICE WORKER PWA =================
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js')
          .then((reg) => console.log('📱 [PWA Painel] Service Worker ativo. Escopo:', reg.scope))
          .catch((err) => console.warn('📱 [PWA Painel] Erro:', err));
      });
    }

    // Inicialização ao Carregar
    document.addEventListener('DOMContentLoaded', checkAuth);

