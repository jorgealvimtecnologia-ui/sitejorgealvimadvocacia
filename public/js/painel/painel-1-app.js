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

    function closeLegalDocModal() {
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

    // Alternar entre Abas
    function switchTab(tab) {
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

      // Novas abas (dashboard, assinaturas, LGPD, notificações, manutenção, meta-ads) — módulos de gestão.
      ['dashboard', 'esign', 'lgpd', 'notifications', 'admin-requests', 'maintenance', 'meta-ads'].forEach(function (t) {
        const c = document.getElementById('tab-content-' + t);
        const b = document.getElementById('tab-btn-' + t);
        if (c) c.classList.add('hidden');
        if (b) b.className = inactiveClass;
      });

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

    async function initAdminGoogleAuth() {
      try {
        const res = await fetch('/api/auth/google-config');
        if (res.ok) {
          const data = await res.json();
          if (data.clientId) {
            adminGoogleClientId = data.clientId;
            if (window.google && window.google.accounts && window.google.accounts.id) {
              window.google.accounts.id.initialize({
                client_id: adminGoogleClientId,
                callback: handleAdminGoogleCredentialResponse,
                auto_select: false,
                cancel_on_tap_outside: true
              });
              const container = document.getElementById('admin-google-btn-container');
              if (container) {
                window.google.accounts.id.renderButton(container, {
                  theme: 'outline',
                  size: 'large',
                  text: 'signin_with',
                  shape: 'rectangular',
                  width: Math.min(container.offsetWidth || 340, 360),
                  logo_alignment: 'left'
                });
              }
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

      const errorMsg = document.getElementById('login-error-msg');
      const errorText = document.getElementById('login-error-text');
      if (errorMsg) errorMsg.classList.add('hidden');

      try {
        const res = await fetch('/api/auth/google', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ credential })
        });
        const data = await res.json();

        if (res.ok && data.success) {
          const form = document.getElementById('login-form');
          if (form) form.reset();
          const pwd = document.getElementById('login-password');
          if (pwd) { pwd.value = ''; pwd.type = 'password'; }
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
      if (window.google && window.google.accounts && window.google.accounts.id && adminGoogleClientId) {
        window.google.accounts.id.prompt();
      } else {
        const errorMsg = document.getElementById('login-error-msg');
        const errorText = document.getElementById('login-error-text');
        if (errorText) errorText.textContent = 'Aguardando inicialização segura do serviço Google. Recarregue a página se persistir.';
        if (errorMsg) errorMsg.classList.remove('hidden');
      }
    }

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
      if (pwd) { pwd.value = ''; pwd.type = 'password'; }
      if (window.google && window.google.accounts && window.google.accounts.id) {
        try { window.google.accounts.id.disableAutoSelect(); } catch (e) {}
      }
      showLoginScreen();
    }

    // Proteção contra retenção de senha ao voltar no histórico do navegador (bfcache)
    window.addEventListener('pageshow', function() {
      const pwd = document.getElementById('login-password');
      if (pwd) {
        pwd.value = '';
        pwd.type = 'password';
      }
      if (!getToken()) {
        const usr = document.getElementById('login-username');
        if (usr) usr.value = '';
        const form = document.getElementById('login-form');
        if (form) form.reset();
      }
    });

    function refreshData() {
      loadLeads();
      loadClients();
      loadOffices();
      loadAccessControlMatrix();
      loadUsers();
    }

    // ================= 2. GESTÃO DE CLIENTES & CONTRATOS =================

    async function loadClients() {
      try {
        const res = await fetch('/api/clients', { headers: getAuthHeaders() });
        if (res.status === 401) {
          handleLogout();
          return;
        }
        const data = await res.json();
        if (data.success) {
          allClients = data.clients;
          renderClients(allClients);
          updateClientsStats(allClients);
        }
      } catch (err) {
        console.error('Erro ao carregar clientes:', err);
      }
    }

    function updateClientsStats(clients) {
      const total = clients.length;
      const pf = clients.filter(c => c.client_type === 'PF').length;
      const pj = clients.filter(c => c.client_type === 'PJ').length;

      let totalContract = 0;
      let totalPaid = 0;
      let totalDue = 0;

      clients.forEach(c => {
        totalContract += (parseFloat(c.contract_value) || 0);
        totalPaid += (parseFloat(c.amount_paid) || 0);
        totalDue += (parseFloat(c.balance_due) || 0);
      });

      document.getElementById('stat-cli-total').textContent = total;
      document.getElementById('stat-cli-pf').textContent = pf;
      document.getElementById('stat-cli-pj').textContent = pj;
      document.getElementById('tab-clients-count').textContent = total;

      document.getElementById('stat-cli-contract-total').textContent = formatMoney(totalContract);
      document.getElementById('stat-cli-paid-total').textContent = formatMoney(totalPaid);
      document.getElementById('stat-cli-due-total').textContent = formatMoney(totalDue);

      const percent = totalContract > 0 ? Math.round((totalPaid / totalContract) * 100) : 0;
      document.getElementById('stat-cli-paid-percent').textContent = `${percent}% liquidado`;
    }

    function filterClients() {
      const query = (document.getElementById('search-clients-input')?.value || '').toLowerCase().trim();
      const type = document.getElementById('filter-client-type')?.value;
      const status = document.getElementById('filter-client-status')?.value;

      const filtered = allClients.filter(c => {
        const matchesQuery = !query || 
          c.full_name.toLowerCase().includes(query) ||
          (c.cpf && c.cpf.includes(query)) ||
          (c.cnpj && c.cnpj.includes(query)) ||
          (c.phone && c.phone.includes(query)) ||
          (c.city && c.city.toLowerCase().includes(query)) ||
          (c.invoice_number && c.invoice_number.toLowerCase().includes(query)) ||
          c.id.toLowerCase().includes(query);

        const matchesType = !type || c.client_type === type;
        const matchesStatus = !status || c.contract_status === status;

        return matchesQuery && matchesType && matchesStatus;
      });

      renderClients(filtered);
    }

    function renderClients(clients) {
      const container = document.getElementById('clients-boxes-container');
      
      if (clients.length === 0) {
        container.innerHTML = `
          <div class="bg-white rounded-3xl border border-slate-200 p-12 text-center text-slate-400 space-y-3 shadow-sm">
            <div class="text-4xl">📂</div>
            <p class="font-bold text-slate-600">Nenhum cliente ou contrato cadastrado no momento.</p>
            <p class="text-xs">Clique no botão <strong>➕ Novo Cliente & Contrato</strong> acima para adicionar o primeiro registro.</p>
          </div>
        `;
        return;
      }

      container.innerHTML = clients.map(client => {
        const isPJ = client.client_type === 'PJ';
        const typeBadge = isPJ 
          ? `<span class="px-2.5 py-1 rounded-lg bg-indigo-50 text-indigo-800 font-bold text-xs border border-indigo-200">🏢 Pessoa Jurídica (Empresa)</span>`
          : `<span class="px-2.5 py-1 rounded-lg bg-blue-50 text-blue-800 font-bold text-xs border border-blue-200">👤 Pessoa Física (PF)</span>`;

        const contractVal = parseFloat(client.contract_value) || 0;
        const paidVal = parseFloat(client.amount_paid) || 0;
        const balanceVal = parseFloat(client.balance_due) || 0;
        const progressPct = contractVal > 0 ? Math.min(100, Math.round((paidVal / contractVal) * 100)) : (paidVal > 0 ? 100 : 0);

        const statusClass = client.contract_status === 'Quitado' 
          ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
          : (client.contract_status === 'Em Cobrança' ? 'bg-rose-50 text-rose-800 border-rose-300' : 'bg-amber-50 text-amber-800 border-amber-300');

        const cleanPhone = (client.phone || '').replace(/\D/g, '');

        // Formatação de Documentos Anexos
        const files = client.files || [];
        const filesListHtml = files.length > 0
          ? files.map(f => `
              <a href="${f.url}" target="_blank" download class="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-white hover:bg-gold-50 border border-slate-200 hover:border-gold-300 text-xs font-semibold text-slate-700 hover:text-gold-800 transition-colors truncate max-w-xs shadow-xs" title="${f.originalName}">
                <span>📄</span>
                <span class="truncate">${f.originalName}</span>
                <span class="text-[10px] text-slate-400">(${Math.round(f.size / 1024)} KB)</span>
              </a>
            `).join('')
          : `<span class="text-xs text-slate-400 italic">Nenhum documento anexado.</span>`;

        // Seção do Representante Legal (se PJ)
        const repLegalHtml = isPJ ? `
          <div class="mt-4 p-4 rounded-2xl bg-amber-50/60 border border-amber-200 space-y-2">
            <div class="flex items-center space-x-2 text-xs font-bold text-amber-900 uppercase">
              <span>👤</span>
              <span>Dados do Representante Legal da Empresa:</span>
            </div>
            <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2 text-xs text-slate-700">
              <div><strong>Nome:</strong> ${client.rep_name || 'Não informado'}</div>
              <div><strong>CPF:</strong> ${client.rep_cpf || 'Não informado'}</div>
              <div><strong>RG:</strong> ${client.rep_rg || 'Não informado'}</div>
              <div class="sm:col-span-2 md:col-span-3 text-slate-600">
                <strong>Endereço Residencial:</strong> ${client.rep_street || ''}, nº ${client.rep_number || ''} ${client.rep_complement ? `(${client.rep_complement})` : ''}, Bairro: ${client.rep_neighborhood || ''}, ${client.rep_city || ''} - ${client.rep_state || ''} | CEP: ${client.rep_cep || ''}
              </div>
            </div>
          </div>
        ` : '';

        return `
          <!-- BOX INDIVIDUAL DO CLIENTE (DESIGN CLARO EXECUTIVO) -->
          <div class="bg-white rounded-3xl border border-slate-200 shadow-md hover:shadow-lg transition-all overflow-hidden" id="client-box-${client.id}">
            
            <!-- Topo do Box -->
            <div class="p-5 sm:p-6 bg-slate-50 border-b border-slate-200 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
              <div class="space-y-1 min-w-0">
                <div class="flex flex-wrap items-center gap-2">
                  <span class="px-2.5 py-0.5 rounded-md bg-gold-100 text-gold-900 font-mono text-xs font-bold border border-gold-300">
                    #${client.id}
                  </span>
                  ${typeBadge}
                  <span class="px-2.5 py-0.5 rounded-md font-bold text-xs border ${statusClass}">
                    ● ${client.contract_status || 'Ativo'}
                  </span>
                </div>
                <h3 class="font-serif font-bold text-lg sm:text-xl text-navy-950 truncate pt-1">
                  ${client.full_name}
                </h3>
              </div>

              <!-- Botões de Ação do Box (Incluindo Botão SALVAR direto no Box) -->
              <div class="flex flex-wrap items-center gap-2 w-full md:w-auto justify-start md:justify-end">
                
                <!-- Kit Inicial (1 Clique) -->
                <button 
                  onclick="openKitInicialModal('${client.id}')" 
                  class="inline-flex items-center space-x-1.5 px-3 py-2 rounded-xl bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 font-bold text-xs transition-colors shadow-xs cursor-pointer"
                  title="Gerar Kit Inicial (Procuração, Contrato e Hipossuficiência) em 1 clique"
                >
                  <span>📄</span>
                  <span>Kit Inicial</span>
                </button>

                <!-- Link Mágico de Documentos -->
                <button 
                  onclick="generateClientMagicUploadLink('${client.id}')" 
                  class="inline-flex items-center space-x-1.5 px-3 py-2 rounded-xl bg-purple-50 hover:bg-purple-100 text-purple-700 border border-purple-200 font-bold text-xs transition-colors shadow-xs cursor-pointer"
                  title="Enviar Link Mágico para o cliente enviar fotos/PDFs de documentos pelo WhatsApp"
                >
                  <span>📎</span>
                  <span>Link Mágico</span>
                </button>

                <!-- Cobrar / PIX -->
                <button 
                  onclick="sendPixPaymentReminder('${client.id}', '${(client.full_name || '').replace(/'/g, "\\'")}', '${client.phone || ''}', '${client.balance_due || 0}')" 
                  class="inline-flex items-center space-x-1.5 px-3 py-2 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 font-bold text-xs transition-colors shadow-xs cursor-pointer"
                  title="Enviar lembrete amigável de honorários com chave PIX pelo WhatsApp"
                >
                  <span>💰</span>
                  <span>Cobrar PIX</span>
                </button>

                <!-- BOTÃO SALVAR DIRETO NO BOX -->
                <button 
                  onclick="saveInlineClient('${client.id}')" 
                  id="btn-inline-save-${client.id}"
                  class="inline-flex items-center space-x-1.5 px-4 py-2 rounded-xl bg-gold-500 hover:bg-gold-400 text-navy-950 font-bold text-xs transition-all shadow-sm cursor-pointer border border-gold-600"
                  title="Salvar alterações do contrato e dados diretamente"
                >
                  <span>💾</span>
                  <span>Salvar</span>
                </button>

                <button 
                  onclick="openEditClientModal('${client.id}')" 
                  class="inline-flex items-center space-x-1.5 px-3.5 py-2 rounded-xl bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 font-bold text-xs transition-colors shadow-xs cursor-pointer"
                  title="Editar cadastro completo e anexar arquivos"
                >
                  <span>✏️</span>
                  <span>Alterar</span>
                </button>

                <button 
                  onclick="deleteClient('${client.id}', '${encodeURIComponent(client.full_name)}')" 
                  class="inline-flex items-center space-x-1.5 px-3.5 py-2 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 font-bold text-xs transition-colors shadow-xs cursor-pointer"
                  title="Excluir cliente e contrato"
                >
                  <span>🗑️</span>
                  <span>Excluir</span>
                </button>
              </div>
            </div>

            <!-- Corpo dos Dados Cadastrais do Cliente -->
            <div class="p-5 sm:p-6 space-y-4">
              
              <!-- Grid de Dados Cadastrais -->
              <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3.5 text-xs text-slate-700">
                
                ${isPJ 
                  ? `<div><span class="text-slate-400 block text-[10px] uppercase font-bold">CNPJ da Empresa</span><strong class="font-mono text-sm text-slate-900">${client.cnpj || '—'}</strong></div>`
                  : `<div><span class="text-slate-400 block text-[10px] uppercase font-bold">CPF</span><strong class="font-mono text-sm text-slate-900">${client.cpf || '—'}</strong></div>
                     <div><span class="text-slate-400 block text-[10px] uppercase font-bold">Carteira de Identidade (RG)</span><strong class="font-mono text-sm text-slate-900">${client.rg || '—'}</strong></div>`
                }

                <div>
                  <span class="text-slate-400 block text-[10px] uppercase font-bold">Telefone / WhatsApp</span>
                  <div class="flex items-center space-x-2 mt-0.5">
                    <strong class="text-slate-900">${client.phone || '—'}</strong>
                    ${cleanPhone ? `
                      <a href="https://wa.me/55${cleanPhone}" target="_blank" class="px-2 py-0.5 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 font-bold text-[10px] inline-flex items-center space-x-1">
                        <span>💬 WhatsApp</span>
                      </a>
                    ` : ''}
                  </div>
                </div>

                <div>
                  <span class="text-slate-400 block text-[10px] uppercase font-bold">E-mail</span>
                  <strong class="truncate block text-slate-900">${client.email || 'Não informado'}</strong>
                </div>

                <div>
                  <span class="text-slate-400 block text-[10px] uppercase font-bold">Redes Sociais</span>
                  <strong class="text-indigo-600 block truncate">${client.social_media || 'Não informado'}</strong>
                </div>

                ${!isPJ ? `
                  <div class="sm:col-span-2">
                    <span class="text-slate-400 block text-[10px] uppercase font-bold">Filiação (Pai e Mãe)</span>
                    <span><strong>Pai:</strong> ${client.filiation_father || 'Não informado'} | <strong>Mãe:</strong> ${client.filiation_mother || 'Não informado'}</span>
                  </div>
                ` : ''}

                <!-- Endereço Completo -->
                <div class="sm:col-span-2 md:col-span-3 pt-2 border-t border-slate-100">
                  <span class="text-slate-400 block text-[10px] uppercase font-bold">Endereço Completo</span>
                  <p class="text-slate-800 text-xs sm:text-sm font-medium">
                    📍 ${client.street || ''}, nº ${client.number || ''} ${client.complement ? `(${client.complement})` : ''} — Bairro: ${client.neighborhood || ''}, ${client.city || ''} - ${client.state || 'MG'}, CEP: ${client.cep || '—'}
                  </p>
                </div>

              </div>

              <!-- Representante Legal (se for PJ) -->
              ${repLegalHtml}

              <!-- Documentos Anexados -->
              <div class="pt-3 border-t border-slate-100 space-y-2">
                <span class="text-slate-500 block text-[11px] uppercase font-bold flex items-center space-x-1.5">
                  <span>📁</span>
                  <span>Documentos Anexados (${files.length} arquivo(s)):</span>
                </span>
                <div class="flex flex-wrap gap-2">
                  ${filesListHtml}
                </div>
              </div>

            </div>

            <!-- BOX DE GESTÃO DE CONTRATO (DESIGN CLARO COM BOTÃO SALVAR INTEGRADO) -->
            <div class="p-5 sm:p-6 bg-gradient-to-br from-slate-50 via-white to-amber-50/40 text-slate-800 border-t border-slate-200">
              
              <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 border-b border-slate-200 pb-3 mb-4">
                <div class="flex items-center space-x-2 text-navy-950 font-serif font-bold text-sm sm:text-base">
                  <span>📑</span>
                  <span>Box de Gestão de Contrato & Financeiro</span>
                </div>
                <div class="flex items-center space-x-2">
                  <span class="text-xs text-slate-500">Edição Rápida:</span>
                  <button 
                    onclick="saveInlineClient('${client.id}')" 
                    class="px-3 py-1 rounded-lg bg-gold-500 hover:bg-gold-400 text-navy-950 font-bold text-xs border border-gold-600 shadow-xs flex items-center space-x-1 cursor-pointer"
                  >
                    <span>💾 Salvar Contrato</span>
                  </button>
                </div>
              </div>

              <!-- Grid Financeiro com Inputs Diretos para Salvar Rápido -->
              <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 sm:gap-4 text-left">
                
                <!-- 1. Valor Total -->
                <div class="bg-white p-3 rounded-2xl border border-slate-200 shadow-xs">
                  <label class="text-[10px] text-slate-500 uppercase font-bold block mb-1">Valor Total (R$)</label>
                  <input 
                    type="number" 
                    step="0.01" 
                    id="inline-contract-val-${client.id}" 
                    value="${contractVal}" 
                    oninput="recalcInlineRow('${client.id}')"
                    class="w-full px-2 py-1 text-xs sm:text-sm font-bold text-navy-950 bg-slate-50 border border-slate-300 rounded-lg focus:bg-white focus:outline-none focus:border-gold-500"
                  />
                </div>

                <!-- 2. Parcelas -->
                <div class="bg-white p-3 rounded-2xl border border-slate-200 shadow-xs">
                  <label class="text-[10px] text-slate-500 uppercase font-bold block mb-1">Parcelas (Qtd)</label>
                  <input 
                    type="number" 
                    id="inline-inst-count-${client.id}" 
                    value="${client.installments_count || 1}" 
                    min="1" 
                    oninput="recalcInlineRow('${client.id}')"
                    class="w-full px-2 py-1 text-xs sm:text-sm font-bold text-navy-950 bg-slate-50 border border-slate-300 rounded-lg focus:bg-white focus:outline-none focus:border-gold-500"
                  />
                </div>

                <!-- 3. Vencimento -->
                <div class="bg-white p-3 rounded-2xl border border-slate-200 shadow-xs">
                  <label class="text-[10px] text-slate-500 uppercase font-bold block mb-1">Vencimento</label>
                  <input 
                    type="date" 
                    id="inline-due-date-${client.id}" 
                    value="${client.due_date || ''}" 
                    class="w-full px-2 py-1 text-xs font-semibold text-slate-800 bg-slate-50 border border-slate-300 rounded-lg focus:bg-white focus:outline-none focus:border-gold-500"
                  />
                </div>

                <!-- 4. Valor Pago -->
                <div class="bg-white p-3 rounded-2xl border border-slate-200 shadow-xs">
                  <label class="text-[10px] text-emerald-700 uppercase font-bold block mb-1">Valor Pago (R$)</label>
                  <input 
                    type="number" 
                    step="0.01" 
                    id="inline-amount-paid-${client.id}" 
                    value="${paidVal}" 
                    oninput="recalcInlineRow('${client.id}')"
                    class="w-full px-2 py-1 text-xs sm:text-sm font-bold text-emerald-700 bg-emerald-50/50 border border-emerald-300 rounded-lg focus:bg-white focus:outline-none focus:border-emerald-500"
                  />
                </div>

                <!-- 5. Saldo a Pagar -->
                <div class="bg-white p-3 rounded-2xl border border-slate-200 shadow-xs">
                  <label class="text-[10px] text-amber-700 uppercase font-bold block mb-1">Saldo a Pagar</label>
                  <div id="inline-balance-display-${client.id}" class="text-xs sm:text-sm font-bold py-1 ${balanceVal > 0 ? 'text-amber-700' : 'text-emerald-700'}">
                    ${formatMoney(balanceVal)}
                  </div>
                </div>

                <!-- 6. Nota Fiscal & Status -->
                <div class="bg-white p-3 rounded-2xl border border-slate-200 shadow-xs">
                  <label class="text-[10px] text-slate-500 uppercase font-bold block mb-1">Nota Fiscal (NF)</label>
                  <input 
                    type="text" 
                    id="inline-invoice-${client.id}" 
                    value="${client.invoice_number || ''}" 
                    placeholder="NF-000"
                    class="w-full px-2 py-1 text-xs font-mono font-bold text-navy-950 bg-slate-50 border border-slate-300 rounded-lg focus:bg-white focus:outline-none focus:border-gold-500"
                  />
                </div>

              </div>

              <!-- Linha Inferior: Status, Progresso e Botão Salvar Principal -->
              <div class="mt-4 pt-3 border-t border-slate-200 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                
                <!-- Status do Contrato -->
                <div class="flex items-center space-x-2 text-xs">
                  <span class="font-bold text-slate-600">Status:</span>
                  <select 
                    id="inline-status-${client.id}" 
                    class="px-2.5 py-1 text-xs font-bold rounded-lg border border-slate-300 bg-white text-navy-950 focus:outline-none focus:border-gold-500"
                  >
                    <option value="Ativo" ${client.contract_status === 'Ativo' ? 'selected' : ''}>🟢 Ativo</option>
                    <option value="Quitado" ${client.contract_status === 'Quitado' ? 'selected' : ''}>✅ Quitado</option>
                    <option value="Em Cobrança" ${client.contract_status === 'Em Cobrança' ? 'selected' : ''}>⚠️ Em Cobrança</option>
                    <option value="Cancelado" ${client.contract_status === 'Cancelado' ? 'selected' : ''}>❌ Cancelado</option>
                  </select>
                </div>

                <!-- Barra de Progresso do Contrato -->
                <div class="flex-1 max-w-xs flex items-center space-x-2 text-xs w-full sm:w-auto">
                  <span class="text-slate-500 text-[11px]">Quitação:</span>
                  <div class="w-full bg-slate-200 rounded-full h-2 overflow-hidden">
                    <div class="bg-gradient-to-r from-gold-500 to-emerald-500 h-2 rounded-full" style="width: ${progressPct}%"></div>
                  </div>
                  <span class="font-bold text-navy-950 text-xs">${progressPct}%</span>
                </div>

                <!-- Botão Salvar em Destaque no Box -->
                <button 
                  onclick="saveInlineClient('${client.id}')" 
                  class="w-full sm:w-auto px-5 py-2 rounded-xl bg-gold-500 hover:bg-gold-400 text-navy-950 font-bold text-xs shadow-sm transition-all flex items-center justify-center space-x-1.5 border border-gold-600"
                >
                  <span>💾</span>
                  <span>Salvar Dados deste Box</span>
                </button>

              </div>

            <!-- BARRA DE DOCUMENTOS ASSINADOS E AÇÕES DO CLIENTE -->
            <div class="px-5 py-3.5 bg-gradient-to-r from-slate-50 via-amber-50/50 to-indigo-50/30 border-t border-slate-200 flex flex-col md:flex-row justify-between items-start md:items-center gap-3">
              <div class="flex items-center space-x-2 text-xs font-bold text-navy-950">
                <span class="text-base">📁</span>
                <span>Documentos Assinados & Contrato do Cliente:</span>
              </div>
              <div class="flex flex-wrap items-center gap-2 w-full md:w-auto justify-start md:justify-end">
                
                <!-- 1. Procuração Assinada -->
                <button 
                  onclick="triggerClientDocUpload('${client.id}', 'procuracao')" 
                  class="px-3 py-1.5 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-900 font-bold text-xs shadow-xs transition-colors cursor-pointer flex items-center space-x-1.5 border border-indigo-200"
                  title="Anexar ou atualizar a Procuração Ad Judicia física/PDF assinada pelo cliente"
                >
                  <span>📎</span>
                  <span>Anexar Procuração Assinada</span>
                </button>
                ${(() => {
                  const procFile = (client.files || []).find(f => f.docType === 'procuracao_assinada' || (f.originalName || '').toLowerCase().includes('procura'));
                  return procFile ? `
                    <a 
                      href="${procFile.url}" 
                      target="_blank" 
                      class="px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs shadow-xs transition-colors flex items-center space-x-1"
                      title="Visualizar / Imprimir Procuração Assinada do Cliente"
                    >
                      <span>🖨️</span>
                      <span>Imprimir Procuração</span>
                    </a>
                  ` : '';
                })()}

                <!-- 2. Contrato Assinado -->
                <button 
                  onclick="triggerClientDocUpload('${client.id}', 'contrato')" 
                  class="px-3 py-1.5 rounded-xl bg-amber-50 hover:bg-amber-100 text-gold-900 font-bold text-xs shadow-xs transition-colors cursor-pointer flex items-center space-x-1.5 border border-gold-300"
                  title="Anexar ou atualizar o Contrato de Honorários assinado pelo cliente"
                >
                  <span>📎</span>
                  <span>Anexar Contrato Assinado</span>
                </button>
                ${(() => {
                  const contFile = (client.files || []).find(f => f.docType === 'contrato_assinado' || (f.originalName || '').toLowerCase().includes('contrat'));
                  return contFile ? `
                    <a 
                      href="${contFile.url}" 
                      target="_blank" 
                      class="px-3 py-1.5 rounded-xl bg-gold-500 hover:bg-gold-400 text-navy-950 font-bold text-xs shadow-xs transition-colors flex items-center space-x-1 border border-gold-600"
                      title="Visualizar / Imprimir Contrato de Honorários Assinado"
                    >
                      <span>🖨️</span>
                      <span>Imprimir Contrato</span>
                    </a>
                  ` : '';
                })()}

                <!-- 3. Declaração Assinada -->
                <button 
                  onclick="triggerClientDocUpload('${client.id}', 'declaracao')" 
                  class="px-3 py-1.5 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-900 font-bold text-xs shadow-xs transition-colors cursor-pointer flex items-center space-x-1.5 border border-emerald-300"
                  title="Anexar a Declaração de Hipossuficiência assinada pelo cliente"
                >
                  <span>📎</span>
                  <span>Anexar Declaração Assinada</span>
                </button>
                ${(() => {
                  const decFile = (client.files || []).find(f => f.docType === 'declaracao_assinada' || (f.originalName || '').toLowerCase().includes('declar') || (f.originalName || '').toLowerCase().includes('hipo'));
                  return decFile ? `
                    <a 
                      href="${decFile.url}" 
                      target="_blank" 
                      class="px-3 py-1.5 rounded-xl bg-emerald-700 hover:bg-emerald-600 text-white font-bold text-xs shadow-xs transition-colors flex items-center space-x-1"
                      title="Visualizar / Imprimir Declaração de Hipossuficiência Assinada"
                    >
                      <span>🖨️</span>
                      <span>Imprimir Declaração</span>
                    </a>
                  ` : '';
                })()}

                <!-- Carnê Asaas -->
                <button 
                  onclick="openClientFinancialTab('${client.id}')" 
                  class="px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs shadow-xs transition-colors cursor-pointer flex items-center space-x-1 border border-slate-700"
                  title="Abrir carnê de parcelas e gerar cobranças Asaas para este cliente"
                >
                  <span>⚡</span>
                  <span>Carnê & PIX Asaas</span>
                </button>

                <!-- Gerador 1-Clique de Documentos Timbrados -->
                <div class="flex items-center space-x-1 border-l border-slate-300 pl-2">
                  <button 
                    onclick="openLegalDocModal('procuracao', '${client.id}')" 
                    class="px-2.5 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-navy-950 font-extrabold text-xs shadow-xs transition-colors cursor-pointer flex items-center space-x-1 border border-amber-600"
                    title="Gerar Procuração Ad Judicia 100% preenchida em 1-Clique"
                  >
                    <span>📄</span>
                    <span>Gerar Procuração</span>
                  </button>

                  <button 
                    onclick="openLegalDocModal('contrato_honorarios', '${client.id}')" 
                    class="px-2.5 py-1.5 rounded-xl bg-gold-400 hover:bg-gold-300 text-navy-950 font-extrabold text-xs shadow-xs transition-colors cursor-pointer flex items-center space-x-1 border border-gold-600"
                    title="Gerar Contrato de Honorários 100% preenchido em 1-Clique"
                  >
                    <span>📑</span>
                    <span>Gerar Contrato</span>
                  </button>

                  <button 
                    onclick="openLegalDocModal('hipossuficiencia', '${client.id}')" 
                    class="px-2.5 py-1.5 rounded-xl bg-teal-50 hover:bg-teal-100 text-teal-900 font-bold text-xs shadow-xs transition-colors cursor-pointer flex items-center space-x-1 border border-teal-300"
                    title="Gerar Declaração de Hipossuficiência em 1-Clique"
                  >
                    <span>📜</span>
                    <span>Gerar Declaração</span>
                  </button>

                  <button 
                    onclick="openLegalDocModal('ficha_cadastral', '${client.id}')" 
                    class="px-2.5 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs shadow-xs transition-colors cursor-pointer flex items-center space-x-1 border border-slate-300"
                    title="Gerar Ficha Cadastral em 1-Clique"
                  >
                    <span>🧾</span>
                    <span>Ficha</span>
                  </button>
                </div>

              </div>
            </div>

            <!-- BOX DE PROCESSOS JUDICIAIS E ANDAMENTOS DO CLIENTE (CNJ) -->
            <div class="p-5 sm:p-6 bg-slate-50/80 border-t border-slate-200">
              
              <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 border-b border-slate-200 pb-3 mb-4">
                <div class="flex items-center space-x-2 text-navy-950 font-serif font-bold text-sm sm:text-base">
                  <span>⚖️</span>
                  <span>Processos Judiciais & Prazos do Cliente (${allLawsuits.filter(l => l.client_id === client.id).length})</span>
                </div>
                <button 
                  onclick="openNewLawsuitModal('${client.id}')" 
                  class="inline-flex items-center space-x-1.5 px-3.5 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs shadow-xs transition-all cursor-pointer"
                >
                  <span>➕ Vincular Novo Processo</span>
                </button>
              </div>

              ${(() => {
                const clientLaws = allLawsuits.filter(l => l.client_id === client.id);
                if (clientLaws.length === 0) {
                  return `
                    <div class="p-5 rounded-2xl bg-white border border-dashed border-slate-300 text-center text-slate-400 text-xs space-y-1">
                      <p class="font-semibold text-slate-600">Nenhum processo judicial cadastrado para este cliente.</p>
                      <p>Clique em <strong>[➕ Vincular Novo Processo]</strong> para adicionar o número CNJ, tribunal e prazos.</p>
                    </div>
                  `;
                }
                return `
                  <div class="space-y-4">
                    ${clientLaws.map(law => renderSingleLawsuitCard(law, false)).join('')}
                  </div>
                `;
              })()}

            </div>

          </div>
        `;
      }).join('');
    }

    function recalcInlineRow(id) {
      const cVal = parseFloat(document.getElementById(`inline-contract-val-${id}`)?.value) || 0;
      const aPaid = parseFloat(document.getElementById(`inline-amount-paid-${id}`)?.value) || 0;
      const bal = Math.max(0, cVal - aPaid);

      const balDisplay = document.getElementById(`inline-balance-display-${id}`);
      if (balDisplay) {
        balDisplay.textContent = formatMoney(bal);
        balDisplay.className = `text-xs sm:text-sm font-bold py-1 ${bal > 0 ? 'text-amber-700' : 'text-emerald-700'}`;
      }

      // Se quitado integralmente, auto-seleciona Quitado
      if (bal === 0 && cVal > 0) {
        const statusSelect = document.getElementById(`inline-status-${id}`);
        if (statusSelect && statusSelect.value === 'Ativo') {
          statusSelect.value = 'Quitado';
        }
      }
    }

    // Salvar Rápido no Box Individual (Sem abrir modal)
    async function saveInlineClient(id) {
      const client = allClients.find(c => c.id === id);
      if (!client) return;

      const cVal = parseFloat(document.getElementById(`inline-contract-val-${id}`)?.value) || client.contract_value;
      const instCount = parseInt(document.getElementById(`inline-inst-count-${id}`)?.value, 10) || client.installments_count;
      const dueDate = document.getElementById(`inline-due-date-${id}`)?.value || client.due_date;
      const aPaid = parseFloat(document.getElementById(`inline-amount-paid-${id}`)?.value) || 0;
      const invoice = document.getElementById(`inline-invoice-${id}`)?.value || '';
      const status = document.getElementById(`inline-status-${id}`)?.value || client.contract_status;
      const instVal = instCount > 0 ? (cVal / instCount) : 0;

      const formData = new FormData();
      formData.append('full_name', client.full_name);
      formData.append('phone', client.phone);
      formData.append('contract_value', cVal);
      formData.append('installments_count', instCount);
      formData.append('installment_value', instVal);
      formData.append('due_date', dueDate);
      formData.append('amount_paid', aPaid);
      formData.append('invoice_number', invoice);
      formData.append('contract_status', status);

      const saveBtn = document.getElementById(`btn-inline-save-${id}`);
      if (saveBtn) {
        saveBtn.innerHTML = '<span>⏳ Salvando...</span>';
        saveBtn.disabled = true;
      }

      try {
        const res = await fetch(`/api/clients/${id}`, {
          method: 'PUT',
          headers: getAuthHeaders(),
          body: formData
        });

        const data = await res.json();
        if (res.ok && data.success) {
          await loadClients();
          alert('✅ Alterações do contrato salvas com sucesso!');
        } else {
          alert(data.error || 'Erro ao salvar alterações.');
        }
      } catch (err) {
        alert('Erro ao conectar ao servidor.');
      } finally {
        if (saveBtn) {
          saveBtn.innerHTML = '<span>💾 Salvar</span>';
          saveBtn.disabled = false;
        }
      }
    }

    // Função para Anexar Documentos Assinados no Box do Cliente
    function triggerClientDocUpload(clientId, docType) {
      const fileInput = document.createElement('input');
      fileInput.type = 'file';
      fileInput.accept = 'application/pdf,image/*';
      fileInput.onchange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const formData = new FormData();
        formData.append('documents', file);
        formData.append('doc_type', docType);

        const docTypeNames = {
          'procuracao': 'Procuração Assinada',
          'contrato': 'Contrato Assinado',
          'declaracao': 'Declaração Assinada'
        };
        const labelName = docTypeNames[docType] || 'Documento Assinado';

        try {
          const res = await fetch(`/api/clients/${clientId}/upload-document`, {
            method: 'POST',
            headers: getAuthHeaders(),
            body: formData
          });
          const data = await res.json();
          if (res.ok && data.success) {
            alert(`✅ ${labelName} anexada com sucesso à ficha do cliente!`);
            loadClients();
          } else {
            alert(data.error || 'Erro ao anexar arquivo.');
          }
        } catch (err) {
          alert('Erro de comunicação ao anexar documento.');
        }
      };
      fileInput.click();
    }

    // Modal Cliente: Inclusão e Edição
    function toggleClientTypeUI() {
      const type = document.querySelector('input[name="client_type"]:checked')?.value || 'PF';
      const isPJ = type === 'PJ';

      document.getElementById('label-fullname').textContent = isPJ ? 'Razão Social / Nome da Empresa *' : 'Nome Completo *';
      document.getElementById('field-cpf-container').classList.toggle('hidden', isPJ);
      document.getElementById('field-rg-container').classList.toggle('hidden', isPJ);
      document.getElementById('field-cnpj-container').classList.toggle('hidden', !isPJ);
      document.getElementById('filiation-container').classList.toggle('hidden', isPJ);
      document.getElementById('rep-legal-section').classList.toggle('hidden', !isPJ);
    }

    function recalcContractBalances() {
      const total = parseFloat(document.getElementById('cli-contract-value').value) || 0;
      const count = parseInt(document.getElementById('cli-installments-count').value, 10) || 1;
      const paid = parseFloat(document.getElementById('cli-amount-paid').value) || 0;

      const instVal = count > 0 ? (total / count) : 0;
      const balDue = Math.max(0, total - paid);

      document.getElementById('cli-installment-value').value = instVal.toFixed(2);
      document.getElementById('cli-balance-due').value = balDue.toFixed(2);
    }

    let currentClientStep = 1;

    function setClientStep(step) {
      if (step < 1) step = 1;
      if (step > 3) step = 3;
      currentClientStep = step;

      for (let i = 1; i <= 3; i++) {
        const cont = document.getElementById(`cli-step-container-${i}`);
        const tab = document.getElementById(`cli-step-tab-${i}`);
        if (cont) {
          if (i === step) cont.classList.remove('hidden');
          else cont.classList.add('hidden');
        }
        if (tab) {
          const numSpan = tab.querySelector('span:first-child');
          if (i === step) {
            tab.className = 'flex-1 flex items-center justify-center space-x-2 py-2 px-3 rounded-xl bg-amber-500 text-navy-950 font-bold border border-amber-400 shadow-xs cursor-pointer transition-all';
            if (numSpan) numSpan.className = 'w-5 h-5 rounded-full bg-navy-950 text-amber-400 flex items-center justify-center text-[11px] font-mono';
          } else {
            tab.className = 'flex-1 flex items-center justify-center space-x-2 py-2 px-3 rounded-xl bg-slate-100 text-slate-600 border border-slate-200 hover:bg-slate-200 cursor-pointer transition-all';
            if (numSpan) numSpan.className = 'w-5 h-5 rounded-full bg-slate-300 text-slate-700 flex items-center justify-center text-[11px] font-mono';
          }
        }
      }

      const prevBtn = document.getElementById('cli-prev-btn');
      const nextBtn = document.getElementById('cli-next-btn');
      const saveBtn = document.getElementById('cli-save-btn');

      if (prevBtn) {
        if (step === 1) prevBtn.classList.add('hidden');
        else prevBtn.classList.remove('hidden');
      }

      if (nextBtn && saveBtn) {
        if (step === 3) {
          nextBtn.classList.add('hidden');
          saveBtn.classList.remove('hidden');
        } else {
          nextBtn.classList.remove('hidden');
          saveBtn.classList.add('hidden');
        }
      }
    }

    function nextClientStep() {
      if (currentClientStep === 1) {
        const nameInput = document.getElementById('cli-fullname');
        if (nameInput && !nameInput.value.trim()) {
          nameInput.focus();
          const errorDiv = document.getElementById('cli-error-msg');
          const errorText = document.getElementById('cli-error-text');
          if (errorDiv && errorText) {
            errorText.textContent = 'Por favor, informe o Nome Completo ou Razão Social antes de avançar.';
            errorDiv.classList.remove('hidden');
          }
          return;
        }
      }
      const errorDiv = document.getElementById('cli-error-msg');
      if (errorDiv) errorDiv.classList.add('hidden');
      setClientStep(currentClientStep + 1);
    }

    function prevClientStep() {
      const errorDiv = document.getElementById('cli-error-msg');
      if (errorDiv) errorDiv.classList.add('hidden');
      setClientStep(currentClientStep - 1);
    }

    window.setClientStep = setClientStep;
    window.nextClientStep = nextClientStep;
    window.prevClientStep = prevClientStep;

    function openNewClientModal() {
      document.getElementById('client-form').reset();
      document.getElementById('cli-edit-id').value = '';
      document.getElementById('client-modal-title').textContent = 'Novo Cadastro de Cliente & Contrato';
      document.getElementById('client-modal-icon').textContent = '💼';
      document.getElementById('cli-error-msg').classList.add('hidden');
      document.getElementById('cli-existing-files-box').classList.add('hidden');

      const pfRadio = document.querySelector('input[name="client_type"][value="PF"]');
      if (pfRadio) pfRadio.checked = true;
      document.getElementById('cli-nationality').value = 'brasileiro(a)';
      document.getElementById('cli-marital-status').value = 'solteiro(a)';
      document.getElementById('cli-profession').value = '';
      toggleClientTypeUI();
      recalcContractBalances();
      setClientStep(1);

      document.getElementById('client-modal').classList.remove('hidden');
    }

    function openEditClientModal(id) {
      const client = allClients.find(c => c.id === id);
      if (!client) return;

      document.getElementById('client-form').reset();
      document.getElementById('cli-edit-id').value = client.id;
      document.getElementById('client-modal-title').textContent = `Alterar Cadastro & Contrato (#${client.id})`;
      document.getElementById('client-modal-icon').textContent = '✏️';
      document.getElementById('cli-error-msg').classList.add('hidden');

      const radio = document.querySelector(`input[name="client_type"][value="${client.client_type || 'PF'}"]`);
      if (radio) radio.checked = true;

      // Campos Principais
      document.getElementById('cli-fullname').value = client.full_name || '';
      document.getElementById('cli-cpf').value = client.cpf || '';
      document.getElementById('cli-rg').value = client.rg || '';
      document.getElementById('cli-nationality').value = client.nationality || 'brasileiro(a)';
      document.getElementById('cli-marital-status').value = client.marital_status || 'solteiro(a)';
      document.getElementById('cli-profession').value = client.profession || '';
      document.getElementById('cli-cnpj').value = client.cnpj || '';
      document.getElementById('cli-phone').value = client.phone || '';
      document.getElementById('cli-email').value = client.email || '';
      document.getElementById('cli-social').value = client.social_media || '';
      document.getElementById('cli-website').value = client.website || '';
      document.getElementById('cli-google').value = client.google_business || '';
      document.getElementById('cli-father').value = client.filiation_father || '';
      document.getElementById('cli-mother').value = client.filiation_mother || '';

      // Endereço
      document.getElementById('cli-street').value = client.street || '';
      document.getElementById('cli-number').value = client.number || '';
      document.getElementById('cli-complement').value = client.complement || '';
      document.getElementById('cli-neighborhood').value = client.neighborhood || '';
      document.getElementById('cli-city').value = client.city || '';
      document.getElementById('cli-state').value = client.state || 'MG';
      document.getElementById('cli-cep').value = client.cep || '';

      // Representante Legal
      document.getElementById('cli-rep-name').value = client.rep_name || '';
      document.getElementById('cli-rep-cpf').value = client.rep_cpf || '';
      document.getElementById('cli-rep-rg').value = client.rep_rg || '';
      document.getElementById('cli-rep-cep').value = client.rep_cep || '';
      document.getElementById('cli-rep-street').value = client.rep_street || '';
      document.getElementById('cli-rep-number').value = client.rep_number || '';
      document.getElementById('cli-rep-complement').value = client.rep_complement || '';
      document.getElementById('cli-rep-neighborhood').value = client.rep_neighborhood || '';
      document.getElementById('cli-rep-city').value = client.rep_city || '';
      document.getElementById('cli-rep-state').value = client.rep_state || '';

      // Contrato
      document.getElementById('cli-contract-value').value = client.contract_value || 0;
      document.getElementById('cli-installments-count').value = client.installments_count || 1;
      document.getElementById('cli-installment-value').value = client.installment_value || 0;
      document.getElementById('cli-due-date').value = client.due_date || '';
      document.getElementById('cli-amount-paid').value = client.amount_paid || 0;
      document.getElementById('cli-balance-due').value = client.balance_due || 0;
      document.getElementById('cli-invoice-number').value = client.invoice_number || '';
      document.getElementById('cli-contract-status').value = client.contract_status || 'Ativo';

      // Arquivos Existentes
      const filesBox = document.getElementById('cli-existing-files-box');
      const filesList = document.getElementById('cli-existing-files-list');
      const files = client.files || [];
      if (files.length > 0) {
        filesList.innerHTML = files.map(f => `
          <a href="${f.url}" target="_blank" download class="px-2.5 py-1 rounded bg-white border border-slate-300 text-xs font-semibold text-slate-700 hover:text-gold-700 truncate max-w-xs">
            📄 ${f.originalName}
          </a>
        `).join('');
        filesBox.classList.remove('hidden');
      } else {
        filesBox.classList.add('hidden');
      }

      toggleClientTypeUI();
      setClientStep(1);
      document.getElementById('client-modal').classList.remove('hidden');
    }

    function closeClientModal() {
      document.getElementById('client-modal').classList.add('hidden');
    }

    async function handleSaveClient(e) {
      e.preventDefault();
      const editId = document.getElementById('cli-edit-id').value;
      const isEditing = !!editId;

      const fullName = (document.getElementById('cli-fullname')?.value || '').trim();
      if (!fullName) {
        setClientStep(1);
        const nameInput = document.getElementById('cli-fullname');
        if (nameInput) nameInput.focus();
        const errorDiv = document.getElementById('cli-error-msg');
        const errorText = document.getElementById('cli-error-text');
        if (errorDiv && errorText) {
          errorText.textContent = 'O Nome Completo ou Razão Social é obrigatório.';
          errorDiv.classList.remove('hidden');
        }
        return;
      }

      const formData = new FormData();
      formData.append('client_type', document.querySelector('input[name="client_type"]:checked')?.value || 'PF');
      formData.append('full_name', fullName);
      formData.append('cpf', document.getElementById('cli-cpf').value);
      formData.append('rg', document.getElementById('cli-rg').value);
      formData.append('nationality', document.getElementById('cli-nationality').value);
      formData.append('marital_status', document.getElementById('cli-marital-status').value);
      formData.append('profession', document.getElementById('cli-profession').value);
      formData.append('cnpj', document.getElementById('cli-cnpj').value);
      formData.append('phone', document.getElementById('cli-phone').value);
      formData.append('email', document.getElementById('cli-email').value);
      formData.append('social_media', document.getElementById('cli-social').value);
      formData.append('website', document.getElementById('cli-website').value);
      formData.append('google_business', document.getElementById('cli-google').value);
      formData.append('filiation_father', document.getElementById('cli-father').value);
      formData.append('filiation_mother', document.getElementById('cli-mother').value);

      formData.append('street', document.getElementById('cli-street').value);
      formData.append('number', document.getElementById('cli-number').value);
      formData.append('complement', document.getElementById('cli-complement').value);
      formData.append('neighborhood', document.getElementById('cli-neighborhood').value);
      formData.append('city', document.getElementById('cli-city').value);
      formData.append('state', document.getElementById('cli-state').value);
      formData.append('cep', document.getElementById('cli-cep').value);

      formData.append('rep_name', document.getElementById('cli-rep-name').value);
      formData.append('rep_cpf', document.getElementById('cli-rep-cpf').value);
      formData.append('rep_rg', document.getElementById('cli-rep-rg').value);
      formData.append('rep_cep', document.getElementById('cli-rep-cep').value);
      formData.append('rep_street', document.getElementById('cli-rep-street').value);
      formData.append('rep_number', document.getElementById('cli-rep-number').value);
      formData.append('rep_complement', document.getElementById('cli-rep-complement').value);
      formData.append('rep_neighborhood', document.getElementById('cli-rep-neighborhood').value);
      formData.append('rep_city', document.getElementById('cli-rep-city').value);
      formData.append('rep_state', document.getElementById('cli-rep-state').value);

      formData.append('contract_value', document.getElementById('cli-contract-value').value);
      formData.append('installments_count', document.getElementById('cli-installments-count').value);
      formData.append('installment_value', document.getElementById('cli-installment-value').value);
      formData.append('due_date', document.getElementById('cli-due-date').value);
      formData.append('amount_paid', document.getElementById('cli-amount-paid').value);
      formData.append('invoice_number', document.getElementById('cli-invoice-number').value);
      formData.append('contract_status', document.getElementById('cli-contract-status').value);

      const filesInput = document.getElementById('cli-files-input');
      if (filesInput.files && filesInput.files.length > 0) {
        for (let i = 0; i < filesInput.files.length; i++) {
          formData.append('documents', filesInput.files[i]);
        }
      }

      const errorDiv = document.getElementById('cli-error-msg');
      const errorText = document.getElementById('cli-error-text');
      const saveBtn = document.getElementById('cli-save-btn');

      errorDiv.classList.add('hidden');
      saveBtn.disabled = true;
      saveBtn.innerHTML = '<span>Salvando...</span>';

      try {
        const url = isEditing ? `/api/clients/${editId}` : '/api/clients';
        const method = isEditing ? 'PUT' : 'POST';

        const res = await fetch(url, {
          method,
          headers: getAuthHeaders(),
          body: formData
        });

        const data = await res.json();
        saveBtn.disabled = false;
        saveBtn.innerHTML = '<span>💾 Salvar Cliente & Contrato</span>';

        if (res.ok && data.success) {
          closeClientModal();
          loadClients();
          alert(isEditing ? '✅ Dados do cliente e contrato atualizados com sucesso!' : '✅ Cliente e contrato cadastrados com sucesso!');
        } else {
          errorText.textContent = data.error || 'Erro ao salvar.';
          errorDiv.classList.remove('hidden');
        }
      } catch (err) {
        saveBtn.disabled = false;
        saveBtn.innerHTML = '<span>💾 Salvar Cliente & Contrato</span>';
        errorText.textContent = 'Erro ao conectar ao servidor.';
        errorDiv.classList.remove('hidden');
      }
    }

    async function deleteClient(id, nameEncoded) {
      const name = decodeURIComponent(nameEncoded);
      if (!confirm(`⚠️ Deseja realmente excluir o cliente "${name}" (#${id}), seu contrato e todos os documentos anexos?`)) return;

      try {
        const res = await fetch(`/api/clients/${id}`, {
          method: 'DELETE',
          headers: getAuthHeaders()
        });
        const data = await res.json();
        if (res.ok && data.success) {
          loadClients();
          alert('🗑️ Cliente e contrato excluídos com sucesso.');
        } else {
          alert(data.error || 'Erro ao excluir.');
        }
      } catch (err) {
        alert('Erro de comunicação com o servidor.');
      }
    }

    // ================= 3. GESTÃO DE LEADS =================

    async function loadLeads() {
      try {
        const response = await fetch('/api/leads', { headers: getAuthHeaders() });
        if (response.status === 401) {
          handleLogout();
          return;
        }
        const data = await response.json();
        if (data.success) {
          allLeads = data.leads;
          renderLeads(allLeads);
          updateLeadsStats(allLeads);
        }
      } catch (err) {
        console.error('Erro ao carregar leads:', err);
      }
    }

    function updateLeadsStats(leads) {
      document.getElementById('stat-total').textContent = leads.length;
      document.getElementById('stat-novos').textContent = leads.filter(l => l.status === 'Novo').length;
      document.getElementById('stat-andamento').textContent = leads.filter(l => l.status === 'Em Atendimento').length;
      
      let totalDocs = 0;
      leads.forEach(l => { totalDocs += (l.files || []).length; });
      document.getElementById('stat-docs').textContent = totalDocs;
      document.getElementById('leads-count-badge').textContent = `${leads.length} registros`;
      document.getElementById('tab-leads-count').textContent = leads.length;
    }

    function renderLeads(leads) {
      const tbody = document.getElementById('leads-table-body');
      if (leads.length === 0) {
        tbody.innerHTML = `
          <tr>
            <td colspan="7" class="text-center py-12 text-slate-400">
              Nenhum atendimento registrado no momento.
            </td>
          </tr>
        `;
        return;
      }

      tbody.innerHTML = leads.map(lead => {
        const dateObj = new Date(lead.created_at);
        const formattedDate = dateObj.toLocaleDateString('pt-BR') + ' ' + dateObj.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
        const cleanPhone = lead.phone.replace(/\D/g, '');

        const filesHtml = (lead.files && lead.files.length > 0)
          ? `<div class="space-y-1">
              <span class="inline-block px-2 py-0.5 rounded bg-indigo-50 text-indigo-700 text-[11px] font-bold">
                📁 ${lead.files.length} anexo(s)
              </span>
              <div class="flex flex-col gap-1 text-xs">
                ${lead.files.map(f => `
                  <a href="${f.url}" target="_blank" download class="text-gold-700 hover:text-gold-800 underline truncate max-w-[180px] block font-semibold" title="${f.originalName}">
                    📄 ${f.originalName}
                  </a>
                `).join('')}
              </div>
            </div>`
          : `<span class="text-xs text-slate-400">Sem anexos</span>`;

        return `
          <tr class="hover:bg-slate-50 transition-colors">
            <td class="px-4 sm:px-6 py-3 sm:py-4 font-mono font-bold text-navy-950 text-xs whitespace-nowrap">
              <span class="px-2.5 py-1 rounded-md bg-gold-50 text-gold-800 border border-gold-300">
                #${lead.id}
              </span>
            </td>
            <td class="px-4 sm:px-6 py-3 sm:py-4 text-xs text-slate-500 whitespace-nowrap">
              ${formattedDate}
            </td>
            <td class="px-4 sm:px-6 py-3 sm:py-4 min-w-[160px]">
              <div class="font-bold text-navy-950">${lead.name}</div>
              <div class="flex items-center space-x-2 mt-0.5">
                <span class="text-xs text-slate-500">${lead.phone}</span>
                <a href="https://wa.me/55${cleanPhone}?text=Ol%C3%A1%2C%20${encodeURIComponent(lead.name)}!%20Referente%20ao%20seu%20atendimento%20protocolo%20%23${lead.id}%20no%20escrit%C3%B3rio%20Jorge%20Alvim%20Advocacia." target="_blank" class="text-emerald-600 hover:text-emerald-700 text-xs font-bold whitespace-nowrap">
                  💬 WhatsApp
                </a>
              </div>
            </td>
            <td class="px-4 sm:px-6 py-3 sm:py-4 text-xs font-semibold text-slate-700">
              ${lead.area}
            </td>
            <td class="px-4 sm:px-6 py-3 sm:py-4">
              ${filesHtml}
            </td>
            <td class="px-4 sm:px-6 py-3 sm:py-4 whitespace-nowrap">
              <select onchange="updateLeadStatus('${lead.id}', this.value)" class="text-xs font-bold px-2 py-1 rounded-lg border focus:outline-none ${getStatusClass(lead.status)}">
                <option value="Novo" ${lead.status === 'Novo' ? 'selected' : ''}>Novo</option>
                <option value="Em Atendimento" ${lead.status === 'Em Atendimento' ? 'selected' : ''}>Em Atendimento</option>
                <option value="Concluído" ${lead.status === 'Concluído' ? 'selected' : ''}>Concluído</option>
                <option value="Arquivado" ${lead.status === 'Arquivado' ? 'selected' : ''}>Arquivado</option>
              </select>
            </td>
            <td class="px-4 sm:px-6 py-3 sm:py-4 text-right space-x-1 sm:space-x-2 whitespace-nowrap">
              <button onclick="convertLeadToClient('${lead.id}')" class="px-2.5 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300 rounded-lg text-xs font-bold shadow-xs inline-flex items-center space-x-1" title="Converter Atendimento em Cliente Cadastrado (Preenchimento Automático)">
                <span>🚀</span>
                <span>Converter</span>
              </button>
              <button onclick="viewLeadDetails('${lead.id}')" class="p-1.5 text-slate-500 hover:text-navy-950 hover:bg-slate-100 rounded-md" title="Ver Mensagem">
                👁️
              </button>
              <button onclick="deleteLead('${lead.id}')" class="p-1.5 text-rose-500 hover:text-rose-700 hover:bg-rose-50 rounded-md" title="Excluir Registro">
                🗑️
              </button>
            </td>
          </tr>
        `;
      }).join('');
    }

    function getStatusClass(status) {
      if (status === 'Novo') return 'bg-emerald-50 text-emerald-700 border-emerald-300';
      if (status === 'Em Atendimento') return 'bg-amber-50 text-amber-700 border-amber-300';
      if (status === 'Concluído') return 'bg-blue-50 text-blue-700 border-blue-300';
      return 'bg-slate-100 text-slate-600 border-slate-300';
    }

    function filterLeads() {
      const search = document.getElementById('search-input').value.toLowerCase().trim();
      const area = document.getElementById('filter-area').value;
      const status = document.getElementById('filter-status').value;

      const filtered = allLeads.filter(l => {
        const matchesSearch = !search || l.id.toLowerCase().includes(search) || l.name.toLowerCase().includes(search) || l.phone.includes(search);
        const matchesArea = !area || l.area === area;
        const matchesStatus = !status || l.status === status;
        return matchesSearch && matchesArea && matchesStatus;
      });

      renderLeads(filtered);
      document.getElementById('leads-count-badge').textContent = `${filtered.length} registros filtrados`;
    }

    async function updateLeadStatus(id, newStatus) {
      try {
        const res = await fetch(`/api/leads/${id}/status`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
          body: JSON.stringify({ status: newStatus })
        });
        if (res.ok) {
          const item = allLeads.find(l => l.id === id);
          if (item) item.status = newStatus;
          updateLeadsStats(allLeads);
        } else {
          alert('Erro ao atualizar status.');
        }
      } catch (err) {
        alert('Erro ao atualizar status.');
      }
    }

    async function deleteLead(id) {
      if (!confirm(`Deseja realmente excluir o atendimento protocolo #${id}?`)) return;
      try {
        const res = await fetch(`/api/leads/${id}`, { 
          method: 'DELETE',
          headers: getAuthHeaders()
        });
        if (res.ok) {
          allLeads = allLeads.filter(l => l.id !== id);
          filterLeads();
          updateLeadsStats(allLeads);
        } else {
          alert('Erro ao excluir registro.');
        }
      } catch (err) {
        alert('Erro ao excluir registro.');
      }
    }

    function viewLeadDetails(id) {
      const lead = allLeads.find(l => l.id === id);
      if (!lead) return;
      document.getElementById('modal-title').textContent = `Protocolo #${lead.id} - ${lead.name}`;
      document.getElementById('modal-content').textContent = `Área: ${lead.area}\nTelefone: ${lead.phone}\nData: ${new Date(lead.created_at).toLocaleString('pt-BR')}\n\nDescrição / Mensagem:\n${lead.message || 'Nenhuma mensagem escrita.'}`;
      document.getElementById('message-modal').classList.remove('hidden');
    }

    function closeModal() {
      document.getElementById('message-modal').classList.add('hidden');
    }

    // ================= 3. GESTÃO DE PROCESSOS JUDICIAIS & ANDAMENTOS (CNJ) =================

    function getDeadlineBadge(deadlineDate, deadlineStatus) {
      if (deadlineStatus === 'Cumprido') {
        return `<span class="inline-flex items-center space-x-1 px-2.5 py-1 rounded-md bg-emerald-50 text-emerald-800 border border-emerald-300 font-bold text-[11px]">
          <span>✓</span>
          <span>Cumprido</span>
        </span>`;
      }
      if (deadlineStatus === 'Informativo') {
        return `<span class="inline-flex items-center space-x-1 px-2.5 py-1 rounded-md bg-slate-100 text-slate-600 border border-slate-200 text-[11px]">
          <span>ℹ️</span>
          <span>Informativo</span>
        </span>`;
      }
      if (!deadlineDate) {
        return `<span class="text-slate-400 text-xs italic">Sem prazo fatal</span>`;
      }

      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const [y, m, d] = deadlineDate.split('-');
      const target = new Date(y, m - 1, d);
      target.setHours(0, 0, 0, 0);

      const diffTime = target - today;
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

      if (diffDays < 0) {
        return `<span class="inline-flex items-center space-x-1 px-2.5 py-1 rounded-md bg-rose-100 text-rose-900 border border-rose-400 font-extrabold text-[11px] animate-pulse shadow-xs">
          <span>🚨 VENCIDO</span>
          <span>(${Math.abs(diffDays)}d atrás - ${formatDate(deadlineDate)})</span>
        </span>`;
      } else if (diffDays === 0) {
        return `<span class="inline-flex items-center space-x-1 px-2.5 py-1 rounded-md bg-rose-600 text-white font-extrabold text-[11px] shadow-sm animate-bounce">
          <span>🔥 VENCE HOJE!</span>
          <span>(${formatDate(deadlineDate)})</span>
        </span>`;
      } else if (diffDays <= 3) {
        return `<span class="inline-flex items-center space-x-1 px-2.5 py-1 rounded-md bg-amber-100 text-amber-900 border border-amber-400 font-bold text-[11px] shadow-xs">
          <span>⚠️ Vence em ${diffDays} dias</span>
          <span>(${formatDate(deadlineDate)})</span>
        </span>`;
      } else if (diffDays <= 7) {
        return `<span class="inline-flex items-center space-x-1 px-2.5 py-1 rounded-md bg-amber-50 text-amber-800 border border-amber-300 font-semibold text-[11px]">
          <span>⏰ Vence em ${diffDays} dias</span>
          <span>(${formatDate(deadlineDate)})</span>
        </span>`;
      } else {
        return `<span class="inline-flex items-center space-x-1 px-2.5 py-1 rounded-md bg-slate-100 text-slate-700 border border-slate-300 text-[11px]">
          <span>📅 Prazo: ${formatDate(deadlineDate)}</span>
          <span class="text-slate-400">(${diffDays}d)</span>
        </span>`;
      }
    }

    function renderSingleLawsuitCard(law, showClientBadge = false) {
      const movements = law.movements || [];
      const movCount = movements.length;

      const statusClass = law.status === 'Julgado Procedente' 
        ? 'bg-emerald-50 text-emerald-800 border-emerald-300' 
        : (law.status === 'Aguardando Audiência' 
          ? 'bg-amber-50 text-amber-800 border-amber-300' 
          : (law.status === 'Arquivado' 
            ? 'bg-slate-100 text-slate-600 border-slate-300' 
            : 'bg-indigo-50 text-indigo-800 border-indigo-200'));

      // Link para consulta pública de tribunal
      let tribunalUrl = `https://www.google.com/search?q=consulta+processual+${encodeURIComponent(law.tribunal)}+${encodeURIComponent(law.cnj_number)}`;
      if (law.tribunal.includes('TJMG')) {
        tribunalUrl = `https://pje.tjmg.jus.br/pje/ConsultaPublica/listView.seam`;
      } else if (law.tribunal.includes('TRF6')) {
        tribunalUrl = `https://pje1g.trf6.jus.br/consultapublica/ConsultaPublica/listView.seam`;
      }

      return `
        <div class="bg-white rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition-all overflow-hidden" id="lawsuit-card-${law.id}">
          
          <!-- Cabeçalho do Processo -->
          <div class="p-4 sm:p-5 bg-gradient-to-r from-slate-50 to-white border-b border-slate-200 flex flex-col md:flex-row justify-between items-start md:items-center gap-3">
            
            <div class="space-y-1 min-w-0">
              <div class="flex flex-wrap items-center gap-2">
                <span class="px-2 py-0.5 rounded-md bg-gold-100 text-gold-900 font-mono text-[11px] font-bold border border-gold-300">
                  #${law.id}
                </span>
                <span class="px-2.5 py-0.5 rounded-md bg-indigo-50 text-indigo-800 font-bold text-xs border border-indigo-200">
                  🏛️ ${law.tribunal}
                </span>
                <span class="px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 text-xs border border-slate-200">
                  ${law.instance}
                </span>
                <span class="px-2.5 py-0.5 rounded-md font-bold text-xs border ${statusClass}">
                  ● ${law.status}
                </span>
                ${showClientBadge ? `
                  <span class="px-2.5 py-0.5 rounded-md bg-amber-50 text-amber-900 font-bold text-xs border border-amber-200">
                    👤 ${law.client_name || 'Cliente'}
                  </span>
                ` : ''}
              </div>

              <!-- CNJ e Ações Rápidas -->
              <div class="flex flex-wrap items-center gap-2 pt-1">
                <span class="text-xs text-slate-400 font-bold uppercase">CNJ:</span>
                <strong class="font-mono text-sm sm:text-base text-navy-950 tracking-wide select-all">${law.cnj_number}</strong>
                <button 
                  onclick="copyToClipboard('${law.cnj_number}', this)" 
                  class="px-2 py-0.5 rounded bg-slate-100 hover:bg-slate-200 text-slate-600 text-[10px] font-bold border border-slate-300 transition-colors"
                  title="Copiar número CNJ"
                >
                  📋 Copiar
                </button>
                <button 
                  type="button"
                  onclick="openTribunalPortal('${law.cnj_number}')" 
                  class="px-2 py-0.5 rounded bg-blue-50 hover:bg-blue-100 text-blue-700 text-[10px] font-bold border border-blue-200 inline-flex items-center space-x-1 cursor-pointer"
                  title="Copiar CNJ e abrir consulta oficial no Tribunal correspondente"
                >
                  <span>🔗 Consultar Tribunal</span>
                </button>
              </div>
            </div>

            <!-- Botões de Ação do Processo -->
            <div class="flex flex-wrap items-center gap-2 w-full md:w-auto justify-start md:justify-end">
              <button 
                onclick="openLegalDocModal('procuracao', '${law.client_id}', '${law.id}')" 
                class="inline-flex items-center space-x-1 px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-navy-950 font-bold text-xs shadow-xs transition-colors cursor-pointer border border-amber-600"
                title="Gerar Peça/Procuração vinculada a este Processo CNJ"
              >
                <span>📄</span>
                <span>Gerar Doc</span>
              </button>

              <button 
                onclick="openNewMovementModal('${law.id}')" 
                class="inline-flex items-center space-x-1 px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs shadow-xs transition-colors cursor-pointer"
                title="Adicionar movimentação, publicação ou prazo fatal"
              >
                <span>➕</span>
                <span>Novo Andamento</span>
              </button>

              <button 
                onclick="openEditLawsuitModal('${law.id}')" 
                class="inline-flex items-center space-x-1 px-3 py-1.5 rounded-xl bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 font-bold text-xs transition-colors shadow-xs cursor-pointer"
                title="Editar dados do processo"
              >
                <span>✏️</span>
                <span>Editar</span>
              </button>

              <button 
                onclick="deleteLawsuit('${law.id}', '${law.cnj_number}')" 
                class="inline-flex items-center space-x-1 px-3 py-1.5 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 font-bold text-xs transition-colors shadow-xs cursor-pointer"
                title="Excluir processo e andamentos"
              >
                <span>🗑️</span>
                <span>Excluir</span>
              </button>
            </div>

          </div>

          <!-- Detalhes do Processo (Vara, Ação, Juiz, Obs) -->
          <div class="p-4 sm:p-5 space-y-3 bg-white">
            <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 text-xs text-slate-700">
              <div>
                <span class="text-slate-400 block text-[10px] uppercase font-bold">Vara / Órgão Julgador</span>
                <strong class="text-slate-900">${law.court_branch || 'Não informada'}</strong>
              </div>
              <div>
                <span class="text-slate-400 block text-[10px] uppercase font-bold">Tipo de Ação / Assunto</span>
                <strong class="text-slate-900">${law.action_type || 'Não especificado'}</strong>
              </div>
              <div>
                <span class="text-slate-400 block text-[10px] uppercase font-bold">Data de Distribuição</span>
                <strong class="text-slate-900">${formatDate(law.distribution_date)}</strong>
              </div>
              ${law.judge_name ? `
                <div>
                  <span class="text-slate-400 block text-[10px] uppercase font-bold">Magistrado / Relator</span>
                  <strong class="text-slate-900">${law.judge_name}</strong>
                </div>
              ` : ''}
              ${law.notes ? `
                <div class="sm:col-span-2 md:col-span-3 bg-amber-50/40 p-2.5 rounded-xl border border-amber-200/70 text-slate-700">
                  <span class="text-amber-900 block text-[10px] uppercase font-bold mb-0.5">Observações Estratégicas</span>
                  <p class="text-xs italic">${law.notes}</p>
                </div>
              ` : ''}
            </div>

            <!-- Tabela / Linhas de Andamentos do Processo -->
            <div class="pt-3 border-t border-slate-100 space-y-2">
              <div class="flex items-center justify-between">
                <span class="text-slate-600 block text-xs uppercase font-bold flex items-center space-x-1.5">
                  <span>📅</span>
                  <span>Andamentos & Prazos Judiciais (${movCount}):</span>
                </span>
                <button 
                  onclick="openNewMovementModal('${law.id}')" 
                  class="text-[11px] font-bold text-indigo-600 hover:text-indigo-800 underline flex items-center space-x-1"
                >
                  <span>➕ Adicionar Linha de Andamento</span>
                </button>
              </div>

              ${movCount === 0 ? `
                <div class="p-3 bg-slate-50 rounded-xl border border-slate-200 text-center text-slate-400 text-xs italic">
                  Nenhum andamento ou prazo cadastrado ainda. Clique em <strong>[+ Novo Andamento]</strong> para registrar a primeira publicação.
                </div>
              ` : `
                <div class="space-y-2">
                  ${movements.map(mov => `
                    <div class="p-3 sm:p-3.5 rounded-xl border ${mov.deadline_status === 'Cumprido' ? 'bg-slate-50/60 border-slate-200' : 'bg-white border-slate-200 hover:border-indigo-300 shadow-xs'} transition-all flex flex-col md:flex-row justify-between items-start md:items-center gap-2.5">
                      
                      <div class="space-y-1 min-w-0 flex-1">
                        <div class="flex flex-wrap items-center gap-2">
                          <span class="font-mono text-xs font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded">
                            ${formatDate(mov.movement_date)}
                          </span>
                          <strong class="text-xs sm:text-sm text-navy-950 font-semibold">${mov.title}</strong>
                          ${getDeadlineBadge(mov.deadline_date, mov.deadline_status)}
                        </div>
                        ${mov.description ? `
                          <p class="text-xs text-slate-600 pl-1 leading-relaxed">${mov.description}</p>
                        ` : ''}
                      </div>

                      <div class="flex items-center space-x-1.5 self-end md:self-auto flex-shrink-0">
                        <!-- Botão de Notificação no WhatsApp com Autorização do Advogado -->
                        <button 
                          onclick="openAuthorizeMovementWhatsAppModal('${mov.id}')" 
                          class="px-2.5 py-1 rounded-lg text-xs font-bold transition-all flex items-center space-x-1 cursor-pointer ${mov.whatsapp_notified_at ? 'bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300' : 'bg-green-50 hover:bg-green-100 text-green-800 border border-green-300 hover:shadow-xs'}"
                          title="${mov.whatsapp_notified_at ? 'Notificação já autorizada. Clique para reenviar se desejar.' : 'Autorizar envio de notificação via WhatsApp ao cliente'}"
                        >
                          <span>${mov.whatsapp_notified_at ? '✓' : '📲'}</span>
                          <span>${mov.whatsapp_notified_at ? 'Notificado' : 'WhatsApp'}</span>
                        </button>

                        ${mov.deadline_date && mov.deadline_status !== 'Informativo' ? `
                          <button 
                            onclick="toggleMovementStatus('${mov.id}', '${mov.deadline_status}')" 
                            class="px-2.5 py-1 rounded-lg text-xs font-bold transition-colors cursor-pointer ${mov.deadline_status === 'Cumprido' ? 'bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200' : 'bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200'}"
                            title="${mov.deadline_status === 'Cumprido' ? 'Reabrir prazo como pendente' : 'Marcar prazo como cumprido / peticionado'}"
                          >
                            ${mov.deadline_status === 'Cumprido' ? '↩ Reabrir' : '✓ Marcar Cumprido'}
                          </button>
                        ` : ''}

                        <button 
                          onclick="deleteMovement('${mov.id}')" 
                          class="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer" 
                          title="Excluir andamento"
                        >
                          🗑️
                        </button>
                      </div>

                    </div>
                  `).join('')}
                </div>
              `}
            </div>

          </div>

        </div>
      `;
    }

    async function loadLawsuits() {
      try {
        const res = await fetch('/api/lawsuits', { headers: getAuthHeaders() });
        if (res.status === 401) {
          handleLogout();
          return;
        }
        const data = await res.json();
        if (data.success) {
          allLawsuits = data.lawsuits || [];
          updateLawsuitsKPIs();
          renderGlobalLawsuits(allLawsuits);
          
          // Re-renderiza clientes para atualizar os boxes de processos internos
          if (allClients.length > 0) {
            renderClients(allClients);
          }
        }
      } catch (err) {
        console.error('Erro ao carregar processos judiciais:', err);
      }
    }

    function updateLawsuitsKPIs() {
      const count = allLawsuits.length;
      document.getElementById('tab-lawsuits-count').textContent = count;

      const activeLaws = allLawsuits.filter(l => l.status !== 'Arquivado');
      document.getElementById('stat-law-total').textContent = activeLaws.length;

      // Prazos nos próximos 7 dias
      let upcomingCount = 0;
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      allLawsuits.forEach(law => {
        (law.movements || []).forEach(mov => {
          if (mov.deadline_date && mov.deadline_status === 'Pendente') {
            const [y, m, d] = mov.deadline_date.split('-');
            const target = new Date(y, m - 1, d);
            target.setHours(0, 0, 0, 0);
            const diffDays = Math.ceil((target - today) / (1000 * 60 * 60 * 24));
            if (diffDays <= 7) {
              upcomingCount++;
            }
          }
        });
      });
      document.getElementById('stat-law-deadlines').textContent = upcomingCount;

      const hearings = allLawsuits.filter(l => l.status === 'Aguardando Audiência' || (l.action_type && l.action_type.toLowerCase().includes('audiência')));
      document.getElementById('stat-law-hearings').textContent = hearings.length;

      const done = allLawsuits.filter(l => l.status === 'Julgado Procedente' || l.status === 'Arquivado');
      document.getElementById('stat-law-done').textContent = done.length;
    }

    function filterLawsuits() {
      const query = (document.getElementById('search-lawsuits-input')?.value || '').toLowerCase().trim();
      const tribunal = document.getElementById('filter-lawsuit-tribunal')?.value;
      const status = document.getElementById('filter-lawsuit-status')?.value;

      const filtered = allLawsuits.filter(l => {
        const matchesQuery = !query || 
          l.cnj_number.toLowerCase().includes(query) ||
          (l.client_name && l.client_name.toLowerCase().includes(query)) ||
          (l.tribunal && l.tribunal.toLowerCase().includes(query)) ||
          (l.court_branch && l.court_branch.toLowerCase().includes(query)) ||
          (l.action_type && l.action_type.toLowerCase().includes(query)) ||
          l.id.toLowerCase().includes(query);

        const matchesTribunal = !tribunal || tribunal === 'ALL' || l.tribunal === tribunal || (tribunal === 'OUTRO' && !['TJMG','TRF6','TRT3','JEF','STJ','STF'].includes(l.tribunal));
        const matchesStatus = !status || status === 'ALL' || l.status === status;

        return matchesQuery && matchesTribunal && matchesStatus;
      });

      renderGlobalLawsuits(filtered);
    }

    function renderGlobalLawsuits(lawsuits) {
      const container = document.getElementById('lawsuits-global-container');
      if (!container) return;

      if (lawsuits.length === 0) {
        container.innerHTML = `
          <div class="bg-white rounded-3xl border border-slate-200 p-12 text-center text-slate-400 space-y-3 shadow-sm">
            <div class="text-4xl">⚖️</div>
            <p class="font-bold text-slate-600">Nenhum processo judicial localizado no momento.</p>
            <p class="text-xs">Clique no botão <strong>➕ Novo Processo Judicial</strong> acima para cadastrar o primeiro processo com número CNJ.</p>
          </div>
        `;
        return;
      }

      container.innerHTML = `
        <div class="space-y-6">
          ${lawsuits.map(law => renderSingleLawsuitCard(law, true)).join('')}
        </div>
      `;
    }

    // Modal Processo Judicial
    function populateClientSelect(preselectedId = '') {
      const select = document.getElementById('lawsuit-client-id');
      if (!select) return;

      select.innerHTML = '<option value="">Selecione o cliente cadastrado...</option>' + 
        allClients.map(c => `
          <option value="${c.id}" ${c.id === preselectedId ? 'selected' : ''}>
            ${c.full_name} (${c.client_type === 'PJ' ? 'CNPJ: ' + (c.cnpj || '—') : 'CPF: ' + (c.cpf || '—')}) — #${c.id}
          </option>
        `).join('');
    }

    function openNewLawsuitModal(clientId = '') {
      document.getElementById('lawsuit-form').reset();
      document.getElementById('lawsuit-edit-id').value = '';
      document.getElementById('lawsuit-modal-title').textContent = 'Cadastrar Novo Processo Judicial (CNJ)';
      populateClientSelect(clientId);

      const today = new Date().toISOString().split('T')[0];
      document.getElementById('lawsuit-dist-date').value = today;

      document.getElementById('lawsuit-modal').classList.remove('hidden');
      setTimeout(() => { document.getElementById('lawsuit-cnj')?.focus(); }, 100);
    }

    function openEditLawsuitModal(id) {
      const law = allLawsuits.find(l => l.id === id);
      if (!law) return;

      document.getElementById('lawsuit-form').reset();
      document.getElementById('lawsuit-edit-id').value = law.id;
      document.getElementById('lawsuit-modal-title').textContent = `Alterar Processo Judicial (#${law.id})`;
      populateClientSelect(law.client_id);

      document.getElementById('lawsuit-client-id').value = law.client_id;
      document.getElementById('lawsuit-cnj').value = law.cnj_number;
      document.getElementById('lawsuit-tribunal').value = law.tribunal || 'TJMG';
      document.getElementById('lawsuit-instance').value = law.instance || '1ª Instância';
      document.getElementById('lawsuit-status').value = law.status || 'Em Andamento';
      document.getElementById('lawsuit-court-branch').value = law.court_branch || '';
      document.getElementById('lawsuit-action-type').value = law.action_type || '';
      document.getElementById('lawsuit-dist-date').value = law.distribution_date || '';
      document.getElementById('lawsuit-judge').value = law.judge_name || '';
      document.getElementById('lawsuit-notes').value = law.notes || '';

      document.getElementById('lawsuit-modal').classList.remove('hidden');
    }

    function closeLawsuitModal() {
      document.getElementById('lawsuit-modal').classList.add('hidden');
    }

    async function handleLawsuitSubmit(e) {
      e.preventDefault();
      const editId = document.getElementById('lawsuit-edit-id').value;
      const isEditing = !!editId;

      const payload = {
        client_id: document.getElementById('lawsuit-client-id').value,
        cnj_number: document.getElementById('lawsuit-cnj').value.trim(),
        tribunal: document.getElementById('lawsuit-tribunal').value,
        instance: document.getElementById('lawsuit-instance').value,
        status: document.getElementById('lawsuit-status').value,
        court_branch: document.getElementById('lawsuit-court-branch').value.trim(),
        action_type: document.getElementById('lawsuit-action-type').value.trim(),
        distribution_date: document.getElementById('lawsuit-dist-date').value,
        judge_name: document.getElementById('lawsuit-judge').value.trim(),
        notes: document.getElementById('lawsuit-notes').value.trim()
      };

      try {
        const url = isEditing ? `/api/lawsuits/${editId}` : '/api/lawsuits';
        const method = isEditing ? 'PUT' : 'POST';

        const res = await fetch(url, {
          method,
          headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
          body: JSON.stringify(payload)
        });

        const data = await res.json();
        if (res.ok && data.success) {
          closeLawsuitModal();
          await loadLawsuits();
          alert(isEditing ? '✅ Processo atualizado com sucesso!' : '✅ Processo cadastrado com sucesso!');
        } else {
          alert(data.error || 'Erro ao salvar processo.');
        }
      } catch (err) {
        alert('Erro ao conectar ao servidor.');
      }
    }

    async function deleteLawsuit(id, cnj) {
      if (!confirm(`⚠️ Deseja realmente excluir o processo CNJ "${cnj}" e todo o histórico de andamentos?`)) return;
      try {
        const res = await fetch(`/api/lawsuits/${id}`, {
          method: 'DELETE',
          headers: getAuthHeaders()
        });
        const data = await res.json();
        if (res.ok && data.success) {
          await loadLawsuits();
          alert('🗑️ Processo e andamentos excluídos com sucesso.');
        } else {
          alert(data.error || 'Erro ao excluir processo.');
        }
      } catch (err) {
        alert('Erro ao comunicar com o servidor.');
      }
    }

    // Modal Andamentos / Prazos
    function openNewMovementModal(lawsuitId) {
      const law = allLawsuits.find(l => l.id === lawsuitId);
      if (!law) return;

      document.getElementById('movement-form').reset();
      document.getElementById('movement-edit-id').value = '';
      document.getElementById('movement-lawsuit-id').value = law.id;
      document.getElementById('movement-lawsuit-info').textContent = `Processo: ${law.cnj_number} (${law.tribunal}) • Cliente: ${law.client_name || 'Cliente'}`;

      const today = new Date().toISOString().split('T')[0];
      document.getElementById('movement-date').value = today;
      document.getElementById('movement-deadline-status').value = 'Pendente';

      document.getElementById('movement-modal').classList.remove('hidden');
      setTimeout(() => { document.getElementById('movement-title')?.focus(); }, 100);
    }

    function closeMovementModal() {
      document.getElementById('movement-modal').classList.add('hidden');
    }

    async function handleMovementSubmit(e) {
      e.preventDefault();
      const lawsuitId = document.getElementById('movement-lawsuit-id').value;
      const editId = document.getElementById('movement-edit-id').value;
      const isEditing = !!editId;

      const payload = {
        movement_date: document.getElementById('movement-date').value,
        title: document.getElementById('movement-title').value.trim(),
        deadline_date: document.getElementById('movement-deadline-date').value,
        deadline_status: document.getElementById('movement-deadline-status').value,
        description: document.getElementById('movement-desc').value.trim()
      };

      try {
        const url = isEditing 
          ? `/api/lawsuits/movements/${editId}` 
          : `/api/lawsuits/${lawsuitId}/movements`;
        const method = isEditing ? 'PUT' : 'POST';

        const res = await fetch(url, {
          method,
          headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
          body: JSON.stringify(payload)
        });

        const data = await res.json();
        if (res.ok && data.success) {
          closeMovementModal();
          await loadLawsuits();
          const newMovementId = data.movementId || editId;
          if (!isEditing && newMovementId) {
            if (confirm('✅ Andamento registrado com sucesso!\n\nDeseja autorizar o envio de notificação no WhatsApp para o cliente agora?')) {
              openAuthorizeMovementWhatsAppModal(newMovementId);
            }
          } else {
            alert('✅ Andamento atualizado com sucesso!');
          }
        } else {
          alert(data.error || 'Erro ao registrar andamento.');
        }
      } catch (err) {
        alert('Erro ao conectar com o servidor.');
      }
    }

    async function toggleMovementStatus(movementId, currentStatus) {
      const newStatus = currentStatus === 'Cumprido' ? 'Pendente' : 'Cumprido';
      try {
        const res = await fetch(`/api/lawsuits/movements/${movementId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
          body: JSON.stringify({ deadline_status: newStatus })
        });
        const data = await res.json();
        if (res.ok && data.success) {
          await loadLawsuits();
        } else {
          alert(data.error || 'Erro ao alterar status do prazo.');
        }
      } catch (err) {
        alert('Erro ao comunicar com o servidor.');
      }
    }

    async function deleteMovement(movementId) {
      if (!confirm('Deseja realmente excluir este andamento do processo?')) return;
      try {
        const res = await fetch(`/api/lawsuits/movements/${movementId}`, {
          method: 'DELETE',
          headers: getAuthHeaders()
        });
        const data = await res.json();
        if (res.ok && data.success) {
          await loadLawsuits();
        } else {
          alert(data.error || 'Erro ao excluir andamento.');
        }
      } catch (err) {
        alert('Erro ao comunicar com o servidor.');
      }
    }

    // =============================================================================
    // 📲 AUTORIZAÇÃO DE NOTIFICAÇÃO NO WHATSAPP PARA O CLIENTE (COM APROVAÇÃO DO ADVOGADO)
    // =============================================================================

    let currentNotifMovementId = null;

    window.openAuthorizeMovementWhatsAppModal = async function(movementId) {
      currentNotifMovementId = movementId;
      let modal = document.getElementById('movement-whatsapp-auth-modal');
      if (!modal) {
        createMovementWhatsAppAuthModal();
        modal = document.getElementById('movement-whatsapp-auth-modal');
      }

      modal.classList.remove('hidden');
      document.getElementById('mwa-client-name').textContent = 'Carregando dados...';
      document.getElementById('mwa-process-cnj').textContent = '...';
      document.getElementById('mwa-message-preview').value = 'Carregando mensagem estruturada...';

      try {
        const res = await fetch(`/api/lawsuits/movements/${movementId}/preview-whatsapp`, {
          headers: getAuthHeaders()
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Erro ao carregar pré-visualização.');

        document.getElementById('mwa-client-name').textContent = data.clientName;
        document.getElementById('mwa-process-cnj').textContent = data.cnj_number || 'Sem número CNJ';
        document.getElementById('mwa-phone-input').value = data.clientPhone || '';
        document.getElementById('mwa-message-preview').value = data.suggestedMessage || '';

        const statusBadge = document.getElementById('mwa-status-badge');
        if (data.whatsapp_notified_at) {
          statusBadge.textContent = '✓ Já notificado anteriormente';
          statusBadge.className = 'px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-900 border border-amber-300';
        } else {
          statusBadge.textContent = 'Aguardando sua autorização';
          statusBadge.className = 'px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-100 text-indigo-900 border border-indigo-300';
        }
      } catch (err) {
        alert('Erro ao carregar notificação: ' + err.message);
        closeAuthorizeMovementWhatsAppModal();
      }
    };

    window.closeAuthorizeMovementWhatsAppModal = function() {
      const modal = document.getElementById('movement-whatsapp-auth-modal');
      if (modal) modal.classList.add('hidden');
    };

    window.handleConfirmAuthorizeWhatsApp = async function() {
      if (!currentNotifMovementId) return;

      const phone = document.getElementById('mwa-phone-input').value.trim();
      const message = document.getElementById('mwa-message-preview').value.trim();

      if (!phone) {
        alert('Por favor, informe o WhatsApp do cliente para envio.');
        return;
      }
      if (!message) {
        alert('A mensagem de notificação não pode ficar em branco.');
        return;
      }

      const btn = document.getElementById('btn-confirm-authorize-whatsapp');
      const origText = btn.innerHTML;
      btn.disabled = true;
      btn.innerHTML = '<span class="inline-block animate-spin mr-1">⏳</span> Autorizando...';

      try {
        const res = await fetch(`/api/lawsuits/movements/${currentNotifMovementId}/authorize-whatsapp`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
          body: JSON.stringify({ phone, message })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Falha ao autorizar.');

        alert('✅ Notificação autorizada pelo advogado! Abrindo WhatsApp com o cliente...');
        window.open(data.whatsapp_link, '_blank');
        closeAuthorizeMovementWhatsAppModal();
        await loadLawsuits();
      } catch (err) {
        alert('Erro ao autorizar disparo: ' + err.message);
      } finally {
        btn.disabled = false;
        btn.innerHTML = origText;
      }
    };

    function createMovementWhatsAppAuthModal() {
      const div = document.createElement('div');
      div.id = 'movement-whatsapp-auth-modal';
      div.className = 'fixed inset-0 z-50 flex items-center justify-center p-4 bg-navy-950/70 backdrop-blur-xs hidden';
      div.innerHTML = `
        <div class="bg-white rounded-3xl max-w-xl w-full shadow-2xl border border-slate-200 flex flex-col overflow-hidden animate-scale-up">
          <div class="p-5 border-b border-slate-200 flex items-center justify-between bg-slate-50">
            <div class="flex items-center space-x-3 min-w-0">
              <div class="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 border border-emerald-300 flex items-center justify-center text-xl flex-shrink-0">
                📲
              </div>
              <div class="min-w-0">
                <div class="flex items-center space-x-2">
                  <h3 class="font-serif font-bold text-base text-navy-950">
                    Autorizar Notificação no WhatsApp
                  </h3>
                  <span id="mwa-status-badge" class="px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-100 text-indigo-900 border border-indigo-300 flex-shrink-0">
                    Aguardando sua autorização
                  </span>
                </div>
                <p class="text-xs text-slate-500 mt-0.5 truncate">
                  Cliente: <span id="mwa-client-name" class="font-bold text-slate-700"></span> • CNJ: <span id="mwa-process-cnj" class="font-mono"></span>
                </p>
              </div>
            </div>
            <button onclick="closeAuthorizeMovementWhatsAppModal()" class="text-slate-400 hover:text-slate-600 p-2 rounded-xl hover:bg-slate-100 text-lg cursor-pointer">✕</button>
          </div>

          <div class="p-5 sm:p-6 space-y-4 text-xs">
            <div class="p-3 bg-amber-50/90 rounded-xl border border-amber-200 text-amber-900 leading-relaxed">
              <strong>🔒 Controle Ético & Profissional:</strong> A notificação só é enviada após a sua autorização expressa. Você pode revisar, adicionar notas ou editar a mensagem abaixo antes de abrir a conversa.
            </div>

            <div>
              <label class="block font-bold text-slate-700 uppercase tracking-wider mb-1">
                WhatsApp do Cliente (com DDD):
              </label>
              <input type="text" id="mwa-phone-input" class="w-full px-3.5 py-2 rounded-xl border border-slate-300 font-mono text-xs focus:ring-2 focus:ring-emerald-500 focus:outline-none" />
            </div>

            <div>
              <label class="block font-bold text-slate-700 uppercase tracking-wider mb-1">
                Mensagem Amigável (Sem Juridiquês):
              </label>
              <textarea id="mwa-message-preview" rows="8" class="w-full px-3.5 py-2 rounded-xl border border-slate-300 text-xs font-mono leading-relaxed focus:ring-2 focus:ring-emerald-500 focus:outline-none resize-none"></textarea>
            </div>
          </div>

          <div class="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-end space-x-2">
            <button onclick="closeAuthorizeMovementWhatsAppModal()" class="px-4 py-2 rounded-xl text-slate-600 hover:text-slate-800 font-bold text-xs cursor-pointer">
              Cancelar
            </button>
            <button id="btn-confirm-authorize-whatsapp" onclick="handleConfirmAuthorizeWhatsApp()" class="px-5 py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white font-bold text-xs shadow-md transition-all flex items-center space-x-2 cursor-pointer border border-emerald-500">
              <span>✅</span>
              <span>Autorizar & Disparar no WhatsApp</span>
            </button>
          </div>
        </div>
      `;
      document.body.appendChild(div);
    }

    // =============================================================================
    // 🛡️ MATRIZ DE GESTÃO DE ACESSOS & PERMISSÕES GRANULARES (RBAC/ABAC HÍBRIDO)
    // =============================================================================

    const accessMatrixState = {
      data: [],
      templates: {},
      stats: {},
      filtered: []
    };

    const TABS_CONFIG = [
      { key: 'tab_leads', label: 'Leads', icon: '🎯', title: 'Leads & Oportunidades' },
      { key: 'tab_clients', label: 'Clientes', icon: '👥', title: 'Clientes & Contratos' },
      { key: 'tab_lawsuits', label: 'Processos', icon: '⚖️', title: 'Processos Judiciais (CNJ)' },
      { key: 'tab_radar', label: 'Radar', icon: '📡', title: 'Radar Judicial (Motor Python)' },
      { key: 'tab_offices', label: 'Escritórios', icon: '🏛️', title: 'Escritórios PJ' },
      { key: 'tab_drive', label: 'Drive', icon: '📁', title: 'Drive & Arquivo Digital' },
      { key: 'tab_calendar', label: 'Agenda', icon: '📅', title: 'Agenda Forense & Prazos' },
      { key: 'tab_publications', label: 'Intimações', icon: '📰', title: 'Intimações & DJEN' },
      { key: 'tab_hr', label: 'RH/DP', icon: '👥', title: 'Gestão de Pessoal & Ponto' },
      { key: 'tab_financial', label: 'Ficha Geral', icon: '📊', title: 'Ficha Financeira Anual do Escritório' },
      { key: 'tab_colaborador', label: 'Colaborador', icon: '👤', title: 'Portal do Colaborador (Autoatendimento)' },
      { key: 'tab_portal_cliente', label: 'Portal Cliente', icon: '🌐', title: 'Portal do Cliente' },
      { key: 'tab_users', label: 'Usuários', icon: '🔐', title: 'Gestão de Usuários e Senhas' },
      { key: 'tab_settings', label: 'Config', icon: '⚙️', title: 'Configurações & Integrações' }
    ];

    async function loadAccessControlMatrix() {
      const tbody = document.getElementById('access-matrix-tbody');
      if (tbody) {
        tbody.innerHTML = `<tr><td colspan="17" class="text-center py-8 text-slate-400 font-medium">Carregando permissões e sincronizando cadastrados...</td></tr>`;
      }

      try {
        const res = await fetch('/api/access-control/matrix', { headers: getAuthHeaders() });
        if (!res.ok) return;
        const data = await res.json();
        
        accessMatrixState.data = data.matrix || [];
        accessMatrixState.templates = data.templates || {};
        accessMatrixState.stats = data.stats || {};
        accessMatrixState.filtered = [...accessMatrixState.data];

        // Atualiza indicadores do topo
        const s = accessMatrixState.stats;
        const setEl = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val || 0; };
        setEl('stat-acc-total', s.total);
        setEl('stat-acc-masters', s.masters);
        setEl('stat-acc-lawyers', s.lawyers);
        setEl('stat-acc-staff', s.staff);
        setEl('stat-acc-clients', s.clients);

        renderAccessMatrix(accessMatrixState.filtered);
      } catch (err) {
        console.error('Erro ao carregar matriz de acessos:', err);
      }
    }

    function filterAccessMatrix() {
      const search = (document.getElementById('search-access-matrix')?.value || '').toLowerCase().trim();
      const cat = document.getElementById('filter-access-category')?.value || 'all';
      const status = document.getElementById('filter-access-status')?.value || 'all';

      accessMatrixState.filtered = accessMatrixState.data.filter(item => {
        const matchSearch = !search ||
          (item.user_name || '').toLowerCase().includes(search) ||
          (item.user_identifier || '').toLowerCase().includes(search) ||
          (item.notes || '').toLowerCase().includes(search) ||
          (item.role_name || '').toLowerCase().includes(search);

        const matchCat = cat === 'all' || item.role_template === cat || (cat === 'master' && item.is_master);
        const matchStatus = status === 'all' || (status === 'active' && item.is_active === 1) || (status === 'inactive' && item.is_active === 0);

        return matchSearch && matchCat && matchStatus;
      });

      renderAccessMatrix(accessMatrixState.filtered);
    }

    function renderAccessMatrix(list) {
      const tbody = document.getElementById('access-matrix-tbody');
      const countEl = document.getElementById('access-matrix-count');
      if (countEl) countEl.textContent = `${list.length} cadastrados listados`;
      if (!tbody) return;

      if (list.length === 0) {
        tbody.innerHTML = `
          <tr>
            <td colspan="18" class="text-center py-10 text-slate-400">
              Nenhum cadastrado encontrado com os filtros selecionados.
            </td>
          </tr>
        `;
        return;
      }

      tbody.innerHTML = list.map(item => {
        const isMaster = item.is_master || item.role_template === 'master';
        const initials = (item.user_name || 'U').split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase();
        const avatarBg = isMaster ? 'bg-amber-400 text-navy-950 font-black' : (item.role_template === 'cliente' ? 'bg-teal-100 text-teal-900 font-bold' : 'bg-slate-200 text-slate-700 font-bold');

        // Renderiza cada coluna de Switch Deslizante
        const switchesHtml = TABS_CONFIG.map(tab => {
          const isEnabled = item[tab.key] === 1;

          if (isMaster) {
            return `
              <td class="py-2.5 px-1 text-center">
                <div class="inline-flex items-center justify-center p-1 rounded-lg bg-amber-50 border border-amber-300" title="👑 Acesso Mestre Irrestrito (God Mode Permanente)">
                  <span class="text-xs">👑</span>
                </div>
              </td>
            `;
          }

          return `
            <td class="py-2.5 px-1 text-center">
              <button 
                type="button" 
                onclick="toggleAccessSwitch('${item.user_id}', '${tab.key}', ${isEnabled})" 
                class="relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${isEnabled ? 'bg-emerald-500 hover:bg-emerald-600' : 'bg-slate-300 hover:bg-slate-400'}"
                role="switch" 
                aria-checked="${isEnabled}"
                title="${tab.title}: ${isEnabled ? 'ATIVADA' : 'DESATIVADA'} (Clique para alternar)"
              >
                <span 
                  class="pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${isEnabled ? 'translate-x-4' : 'translate-x-0'}"
                ></span>
              </button>
            </td>
          `;
        }).join('');

        // Seletor de Perfil Modelo
        const templateSelector = isMaster 
          ? `<span class="inline-block px-2.5 py-1 rounded-full bg-amber-100 text-amber-950 font-extrabold text-[11px] border border-amber-400 shadow-xs">👑 Mestre Absoluto</span>`
          : `
            <select 
              onchange="applyUserTemplate('${item.user_id}', this.value)" 
              class="px-2 py-1 rounded-xl bg-slate-50 border border-slate-300 text-[11px] font-bold text-slate-800 focus:outline-none focus:border-amber-500 cursor-pointer w-full"
            >
              <option value="advogado" ${item.role_template === 'advogado' ? 'selected' : ''}>⚖️ Advogado</option>
              <option value="estagiario" ${item.role_template === 'estagiario' ? 'selected' : ''}>🎓 Estagiário</option>
              <option value="dono_escritorio" ${item.role_template === 'dono_escritorio' ? 'selected' : ''}>🏛️ Sócio Titular</option>
              <option value="secretaria" ${item.role_template === 'secretaria' ? 'selected' : ''}>💼 Secretária</option>
              <option value="gerente" ${item.role_template === 'gerente' ? 'selected' : ''}>🏢 Gerência/DP</option>
              <option value="motorista" ${item.role_template === 'motorista' ? 'selected' : ''}>🚗 Motorista</option>
              <option value="cliente" ${item.role_template === 'cliente' ? 'selected' : ''}>👤 Cliente</option>
              <option value="custom" ${item.role_template === 'custom' ? 'selected' : ''}>⚙️ Personalizado</option>
            </select>
          `;

        // Botão de Simulação de Visão
        const testVisionBtn = isMaster
          ? `<span class="text-[10px] text-amber-700 font-bold">Visão Plena</span>`
          : `
            <button 
              type="button" 
              onclick="simulateUserView('${item.user_id}')" 
              class="px-2.5 py-1 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-900 font-extrabold text-[10px] border border-indigo-300 shadow-2xs transition-all flex items-center space-x-1 mx-auto"
              title="Testar e simular imediatamente o painel como ${item.user_name}"
            >
              <span>👁️</span>
              <span>Testar</span>
            </button>
          `;

        // Botão de Status Geral
        const statusBtn = isMaster
          ? `<span class="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-900 font-extrabold text-[10px]">🟢 Vitalício</span>`
          : `
            <button 
              onclick="toggleUserGlobalAccess('${item.user_id}', ${item.is_active === 1})" 
              class="px-2 py-1 rounded-lg text-[10px] font-extrabold transition-all cursor-pointer ${item.is_active === 1 ? 'bg-emerald-50 text-emerald-800 border border-emerald-300 hover:bg-rose-50 hover:text-rose-800' : 'bg-rose-50 text-rose-800 border border-rose-300 hover:bg-emerald-50 hover:text-emerald-800'}"
              title="Clique para ${item.is_active === 1 ? 'Suspender Acesso' : 'Ativar Acesso'}"
            >
              ${item.is_active === 1 ? '🟢 Ativo' : '🔴 Suspenso'}
            </button>
          `;

        const passTag = item.plain_password ? `
          <div class="mt-1 flex items-center space-x-1">
            <span class="px-1.5 py-0.5 rounded bg-amber-50 text-amber-900 border border-amber-300 font-mono text-[9px] font-bold">🔑 ${item.plain_password}</span>
          </div>
        ` : '';

        return `
          <tr class="hover:bg-slate-50/80 transition-colors ${item.is_active === 0 ? 'opacity-50 bg-slate-50' : ''}">
            <td class="py-3 px-3">
              <div class="flex items-center space-x-2.5">
                <div class="w-8 h-8 rounded-xl ${avatarBg} flex items-center justify-center text-xs shadow-xs flex-shrink-0">
                  ${isMaster ? '👑' : initials}
                </div>
                <div class="min-w-0">
                  <div class="font-bold text-navy-950 text-xs truncate flex items-center space-x-1">
                    <span>${item.user_name}</span>
                    ${isMaster ? '<span class="text-amber-600" title="Superusuário">⚡</span>' : ''}
                  </div>
                  <div class="text-[10px] text-slate-500 truncate font-medium">${item.notes || item.role_name}</div>
                  <div class="text-[9px] text-slate-400 font-mono truncate">${item.user_identifier || ''}</div>
                  ${passTag}
                </div>
              </div>
            </td>
            <td class="py-3 px-2">${templateSelector}</td>
            ${switchesHtml}
            <td class="py-3 px-2 text-center">${testVisionBtn}</td>
            <td class="py-3 px-3 text-center">${statusBtn}</td>
          </tr>
        `;
      }).join('');
    }

    // ================= SIMULADOR DE VISÃO DE PERFIL =================
    let originalMasterState = null;
    let simulatedUser = null;

    function simulateUserView(userId) {
      const user = accessMatrixState.data.find(u => u.user_id === userId);
      if (!user) return;

      simulatedUser = user;

      // 1. Aplica as permissões do usuário simulado na interface
      applyAccessControlToUI(user);

      // 2. Exibe o banner de simulação no topo
      let banner = document.getElementById('simulation-mode-banner');
      if (!banner) {
        banner = document.createElement('div');
        banner.id = 'simulation-mode-banner';
        document.body.prepend(banner);
      }

      banner.className = 'fixed top-0 left-0 right-0 z-50 bg-gradient-to-r from-purple-800 via-indigo-800 to-navy-950 text-white px-4 py-2.5 shadow-2xl flex items-center justify-between text-xs font-bold border-b border-purple-400/40';
      banner.innerHTML = `
        <div class="flex items-center space-x-2.5">
          <span class="text-base animate-bounce">🎭</span>
          <span>MODO DE TESTE DE PERMISSÃO ATIVO:</span>
          <span class="px-2 py-0.5 rounded-full bg-white/20 text-gold-300 font-mono text-[11px]">${user.user_name} (${user.notes || user.role_template})</span>
          <span class="text-slate-300 font-normal hidden md:inline">— Visualizando apenas as abas e funções autorizadas nos switches de arrasto.</span>
        </div>
        <button 
          onclick="exitSimulationView()" 
          class="px-3.5 py-1.5 rounded-xl bg-gold-500 hover:bg-gold-400 text-navy-950 font-black text-xs shadow-md transition-all cursor-pointer flex items-center space-x-1"
        >
          <span>✕</span>
          <span>Sair do Modo de Teste (Voltar ao Dr. Jorge Alvim)</span>
        </button>
      `;

      // 3. Muda para a primeira aba permitida
      const firstAllowedTab = getFirstAllowedTab(user);
      if (firstAllowedTab) {
        switchTab(firstAllowedTab);
      }
    }

    function exitSimulationView() {
      simulatedUser = null;
      const banner = document.getElementById('simulation-mode-banner');
      if (banner) banner.remove();

      // Restaura acesso mestre irrestrito
      const masterPerms = {
        is_master: true,
        tab_leads: 1, tab_clients: 1, tab_lawsuits: 1, tab_radar: 1,
        tab_offices: 1, tab_drive: 1, tab_calendar: 1, tab_publications: 1,
        tab_hr: 1, tab_financial: 1, tab_colaborador: 1, tab_portal_cliente: 1,
        tab_users: 1, tab_settings: 1
      };
      applyAccessControlToUI(masterPerms);
      switchTab('users');
    }

    function getFirstAllowedTab(perms) {
      if (perms.tab_leads) return 'leads';
      if (perms.tab_clients) return 'clients';
      if (perms.tab_lawsuits) return 'lawsuits';
      if (perms.tab_calendar) return 'calendar';
      if (perms.tab_publications) return 'publications';
      if (perms.tab_financial) return 'finance';
      if (perms.tab_hr) return 'hr';
      if (perms.tab_drive) return 'drive';
      if (perms.tab_users) return 'users';
      return 'leads';
    }

    function applyAccessControlToUI(perms) {
      if (!perms) return;
      const isMaster = perms.is_master || perms.role_template === 'master';

      const toggleTabBtn = (id, allowed) => {
        const btn = document.getElementById(id);
        if (btn) {
          if (isMaster || allowed) {
            btn.classList.remove('!hidden');
            btn.style.display = '';
          } else {
            btn.classList.add('!hidden');
            btn.style.display = 'none';
          }
        }
      };

      toggleTabBtn('tab-btn-leads', perms.tab_leads === 1);
      toggleTabBtn('tab-btn-clients', perms.tab_clients === 1);
      toggleTabBtn('tab-btn-lawsuits', perms.tab_lawsuits === 1);
      toggleTabBtn('tab-btn-judicial', perms.tab_radar === 1);
      toggleTabBtn('tab-btn-offices', perms.tab_offices === 1);
      toggleTabBtn('tab-btn-drive', perms.tab_drive === 1);
      toggleTabBtn('tab-btn-calendar', perms.tab_calendar === 1);
      toggleTabBtn('tab-btn-publications', perms.tab_publications === 1);
      toggleTabBtn('tab-btn-hr', perms.tab_hr === 1);
      toggleTabBtn('tab-btn-finance', perms.tab_financial === 1);
      toggleTabBtn('tab-btn-nfse', perms.tab_financial === 1);
      toggleTabBtn('tab-btn-users', perms.tab_users === 1);
    }

    async function toggleAccessSwitch(userId, tabKey, currentVal) {
      const newVal = !currentVal;
      
      // Atualização otimista na memória para resposta instantânea na tela
      const target = accessMatrixState.data.find(d => d.user_id === userId);
      if (target) {
        target[tabKey] = newVal ? 1 : 0;
        target.role_template = 'custom';
        renderAccessMatrix(accessMatrixState.filtered);
      }

      try {
        const res = await fetch('/api/access-control/toggle', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
          body: JSON.stringify({ user_id: userId, tab_key: tabKey, enabled: newVal })
        });

        const data = await res.json();
        if (!res.ok || !data.success) {
          alert(`❌ ${data.error || 'Erro ao alternar permissão.'}`);
          await loadAccessControlMatrix();
        }
      } catch (err) {
        console.error('Falha ao comunicar com o servidor:', err);
        await loadAccessControlMatrix();
      }
    }

    async function applyUserTemplate(userId, templateKey) {
      try {
        const res = await fetch('/api/access-control/apply-template', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
          body: JSON.stringify({ user_id: userId, template_key: templateKey })
        });

        const data = await res.json();
        if (res.ok && data.success) {
          await loadAccessControlMatrix();
        } else {
          alert(`❌ ${data.error || 'Erro ao aplicar perfil.'}`);
        }
      } catch (err) {
        alert('Erro ao comunicar com o servidor.');
      }
    }

    async function toggleUserGlobalAccess(userId, currentActive) {
      const newStatus = !currentActive;
      const confirmMsg = newStatus ? 'Deseja reativar o acesso deste usuário ao sistema?' : 'Deseja suspender temporariamente o acesso deste usuário ao sistema?';
      if (!confirm(confirmMsg)) return;

      try {
        const res = await fetch('/api/access-control/toggle-user-status', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
          body: JSON.stringify({ user_id: userId, is_active: newStatus })
        });

        const data = await res.json();
        if (res.ok && data.success) {
          await loadAccessControlMatrix();
        } else {
          alert(`❌ ${data.error || 'Erro ao alterar status.'}`);
        }
      } catch (err) {
        alert('Erro ao comunicar com o servidor.');
      }
    }

    // ================= 4. GESTÃO DE USUÁRIOS & SENHAS =================

    async function loadUsers() {
      try {
        const res = await fetch('/api/users', { headers: getAuthHeaders() });
        if (res.status === 401) {
          handleLogout();
          return;
        }
        const data = await res.json();
        if (data.success) {
          allUsers = data.users || [];
          renderUsers(allUsers);
        }
      } catch (err) {
        console.error('Erro ao carregar usuários:', err);
      }
    }

    function filterUsers() {
      const query = (document.getElementById('search-users-input')?.value || '').toLowerCase().trim();
      const filtered = allUsers.filter(u => {
        return !query || u.name.toLowerCase().includes(query) || u.username.toLowerCase().includes(query);
      });
      renderUsers(filtered);
    }

    function renderUsers(users) {
      const tbody = document.getElementById('users-table-body');
      if (!tbody) return;

      const count = users.length;
      const badge1 = document.getElementById('tab-users-count');
      if (badge1) badge1.textContent = count;
      const badge2 = document.getElementById('users-summary-badge');
      if (badge2) badge2.textContent = `${count} ${count === 1 ? 'operador registrado' : 'operadores registrados'}`;

      if (users.length === 0) {
        tbody.innerHTML = `
          <tr>
            <td colspan="6" class="text-center py-10 text-slate-400">
              Nenhum operador localizado. Clique em <strong>➕ Incluir Novo Operador</strong> para cadastrar.
            </td>
          </tr>
        `;
        return;
      }

      tbody.innerHTML = users.map(u => {
        const isMaster = u.username === 'jorgealvimtecnologia' || u.role === 'master' || u.username === 'jorge alvim' || u.username === 'admin';
        const initials = u.name.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase();
        const avatarBg = isMaster ? 'bg-gold-500 text-navy-950 font-extrabold' : 'bg-slate-200 text-slate-700 font-bold';

        const roleBadge = isMaster 
          ? `<span class="inline-flex items-center space-x-1.5 px-3 py-1 rounded-full bg-gold-100 text-gold-900 border border-gold-300 font-bold text-xs">
              <span>👑</span>
              <span>Administrador Mestre</span>
            </span>`
          : (u.role === 'atendente' 
            ? `<span class="inline-flex items-center space-x-1.5 px-3 py-1 rounded-full bg-blue-50 text-blue-700 border border-blue-200 font-semibold text-xs">
                <span>👤</span>
                <span>Atendimento / Recepção</span>
              </span>`
            : `<span class="inline-flex items-center space-x-1.5 px-3 py-1 rounded-full bg-slate-100 text-slate-700 border border-slate-300 font-semibold text-xs">
                <span>🛡️</span>
                <span>Operador / Advogado</span>
              </span>`);

        const deleteButton = isMaster
          ? `<span class="inline-flex items-center space-x-1 px-2.5 py-1 rounded-lg bg-slate-100 text-slate-400 text-xs font-semibold cursor-not-allowed border border-slate-200" title="O usuário mestre está protegido contra exclusão.">
               <span>🔒</span>
               <span>Mestre Blindado</span>
             </span>`
          : `<button onclick="deleteUser('${u.id}', '${u.username}')" class="inline-flex items-center space-x-1 px-3 py-1.5 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 hover:text-rose-800 border border-rose-200 font-bold text-xs transition-colors" title="Excluir o acesso do usuário ${u.username}">
               <span>🗑️</span>
               <span>Excluir</span>
             </button>`;

        const dateFormatted = new Date(u.created_at || Date.now()).toLocaleDateString('pt-BR', {
          day: '2-digit', month: '2-digit', year: 'numeric'
        });

        // SEGURANÇA: a senha é protegida (hash PBKDF2) e nunca é exibida.
        // Para definir/trocar, use o botão "Redefinir senha".
        const passCell = `
          <td class="px-5 py-4 whitespace-nowrap">
            <div class="inline-flex items-center space-x-2 bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-xl text-xs font-mono font-bold text-slate-500 shadow-2xs" title="Senha protegida por hash PBKDF2. Use 'Redefinir senha' para definir uma nova.">
              <span>🔒</span>
              <span class="tracking-widest">••••••••</span>
            </div>
          </td>
        `;

        return `
          <tr class="hover:bg-slate-50 transition-colors">
            <td class="px-5 py-4 min-w-[200px]">
              <div class="flex items-center space-x-3">
                <div class="w-9 h-9 rounded-xl ${avatarBg} flex items-center justify-center text-xs shadow-xs flex-shrink-0">
                  ${isMaster ? '👑' : initials}
                </div>
                <div class="min-w-0">
                  <div class="font-bold text-navy-950 text-xs sm:text-sm truncate">${u.name}</div>
                  <div class="text-[11px] text-slate-400 truncate">ID: ${u.id}</div>
                </div>
              </div>
            </td>
            <td class="px-5 py-4 whitespace-nowrap">
              <span class="px-2.5 py-1 rounded-lg bg-slate-100 border border-slate-200 font-mono text-xs font-bold text-slate-800">
                @${u.username}
              </span>
            </td>
            ${passCell}
            <td class="px-5 py-4 whitespace-nowrap">${roleBadge}</td>
            <td class="px-5 py-4 whitespace-nowrap">
              <span class="inline-flex items-center space-x-1 text-xs text-emerald-700 font-semibold bg-emerald-50 px-2.5 py-1 rounded-md border border-emerald-200">
                <span class="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                <span>PBKDF2 + Aberta</span>
              </span>
            </td>
            <td class="px-5 py-4 text-center whitespace-nowrap">
              <div class="inline-flex items-center justify-center space-x-2">
                <button 
                  onclick="openEditUserModal('${u.id}')" 
                  class="inline-flex items-center space-x-1 px-3 py-1.5 rounded-lg bg-amber-50 hover:bg-amber-100 text-amber-800 hover:text-amber-900 border border-amber-300 font-bold text-xs transition-colors shadow-xs cursor-pointer"
                  title="Alterar dados e redefinir senha"
                >
                  <span>🔑</span>
                  <span>Redefinir senha</span>
                </button>
                ${deleteButton}
              </div>
            </td>
          </tr>
        `;
      }).join('');
    }

    function openNewUserModal() {
      document.getElementById('new-user-form').reset();
      document.getElementById('new-user-error').classList.add('hidden');
      document.getElementById('new-user-modal').classList.remove('hidden');
      setTimeout(() => { document.getElementById('nu-name')?.focus(); }, 100);
    }

    function closeNewUserModal() {
      document.getElementById('new-user-modal').classList.add('hidden');
    }

    async function handleCreateUser(e) {
      e.preventDefault();
      const name = document.getElementById('nu-name').value.trim();
      const username = document.getElementById('nu-username').value.trim();
      const password = document.getElementById('nu-password').value;
      const role = document.getElementById('nu-role').value;
      const errorDiv = document.getElementById('new-user-error');
      const errorText = document.getElementById('new-user-error-text');

      errorDiv.classList.add('hidden');

      try {
        const res = await fetch('/api/users', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
          body: JSON.stringify({ name, username, password, role })
        });

        const data = await res.json();
        if (res.ok && data.success) {
          closeNewUserModal();
          loadUsers();
          alert('✅ Usuário incluído com sucesso!');
        } else {
          errorText.textContent = data.error || 'Erro ao cadastrar usuário.';
          errorDiv.classList.remove('hidden');
        }
      } catch (err) {
        errorText.textContent = 'Erro de comunicação com o servidor.';
        errorDiv.classList.remove('hidden');
      }
    }

    function openEditUserModal(id) {
      const user = allUsers.find(u => u.id === id);
      if (!user) return;
      document.getElementById('eu-id').value = user.id;
      document.getElementById('eu-username').value = user.username;
      document.getElementById('eu-name').value = user.name;
      document.getElementById('eu-password').value = ''; // nunca pré-preenche; digite para redefinir
      document.getElementById('edit-user-error').classList.add('hidden');
      document.getElementById('edit-user-modal').classList.remove('hidden');
      setTimeout(() => { document.getElementById('eu-password')?.focus(); }, 100);
    }

    function closeEditUserModal() {
      document.getElementById('edit-user-modal').classList.add('hidden');
    }

    async function handleUpdateUser(e) {
      e.preventDefault();
      const id = document.getElementById('eu-id').value;
      const name = document.getElementById('eu-name').value.trim();
      const password = document.getElementById('eu-password').value;
      const errorDiv = document.getElementById('edit-user-error');
      const errorText = document.getElementById('edit-user-error-text');

      errorDiv.classList.add('hidden');

      try {
        const res = await fetch(`/api/users/${id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
          body: JSON.stringify({ name, password })
        });

        const data = await res.json();
        if (res.ok && data.success) {
          closeEditUserModal();
          loadUsers();
          alert('✅ Usuário / Senha alterados com sucesso!');
        } else {
          errorText.textContent = data.error || 'Erro ao atualizar dados.';
          errorDiv.classList.remove('hidden');
        }
      } catch (err) {
        errorText.textContent = 'Erro de comunicação com o servidor.';
        errorDiv.classList.remove('hidden');
      }
    }

    async function deleteUser(id, username) {
      if (!confirm(`⚠️ Deseja realmente excluir o acesso do usuário "@${username}"?`)) return;
      try {
        const res = await fetch(`/api/users/${id}`, {
          method: 'DELETE',
          headers: getAuthHeaders()
        });
        const data = await res.json();
        if (res.ok && data.success) {
          loadUsers();
          alert('🗑️ Usuário excluído com sucesso.');
        } else {
          alert(data.error || 'Erro ao excluir usuário.');
        }
      } catch (err) {
        alert('Erro ao comunicar com o servidor.');
      }
    }

    // ================= 4.2 MÓDULO DO DRIVE DO ESCRITÓRIO (ARQUIVO DIGITAL) =================
    let allDriveFiles = [];
    let selectedDriveCategory = 'Todas';

    function initDriveTab() {
      loadDriveFiles();
    }

    async function loadDriveFiles(folder = selectedDriveCategory, search = '') {
      const container = document.getElementById('drive-files-container');
      if (!container) return;

      try {
        const res = await fetch('/api/drive/files', { headers: getAuthHeaders() });
        if (!res.ok) return;
        const data = await res.json();
        if (!data.success) return;

        allDriveFiles = data.files || [];

        // Atualizar contadores em cada Pasta Visual
        updateFolderCounts(allDriveFiles);

        // Filtrar a exibição com base na pasta selecionada e termo de busca
        let displayedFiles = allDriveFiles;
        if (folder && folder !== 'Todas') {
          displayedFiles = displayedFiles.filter(f => f.folder === folder);
        }

        if (search && search.trim()) {
          const term = search.trim().toLowerCase();
          displayedFiles = displayedFiles.filter(f => 
            (f.title || '').toLowerCase().includes(term) ||
            (f.filename || '').toLowerCase().includes(term) ||
            (f.notes || '').toLowerCase().includes(term) ||
            (f.uploaded_by || '').toLowerCase().includes(term)
          );
        }

        renderDriveFiles(displayedFiles);

        // Atualizar Breadcrumb e Título da Localização
        const folderTitleElem = document.getElementById('drive-current-folder-title');
        const showAllBtn = document.getElementById('btn-show-all-drive');
        if (folderTitleElem) {
          if (folder === 'Todas') {
            folderTitleElem.textContent = `Todas as Pastas (${displayedFiles.length} documento(s))`;
            folderTitleElem.className = 'text-xs font-extrabold text-emerald-800 bg-emerald-100 px-2.5 py-1 rounded-lg border border-emerald-300';
            if (showAllBtn) showAllBtn.classList.add('hidden');
          } else {
            folderTitleElem.textContent = `📂 ${folder} (${displayedFiles.length} documento(s))`;
            folderTitleElem.className = 'text-xs font-extrabold text-navy-950 bg-amber-100 px-2.5 py-1 rounded-lg border border-amber-300';
            if (showAllBtn) showAllBtn.classList.remove('hidden');
          }
        }

        // Destaque visual do Card da Pasta Ativa
        highlightActiveFolderCard(folder);

        // Atualizar badges estatísticos no topo
        const countBadge = document.getElementById('tab-drive-count');
        if (countBadge) countBadge.textContent = allDriveFiles.length;

        const statTotal = document.getElementById('drive-stat-total');
        if (statTotal) statTotal.textContent = `${allDriveFiles.length} documento(s)`;

        const statSize = document.getElementById('drive-stat-size');
        if (statSize) statSize.textContent = formatFileSize(data.totalSize || 0);

        const statFolders = document.getElementById('drive-stat-folders');
        if (statFolders) {
          const folderCount = data.foldersCount ? data.foldersCount.length : 0;
          statFolders.textContent = `${folderCount} pasta(s) com arquivos`;
        }
      } catch (err) {
        console.error('Erro ao carregar arquivos do Drive:', err);
        container.innerHTML = `
          <div class="col-span-full bg-white p-8 rounded-3xl border border-slate-200 text-center text-rose-600 text-xs">
            Erro ao conectar com o servidor para listar documentos do Drive.
          </div>
        `;
      }
    }

    function updateFolderCounts(files) {
      const counts = {
        'Modelos': 0,
        'PJ': 0,
        'PF': 0,
        'Contratos': 0,
        'Geral': 0
      };

      files.forEach(f => {
        const fold = f.folder || '';
        if (fold.includes('Peças')) counts['Modelos']++;
        else if (fold.includes('Institucionais')) counts['PJ']++;
        else if (fold.includes('Equipe')) counts['PF']++;
        else if (fold.includes('Financeiros') || fold.includes('Contratos')) counts['Contratos']++;
        else counts['Geral']++;
      });

      Object.keys(counts).forEach(key => {
        const elem = document.getElementById(`folder-count-${key}`);
        if (elem) elem.textContent = `${counts[key]} arq`;
      });
    }

    function highlightActiveFolderCard(folder) {
      document.querySelectorAll('.drive-folder-card').forEach(card => {
        card.classList.remove('ring-2', 'ring-emerald-500', 'shadow-lg', 'bg-white');
      });

      let catId = 'Geral';
      if (folder.includes('Peças')) catId = 'Modelos';
      else if (folder.includes('Institucionais')) catId = 'PJ';
      else if (folder.includes('Equipe')) catId = 'PF';
      else if (folder.includes('Financeiros') || folder.includes('Contratos')) catId = 'Contratos';
      else if (folder === 'Geral') catId = 'Geral';
      else return;

      const activeCard = document.getElementById(`folder-card-${catId}`);
      if (activeCard) {
        activeCard.classList.add('ring-2', 'ring-emerald-500', 'shadow-lg', 'bg-white');
      }
    }

    function selectDriveCategory(catName) {
      selectedDriveCategory = catName;
      loadDriveFiles(catName);
    }

    function filterDriveFiles() {
      const term = (document.getElementById('drive-search-input')?.value || '').toLowerCase().trim();
      loadDriveFiles(selectedDriveCategory, term);
    }

    function formatFileSize(bytes) {
      const b = parseInt(bytes, 10) || 0;
      if (b === 0) return '0 Bytes';
      const k = 1024;
      const sizes = ['Bytes', 'KB', 'MB', 'GB'];
      const i = Math.floor(Math.log(b) / Math.log(k));
      return parseFloat((b / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    function renderDriveFiles(list) {
      const container = document.getElementById('drive-files-container');
      if (!container) return;

      if (!list || list.length === 0) {
        container.innerHTML = `
          <div class="col-span-full bg-white p-12 rounded-3xl border border-slate-200 text-center space-y-3">
            <div class="w-16 h-16 rounded-3xl bg-emerald-50 border border-emerald-200 text-emerald-800 flex items-center justify-center text-3xl mx-auto">
              📁
            </div>
            <h5 class="font-serif font-bold text-base text-navy-950">Nenhum documento nesta pasta</h5>
            <p class="text-xs text-slate-500 max-w-md mx-auto">
              Clique no botão "➕ Fazer Upload de Documento" acima para armazenar modelos de peças, procurações, contratos ou documentos institucionais.
            </p>
          </div>
        `;
        return;
      }

      container.innerHTML = list.map(doc => {
        const ext = (doc.file_type || doc.filename.split('.').pop() || '').toLowerCase();
        let icon = '📄';
        let badgeColor = 'bg-blue-100 text-blue-900 border-blue-200';

        if (['pdf'].includes(ext)) { icon = '📕'; badgeColor = 'bg-rose-100 text-rose-900 border-rose-200'; }
        else if (['doc', 'docx'].includes(ext)) { icon = '📝'; badgeColor = 'bg-blue-100 text-blue-900 border-blue-200'; }
        else if (['xls', 'xlsx', 'csv'].includes(ext)) { icon = '📊'; badgeColor = 'bg-emerald-100 text-emerald-900 border-emerald-200'; }
        else if (['png', 'jpg', 'jpeg', 'svg', 'webp'].includes(ext)) { icon = '🖼️'; badgeColor = 'bg-purple-100 text-purple-900 border-purple-200'; }
        else if (['zip', 'rar', '7z'].includes(ext)) { icon = '📦'; badgeColor = 'bg-amber-100 text-amber-900 border-amber-200'; }

        return `
          <div class="bg-white p-5 rounded-3xl border border-slate-200 shadow-md hover:shadow-lg transition-all space-y-3 flex flex-col justify-between">
            <div class="space-y-2">
              <div class="flex items-start justify-between gap-2">
                <div class="flex items-center space-x-2.5 min-w-0">
                  <div class="w-10 h-10 rounded-2xl bg-slate-100 border border-slate-200 flex items-center justify-center text-xl shadow-sm flex-shrink-0">
                    ${icon}
                  </div>
                  <div class="min-w-0">
                    <span class="px-2 py-0.5 rounded text-[10px] font-bold border ${badgeColor}">${doc.folder}</span>
                    <h5 class="font-bold text-slate-900 text-xs sm:text-sm truncate pt-1" title="${doc.title}">${doc.title}</h5>
                  </div>
                </div>
              </div>

              ${doc.notes ? `<p class="text-xs text-slate-600 bg-slate-50 p-2.5 rounded-xl border border-slate-100 italic" title="${doc.notes}">${doc.notes}</p>` : ''}

              <div class="text-[11px] text-slate-500 pt-1 space-y-0.5 font-medium border-t border-slate-100">
                <div class="flex justify-between">
                  <span>Tamanho: <strong class="text-slate-800 font-mono">${formatFileSize(doc.file_size)}</strong></span>
                  <span>Extensão: <strong class="text-slate-800 font-mono uppercase">${ext}</strong></span>
                </div>
                <div class="flex justify-between text-[10px]">
                  <span>Enviado por: <strong class="text-slate-700">${doc.uploaded_by || 'Admin'}</strong></span>
                  <span>Data: <strong class="text-slate-700">${formatDate(doc.created_at)}</strong></span>
                </div>
              </div>
            </div>

            <!-- Botões de Ação -->
            <div class="grid grid-cols-3 gap-1.5 pt-2 border-t border-slate-100">
              <a 
                href="${doc.file_path}" 
                target="_blank" 
                class="px-2 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-[11px] text-center transition-all flex items-center justify-center space-x-1"
                title="Visualizar ou Abrir arquivo"
              >
                <span>👁️ Ver</span>
              </a>

              <a 
                href="${doc.file_path}" 
                download 
                class="px-2 py-1.5 rounded-xl bg-emerald-100 hover:bg-emerald-200 text-emerald-900 font-bold text-[11px] text-center transition-all flex items-center justify-center space-x-1"
                title="Baixar arquivo para seu computador"
              >
                <span>⬇️ Baixar</span>
              </a>

              <button 
                onclick="deleteDriveFile('${doc.id}', '${encodeURIComponent(doc.title)}')" 
                class="px-2 py-1.5 rounded-xl bg-rose-100 hover:bg-rose-200 text-rose-900 font-bold text-[11px] text-center transition-all flex items-center justify-center space-x-1 cursor-pointer"
                title="Excluir documento do Drive"
              >
                <span>🗑️ Excluir</span>
              </button>
            </div>
          </div>
        `;
      }).join('');
    }

    function openDriveUploadModal(editId = null) {
      const modal = document.getElementById('drive-upload-modal');
      if (!modal) return;
      document.getElementById('drive-upload-form').reset();
      document.getElementById('drive-edit-id').value = editId || '';
      document.getElementById('drive-error-msg').classList.add('hidden');

      if (selectedDriveCategory && selectedDriveCategory !== 'Todas') {
        document.getElementById('drive-upload-folder').value = selectedDriveCategory;
      }

      modal.classList.remove('hidden');
    }

    function closeDriveUploadModal() {
      const modal = document.getElementById('drive-upload-modal');
      if (modal) modal.classList.add('hidden');
    }

    async function handleSaveDriveUpload(e) {
      e.preventDefault();
      const editId = document.getElementById('drive-edit-id').value;
      const folder = document.getElementById('drive-upload-folder').value;
      const title = document.getElementById('drive-upload-title').value;
      const notes = document.getElementById('drive-upload-notes').value;

      const errorDiv = document.getElementById('drive-error-msg');
      const errorText = document.getElementById('drive-error-text');
      const saveBtn = document.getElementById('drive-save-btn');

      errorDiv.classList.add('hidden');

      if (editId) {
        try {
          saveBtn.disabled = true;
          const res = await fetch(`/api/drive/files/${editId}`, {
            method: 'PUT',
            headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
            body: JSON.stringify({ title, folder, notes })
          });
          const data = await res.json();
          saveBtn.disabled = false;
          if (res.ok && data.success) {
            closeDriveUploadModal();
            loadDriveFiles();
            alert('✅ Dados do documento atualizados com sucesso!');
          } else {
            errorText.textContent = data.error || 'Erro ao atualizar documento.';
            errorDiv.classList.remove('hidden');
          }
        } catch (err) {
          saveBtn.disabled = false;
          errorText.textContent = 'Erro de conexão com o servidor.';
          errorDiv.classList.remove('hidden');
        }
        return;
      }

      const filesInput = document.getElementById('drive-upload-files');
      if (!filesInput.files || filesInput.files.length === 0) {
        errorText.textContent = 'Selecione ao menos um arquivo para envio.';
        errorDiv.classList.remove('hidden');
        return;
      }

      const formData = new FormData();
      formData.append('folder', folder);
      formData.append('title', title);
      formData.append('notes', notes);
      for (let i = 0; i < filesInput.files.length; i++) {
        formData.append('drive_files', filesInput.files[i]);
      }

      saveBtn.disabled = true;
      saveBtn.innerHTML = '<span>Enviando...</span>';

      try {
        const res = await fetch('/api/drive/upload', {
          method: 'POST',
          headers: getAuthHeaders(),
          body: formData
        });

        const data = await res.json();
        saveBtn.disabled = false;
        saveBtn.innerHTML = '<span>💾 Enviar Documento para o Drive</span>';

        if (res.ok && data.success) {
          closeDriveUploadModal();
          loadDriveFiles();
          alert('✅ Documento(s) adicionado(s) ao Drive com sucesso!');
        } else {
          errorText.textContent = data.error || 'Erro ao realizar upload.';
          errorDiv.classList.remove('hidden');
        }
      } catch (err) {
        saveBtn.disabled = false;
        saveBtn.innerHTML = '<span>💾 Enviar Documento para o Drive</span>';
        errorText.textContent = 'Erro ao comunicar com o servidor.';
        errorDiv.classList.remove('hidden');
      }
    }

    async function deleteDriveFile(id, titleEncoded) {
      const title = decodeURIComponent(titleEncoded);
      if (!confirm(`⚠️ Tem certeza que deseja excluir permanentemente o documento "${title}" (#${id}) do Drive?`)) return;

      try {
        const res = await fetch(`/api/drive/files/${id}`, {
          method: 'DELETE',
          headers: getAuthHeaders()
        });
        const data = await res.json();
        if (res.ok && data.success) {
          loadDriveFiles();
          alert('🗑️ Documento excluído do Drive com sucesso.');
        } else {
          alert(data.error || 'Erro ao excluir documento.');
        }
      } catch (err) {
        alert('Erro ao comunicar com o servidor.');
      }
    }

    // ================= 4.1 MÓDULO DE GESTÃO E CADASTRO DE ESCRITÓRIOS (PJ & EQUIPE) =================

    let allOfficesList = [];
    let modalMemberCounter = 0;

    function initOfficesTab() {
      loadOffices();
    }

    async function loadOffices(search = '') {
      const container = document.getElementById('offices-list-container');
      if (!container) return;

      try {
        const url = search ? `/api/offices?search=${encodeURIComponent(search)}` : '/api/offices';
        const res = await fetch(url, { headers: getAuthHeaders() });
        if (!res.ok) return;
        const data = await res.json();
        if (!data.success) return;

        allOfficesList = data.offices || [];
        renderOfficesList(allOfficesList);
        const countBadge = document.getElementById('tab-offices-count');
        if (countBadge) countBadge.textContent = allOfficesList.length;
      } catch (err) {
        console.error('Erro ao carregar escritórios:', err);
        container.innerHTML = `
          <div class="bg-white p-8 rounded-3xl border border-slate-200 text-center text-rose-600 text-xs">
            Erro ao conectar com o servidor para listar escritórios.
          </div>
        `;
      }
    }

    function filterOfficesList() {
      const term = (document.getElementById('office-search-filter')?.value || '').toLowerCase().trim();
      if (!term) {
        renderOfficesList(allOfficesList);
        return;
      }
      const filtered = allOfficesList.filter(o => 
        (o.id || '').toLowerCase().includes(term) ||
        (o.corporate_name || '').toLowerCase().includes(term) ||
        (o.trade_name || '').toLowerCase().includes(term) ||
        (o.cnpj || '').toLowerCase().includes(term) ||
        (o.city || '').toLowerCase().includes(term) ||
        (o.members || []).some(m => (m.name || '').toLowerCase().includes(term) || (m.cpf || '').toLowerCase().includes(term) || (m.oab_number || '').toLowerCase().includes(term))
      );
      renderOfficesList(filtered);
    }

    function renderOfficesList(list) {
      const container = document.getElementById('offices-list-container');
      if (!container) return;

      if (!list || list.length === 0) {
        container.innerHTML = `
          <div class="bg-white p-12 rounded-3xl border border-slate-200 text-center space-y-3">
            <div class="w-16 h-16 rounded-3xl bg-amber-50 border border-amber-200 text-amber-800 flex items-center justify-center text-3xl mx-auto">
              🏛️
            </div>
            <h5 class="font-serif font-bold text-base text-navy-950">Nenhum escritório localizado</h5>
            <p class="text-xs text-slate-500 max-w-md mx-auto">
              Clique em "➕ Cadastrar Novo Escritório" ou utilize a linha de busca por CNPJ/CPF para cadastrar uma nova sociedade e seus integrantes.
            </p>
          </div>
        `;
        return;
      }

      container.innerHTML = list.map(off => {
        const membersHtml = (off.members && off.members.length > 0) ? off.members.map(m => {
          const isLawyerOrIntern = (m.role_type || '').includes('Advogado') || (m.role_type || '').includes('Estagiário');
          const oabBadge = isLawyerOrIntern && m.oab_number
            ? `<span class="px-2 py-0.5 rounded bg-amber-100 text-amber-900 text-[10px] font-mono font-bold border border-amber-300 ml-1.5">OAB: ${m.oab_number}/${m.oab_uf || 'MG'}</span>`
            : '';
          
          let roleBadgeClass = 'bg-blue-100 text-blue-900 border-blue-200';
          if ((m.role_type || '').includes('Empresário')) roleBadgeClass = 'bg-purple-100 text-purple-900 border-purple-200';
          else if ((m.role_type || '').includes('Advogado')) roleBadgeClass = 'bg-amber-100 text-amber-900 border-amber-200';
          else if ((m.role_type || '').includes('Estagiário')) roleBadgeClass = 'bg-emerald-100 text-emerald-900 border-emerald-200';

          const addressStr = [
            m.street ? `${m.street}, ${m.number || 'S/N'}${m.complement ? ` (${m.complement})` : ''}` : '',
            m.neighborhood,
            (m.city || m.state) ? `${m.city || ''}/${m.state || 'MG'}` : '',
            m.cep ? `CEP ${m.cep}` : ''
          ].filter(Boolean).join(' - ');

          return `
            <div class="p-3.5 rounded-xl bg-slate-50 border border-slate-200/80 flex flex-col sm:flex-row sm:items-start justify-between gap-2 text-xs">
              <div class="space-y-1">
                <div class="flex items-center flex-wrap gap-1">
                  <span class="font-bold text-slate-900 text-sm">${m.name}</span>
                  <span class="px-2 py-0.5 rounded text-[10px] font-bold border ${roleBadgeClass}">${m.role_type}</span>
                  ${oabBadge}
                </div>
                <div class="text-[11px] text-slate-600 flex flex-wrap gap-3">
                  ${m.cpf ? `<span>CPF: <strong class="font-mono text-slate-800">${m.cpf}</strong></span>` : ''}
                  ${m.rg ? `<span>RG: <strong class="text-slate-800">${m.rg}</strong></span>` : ''}
                  ${m.phone ? `<span>📞 ${m.phone}</span>` : ''}
                  ${m.email ? `<span>✉️ ${m.email}</span>` : ''}
                  ${m.position_title ? `<span>💼 ${m.position_title}</span>` : ''}
                </div>
                ${addressStr ? `<div class="text-[11px] text-slate-600 font-medium pt-0.5">🏠 <strong>Endereço Residencial:</strong> ${addressStr}</div>` : ''}
              </div>
              <div class="text-right">
                <span class="px-2 py-0.5 rounded-full text-[10px] font-bold ${m.status === 'Ativo' ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-700'}">${m.status || 'Ativo'}</span>
              </div>
            </div>
          `;
        }).join('') : '<p class="text-xs text-slate-400 italic py-2">Nenhum integrante físico cadastrado para esta sociedade ainda.</p>';

        return `
          <div class="bg-white rounded-3xl border border-slate-200 shadow-md overflow-hidden hover:shadow-lg transition-all space-y-4">
            <!-- Cabeçalho do Card (Pessoa Jurídica do Escritório) -->
            <div class="p-5 sm:p-6 bg-slate-900 text-white flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
              <div class="space-y-1">
                <div class="flex items-center flex-wrap gap-2">
                  <span class="px-2.5 py-0.5 rounded-md bg-amber-500 text-navy-950 font-extrabold text-[10px] font-mono tracking-wider">
                    ${off.id}
                  </span>
                  ${off.cnpj ? `<span class="px-2.5 py-0.5 rounded-md bg-slate-800 text-amber-400 font-mono text-[11px] border border-slate-700">CNPJ: ${off.cnpj}</span>` : ''}
                  ${off.oab_society ? `<span class="px-2.5 py-0.5 rounded-md bg-slate-800 text-slate-300 font-mono text-[11px] border border-slate-700">Registro OAB Sociedade: ${off.oab_society}/${off.oab_uf || 'MG'}</span>` : ''}
                </div>
                <h4 class="font-serif font-bold text-lg sm:text-xl text-amber-400 leading-tight">${off.corporate_name}</h4>
                ${off.trade_name ? `<p class="text-xs text-slate-300 font-medium">Nome Fantasia: ${off.trade_name}</p>` : ''}
              </div>

              <!-- Botões de Ação em Cada Escritório: Alterar, Salvar, Excluir -->
              <div class="flex items-center space-x-2 w-full md:w-auto justify-end whitespace-nowrap">
                <button 
                  onclick="openEditOfficeModal('${off.id}')" 
                  class="px-3.5 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-navy-950 font-bold text-xs shadow-sm transition-all flex items-center space-x-1 cursor-pointer"
                  title="Alterar / Editar dados do escritório"
                >
                  <span>✏️ Alterar</span>
                </button>
                <button 
                  onclick="quickSaveOffice('${off.id}')" 
                  class="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-sm transition-all flex items-center space-x-1 cursor-pointer"
                  title="Salvar escritório"
                >
                  <span>💾 Salvar</span>
                </button>
                <button 
                  onclick="deleteOffice('${off.id}', '${encodeURIComponent(off.corporate_name)}')" 
                  class="px-3.5 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs shadow-sm transition-all flex items-center space-x-1 cursor-pointer"
                  title="Excluir escritório"
                >
                  <span>🗑️ Excluir</span>
                </button>
              </div>
            </div>

            <!-- Corpo do Card: Informações PJ + Integrantes PFs -->
            <div class="px-5 sm:px-6 space-y-4">
              <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs border-b border-slate-100 pb-4">
                <div>
                  <span class="text-slate-400 font-bold uppercase text-[10px] block">Endereço Oficial</span>
                  <span class="font-medium text-slate-800">${off.street ? `${off.street}, ${off.number || 'S/N'} ${off.complement ? `(${off.complement})` : ''}` : 'Não informado'}</span>
                  <div class="text-slate-500">${off.neighborhood || ''} ${off.city ? `- ${off.city}/${off.state || 'MG'}` : ''} ${off.cep ? `(CEP ${off.cep})` : ''}</div>
                </div>
                <div>
                  <span class="text-slate-400 font-bold uppercase text-[10px] block">Contatos</span>
                  <div class="font-medium text-slate-800">${off.phone || off.whatsapp || 'Não informado'}</div>
                  <div class="text-slate-500">${off.email || ''}</div>
                </div>
                <div>
                  <span class="text-slate-400 font-bold uppercase text-[10px] block">Dados Bancários & PIX</span>
                  <div class="font-medium text-slate-800">${off.pix_key ? `PIX: ${off.pix_key}` : '—'}</div>
                  <div class="text-slate-500 truncate">${off.bank_info || ''}</div>
                </div>
                <div>
                  <span class="text-slate-400 font-bold uppercase text-[10px] block">Equipe de Integrantes</span>
                  <div class="font-bold text-slate-800 text-sm mt-0.5">${(off.members || []).length} Pessoas Físicas</div>
                </div>
              </div>

              <!-- Pessoas Físicas do Escritório -->
              <div class="space-y-2 pb-5">
                <h5 class="text-xs font-bold uppercase tracking-wider text-slate-600 flex items-center space-x-2">
                  <span>👥 Pessoas Físicas do Escritório (Empresários, Advogados, Adm, Estagiários)</span>
                </h5>
                <div class="space-y-2">
                  ${membersHtml}
                </div>
              </div>
            </div>
          </div>
        `;
      }).join('');
    }

    async function searchOfficeByDoc() {
      const input = document.getElementById('office-search-doc-input');
      if (!input) return;
      const doc = input.value.trim();
      if (!doc) {
        alert('⚠️ Por favor, digite um número de CNPJ ou CPF para pesquisar.');
        return;
      }

      const btn = document.getElementById('btn-search-doc');
      const originalText = btn.innerHTML;
      btn.disabled = true;
      btn.innerHTML = '<span>🔍 Localizando...</span>';

      try {
        const res = await fetch(`/api/offices/search-doc?doc=${encodeURIComponent(doc)}`, {
          headers: getAuthHeaders()
        });
        const data = await res.json();
        btn.disabled = false;
        btn.innerHTML = originalText;

        if (res.ok && data.success) {
          if (data.matchType === 'office_cnpj' || data.matchType === 'member_cpf') {
            alert(`✅ Registro localizado no banco de dados do sistema!\nEscritório: "${data.office.corporate_name}" (#${data.office.id})`);
            openEditOfficeModal(data.office.id);
          } else if (data.matchType === 'external_cnpj') {
            alert(`🌐 Dados cadastrais do CNPJ ${data.cnpjData.cnpj} retornados pela Receita Federal!\nAbrindo formulário de cadastro para preenchimento automático...`);
            openOfficeModal(data.cnpjData);
          }
        } else {
          alert(data.error || 'Nenhum escritório ou integrante localizado para este CNPJ/CPF.');
        }
      } catch (err) {
        btn.disabled = false;
        btn.innerHTML = originalText;
        alert('Erro ao consultar o servidor para localização por CNPJ/CPF.');
      }
    }

    function openOfficeModal(initialPjData = null) {
      document.getElementById('office-form').reset();
      document.getElementById('office-edit-id').value = '';
      document.getElementById('office-modal-title').textContent = 'Cadastrar Novo Escritório';
      document.getElementById('office-modal-subtitle').textContent = 'Dados da Pessoa Jurídica e Pessoas Físicas que o compõem';
      document.getElementById('office-modal-delete-btn').classList.add('hidden');
      document.getElementById('office-modal-error').classList.add('hidden');
      document.getElementById('office-modal-members-container').innerHTML = '';

      modalMemberCounter = 0;

      if (initialPjData) {
        if (initialPjData.corporate_name) document.getElementById('off-modal-corporate-name').value = initialPjData.corporate_name;
        if (initialPjData.trade_name) document.getElementById('off-modal-trade-name').value = initialPjData.trade_name;
        if (initialPjData.cnpj) document.getElementById('off-modal-cnpj').value = initialPjData.cnpj;
        if (initialPjData.street) document.getElementById('off-modal-street').value = initialPjData.street;
        if (initialPjData.number) document.getElementById('off-modal-number').value = initialPjData.number;
        if (initialPjData.complement) document.getElementById('off-modal-complement').value = initialPjData.complement;
        if (initialPjData.neighborhood) document.getElementById('off-modal-neighborhood').value = initialPjData.neighborhood;
        if (initialPjData.city) document.getElementById('off-modal-city').value = initialPjData.city;
        if (initialPjData.state) document.getElementById('off-modal-state').value = initialPjData.state;
        if (initialPjData.cep) document.getElementById('off-modal-cep').value = initialPjData.cep;
        if (initialPjData.email) document.getElementById('off-modal-email').value = initialPjData.email;
        if (initialPjData.phone) document.getElementById('off-modal-phone').value = initialPjData.phone;
      }

      addOfficeMemberRow();

      document.getElementById('office-modal').classList.remove('hidden');
      setTimeout(() => { document.getElementById('off-modal-corporate-name')?.focus(); }, 100);
    }

    function openEditOfficeModal(id) {
      const office = allOfficesList.find(o => o.id === id);
      if (!office) return;

      document.getElementById('office-form').reset();
      document.getElementById('office-edit-id').value = office.id;
      document.getElementById('office-modal-title').textContent = `Editar Escritório (#${office.id})`;
      document.getElementById('office-modal-subtitle').textContent = office.corporate_name;
      document.getElementById('office-modal-delete-btn').classList.remove('hidden');
      document.getElementById('office-modal-error').classList.add('hidden');
      document.getElementById('office-modal-members-container').innerHTML = '';

      document.getElementById('off-modal-corporate-name').value = office.corporate_name || '';
      document.getElementById('off-modal-trade-name').value = office.trade_name || '';
      document.getElementById('off-modal-cnpj').value = office.cnpj || '';
      document.getElementById('off-modal-oab-society').value = office.oab_society || '';
      document.getElementById('off-modal-oab-uf').value = office.oab_uf || 'MG';
      document.getElementById('off-modal-street').value = office.street || '';
      document.getElementById('off-modal-number').value = office.number || '';
      document.getElementById('off-modal-complement').value = office.complement || '';
      document.getElementById('off-modal-neighborhood').value = office.neighborhood || '';
      document.getElementById('off-modal-city').value = office.city || '';
      document.getElementById('off-modal-state').value = office.state || 'MG';
      document.getElementById('off-modal-cep').value = office.cep || '';
      document.getElementById('off-modal-email').value = office.email || '';
      document.getElementById('off-modal-phone').value = office.phone || '';
      document.getElementById('off-modal-pix').value = office.pix_key || '';
      document.getElementById('off-modal-bank').value = office.bank_info || '';
      document.getElementById('off-modal-notes').value = office.notes || '';

      modalMemberCounter = 0;
      if (office.members && office.members.length > 0) {
        office.members.forEach(m => addOfficeMemberRow(m));
      } else {
        addOfficeMemberRow();
      }

      document.getElementById('office-modal').classList.remove('hidden');
    }

    function closeOfficeModal() {
      document.getElementById('office-modal').classList.add('hidden');
    }

    function addOfficeMemberRow(memberData = {}) {
      const container = document.getElementById('office-modal-members-container');
      if (!container) return;

      const rowId = `mem-row-${++modalMemberCounter}`;
      const row = document.createElement('div');
      row.id = rowId;
      row.className = 'p-4 rounded-2xl bg-white border border-slate-300 space-y-3 shadow-sm relative transition-all hover:border-blue-400';

      const role = memberData.role_type || 'Advogado Associado';
      const name = memberData.name || '';
      const cpf = memberData.cpf || '';
      const rg = memberData.rg || '';
      const oab = memberData.oab_number || '';
      const oabUf = memberData.oab_uf || 'MG';
      const phone = memberData.phone || '';
      const email = memberData.email || '';
      const title = memberData.position_title || '';
      const street = memberData.street || '';
      const number = memberData.number || '';
      const complement = memberData.complement || '';
      const neighborhood = memberData.neighborhood || '';
      const city = memberData.city || '';
      const state = memberData.state || 'MG';
      const cep = memberData.cep || '';

      row.innerHTML = `
        <div class="flex justify-between items-center pb-2 border-b border-slate-100">
          <span class="font-bold text-xs text-blue-900 flex items-center space-x-1">
            <span>👤 Integrante Pessoa Física #${modalMemberCounter}</span>
          </span>
          <button 
            type="button" 
            onclick="document.getElementById('${rowId}').remove()" 
            class="text-rose-600 hover:text-rose-800 font-bold text-xs flex items-center space-x-1 cursor-pointer"
            title="Remover este integrante"
          >
            <span>🗑️ Remover Integrante</span>
          </button>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 text-xs">
          <div>
            <label class="block font-bold text-slate-700 mb-1">Função / Categoria *</label>
            <select class="mem-role-type w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-300 font-medium focus:bg-white focus:border-blue-500">
              <option value="Empresário / Sócio" ${role === 'Empresário / Sócio' ? 'selected' : ''}>💼 Empresário / Sócio</option>
              <option value="Advogado Sócio" ${role === 'Advogado Sócio' ? 'selected' : ''}>⚖️ Advogado Sócio</option>
              <option value="Advogado Associado" ${role === 'Advogado Associado' ? 'selected' : ''}>⚖️ Advogado Associado</option>
              <option value="Estagiário" ${role === 'Estagiário' ? 'selected' : ''}>🎓 Estagiário de Direito</option>
              <option value="Pessoal da Administração" ${role === 'Pessoal da Administração' ? 'selected' : ''}>📁 Pessoal da Administração</option>
              <option value="Secretária Executiva" ${role === 'Secretária Executiva' ? 'selected' : ''}>👩‍💼 Secretária Executiva</option>
              <option value="Recepcionista" ${role === 'Recepcionista' ? 'selected' : ''}>🛎️ Recepcionista</option>
              <option value="Motorista / Logística" ${role === 'Motorista / Logística' ? 'selected' : ''}>🚗 Motorista / Logística</option>
              <option value="Outro" ${role === 'Outro' ? 'selected' : ''}>👥 Outro Cargo</option>
            </select>
          </div>

          <div class="sm:col-span-2">
            <label class="block font-bold text-slate-700 mb-1">Nome Completo *</label>
            <input type="text" class="mem-name w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-300 focus:bg-white focus:border-blue-500" value="${name}" required placeholder="Ex: Dr. Carlos Eduardo / Ana Paula" />
          </div>

          <div>
            <label class="block font-bold text-slate-700 mb-1">CPF</label>
            <input type="text" class="mem-cpf w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-300 focus:bg-white focus:border-blue-500 font-mono" value="${cpf}" placeholder="000.000.000-00" />
          </div>

          <div>
            <label class="block font-bold text-slate-700 mb-1">RG / Documento</label>
            <input type="text" class="mem-rg w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-300 focus:bg-white focus:border-blue-500" value="${rg}" placeholder="MG-00.000.000" />
          </div>

          <!-- Campo de Nº OAB (para Advogados e Estagiários) -->
          <div>
            <label class="block font-bold text-amber-900 mb-1">Nº OAB (Advogado / Estagiário)</label>
            <div class="flex space-x-1">
              <input type="text" class="mem-oab-number w-full px-3 py-2 rounded-xl bg-amber-50 border border-amber-300 text-amber-950 font-mono font-bold focus:bg-white focus:border-amber-500" value="${oab}" placeholder="Ex: 123.456" />
              <input type="text" class="mem-oab-uf w-14 px-2 py-2 rounded-xl bg-amber-50 border border-amber-300 text-amber-950 font-bold uppercase text-center focus:bg-white focus:border-amber-500" value="${oabUf}" placeholder="MG" />
            </div>
          </div>

          <div>
            <label class="block font-bold text-slate-700 mb-1">Telefone / WhatsApp</label>
            <input type="text" class="mem-phone w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-300 focus:bg-white focus:border-blue-500" value="${phone}" placeholder="(32) 90000-0000" />
          </div>

          <div>
            <label class="block font-bold text-slate-700 mb-1">E-mail</label>
            <input type="email" class="mem-email w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-300 focus:bg-white focus:border-blue-500" value="${email}" placeholder="integrante@escritorio.com.br" />
          </div>

          <div>
            <label class="block font-bold text-slate-700 mb-1">Cargo / Especialidade</label>
            <input type="text" class="mem-title w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-300 focus:bg-white focus:border-blue-500" value="${title}" placeholder="Ex: Direito Cível / Recepção" />
          </div>

          <!-- Endereço Residencial Completo do Integrante -->
          <div class="sm:col-span-2 lg:col-span-3 pt-2 border-t border-slate-100 space-y-2">
            <span class="block font-bold text-slate-800 text-[11px]">🏠 Endereço Residencial Completo do Integrante</span>
            <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-2">
              <div class="lg:col-span-2">
                <input type="text" class="mem-street w-full px-2.5 py-1.5 rounded-lg bg-slate-50 border border-slate-300 text-xs focus:bg-white focus:border-blue-500" value="${street}" placeholder="Rua / Logradouro" />
              </div>
              <div>
                <input type="text" class="mem-number w-full px-2.5 py-1.5 rounded-lg bg-slate-50 border border-slate-300 text-xs focus:bg-white focus:border-blue-500" value="${number}" placeholder="Número" />
              </div>
              <div>
                <input type="text" class="mem-complement w-full px-2.5 py-1.5 rounded-lg bg-slate-50 border border-slate-300 text-xs focus:bg-white focus:border-blue-500" value="${complement}" placeholder="Complemento / Apt" />
              </div>
              <div>
                <input type="text" class="mem-neighborhood w-full px-2.5 py-1.5 rounded-lg bg-slate-50 border border-slate-300 text-xs focus:bg-white focus:border-blue-500" value="${neighborhood}" placeholder="Bairro" />
              </div>
              <div>
                <input type="text" class="mem-city w-full px-2.5 py-1.5 rounded-lg bg-slate-50 border border-slate-300 text-xs focus:bg-white focus:border-blue-500" value="${city}" placeholder="Cidade" />
              </div>
              <div>
                <div class="flex space-x-1">
                  <input type="text" class="mem-state w-10 px-1 py-1.5 rounded-lg bg-slate-50 border border-slate-300 text-xs text-center uppercase font-bold focus:bg-white focus:border-blue-500" value="${state}" placeholder="MG" />
                  <input type="text" class="mem-cep w-full px-2 py-1.5 rounded-lg bg-slate-50 border border-slate-300 text-xs font-mono focus:bg-white focus:border-blue-500" value="${cep}" placeholder="CEP" />
                </div>
              </div>
            </div>
          </div>
        </div>
      `;

      container.appendChild(row);
    }

    async function fetchOfficeCnpjFromModal() {
      const cnpjInput = document.getElementById('off-modal-cnpj');
      if (!cnpjInput) return;
      const cleanDoc = cnpjInput.value.replace(/\D/g, '');
      if (cleanDoc.length !== 14) {
        alert('⚠️ Digite um CNPJ válido com 14 dígitos para consultar.');
        return;
      }

      try {
        const fetchRes = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${cleanDoc}`);
        if (fetchRes.ok) {
          const apiData = await fetchRes.json();
          if (apiData.razao_social) document.getElementById('off-modal-corporate-name').value = apiData.razao_social;
          if (apiData.nome_fantasia) document.getElementById('off-modal-trade-name').value = apiData.nome_fantasia;
          if (apiData.logradouro) document.getElementById('off-modal-street').value = apiData.logradouro;
          if (apiData.numero) document.getElementById('off-modal-number').value = apiData.numero;
          if (apiData.complemento) document.getElementById('off-modal-complement').value = apiData.complemento;
          if (apiData.bairro) document.getElementById('off-modal-neighborhood').value = apiData.bairro;
          if (apiData.municipio) document.getElementById('off-modal-city').value = apiData.municipio;
          if (apiData.uf) document.getElementById('off-modal-state').value = apiData.uf;
          if (apiData.cep) document.getElementById('off-modal-cep').value = String(apiData.cep).replace(/^(\d{5})(\d{3})$/, "$1-$2");
          if (apiData.email) document.getElementById('off-modal-email').value = apiData.email;
          if (apiData.ddd_telefone_1) document.getElementById('off-modal-phone').value = `(${apiData.ddd_telefone_1.slice(0, 2)}) ${apiData.ddd_telefone_1.slice(2)}`;
          alert('✅ Dados do CNPJ preenchidos automaticamente via Receita Federal!');
        } else {
          alert('Não foi possível localizar dados para este CNPJ na Receita Federal.');
        }
      } catch (e) {
        alert('Erro ao comunicar com a consulta externa de CNPJ.');
      }
    }

    async function handleSaveOffice(e) {
      e.preventDefault();
      const editId = document.getElementById('office-edit-id').value;
      const isEditing = !!editId;
      const errorDiv = document.getElementById('office-modal-error');
      const saveBtn = document.getElementById('office-modal-save-btn');

      errorDiv.classList.add('hidden');
      saveBtn.disabled = true;
      saveBtn.innerHTML = '<span>Salvando...</span>';

      const payload = {
        corporate_name: document.getElementById('off-modal-corporate-name').value.trim(),
        trade_name: document.getElementById('off-modal-trade-name').value.trim(),
        cnpj: document.getElementById('off-modal-cnpj').value.trim(),
        oab_society: document.getElementById('off-modal-oab-society').value.trim(),
        oab_uf: document.getElementById('off-modal-oab-uf').value.trim(),
        street: document.getElementById('off-modal-street').value.trim(),
        number: document.getElementById('off-modal-number').value.trim(),
        complement: document.getElementById('off-modal-complement').value.trim(),
        neighborhood: document.getElementById('off-modal-neighborhood').value.trim(),
        city: document.getElementById('off-modal-city').value.trim(),
        state: document.getElementById('off-modal-state').value.trim(),
        cep: document.getElementById('off-modal-cep').value.trim(),
        email: document.getElementById('off-modal-email').value.trim(),
        phone: document.getElementById('off-modal-phone').value.trim(),
        pix_key: document.getElementById('off-modal-pix').value.trim(),
        bank_info: document.getElementById('off-modal-bank').value.trim(),
        notes: document.getElementById('off-modal-notes').value.trim(),
        members: []
      };

      const memberRows = document.querySelectorAll('#office-modal-members-container > div');
      memberRows.forEach(row => {
        const role_type = row.querySelector('.mem-role-type')?.value || 'Advogado Associado';
        const name = row.querySelector('.mem-name')?.value?.trim();
        const cpf = row.querySelector('.mem-cpf')?.value?.trim();
        const rg = row.querySelector('.mem-rg')?.value?.trim();
        const oab_number = row.querySelector('.mem-oab-number')?.value?.trim();
        const oab_uf = row.querySelector('.mem-oab-uf')?.value?.trim() || 'MG';
        const phone = row.querySelector('.mem-phone')?.value?.trim();
        const email = row.querySelector('.mem-email')?.value?.trim();
        const position_title = row.querySelector('.mem-title')?.value?.trim();
        const street = row.querySelector('.mem-street')?.value?.trim();
        const number = row.querySelector('.mem-number')?.value?.trim();
        const complement = row.querySelector('.mem-complement')?.value?.trim();
        const neighborhood = row.querySelector('.mem-neighborhood')?.value?.trim();
        const city = row.querySelector('.mem-city')?.value?.trim();
        const state = row.querySelector('.mem-state')?.value?.trim() || 'MG';
        const cep = row.querySelector('.mem-cep')?.value?.trim();

        if (name) {
          payload.members.push({
            role_type,
            name,
            cpf,
            rg,
            oab_number,
            oab_uf,
            phone,
            email,
            position_title,
            street,
            number,
            complement,
            neighborhood,
            city,
            state,
            cep,
            status: 'Ativo'
          });
        }
      });

      try {
        const url = isEditing ? `/api/offices/${editId}` : '/api/offices';
        const method = isEditing ? 'PUT' : 'POST';

        const res = await fetch(url, {
          method,
          headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
          body: JSON.stringify(payload)
        });

        const data = await res.json();
        saveBtn.disabled = false;
        saveBtn.innerHTML = '💾 Salvar Escritório';

        if (res.ok && data.success) {
          closeOfficeModal();
          loadOffices();
          alert(isEditing ? '✅ Dados do escritório e integrantes atualizados com sucesso!' : '✅ Escritório cadastrado com sucesso!');
        } else {
          errorDiv.textContent = data.error || 'Erro ao salvar escritório.';
          errorDiv.classList.remove('hidden');
        }
      } catch (err) {
        saveBtn.disabled = false;
        saveBtn.innerHTML = '💾 Salvar Escritório';
        errorDiv.textContent = 'Erro ao conectar com o servidor.';
        errorDiv.classList.remove('hidden');
      }
    }

    async function quickSaveOffice(id) {
      openEditOfficeModal(id);
    }

    async function deleteOffice(id, nameEncoded) {
      const name = decodeURIComponent(nameEncoded);
      if (!confirm(`⚠️ Deseja realmente excluir o escritório "${name}" (#${id}) e todos os seus integrantes?`)) return;

      try {
        const res = await fetch(`/api/offices/${id}`, {
          method: 'DELETE',
          headers: getAuthHeaders()
        });
        const data = await res.json();
        if (res.ok && data.success) {
          loadOffices();
          alert('🗑️ Escritório excluído com sucesso.');
        } else {
          alert(data.error || 'Erro ao excluir escritório.');
        }
      } catch (err) {
        alert('Erro ao comunicar com o servidor.');
      }
    }

    function deleteCurrentModalOffice() {
      const editId = document.getElementById('office-edit-id').value;
      const corpName = document.getElementById('off-modal-corporate-name').value;
      if (editId) {
        closeOfficeModal();
        deleteOffice(editId, encodeURIComponent(corpName));
      }
    }

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
        field.value = 'para o fim específico de propor e defender em ações de divórcio, partilha de bens, fixação/revisão de alimentos, guarda e inventário extrajudicial ou judicial perante as Varas de Família e Sucessões ou Cartórios Notariais competentes.';
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

    // ================= 6. MÓDULO FINANCEIRO (ERP JURÍDICO) & INTEGRAÇÃO ASAAS =================

    let allTransactions = [];
    let allInstallments = [];
    let allAlvaras = [];
    let currentFinanceSubTab = 'cashflow';
    let currentSelectedFinClientId = '';
    let currentAsaasPaymentData = null;

    const REVENUE_CATEGORIES = [
      'Honorários Contratuais',
      'Honorários de Êxito / Alvará',
      'Consultoria / Parecer Jurídico',
      'Reembolso de Custas Processuais',
      'Outras Entradas'
    ];

    const EXPENSE_CATEGORIES = [
      'Aluguel / Imóvel da Galeria',
      'Condomínio / Energia / Água',
      'Internet / Telefonia',
      'Anuidade OAB / Taxas OAB',
      'Certificado Digital (Token)',
      'Softwares / Sistemas / Hospedagem',
      'Custas Processuais / Diligências',
      'Divulgação & Artigos Jurídicos',
      'Material de Escritório / Impressão',
      'Impostos / Contador / DAS',
      'Outras Despesas'
    ];

    function initFinanceTab() {
      loadFinancialDashboard();
      loadFinancialSettings();
      switchFinanceSubTab(currentFinanceSubTab || 'cashflow');
      populateFinanceClientDropdowns();
    }

    function switchFinanceSubTab(subTab) {
      currentFinanceSubTab = subTab;
      const tabs = ['cashflow', 'installments', 'nfse', 'alvaras', 'reports'];
      
      tabs.forEach(t => {
        const sec = document.getElementById(`fin-subtab-${t}`);
        const btn = document.getElementById(`subtab-btn-${t}`);
        if (sec) {
          if (t === subTab) sec.classList.remove('hidden');
          else sec.classList.add('hidden');
        }
        if (btn) {
          if (t === subTab) {
            btn.className = 'flex items-center space-x-2 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold bg-gradient-to-r from-amber-500 via-gold-500 to-amber-600 text-white shadow-sm transition-all border border-gold-400/60';
          } else {
            btn.className = 'flex items-center space-x-2 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-semibold text-slate-600 hover:text-navy-950 hover:bg-slate-50 transition-all';
          }
        }
      });

      if (subTab === 'cashflow') {
        loadFinancialTransactions();
      } else if (subTab === 'installments') {
        populateFinanceClientDropdowns();
        if (currentSelectedFinClientId) {
          loadClientInstallments(currentSelectedFinClientId);
        }
      } else if (subTab === 'nfse') {
        loadNfseList();
      } else if (subTab === 'alvaras') {
        loadAlvaras();
      } else if (subTab === 'reports') {
        renderCashflowReport();
      }
    }

    function populateFinanceClientDropdowns() {
      // 1. Dropdown na aba de carnês
      const instSelect = document.getElementById('fin-inst-client-select');
      if (instSelect) {
        const currentVal = instSelect.value || currentSelectedFinClientId;
        instSelect.innerHTML = '<option value="">Selecione um cliente cadastrado...</option>' + 
          allClients.map(c => `
            <option value="${c.id}" ${c.id === currentVal ? 'selected' : ''}>
              ${c.full_name} (${c.client_type === 'PJ' ? 'CNPJ: ' + (c.cnpj || '—') : 'CPF: ' + (c.cpf || '—')}) — Contrato: ${formatMoney(c.contract_value || 0)}
            </option>
          `).join('');

        if (!instSelect.value && allClients.length > 0) {
          instSelect.value = allClients[0].id;
          handleFinClientSelect();
        }
      }

      // 2. Dropdown no modal de lançamentos
      const ftClientSelect = document.getElementById('ft-client-id');
      if (ftClientSelect) {
        ftClientSelect.innerHTML = '<option value="">Nenhum (Despesa / Geral)</option>' +
          allClients.map(c => `<option value="${c.id}">${c.full_name} (${c.id})</option>`).join('');
      }

      // 3. Dropdown no modal de alvarás
      const alvClientSelect = document.getElementById('alv-client-id');
      if (alvClientSelect) {
        alvClientSelect.innerHTML = '<option value="">Selecione o cliente...</option>' +
          allClients.map(c => `<option value="${c.id}">${c.full_name} (${c.id})</option>`).join('');
      }
    }

    let finMonthlyChartInstance = null;
    let finCategoryChartInstance = null;

    function renderFinancialBICharts(kpis) {
      if (typeof Chart === 'undefined') return;

      const ctxMonthly = document.getElementById('financeMonthlyChart');
      if (ctxMonthly) {
        if (finMonthlyChartInstance) finMonthlyChartInstance.destroy();
        // Também destrói instância remanescente criada por safeCreateChart/renderTabChart
        // na mesma canvas, evitando o erro "Canvas is already in use".
        const orphanFin = (typeof Chart.getChart === 'function') ? Chart.getChart(ctxMonthly) : null;
        if (orphanFin) orphanFin.destroy();
        if (window.panelCharts && window.panelCharts['financeMonthlyChart']) delete window.panelCharts['financeMonthlyChart'];

        const labels = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
        const currentMonthIdx = new Date().getMonth();
        const realizedData = labels.map((_, idx) => idx <= currentMonthIdx ? Math.round(18000 + idx * 3500 + (idx % 2 === 0 ? 4000 : -2000)) : null);
        const forecastData = labels.map((_, idx) => idx >= currentMonthIdx ? Math.round(22000 + idx * 2800) : null);

        finMonthlyChartInstance = new Chart(ctxMonthly, {
          type: 'bar',
          data: {
            labels,
            datasets: [
              {
                label: 'Honorários Recebidos (R$)',
                data: realizedData,
                backgroundColor: '#10B981',
                borderRadius: 6
              },
              {
                label: 'Previsão a Receber (R$)',
                data: forecastData,
                backgroundColor: '#F59E0B',
                borderRadius: 6
              }
            ]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
              legend: { position: 'top', labels: { boxWidth: 12, font: { size: 11 } } }
            },
            scales: {
              y: {
                beginAtZero: true,
                ticks: {
                  callback: (val) => 'R$ ' + (val / 1000).toFixed(0) + 'k',
                  font: { size: 10 }
                },
                grid: { color: '#F8FAFC' }
              },
              x: { grid: { display: false }, ticks: { font: { size: 10 } } }
            }
          }
        });
      }

      const ctxCat = document.getElementById('financeCategoryChart');
      if (ctxCat) {
        if (finCategoryChartInstance) finCategoryChartInstance.destroy();

        finCategoryChartInstance = new Chart(ctxCat, {
          type: 'doughnut',
          data: {
            labels: ['Trânsito & CNH', 'Cível & Família', 'Consumidor & Voos', 'Trabalhista', 'Empresarial'],
            datasets: [{
              data: [35, 25, 20, 12, 8],
              backgroundColor: ['#D97706', '#3B82F6', '#10B981', '#6366F1', '#EC4899']
            }]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
              legend: { position: 'bottom', labels: { boxWidth: 10, font: { size: 10 } } }
            }
          }
        });
      }
    }

    async function loadFinancialDashboard() {
      try {
        const res = await fetch('/api/financial/dashboard', { headers: getAuthHeaders() });
        const data = await res.json();
        if (res.ok && data.success) {
          const k = data.kpis;
          document.getElementById('fin-kpi-revenue').textContent = formatMoney(k.monthRevenue);
          document.getElementById('fin-kpi-expense').textContent = formatMoney(k.monthExpense);
          document.getElementById('fin-kpi-net').textContent = formatMoney(k.netIncome);
          document.getElementById('fin-kpi-upcoming').textContent = formatMoney(k.upcomingRevenue);
          document.getElementById('fin-kpi-overdue').textContent = formatMoney(k.overdueTotal);
          document.getElementById('fin-kpi-overdue-count').textContent = `${k.overdueCount} atrasos`;

          if (k.netIncome >= 0) {
            document.getElementById('fin-kpi-net').className = 'text-xl sm:text-2xl font-extrabold text-emerald-600 font-serif mt-1';
          } else {
            document.getElementById('fin-kpi-net').className = 'text-xl sm:text-2xl font-extrabold text-rose-600 font-serif mt-1';
          }

          renderFinancialBICharts(k);
        }
      } catch (err) {
        console.error('Erro ao carregar dashboard financeiro:', err);
      }
    }

    async function loadFinancialSettings() {
      try {
        const res = await fetch('/api/financial/settings', { headers: getAuthHeaders() });
        const data = await res.json();
        if (res.ok && data.success) {
          const s = data.settings || {};
          document.getElementById('cfg-asaas-key').value = s.asaas_api_key || '';
          document.getElementById('cfg-asaas-env').value = s.asaas_environment || 'sandbox';
          document.getElementById('cfg-office-pix').value = s.office_pix_key || '';
          
          const webhookBase = window.location.origin;
          document.getElementById('cfg-webhook-url').textContent = `${webhookBase}/api/webhooks/asaas`;

          const badge = document.getElementById('asaas-status-badge');
          if (s.asaas_api_key && s.asaas_api_key.trim().length > 10) {
            badge.className = 'px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40';
            badge.textContent = `🟢 Conectado (${s.asaas_environment === 'production' ? 'Produção Real' : 'Sandbox Testes'})`;
          } else {
            badge.className = 'px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-slate-800 text-slate-400 border border-slate-700';
            badge.textContent = '⚪ Chave Não Cadastrada';
          }
        }
      } catch (err) {
        console.error('Erro ao buscar configurações financeiras:', err);
      }
    }

    function toggleAsaasSettingsUI() {
      const panel = document.getElementById('asaas-settings-panel');
      panel.classList.toggle('hidden');
    }

    async function saveFinancialSettings() {
      const asaas_api_key = document.getElementById('cfg-asaas-key').value.trim();
      const asaas_environment = document.getElementById('cfg-asaas-env').value;
      const office_pix_key = document.getElementById('cfg-office-pix').value.trim();

      try {
        const res = await fetch('/api/financial/settings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
          body: JSON.stringify({ asaas_api_key, asaas_environment, office_pix_key })
        });
        const data = await res.json();
        if (res.ok && data.success) {
          alert('✅ Configurações do Asaas salvas com sucesso!');
          loadFinancialSettings();
        } else {
          alert('Erro ao salvar: ' + (data.error || 'Erro desconhecido.'));
        }
      } catch (err) {
        alert('Erro ao comunicar com o servidor.');
      }
    }

    async function testAsaasConnection() {
      const badge = document.getElementById('asaas-status-badge');
      badge.textContent = '⏳ Testando conexão...';
      try {
        const res = await fetch('/api/financial/asaas/test-connection', {
          method: 'POST',
          headers: getAuthHeaders()
        });
        const data = await res.json();
        if (res.ok && data.success) {
          alert(`🟢 Conexão com Asaas estabelecida com sucesso!\nSaldo atual na conta Asaas: ${formatMoney(data.balance)}`);
          loadFinancialSettings();
        } else {
          alert(`🔴 Falha na conexão com Asaas:\n${data.error || 'Verifique a chave de API e o ambiente selecionado.'}`);
          loadFinancialSettings();
        }
      } catch (err) {
        alert('Erro ao testar conexão com o Asaas.');
        loadFinancialSettings();
      }
    }

    function copyWebhookUrl() {
      const url = document.getElementById('cfg-webhook-url').textContent;
      navigator.clipboard.writeText(url).then(() => {
        alert('📋 URL do Webhook copiada para colar no painel do Asaas!');
      });
    }

    // ================= FLUXO DE CAIXA: LANÇAMENTOS =================

    async function loadFinancialTransactions() {
      const type = document.getElementById('fin-filter-type')?.value || 'ALL';
      const status = document.getElementById('fin-filter-status')?.value || 'ALL';

      try {
        const res = await fetch(`/api/financial/transactions?type=${type}&status=${status}`, { headers: getAuthHeaders() });
        const data = await res.json();
        if (res.ok && data.success) {
          allTransactions = data.transactions || [];
          renderFinancialTransactions(allTransactions);
        }
      } catch (err) {
        console.error('Erro ao listar transações:', err);
      }
    }

    function renderFinancialTransactions(transactions) {
      const tbody = document.getElementById('transactions-table-body');
      if (!tbody) return;

      if (transactions.length === 0) {
        tbody.innerHTML = `
          <tr>
            <td colspan="8" class="text-center py-8 text-slate-400">
              Nenhum lançamento financeiro encontrado com os filtros selecionados.
            </td>
          </tr>
        `;
        return;
      }

      tbody.innerHTML = transactions.map(t => {
        const isReceita = t.type === 'Receita';
        const typeBadge = isReceita 
          ? `<span class="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-800 font-bold text-[10px] border border-emerald-200">🟢 Entrada</span>`
          : `<span class="px-2 py-0.5 rounded-full bg-rose-50 text-rose-800 font-bold text-[10px] border border-rose-200">🔴 Saída</span>`;

        const isPendente = t.status === 'Pendente';
        const statusBadge = isPendente
          ? `<span class="px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 font-bold text-[10px] border border-amber-300">🟡 Pendente</span>`
          : `<span class="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-bold text-[10px] border border-emerald-300">🟢 Liquidado</span>`;

        const amountFormatted = isReceita 
          ? `<span class="font-bold text-emerald-600">+ ${formatMoney(t.amount)}</span>`
          : `<span class="font-bold text-rose-600">- ${formatMoney(t.amount)}</span>`;

        const clientInfo = t.client_name ? `<br/><span class="text-[10px] text-slate-400">Cliente: ${t.client_name}</span>` : '';
        const isRecurrent = /\(\d+\/\d+\)/.test(t.description);

        return `
          <tr class="hover:bg-slate-50/80 transition-colors">
            <td class="px-4 py-3 font-mono font-bold text-[11px] text-slate-700">${t.id}</td>
            <td class="px-4 py-3">
              ${typeBadge}
              <div class="text-[11px] font-semibold text-slate-700 mt-0.5">${t.category}</div>
            </td>
            <td class="px-4 py-3">
              <div class="font-medium text-slate-900 flex items-center space-x-1.5">
                <span>${t.description}</span>
                ${isRecurrent ? '<span class="px-1.5 py-0.5 rounded-md bg-amber-100 text-gold-900 font-bold text-[9px] border border-gold-300">🔁 Recorrente</span>' : ''}
              </div>
              ${clientInfo}
            </td>
            <td class="px-4 py-3 text-sm font-serif">${amountFormatted}</td>
            <td class="px-4 py-3">
              <div class="text-slate-800 font-medium">${formatDate(t.payment_date || t.due_date)}</div>
              ${t.payment_date ? '<span class="text-[10px] text-emerald-600 font-semibold">Pago</span>' : '<span class="text-[10px] text-slate-400">A vencer</span>'}
            </td>
            <td class="px-4 py-3 font-semibold text-slate-700 text-[11px]">${t.payment_method || 'PIX'}</td>
            <td class="px-4 py-3">${statusBadge}</td>
            <td class="px-4 py-3 text-center whitespace-nowrap">
              <div class="flex items-center justify-center space-x-1.5">
                ${isPendente ? `
                  <button 
                    onclick="quickPayTransaction('${t.id}')" 
                    class="px-2.5 py-1 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-800 font-bold text-xs border border-emerald-300 transition-colors flex items-center space-x-1" 
                    title="Liquidar / Marcar como Pago"
                  >
                    <span>✓</span>
                    <span>Liquidar</span>
                  </button>
                ` : ''}
                <button 
                  onclick="deleteTransaction('${t.id}')" 
                  class="p-1 text-slate-400 hover:text-rose-600 transition-colors" 
                  title="Excluir lançamento"
                >
                  🗑️
                </button>
              </div>
            </td>
          </tr>
        `;
      }).join('');
    }

    function toggleRecurringOptions() {
      const isChecked = document.getElementById('ft-is-recurring').checked;
      const fields = document.getElementById('ft-recurring-fields');
      if (isChecked) {
        fields.classList.remove('hidden');
      } else {
        fields.classList.add('hidden');
      }
    }

    function openNewTransactionModal() {
      document.getElementById('ft-id').value = '';
      document.getElementById('ft-type').value = 'Receita';
      document.getElementById('ft-description').value = '';
      document.getElementById('ft-amount').value = '';
      document.getElementById('ft-due-date').value = new Date().toISOString().split('T')[0];
      document.getElementById('ft-payment-date').value = new Date().toISOString().split('T')[0];
      document.getElementById('ft-status').value = 'Pago';
      document.getElementById('ft-notes').value = '';
      
      const recCheck = document.getElementById('ft-is-recurring');
      if (recCheck) {
        recCheck.checked = false;
        toggleRecurringOptions();
      }

      populateFinanceClientDropdowns();
      handleTransTypeChange();
      document.getElementById('transaction-modal').classList.remove('hidden');
    }

    function closeTransactionModal() {
      document.getElementById('transaction-modal').classList.add('hidden');
    }

    function handleTransTypeChange() {
      const type = document.getElementById('ft-type').value;
      const catSelect = document.getElementById('ft-category');
      const cats = type === 'Receita' ? REVENUE_CATEGORIES : EXPENSE_CATEGORIES;
      catSelect.innerHTML = cats.map(c => `<option value="${c}">${c}</option>`).join('');
    }

    async function handleSaveTransaction(e) {
      e.preventDefault();
      const id = document.getElementById('ft-id').value;
      const type = document.getElementById('ft-type').value;
      const category = document.getElementById('ft-category').value;
      const description = document.getElementById('ft-description').value.trim();
      const amount = parseFloat(document.getElementById('ft-amount').value) || 0;
      const due_date = document.getElementById('ft-due-date').value;
      const payment_date = document.getElementById('ft-payment-date').value;
      const status = document.getElementById('ft-status').value;
      const client_id = document.getElementById('ft-client-id').value || null;
      const payment_method = document.getElementById('ft-payment-method').value;
      const notes = document.getElementById('ft-notes').value.trim();

      const is_recurring = document.getElementById('ft-is-recurring')?.checked || false;
      const recurrence_period = document.getElementById('ft-recurrence-period')?.value || 'monthly';
      const recurrence_count = parseInt(document.getElementById('ft-recurrence-count')?.value, 10) || 12;

      const url = id ? `/api/financial/transactions/${id}` : '/api/financial/transactions';
      const method = id ? 'PUT' : 'POST';

      try {
        const res = await fetch(url, {
          method,
          headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
          body: JSON.stringify({ 
            type, category, description, amount, due_date, payment_date, status, client_id, payment_method, notes,
            is_recurring, recurrence_period, recurrence_count 
          })
        });
        const data = await res.json();
        if (res.ok && data.success) {
          closeTransactionModal();
          loadFinancialTransactions();
          loadFinancialDashboard();
          alert(data.message || '✅ Lançamento financeiro registrado com sucesso!');
        } else {
          alert('Erro ao salvar lançamento: ' + (data.error || 'Erro desconhecido.'));
        }
      } catch (err) {
        alert('Erro ao comunicar com o servidor.');
      }
    }

    async function quickPayTransaction(id) {
      if (!confirm(`Deseja marcar o lançamento #${id} como PAGO / LIQUIDADO hoje?`)) return;
      try {
        const res = await fetch(`/api/financial/transactions/${id}/pay`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
          body: JSON.stringify({ payment_date: new Date().toISOString().split('T')[0] })
        });
        const data = await res.json();
        if (res.ok && data.success) {
          loadFinancialTransactions();
          loadFinancialDashboard();
          alert('✅ Lançamento liquidado com sucesso!');
        } else {
          alert(data.error || 'Erro ao liquidar lançamento.');
        }
      } catch (err) {
        alert('Erro de comunicação.');
      }
    }

    async function deleteTransaction(id) {
      if (!confirm(`⚠️ Deseja realmente excluir o lançamento #${id}?`)) return;
      try {
        const res = await fetch(`/api/financial/transactions/${id}`, {
          method: 'DELETE',
          headers: getAuthHeaders()
        });
        const data = await res.json();
        if (res.ok && data.success) {
          loadFinancialTransactions();
          loadFinancialDashboard();
        } else {
          alert(data.error || 'Erro ao excluir.');
        }
      } catch (err) {
        alert('Erro de comunicação.');
      }
    }

    // ================= CARNÊS, PARCELAS & COBRANÇAS ASAAS =================

    function handleFinClientSelect() {
      const select = document.getElementById('fin-inst-client-select');
      const clientId = select?.value;
      currentSelectedFinClientId = clientId;
      if (!clientId) {
        document.getElementById('fin-client-contract-summary').classList.add('hidden');
        document.getElementById('installments-table-body').innerHTML = `
          <tr><td colspan="6" class="text-center py-8 text-slate-400">Selecione um cliente acima.</td></tr>
        `;
        return;
      }

      const client = allClients.find(c => c.id === clientId);
      if (client) {
        const summary = document.getElementById('fin-client-contract-summary');
        summary.innerHTML = `
          <div>
            <div class="text-[10px] uppercase font-bold text-slate-500">Cliente</div>
            <div class="font-bold text-navy-950">${client.full_name} (${client.client_type === 'PJ' ? 'CNPJ: ' + (client.cnpj || '—') : 'CPF: ' + (client.cpf || '—')})</div>
          </div>
          <div>
            <div class="text-[10px] uppercase font-bold text-slate-500">Valor Total do Contrato</div>
            <div class="font-extrabold text-navy-950 text-sm font-serif">${formatMoney(client.contract_value || 0)}</div>
          </div>
          <div>
            <div class="text-[10px] uppercase font-bold text-slate-500">Parcelamento</div>
            <div class="font-bold text-slate-700">${client.installments_count || 1}x de ${formatMoney(client.installment_value || 0)}</div>
          </div>
          <div>
            <div class="text-[10px] uppercase font-bold text-slate-500">Total Liquidado</div>
            <div class="font-bold text-emerald-700">${formatMoney(client.amount_paid || 0)}</div>
          </div>
          <div>
            <div class="text-[10px] uppercase font-bold text-slate-500">Saldo a Pagar</div>
            <div class="font-bold text-rose-700">${formatMoney(client.balance_due || 0)}</div>
          </div>
        `;
        summary.classList.remove('hidden');
      }

      loadClientInstallments(clientId);
    }

    async function loadClientInstallments(clientId) {
      if (!clientId) return;
      try {
        const res = await fetch(`/api/financial/installments/${clientId}`, { headers: getAuthHeaders() });
        const data = await res.json();
        if (res.ok && data.success) {
          allInstallments = data.installments || [];
          renderClientInstallments(allInstallments);
        }
      } catch (err) {
        console.error('Erro ao consultar parcelas:', err);
      }
    }

    function renderClientInstallments(installments) {
      const tbody = document.getElementById('installments-table-body');
      if (!tbody) return;

      if (installments.length === 0) {
        tbody.innerHTML = `
          <tr>
            <td colspan="6" class="text-center py-8 text-slate-400">
              Nenhuma parcela cadastrada para este cliente.<br/>
              <button onclick="generateInstallmentsForSelectedClient()" class="mt-2 px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-xs transition-colors">
                ⚡ Gerar Grade de Parcelas Agora
              </button>
            </td>
          </tr>
        `;
        return;
      }

      tbody.innerHTML = installments.map(inst => {
        const isPago = inst.status === 'Pago';
        const isVencido = !isPago && new Date(inst.due_date + 'T23:59:59') < new Date();
        
        let statusBadge = `<span class="px-2.5 py-1 rounded-full bg-amber-50 text-amber-800 font-bold text-xs border border-amber-200">🟡 Pendente</span>`;
        if (isPago) {
          statusBadge = `<span class="px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-800 font-bold text-xs border border-emerald-200">🟢 Quitado em ${formatDate(inst.paid_date)}</span>`;
        } else if (isVencido) {
          statusBadge = `<span class="px-2.5 py-1 rounded-full bg-rose-50 text-rose-800 font-bold text-xs border border-rose-200">🔴 Vencido</span>`;
        }

        // Bloco de Ações Asaas
        let asaasCol = '';
        if (inst.asaas_payment_id) {
          asaasCol = `
            <div class="flex items-center space-x-1.5">
              <button 
                onclick="showExistingAsaasChargeModal(${inst.id})" 
                class="px-2.5 py-1 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-800 font-bold text-[11px] border border-emerald-300 flex items-center space-x-1"
                title="Ver QR Code e código PIX"
              >
                <span>⚡ PIX / Boleto</span>
              </button>
              ${inst.asaas_invoice_url ? `<a href="${inst.asaas_invoice_url}" target="_blank" class="p-1 text-slate-500 hover:text-slate-900" title="Abrir Fatura">🔗</a>` : ''}
            </div>
          `;
        } else {
          asaasCol = isPago ? '<span class="text-xs text-slate-400">Quitado direto</span>' : `
            <button 
              onclick="generateAsaasCharge(${inst.id})" 
              class="px-3 py-1.5 rounded-xl bg-gradient-to-r from-emerald-600 to-emerald-700 hover:from-emerald-700 hover:to-emerald-800 text-white font-bold text-xs shadow-sm flex items-center space-x-1"
            >
              <span>⚡ Gerar PIX Asaas</span>
            </button>
          `;
        }

        return `
          <tr class="hover:bg-slate-50/80 transition-colors">
            <td class="px-4 py-3 font-bold text-slate-800">
              Parcela ${inst.installment_number} de ${inst.total_installments}
            </td>
            <td class="px-4 py-3 font-serif font-extrabold text-navy-950 text-sm">
              ${formatMoney(inst.amount)}
            </td>
            <td class="px-4 py-3 font-medium ${isVencido ? 'text-rose-700 font-bold' : 'text-slate-700'}">
              ${formatDate(inst.due_date)}
            </td>
            <td class="px-4 py-3">${statusBadge}</td>
            <td class="px-4 py-3">${asaasCol}</td>
            <td class="px-4 py-3 text-center">
              <div class="flex items-center justify-center space-x-1.5">
                <button 
                  onclick="openNewNfseModal('${currentSelectedFinClientId || ''}', ${inst.id}, ${inst.amount})"
                  class="px-2.5 py-1 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-900 text-xs font-bold border border-emerald-300 transition-colors"
                  title="Emitir Nota Fiscal (NFS-e Asaas) ou Recibo Timbrado OAB para esta parcela"
                >
                  🧾 NFS-e / Recibo
                </button>
                ${!isPago ? `
                  <button 
                    onclick="openManualPayModal(${inst.id})" 
                    class="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-emerald-50 hover:text-emerald-800 text-slate-700 text-xs font-bold border border-slate-200 transition-colors"
                    title="Dar baixa manual"
                  >
                    ✓ Baixa
                  </button>
                ` : `
                  <button 
                    onclick="generateReceiptForInstallment(${inst.id})" 
                    class="px-2.5 py-1 rounded-lg bg-gold-50 hover:bg-gold-100 text-gold-900 text-xs font-bold border border-gold-300 transition-colors"
                    title="Emitir recibo timbrado"
                  >
                    📄 Recibo
                  </button>
                `}
              </div>
            </td>
          </tr>
        `;
      }).join('');
    }

    async function generateInstallmentsForSelectedClient() {
      if (!currentSelectedFinClientId) {
        alert('Selecione um cliente para gerar as parcelas.');
        return;
      }

      if (!confirm('Deseja gerar/recalcular a grade de parcelas com base nos dados do contrato do cliente?')) return;

      try {
        const res = await fetch(`/api/financial/installments/${currentSelectedFinClientId}/generate`, {
          method: 'POST',
          headers: getAuthHeaders()
        });
        const data = await res.json();
        if (res.ok && data.success) {
          alert('✅ Grade de parcelas gerada com sucesso!');
          loadClientInstallments(currentSelectedFinClientId);
          loadClients();
          loadFinancialDashboard();
        } else {
          alert(data.error || 'Erro ao gerar parcelas.');
        }
      } catch (err) {
        alert('Erro ao comunicar com o servidor.');
      }
    }

    async function generateAsaasCharge(installmentId) {
      try {
        const res = await fetch(`/api/financial/installments/${installmentId}/asaas-charge`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
          body: JSON.stringify({ billingType: 'UNDEFINED' })
        });
        const data = await res.json();
        if (res.ok && data.success) {
          loadClientInstallments(currentSelectedFinClientId);
          showExistingAsaasChargeModal(installmentId, data);
        } else {
          alert('Erro ao gerar cobrança no Asaas:\n' + (data.error || 'Verifique as configurações de API do Asaas.'));
        }
      } catch (err) {
        alert('Erro ao gerar cobrança no Asaas.');
      }
    }

    function showExistingAsaasChargeModal(installmentId, preloadedData = null) {
      const inst = allInstallments.find(i => i.id === installmentId);
      const client = allClients.find(c => c.id === currentSelectedFinClientId);

      if (!inst && !preloadedData) return;

      const clientName = client ? client.full_name : 'Cliente';
      const amount = inst ? inst.amount : 0;
      const dueDate = inst ? inst.due_date : '';
      const qrCode = preloadedData?.pixQrCode || inst?.asaas_pix_qrcode;
      const copyPaste = preloadedData?.pixCopyPaste || inst?.asaas_pix_copy_paste;
      const invoiceUrl = preloadedData?.invoiceUrl || inst?.asaas_invoice_url;
      const bankSlipUrl = preloadedData?.bankSlipUrl || inst?.asaas_bank_slip_url;

      document.getElementById('asaas-modal-client').textContent = `${clientName} (Parc. ${inst?.installment_number}/${inst?.total_installments})`;
      document.getElementById('asaas-modal-amount').textContent = formatMoney(amount);
      document.getElementById('asaas-modal-due').textContent = formatDate(dueDate);
      
      const qrImg = document.getElementById('asaas-modal-qrcode-img');
      if (qrCode) {
        qrImg.src = qrCode.startsWith('data:') ? qrCode : `data:image/png;base64,${qrCode}`;
        document.getElementById('asaas-modal-qrcode-container').classList.remove('hidden');
      } else {
        document.getElementById('asaas-modal-qrcode-container').classList.add('hidden');
      }

      document.getElementById('asaas-modal-copypaste').value = copyPaste || 'Chave PIX gerada na fatura';

      const boletoBtn = document.getElementById('asaas-modal-boleto-link');
      if (bankSlipUrl) {
        boletoBtn.href = bankSlipUrl;
        boletoBtn.classList.remove('hidden');
      } else {
        boletoBtn.classList.add('hidden');
      }

      const faturaBtn = document.getElementById('asaas-modal-fatura-link');
      if (invoiceUrl) {
        faturaBtn.href = invoiceUrl;
        faturaBtn.classList.remove('hidden');
      } else {
        faturaBtn.classList.add('hidden');
      }

      currentAsaasPaymentData = { client, inst, copyPaste, invoiceUrl };
      document.getElementById('asaas-charge-modal').classList.remove('hidden');
    }

    function closeAsaasChargeModal() {
      document.getElementById('asaas-charge-modal').classList.add('hidden');
    }

    function copyAsaasPixCode(btn) {
      const code = document.getElementById('asaas-modal-copypaste').value;
      if (!code) return;
      navigator.clipboard.writeText(code).then(() => {
        copyToClipboard(code, btn);
      });
    }

    function sendAsaasChargeWhatsApp() {
      if (!currentAsaasPaymentData) return;
      const { client, inst, copyPaste, invoiceUrl } = currentAsaasPaymentData;
      if (!client) return;

      const cleanPhone = (client.phone || '').replace(/\D/g, '');
      const clientFirstName = client.full_name.split(' ')[0];

      let msg = `Olá, ${clientFirstName}! Tudo bem?\n\n`;
      msg += `Seguem os dados para pagamento dos honorários advocatícios referente à *Parcela ${inst.installment_number}/${inst.total_installments}* com vencimento em *${formatDate(inst.due_date)}* no valor de *${formatMoney(inst.amount)}*.\n\n`;
      if (copyPaste) {
        msg += `🔑 *Chave PIX Copia e Cola:*\n\`${copyPaste}\`\n\n`;
      }
      if (invoiceUrl) {
        msg += `📄 *Fatura / Boleto / Cartão:*\n${invoiceUrl}\n\n`;
      }
      msg += `Qualquer dúvida estamos à disposição!\n*Jorge Alvim Advocacia*`;

      const waUrl = `https://api.whatsapp.com/send?phone=55${cleanPhone}&text=${encodeURIComponent(msg)}`;
      window.open(waUrl, '_blank');
    }

    function openManualPayModal(installmentId) {
      const inst = allInstallments.find(i => i.id === installmentId);
      const client = allClients.find(c => c.id === currentSelectedFinClientId);
      if (!inst) return;

      document.getElementById('mp-inst-id').value = inst.id;
      document.getElementById('mp-display-client').textContent = client ? client.full_name : 'Cliente';
      document.getElementById('mp-display-inst').textContent = `${inst.installment_number} de ${inst.total_installments}`;
      document.getElementById('mp-display-amount').textContent = formatMoney(inst.amount);
      document.getElementById('mp-paid-amount').value = inst.amount;
      document.getElementById('mp-paid-date').value = new Date().toISOString().split('T')[0];
      document.getElementById('mp-notes').value = '';

      document.getElementById('manual-pay-modal').classList.remove('hidden');
    }

    function closeManualPayModal() {
      document.getElementById('manual-pay-modal').classList.add('hidden');
    }

    async function handleConfirmManualPay(e) {
      e.preventDefault();
      const id = document.getElementById('mp-inst-id').value;
      const paid_amount = parseFloat(document.getElementById('mp-paid-amount').value) || 0;
      const paid_date = document.getElementById('mp-paid-date').value;
      const payment_method = document.getElementById('mp-payment-method').value;
      const notes = document.getElementById('mp-notes').value.trim();

      try {
        const res = await fetch(`/api/financial/installments/${id}/manual-pay`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
          body: JSON.stringify({ paid_amount, paid_date, payment_method, notes })
        });
        const data = await res.json();
        if (res.ok && data.success) {
          closeManualPayModal();
          loadClientInstallments(currentSelectedFinClientId);
          loadClients();
          loadFinancialDashboard();
          alert('✅ Baixa de parcela efetuada com sucesso!');
        } else {
          alert(data.error || 'Erro ao registrar baixa.');
        }
      } catch (err) {
        alert('Erro ao comunicar com o servidor.');
      }
    }

    function generateReceiptForInstallment(installmentId) {
      const inst = allInstallments.find(i => i.id === installmentId);
      const client = allClients.find(c => c.id === currentSelectedFinClientId);
      if (!inst || !client) return;

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

      const receiptHTML = `
        ${letterheadHTML}
        <div style="text-align: center; margin-bottom: 30px;">
          <h2 style="font-size: 18px; font-weight: bold; letter-spacing: 2px; text-decoration: underline; color: #0a192f;">
            RECIBO DE PAGAMENTO DE HONORÁRIOS
          </h2>
          <div style="font-size: 14px; font-weight: bold; color: #b8860b; margin-top: 6px;">
            VALOR: ${formatMoney(inst.paid_amount || inst.amount)}
          </div>
        </div>

        <div style="text-align: justify; line-height: 1.8; font-size: 11pt; space-y-4;">
          <p style="text-indent: 2.5em; margin-bottom: 20px;">
            Recebi de <strong>${client.full_name.toUpperCase()}</strong>, inscrito(a) no CPF/CNPJ sob o nº <strong>${client.cpf || client.cnpj || '—'}</strong>, a quantia de <strong>${formatMoney(inst.paid_amount || inst.amount)}</strong>, referente ao pagamento da <strong>Parcela ${inst.installment_number} de ${inst.total_installments}</strong> do Contrato de Prestação de Serviços Advocatícios, quitada em <strong>${formatDate(inst.paid_date || inst.due_date)}</strong> via <strong>${inst.payment_method || 'PIX'}</strong>.
          </p>

          <p style="text-indent: 2.5em; margin-bottom: 30px;">
            Pelo que dou plena, rasa e geral quitação referente exclusivamente à parcela supramencionada.
          </p>

          <div style="text-align: center; margin-top: 40px; margin-bottom: 60px;">
            <p>${getCurrentFullDateFormatted()}.</p>
          </div>

          <div style="text-align: center; margin-top: 60px;">
            <div style="border-top: 1px solid #000; width: 320px; margin: 0 auto 6px auto;"></div>
            <p style="font-weight: bold; margin: 0;">JORGE EDUARDO DA SILVA ALVIM</p>
            <p style="font-size: 11px; color: #475569; margin: 0;">Advogado — OAB/MG 222.943</p>
          </div>
        </div>
      `;

      const container = document.getElementById('printable-document-content');
      if (container) {
        container.innerHTML = receiptHTML;
      }
      document.getElementById('doc-preview-title').textContent = `Recibo de Honorários — Parcela ${inst.installment_number}/${inst.total_installments}`;
      document.getElementById('doc-preview-modal').classList.remove('hidden');
    }

    // ================= ALVARÁS JUDICIAIS & RPVs =================

    async function loadAlvaras() {
      try {
        const res = await fetch('/api/financial/alvaras', { headers: getAuthHeaders() });
        const data = await res.json();
        if (res.ok && data.success) {
          allAlvaras = data.alvaras || [];
          renderAlvaras(allAlvaras);
        }
      } catch (err) {
        console.error('Erro ao listar alvarás:', err);
      }
    }

    function renderAlvaras(alvaras) {
      const tbody = document.getElementById('alvaras-table-body');
      if (!tbody) return;

      if (alvaras.length === 0) {
        tbody.innerHTML = `
          <tr>
            <td colspan="8" class="text-center py-8 text-slate-400">Nenhum alvará registrado até o momento.</td>
          </tr>
        `;
        return;
      }

      tbody.innerHTML = alvaras.map(a => {
        const statusBadge = a.status === 'Repassado ao Cliente'
          ? `<span class="px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-800 font-bold text-[10px] border border-emerald-200">🟢 Repassado</span>`
          : `<span class="px-2.5 py-1 rounded-full bg-amber-50 text-amber-800 font-bold text-[10px] border border-amber-200">🟡 Pendente Repasse</span>`;

        return `
          <tr class="hover:bg-slate-50/80 transition-colors">
            <td class="px-4 py-3 font-mono font-bold text-[11px] text-slate-700">${a.id}</td>
            <td class="px-4 py-3">
              <div class="font-bold text-navy-950">${a.client_name || 'Cliente'}</div>
              <div class="text-[10px] text-slate-500 font-mono">${a.process_number || 'Sem nº processo'}</div>
            </td>
            <td class="px-4 py-3 font-bold text-slate-800">${formatMoney(a.gross_amount)}</td>
            <td class="px-4 py-3 font-extrabold text-gold-700">${formatMoney(a.fee_amount)} (${a.fee_percentage}%)</td>
            <td class="px-4 py-3 font-extrabold text-emerald-700">${formatMoney(a.net_client_amount)}</td>
            <td class="px-4 py-3 font-medium text-slate-700">${formatDate(a.release_date)}</td>
            <td class="px-4 py-3">${statusBadge}</td>
            <td class="px-4 py-3 text-center">
              <button 
                onclick="generateAlvaraPrestacaoContas('${a.id}')" 
                class="px-2.5 py-1 rounded-lg bg-gold-50 hover:bg-gold-100 text-gold-900 font-bold text-[11px] border border-gold-300"
                title="Emitir termo de prestação de contas"
              >
                📄 Prestação de Contas
              </button>
            </td>
          </tr>
        `;
      }).join('');
    }

    function openNewAlvaraModal() {
      populateFinanceClientDropdowns();
      document.getElementById('alv-gross-amount').value = '';
      document.getElementById('alv-fee-pct').value = '30';
      document.getElementById('alv-process-number').value = '';
      document.getElementById('alv-vara').value = '';
      document.getElementById('alv-release-date').value = new Date().toISOString().split('T')[0];
      document.getElementById('alv-notes').value = '';
      recalcAlvaraPreview();
      document.getElementById('alvara-modal').classList.remove('hidden');
    }

    function closeAlvaraModal() {
      document.getElementById('alvara-modal').classList.add('hidden');
    }

    function recalcAlvaraPreview() {
      const gross = parseFloat(document.getElementById('alv-gross-amount')?.value) || 0;
      const pct = parseFloat(document.getElementById('alv-fee-pct')?.value) || 30;
      const fee = (gross * pct) / 100;
      const net = gross - fee;

      document.getElementById('alv-preview-fee').textContent = `${formatMoney(fee)} (${pct}%)`;
      document.getElementById('alv-preview-net').textContent = formatMoney(net);
    }

    async function handleSaveAlvara(e) {
      e.preventDefault();
      const client_id = document.getElementById('alv-client-id').value;
      const process_number = document.getElementById('alv-process-number').value.trim();
      const vara_tribunal = document.getElementById('alv-vara').value.trim();
      const gross_amount = parseFloat(document.getElementById('alv-gross-amount').value) || 0;
      const fee_percentage = parseFloat(document.getElementById('alv-fee-pct').value) || 30;
      const release_date = document.getElementById('alv-release-date').value;
      const status = document.getElementById('alv-status').value;
      const notes = document.getElementById('alv-notes').value.trim();

      try {
        const res = await fetch('/api/financial/alvaras', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
          body: JSON.stringify({ client_id, process_number, vara_tribunal, gross_amount, fee_percentage, release_date, status, notes })
        });
        const data = await res.json();
        if (res.ok && data.success) {
          closeAlvaraModal();
          loadAlvaras();
          loadFinancialDashboard();
          alert('✅ Alvará registrado e honorários de êxito lançados no fluxo de caixa!');
        } else {
          alert(data.error || 'Erro ao registrar alvará.');
        }
      } catch (err) {
        alert('Erro ao comunicar com o servidor.');
      }
    }

    function generateAlvaraPrestacaoContas(alvaraId) {
      const a = allAlvaras.find(x => x.id === alvaraId);
      if (!a) return;

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

      const docHTML = `
        ${letterheadHTML}
        <div style="text-align: center; margin-bottom: 26px;">
          <h2 style="font-size: 16px; font-weight: bold; letter-spacing: 2px; text-decoration: underline; color: #0a192f;">
            TERMO DE PRESTAÇÃO DE CONTAS & QUITAÇÃO DE ALVARÁ JUDICIAL
          </h2>
          <div style="font-size: 11px; color: #64748b; margin-top: 4px;">
            Processo nº: ${a.process_number || 'Conforme autos'} • ${a.vara_tribunal || 'Poder Judiciário'}
          </div>
        </div>

        <div style="text-align: justify; line-height: 1.7; font-size: 11pt;">
          <p style="text-indent: 2.5em; margin-bottom: 14px;">
            Pelo presente instrumento particular de prestação de contas, o advogado <strong>JORGE EDUARDO DA SILVA ALVIM</strong> (OAB/MG 222.943) presta contas ao(à) seu(sua) constituinte <strong>${(a.client_name || 'CLIENTE').toUpperCase()}</strong> referente aos valores levantados por meio de Alvará Judicial / RPV nos autos do processo em epígrafe, conforme demonstrativo financeiro a seguir:
          </p>

          <div style="background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 8px; padding: 14px; margin: 18px 0; font-size: 10.5pt; font-family: monospace;">
            <div style="display: flex; justify-content: space-between; border-bottom: 1px solid #e2e8f0; padding-bottom: 6px; margin-bottom: 6px;">
              <span>(+) VALOR BRUTO LEVANTADO DO ALVARÁ/RPV:</span>
              <strong>${formatMoney(a.gross_amount)}</strong>
            </div>
            <div style="display: flex; justify-content: space-between; border-bottom: 1px solid #e2e8f0; padding-bottom: 6px; margin-bottom: 6px; color: #b91c1c;">
              <span>(-) HONORÁRIOS ADVOCATÍCIOS CONTRATUAIS (${a.fee_percentage}%):</span>
              <strong>${formatMoney(a.fee_amount)}</strong>
            </div>
            <div style="display: flex; justify-content: space-between; font-weight: bold; font-size: 11.5pt; color: #047857;">
              <span>(=) VALOR LÍQUIDO REPASSADO AO CLIENTE:</span>
              <span>${formatMoney(a.net_client_amount)}</span>
            </div>
          </div>

          <p style="text-indent: 2.5em; margin-bottom: 16px;">
            O(A) constituinte declara haver recebido o montante líquido retroespecificado, conferido todas as contas e deduções contratuais acordadas, conferindo ao patrono plena, rasa, geral e irrevogável quitação de todas as obrigações para nada mais reclamar a qualquer título.
          </p>

          <div style="text-align: center; margin-top: 30px; margin-bottom: 40px;">
            <p>${getCurrentFullDateFormatted()}.</p>
          </div>

          <div style="display: flex; justify-content: space-around; margin-top: 50px; text-align: center;">
            <div style="width: 42%;">
              <div style="border-top: 1px solid #000; margin-bottom: 5px;"></div>
              <strong>${(a.client_name || 'CLIENTE').toUpperCase()}</strong>
              <div style="font-size: 10px; color: #64748b;">Constituinte / Beneficiário</div>
            </div>
            <div style="width: 42%;">
              <div style="border-top: 1px solid #000; margin-bottom: 5px;"></div>
              <strong>JORGE EDUARDO DA SILVA ALVIM</strong>
              <div style="font-size: 10px; color: #64748b;">OAB/MG 222.943 — Advogado</div>
            </div>
          </div>
        </div>
      `;

      const container = document.getElementById('printable-document-content');
      if (container) {
        container.innerHTML = docHTML;
      }
      document.getElementById('doc-preview-title').textContent = `Termo de Prestação de Contas — Alvará #${a.id}`;
      document.getElementById('doc-preview-modal').classList.remove('hidden');
    }

    // ================= RELATÓRIO LIVRO CAIXA =================

    function renderCashflowReport() {
      const container = document.getElementById('livro-caixa-report-container');
      if (!container) return;

      const now = new Date();
      const curMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
      
      const monthTransactions = allTransactions.filter(t => (t.payment_date || t.due_date || '').startsWith(curMonth));
      const totalRev = monthTransactions.filter(t => t.type === 'Receita' && t.status === 'Pago').reduce((acc, t) => acc + t.amount, 0);
      const totalExp = monthTransactions.filter(t => t.type === 'Despesa' && t.status === 'Pago').reduce((acc, t) => acc + t.amount, 0);
      const net = totalRev - totalExp;

      container.innerHTML = `
        <div class="border-b border-slate-200 pb-4 flex justify-between items-center">
          <div>
            <h4 class="font-serif font-bold text-lg text-navy-950">Demonstrativo Financeiro do Mês (${curMonth})</h4>
            <p class="text-xs text-slate-500">Jorge Alvim Advocacia • CNPJ/OAB MG 222.943</p>
          </div>
          <div class="text-right">
            <div class="text-xs text-slate-500 font-medium">Resultado Líquido do Mês:</div>
            <div class="text-xl font-bold font-serif ${net >= 0 ? 'text-emerald-700' : 'text-rose-700'}">${formatMoney(net)}</div>
          </div>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2">
          <!-- Resumo de Receitas por Categoria -->
          <div class="space-y-3">
            <h5 class="text-xs font-bold text-emerald-800 uppercase tracking-wider border-b border-emerald-100 pb-1">
              Entradas / Receitas (${formatMoney(totalRev)})
            </h5>
            <div class="space-y-1.5 text-xs">
              ${REVENUE_CATEGORIES.map(cat => {
                const subTotal = monthTransactions.filter(t => t.type === 'Receita' && t.category === cat && t.status === 'Pago').reduce((acc, t) => acc + t.amount, 0);
                return `
                  <div class="flex justify-between py-1 border-b border-slate-100">
                    <span class="text-slate-600">${cat}</span>
                    <span class="font-bold text-slate-900">${formatMoney(subTotal)}</span>
                  </div>
                `;
              }).join('')}
            </div>
          </div>

          <!-- Resumo de Despesas por Categoria -->
          <div class="space-y-3">
            <h5 class="text-xs font-bold text-rose-800 uppercase tracking-wider border-b border-rose-100 pb-1">
              Saídas / Despesas (${formatMoney(totalExp)})
            </h5>
            <div class="space-y-1.5 text-xs">
              ${EXPENSE_CATEGORIES.map(cat => {
                const subTotal = monthTransactions.filter(t => t.type === 'Despesa' && t.category === cat && t.status === 'Pago').reduce((acc, t) => acc + t.amount, 0);
                return `
                  <div class="flex justify-between py-1 border-b border-slate-100">
                    <span class="text-slate-600">${cat}</span>
                    <span class="font-bold text-slate-900">${formatMoney(subTotal)}</span>
                  </div>
                `;
              }).join('')}
            </div>
          </div>
        </div>
      `;
    }

    function printCashflowReport() {
      const container = document.getElementById('livro-caixa-report-container');
      if (!container) return;

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

      const printHTML = `
        ${letterheadHTML}
        ${container.innerHTML}
        <div style="text-align: center; margin-top: 40px; font-size: 10.5px; color: #64748b;">
          Relatório gerado em ${getCurrentFullDateFormatted()} • Sistema Jorge Alvim Advocacia
        </div>
      `;

      const target = document.getElementById('printable-document-content');
      if (target) target.innerHTML = printHTML;
      document.getElementById('doc-preview-title').textContent = 'Livro Caixa / Relatório Financeiro';
      document.getElementById('doc-preview-modal').classList.remove('hidden');
    }

    function openClientFinancialTab(clientId) {
      currentSelectedFinClientId = clientId;
      switchTab('finance');
      switchFinanceSubTab('installments');
      const select = document.getElementById('fin-inst-client-select');
      if (select) {
        select.value = clientId;
        handleFinClientSelect();
      }
    }

    // ================= 6.1 MÓDULO DE NOTAS FISCAIS (NFS-E ASAAS) & RECIBOS OAB =================
    let allNfseInvoices = [];

    async function loadNfseList() {
      const token = getToken();
      try {
        const type = document.getElementById('nfse-filter-type')?.value || document.getElementById('nfse-filter-type-2')?.value || '';
        const status = document.getElementById('nfse-filter-status')?.value || document.getElementById('nfse-filter-status-2')?.value || '';
        let url = `/api/financial/nfse?limit=150`;
        if (type) url += `&invoice_type=${encodeURIComponent(type)}`;
        if (status) url += `&status=${encodeURIComponent(status)}`;

        const res = await fetch(url, { headers: { 'Authorization': `Bearer ${token}` } });
        const data = await res.json();

        if (res.ok && data.success) {
          allNfseInvoices = data.invoices || [];
          const kpis = data.kpis || {};

          // Atualizar KPIs da sub-aba e da aba principal
          const setKpi = (id, val) => {
            const el = document.getElementById(id);
            if (el) el.textContent = val;
          };

          const formattedTotal = formatMoney(kpis.total_value || 0);
          const formattedCount = `${kpis.total_count || 0} documentos emitidos`;
          const formattedTaxes = formatMoney(kpis.total_taxes || 0);

          setKpi('nfse-kpi-total-val', formattedTotal);
          setKpi('nfse-kpi-total-val-2', formattedTotal);
          setKpi('nfse-kpi-total-count', formattedCount);
          setKpi('nfse-kpi-total-count-2', formattedCount);
          setKpi('nfse-kpi-asaas-count', kpis.total_nfse_asaas || 0);
          setKpi('nfse-kpi-asaas-count-2', kpis.total_nfse_asaas || 0);
          setKpi('nfse-kpi-receipts-count', kpis.total_recibos_rps || 0);
          setKpi('nfse-kpi-receipts-count-2', kpis.total_recibos_rps || 0);
          setKpi('nfse-kpi-taxes-val', formattedTaxes);
          setKpi('nfse-kpi-taxes-val-2', formattedTaxes);

          renderNfseTable(allNfseInvoices);
        }
      } catch (err) {
        console.error('Erro ao carregar lista de NFS-e e Recibos:', err);
      }
    }

    function renderNfseTable(invoices) {
      const tbodies = [
        document.getElementById('nfse-table-body'),
        document.getElementById('nfse-table-body-2')
      ].filter(Boolean);

      if (tbodies.length === 0) return;

      if (!invoices || invoices.length === 0) {
        const emptyHtml = `
          <tr>
            <td colspan="8" class="text-center py-10 text-slate-400">
              Nenhuma Nota Fiscal ou Recibo emitido. Clique em <strong>"+ Emitir Nova Nota Fiscal / Recibo"</strong> para começar.
            </td>
          </tr>
        `;
        tbodies.forEach(tb => { tb.innerHTML = emptyHtml; });
        return;
      }

      const rowsHtml = invoices.map(inv => {
        const isNfse = inv.invoice_type === 'NFSE_ASAAS';
        const typeBadge = isNfse
          ? '<span class="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-800 font-bold text-[10px] border border-emerald-200">🧾 NFS-e Asaas</span>'
          : '<span class="px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-800 font-bold text-[10px] border border-indigo-200">📜 Recibo / RPS OAB</span>';

        let statusBadge = '<span class="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-800 font-bold text-[10px] border border-emerald-200">🟢 Emitida</span>';
        if (inv.status === 'Processando' || inv.status === 'Pendente') {
          statusBadge = '<span class="px-2 py-0.5 rounded-full bg-amber-50 text-amber-800 font-bold text-[10px] border border-amber-200">🟡 Processando</span>';
        } else if (inv.status === 'Cancelada') {
          statusBadge = '<span class="px-2 py-0.5 rounded-full bg-rose-50 text-rose-800 font-bold text-[10px] border border-rose-200">🔴 Cancelada</span>';
        }

        const clientDoc = inv.client_cnpj || inv.client_cpf || '—';
        const taxes = (inv.iss_value || 0) + (inv.irrf_value || 0);

        return `
          <tr class="hover:bg-slate-50 transition-colors">
            <td class="px-4 py-3 font-mono font-bold text-navy-950 text-xs">
              ${inv.invoice_number}
              <span class="block text-[9px] font-normal text-slate-400">Cód: ${inv.verification_code || 'AUTORIZADO'}</span>
            </td>
            <td class="px-4 py-3">${typeBadge}</td>
            <td class="px-4 py-3">
              <div class="font-bold text-slate-800">${inv.client_name}</div>
              <div class="text-[10px] text-slate-400 font-mono">${clientDoc}</div>
            </td>
            <td class="px-4 py-3 font-extrabold text-emerald-700 text-xs">
              ${formatMoney(inv.value || 0)}
            </td>
            <td class="px-4 py-3 text-[11px] text-slate-600">
              ${taxes > 0 ? formatMoney(taxes) : '—'}
            </td>
            <td class="px-4 py-3 text-slate-500 text-[11px]">
              ${formatDate(inv.issue_date)}
            </td>
            <td class="px-4 py-3">${statusBadge}</td>
            <td class="px-4 py-3 text-right whitespace-nowrap">
              <div class="flex items-center justify-end space-x-1.5">
                <button 
                  type="button"
                  onclick="openNfsePreview(${inv.id})" 
                  class="px-2.5 py-1 rounded-lg bg-navy-950 hover:bg-navy-900 text-gold-400 font-bold text-[11px] transition-colors shadow-2xs"
                  title="Visualizar e Imprimir Espelho Timbrado"
                >
                  🖨️ Ver / Imprimir
                </button>
                ${inv.pdf_url ? `
                  <a 
                    href="${inv.pdf_url}" 
                    target="_blank" 
                    class="px-2 py-1 rounded-lg bg-emerald-100 hover:bg-emerald-200 text-emerald-800 font-bold text-[10px] transition-colors"
                    title="Baixar PDF Oficial Asaas"
                  >
                    📥 PDF Asaas
                  </a>
                ` : ''}
                ${inv.xml_url ? `
                  <a 
                    href="${inv.xml_url}" 
                    target="_blank" 
                    class="px-2 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-[10px] transition-colors"
                    title="Baixar XML Fiscal"
                  >
                    📥 XML
                  </a>
                ` : ''}
                ${isNfse && inv.asaas_invoice_id ? `
                  <button 
                    type="button"
                    onclick="syncAsaasNfse(${inv.id})" 
                    class="p-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 transition-colors"
                    title="Sincronizar com Asaas"
                  >
                    🔄
                  </button>
                ` : ''}
                ${inv.status !== 'Cancelada' ? `
                  <button 
                    type="button"
                    onclick="cancelNfseDoc(${inv.id})" 
                    class="p-1 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-600 transition-colors"
                    title="Cancelar Documento"
                  >
                    ✕
                  </button>
                ` : ''}
              </div>
            </td>
          </tr>
        `;
      }).join('');

      tbodies.forEach(tb => { tb.innerHTML = rowsHtml; });
    }

    function openNewNfseModal(clientId = '', installmentId = '', defaultAmount = 0) {
      // 1. Popula dropdown de clientes
      const selectCli = document.getElementById('nfse-client-id');
      if (selectCli) {
        selectCli.innerHTML = '<option value="">Selecione o cliente...</option>' +
          allClients.map(c => `
            <option value="${c.id}" ${c.id === clientId ? 'selected' : ''}>
              ${c.full_name} (${c.client_type === 'PJ' ? 'CNPJ: ' + (c.cnpj || '—') : 'CPF: ' + (c.cpf || '—')})
            </option>
          `).join('');
      }

      if (clientId) {
        handleNfseClientSelect(installmentId, defaultAmount);
      } else {
        const instSelect = document.getElementById('nfse-installment-id');
        if (instSelect) instSelect.innerHTML = '<option value="">Lançamento Avulso (Sem parcela)</option>';
        document.getElementById('nfse-amount').value = '';
      }

      handleNfseDocTypeChange();
      document.getElementById('nfse-issue-modal').classList.remove('hidden');
    }

    function closeNfseModal() {
      document.getElementById('nfse-issue-modal').classList.add('hidden');
    }

    function handleNfseDocTypeChange() {
      const type = document.getElementById('nfse-doc-type').value;
      const desc = document.getElementById('nfse-service-desc');
      const submitBtn = document.getElementById('nfse-submit-btn');

      if (type === 'RECIBO_OAB_RPS') {
        if (!desc.value || desc.value.includes('NFS-e') || desc.value.includes('Dr. Jorge Alvim.')) {
          desc.value = 'Recebemos a importância discriminada referente a honorários advocatícios e assessoria jurídica especializada, em estrita conformidade com o Estatuto da OAB (Lei Federal 8.906/94). Dando plena quitação.';
        }
        submitBtn.innerHTML = '<span>📜 Emitir Recibo Timbrado OAB (SHA-256)</span>';
      } else {
        if (!desc.value || desc.value.includes('Estatuto')) {
          desc.value = 'Serviços Técnicos Advocatícios e Assessoria Jurídica Extrajudicial/Judicial - OAB/MG 142.890 - Dr. Jorge Alvim.';
        }
        submitBtn.innerHTML = '<span>🧾 Transmitir NFS-e Asaas (Prefeitura)</span>';
      }
    }

    async function handleNfseClientSelect(selectedInstallmentId = '', defaultAmount = 0) {
      const cliId = document.getElementById('nfse-client-id').value;
      const instSelect = document.getElementById('nfse-installment-id');
      const amountInput = document.getElementById('nfse-amount');

      if (!cliId) {
        instSelect.innerHTML = '<option value="">Lançamento Avulso (Sem parcela)</option>';
        return;
      }

      const client = allClients.find(c => c.id === cliId);
      if (client && !defaultAmount && !selectedInstallmentId) {
        amountInput.value = client.installment_value || client.contract_value || 1000;
      }

      // Buscar parcelas do cliente
      try {
        const token = getToken();
        const res = await fetch(`/api/financial/installments/${cliId}`, { headers: { 'Authorization': `Bearer ${token}` } });
        const data = await res.json();
        if (res.ok && data.success) {
          const insts = data.installments || [];
          instSelect.innerHTML = '<option value="">Lançamento Avulso (Sem parcela)</option>' +
            insts.map(i => `
              <option value="${i.id}" data-amount="${i.amount}" ${String(i.id) === String(selectedInstallmentId) ? 'selected' : ''}>
                Parcela ${i.installment_number}/${i.total_installments} — Venc: ${formatDate(i.due_date)} (${formatMoney(i.amount)}) [${i.status}]
              </option>
            `).join('');

          if (selectedInstallmentId) {
            const match = insts.find(i => String(i.id) === String(selectedInstallmentId));
            if (match) amountInput.value = match.amount;
          }
        }
      } catch (e) {
        console.warn('Erro ao carregar parcelas no modal de NFS-e:', e);
      }
    }

    function handleNfseInstallmentSelect() {
      const instSelect = document.getElementById('nfse-installment-id');
      const opt = instSelect.options[instSelect.selectedIndex];
      if (opt && opt.dataset.amount) {
        document.getElementById('nfse-amount').value = parseFloat(opt.dataset.amount) || '';
      }
    }

    async function handleNfseSubmit(e) {
      e.preventDefault();
      const token = getToken();
      const docType = document.getElementById('nfse-doc-type').value;
      const clientId = document.getElementById('nfse-client-id').value;
      const installmentId = document.getElementById('nfse-installment-id').value || null;
      const amount = parseFloat(document.getElementById('nfse-amount').value) || 0;
      const serviceCode = document.getElementById('nfse-service-code').value || '17.01';
      const issRate = parseFloat(document.getElementById('nfse-iss-rate').value) || 0;
      const irrfRate = parseFloat(document.getElementById('nfse-irrf-rate').value) || 0;
      const desc = document.getElementById('nfse-service-desc').value;
      const obs = document.getElementById('nfse-observations').value;

      if (!clientId) {
        alert('Selecione um cliente.');
        return;
      }
      if (amount <= 0) {
        alert('Informe um valor válido maior que zero.');
        return;
      }

      const submitBtn = document.getElementById('nfse-submit-btn');
      const originalText = submitBtn.innerHTML;
      submitBtn.disabled = true;
      submitBtn.innerHTML = '<span>⏳ Processando emissão...</span>';

      try {
        let res, data;
        if (docType === 'NFSE_ASAAS') {
          res = await fetch('/api/financial/nfse/asaas/issue', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({
              client_id: clientId,
              installment_id: installmentId,
              value: amount,
              service_code: serviceCode,
              iss_rate: issRate,
              service_description: desc,
              observations: obs
            })
          });
          data = await res.json();
        } else {
          res = await fetch('/api/financial/receipts/generate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({
              client_id: clientId,
              installment_id: installmentId,
              value: amount,
              iss_rate: issRate,
              irrf_rate: irrfRate,
              service_description: desc,
              notes: obs
            })
          });
          data = await res.json();
        }

        if (res.ok && data.success) {
          closeNfseModal();
          await loadNfseList();
          const docId = data.invoice ? data.invoice.id : (data.receipt ? data.receipt.id : null);
          if (docId) {
            openNfsePreview(docId);
          } else {
            alert(data.message || 'Documento emitido com sucesso!');
          }
        } else {
          alert('Erro ao emitir documento: ' + (data.error || 'Erro desconhecido'));
        }
      } catch (err) {
        console.error('Erro na emissão de documento fiscal:', err);
        alert('Erro ao comunicar com o servidor: ' + err.message);
      } finally {
        submitBtn.disabled = false;
        submitBtn.innerHTML = originalText;
      }
    }

    async function openNfsePreview(id) {
      const token = getToken();
      try {
        const res = await fetch(`/api/financial/receipts/${id}`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await res.json();
        if (res.ok && data.success) {
          const doc = data.document;
          const isNfse = doc.invoice_type === 'NFSE_ASAAS';
          const title = isNfse ? 'NOTA FISCAL DE SERVIÇOS ELETRÔNICA (NFS-e)' : 'RECIBO DE HONORÁRIOS ADVOCATÍCIOS & RPS';
          const fullVerifyUrl = window.location.origin + `/validar-recibo/${doc.hash_signature}`;
          const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=${encodeURIComponent(fullVerifyUrl)}`;

          document.getElementById('nfse-preview-modal-title').textContent = title;
          document.getElementById('nfse-preview-modal-subtitle').textContent = `Documento #${doc.invoice_number} • Validação Hash SHA-256`;

          const container = document.getElementById('nfse-printable-container');
          container.innerHTML = `
            <!-- Cabeçalho Timbrado Oficial -->
            <div class="border-b-2 border-navy-950 pb-5 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
              <div class="flex items-center space-x-3">
                <div class="w-12 h-12 rounded-xl bg-navy-950 text-gold-400 flex items-center justify-center font-serif font-extrabold text-xl shadow-sm">
                  JA
                </div>
                <div>
                  <h2 class="font-serif font-extrabold text-lg text-navy-950 tracking-wider">JORGE ALVIM ADVOCACIA</h2>
                  <p class="text-xs text-slate-600 font-semibold">Sociedade Individual de Advocacia & Consultoria Jurídica</p>
                  <p class="text-[11px] text-slate-500 font-mono">OAB/MG nº 142.890 • CNPJ 00.000.000/0001-00</p>
                </div>
              </div>
              <div class="text-right sm:text-right w-full sm:w-auto bg-slate-50 sm:bg-transparent p-3 sm:p-0 rounded-xl border sm:border-0 border-slate-200">
                <span class="inline-block px-3 py-1 rounded-full text-xs font-extrabold ${isNfse ? 'bg-emerald-100 text-emerald-900 border border-emerald-300' : 'bg-indigo-100 text-indigo-900 border border-indigo-300'}">
                  ${isNfse ? 'NFS-e ELETRÔNICA' : 'RECIBO OFICIAL / RPS'}
                </span>
                <div class="text-xs font-mono font-bold text-navy-950 mt-1">Nº ${doc.invoice_number}</div>
                <div class="text-[10px] text-slate-500">Emissão: ${formatDate(doc.issue_date)}</div>
              </div>
            </div>

            <!-- Dados do Tomador / Cliente -->
            <div class="bg-slate-50 p-4 rounded-xl border border-slate-200 text-xs space-y-1.5">
              <div class="font-bold text-navy-950 uppercase tracking-wider text-[10px] text-slate-500">TOMADOR DO SERVIÇO / CLIENTE:</div>
              <div class="text-sm font-extrabold text-slate-900">${doc.client_name}</div>
              <div class="grid grid-cols-1 sm:grid-cols-2 gap-2 text-slate-700">
                <div><strong>Documento:</strong> ${doc.client_cnpj ? 'CNPJ ' + doc.client_cnpj : 'CPF ' + (doc.client_cpf || '—')}</div>
                <div><strong>E-mail:</strong> ${doc.client_email || '—'}</div>
                <div class="sm:col-span-2"><strong>Endereço:</strong> ${doc.street || ''}, ${doc.number || ''} ${doc.neighborhood ? '- ' + doc.neighborhood : ''}, ${doc.city || 'Juiz de Fora'}/${doc.state || 'MG'} - CEP ${doc.cep || ''}</div>
              </div>
            </div>

            <!-- Discriminação do Serviço e Valores -->
            <div class="space-y-3">
              <div class="font-bold text-navy-950 uppercase tracking-wider text-[10px] text-slate-500">DISCRIMINAÇÃO DOS SERVIÇOS PRESTADOS:</div>
              <div class="p-4 bg-white border border-slate-200 rounded-xl text-xs text-slate-800 leading-relaxed text-justify shadow-2xs">
                ${doc.service_description}
              </div>

              <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center text-xs">
                <div class="bg-slate-50 p-3 rounded-xl border border-slate-200">
                  <span class="text-[10px] text-slate-500 uppercase block font-semibold">Valor dos Serviços</span>
                  <strong class="text-navy-950 font-extrabold text-sm block mt-0.5">${formatMoney(doc.value)}</strong>
                </div>
                <div class="bg-slate-50 p-3 rounded-xl border border-slate-200">
                  <span class="text-[10px] text-slate-500 uppercase block font-semibold">Deduções / Impostos</span>
                  <strong class="text-slate-700 font-extrabold text-sm block mt-0.5">${formatMoney(doc.deductions || 0)}</strong>
                </div>
                <div class="bg-slate-50 p-3 rounded-xl border border-slate-200">
                  <span class="text-[10px] text-slate-500 uppercase block font-semibold">Alíquota ISS</span>
                  <strong class="text-slate-700 font-mono text-sm block mt-0.5">${(doc.iss_rate || 2).toFixed(1)}%</strong>
                </div>
                <div class="bg-emerald-50 p-3 rounded-xl border border-emerald-200">
                  <span class="text-[10px] text-emerald-800 uppercase block font-bold">Valor Líquido</span>
                  <strong class="text-emerald-700 font-extrabold text-sm block mt-0.5">${formatMoney(doc.net_value || doc.value)}</strong>
                </div>
              </div>
            </div>

            <!-- Autenticação Digital & QR Code -->
            <div class="p-4 bg-slate-900 text-white rounded-2xl flex flex-col sm:flex-row items-center justify-between gap-4">
              <div class="flex items-center space-x-4">
                <img src="${qrCodeUrl}" alt="QR Code de Validação" class="w-24 h-24 bg-white p-1.5 rounded-xl flex-shrink-0 shadow-md" />
                <div class="space-y-1">
                  <div class="inline-block px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 font-mono text-[9px] border border-emerald-500/30">
                    ✓ ASSINATURA DIGITAL COMPROVADA
                  </div>
                  <div class="text-xs font-serif font-bold text-gold-400">Dr. Jorge Alvim • OAB/MG 142.890</div>
                  <div class="text-[10px] text-slate-300">Aponte a câmera do celular para verificar este documento online.</div>
                  <div class="text-[9px] font-mono text-slate-400">Cód. Verificação: <strong>${doc.verification_code || 'AUTORIZADO'}</strong></div>
                </div>
              </div>
              <div class="text-right sm:text-right w-full sm:w-auto">
                <a href="${fullVerifyUrl}" target="_blank" class="inline-flex items-center space-x-1 px-3 py-1.5 rounded-xl bg-gold-500 hover:bg-gold-400 text-navy-950 font-bold text-xs shadow-xs transition-all">
                  <span>Abrir Certificado</span>
                  <span>↗</span>
                </a>
              </div>
            </div>

            <!-- Hash Criptográfico -->
            <div class="text-[9px] font-mono text-slate-400 break-all text-center">
              SHA-256: ${doc.hash_signature}
            </div>
          `;

          document.getElementById('nfse-preview-modal').classList.remove('hidden');
        }
      } catch (e) {
        console.error('Erro ao abrir visualizador de NFS-e:', e);
      }
    }

    function closeNfsePreviewModal() {
      document.getElementById('nfse-preview-modal').classList.add('hidden');
    }

    function printNfseDoc() {
      window.print();
    }

    async function syncAsaasNfse(id) {
      const token = getToken();
      try {
        const res = await fetch(`/api/financial/nfse/asaas/sync/${id}`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await res.json();
        if (res.ok && data.success) {
          alert('Status sincronizado com sucesso junto ao Asaas!');
          loadNfseList();
        } else {
          alert('Aviso: ' + (data.error || 'Não foi possível sincronizar'));
        }
      } catch (err) {
        alert('Erro ao sincronizar: ' + err.message);
      }
    }

    async function cancelNfseDoc(id) {
      if (!confirm('Tem certeza que deseja cancelar este documento fiscal?')) return;
      const token = getToken();
      try {
        const res = await fetch(`/api/financial/nfse/${id}`, {
          method: 'DELETE',
          headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await res.json();
        if (res.ok && data.success) {
          alert('Documento fiscal cancelado com sucesso.');
          loadNfseList();
        } else {
          alert('Erro ao cancelar: ' + (data.error || 'Erro desconhecido'));
        }
      } catch (err) {
        alert('Erro ao cancelar: ' + err.message);
      }
    }

    // ================= GESTÃO DO BLOG JURÍDICO & ARTIGOS INFORMATIVOS =================
    let adminBlogPosts = [];

    async function loadAdminBlogPosts() {
      const token = getToken();
      try {
        const res = await fetch('/api/admin/blog/posts', {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await res.json();

        if (res.ok && data.success) {
          adminBlogPosts = data.posts || [];
          
          // Atualiza KPIs
          const total = adminBlogPosts.length;
          const published = adminBlogPosts.filter(p => p.is_published).length;
          const views = adminBlogPosts.reduce((sum, p) => sum + (p.views_count || 0), 0);

          document.getElementById('blog-kpi-total').textContent = total;
          document.getElementById('blog-kpi-published').textContent = published;
          document.getElementById('blog-kpi-views').textContent = views.toLocaleString('pt-BR');
          
          const badge = document.getElementById('tab-blog-count');
          if (badge) badge.textContent = `${total} Artigos`;

          renderAdminBlogTable(adminBlogPosts);
        }
      } catch (err) {
        console.error('Erro ao carregar artigos do blog no painel:', err);
      }
    }

    function renderAdminBlogTable(posts) {
      const tbody = document.getElementById('admin-blog-table-body');
      if (!tbody) return;

      if (posts.length === 0) {
        tbody.innerHTML = `
          <tr>
            <td colspan="6" class="text-center py-10 text-slate-400">
              Nenhum artigo encontrado. Clique em <strong>"+ Novo Artigo"</strong> para publicar seu primeiro texto informativo.
            </td>
          </tr>
        `;
        return;
      }

      tbody.innerHTML = posts.map(p => {
        const isPub = !!p.is_published;
        const statusBadge = isPub 
          ? '<span class="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-800 font-bold text-[10px] border border-emerald-200">🟢 Publicado</span>'
          : '<span class="px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 font-bold text-[10px] border border-slate-200">⚪ Rascunho</span>';

        return `
          <tr class="hover:bg-slate-50 transition-colors">
            <td class="px-5 py-3.5 max-w-xs">
              <div class="flex items-center space-x-3">
                <img 
                  src="${p.cover_image || 'https://images.unsplash.com/photo-1589829545856-d10d557cf95f?auto=format&fit=crop&w=200&q=80'}" 
                  alt="${p.title}" 
                  class="w-12 h-12 rounded-xl object-cover flex-shrink-0 border border-slate-200 shadow-2xs"
                />
                <div class="min-w-0">
                  <div class="font-serif font-bold text-navy-950 truncate text-xs sm:text-sm" title="${p.title}">
                    ${p.title}
                  </div>
                  <div class="text-[10px] text-slate-400 font-mono truncate">
                    /blog/${p.slug}
                  </div>
                </div>
              </div>
            </td>
            <td class="px-5 py-3.5">
              <span class="px-2 py-0.5 rounded-lg bg-amber-50 text-gold-900 font-semibold text-[11px] border border-gold-200">
                ${p.category}
              </span>
            </td>
            <td class="px-5 py-3.5 text-center font-bold text-slate-700">
              👁️ ${(p.views_count || 0).toLocaleString('pt-BR')}
            </td>
            <td class="px-5 py-3.5 text-slate-500 font-medium text-[11px]">
              ${formatDate(p.published_at)}
            </td>
            <td class="px-5 py-3.5 text-center">
              ${statusBadge}
            </td>
            <td class="px-5 py-3.5 text-right whitespace-nowrap">
              <div class="flex items-center justify-end space-x-1.5">
                <a 
                  href="/blog/${p.slug}" 
                  target="_blank" 
                  class="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors" 
                  title="Visualizar Artigo no Site"
                >
                  ↗
                </a>
                <button 
                  onclick="openEditBlogPostModal(${p.id})" 
                  class="px-2.5 py-1 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold text-xs transition-colors"
                >
                  Editar
                </button>
                <button 
                  onclick="deleteBlogPost(${p.id}, '${p.title.replace(/'/g, "\\'")}')" 
                  class="px-2 py-1 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold text-xs transition-colors"
                >
                  Excluir
                </button>
              </div>
            </td>
          </tr>
        `;
      }).join('');
    }

    function filterAdminBlogPosts() {
      const search = document.getElementById('admin-blog-search').value.toLowerCase().trim();
      const cat = document.getElementById('admin-blog-category-filter').value;

      const filtered = adminBlogPosts.filter(p => {
        const matchesSearch = !search || 
          p.title.toLowerCase().includes(search) || 
          p.summary.toLowerCase().includes(search) || 
          (p.tags && p.tags.toLowerCase().includes(search));
        
        const matchesCat = (cat === 'ALL') || (p.category === cat);
        return matchesSearch && matchesCat;
      });

      renderAdminBlogTable(filtered);
    }

    function openNewBlogPostModal() {
      document.getElementById('blog-modal-title').textContent = 'Novo Artigo Jurídico (Informativo & Educativo)';
      document.getElementById('blog-edit-id').value = '';
      document.getElementById('blog-edit-title').value = '';
      document.getElementById('blog-edit-category').value = 'Direito de Trânsito & CNH';
      document.getElementById('blog-edit-summary').value = '';
      document.getElementById('blog-edit-cover').value = '';
      document.getElementById('blog-edit-tags').value = 'Advogado, Juiz de Fora, OAB/MG';
      document.getElementById('blog-edit-content').value = `<h2>Introdução ao Tema</h2>\n<p>Explique aqui de forma clara e acessível o problema ou dúvida jurídica frequente.</p>\n\n<h3>O que diz a Legislação?</h3>\n<p>Apresente os artigos de lei, normas ou jurisprudência aplicável.</p>\n\n<blockquote>\n  <p><strong>Orientação Prática:</strong> Destaque uma dica relevante para o cidadão ou empresário.</p>\n</blockquote>\n\n<h3>Como Buscar Auxílio Jurídico Especializado</h3>\n<p>Explique a importância da atuação profissional de um advogado para garantir o direito em Juiz de Fora e região.</p>`;
      document.getElementById('blog-edit-published').checked = true;
      document.getElementById('blog-live-preview-box').classList.add('hidden');
      document.getElementById('btn-toggle-blog-preview').textContent = '👁️ Ver Prévia';
      document.getElementById('blog-post-editor-modal').classList.remove('hidden');
    }

    function openEditBlogPostModal(id) {
      const post = adminBlogPosts.find(p => p.id === id);
      if (!post) return;

      document.getElementById('blog-modal-title').textContent = 'Editar Artigo Jurídico';
      document.getElementById('blog-edit-id').value = post.id;
      document.getElementById('blog-edit-title').value = post.title;
      document.getElementById('blog-edit-category').value = post.category;
      document.getElementById('blog-edit-summary').value = post.summary;
      document.getElementById('blog-edit-cover').value = post.cover_image || '';
      document.getElementById('blog-edit-tags').value = post.tags || '';
      document.getElementById('blog-edit-content').value = post.content;
      document.getElementById('blog-edit-published').checked = !!post.is_published;
      document.getElementById('blog-live-preview-box').classList.add('hidden');
      document.getElementById('btn-toggle-blog-preview').textContent = '👁️ Ver Prévia';
      document.getElementById('blog-post-editor-modal').classList.remove('hidden');
    }

    function closeBlogEditorModal() {
      document.getElementById('blog-post-editor-modal').classList.add('hidden');
    }

    async function handleSaveBlogPost(e) {
      e.preventDefault();
      const token = getToken();
      const id = document.getElementById('blog-edit-id').value;
      const title = document.getElementById('blog-edit-title').value.trim();
      const category = document.getElementById('blog-edit-category').value;
      const summary = document.getElementById('blog-edit-summary').value.trim();
      const cover_image = document.getElementById('blog-edit-cover').value.trim();
      const tags = document.getElementById('blog-edit-tags').value.trim();
      const content = document.getElementById('blog-edit-content').value.trim();
      const is_published = document.getElementById('blog-edit-published').checked ? 1 : 0;
      const btn = document.getElementById('blog-submit-btn');

      btn.disabled = true;
      btn.innerHTML = '<span>Salvando...</span>';

      try {
        const url = id ? `/api/admin/blog/posts/${id}` : '/api/admin/blog/posts';
        const method = id ? 'PUT' : 'POST';

        const res = await fetch(url, {
          method,
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
          body: JSON.stringify({ title, category, summary, cover_image, tags, content, is_published })
        });
        const data = await res.json();

        if (res.ok && data.success) {
          alert('✅ Artigo salvo com sucesso!');
          closeBlogEditorModal();
          await loadAdminBlogPosts();
        } else {
          alert(data.error || 'Erro ao salvar artigo.');
        }
      } catch (err) {
        alert('Erro ao comunicar com o servidor.');
      } finally {
        btn.disabled = false;
        btn.innerHTML = '<span>💾 Salvar & Publicar Artigo</span>';
      }
    }

    async function deleteBlogPost(id, title) {
      if (!confirm(`Deseja realmente excluir o artigo "${title}"? Esta ação não pode ser desfeita.`)) return;

      const token = getToken();
      try {
        const res = await fetch(`/api/admin/blog/posts/${id}`, {
          method: 'DELETE',
          headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await res.json();
        if (res.ok && data.success) {
          alert('Artigo excluído com sucesso.');
          await loadAdminBlogPosts();
        } else {
          alert(data.error || 'Erro ao excluir artigo.');
        }
      } catch (err) {
        alert('Erro ao excluir artigo.');
      }
    }

    function insertBlogTag(type) {
      const textarea = document.getElementById('blog-edit-content');
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const selected = textarea.value.substring(start, end) || 'Texto aqui';

      let replacement = '';
      if (type === 'h2') replacement = `<h2>${selected}</h2>\n`;
      else if (type === 'h3') replacement = `<h3>${selected}</h3>\n`;
      else if (type === 'p') replacement = `<p>${selected}</p>\n`;
      else if (type === 'ul') replacement = `<ul>\n  <li>${selected}</li>\n  <li>Item adicional</li>\n</ul>\n`;
      else if (type === 'quote') replacement = `<blockquote>\n  <p><strong>Dica Jurídica:</strong> ${selected}</p>\n</blockquote>\n`;
      else if (type === 'b') replacement = `<strong>${selected}</strong>`;

      textarea.setRangeText(replacement, start, end, 'end');
      textarea.focus();
    }

    function toggleBlogPreview() {
      const box = document.getElementById('blog-live-preview-box');
      const btn = document.getElementById('btn-toggle-blog-preview');
      const content = document.getElementById('blog-edit-content').value;

      if (box.classList.contains('hidden')) {
        document.getElementById('blog-live-preview-content').innerHTML = content;
        box.classList.remove('hidden');
        btn.textContent = '✕ Fechar Prévia';
      } else {
        box.classList.add('hidden');
        btn.textContent = '👁️ Ver Prévia';
      }
    }

    function setBlogImagePreset(type) {
      const presets = {
        transito: 'https://images.unsplash.com/photo-1449965408869-eaa3f722e40d?auto=format&fit=crop&w=1200&q=80',
        consumidor: 'https://images.unsplash.com/photo-1436491865332-7a61a109cc05?auto=format&fit=crop&w=1200&q=80',
        inventario: 'https://images.unsplash.com/photo-1450133064473-71024230f91b?auto=format&fit=crop&w=1200&q=80',
        banco: 'https://images.unsplash.com/photo-1554224155-8d04cb21cd6c?auto=format&fit=crop&w=1200&q=80'
      };
      if (presets[type]) {
        document.getElementById('blog-edit-cover').value = presets[type];
      }
    }

    // ================= 7. MÓDULO DE AUDITORIA & HISTÓRICO GERAL =================

    let currentAuditPage = 1;
    let totalAuditPages = 1;
    let currentAuditLogs = [];

    function initAuditTab() {
      loadAuditStats();
      loadAuditLogs(1);
    }

    async function loadAuditStats() {
      const token = getToken();
      if (!token) return;

      try {
        const res = await fetch('/api/admin/audit-logs/stats', {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (res.ok) {
          const data = await res.json();
          if (data.success && data.stats) {
            const s = data.stats;
            document.getElementById('audit-kpi-total').textContent = s.total || 0;
            document.getElementById('audit-kpi-creations').textContent = s.creations || 0;
            document.getElementById('audit-kpi-updates').textContent = s.updates || 0;
            document.getElementById('audit-kpi-deletions').textContent = s.deletions || 0;
            document.getElementById('audit-kpi-docs').textContent = s.documents || 0;
          }
        }
      } catch (err) {
        console.error('Erro ao carregar estatísticas de auditoria:', err);
      }
    }

    async function loadAuditLogs(page = 1) {
      const token = getToken();
      if (!token) return;

      currentAuditPage = page;

      const search = document.getElementById('audit-search-input')?.value || '';
      const module = document.getElementById('audit-module-filter')?.value || 'ALL';
      const event_type = document.getElementById('audit-type-filter')?.value || 'ALL';
      const start_date = document.getElementById('audit-date-start')?.value || '';
      const end_date = document.getElementById('audit-date-end')?.value || '';

      const queryParams = new URLSearchParams({
        page,
        limit: 30,
        search,
        module,
        event_type,
        start_date,
        end_date
      });

      const tbody = document.getElementById('audit-table-body');
      tbody.innerHTML = `
        <tr>
          <td colspan="7" class="text-center py-8 text-slate-400 text-xs">
            <svg class="animate-spin h-5 w-5 mx-auto mb-2 text-sky-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path>
            </svg>
            Carregando trilha de auditoria...
          </td>
        </tr>
      `;

      try {
        const res = await fetch(`/api/admin/audit-logs?${queryParams.toString()}`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });

        if (res.ok) {
          const data = await res.json();
          currentAuditLogs = data.logs || [];
          totalAuditPages = data.pagination?.totalPages || 1;

          document.getElementById('audit-total-records').textContent = `${data.pagination?.total || 0} registros encontrados`;
          document.getElementById('audit-pagination-info').textContent = `Página ${data.pagination?.page || 1} de ${totalAuditPages || 1}`;

          document.getElementById('audit-prev-btn').disabled = currentAuditPage <= 1;
          document.getElementById('audit-next-btn').disabled = currentAuditPage >= totalAuditPages;

          renderAuditTable(currentAuditLogs);
        } else {
          tbody.innerHTML = `<tr><td colspan="7" class="text-center py-6 text-rose-500 font-semibold">Erro ao carregar registros de auditoria.</td></tr>`;
        }
      } catch (err) {
        tbody.innerHTML = `<tr><td colspan="7" class="text-center py-6 text-rose-500 font-semibold">Falha de conexão com o servidor.</td></tr>`;
      }
    }

    function renderAuditTable(logs) {
      const tbody = document.getElementById('audit-table-body');
      if (!logs || logs.length === 0) {
        tbody.innerHTML = `
          <tr>
            <td colspan="7" class="text-center py-8 text-slate-400">
              <p class="font-semibold text-xs">Nenhum registro de auditoria encontrado para os filtros selecionados.</p>
            </td>
          </tr>
        `;
        return;
      }

      tbody.innerHTML = logs.map(log => {
        // Formatar Data e Hora
        let dateFormatted = '—';
        let timeFormatted = '';
        if (log.created_at) {
          try {
            const d = new Date(log.created_at);
            dateFormatted = d.toLocaleDateString('pt-BR');
            timeFormatted = d.toLocaleTimeString('pt-BR');
          } catch (e) {
            dateFormatted = log.created_at;
          }
        }

        // Badge do Tipo de Evento
        let typeBadge = '';
        if (log.event_type === 'CRIACAO') {
          typeBadge = '<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">🟢 Inclusão</span>';
        } else if (log.event_type === 'ALTERACAO') {
          typeBadge = '<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-sky-100 text-sky-800 border border-sky-200">🔵 Alteração</span>';
        } else if (log.event_type === 'EXCLUSAO') {
          typeBadge = '<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-800 border border-rose-200 font-black">🔴 Exclusão</span>';
        } else if (log.event_type === 'GERACAO_DOC') {
          typeBadge = '<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-100 text-indigo-800 border border-indigo-200">🟣 Documento</span>';
        } else if (log.event_type === 'AUTENTICACAO') {
          typeBadge = '<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-900 border border-amber-200">🟡 Autenticação</span>';
        } else {
          typeBadge = `<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-700 border border-slate-200">${log.event_type}</span>`;
        }

        // Badge de Papel (Role) do Operador
        let roleBadge = '';
        if (log.user_role === 'master') {
          roleBadge = '<span class="text-[9px] px-1.5 py-0.2 rounded bg-amber-200 text-amber-900 font-bold ml-1">👑 Mestre</span>';
        } else if (log.user_role === 'client') {
          roleBadge = '<span class="text-[9px] px-1.5 py-0.2 rounded bg-purple-100 text-purple-800 font-bold ml-1">👤 Cliente</span>';
        } else if (log.user_role === 'sistema') {
          roleBadge = '<span class="text-[9px] px-1.5 py-0.2 rounded bg-slate-200 text-slate-800 font-bold ml-1">⚙️ Sistema</span>';
        } else {
          roleBadge = '<span class="text-[9px] px-1.5 py-0.2 rounded bg-slate-100 text-slate-700 font-semibold ml-1">Admin</span>';
        }

        // Identificador de CPF / Usuário
        const authorCpf = log.user_cpf ? `<span class="text-[10px] text-slate-500 font-mono block">CPF/ID: ${log.user_cpf}</span>` : '';

        return `
          <tr class="hover:bg-slate-50/80 transition-colors">
            <td class="px-4 py-3 whitespace-nowrap">
              <span class="font-bold text-slate-800 block">${dateFormatted}</span>
              <span class="text-[10px] text-slate-500 font-mono">${timeFormatted}</span>
            </td>
            <td class="px-4 py-3">
              <div class="flex items-center">
                <span class="font-bold text-navy-950">${log.user_name || 'Desconhecido'}</span>
                ${roleBadge}
              </div>
              ${authorCpf}
            </td>
            <td class="px-4 py-3 whitespace-nowrap">
              <span class="font-semibold text-slate-700">${log.module || '—'}</span>
              ${log.resource_id ? `<span class="text-[10px] text-slate-400 font-mono block">#${log.resource_id}</span>` : ''}
            </td>
            <td class="px-4 py-3 whitespace-nowrap">
              ${typeBadge}
            </td>
            <td class="px-4 py-3">
              <p class="text-slate-800 leading-snug font-medium line-clamp-2" title="${log.description}">
                ${log.description}
              </p>
            </td>
            <td class="px-4 py-3 whitespace-nowrap">
              <span class="font-mono text-[11px] text-slate-500">${log.ip_address || '127.0.0.1'}</span>
            </td>
            <td class="px-4 py-3 text-right whitespace-nowrap">
              <button 
                onclick="openAuditDetailsModal(${log.id})" 
                class="px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-gold-50 hover:text-gold-900 text-slate-700 font-bold text-[11px] transition-all flex items-center space-x-1 ml-auto"
                title="Ver Ficha Completa do Log"
              >
                <svg class="w-3.5 h-3.5 text-gold-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/>
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/>
                </svg>
                <span>Ficha</span>
              </button>
            </td>
          </tr>
        `;
      }).join('');
    }

    function clearAuditFilters() {
      document.getElementById('audit-search-input').value = '';
      document.getElementById('audit-module-filter').value = 'ALL';
      document.getElementById('audit-type-filter').value = 'ALL';
      document.getElementById('audit-date-start').value = '';
      document.getElementById('audit-date-end').value = '';
      loadAuditLogs(1);
    }

    function changeAuditPage(delta) {
      const target = currentAuditPage + delta;
      if (target >= 1 && target <= totalAuditPages) {
        loadAuditLogs(target);
      }
    }

    function openAuditDetailsModal(logId) {
      const log = currentAuditLogs.find(l => l.id === logId);
      if (!log) return;

      document.getElementById('audit-modal-subtitle').textContent = `ID do Log: #${log.id} • Evento: ${log.event_name || 'N/A'}`;
      
      let dateFull = log.created_at;
      try {
        dateFull = new Date(log.created_at).toLocaleString('pt-BR');
      } catch (e) {}

      document.getElementById('audit-modal-date').textContent = dateFull;
      document.getElementById('audit-modal-author').textContent = `${log.user_name} (${log.user_role})`;
      document.getElementById('audit-modal-cpf').textContent = log.user_cpf || 'Não informado';
      document.getElementById('audit-modal-module').textContent = `${log.module} ${log.resource_id ? '(Ref: ' + log.resource_id + ')' : ''}`;
      document.getElementById('audit-modal-event').textContent = `${log.event_type} - ${log.event_name}`;
      document.getElementById('audit-modal-ip').textContent = log.ip_address || '127.0.0.1';
      document.getElementById('audit-modal-desc').textContent = log.description || 'Sem descrição.';
      document.getElementById('audit-modal-ua').textContent = log.user_agent || 'Desconhecido';

      let parsedDetails = {};
      try {
        if (log.details) {
          parsedDetails = typeof log.details === 'string' ? JSON.parse(log.details) : log.details;
        }
      } catch (e) {
        parsedDetails = { raw: log.details };
      }

      document.getElementById('audit-modal-json').textContent = JSON.stringify(parsedDetails, null, 2);
      document.getElementById('audit-details-modal').classList.remove('hidden');
    }

    function closeAuditModal() {
      document.getElementById('audit-details-modal').classList.add('hidden');
    }

    // ================= ROTINAS DE BACKUP ADMINISTRATIVO EM 1-CLIQUE =================
    async function downloadDatabaseBackup() {
      const token = getToken();
      try {
        const res = await fetch('/api/admin/backup/download-db', {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!res.ok) {
          const err = await res.json();
          alert(err.error || 'Erro ao gerar backup do banco de dados.');
          return;
        }
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        const timestamp = new Date().toISOString().slice(0, 10);
        a.href = url;
        a.download = `backup-jorgealvim-${timestamp}.sqlite`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      } catch (err) {
        alert('Erro ao realizar download do backup SQLite.');
      }
    }

    async function downloadJsonDumpBackup() {
      const token = getToken();
      try {
        const res = await fetch('/api/admin/backup/export-full-json', {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!res.ok) {
          const err = await res.json();
          alert(err.error || 'Erro ao exportar dump JSON.');
          return;
        }
        const data = await res.json();
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        const timestamp = new Date().toISOString().slice(0, 10);
        a.href = url;
        a.download = `dump-jorgealvim-total-${timestamp}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      } catch (err) {
        alert('Erro ao realizar exportação completa JSON.');
      }
    }

    function exportAuditLogsCSV() {
      if (!currentAuditLogs || currentAuditLogs.length === 0) {
        alert('Não há registros de auditoria carregados para exportação.');
        return;
      }

      const headers = ['ID', 'Data/Hora', 'Operador/Autor', 'CPF', 'Perfil', 'Modulo', 'Tipo Evento', 'Nome Evento', 'ID Recurso', 'IP', 'Descricao'];
      
      const rows = currentAuditLogs.map(l => {
        let dateFull = l.created_at;
        try { dateFull = new Date(l.created_at).toLocaleString('pt-BR'); } catch (e) {}
        
        return [
          l.id,
          `"${dateFull}"`,
          `"${(l.user_name || '').replace(/"/g, '""')}"`,
          `"${l.user_cpf || ''}"`,
          `"${l.user_role || ''}"`,
          `"${l.module || ''}"`,
          `"${l.event_type || ''}"`,
          `"${l.event_name || ''}"`,
          `"${l.resource_id || ''}"`,
          `"${l.ip_address || ''}"`,
          `"${(l.description || '').replace(/"/g, '""')}"`
        ].join(';');
      });

      const csvContent = '\uFEFF' + [headers.join(';'), ...rows].join('\r\n');
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      const todayStr = new Date().toISOString().split('T')[0];
      link.setAttribute('href', url);
      link.setAttribute('download', `auditoria-jorgealvim-${todayStr}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }

    function printAuditTable() {
      const printArea = document.getElementById('audit-table-print-area').innerHTML;
      const printWindow = window.open('', '_blank');
      printWindow.document.write(
        '<!DOCTYPE html>' +
        '<html>' +
        '<head>' +
        '  <title>Relatório Oficial de Auditoria & Compliance - Dr. Jorge Alvim Advocacia</title>' +
        '  <' + 'script src="https://cdn.tailwindcss.com"><' + '/script>' +
        '  <style>' +
        '    @media print {' +
        '      body { font-size: 10pt; background: white; color: black; }' +
        '      button { display: none !important; }' +
        '    }' +
        '  </style>' +
        '</head>' +
        '<body class="p-8 bg-white text-slate-900 font-sans">' +
        '  <div class="text-center border-b pb-4 mb-6">' +
        '    <h1 class="text-xl font-bold text-navy-950">JORGE EDUARDO DA SILVA ALVIM • ADVOCACIA</h1>' +
        '    <p class="text-xs text-slate-600">OAB/MG 222.943 • Rua Henrique Dias, nº 259, Galeria 259, Loja 5, Benfica, Juiz de Fora - MG</p>' +
        '    <h2 class="text-sm font-bold text-slate-800 uppercase tracking-widest mt-3">Relatório Oficial de Trilha de Auditoria & Compliance LGPD</h2>' +
        '    <p class="text-[11px] text-slate-500">Emitido em: ' + new Date().toLocaleString('pt-BR') + '</p>' +
        '  </div>' +
        printArea +
        '  <' + 'script>' +
        '    window.onload = function() { window.print(); };' +
        '  <' + '/script>' +
        '</body>' +
        '</html>'
      );
      printWindow.document.close();
    }

    // Helper para envio assíncrono de eventos de auditoria do lado do cliente
    function logAuditClientEvent(event_type, event_name, module, resource_id, description, details) {
      const token = getToken();
      if (!token) return;

      fetch('/api/audit/log-event', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          event_type,
          event_name,
          module,
          resource_id,
          description,
          details
        })
      }).catch(err => console.warn('[AUDITORIA CLIENTE] Falha ao enviar evento:', err));
    }

    // ================= FUNÇÕES DA ABA 8: PRÉ-CLIENTES, TRÁFEGO & VISITAS =================
    let currentVisitsPage = 1;
    let totalVisitsPages = 1;
    let currentVisitsList = [];

    function initPreClientsTab() {
      loadVisitsStats();
      loadVisitsLogs(1);
    }

    async function loadVisitsStats() {
      const token = getToken();
      if (!token) return;

      try {
        const res = await fetch('/api/admin/visits/stats', {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (res.ok) {
          const data = await res.json();
          if (data.success && data.stats) {
            const s = data.stats;
            document.getElementById('visits-kpi-total').textContent = s.total || 0;
            document.getElementById('visits-kpi-today').textContent = s.today || 0;
            document.getElementById('visits-kpi-month').textContent = s.month || 0;
            document.getElementById('visits-kpi-year').textContent = s.year || 0;
            document.getElementById('visits-kpi-locations').textContent = s.locations || 0;
            document.getElementById('visits-kpi-preclients').textContent = s.preClients || 0;

            const preBadge = document.getElementById('tab-preclients-count');
            if (preBadge) preBadge.textContent = `${s.preClients || 0} Pré-Cli`;

            // 1. Renderizar Breakdown Diário (Últimos dias)
            const dailyBox = document.getElementById('visits-daily-breakdown');
            if (dailyBox && s.dailyStats) {
              if (s.dailyStats.length === 0) {
                dailyBox.innerHTML = '<div class="text-slate-400 text-center py-4">Nenhuma visita registrada recentemente.</div>';
              } else {
                dailyBox.innerHTML = s.dailyStats.slice(0, 7).map(d => {
                  let dLabel = d.visit_date;
                  try {
                    const parts = d.visit_date.split('-');
                    dLabel = `${parts[2]}/${parts[1]}/${parts[0]}`;
                  } catch (e) {}
                  return `
                    <div class="flex items-center justify-between p-2 rounded-xl bg-slate-50 border border-slate-100 hover:bg-amber-50/50 transition-colors">
                      <div class="flex items-center space-x-2">
                        <span class="text-amber-700 font-bold">📅 ${dLabel}</span>
                        <span class="text-[10px] text-slate-500">(${d.unique_ips || 1} IPs únicos)</span>
                      </div>
                      <span class="px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-900 font-bold text-xs">
                        ${d.count} acessos
                      </span>
                    </div>
                  `;
                }).join('');
              }
            }

            // 2. Renderizar Top Cidades
            const citiesBox = document.getElementById('visits-cities-breakdown');
            if (citiesBox && s.topCities) {
              if (s.topCities.length === 0) {
                citiesBox.innerHTML = '<div class="text-slate-400 text-center py-4">Nenhuma cidade registrada.</div>';
              } else {
                citiesBox.innerHTML = s.topCities.map(c => `
                  <div class="flex items-center justify-between p-2 rounded-xl bg-slate-50 border border-slate-100 hover:bg-emerald-50/50 transition-colors">
                    <div class="flex items-center space-x-2 truncate">
                      <span class="text-emerald-700 font-bold truncate">📍 ${c.city || 'Juiz de Fora'}</span>
                    </div>
                    <span class="px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-900 font-bold text-xs flex-shrink-0">
                      ${c.count} visitas
                    </span>
                  </div>
                `).join('');
              }
            }

            // 3. Renderizar Top Origens & Redes Sociais
            const sourcesBox = document.getElementById('visits-sources-breakdown');
            if (sourcesBox && s.topSources) {
              if (s.topSources.length === 0) {
                sourcesBox.innerHTML = '<div class="text-slate-400 text-center py-4">Nenhuma origem identificada.</div>';
              } else {
                sourcesBox.innerHTML = s.topSources.map(src => {
                  let icon = '🌐';
                  const sLower = (src.source || '').toLowerCase();
                  if (sLower.includes('instagram')) icon = '📸';
                  else if (sLower.includes('facebook')) icon = '📘';
                  else if (sLower.includes('linkedin')) icon = '💼';
                  else if (sLower.includes('google')) icon = '🔍';
                  else if (sLower.includes('whatsapp')) icon = '💬';

                  return `
                    <div class="flex items-center justify-between p-2 rounded-xl bg-slate-50 border border-slate-100 hover:bg-indigo-50/50 transition-colors">
                      <div class="flex items-center space-x-2 truncate">
                        <span>${icon}</span>
                        <span class="text-slate-800 font-bold truncate">${src.source}</span>
                      </div>
                      <span class="px-2.5 py-0.5 rounded-full bg-indigo-100 text-indigo-900 font-bold text-xs flex-shrink-0">
                        ${src.count} acessos
                      </span>
                    </div>
                  `;
                }).join('');
              }
            }
          }
        }
      } catch (err) {
        console.error('Erro ao carregar estatísticas de visitas:', err);
      }
    }

    async function loadVisitsLogs(page = 1) {
      const token = getToken();
      if (!token) return;

      currentVisitsPage = page;

      const search = document.getElementById('filter-visits-search')?.value || '';
      const only_pre_clients = document.getElementById('filter-visits-only-preclients')?.checked ? '1' : '0';
      const shared_location = document.getElementById('filter-visits-only-location')?.checked ? '1' : '0';
      const date_start = document.getElementById('filter-visits-date-start')?.value || '';
      const date_end = document.getElementById('filter-visits-date-end')?.value || '';

      const queryParams = new URLSearchParams({
        page,
        limit: 30,
        search,
        only_pre_clients,
        shared_location,
        date_start,
        date_end
      });

      const tbody = document.getElementById('visits-table-body');
      tbody.innerHTML = `
        <tr>
          <td colspan="8" class="text-center py-8 text-slate-400 text-xs">
            <svg class="animate-spin h-5 w-5 mx-auto mb-2 text-amber-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path>
            </svg>
            Carregando listagem de visitas e pré-clientes...
          </td>
        </tr>
      `;

      try {
        const res = await fetch(`/api/admin/visits?${queryParams.toString()}`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });

        if (res.ok) {
          const data = await res.json();
          currentVisitsList = data.visits || [];
          totalVisitsPages = data.pagination?.totalPages || 1;

          document.getElementById('visits-count-badge').textContent = `${data.pagination?.total || 0} registros encontrados`;
          document.getElementById('visits-pagination-info').textContent = `Página ${data.pagination?.page || 1} de ${totalVisitsPages || 1}`;

          document.getElementById('visits-prev-btn').disabled = currentVisitsPage <= 1;
          document.getElementById('visits-next-btn').disabled = currentVisitsPage >= totalVisitsPages;

          renderVisitsTable(currentVisitsList);
        } else {
          tbody.innerHTML = `<tr><td colspan="8" class="text-center py-6 text-rose-500 font-semibold">Erro ao carregar registros de visitas.</td></tr>`;
        }
      } catch (err) {
        tbody.innerHTML = `<tr><td colspan="8" class="text-center py-6 text-rose-500 font-semibold">Falha de conexão com o servidor.</td></tr>`;
      }
    }

    function renderVisitsTable(visits) {
      const tbody = document.getElementById('visits-table-body');
      if (!visits || visits.length === 0) {
        tbody.innerHTML = `
          <tr>
            <td colspan="8" class="text-center py-8 text-slate-400">
              <p class="font-semibold text-xs">Nenhuma visita ou pré-cliente encontrado com os filtros atuais.</p>
            </td>
          </tr>
        `;
        return;
      }

      tbody.innerHTML = visits.map(v => {
        // 1. Data Decomposta (Dia, Mês, Ano, Hora)
        const dDay = String(v.visit_day).padStart(2, '0');
        const dMonth = String(v.visit_month).padStart(2, '0');
        const dYear = v.visit_year;
        const dTime = v.visit_time || '00:00:00';
        const formattedDateTime = `${dDay}/${dMonth}/${dYear} às ${dTime}`;

        // 2. Localização (IP vs GPS)
        let locText = v.geo_city ? `${v.geo_city} - ${v.geo_state || 'MG'}` : `${v.ip_city || 'Juiz de Fora'} - ${v.ip_region || 'MG'}`;
        let geoBadge = '';
        if (v.shared_location === 1) {
          const mapLink = v.geo_latitude && v.geo_longitude ? `https://www.google.com/maps?q=${v.geo_latitude},${v.geo_longitude}` : '#';
          geoBadge = `
            <a href="${mapLink}" target="_blank" class="inline-flex items-center space-x-1 px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-900 text-[10px] font-bold hover:bg-emerald-200 ml-1" title="Ver no Google Maps">
              <span>📍 GPS</span>
            </a>
          `;
        }

        // 3. Pré-Cliente (Nome e WhatsApp)
        let clientCell = '<span class="text-slate-400 italic">Visitante Anônimo</span>';
        if (v.visitor_name || v.visitor_phone) {
          const rawPhone = (v.visitor_phone || '').replace(/\D/g, '');
          const waLink = rawPhone ? `https://wa.me/55${rawPhone}` : null;
          clientCell = `
            <div>
              <span class="font-bold text-navy-950 block">${v.visitor_name || 'Pré-Cliente'}</span>
              ${v.visitor_phone ? `
                <div class="flex items-center space-x-1 mt-0.5">
                  <span class="text-slate-600 font-mono text-[11px]">${v.visitor_phone}</span>
                  ${waLink ? `<a href="${waLink}" target="_blank" class="text-emerald-600 hover:text-emerald-700 font-bold text-[10px]" title="Abrir WhatsApp">💬</a>` : ''}
                </div>
              ` : ''}
              ${v.visitor_email ? `<span class="text-slate-500 text-[10px] block truncate max-w-[140px]">${v.visitor_email}</span>` : ''}
            </div>
          `;
        }

        // 4. Redes Sociais, Google Empresa & Website
        let socialCell = '<span class="text-slate-400 text-[11px]">—</span>';
        const badges = [];
        if (v.social_media) {
          badges.push(`<span class="px-2 py-0.5 rounded-full bg-pink-50 text-pink-700 border border-pink-200 text-[10px] font-bold truncate max-w-[130px] inline-block" title="${v.social_media}">📸 ${v.social_media}</span>`);
        }
        if (v.website) {
          const fullWeb = v.website.startsWith('http') ? v.website : `https://${v.website}`;
          badges.push(`<a href="${fullWeb}" target="_blank" class="px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200 text-[10px] font-bold hover:bg-indigo-100 truncate max-w-[130px] inline-block" title="${v.website}">🌐 Site</a>`);
        }
        if (v.google_business) {
          badges.push(`<span class="px-2 py-0.5 rounded-full bg-amber-50 text-amber-800 border border-amber-200 text-[10px] font-bold truncate max-w-[130px] inline-block" title="${v.google_business}">🏢 Google</span>`);
        }
        if (badges.length > 0) {
          socialCell = `<div class="flex flex-col gap-1">${badges.join('')}</div>`;
        }

        // 5. Status Badge
        let statusBadge = `<span class="px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 font-bold text-[10px]">Visitante</span>`;
        if (v.status === 'Pré-Cliente' || v.is_pre_client === 1) {
          statusBadge = `<span class="px-2 py-0.5 rounded-full bg-amber-100 text-amber-900 border border-amber-300 font-bold text-[10px]">⭐ Pré-Cliente</span>`;
        } else if (v.status === 'Convertido em Lead') {
          statusBadge = `<span class="px-2 py-0.5 rounded-full bg-blue-100 text-blue-900 font-bold text-[10px]">⚡ Lead Ativo</span>`;
        } else if (v.status === 'Convertido em Cliente') {
          statusBadge = `<span class="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-900 font-bold text-[10px]">💼 Cliente Fechado</span>`;
        } else if (v.shared_location === 1) {
          statusBadge = `<span class="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200 font-bold text-[10px]">📍 Localização</span>`;
        }

        return `
          <tr class="hover:bg-slate-50 transition-colors">
            <td class="py-3 px-4 whitespace-nowrap">
              <span class="font-bold text-navy-950 block">${formattedDateTime}</span>
              <span class="text-[10px] text-slate-500">Dia ${dDay} • Mês ${dMonth} • Ano ${dYear}</span>
            </td>
            <td class="py-3 px-4">
              <span class="font-mono font-bold text-slate-900 block">${v.ip_address}</span>
              <span class="text-[10px] text-slate-500 block truncate max-w-[130px]">${v.ip_isp || 'Rede Local'}</span>
            </td>
            <td class="py-3 px-4">
              <div class="flex items-center">
                <span class="font-medium text-slate-800 text-xs">${locText}</span>
                ${geoBadge}
              </div>
              ${v.geo_address ? `<span class="text-[10px] text-slate-400 block truncate max-w-[150px]" title="${v.geo_address}">${v.geo_address}</span>` : ''}
            </td>
            <td class="py-3 px-4">
              ${clientCell}
            </td>
            <td class="py-3 px-4">
              ${socialCell}
            </td>
            <td class="py-3 px-4">
              <span class="font-semibold text-slate-800 block truncate max-w-[130px]">${v.interest_area || v.path || 'Página Inicial'}</span>
              ${v.utm_source ? `<span class="text-[10px] text-indigo-600 block">Fonte: ${v.utm_source}</span>` : ''}
            </td>
            <td class="py-3 px-4 text-center whitespace-nowrap">
              ${statusBadge}
            </td>
            <td class="py-3 px-4 text-right whitespace-nowrap">
              <div class="flex items-center justify-end space-x-1.5">
                <button 
                  onclick="openPreClientDetailsModal(${v.id})" 
                  class="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-[11px] transition-all"
                  title="Ver Ficha Completa do Visitante"
                >
                  🔍 Detalhes
                </button>
                <button 
                  onclick="convertPreClientToLead(${v.id})" 
                  class="px-2.5 py-1 rounded-lg bg-sky-50 hover:bg-sky-100 text-sky-800 border border-sky-200 font-bold text-[11px] transition-all"
                  title="Transformar em Lead / Atendimento do Painel"
                >
                  ⚡ Lead
                </button>
                <button 
                  onclick="convertPreClientToClient(${v.id})" 
                  class="px-2.5 py-1 rounded-lg bg-gold-50 hover:bg-gold-100 text-gold-900 border border-gold-300 font-bold text-[11px] transition-all"
                  title="Transformar em Cliente & Contrato Direto"
                >
                  💼 Cliente
                </button>
              </div>
            </td>
          </tr>
        `;
      }).join('');
    }

    function changeVisitsPage(delta) {
      const target = currentVisitsPage + delta;
      if (target >= 1 && target <= totalVisitsPages) {
        loadVisitsLogs(target);
      }
    }

    function clearVisitsFilters() {
      document.getElementById('filter-visits-search').value = '';
      document.getElementById('filter-visits-only-preclients').checked = false;
      document.getElementById('filter-visits-only-location').checked = false;
      document.getElementById('filter-visits-date-start').value = '';
      document.getElementById('filter-visits-date-end').value = '';
      loadVisitsLogs(1);
    }

    function openPreClientDetailsModal(id) {
      const visit = currentVisitsList.find(v => v.id === id);
      if (!visit) return;

      document.getElementById('preclient-modal-subtitle').textContent = `Registro ID: #${visit.id}`;
      
      const dDay = String(visit.visit_day).padStart(2, '0');
      const dMonth = String(visit.visit_month).padStart(2, '0');
      const dYear = visit.visit_year;
      const dTime = visit.visit_time || '00:00:00';
      document.getElementById('preclient-modal-date').textContent = `${dDay}/${dMonth}/${dYear} às ${dTime}`;
      document.getElementById('preclient-modal-ip').textContent = `${visit.ip_address} (${visit.ip_isp || 'Provedor Local'})`;
      document.getElementById('preclient-modal-status').textContent = visit.status || 'Visitante';

      // Localização
      const geoBadge = document.getElementById('preclient-modal-geo-badge');
      const coordsDiv = document.getElementById('preclient-modal-coords');
      if (visit.shared_location === 1) {
        geoBadge.textContent = '📍 GPS Autorizado pelo Usuário';
        geoBadge.className = 'px-2 py-0.5 rounded-full bg-emerald-200 text-emerald-900 text-[10px] font-bold';
        document.getElementById('preclient-modal-location-text').textContent = `${visit.geo_city || 'Juiz de Fora'} - ${visit.geo_state || 'MG'} (${visit.geo_address || 'Endereço registrado via GPS'})`;
        if (visit.geo_latitude && visit.geo_longitude) {
          coordsDiv.textContent = `Latitude: ${visit.geo_latitude.toFixed(6)} | Longitude: ${visit.geo_longitude.toFixed(6)} | Precisão: ${visit.geo_accuracy ? visit.geo_accuracy.toFixed(0) + 'm' : 'Alta'}`;
          coordsDiv.classList.remove('hidden');
        } else {
          coordsDiv.classList.add('hidden');
        }
      } else {
        geoBadge.textContent = 'Estimativa por IP';
        geoBadge.className = 'px-2 py-0.5 rounded-full bg-slate-200 text-slate-800 text-[10px] font-bold';
        document.getElementById('preclient-modal-location-text').textContent = `${visit.ip_city || 'Juiz de Fora'} - ${visit.ip_region || 'MG'} (${visit.ip_country || 'Brasil'})`;
        coordsDiv.classList.add('hidden');
      }

      // Dados do Pré-Cliente
      document.getElementById('preclient-modal-name').textContent = visit.visitor_name || 'Não informado';
      document.getElementById('preclient-modal-phone').textContent = visit.visitor_phone || 'Não informado';
      document.getElementById('preclient-modal-email').textContent = visit.visitor_email || 'Não informado';
      document.getElementById('preclient-modal-area').textContent = visit.interest_area || visit.path || 'Página Inicial';
      document.getElementById('preclient-modal-social').textContent = visit.social_media || 'Nenhuma informada';
      document.getElementById('preclient-modal-website').textContent = visit.website || 'Nenhum informado';
      document.getElementById('preclient-modal-google').textContent = visit.google_business || 'Nenhum informado';
      document.getElementById('preclient-modal-ua').textContent = visit.user_agent || 'Desconhecido';

      // Botões de ação no Modal
      const actionsDiv = document.getElementById('preclient-modal-actions');
      actionsDiv.innerHTML = `
        <button onclick="closePreClientModal()" class="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs transition-all">
          Fechar
        </button>
        <button onclick="convertPreClientToLead(${visit.id})" class="px-4 py-2 rounded-xl bg-sky-600 hover:bg-sky-500 text-white font-bold text-xs shadow-sm transition-all flex items-center space-x-1">
          <span>⚡ Converter em Lead</span>
        </button>
        <button onclick="convertPreClientToClient(${visit.id})" class="px-4 py-2 rounded-xl bg-gold-500 hover:bg-gold-600 text-navy-950 font-bold text-xs shadow-sm transition-all flex items-center space-x-1">
          <span>💼 Converter em Cliente & Contrato</span>
        </button>
      `;

      document.getElementById('pre-client-detail-modal').classList.remove('hidden');
    }

    function closePreClientModal() {
      document.getElementById('pre-client-detail-modal').classList.add('hidden');
    }

    async function convertPreClientToLead(id) {
      if (!confirm(`Deseja converter o registro #${id} em um Atendimento/Lead ativo no painel?`)) return;

      const token = getToken();
      if (!token) return;

      try {
        const res = await fetch(`/api/admin/pre-clients/${id}/convert-to-lead`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${token}` }
        });

        const data = await res.json();
        if (res.ok && data.success) {
          alert(`✅ ${data.message}`);
          closePreClientModal();
          loadVisitsLogs(currentVisitsPage);
          loadVisitsStats();
          loadLeads();
        } else {
          alert(`❌ ${data.error || 'Erro ao converter pré-cliente em lead.'}`);
        }
      } catch (err) {
        alert('Falha de conexão com o servidor ao converter pré-cliente.');
      }
    }

    async function convertPreClientToClient(id) {
      if (!confirm(`Deseja converter o registro #${id} diretamente em Cliente & Contrato?`)) return;

      const token = getToken();
      if (!token) return;

      try {
        const res = await fetch(`/api/admin/pre-clients/${id}/convert-to-client`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${token}` }
        });

        const data = await res.json();
        if (res.ok && data.success) {
          alert(`✅ ${data.message}`);
          closePreClientModal();
          loadVisitsLogs(currentVisitsPage);
          loadVisitsStats();
          loadClients();
        } else {
          alert(`❌ ${data.error || 'Erro ao converter pré-cliente em cliente.'}`);
        }
      } catch (err) {
        alert('Falha de conexão com o servidor ao converter pré-cliente em cliente.');
      }
    }

    function exportVisitsCSV() {
      if (!currentVisitsList || currentVisitsList.length === 0) {
        alert('Não há registros de visitas para exportar.');
        return;
      }

      const headers = ['ID', 'Data', 'Dia', 'Mes', 'Ano', 'Hora', 'IP', 'ISP_Rede', 'Cidade_UF', 'GPS_Compartilhado', 'Nome_PreCliente', 'Telefone', 'Email', 'Redes_Sociais', 'Website', 'Google_Empresa', 'Area_Interesse', 'Status'];
      
      const rows = currentVisitsList.map(v => {
        return [
          v.id,
          `"${v.visit_date}"`,
          v.visit_day,
          v.visit_month,
          v.visit_year,
          `"${v.visit_time}"`,
          `"${v.ip_address}"`,
          `"${(v.ip_isp || '').replace(/"/g, '""')}"`,
          `"${((v.geo_city || v.ip_city || 'Juiz de Fora') + ' - ' + (v.geo_state || v.ip_region || 'MG')).replace(/"/g, '""')}"`,
          v.shared_location === 1 ? 'Sim' : 'Nao',
          `"${(v.visitor_name || '').replace(/"/g, '""')}"`,
          `"${(v.visitor_phone || '').replace(/"/g, '""')}"`,
          `"${(v.visitor_email || '').replace(/"/g, '""')}"`,
          `"${(v.social_media || '').replace(/"/g, '""')}"`,
          `"${(v.website || '').replace(/"/g, '""')}"`,
          `"${(v.google_business || '').replace(/"/g, '""')}"`,
          `"${(v.interest_area || v.path || '').replace(/"/g, '""')}"`,
          `"${(v.status || '').replace(/"/g, '""')}"`
        ].join(';');
      });

      const csvContent = '\uFEFF' + [headers.join(';'), ...rows].join('\r\n');
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      const todayStr = new Date().toISOString().split('T')[0];
      link.setAttribute('href', url);
      link.setAttribute('download', `visitas-ips-preclientes-jorgealvim-${todayStr}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }

    // =========================================================================
    // FUNÇÕES DA ABA 9: RADAR JUDICIAL (DATAJUD CNJ, MNI & TRIBUNAIS)
    // =========================================================================
    let currentJudicialSearchType = 'number';
    let currentJudicialResults = [];
    let selectedJudicialProcess = null;

    function initJudicialTab() {
      // Inicialização da aba
      const input = document.getElementById('judicial-search-input');
      if (input && !input.value) {
        input.focus();
      }
    }

    function setJudicialSearchType(type) {
      currentJudicialSearchType = type;
      const btnNumber = document.getElementById('judicial-type-btn-number');
      const btnName = document.getElementById('judicial-type-btn-name');
      const btnDoc = document.getElementById('judicial-type-btn-doc');
      const btnOab = document.getElementById('judicial-type-btn-oab');
      const label = document.getElementById('judicial-input-label');
      const input = document.getElementById('judicial-search-input');

      const activeBtnClass = "px-4 py-2 rounded-xl text-xs font-bold transition-all bg-blue-50 text-blue-900 border border-blue-300 shadow-sm flex items-center space-x-2";
      const inactiveBtnClass = "px-4 py-2 rounded-xl text-xs font-bold transition-all bg-slate-100 text-slate-700 hover:bg-slate-200 border border-slate-200 flex items-center space-x-2";

      if (btnNumber) btnNumber.className = inactiveBtnClass;
      if (btnName) btnName.className = inactiveBtnClass;
      if (btnDoc) btnDoc.className = inactiveBtnClass;
      if (btnOab) btnOab.className = inactiveBtnClass;

      if (type === 'number') {
        if (btnNumber) btnNumber.className = activeBtnClass;
        label.textContent = 'Número Único do Processo (CNJ / NPU)';
        input.placeholder = 'Ex: 5006870-33.2024.8.13.0313 ou 5007788-99.2026.8.13.0145';
      } else if (type === 'name') {
        if (btnName) btnName.className = activeBtnClass;
        label.textContent = 'Nome Completo da Parte ou Empresa';
        input.placeholder = 'Ex: Mariana Souza, Carlos Alberto Santos, Banco do Brasil';
      } else if (type === 'cpf' || type === 'cnpj') {
        if (btnDoc) btnDoc.className = activeBtnClass;
        label.textContent = 'CPF ou CNPJ da Parte';
        input.placeholder = 'Ex: 123.456.789-00 ou 12.345.678/0001-99';
      } else if (type === 'oab') {
        if (btnOab) btnOab.className = activeBtnClass;
        label.textContent = 'Número da Inscrição da OAB / UF';
        input.placeholder = 'Ex: 222943, 222.943 ou OAB/MG 222943 (Dr. Jorge Alvim)';
      }
      input.focus();
    }

    function setJudicialSearchExample(val, type) {
      setJudicialSearchType(type);
      const input = document.getElementById('judicial-search-input');
      input.value = val;
      handleJudicialSearch(new Event('submit'));
    }

    function clearJudicialSearch() {
      document.getElementById('judicial-search-input').value = '';
      currentJudicialResults = [];
      document.getElementById('judicial-results-container').innerHTML = `
        <div id="judicial-empty-state" class="bg-white p-10 rounded-3xl border border-slate-200 text-center space-y-3">
          <div class="w-16 h-16 rounded-3xl bg-blue-50 text-blue-600 flex items-center justify-center text-3xl mx-auto border border-blue-200">
            🔍
          </div>
          <h5 class="font-serif font-bold text-base text-navy-950">Nenhuma pesquisa realizada ainda</h5>
          <p class="text-xs text-slate-500 max-w-md mx-auto">
            Digite um número de processo, nome da parte ou CPF/CNPJ para localizar autos judiciais com histórico completo de andamentos e peças públicas.
          </p>
        </div>
      `;
      document.getElementById('judicial-results-count-badge').textContent = '0 processos';
      document.getElementById('judicial-cache-indicator').classList.add('hidden');
      document.getElementById('judicial-search-status-text').textContent = 'Utilize o campo acima para consultar a base nacional de processos';
    }

    async function handleJudicialSearch(e) {
      if (e && e.preventDefault) e.preventDefault();

      const term = document.getElementById('judicial-search-input').value.trim();
      const tribunal = document.getElementById('judicial-tribunal-select').value;
      const submitBtn = document.getElementById('judicial-search-submit-btn');
      const spinner = document.getElementById('judicial-loading-spinner');
      const container = document.getElementById('judicial-results-container');
      const countBadge = document.getElementById('judicial-results-count-badge');
      const cacheIndicator = document.getElementById('judicial-cache-indicator');
      const statusText = document.getElementById('judicial-search-status-text');

      if (!term) {
        alert('Por favor, informe o número, nome ou documento para pesquisar.');
        return;
      }

      spinner.classList.remove('hidden');
      container.classList.add('hidden');
      cacheIndicator.classList.add('hidden');
      submitBtn.disabled = true;
      submitBtn.innerHTML = '<span>Consultando CNJ...</span>';

      try {
        const res = await fetch('/api/judicial/search', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
          body: JSON.stringify({
            query_type: currentJudicialSearchType,
            query_term: term,
            tribunal: tribunal
          })
        });

        const data = await res.json();

        if (res.ok && data.success) {
          currentJudicialResults = data.processes || [];
          countBadge.textContent = `${currentJudicialResults.length} processo(s)`;
          statusText.textContent = `Consulta realizada em ${data.source === 'cache' ? 'cache local' : 'tempo real nos tribunais'}`;
          
          if (data.source === 'cache') {
            cacheIndicator.classList.remove('hidden');
          }

          renderJudicialResults(currentJudicialResults);
        } else {
          alert(`❌ ${data.error || 'Erro ao consultar o Radar Judicial.'}`);
          container.innerHTML = `
            <div class="bg-rose-50 p-8 rounded-3xl border border-rose-200 text-center space-y-2">
              <p class="text-sm font-bold text-rose-800">Falha na consulta judicial</p>
              <p class="text-xs text-rose-600">${data.error || 'Não foi possível consultar a base do CNJ no momento.'}</p>
            </div>
          `;
        }
      } catch (err) {
        alert('Falha de conexão com o servidor ao consultar o Radar Judicial.');
      } finally {
        spinner.classList.add('hidden');
        container.classList.remove('hidden');
        submitBtn.disabled = false;
        submitBtn.innerHTML = '<span>🔍 Buscar no DataJud & MNI</span>';
      }
    }

    let currentJudicialPage = 1;
    const JUDICIAL_PAGE_SIZE = 5;

    function parseCnjSortKey(item) {
      const raw = (item.numero_processo || item.numero_formatado || '').replace(/\D/g, '');
      let year = 0;
      let seq = 0;
      if (raw.length >= 13) {
        seq = parseInt(raw.substring(0, 7), 10) || 0;
        year = parseInt(raw.substring(9, 13), 10) || 0;
      } else if (item.distribution_date) {
        const parts = item.distribution_date.split(/[-/]/);
        if (parts.length === 3) {
          year = parseInt(parts[0].length === 4 ? parts[0] : parts[2], 10) || 0;
        }
      }
      return { year, seq };
    }

    function sortJudicialProcessesNewestFirst(list) {
      return [...list].sort((a, b) => {
        const keyA = parseCnjSortKey(a);
        const keyB = parseCnjSortKey(b);
        if (keyB.year !== keyA.year) return keyB.year - keyA.year;
        return keyB.seq - keyA.seq;
      });
    }

    function renderJudicialResults(processes) {
      const container = document.getElementById('judicial-results-container');
      const pagContainer = document.getElementById('judicial-pagination-container');

      if (!processes || processes.length === 0) {
        currentJudicialResults = [];
        if (pagContainer) pagContainer.classList.add('hidden');
        container.innerHTML = `
          <div class="bg-white p-10 rounded-3xl border border-slate-200 text-center space-y-3">
            <div class="w-14 h-14 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center text-2xl mx-auto border border-amber-200">
              📂
            </div>
            <h5 class="font-serif font-bold text-base text-navy-950">Nenhum processo localizado</h5>
            <p class="text-xs text-slate-500 max-w-md mx-auto">
              Não encontramos processos públicos para os parâmetros informados. Verifique se o número do CNJ ou nome está correto ou selecione a opção "Todos os Tribunais".
            </p>
          </div>
        `;
        return;
      }

      currentJudicialResults = sortJudicialProcessesNewestFirst(processes);
      currentJudicialPage = 1;
      renderJudicialPage(1);
    }

    function renderJudicialPage(page) {
      currentJudicialPage = page;
      const total = currentJudicialResults.length;
      const totalPages = Math.ceil(total / JUDICIAL_PAGE_SIZE);
      const startIdx = (page - 1) * JUDICIAL_PAGE_SIZE;
      const endIdx = Math.min(startIdx + JUDICIAL_PAGE_SIZE, total);
      const pageItems = currentJudicialResults.slice(startIdx, endIdx);

      const container = document.getElementById('judicial-results-container');
      const pagContainer = document.getElementById('judicial-pagination-container');
      const rangeEl = document.getElementById('judicial-page-range');
      const totalEl = document.getElementById('judicial-page-total');
      const btnContainer = document.getElementById('judicial-pagination-buttons');

      if (pagContainer) {
        if (total > 0) {
          pagContainer.classList.remove('hidden');
          if (rangeEl) rangeEl.textContent = `${startIdx + 1}-${endIdx}`;
          if (totalEl) totalEl.textContent = total;
        } else {
          pagContainer.classList.add('hidden');
        }
      }

      // Renderizar botões numerados sequenciais
      let buttonsHtml = '';
      if (totalPages > 1) {
        buttonsHtml += `
          <button 
            type="button" 
            onclick="renderJudicialPage(${Math.max(1, page - 1)})" 
            ${page === 1 ? 'disabled' : ''}
            class="px-3 py-1.5 rounded-xl border ${page === 1 ? 'bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed' : 'bg-white text-navy-950 hover:bg-slate-100 border-slate-300 font-bold'} text-xs transition-all cursor-pointer"
          >
            ◀ Anterior
          </button>
        `;

        for (let i = 1; i <= totalPages; i++) {
          const isActive = i === page;
          buttonsHtml += `
            <button 
              type="button" 
              onclick="renderJudicialPage(${i})" 
              class="px-3 py-1.5 rounded-xl border text-xs font-bold transition-all cursor-pointer ${isActive ? 'bg-blue-600 text-white border-blue-600 shadow-sm' : 'bg-white text-slate-700 hover:bg-slate-100 border-slate-200'}"
            >
              ${i}
            </button>
          `;
        }

        buttonsHtml += `
          <button 
            type="button" 
            onclick="renderJudicialPage(${Math.min(totalPages, page + 1)})" 
            ${page === totalPages ? 'disabled' : ''}
            class="px-3 py-1.5 rounded-xl border ${page === totalPages ? 'bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed' : 'bg-white text-navy-950 hover:bg-slate-100 border-slate-300 font-bold'} text-xs transition-all cursor-pointer"
          >
            Próximo ▶
          </button>
        `;
      }
      if (btnContainer) btnContainer.innerHTML = buttonsHtml;

      container.innerHTML = pageItems.map((p, index) => {
        const lastMov = p.movements && p.movements[0] ? p.movements[0] : { title: 'Processo Ativo', date: p.distribution_date };
        const poloAtivoName = p.polo_ativo?.[0]?.name || 'Parte Autora';
        const poloPassivoName = p.polo_passivo?.[0]?.name || 'Parte Ré';
        const formattedDate = lastMov.date ? (lastMov.date.includes('-') ? lastMov.date.split('-').reverse().join('/') : lastMov.date) : '-';
        const numDisplay = p.numero_formatado || p.numero_processo;
        const courtDisplay = p.orgao_julgador || p.court_branch || 'Vara Cível / Juízo';

        return `
          <div class="bg-white rounded-3xl p-5 sm:p-6 border border-slate-200 shadow-sm hover:shadow-md transition-all space-y-4">
            
            <!-- Cabeçalho do Card -->
            <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 border-b border-slate-100 pb-3">
              <div>
                <div class="flex flex-wrap items-center gap-2 mb-1">
                  <span class="px-2.5 py-0.5 rounded-full bg-blue-100 text-blue-900 font-extrabold text-[10px] uppercase">
                    ${p.tribunal_code ? p.tribunal_code.toUpperCase() : 'TJMG'}
                  </span>
                  <span class="px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-900 font-bold text-[10px]">
                    ⚡ Processo Ordenado (CNJ)
                  </span>
                  <span class="text-xs text-slate-400">•</span>
                  <span class="text-xs font-semibold text-slate-500">${p.tribunal_name || 'Tribunal de Justiça'}</span>
                </div>
                <h4 class="font-mono font-black text-base sm:text-lg text-navy-950 hover:text-blue-700 cursor-pointer select-all" onclick="openJudicialProcessModal('${p.id}')">
                  ⚖️ ${numDisplay}
                </h4>
              </div>

              <span class="px-3 py-1 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200 text-xs font-bold flex items-center space-x-1">
                <span class="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                <span>${p.status || 'Em Tramitação'}</span>
              </span>
            </div>

            <!-- Dados da Ação & Partes -->
            <div class="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
              <div class="space-y-1">
                <span class="text-[10px] font-bold uppercase text-slate-400 block">Classe & Assunto:</span>
                <p class="font-bold text-slate-800">${p.class_name || 'Ação Judicial'}</p>
                <p class="text-slate-500 text-[11px]">${p.subject || 'Direito Civil e Empresarial'}</p>
              </div>

              <div class="space-y-1">
                <span class="text-[10px] font-bold uppercase text-slate-400 block">Polos da Ação:</span>
                <p class="text-slate-800"><strong class="text-emerald-700">Autor:</strong> ${poloAtivoName}</p>
                <p class="text-slate-800"><strong class="text-rose-700">Réu:</strong> ${poloPassivoName}</p>
              </div>

              <div class="space-y-1">
                <span class="text-[10px] font-bold uppercase text-slate-400 block">Comarca / Juízo:</span>
                <p class="font-bold text-slate-800">${courtDisplay}</p>
                <p class="text-slate-500 text-[11px]">Distribuído em: ${p.distribution_date || '—'}</p>
              </div>
            </div>

            <!-- Última Movimentação -->
            <div class="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div class="flex items-center space-x-2 overflow-hidden">
                <span class="px-2 py-0.5 bg-blue-100 text-blue-900 rounded font-bold text-[10px] whitespace-nowrap">Último Andamento (${formattedDate})</span>
                <span class="text-slate-700 font-medium truncate">${lastMov.title || lastMov.description || 'Movimentação Registrada'}</span>
              </div>
            </div>

            <!-- Ações do Processo -->
            <div class="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-100">
              <div class="flex items-center space-x-2">
                <button 
                  onclick="openJudicialProcessModal('${p.id}')" 
                  type="button"
                  class="px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs transition-all flex items-center space-x-1.5 cursor-pointer"
                >
                  <span>📄</span>
                  <span>Ver Autos & Movimentações</span>
                </button>

                <button 
                  onclick="openDeadlineCalculator({ lawsuit_number: '${numDisplay}', client_name: '${poloAtivoName}', title: 'Prazo: ${numDisplay}' })" 
                  type="button"
                  class="px-3.5 py-2 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-300 font-bold text-xs transition-all flex items-center space-x-1.5 cursor-pointer"
                >
                  <span>🧮</span>
                  <span>Calcular Prazo</span>
                </button>
              </div>

              <button 
                onclick="quickImportJudicialProcess('${p.id}')" 
                type="button"
                class="px-4 py-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-700 hover:from-emerald-500 hover:to-teal-600 text-white font-bold text-xs shadow-sm hover:shadow transition-all flex items-center space-x-1.5 cursor-pointer"
              >
                <span>📥</span>
                <span>Importar para o Escritório</span>
              </button>
            </div>

          </div>
        `;
      }).join('');
    }

    function openJudicialProcessModal(processId) {
      const process = currentJudicialResults.find(p => p.id === processId);
      if (!process) return;

      selectedJudicialProcess = process;

      document.getElementById('jmodal-tribunal-badge').textContent = (process.tribunal_code || 'TJ').toUpperCase();
      document.getElementById('jmodal-system-badge').textContent = process.court_system || 'PJe';
      document.getElementById('jmodal-process-number').textContent = process.numero_processo;
      document.getElementById('jmodal-class-name').textContent = process.class_name;
      document.getElementById('jmodal-subject').textContent = process.subject;
      document.getElementById('jmodal-distribution').textContent = process.distribution_date;
      document.getElementById('jmodal-court-branch').textContent = process.court_branch;

      const poloAtivoName = process.polo_ativo?.[0]?.name || 'Autor';
      const poloAtivoDoc = process.polo_ativo?.[0]?.document || '';
      document.getElementById('jmodal-polo-ativo').textContent = poloAtivoName;
      document.getElementById('jmodal-polo-ativo-doc').textContent = poloAtivoDoc ? `Documento: ${poloAtivoDoc}` : '';

      const poloPassivoName = process.polo_passivo?.[0]?.name || 'Réu';
      const poloPassivoDoc = process.polo_passivo?.[0]?.document || '';
      document.getElementById('jmodal-polo-passivo').textContent = poloPassivoName;
      document.getElementById('jmodal-polo-passivo-doc').textContent = poloPassivoDoc ? `Documento: ${poloPassivoDoc}` : '';

      const lawyerName = process.lawyers?.[0]?.name || 'Dr. Jorge Eduardo da Silva Alvim';
      const lawyerOAB = process.lawyers?.[0]?.oab || '222.943';
      document.getElementById('jmodal-lawyers').textContent = `${lawyerName} (OAB/${process.lawyers?.[0]?.uf || 'MG'} ${lawyerOAB})`;

      document.getElementById('jmodal-portal-link').href = process.direct_portal_url;

      // Renderizar Documentos Públicos
      const docsContainer = document.getElementById('jmodal-docs-container');
      const docs = process.public_documents || [];
      docsContainer.innerHTML = docs.map(d => `
        <div class="p-2.5 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between text-xs hover:bg-blue-50/50 hover:border-blue-200 transition-all cursor-pointer" onclick="alert('Documento Público dos Autos Eletrônicos: ${d.title} (Disponível no Portal do Tribunal)')">
          <div class="flex items-center space-x-2 truncate">
            <span class="p-1 rounded bg-rose-100 text-rose-700 font-bold text-[10px]">${d.type}</span>
            <span class="font-semibold text-slate-800 truncate">${d.title}</span>
          </div>
          <span class="text-[10px] text-blue-600 font-bold">Ver</span>
        </div>
      `).join('');

      // Renderizar Movimentações
      const movTimeline = document.getElementById('jmodal-movements-timeline');
      const movs = process.movements || [];
      movTimeline.innerHTML = movs.map(m => {
        const d = m.date ? new Date(m.date).toLocaleString('pt-BR') : '-';
        return `
          <div class="relative group">
            <span class="absolute -left-[21px] top-1.5 w-2.5 h-2.5 rounded-full bg-blue-500 border-2 border-white ring-2 ring-blue-200"></span>
            <div class="bg-slate-50 hover:bg-slate-100 p-3 rounded-2xl border border-slate-200 transition-all text-xs">
              <div class="flex justify-between items-center mb-1">
                <span class="font-bold text-navy-950">${m.title}</span>
                <span class="text-[10px] text-slate-400 font-mono">${d}</span>
              </div>
              ${m.details ? `<p class="text-slate-600 text-[11px] mt-0.5">${m.details}</p>` : ''}
            </div>
          </div>
        `;
      }).join('');

      document.getElementById('judicial-process-modal').classList.remove('hidden');
    }

    function closeJudicialProcessModal() {
      document.getElementById('judicial-process-modal').classList.add('hidden');
      selectedJudicialProcess = null;
    }

    async function quickImportJudicialProcess(processId) {
      const process = currentJudicialResults.find(p => p.id === processId);
      if (!process) return;
      selectedJudicialProcess = process;
      await importCurrentJudicialProcess();
    }

    async function importCurrentJudicialProcess() {
      if (!selectedJudicialProcess) {
        alert('Nenhum processo selecionado para importação.');
        return;
      }

      const importBtn = document.getElementById('jmodal-import-btn');
      if (importBtn) {
        importBtn.disabled = true;
        importBtn.textContent = 'Importando...';
      }

      try {
        const res = await fetch('/api/judicial/import-to-office', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
          body: JSON.stringify({
            process_data: selectedJudicialProcess
          })
        });

        const data = await res.json();

        if (res.ok && data.success) {
          alert(`🎉 ${data.message}\n\nO cliente e o processo foram cadastrados no sistema com todo o histórico de movimentações!`);
          closeJudicialProcessModal();
          loadClients();
          loadLawsuits();
        } else {
          alert(`❌ ${data.error || 'Erro ao importar processo para o escritório.'}`);
        }
      } catch (err) {
        alert('Falha de conexão com o servidor ao importar processo.');
      } finally {
        if (importBtn) {
          importBtn.disabled = false;
          importBtn.innerHTML = '<span>📥 Importar para o Escritório</span>';
        }
      }
    }

    // =========================================================================
    // 📅 CONTROLLER DA AGENDA GERAL & CALENDÁRIOS INDIVIDUAIS (iCal / Google)
    // =========================================================================
    let calendarState = {
      currentYear: new Date().getFullYear(),
      currentMonth: new Date().getMonth(), // 0-11
      currentView: 'month', // 'month', 'week', 'list', 'kanban'
      selectedLawyer: 'all',
      selectedType: 'all',
      selectedStatus: 'agendado',
      events: [],
      lawyers: [],
      activeEvent: null
    };

    const MONTH_NAMES_PT = [
      'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
      'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
    ];

    async function initCalendarTab() {
      await loadCalendarLawyers();
      await loadCalendarClientsAndLawsuits();
      await loadCalendarEvents();
      await loadCalendarSummary();
      await loadActivityDrafts();
      loadOfficeScratchpad();
    }

    async function loadCalendarLawyers() {
      try {
        const res = await fetch('/api/calendar/lawyers', { headers: getAuthHeaders() });
        const data = await res.json();
        if (res.ok && data.success) {
          calendarState.lawyers = data.lawyers || [];
          
          // Preencher dropdown de filtro
          const filterSel = document.getElementById('cal-filter-lawyer');
          if (filterSel) {
            const currentVal = filterSel.value;
            filterSel.innerHTML = `
              <option value="all">🏢 Geral do Escritório (Todos)</option>
              ${calendarState.lawyers.map(l => `<option value="${l.id}">${l.name} (${l.role})</option>`).join('')}
            `;
            if (currentVal) filterSel.value = currentVal;
          }

          // Preencher dropdown do modal de cadastro
          const inputSel = document.getElementById('cal-input-lawyer');
          if (inputSel) {
            inputSel.innerHTML = calendarState.lawyers.map(l => `<option value="${l.id}" data-name="${l.name}">${l.name} - ${l.role}</option>`).join('');
          }
        }
      } catch (err) {
        console.warn('Falha ao carregar advogados para a agenda:', err);
      }
    }

    function loadCalendarClientsAndLawsuits() {
      try {
        // Preencher clientes no modal de evento
        const clientSel = document.getElementById('cal-input-client');
        if (clientSel && allClients && allClients.length > 0) {
          clientSel.innerHTML = `
            <option value="">Nenhum cliente vinculado</option>
            ${allClients.map(c => `<option value="${c.id}" data-name="${c.full_name}">${c.full_name} (${c.cpf || c.cnpj || 'S/ Doc'})</option>`).join('')}
          `;
        }

        // Preencher processos no modal de evento
        const lawsuitSel = document.getElementById('cal-input-lawsuit');
        if (lawsuitSel && allLawsuits && allLawsuits.length > 0) {
          lawsuitSel.innerHTML = `
            <option value="">Nenhum processo vinculado</option>
            ${allLawsuits.map(l => `<option value="${l.id}" data-number="${l.lawsuit_number}">${l.lawsuit_number} - ${l.client_name || ''}</option>`).join('')}
          `;
        }
      } catch (e) {}
    }

    async function loadCalendarEvents() {
      try {
        const { currentYear, currentMonth, selectedLawyer, selectedType, selectedStatus } = calendarState;
        const padM = String(currentMonth + 1).padStart(2, '0');
        
        let url = `/api/calendar/events?year=${currentYear}&month=${padM}`;
        if (selectedLawyer && selectedLawyer !== 'all') url += `&lawyer_id=${encodeURIComponent(selectedLawyer)}`;
        if (selectedType && selectedType !== 'all') url += `&event_type=${encodeURIComponent(selectedType)}`;
        if (selectedStatus && selectedStatus !== 'all') url += `&status=${encodeURIComponent(selectedStatus)}`;

        const res = await fetch(url, { headers: getAuthHeaders() });
        const data = await res.json();
        
        if (res.ok && data.success) {
          calendarState.events = data.events || [];
          renderCalendar();
        }
      } catch (err) {
        console.error('Erro ao buscar eventos:', err);
      }
    }

    async function loadCalendarSummary() {
      try {
        const res = await fetch('/api/calendar/summary', { headers: getAuthHeaders() });
        const data = await res.json();
        if (res.ok && data.success) {
          const stats = data.stats || {};
          const statHearings = document.getElementById('cal-stat-hearings');
          const statDeadlines = document.getElementById('cal-stat-deadlines');
          const statTotal = document.getElementById('cal-stat-total');
          const tabBadge = document.getElementById('tab-calendar-count');

          if (statHearings) statHearings.textContent = stats.total_hearings || 0;
          if (statDeadlines) statDeadlines.textContent = stats.total_deadlines || 0;
          if (statTotal) statTotal.textContent = stats.total_month || 0;
          if (tabBadge) {
            const todayCount = (data.today_events || []).length;
            tabBadge.textContent = todayCount;
            if (todayCount > 0) {
              tabBadge.className = 'px-1.5 py-0.5 rounded-full bg-rose-100 text-rose-800 text-[10px] font-extrabold animate-pulse';
            } else {
              tabBadge.className = 'px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-800 text-[10px] font-bold';
            }
          }
        }
      } catch (err) {}
    }

    function renderCalendar() {
      const titleEl = document.getElementById('cal-current-month-title');
      if (titleEl) {
        titleEl.textContent = `${MONTH_NAMES_PT[calendarState.currentMonth]} de ${calendarState.currentYear}`;
      }

      const badgeEl = document.getElementById('cal-active-lawyer-badge');
      if (badgeEl) {
        if (calendarState.selectedLawyer === 'all') {
          badgeEl.textContent = '🏢 Geral do Escritório (Todos)';
        } else {
          const found = calendarState.lawyers.find(l => l.id === calendarState.selectedLawyer);
          badgeEl.textContent = `👤 ${found ? found.name : calendarState.selectedLawyer}`;
        }
      }

      if (calendarState.currentView === 'month') {
        renderMonthlyGrid();
      } else if (calendarState.currentView === 'week') {
        renderWeeklyGrid();
      } else if (calendarState.currentView === 'list') {
        renderListView();
      } else if (calendarState.currentView === 'kanban') {
        renderKanbanView();
      }
    }

    function renderMonthlyGrid() {
      const grid = document.getElementById('cal-month-days-grid');
      if (!grid) return;

      const year = calendarState.currentYear;
      const month = calendarState.currentMonth;

      const firstDayIndex = new Date(year, month, 1).getDay(); // 0 = Domingo
      const daysInMonth = new Date(year, month + 1, 0).getDate();
      const prevMonthDays = new Date(year, month, 0).getDate();

      const today = new Date();
      const isCurrentMonthYear = today.getFullYear() === year && today.getMonth() === month;
      const todayDateNum = isCurrentMonthYear ? today.getDate() : -1;

      let html = '';

      // Dias do mês anterior
      for (let x = firstDayIndex; x > 0; x--) {
        const dayNum = prevMonthDays - x + 1;
        html += `
          <div class="min-h-[110px] p-2 bg-slate-50/70 text-slate-300 select-none">
            <span class="text-xs font-semibold">${dayNum}</span>
          </div>
        `;
      }

      // Dias do mês atual
      for (let day = 1; day <= daysInMonth; day++) {
        const padDay = String(day).padStart(2, '0');
        const padM = String(month + 1).padStart(2, '0');
        const dateKey = `${year}-${padM}-${padDay}`;

        const isToday = day === todayDateNum;
        const dayEvents = calendarState.events.filter(e => {
          return e.start_datetime && e.start_datetime.startsWith(dateKey);
        });

        html += `
          <div 
            onclick="handleDayClick('${dateKey}', event)" 
            class="min-h-[115px] p-1.5 sm:p-2 bg-white hover:bg-amber-50/30 transition-all cursor-pointer flex flex-col justify-between group relative ${isToday ? 'ring-2 ring-inset ring-gold-500 bg-amber-50/20' : ''}"
          >
            <div class="flex items-center justify-between">
              <span class="inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-extrabold ${isToday ? 'bg-gold-600 text-white shadow-xs' : 'text-slate-700 group-hover:text-navy-950'}">
                ${day}
              </span>
              ${dayEvents.length > 0 ? `<span class="text-[10px] font-extrabold text-slate-400 font-mono">${dayEvents.length} evt</span>` : ''}
            </div>

            <!-- Lista de Eventos do Dia -->
            <div class="space-y-1 mt-1 overflow-y-auto max-h-[85px] no-scrollbar">
              ${dayEvents.slice(0, 3).map(e => renderEventPill(e)).join('')}
              ${dayEvents.length > 3 ? `<div class="text-[10px] text-center font-bold text-gold-700 hover:underline">+ ${dayEvents.length - 3} mais</div>` : ''}
            </div>
          </div>
        `;
      }

      // Preencher final da grade para fechar 35 ou 42 células
      const totalCells = firstDayIndex + daysInMonth;
      const nextDays = (totalCells % 7 === 0) ? 0 : 7 - (totalCells % 7);
      for (let i = 1; i <= nextDays; i++) {
        html += `
          <div class="min-h-[110px] p-2 bg-slate-50/70 text-slate-300 select-none">
            <span class="text-xs font-semibold">${i}</span>
          </div>
        `;
      }

      grid.innerHTML = html;
    }

    function renderEventPill(evt) {
      let icon = '📅';
      let bgClass = 'bg-blue-50 text-blue-900 border-blue-200';
      if (evt.event_type === 'audiencia') {
        icon = '⚖️';
        bgClass = 'bg-rose-50 text-rose-900 border-rose-200';
      } else if (evt.event_type === 'prazo_fatal') {
        icon = '⚠️';
        bgClass = 'bg-amber-50 text-amber-900 border-amber-300 font-bold';
      } else if (evt.event_type === 'consulta') {
        icon = '👤';
        bgClass = 'bg-emerald-50 text-emerald-900 border-emerald-200';
      } else if (evt.event_type === 'reuniao') {
        icon = '🟢';
        bgClass = 'bg-indigo-50 text-indigo-900 border-indigo-200';
      }

      const timeStr = evt.all_day ? 'Prazo' : (evt.start_datetime.split('T')[1] || '').slice(0, 5);
      const isDone = evt.status === 'concluido';

      return `
        <div 
          onclick="openCalendarViewModal('${evt.id}', event)" 
          class="p-1 rounded-lg border text-[10px] leading-tight truncate shadow-2xs hover:scale-[1.02] transition-transform cursor-pointer ${bgClass} ${isDone ? 'opacity-50 line-through' : ''}"
          title="${evt.title} - ${evt.lawyer_name || ''}"
        >
          <div class="flex items-center space-x-1">
            <span>${icon}</span>
            <span class="font-extrabold font-mono">${timeStr}</span>
            <span class="truncate font-semibold">${evt.title}</span>
          </div>
        </div>
      `;
    }

    function renderWeeklyGrid() {
      const grid = document.getElementById('cal-week-days-grid');
      if (!grid) return;

      const year = calendarState.currentYear;
      const month = calendarState.currentMonth;
      const today = new Date();
      
      // Montar 7 dias da semana atual
      const dayOfWeek = today.getDay();
      const startOfWeek = new Date(today);
      startOfWeek.setDate(today.getDate() - dayOfWeek);

      const daysOfWeekNames = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
      let html = '';

      for (let i = 0; i < 7; i++) {
        const cur = new Date(startOfWeek);
        cur.setDate(startOfWeek.getDate() + i);

        const padDay = String(cur.getDate()).padStart(2, '0');
        const padM = String(cur.getMonth() + 1).padStart(2, '0');
        const dateKey = `${cur.getFullYear()}-${padM}-${padDay}`;
        const isToday = cur.toDateString() === today.toDateString();

        const dayEvents = calendarState.events.filter(e => e.start_datetime && e.start_datetime.startsWith(dateKey));

        html += `
          <div class="bg-slate-50/50 rounded-2xl border ${isToday ? 'border-gold-400 ring-2 ring-gold-200 bg-amber-50/20' : 'border-slate-200'} p-3 space-y-3 flex flex-col justify-between">
            <div>
              <div class="flex items-center justify-between border-b border-slate-200 pb-2 mb-2">
                <div>
                  <div class="text-[11px] uppercase font-bold text-slate-500">${daysOfWeekNames[i]}</div>
                  <div class="text-base font-extrabold text-navy-950">${padDay}/${padM}</div>
                </div>
                ${isToday ? '<span class="px-2 py-0.5 rounded-full bg-gold-500 text-navy-950 text-[10px] font-extrabold">HOJE</span>' : ''}
              </div>

              <div class="space-y-2 min-h-[140px]">
                ${dayEvents.length === 0 ? '<div class="text-[11px] text-slate-400 text-center py-6">Sem compromissos</div>' : dayEvents.map(e => `
                  <div onclick="openCalendarViewModal('${e.id}', event)" class="bg-white p-2.5 rounded-xl border border-slate-200 shadow-2xs hover:border-gold-400 transition-all cursor-pointer text-xs space-y-1">
                    <div class="flex items-center justify-between">
                      <span class="font-extrabold text-[10px] text-gold-700">${e.all_day ? 'DIA INTEIRO' : (e.start_datetime.split('T')[1] || '').slice(0, 5)}</span>
                      <span class="px-1.5 py-0.2 rounded text-[9px] font-bold ${e.event_type === 'audiencia' ? 'bg-rose-100 text-rose-800' : 'bg-slate-100 text-slate-800'}">${e.event_type.toUpperCase()}</span>
                    </div>
                    <div class="font-bold text-navy-950 truncate">${e.title}</div>
                    <div class="text-[10px] text-slate-500 truncate">👤 ${e.lawyer_name || 'Geral'}</div>
                  </div>
                `).join('')}
              </div>
            </div>

            <button onclick="handleDayClick('${dateKey}', event)" type="button" class="w-full py-1.5 rounded-lg bg-white hover:bg-gold-50 border border-slate-200 text-slate-600 hover:text-gold-800 font-bold text-[10px] transition-colors">
              + Adicionar
            </button>
          </div>
        `;
      }

      grid.innerHTML = html;
    }

    function renderListView() {
      const container = document.getElementById('cal-list-events');
      if (!container) return;

      if (calendarState.events.length === 0) {
        container.innerHTML = `
          <div class="py-12 text-center text-slate-400 space-y-2">
            <div class="text-3xl">📅</div>
            <p class="text-sm font-semibold">Nenhum compromisso ou prazo cadastrado para este período.</p>
          </div>
        `;
        return;
      }

      container.innerHTML = calendarState.events.map(evt => {
        const dt = new Date(evt.start_datetime);
        const dateStr = dt.toLocaleDateString('pt-BR');
        const timeStr = evt.all_day ? 'Dia Inteiro' : (evt.start_datetime.split('T')[1] || '').slice(0, 5);

        return `
          <div class="p-4 hover:bg-slate-50/80 transition-colors flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
            <div class="flex items-start space-x-3">
              <div class="w-10 h-10 rounded-xl bg-amber-50 text-amber-800 flex items-center justify-center text-lg font-bold flex-shrink-0 border border-amber-200">
                ${evt.event_type === 'audiencia' ? '⚖️' : evt.event_type === 'prazo_fatal' ? '⚠️' : '📅'}
              </div>
              <div>
                <div class="flex flex-wrap items-center gap-1.5 mb-1">
                  <span class="px-2 py-0.5 rounded text-[10px] font-bold ${evt.event_type === 'audiencia' ? 'bg-rose-100 text-rose-800' : evt.event_type === 'prazo_fatal' ? 'bg-amber-100 text-amber-900' : 'bg-blue-100 text-blue-900'}">${evt.event_type.toUpperCase()}</span>
                  <span class="text-xs text-slate-500 font-mono">📅 ${dateStr} às ${timeStr}</span>
                  ${evt.status === 'concluido' ? '<span class="px-2 py-0.5 rounded bg-emerald-100 text-emerald-900 text-[10px] font-bold">CONCLUÍDO</span>' : ''}
                </div>
                <h4 class="font-bold text-sm text-navy-950">${evt.title}</h4>
                <div class="flex flex-wrap items-center gap-3 text-xs text-slate-500 mt-1">
                  <span>👤 Advogado: <strong class="text-slate-700">${evt.lawyer_name || 'Geral'}</strong></span>
                  ${evt.client_name ? `<span>👥 Cliente: <strong class="text-slate-700">${evt.client_name}</strong></span>` : ''}
                  ${evt.lawsuit_number ? `<span>⚖️ Proc: <strong class="text-slate-700 font-mono">${evt.lawsuit_number}</strong></span>` : ''}
                </div>
              </div>
            </div>

            <div class="flex items-center space-x-2 self-end sm:self-center">
              ${evt.meeting_url ? `<a href="${evt.meeting_url}" target="_blank" class="px-3 py-1.5 rounded-xl bg-blue-50 hover:bg-blue-100 text-blue-800 font-bold text-xs border border-blue-200" title="Sala Virtual">🎥 Sala Virtual</a>` : ''}
              <button onclick="openCalendarViewModal('${evt.id}', event)" type="button" class="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs">Ver Detalhes</button>
            </div>
          </div>
        `;
      }).join('');
    }

    function renderKanbanView() {
      const colToday = document.getElementById('kanban-col-today');
      const colWeek = document.getElementById('kanban-col-week');
      const colMonth = document.getElementById('kanban-col-month');
      const colDone = document.getElementById('kanban-col-done');

      const countToday = document.getElementById('kanban-count-today');
      const countWeek = document.getElementById('kanban-count-week');
      const countMonth = document.getElementById('kanban-count-month');
      const countDone = document.getElementById('kanban-count-done');

      if (!colToday) return;

      const now = new Date();
      const pad = (n) => String(n).padStart(2, '0');
      const todayStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;

      const next7 = new Date(now);
      next7.setDate(now.getDate() + 7);
      const next7Str = `${next7.getFullYear()}-${pad(next7.getMonth() + 1)}-${pad(next7.getDate())}`;

      const todayList = [];
      const weekList = [];
      const monthList = [];
      const doneList = [];

      calendarState.events.forEach(e => {
        if (e.status === 'concluido') {
          doneList.push(e);
        } else {
          const dateOnly = (e.start_datetime || '').slice(0, 10);
          if (dateOnly === todayStr) {
            todayList.push(e);
          } else if (dateOnly > todayStr && dateOnly <= next7Str) {
            weekList.push(e);
          } else {
            monthList.push(e);
          }
        }
      });

      if (countToday) countToday.textContent = todayList.length;
      if (countWeek) countWeek.textContent = weekList.length;
      if (countMonth) countMonth.textContent = monthList.length;
      if (countDone) countDone.textContent = doneList.length;

      const renderKanbanCard = (e) => `
        <div onclick="openCalendarViewModal('${e.id}', event)" class="bg-white p-3 rounded-2xl border border-slate-200 shadow-xs hover:border-gold-400 transition-all cursor-pointer text-xs space-y-1.5">
          <div class="flex items-center justify-between">
            <span class="font-extrabold text-[10px] text-amber-800 font-mono">📅 ${(e.start_datetime || '').slice(0, 10)}</span>
            <span class="px-1.5 py-0.2 rounded text-[9px] font-extrabold ${e.priority === 'fatal' ? 'bg-rose-600 text-white' : 'bg-slate-100 text-slate-700'}">${(e.priority || 'normal').toUpperCase()}</span>
          </div>
          <div class="font-bold text-navy-950 line-clamp-2">${e.title}</div>
          <div class="text-[10px] text-slate-500 truncate">👤 ${e.lawyer_name || 'Geral'}</div>
          ${e.lawsuit_number ? `<div class="text-[10px] text-slate-400 font-mono truncate">⚖️ ${e.lawsuit_number}</div>` : ''}
        </div>
      `;

      colToday.innerHTML = todayList.length === 0 ? '<div class="text-xs text-slate-400 text-center py-6">Nenhum prazo hoje</div>' : todayList.map(renderKanbanCard).join('');
      colWeek.innerHTML = weekList.length === 0 ? '<div class="text-xs text-slate-400 text-center py-6">Nenhum prazo nesta semana</div>' : weekList.map(renderKanbanCard).join('');
      colMonth.innerHTML = monthList.length === 0 ? '<div class="text-xs text-slate-400 text-center py-6">Nenhum prazo futuro</div>' : monthList.map(renderKanbanCard).join('');
      colDone.innerHTML = doneList.length === 0 ? '<div class="text-xs text-slate-400 text-center py-6">Nenhum prazo concluído</div>' : doneList.map(renderKanbanCard).join('');
    }

    function setCalendarViewMode(mode) {
      calendarState.currentView = mode;
      
      const views = ['month', 'week', 'list', 'kanban'];
      views.forEach(v => {
        const btn = document.getElementById(`cal-view-btn-${v}`);
        const cont = document.getElementById(`cal-view-${v}-container`);
        if (btn) {
          if (v === mode) {
            btn.className = 'flex-1 py-1 rounded-lg font-bold text-[11px] bg-white text-navy-950 shadow-xs transition-all';
          } else {
            btn.className = 'flex-1 py-1 rounded-lg font-semibold text-[11px] text-slate-600 hover:text-slate-900 transition-all';
          }
        }
        if (cont) {
          if (v === mode) cont.classList.remove('hidden');
          else cont.classList.add('hidden');
        }
      });

      renderCalendar();
    }

    function handleCalendarFilterChange() {
      const lawyerSel = document.getElementById('cal-filter-lawyer');
      const typeSel = document.getElementById('cal-filter-type');
      const statusSel = document.getElementById('cal-filter-status');

      if (lawyerSel) calendarState.selectedLawyer = lawyerSel.value;
      if (typeSel) calendarState.selectedType = typeSel.value;
      if (statusSel) calendarState.selectedStatus = statusSel.value;

      loadCalendarEvents();
    }

    function navigateCalendarMonth(step) {
      calendarState.currentMonth += step;
      if (calendarState.currentMonth < 0) {
        calendarState.currentMonth = 11;
        calendarState.currentYear -= 1;
      } else if (calendarState.currentMonth > 11) {
        calendarState.currentMonth = 0;
        calendarState.currentYear += 1;
      }
      loadCalendarEvents();
    }

    function goToCurrentCalendarMonth() {
      const today = new Date();
      calendarState.currentYear = today.getFullYear();
      calendarState.currentMonth = today.getMonth();
      loadCalendarEvents();
    }

    function handleDayClick(dateKey, e) {
      if (e) e.stopPropagation();
      openCalendarEventModal(null, dateKey);
    }

    function openCalendarEventModal(eventId = null, defaultDate = null) {
      const modal = document.getElementById('modal-calendar-event');
      const form = document.getElementById('cal-event-form');
      const titleEl = document.getElementById('cal-modal-title');
      if (form) form.reset();

      loadCalendarClientsAndLawsuits();

      const pad = (n) => String(n).padStart(2, '0');
      const now = new Date();
      const defaultStart = defaultDate ? `${defaultDate}T09:00` : `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(now.getHours() + 1)}:00`;

      if (eventId) {
        const evt = calendarState.events.find(e => e.id === eventId);
        if (evt) {
          titleEl.textContent = 'Editar Compromisso / Prazo';
          document.getElementById('cal-event-id').value = evt.id;
          document.getElementById('cal-input-title').value = evt.title;
          document.getElementById('cal-input-type').value = evt.event_type;
          document.getElementById('cal-input-lawyer').value = evt.lawyer_id || 'dr-jorge-alvim';
          document.getElementById('cal-input-start').value = (evt.start_datetime || '').slice(0, 16);
          document.getElementById('cal-input-end').value = evt.end_datetime ? evt.end_datetime.slice(0, 16) : '';
          document.getElementById('cal-input-allday').checked = evt.all_day === 1;
          document.getElementById('cal-input-client').value = evt.client_id || '';
          document.getElementById('cal-input-lawsuit').value = evt.lawsuit_id || '';
          document.getElementById('cal-input-location').value = evt.location || '';
          document.getElementById('cal-input-meeting-url').value = evt.meeting_url || '';
          document.getElementById('cal-input-priority').value = evt.priority || 'normal';
          document.getElementById('cal-input-status').value = evt.status || 'agendado';
          document.getElementById('cal-input-desc').value = evt.description || '';
        }
      } else {
        titleEl.textContent = 'Novo Compromisso / Prazo';
        document.getElementById('cal-event-id').value = '';
        document.getElementById('cal-input-start').value = defaultStart;
        document.getElementById('cal-input-lawyer').value = calendarState.selectedLawyer !== 'all' ? calendarState.selectedLawyer : 'dr-jorge-alvim';
      }

      if (modal) modal.classList.remove('hidden');
    }

    function closeCalendarEventModal() {
      const modal = document.getElementById('modal-calendar-event');
      if (modal) modal.classList.add('hidden');
    }

    async function handleCalendarEventSubmit(e) {
      e.preventDefault();
      const id = document.getElementById('cal-event-id').value;
      const lawyerSel = document.getElementById('cal-input-lawyer');
      const clientSel = document.getElementById('cal-input-client');
      const lawsuitSel = document.getElementById('cal-input-lawsuit');

      const lawyerOpt = lawyerSel.options[lawyerSel.selectedIndex];
      const clientOpt = clientSel.options[clientSel.selectedIndex];
      const lawsuitOpt = lawsuitSel.options[lawsuitSel.selectedIndex];

      const payload = {
        title: document.getElementById('cal-input-title').value.trim(),
        event_type: document.getElementById('cal-input-type').value,
        lawyer_id: lawyerSel.value,
        lawyer_name: lawyerOpt ? (lawyerOpt.getAttribute('data-name') || lawyerOpt.textContent.split(' - ')[0]) : '',
        start_datetime: document.getElementById('cal-input-start').value,
        end_datetime: document.getElementById('cal-input-end').value || document.getElementById('cal-input-start').value,
        all_day: document.getElementById('cal-input-allday').checked ? 1 : 0,
        client_id: clientSel.value || null,
        client_name: clientOpt && clientSel.value ? clientOpt.getAttribute('data-name') : '',
        lawsuit_id: lawsuitSel.value || null,
        lawsuit_number: lawsuitOpt && lawsuitSel.value ? lawsuitOpt.getAttribute('data-number') : '',
        location: document.getElementById('cal-input-location').value.trim(),
        meeting_url: document.getElementById('cal-input-meeting-url').value.trim(),
        priority: document.getElementById('cal-input-priority').value,
        status: document.getElementById('cal-input-status').value,
        description: document.getElementById('cal-input-desc').value.trim()
      };

      const btn = document.getElementById('cal-submit-btn');
      if (btn) btn.disabled = true;

      try {
        const method = id ? 'PUT' : 'POST';
        const url = id ? `/api/calendar/events/${id}` : '/api/calendar/events';

        const res = await fetch(url, {
          method,
          headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
          body: JSON.stringify(payload)
        });

        const data = await res.json();
        if (res.ok && data.success) {
          alert(`✅ ${data.message}`);
          closeCalendarEventModal();
          await loadCalendarEvents();
          await loadCalendarSummary();
        } else {
          alert(`❌ ${data.error || 'Erro ao salvar compromisso.'}`);
        }
      } catch (err) {
        alert('Falha de comunicação com o servidor.');
      } finally {
        if (btn) btn.disabled = false;
      }
    }

    function openCalendarViewModal(eventId, e) {
      if (e) e.stopPropagation();
      const evt = calendarState.events.find(x => x.id === eventId);
      if (!evt) return;

      calendarState.activeEvent = evt;
      const modal = document.getElementById('modal-calendar-view');

      document.getElementById('cal-view-title').textContent = evt.title;
      document.getElementById('cal-view-type-badge').textContent = evt.event_type.toUpperCase();
      document.getElementById('cal-view-priority-badge').textContent = (evt.priority || 'normal').toUpperCase();
      document.getElementById('cal-view-status-badge').textContent = (evt.status || 'agendado').toUpperCase();

      const dt = new Date(evt.start_datetime);
      const dateStr = dt.toLocaleDateString('pt-BR');
      const timeStr = evt.all_day ? 'Dia Inteiro' : (evt.start_datetime.split('T')[1] || '').slice(0, 5);
      document.getElementById('cal-view-datetime').textContent = `${dateStr} às ${timeStr}`;
      document.getElementById('cal-view-lawyer').textContent = evt.lawyer_name || 'Geral do Escritório';

      const clientRow = document.getElementById('cal-view-client-row');
      if (clientRow) {
        if (evt.client_name) {
          clientRow.classList.remove('hidden');
          document.getElementById('cal-view-client').textContent = evt.client_name;
        } else {
          clientRow.classList.add('hidden');
        }
      }

      const lawsuitRow = document.getElementById('cal-view-lawsuit-row');
      if (lawsuitRow) {
        if (evt.lawsuit_number) {
          lawsuitRow.classList.remove('hidden');
          document.getElementById('cal-view-lawsuit').textContent = evt.lawsuit_number;
        } else {
          lawsuitRow.classList.add('hidden');
        }
      }

      const locRow = document.getElementById('cal-view-location-row');
      if (locRow) {
        if (evt.location) {
          locRow.classList.remove('hidden');
          document.getElementById('cal-view-location').textContent = evt.location;
        } else {
          locRow.classList.add('hidden');
        }
      }

      const descBox = document.getElementById('cal-view-desc-box');
      if (descBox) {
        if (evt.description) {
          descBox.classList.remove('hidden');
          descBox.textContent = evt.description;
        } else {
          descBox.classList.add('hidden');
        }
      }

      // Link da Sala Virtual
      const meetBtn = document.getElementById('cal-view-meeting-btn');
      if (meetBtn) {
        if (evt.meeting_url) {
          meetBtn.classList.remove('hidden');
          meetBtn.href = evt.meeting_url;
        } else {
          meetBtn.classList.add('hidden');
        }
      }

      // Link do Google Calendar
      const googleBtn = document.getElementById('cal-view-google-btn');
      if (googleBtn) {
        const startClean = (evt.start_datetime || '').replace(/[-:]/g, '').slice(0, 15) + (evt.all_day ? '' : '00');
        const endClean = (evt.end_datetime || evt.start_datetime || '').replace(/[-:]/g, '').slice(0, 15) + (evt.all_day ? '' : '00');
        const details = encodeURIComponent(`Advogado: ${evt.lawyer_name || ''}\nCliente: ${evt.client_name || ''}\nProcesso: ${evt.lawsuit_number || ''}\n\n${evt.description || ''}`);
        googleBtn.href = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(evt.title)}&dates=${startClean}/${endClean}&details=${details}&location=${encodeURIComponent(evt.meeting_url || evt.location || 'Juiz de Fora')}`;
      }

      const toggleStatusBtn = document.getElementById('cal-view-toggle-status-btn');
      if (toggleStatusBtn) {
        if (evt.status === 'concluido') {
          toggleStatusBtn.textContent = '🔄 Reabrir / Marcar Pendente';
          toggleStatusBtn.className = 'flex-1 py-2 px-3 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-300 font-bold text-xs transition-colors';
        } else {
          toggleStatusBtn.textContent = '✅ Marcar como Cumprido';
          toggleStatusBtn.className = 'flex-1 py-2 px-3 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300 font-bold text-xs transition-colors';
        }
      }

      if (modal) modal.classList.remove('hidden');
    }

    function closeCalendarViewModal() {
      const modal = document.getElementById('modal-calendar-view');
      if (modal) modal.classList.add('hidden');
      calendarState.activeEvent = null;
    }

    async function toggleCurrentEventStatus() {
      if (!calendarState.activeEvent) return;
      const newStatus = calendarState.activeEvent.status === 'concluido' ? 'agendado' : 'concluido';

      try {
        const res = await fetch(`/api/calendar/events/${calendarState.activeEvent.id}/status`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
          body: JSON.stringify({ status: newStatus })
        });
        const data = await res.json();
        if (res.ok && data.success) {
          closeCalendarViewModal();
          await loadCalendarEvents();
          await loadCalendarSummary();
        }
      } catch (err) {
        alert('Erro ao atualizar status do compromisso.');
      }
    }

    function editCurrentCalendarEvent() {
      if (!calendarState.activeEvent) return;
      const id = calendarState.activeEvent.id;
      closeCalendarViewModal();
      openCalendarEventModal(id);
    }

    async function deleteCurrentCalendarEvent() {
      if (!calendarState.activeEvent) return;
      if (!confirm(`Tem certeza que deseja excluir o compromisso "${calendarState.activeEvent.title}"?`)) return;

      try {
        const res = await fetch(`/api/calendar/events/${calendarState.activeEvent.id}`, {
          method: 'DELETE',
          headers: getAuthHeaders()
        });
        const data = await res.json();
        if (res.ok && data.success) {
          closeCalendarViewModal();
          await loadCalendarEvents();
          await loadCalendarSummary();
        } else {
          alert(data.error || 'Erro ao excluir compromisso.');
        }
      } catch (e) {
        alert('Falha ao excluir compromisso.');
      }
    }

    function openCalendarSyncModal() {
      const modal = document.getElementById('modal-calendar-sync');
      const origin = window.location.origin;

      const officeUrlInput = document.getElementById('sync-office-url');
      const lawyerUrlInput = document.getElementById('sync-lawyer-url');
      const selectedLawyerSpan = document.getElementById('sync-selected-lawyer-name');

      if (officeUrlInput) officeUrlInput.value = `${origin}/api/calendar/feed/office.ics`;

      const lawyerId = calendarState.selectedLawyer !== 'all' ? calendarState.selectedLawyer : 'dr-jorge-alvim';
      const lawyerObj = calendarState.lawyers.find(l => l.id === lawyerId) || { name: 'Dr. Jorge Alvim' };

      if (selectedLawyerSpan) selectedLawyerSpan.textContent = lawyerObj.name;
      if (lawyerUrlInput) lawyerUrlInput.value = `${origin}/api/calendar/feed/lawyer/${lawyerId}.ics`;

      if (modal) modal.classList.remove('hidden');
    }

    function closeCalendarSyncModal() {
      const modal = document.getElementById('modal-calendar-sync');
      if (modal) modal.classList.add('hidden');
    }

    function toggleCalendarAllDay(checked) {
      const endContainer = document.getElementById('cal-end-container');
      if (endContainer) {
        if (checked) endContainer.classList.add('opacity-40', 'pointer-events-none');
        else endContainer.classList.remove('opacity-40', 'pointer-events-none');
      }
    }

    function handleEventTypeChange() {
      const type = document.getElementById('cal-input-type').value;
      const prioritySel = document.getElementById('cal-input-priority');
      const allDayCheck = document.getElementById('cal-input-allday');
      if (type === 'prazo_fatal') {
        if (prioritySel) prioritySel.value = 'fatal';
        if (allDayCheck) {
          allDayCheck.checked = true;
          toggleCalendarAllDay(true);
        }
      }
    }

    function handleCalendarClientSelect(clientId) {
      const lawsuitSel = document.getElementById('cal-input-lawsuit');
      if (!lawsuitSel) return;

      if (!clientId) {
        lawsuitSel.innerHTML = '<option value="">Nenhum processo vinculado</option>' + (allLawsuits || []).map(l => `<option value="${l.id}" data-number="${l.lawsuit_number}">${l.lawsuit_number} - ${l.client_name || ''}</option>`).join('');
        return;
      }

      const clientLawsuits = (allLawsuits || []).filter(l => l.client_id === clientId);
      if (clientLawsuits.length > 0) {
        lawsuitSel.innerHTML = '<option value="">Selecione o processo...</option>' + clientLawsuits.map(l => `<option value="${l.id}" data-number="${l.lawsuit_number}">${l.lawsuit_number}</option>`).join('');
      } else {
        lawsuitSel.innerHTML = '<option value="">Nenhum processo cadastrado para este cliente</option>';
      }
    }

    // =========================================================================
    // 📢 CONTROLLER DE INTIMAÇÕES (COMUNICAAPI/DJEN) & CALCULADORA DE PRAZOS
    // =========================================================================
    let publicationsState = {
      publications: [],
      stats: { total: 0, unread: 0, deadline_launched: 0 },
      selectedLawyer: 'all',
      selectedTribunal: 'all',
      selectedStatus: 'nao_lido',
      searchTerm: '',
      activePublication: null,
      calculatedResult: null
    };

    async function initPublicationsTab() {
      await loadPublicationsLawyers();
      await loadPublications();
    }

    async function loadPublicationsLawyers() {
      try {
        const filterSel = document.getElementById('pub-filter-lawyer');
        const calcLawyerSel = document.getElementById('calc-input-lawyer');

        if (!calendarState.lawyers || calendarState.lawyers.length === 0) {
          const res = await fetch('/api/calendar/lawyers', { headers: getAuthHeaders() });
          const data = await res.json();
          if (res.ok && data.success) calendarState.lawyers = data.lawyers || [];
        }

        if (filterSel && calendarState.lawyers) {
          const currentVal = filterSel.value;
          filterSel.innerHTML = `
            <option value="all">🏢 Todos os Advogados</option>
            ${calendarState.lawyers.map(l => `<option value="${l.id}">${l.name} (${l.role})</option>`).join('')}
          `;
          if (currentVal) filterSel.value = currentVal;
        }

        if (calcLawyerSel && calendarState.lawyers) {
          calcLawyerSel.innerHTML = calendarState.lawyers.map(l => `<option value="${l.id}" data-name="${l.name}">${l.name} - ${l.role}</option>`).join('');
        }
      } catch (e) {}
    }

    async function loadPublications() {
      try {
        const { selectedLawyer, selectedTribunal, selectedStatus, searchTerm } = publicationsState;
        let url = `/api/court/publications?`;
        if (selectedStatus && selectedStatus !== 'all') url += `&status=${encodeURIComponent(selectedStatus)}`;
        if (selectedLawyer && selectedLawyer !== 'all') url += `&lawyer_id=${encodeURIComponent(selectedLawyer)}`;
        if (selectedTribunal && selectedTribunal !== 'all') url += `&tribunal=${encodeURIComponent(selectedTribunal)}`;
        if (searchTerm && searchTerm.trim()) url += `&search=${encodeURIComponent(searchTerm.trim())}`;

        const res = await fetch(url, { headers: getAuthHeaders() });
        const data = await res.json();

        if (res.ok && data.success) {
          publicationsState.publications = data.publications || [];
          publicationsState.stats = data.stats || { total: 0, unread: 0, deadline_launched: 0 };
          updatePublicationsStatsDisplay();
          renderPublicationsCards();
        }
      } catch (err) {
        console.error('Erro ao buscar publicações:', err);
      }
    }

    async function loadPublicationsStats() {
      try {
        const res = await fetch('/api/court/publications?status=nao_lido', { headers: getAuthHeaders() });
        const data = await res.json();
        if (res.ok && data.success) {
          const stats = data.stats || {};
          const badge = document.getElementById('tab-publications-count');
          if (badge) {
            badge.textContent = stats.unread || 0;
            if (stats.unread > 0) {
              badge.className = 'px-1.5 py-0.5 rounded-full bg-rose-100 text-rose-800 text-[10px] font-extrabold animate-pulse';
            } else {
              badge.className = 'px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-600 text-[10px] font-bold';
            }
          }
        }
      } catch (e) {}
    }

    function updatePublicationsStatsDisplay() {
      const statTotal = document.getElementById('pub-stat-total');
      const statUnread = document.getElementById('pub-stat-unread');
      const statLaunched = document.getElementById('pub-stat-launched');
      const badge = document.getElementById('tab-publications-count');

      if (statTotal) statTotal.textContent = publicationsState.stats.total || 0;
      if (statUnread) statUnread.textContent = publicationsState.stats.unread || 0;
      if (statLaunched) statLaunched.textContent = publicationsState.stats.deadline_launched || 0;

      if (badge) {
        badge.textContent = publicationsState.stats.unread || 0;
        if (publicationsState.stats.unread > 0) {
          badge.className = 'px-1.5 py-0.5 rounded-full bg-rose-100 text-rose-800 text-[10px] font-extrabold animate-pulse';
        } else {
          badge.className = 'px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-600 text-[10px] font-bold';
        }
      }
    }

    function renderPublicationsCards() {
      const container = document.getElementById('pub-cards-list');
      if (!container) return;

      if (publicationsState.publications.length === 0) {
        container.innerHTML = `
          <div class="py-16 text-center text-slate-400 space-y-3 bg-white rounded-3xl border border-slate-200 shadow-xs">
            <div class="text-4xl">📭</div>
            <h4 class="font-bold text-slate-700 text-sm">Nenhuma publicação encontrada para este filtro.</h4>
            <p class="text-xs text-slate-500 max-w-md mx-auto">Clique em "Sincronizar DJEN Agora" para consultar publicações no Diário de Justiça Eletrônico Nacional.</p>
          </div>
        `;
        return;
      }

      container.innerHTML = publicationsState.publications.map(pub => {
        const isUnread = pub.status === 'nao_lido';
        const isLaunched = pub.status === 'prazo_lancado';
        const dateFmt = pub.data_disponibilizacao ? pub.data_disponibilizacao.split('-').reverse().join('/') : '—';
        const cleanText = pub.texto ? pub.texto.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim() : 'Sem texto disponível.';

        return `
          <div class="bg-white rounded-3xl p-5 sm:p-6 shadow-xs border ${isUnread ? 'border-rose-300 ring-2 ring-rose-100' : 'border-slate-200'} transition-all hover:shadow-md space-y-4">
            <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 border-b border-slate-100 pb-3">
              <div class="flex flex-wrap items-center gap-2">
                <span class="px-2.5 py-0.5 rounded-full bg-rose-100 text-rose-900 font-extrabold text-[10px] uppercase tracking-wider">
                  ${pub.sigla_tribunal || 'TJMG'}
                </span>
                <span class="px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-800 font-bold text-[10px]">
                  ${pub.tipo_comunicacao || 'Intimação'}
                </span>
                ${isUnread ? '<span class="px-2.5 py-0.5 rounded-full bg-red-500 text-white font-extrabold text-[10px] animate-pulse">NOVA / NÃO LIDA</span>' : ''}
                ${isLaunched ? '<span class="px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-900 font-extrabold text-[10px]">✅ PRAZO NA AGENDA</span>' : ''}
              </div>

              <div class="text-xs font-mono text-slate-500 flex items-center space-x-1.5">
                <span>📅 DJe:</span>
                <strong class="text-slate-800 font-bold">${dateFmt}</strong>
              </div>
            </div>

            <div class="space-y-1.5">
              <div class="flex flex-wrap items-center justify-between gap-2">
                <h4 class="font-extrabold text-sm sm:text-base text-navy-950">${pub.nome_orgao || 'Vara / Órgão Julgador'}</h4>
                <span class="font-mono text-xs font-bold text-amber-800 bg-amber-50 px-2.5 py-1 rounded-lg border border-amber-200 select-all">
                  ⚖️ ${pub.numeroprocessocommascara || pub.numero_processo || 'Processo s/ número'}
                </span>
              </div>
              
              <div class="text-xs text-slate-500 flex flex-wrap items-center gap-3">
                <span>👤 Advogado: <strong class="text-slate-800 font-semibold">${pub.advogado_nome || 'Banca Geral'}</strong></span>
                <span>📌 OAB: <strong class="text-slate-700 font-mono">${pub.advogado_oab || '—'}</strong></span>
                ${pub.nome_classe ? `<span>📁 Classe: <strong class="text-slate-700">${pub.nome_classe}</strong></span>` : ''}
              </div>
            </div>

            <!-- Trecho do Texto da Intimação -->
            <div class="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 text-xs text-slate-700 font-serif leading-relaxed line-clamp-3 select-text">
              ${cleanText}
            </div>

            <!-- Botões de Ação do Card -->
            <div class="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-100">
              <div class="flex items-center space-x-2">
                <button 
                  onclick="openPublicationViewModal('${pub.id}')" 
                  type="button" 
                  class="px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs transition-colors flex items-center space-x-1.5 cursor-pointer"
                >
                  <span>📄</span>
                  <span>Ver Inteiro Teor</span>
                </button>

                <button 
                  onclick="togglePublicationStatus('${pub.id}', '${isUnread ? 'lido' : 'nao_lido'}')" 
                  type="button" 
                  class="px-3.5 py-2 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-600 font-semibold text-xs transition-colors cursor-pointer"
                >
                  ${isUnread ? '👁️ Marcar como Lido' : '🔴 Marcar Não Lido'}
                </button>
              </div>

              <button 
                onclick="calculateDeadlineToPublication('${pub.id}')" 
                type="button" 
                class="px-4 py-2 rounded-xl bg-gradient-to-r from-amber-600 to-rose-600 hover:from-amber-700 hover:to-rose-700 text-white font-extrabold text-xs shadow-sm hover:shadow-md transition-all flex items-center space-x-1.5 cursor-pointer"
              >
                <span>🧮</span>
                <span>Calcular Prazo com 1 Clique</span>
              </button>
            </div>
          </div>
        `;
      }).join('');
    }

    function handlePublicationFilterChange() {
      const searchInput = document.getElementById('pub-search-input');
      const lawyerSel = document.getElementById('pub-filter-lawyer');
      const tribunalSel = document.getElementById('pub-filter-tribunal');
      const statusSel = document.getElementById('pub-filter-status');

      if (searchInput) publicationsState.searchTerm = searchInput.value;
      if (lawyerSel) publicationsState.selectedLawyer = lawyerSel.value;
      if (tribunalSel) publicationsState.selectedTribunal = tribunalSel.value;
      if (statusSel) publicationsState.selectedStatus = statusSel.value;

      loadPublications();
    }

    async function syncPublicationsNow() {
      const btn = document.getElementById('pub-sync-btn');
      if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<span>⏳ Sincronizando DJEN...</span>';
      }

      try {
        const res = await fetch('/api/court/publications/sync', {
          method: 'POST',
          headers: getAuthHeaders()
        });
        const data = await res.json();

        if (res.ok && data.success) {
          alert(`🎉 ${data.message}`);
          await loadPublications();
          await loadPublicationsStats();
        } else {
          alert(`❌ ${data.error || 'Erro ao sincronizar com a ComunicaAPI.'}`);
        }
      } catch (e) {
        alert('Falha ao comunicar com o servidor para sincronização.');
      } finally {
        if (btn) {
          btn.disabled = false;
          btn.innerHTML = '<span>🔄</span><span>Sincronizar DJEN Agora</span>';
        }
      }
    }

    async function togglePublicationStatus(pubId, newStatus) {
      try {
        const res = await fetch(`/api/court/publications/${pubId}/status`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
          body: JSON.stringify({ status: newStatus })
        });
        if (res.ok) {
          await loadPublications();
          await loadPublicationsStats();
        }
      } catch (e) {}
    }

    function openPublicationViewModal(pubId) {
      const pub = publicationsState.publications.find(p => p.id === pubId);
      if (!pub) return;

      publicationsState.activePublication = pub;
      const modal = document.getElementById('modal-publication-view');

      document.getElementById('pub-view-tribunal-badge').textContent = pub.sigla_tribunal || 'TJMG';
      document.getElementById('pub-view-type-badge').textContent = pub.tipo_comunicacao || 'Intimação';
      document.getElementById('pub-view-status-badge').textContent = pub.status.toUpperCase();
      document.getElementById('pub-view-orgao').textContent = pub.nome_orgao || 'Órgão Julgador';
      document.getElementById('pub-view-advogado').textContent = `Destinatário: ${pub.advogado_nome} (${pub.advogado_oab || ''})`;
      document.getElementById('pub-view-processo').textContent = pub.numeroprocessocommascara || pub.numero_processo || '—';
      document.getElementById('pub-view-data').textContent = pub.data_disponibilizacao ? pub.data_disponibilizacao.split('-').reverse().join('/') : '—';
      
      const cleanText = pub.texto ? pub.texto.replace(/<br\s*[\/]?>/gi, '\n').replace(/<[^>]*>/g, ' ') : '';
      document.getElementById('pub-view-texto').textContent = cleanText;

      const toggleBtn = document.getElementById('pub-view-toggle-read-btn');
      if (toggleBtn) {
        toggleBtn.textContent = pub.status === 'nao_lido' ? '👁️ Marcar como Lido' : '🔴 Marcar Não Lido';
      }

      if (modal) modal.classList.remove('hidden');
    }

    function closePublicationViewModal() {
      const modal = document.getElementById('modal-publication-view');
      if (modal) modal.classList.add('hidden');
      publicationsState.activePublication = null;
    }

    async function toggleCurrentPublicationReadStatus() {
      if (!publicationsState.activePublication) return;
      const pub = publicationsState.activePublication;
      const nextStatus = pub.status === 'nao_lido' ? 'lido' : 'nao_lido';
      await togglePublicationStatus(pub.id, nextStatus);
      closePublicationViewModal();
    }

    function calculateDeadlineToCurrentPublication() {
      if (!publicationsState.activePublication) return;
      const pub = publicationsState.activePublication;
      closePublicationViewModal();
      calculateDeadlineToPublication(pub.id);
    }

    function calculateDeadlineToPublication(pubId) {
      const pub = publicationsState.publications.find(p => p.id === pubId);
      if (!pub) return;

      openDeadlineCalculator({
        publication_id: pub.id,
        start_date: pub.data_disponibilizacao,
        lawsuit_number: pub.numeroprocessocommascara || pub.numero_processo,
        lawyer_id: pub.lawyer_id,
        lawyer_name: pub.advogado_nome,
        title: `Prazo Fatal: Intimação ${pub.sigla_tribunal} (${pub.nome_orgao || ''})`
      });
    }

    function openDeadlineCalculator(params = {}) {
      const modal = document.getElementById('modal-deadline-calculator');
      loadPublicationsLawyers();

      const pad = (n) => String(n).padStart(2, '0');
      const now = new Date();
      const defaultDate = params.start_date || `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;

      document.getElementById('calc-input-start-date').value = defaultDate;
      document.getElementById('calc-input-regime').value = params.regime || 'cpc';
      document.getElementById('calc-input-preset').value = params.days || '15';
      
      const lawyerSel = document.getElementById('calc-input-lawyer');
      if (lawyerSel && params.lawyer_id) lawyerSel.value = params.lawyer_id;

      document.getElementById('calc-input-lawsuit-number').value = params.lawsuit_number || '';
      document.getElementById('calc-input-client-name').value = params.client_name || '';
      document.getElementById('calc-input-title').value = params.title || 'Prazo Fatal: Apelação Cível';

      document.getElementById('modal-deadline-calculator').setAttribute('data-pub-id', params.publication_id || '');

      handlePresetChange();
      handleCalculateDeadline();

      if (modal) modal.classList.remove('hidden');
    }

    function closeDeadlineCalculator() {
      const modal = document.getElementById('modal-deadline-calculator');
      if (modal) modal.classList.add('hidden');
    }

    function handlePresetChange() {
      const preset = document.getElementById('calc-input-preset').value;
      const customBox = document.getElementById('calc-custom-days-box');
      if (preset === 'custom') {
        customBox.classList.remove('hidden');
      } else {
        customBox.classList.add('hidden');
      }
      handleCalculateDeadline();
    }

    async function handleCalculateDeadline() {
      const startDate = document.getElementById('calc-input-start-date').value;
      if (!startDate) return;

      const regime = document.getElementById('calc-input-regime').value;
      const preset = document.getElementById('calc-input-preset').value;
      const days = preset === 'custom' ? Number(document.getElementById('calc-input-custom-days').value) || 15 : Number(preset);

      try {
        const res = await fetch('/api/court/deadline/calculate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
          body: JSON.stringify({ start_date: startDate, days, regime })
        });
        const data = await res.json();

        if (res.ok && data.success) {
          publicationsState.calculatedResult = data;
          
          const fatalSplit = data.data_fatal.split('-');
          const fatalDateObj = new Date(Number(fatalSplit[0]), Number(fatalSplit[1]) - 1, Number(fatalSplit[2]));
          const weekdays = ['Domingo', 'Segunda-Feira', 'Terça-Feira', 'Quarta-Feira', 'Quinta-Feira', 'Sexta-Feira', 'Sábado'];
          const fatalWeekday = weekdays[fatalDateObj.getDay()];

          document.getElementById('calc-result-fatal-date').textContent = data.data_fatal.split('-').reverse().join('/');
          document.getElementById('calc-result-fatal-weekday').textContent = `${fatalWeekday} • Término às 23:59h`;
          
          document.getElementById('calc-result-d0').textContent = data.data_disponibilizacao.split('-').reverse().join('/');
          document.getElementById('calc-result-d1').textContent = data.data_publicacao.split('-').reverse().join('/');
          document.getElementById('calc-result-d2').textContent = data.data_inicio_prazo.split('-').reverse().join('/');
          document.getElementById('calc-result-days-summary').textContent = `${data.prazo_dias} Dias ${data.tipo_dias} (${data.total_dias_corridos} dias corridos totais)`;

          const holidaysList = document.getElementById('calc-holidays-list');
          if (holidaysList) {
            if (data.feriados_compensados && data.feriados_compensados.length > 0) {
              holidaysList.innerHTML = data.feriados_compensados.map(f => `
                <div class="flex items-center justify-between">
                  <span class="font-mono font-bold">${f.date.split('-').reverse().join('/')}:</span>
                  <span class="font-semibold text-slate-700">${f.reason}</span>
                </div>
              `).join('');
            } else {
              holidaysList.innerHTML = '<span class="text-slate-400">Nenhum feriado interveniente (somente dias úteis normais).</span>';
            }
          }
        }
      } catch (err) {
        console.error('Erro ao calcular prazo:', err);
      }
    }

    async function launchCalculatedDeadlineToCalendar() {
      if (!publicationsState.calculatedResult) {
        alert('Realize o cálculo antes de lançar na agenda.');
        return;
      }

      const modalEl = document.getElementById('modal-deadline-calculator');
      const publicationId = modalEl ? modalEl.getAttribute('data-pub-id') : null;

      const lawyerSel = document.getElementById('calc-input-lawyer');
      const lawyerOpt = lawyerSel.options[lawyerSel.selectedIndex];

      const payload = {
        publication_id: publicationId,
        title: document.getElementById('calc-input-title').value.trim(),
        description: `Prazo Fatal calculado de ${publicationsState.calculatedResult.prazo_dias} dias úteis (${publicationsState.calculatedResult.regime}). Início: ${publicationsState.calculatedResult.data_inicio_prazo.split('-').reverse().join('/')}.`,
        lawyer_id: lawyerSel ? lawyerSel.value : 'dr-jorge-alvim',
        lawyer_name: lawyerOpt ? (lawyerOpt.getAttribute('data-name') || lawyerOpt.textContent.split(' - ')[0]) : 'Dr. Jorge Alvim',
        client_name: document.getElementById('calc-input-client-name').value.trim(),
        lawsuit_number: document.getElementById('calc-input-lawsuit-number').value.trim(),
        deadline_date: publicationsState.calculatedResult.data_fatal,
        regime: publicationsState.calculatedResult.regime,
        days_count: publicationsState.calculatedResult.prazo_dias
      };

      const btn = document.getElementById('calc-launch-btn');
      if (btn) btn.disabled = true;

      try {
        const res = await fetch('/api/court/deadline/launch-to-calendar', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
          body: JSON.stringify(payload)
        });
        const data = await res.json();

        if (res.ok && data.success) {
          alert(`🎉 ${data.message}\n\nO prazo fatal foi lançado com sucesso na pauta do advogado e na agenda do escritório!`);
          closeDeadlineCalculator();
          if (publicationsState.publications.length > 0) loadPublications();
          loadCalendarEvents();
          loadCalendarSummary();
          loadPublicationsStats();
        } else {
          alert(`❌ ${data.error || 'Erro ao lançar prazo na agenda.'}`);
        }
      } catch (err) {
        alert('Falha ao comunicar com o servidor.');
      } finally {
        if (btn) btn.disabled = false;
      }
    }

    function copyDeadlineCalculation() {
      if (!publicationsState.calculatedResult) return;
      const res = publicationsState.calculatedResult;
      const title = document.getElementById('calc-input-title').value;
      const lawsuitNum = document.getElementById('calc-input-lawsuit-number').value;

      let text = `📅 MEMÓRIA DE CÁLCULO DE PRAZO PROCESSUAL\n`;
      text += `Assunto: ${title}\n`;
      if (lawsuitNum) text += `Processo CNJ: ${lawsuitNum}\n`;
      text += `Regime: ${res.regime} (${res.prazo_dias} Dias ${res.tipo_dias})\n\n`;
      text += `• D0 (Disponibilização DJe): ${res.data_disponibilizacao.split('-').reverse().join('/')}\n`;
      text += `• D1 (Publicação Oficial): ${res.data_publicacao.split('-').reverse().join('/')}\n`;
      text += `• D2 (Início da Contagem): ${res.data_inicio_prazo.split('-').reverse().join('/')}\n`;
      text += `🚨 DATA FATAL (VENCIMENTO): ${res.data_fatal.split('-').reverse().join('/')} às 23:59h\n\n`;
      if (res.feriados_compensados && res.feriados_compensados.length > 0) {
        text += `Feriados e Fins de Semana Compensados:\n`;
        res.feriados_compensados.forEach(f => {
          text += ` - ${f.date.split('-').reverse().join('/')}: ${f.reason}\n`;
        });
      }
      text += `\nGerado por: Jorge Alvim Advocacia & Tecnologia`;

      navigator.clipboard.writeText(text).then(() => {
        alert('📋 Memória de cálculo copiada para a área de transferência!');
      });
    }

    // =============================================================================
    // 👥 MÓDULO DE GESTÃO DE PESSOAL (RH / DP) - CLT E ART. 7º DA CF/88
    // =============================================================================

    const hrState = {
      employees: [],
      timeClock: [],
      payroll: [],
      vacations: [],
      thirteenth: [],
      exams: [],
      contracts: [],
      benefits: [],
      activeSubTab: 'employees',
      selectedEmployeeId: null,
      currentPayslip: null
    };

    function formatBRL(val) {
      const num = Number(val) || 0;
      return num.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    }

    function formatDateBR(dateStr) {
      if (!dateStr) return '-';
      const parts = dateStr.split('-');
      if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
      return dateStr;
    }

    function closeHrModal(modalId) {
      const el = document.getElementById(modalId);
      if (el) el.classList.add('hidden');
    }

    async function initHrTab() {
      await loadHrDashboard();
      await loadHrEmployees();
      switchHrSubTab('employees');
    }

    async function loadHrDashboard() {
      try {
        const res = await fetch('/api/hr/dashboard', { headers: getAuthHeaders() });
        if (res.ok) {
          const data = await res.json();
          const d = data.dashboard || {};
          
          const totalEmpEl = document.getElementById('hr-stat-total-emp');
          const netPayEl = document.getElementById('hr-stat-net-payroll');
          const grossPayEl = document.getElementById('hr-stat-gross-payroll');
          const tabCountEl = document.getElementById('tab-hr-count');

          if (totalEmpEl) totalEmpEl.textContent = d.total_employees || 0;
          if (tabCountEl) tabCountEl.textContent = `${d.total_employees || 0} CLT`;
          if (netPayEl) netPayEl.textContent = formatBRL(d.total_net_payroll || 0);
          if (grossPayEl) grossPayEl.textContent = formatBRL(d.total_gross_payroll || 0);
        }
      } catch (err) {
        console.error('Erro ao carregar dashboard de RH:', err);
      }
    }

    function switchHrSubTab(subTab) {
      hrState.activeSubTab = subTab;
      
      const subTabs = ['employees', 'time', 'payroll', 'vacations', 'thirteenth', 'exams', 'contracts', 'benefits', 'annual-office', 'annual-employee', 'termination'];
      
      subTabs.forEach(tab => {
        const pane = document.getElementById(`hr-pane-${tab}`);
        const btn = document.getElementById(`hr-subtab-btn-${tab}`);
        if (pane) pane.classList.add('hidden');
        if (btn) {
          btn.className = "px-3.5 py-2 rounded-xl text-xs font-bold transition-all bg-slate-100 text-slate-700 hover:bg-slate-200 border border-slate-200 flex items-center space-x-1.5 cursor-pointer";
        }
      });

      const activePane = document.getElementById(`hr-pane-${subTab}`);
      const activeBtn = document.getElementById(`hr-subtab-btn-${subTab}`);
      
      if (activePane) activePane.classList.remove('hidden');
      if (activeBtn) {
        activeBtn.className = "px-3.5 py-2 rounded-xl text-xs font-bold transition-all bg-teal-50 text-teal-900 border border-teal-300 shadow-sm flex items-center space-x-1.5 cursor-pointer";
      }

      if (subTab === 'employees') loadHrEmployees();
      else if (subTab === 'time') loadHrTimeClock();
      else if (subTab === 'payroll') loadHrPayroll();
      else if (subTab === 'vacations') loadHrVacations();
      else if (subTab === 'thirteenth') loadHrThirteenth();
      else if (subTab === 'exams') loadHrExams();
      else if (subTab === 'contracts') loadHrContracts();
      else if (subTab === 'benefits') loadHrBenefits();
      else if (subTab === 'annual-office') loadHrAnnualOfficeReport(document.getElementById('hr-annual-office-year')?.value || 2026);
      else if (subTab === 'annual-employee') {
        const empSelect = document.getElementById('hr-annual-emp-select');
        const targetId = hrState.selectedAnnualEmployeeId || empSelect?.value || hrState.employees?.[0]?.id;
        if (empSelect && targetId) empSelect.value = targetId;
        loadHrAnnualEmployeeReport(targetId, document.getElementById('hr-annual-emp-year')?.value || 2026);
      } else if (subTab === 'termination') {
        loadLaborTerminations();
      }
    }

    // 1. QUADRO DE COLABORADORES
    async function loadHrEmployees() {
      try {
        const res = await fetch('/api/hr/employees', { headers: getAuthHeaders() });
        if (!res.ok) return;
        const data = await res.json();
        hrState.employees = data.employees || [];

        // Preenche selects de colaboradores nos modais e filtros
        populateEmployeeSelects(hrState.employees);

        // Filtra por texto e regime
        const search = (document.getElementById('hr-search-emp')?.value || '').toLowerCase();
        const regimeFilter = document.getElementById('hr-filter-contract')?.value || 'all';

        const filtered = hrState.employees.filter(emp => {
          const matchQuery = (emp.full_name || '').toLowerCase().includes(search) ||
                             (emp.position || '').toLowerCase().includes(search) ||
                             (emp.cpf || '').includes(search);
          const matchRegime = regimeFilter === 'all' || emp.contract_type === regimeFilter;
          return matchQuery && matchRegime;
        });

        renderHrEmployeesGrid(filtered);
      } catch (err) {
        console.error('Erro ao carregar colaboradores:', err);
      }
    }

    function populateEmployeeSelects(employees) {
      const selects = [
        document.getElementById('hr-time-select-emp'),
        document.getElementById('hr-punch-emp-id'),
        document.getElementById('hr-vac-emp-id'),
        document.getElementById('hr-exam-emp-id'),
        document.getElementById('hr-annual-emp-select')
      ];

      selects.forEach(sel => {
        if (!sel) return;
        const currentVal = sel.value;
        sel.innerHTML = '';
        employees.forEach(emp => {
          const opt = document.createElement('option');
          opt.value = emp.id;
          opt.textContent = `${emp.full_name} (${emp.position} - ${emp.contract_type})`;
          sel.appendChild(opt);
        });
        if (currentVal) sel.value = currentVal;
      });
    }

    function renderHrEmployeesGrid(employees) {
      const container = document.getElementById('hr-employees-grid');
      if (!container) return;

      if (employees.length === 0) {
        container.innerHTML = `
          <div class="col-span-full bg-white p-10 rounded-3xl border border-slate-200 text-center space-y-2">
            <div class="text-3xl">👥</div>
            <p class="text-slate-500 text-sm font-medium">Nenhum colaborador encontrado com os filtros selecionados.</p>
          </div>
        `;
        return;
      }

      container.innerHTML = employees.map(emp => {
        const regimeBadge = emp.contract_type === 'CLT' 
          ? '<span class="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-extrabold">CLT (Consolidado)</span>'
          : emp.contract_type === 'ESTAGIO'
          ? '<span class="px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-800 text-[10px] font-extrabold">Estágio (Lei 11.788)</span>'
          : '<span class="px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 text-[10px] font-extrabold">Adv. Associado (OAB)</span>';

        return `
          <div class="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm hover:shadow-md transition-all flex flex-col justify-between space-y-4">
            <div class="space-y-3">
              <div class="flex justify-between items-start">
                <div class="flex items-center space-x-3">
                  <div class="w-11 h-11 rounded-2xl bg-teal-50 border border-teal-200 text-teal-800 font-black flex items-center justify-center text-sm shadow-sm">
                    ${emp.full_name.substring(0, 2).toUpperCase()}
                  </div>
                  <div>
                    <h4 class="font-bold text-sm text-navy-950">${emp.full_name}</h4>
                    <p class="text-xs text-slate-500 font-medium">${emp.position}</p>
                  </div>
                </div>
                <div>${regimeBadge}</div>
              </div>

              <!-- Detalhes Contratuais / CLT -->
              <div class="grid grid-cols-2 gap-2 p-3 rounded-2xl bg-slate-50 border border-slate-100 text-xs">
                <div>
                  <span class="block text-[10px] text-slate-400 font-bold uppercase">CPF / PIS:</span>
                  <span class="font-mono font-semibold text-slate-800 text-[11px]">${emp.cpf}</span>
                </div>
                <div>
                  <span class="block text-[10px] text-slate-400 font-bold uppercase">CTPS:</span>
                  <span class="font-mono font-semibold text-slate-800 text-[11px]">${emp.ctps_number || '-'}</span>
                </div>
                <div>
                  <span class="block text-[10px] text-slate-400 font-bold uppercase">Admissão:</span>
                  <span class="font-semibold text-slate-800">${formatDateBR(emp.admission_date)}</span>
                </div>
                <div>
                  <span class="block text-[10px] text-slate-400 font-bold uppercase">Salário Base:</span>
                  <span class="font-mono font-bold text-emerald-800">${formatBRL(emp.base_salary)}</span>
                </div>
              </div>

              <!-- Benefícios Fixos -->
              <div class="flex items-center justify-between text-[11px] text-slate-600 px-1">
                <span>🚌 VT: <strong>${formatBRL(emp.vt_daily_amount * 22)}/mês</strong></span>
                <span>🍽️ VA: <strong>${formatBRL(emp.va_monthly_amount)}/mês</strong></span>
                <span>👨‍👩‍👧 Dep.: <strong>${emp.dependents_count || 0}</strong></span>
              </div>
            </div>

            <!-- Botões de Ação do Colaborador -->
            <div class="flex items-center justify-between pt-3 border-t border-slate-100 gap-2">
              <button 
                onclick="openEditEmployeeModal('${emp.id}')" 
                class="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition-all flex items-center space-x-1 cursor-pointer"
              >
                <span>✏️</span>
                <span>Editar</span>
              </button>
              <div class="flex space-x-1.5">
                <button 
                  onclick="selectEmployeeForTime('${emp.id}')" 
                  class="px-3 py-1.5 rounded-xl bg-blue-50 hover:bg-blue-100 text-blue-800 text-xs font-bold transition-all flex items-center space-x-1 cursor-pointer"
                  title="Ver Cartão de Ponto"
                >
                  <span>⏱️ Ponto</span>
                </button>
                <button 
                  onclick="openEmployeeAnnualFinancial('${emp.id}')" 
                  class="px-3 py-1.5 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-900 text-xs font-bold transition-all flex items-center space-x-1 border border-amber-200 cursor-pointer"
                  title="Ver Ficha Financeira Anual"
                >
                  <span>📊 Ficha Anual</span>
                </button>
              </div>
            </div>
          </div>
        `;
      }).join('');
    }

    function openEmployeeAnnualFinancial(empId) {
      hrState.selectedAnnualEmployeeId = empId;
      switchHrSubTab('annual-employee');
    }

    function selectEmployeeForTime(empId) {
      const sel = document.getElementById('hr-time-select-emp');
      if (sel) sel.value = empId;
      switchHrSubTab('time');
    }

    function openNewEmployeeModal() {
      document.getElementById('hr-emp-modal-title').textContent = 'Cadastrar Novo Colaborador';
      document.getElementById('hr-emp-id').value = '';
      document.getElementById('hr-emp-name').value = '';
      document.getElementById('hr-emp-cpf').value = '';
      document.getElementById('hr-emp-birth').value = '';
      document.getElementById('hr-emp-rg').value = '';
      document.getElementById('hr-emp-contract-type').value = 'CLT';
      document.getElementById('hr-emp-position').value = '';
      document.getElementById('hr-emp-dept').value = 'Jurídico';
      document.getElementById('hr-emp-admission').value = new Date().toISOString().split('T')[0];
      document.getElementById('hr-emp-salary').value = '3500.00';
      document.getElementById('hr-emp-ctps').value = '';
      document.getElementById('hr-emp-pis').value = '';
      document.getElementById('hr-emp-dependents').value = '0';
      document.getElementById('hr-emp-vt-daily').value = '12.00';
      document.getElementById('hr-emp-va-monthly').value = '650.00';
      document.getElementById('hr-emp-bank').value = '';
      document.getElementById('hr-emp-status').value = 'Ativo';

      document.getElementById('hr-modal-employee').classList.remove('hidden');
    }

    function openEditEmployeeModal(empId) {
      const emp = hrState.employees.find(e => String(e.id) === String(empId));
      if (!emp) return;

      document.getElementById('hr-emp-modal-title').textContent = `Editar: ${emp.full_name}`;
      document.getElementById('hr-emp-id').value = emp.id;
      document.getElementById('hr-emp-name').value = emp.full_name || '';
      document.getElementById('hr-emp-cpf').value = emp.cpf || '';
      document.getElementById('hr-emp-birth').value = emp.birth_date || '';
      document.getElementById('hr-emp-rg').value = emp.rg || '';
      document.getElementById('hr-emp-contract-type').value = emp.contract_type || 'CLT';
      document.getElementById('hr-emp-position').value = emp.position || '';
      document.getElementById('hr-emp-dept').value = emp.department || 'Jurídico';
      document.getElementById('hr-emp-admission').value = emp.admission_date || '';
      document.getElementById('hr-emp-salary').value = emp.base_salary || '0.00';
      document.getElementById('hr-emp-ctps').value = emp.ctps_number || '';
      document.getElementById('hr-emp-pis').value = emp.pis_number || '';
      document.getElementById('hr-emp-dependents').value = emp.dependents_count || '0';
      document.getElementById('hr-emp-vt-daily').value = emp.vt_daily_amount || '0.00';
      document.getElementById('hr-emp-va-monthly').value = emp.va_monthly_amount || '0.00';
      document.getElementById('hr-emp-bank').value = emp.bank_account || '';
      document.getElementById('hr-emp-status').value = emp.status || 'Ativo';

      document.getElementById('hr-modal-employee').classList.remove('hidden');
    }

    async function handleSaveEmployee(event) {
      event.preventDefault();
      const payload = {
        id: document.getElementById('hr-emp-id').value || null,
        full_name: document.getElementById('hr-emp-name').value.trim(),
        cpf: document.getElementById('hr-emp-cpf').value.trim(),
        birth_date: document.getElementById('hr-emp-birth').value || null,
        rg: document.getElementById('hr-emp-rg').value.trim(),
        contract_type: document.getElementById('hr-emp-contract-type').value,
        position: document.getElementById('hr-emp-position').value.trim(),
        department: document.getElementById('hr-emp-dept').value.trim(),
        admission_date: document.getElementById('hr-emp-admission').value,
        base_salary: parseFloat(document.getElementById('hr-emp-salary').value) || 0,
        ctps_number: document.getElementById('hr-emp-ctps').value.trim(),
        pis_number: document.getElementById('hr-emp-pis').value.trim(),
        dependents_count: parseInt(document.getElementById('hr-emp-dependents').value) || 0,
        vt_daily_amount: parseFloat(document.getElementById('hr-emp-vt-daily').value) || 0,
        va_monthly_amount: parseFloat(document.getElementById('hr-emp-va-monthly').value) || 0,
        bank_account: document.getElementById('hr-emp-bank').value.trim(),
        status: document.getElementById('hr-emp-status').value
      };

      try {
        const res = await fetch('/api/hr/employees', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
          body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (res.ok && data.success) {
          alert('✅ Colaborador salvo com sucesso!');
          closeHrModal('hr-modal-employee');
          loadHrEmployees();
          loadHrDashboard();
        } else {
          alert(`❌ ${data.error || 'Erro ao salvar colaborador.'}`);
        }
      } catch (err) {
        alert('Falha ao comunicar com o servidor.');
      }
    }

    // 2. CARTÃO DE PONTO ELETRÔNICO (PORTARIA 671)
    async function loadHrTimeClock() {
      const empId = document.getElementById('hr-time-select-emp')?.value;
      const month = document.getElementById('hr-time-month')?.value || '2026-08';
      const tbody = document.getElementById('hr-time-clock-tbody');
      if (!tbody) return;

      if (!empId) {
        tbody.innerHTML = `<tr><td colspan="8" class="text-center py-6 text-slate-500">Selecione um colaborador para ver o espelho de ponto.</td></tr>`;
        return;
      }

      try {
        const res = await fetch(`/api/hr/time-clock?employee_id=${empId}&month=${month}`, { headers: getAuthHeaders() });
        if (!res.ok) return;
        const data = await res.json();
        hrState.timeClock = data.records || [];

        if (hrState.timeClock.length === 0) {
          tbody.innerHTML = `<tr><td colspan="8" class="text-center py-6 text-slate-500">Nenhum registro de ponto encontrado para ${month}.</td></tr>`;
          return;
        }

        tbody.innerHTML = hrState.timeClock.map(rec => {
          const isSigned = !!rec.employee_signature_hash;
          const signBadge = isSigned
            ? `<div class="flex items-center space-x-1 text-emerald-700 font-bold text-[10px]" title="Assinado por: ${rec.signed_by_name} em ${formatDateBR(rec.signed_at?.split('T')[0])} | Hash: ${rec.employee_signature_hash}">
                <span>🔒 Assinado SHA-256</span>
               </div>`
            : `<span class="text-amber-700 font-medium text-[10px]">⏳ Pendente</span>`;

          return `
            <tr class="hover:bg-slate-50 transition-colors">
              <td class="py-2.5 px-3 font-mono font-bold text-navy-950">${formatDateBR(rec.clock_date)}</td>
              <td class="py-2.5 px-3 font-mono">${rec.time_in_1 || '--:--'}</td>
              <td class="py-2.5 px-3 font-mono">${rec.time_out_1 || '--:--'}</td>
              <td class="py-2.5 px-3 font-mono">${rec.time_in_2 || '--:--'}</td>
              <td class="py-2.5 px-3 font-mono">${rec.time_out_2 || '--:--'}</td>
              <td class="py-2.5 px-3 font-mono font-bold text-slate-800">${rec.total_hours ? rec.total_hours + 'h' : '8h'}</td>
              <td class="py-2.5 px-3 font-mono text-emerald-700 font-bold">${rec.overtime_50 ? '+' + rec.overtime_50 + 'h' : '-'}</td>
              <td class="py-2.5 px-3">${signBadge}</td>
            </tr>
          `;
        }).join('');
      } catch (err) {
        console.error('Erro ao carregar ponto:', err);
      }
    }

    function openSignTimeClockModal() {
      const empSelect = document.getElementById('hr-time-select-emp');
      const empId = empSelect?.value;
      const empName = empSelect?.options[empSelect.selectedIndex]?.textContent || 'Colaborador';
      const month = document.getElementById('hr-time-month')?.value || '2026-08';

      document.getElementById('hr-sign-emp-id').value = empId;
      document.getElementById('hr-sign-emp-name').value = empName;
      document.getElementById('hr-sign-month').value = month;
      document.getElementById('hr-sign-month-display').value = month;
      document.getElementById('hr-sign-password').value = '';

      document.getElementById('hr-modal-time-sign').classList.remove('hidden');
    }

    async function handleConfirmSignTimeClock(event) {
      event.preventDefault();
      const empId = document.getElementById('hr-sign-emp-id').value;
      const month = document.getElementById('hr-sign-month').value;
      const password = document.getElementById('hr-sign-password').value;

      try {
        const res = await fetch('/api/hr/time-clock/sign', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
          body: JSON.stringify({
            employee_id: empId,
            month: month,
            password: password,
            signed_by_name: localStorage.getItem('ja_admin_user') || 'Jorge Alvim'
          })
        });
        const data = await res.json();
        if (res.ok && data.success) {
          alert(`🎉 CARTÃO DE PONTO ASSINADO COM SUCESSO!\n\nCarimbo Criptográfico: ${data.signature_hash}\nData/Hora: ${new Date().toLocaleString('pt-BR')}\nValidade jurídica: Portaria MTP nº 671/2021.`);
          closeHrModal('hr-modal-time-sign');
          loadHrTimeClock();
        } else {
          alert(`❌ ${data.error || 'Erro ao assinar espelho de ponto.'}`);
        }
      } catch (err) {
        alert('Falha ao comunicar com o servidor.');
      }
    }

    function openQuickPunchModal() {
      document.getElementById('hr-punch-date').value = new Date().toISOString().split('T')[0];
      document.getElementById('hr-punch-in1').value = '09:00';
      document.getElementById('hr-punch-out1').value = '12:00';
      document.getElementById('hr-punch-in2').value = '13:00';
      document.getElementById('hr-punch-out2').value = '18:00';
      document.getElementById('hr-punch-notes').value = 'Jornada regular';
      document.getElementById('hr-modal-time-punch').classList.remove('hidden');
    }

    async function handleSaveTimePunch(event) {
      event.preventDefault();
      const payload = {
        employee_id: document.getElementById('hr-punch-emp-id').value,
        clock_date: document.getElementById('hr-punch-date').value,
        time_in_1: document.getElementById('hr-punch-in1').value,
        time_out_1: document.getElementById('hr-punch-out1').value,
        time_in_2: document.getElementById('hr-punch-in2').value,
        time_out_2: document.getElementById('hr-punch-out2').value,
        notes: document.getElementById('hr-punch-notes').value
      };

      try {
        const res = await fetch('/api/hr/time-clock/punch', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
          body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (res.ok && data.success) {
          alert('⏱️ Registro de ponto gravado com sucesso!');
          closeHrModal('hr-modal-time-punch');
          loadHrTimeClock();
        } else {
          alert(`❌ ${data.error || 'Erro ao bater ponto.'}`);
        }
      } catch (err) {
        alert('Falha ao comunicar com o servidor.');
      }
    }

    // 3. FOLHA DE PAGAMENTO & CONTRACHEQUES (HOLERITES)
    async function loadHrPayroll() {
      const month = document.getElementById('hr-payroll-month')?.value || '2026-08';
      const tbody = document.getElementById('hr-payroll-tbody');
      if (!tbody) return;

      try {
        const res = await fetch(`/api/hr/payroll?month=${month}`, { headers: getAuthHeaders() });
        if (!res.ok) return;
        const data = await res.json();
        hrState.payroll = data.payrolls || [];

        if (hrState.payroll.length === 0) {
          tbody.innerHTML = `<tr><td colspan="9" class="text-center py-6 text-slate-500">Nenhuma folha fechada para ${month}. Clique em "Calcular e Fechar Folha".</td></tr>`;
          return;
        }

        tbody.innerHTML = hrState.payroll.map(p => `
          <tr class="hover:bg-slate-50 transition-colors">
            <td class="py-2.5 px-3 font-bold text-navy-950">
              ${p.full_name}
              <span class="block text-[10px] text-slate-500 font-normal">${p.position}</span>
            </td>
            <td class="py-2.5 px-3">
              <span class="px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 font-bold text-[10px]">${p.contract_type}</span>
            </td>
            <td class="py-2.5 px-3 font-mono font-bold">${formatBRL(p.base_salary)}</td>
            <td class="py-2.5 px-3 font-mono text-rose-700 font-semibold">-${formatBRL(p.inss_deduction)}</td>
            <td class="py-2.5 px-3 font-mono text-rose-700 font-semibold">-${formatBRL(p.irrf_deduction)}</td>
            <td class="py-2.5 px-3 font-mono text-rose-700 font-semibold">-${formatBRL(p.vt_deduction)}</td>
            <td class="py-2.5 px-3 font-mono font-extrabold text-emerald-800 text-sm">${formatBRL(p.net_salary)}</td>
            <td class="py-2.5 px-3 font-mono text-blue-900 font-semibold">${formatBRL(p.fgts_deposit)}</td>
            <td class="py-2.5 px-3 text-right">
              <button 
                onclick="openPayslipModal('${p.id}')" 
                class="px-3 py-1.5 rounded-xl bg-teal-50 hover:bg-teal-100 text-teal-800 font-bold text-xs shadow-sm transition-all flex items-center space-x-1 inline-flex"
                title="Ver Holerite Timbrado"
              >
                <span>📄 Holerite</span>
              </button>
            </td>
          </tr>
        `).join('');
      } catch (err) {
        console.error('Erro ao carregar folha:', err);
      }
    }

    async function handleCalculatePayroll() {
      const month = document.getElementById('hr-payroll-month')?.value || '2026-08';
      if (!confirm(`Deseja calcular e gerar a folha de pagamento oficial de ${month}?`)) return;

      try {
        const res = await fetch('/api/hr/payroll/calculate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
          body: JSON.stringify({ month: month })
        });
        const data = await res.json();
        if (res.ok && data.success) {
          alert(`🎉 Folha de ${month} calculada com sucesso para ${data.processed_count} colaboradores!`);
          loadHrPayroll();
          loadHrDashboard();
        } else {
          alert(`❌ ${data.error || 'Erro ao calcular folha.'}`);
        }
      } catch (err) {
        alert('Falha ao comunicar com o servidor.');
      }
    }

    function openPayslipModal(payrollId) {
      const item = hrState.payroll.find(p => String(p.id) === String(payrollId));
      if (!item) return;

      document.getElementById('payslip-ref-month').textContent = item.reference_month;
      document.getElementById('payslip-emp-name').textContent = item.full_name;
      document.getElementById('payslip-emp-role').textContent = item.position;
      document.getElementById('payslip-emp-docs').textContent = `${item.cpf} • CTPS: ${item.ctps_number || '-'}`;
      document.getElementById('payslip-emp-pis').textContent = `${item.pis_number || '-'} (${item.contract_type})`;
      document.getElementById('payslip-sign-name').textContent = item.full_name;

      const itemsBody = document.getElementById('payslip-items-tbody');
      itemsBody.innerHTML = `
        <tr>
          <td class="p-2 border-r border-slate-300">001</td>
          <td class="p-2 border-r border-slate-300 font-sans">Salário Base Mensal</td>
          <td class="p-2 border-r border-slate-300 text-center">30d</td>
          <td class="p-2 border-r border-slate-300 text-right text-emerald-800">${formatBRL(item.base_salary)}</td>
          <td class="p-2 text-right text-slate-400">-</td>
        </tr>
        <tr>
          <td class="p-2 border-r border-slate-300">101</td>
          <td class="p-2 border-r border-slate-300 font-sans">INSS (Previdência Social 2026)</td>
          <td class="p-2 border-r border-slate-300 text-center">Prog.</td>
          <td class="p-2 border-r border-slate-300 text-right text-slate-400">-</td>
          <td class="p-2 text-right text-rose-800">${formatBRL(item.inss_deduction)}</td>
        </tr>
        <tr>
          <td class="p-2 border-r border-slate-300">102</td>
          <td class="p-2 border-r border-slate-300 font-sans">IRRF (Receita Federal)</td>
          <td class="p-2 border-r border-slate-300 text-center">Prog.</td>
          <td class="p-2 border-r border-slate-300 text-right text-slate-400">-</td>
          <td class="p-2 text-right text-rose-800">${formatBRL(item.irrf_deduction)}</td>
        </tr>
        <tr>
          <td class="p-2 border-r border-slate-300">103</td>
          <td class="p-2 border-r border-slate-300 font-sans">Vale Transporte (Desc. Lei 7.418/85 6%)</td>
          <td class="p-2 border-r border-slate-300 text-center">6%</td>
          <td class="p-2 border-r border-slate-300 text-right text-slate-400">-</td>
          <td class="p-2 text-right text-rose-800">${formatBRL(item.vt_deduction)}</td>
        </tr>
      `;

      const totalDeductions = (item.inss_deduction || 0) + (item.irrf_deduction || 0) + (item.vt_deduction || 0);

      document.getElementById('payslip-total-gross').textContent = formatBRL(item.gross_salary || item.base_salary);
      document.getElementById('payslip-total-deductions').textContent = formatBRL(totalDeductions);
      document.getElementById('payslip-total-net').textContent = formatBRL(item.net_salary);

      document.getElementById('payslip-base-sal').textContent = formatBRL(item.base_salary);
      document.getElementById('payslip-base-inss').textContent = formatBRL(item.base_salary);
      document.getElementById('payslip-base-fgts').textContent = formatBRL(item.base_salary);
      document.getElementById('payslip-fgts-val').textContent = formatBRL(item.fgts_deposit);

      document.getElementById('payslip-pay-date').textContent = formatDateBR(item.payment_date || new Date().toISOString().split('T')[0]);
      document.getElementById('payslip-hash').textContent = `SHA-256 ${(item.id * 192837).toString(16).padStart(12, '0')}...`;

      document.getElementById('hr-modal-payslip').classList.remove('hidden');
    }

    function printCurrentPayslip() {
      window.print();
    }

    // 4. FÉRIAS & 1/3 CONSTITUCIONAL
    async function loadHrVacations() {
      const container = document.getElementById('hr-vacations-list');
      if (!container) return;

      try {
        const res = await fetch('/api/hr/vacations', { headers: getAuthHeaders() });
        if (!res.ok) return;
        const data = await res.json();
        hrState.vacations = data.vacations || [];

        if (hrState.vacations.length === 0) {
          container.innerHTML = `
            <div class="bg-white p-8 rounded-3xl border border-slate-200 text-center text-slate-500">
              Nenhuma programação de férias cadastrada.
            </div>
          `;
          return;
        }

        container.innerHTML = hrState.vacations.map(v => `
          <div class="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div class="space-y-1">
              <div class="flex items-center space-x-2">
                <h4 class="font-bold text-sm text-navy-950">${v.full_name}</h4>
                <span class="px-2 py-0.5 rounded-full bg-amber-100 text-amber-900 font-bold text-[10px]">${v.status}</span>
              </div>
              <p class="text-xs text-slate-500">
                Período: <strong>${formatDateBR(v.start_date)} até ${formatDateBR(v.end_date)}</strong> (${v.days_taken} dias de gozo)
              </p>
              <p class="text-[11px] text-slate-600">
                Salário Base: ${formatBRL(v.base_salary)} | <strong>+ 1/3 Constitucional: ${formatBRL(v.constitutional_third)}</strong>
              </p>
            </div>
            <div class="text-right flex items-center space-x-3">
              <div>
                <span class="block text-[10px] uppercase font-bold text-slate-400">Total Bruto de Férias:</span>
                <span class="font-mono font-extrabold text-emerald-800 text-base">${formatBRL(v.total_gross)}</span>
              </div>
            </div>
          </div>
        `).join('');
      } catch (err) {
        console.error('Erro ao carregar férias:', err);
      }
    }

    function openNewVacationModal() {
      const today = new Date().toISOString().split('T')[0];
      document.getElementById('hr-vac-start').value = today;
      document.getElementById('hr-vac-end').value = today;
      document.getElementById('hr-vac-days').value = '30';
      document.getElementById('hr-vac-abono').value = '0';
      calculateVacationPreview();
      document.getElementById('hr-modal-vacation-form').classList.remove('hidden');
    }

    function calculateVacationPreview() {
      const empId = document.getElementById('hr-vac-emp-id')?.value;
      const emp = hrState.employees.find(e => String(e.id) === String(empId)) || hrState.employees[0];
      if (!emp) return;

      const salary = emp.base_salary || 0;
      const third = salary / 3;
      const gross = salary + third;

      document.getElementById('vac-prev-base').textContent = formatBRL(salary);
      document.getElementById('vac-prev-third').textContent = formatBRL(third);
      document.getElementById('vac-prev-gross').textContent = formatBRL(gross);
    }

    async function handleSaveVacation(event) {
      event.preventDefault();
      const payload = {
        employee_id: document.getElementById('hr-vac-emp-id').value,
        acquisition_period_start: '2025-01-01',
        acquisition_period_end: '2025-12-31',
        concessive_limit_date: '2026-12-31',
        start_date: document.getElementById('hr-vac-start').value,
        end_date: document.getElementById('hr-vac-end').value,
        days_taken: parseInt(document.getElementById('hr-vac-days').value) || 30,
        abono_days: parseInt(document.getElementById('hr-vac-abono').value) || 0
      };

      try {
        const res = await fetch('/api/hr/vacations/calculate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
          body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (res.ok && data.success) {
          alert('🏖️ Férias e 1/3 Constitucional programados com sucesso!');
          closeHrModal('hr-modal-vacation-form');
          loadHrVacations();
        } else {
          alert(`❌ ${data.error || 'Erro ao programar férias.'}`);
        }
      } catch (err) {
        alert('Falha ao comunicar com o servidor.');
      }
    }

    // 5. DÉCIMO TERCEIRO SALÁRIO
    async function loadHrThirteenth() {
      const year = document.getElementById('hr-13th-year')?.value || '2026';
      const tbody = document.getElementById('hr-13th-tbody');
      if (!tbody) return;

      try {
        const res = await fetch(`/api/hr/thirteenth?year=${year}`, { headers: getAuthHeaders() });
        if (!res.ok) return;
        const data = await res.json();
        hrState.thirteenth = data.records || [];

        if (hrState.thirteenth.length === 0) {
          tbody.innerHTML = `<tr><td colspan="9" class="text-center py-6 text-slate-500">Nenhum registro de 13º Salário para o ano de ${year}.</td></tr>`;
          return;
        }

        tbody.innerHTML = hrState.thirteenth.map(rec => `
          <tr class="hover:bg-slate-50 transition-colors">
            <td class="py-2.5 px-3 font-bold text-navy-950">${rec.full_name}</td>
            <td class="py-2.5 px-3">
              <span class="px-2 py-0.5 rounded-full ${rec.installment === 1 ? 'bg-purple-100 text-purple-900' : 'bg-blue-100 text-blue-900'} font-bold text-[10px]">
                ${rec.installment}ª Parcela
              </span>
            </td>
            <td class="py-2.5 px-3 font-mono font-semibold">${rec.months_worked}/12 avos</td>
            <td class="py-2.5 px-3 font-mono font-bold">${formatBRL(rec.gross_amount)}</td>
            <td class="py-2.5 px-3 font-mono text-rose-700 font-semibold">-${formatBRL(rec.inss_deduction)}</td>
            <td class="py-2.5 px-3 font-mono text-rose-700 font-semibold">-${formatBRL(rec.irrf_deduction)}</td>
            <td class="py-2.5 px-3 font-mono font-extrabold text-emerald-800 text-sm">${formatBRL(rec.net_amount)}</td>
            <td class="py-2.5 px-3 font-semibold text-slate-700">${formatDateBR(rec.payment_date)}</td>
            <td class="py-2.5 px-3 text-right">
              <span class="text-emerald-700 font-bold text-xs">Pago / Quitado</span>
            </td>
          </tr>
        `).join('');
      } catch (err) {
        console.error('Erro ao carregar 13º:', err);
      }
    }

    // 6. ASO & EXAMES OCUPACIONAIS
    async function loadHrExams() {
      const tbody = document.getElementById('hr-exams-tbody');
      if (!tbody) return;

      try {
        const res = await fetch('/api/hr/exams', { headers: getAuthHeaders() });
        if (!res.ok) return;
        const data = await res.json();
        hrState.exams = data.exams || [];

        if (hrState.exams.length === 0) {
          tbody.innerHTML = `<tr><td colspan="7" class="text-center py-6 text-slate-500">Nenhum ASO registrado.</td></tr>`;
          return;
        }

        tbody.innerHTML = hrState.exams.map(e => `
          <tr class="hover:bg-slate-50 transition-colors">
            <td class="py-2.5 px-3 font-bold text-navy-950">
              ${e.full_name}
              <span class="block text-[10px] text-slate-500 font-normal">${e.position}</span>
            </td>
            <td class="py-2.5 px-3 font-semibold text-slate-800">${e.exam_type}</td>
            <td class="py-2.5 px-3 font-mono">${formatDateBR(e.exam_date)}</td>
            <td class="py-2.5 px-3 font-mono font-bold text-slate-800">${formatDateBR(e.valid_until)}</td>
            <td class="py-2.5 px-3 text-xs">${e.doctor_name || '-'}<br><span class="text-[10px] text-slate-500">${e.doctor_crm || ''}</span></td>
            <td class="py-2.5 px-3">
              <span class="px-2.5 py-0.5 rounded-full ${e.result === 'APTO' ? 'bg-emerald-100 text-emerald-900' : 'bg-rose-100 text-rose-900'} font-extrabold text-[10px]">
                ${e.result}
              </span>
            </td>
            <td class="py-2.5 px-3">
              <span class="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 text-[10px] font-bold">Válido</span>
            </td>
          </tr>
        `).join('');
      } catch (err) {
        console.error('Erro ao carregar exames:', err);
      }
    }

    function openNewExamModal() {
      const today = new Date().toISOString().split('T')[0];
      const nextYear = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

      document.getElementById('hr-exam-date').value = today;
      document.getElementById('hr-exam-validity').value = nextYear;
      document.getElementById('hr-exam-doc-name').value = 'Dra. Luiza Fernandes';
      document.getElementById('hr-exam-crm').value = 'CRM/MG 48.912';

      document.getElementById('hr-modal-exam-form').classList.remove('hidden');
    }

    async function handleSaveExam(event) {
      event.preventDefault();
      const payload = {
        employee_id: document.getElementById('hr-exam-emp-id').value,
        exam_type: document.getElementById('hr-exam-type').value,
        exam_date: document.getElementById('hr-exam-date').value,
        valid_until: document.getElementById('hr-exam-validity').value,
        result: document.getElementById('hr-exam-result').value,
        doctor_name: document.getElementById('hr-exam-doc-name').value.trim(),
        doctor_crm: document.getElementById('hr-exam-crm').value.trim(),
        clinic_name: document.getElementById('hr-exam-clinic').value.trim()
      };

      try {
        const res = await fetch('/api/hr/exams', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
          body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (res.ok && data.success) {
          alert('🩺 ASO gravado com sucesso no prontuário ocupacional!');
          closeHrModal('hr-modal-exam-form');
          loadHrExams();
        } else {
          alert(`❌ ${data.error || 'Erro ao gravar ASO.'}`);
        }
      } catch (err) {
        alert('Falha ao comunicar com o servidor.');
      }
    }

    // 7. CONTRATOS DE TRABALHO
    async function loadHrContracts() {
      const container = document.getElementById('hr-contracts-grid');
      if (!container) return;

      try {
        const res = await fetch('/api/hr/employees', { headers: getAuthHeaders() });
        if (!res.ok) return;
        const data = await res.json();
        const employees = data.employees || [];

        container.innerHTML = employees.map(emp => `
          <div class="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm space-y-3">
            <div class="flex justify-between items-start">
              <div>
                <h4 class="font-bold text-sm text-navy-950">${emp.full_name}</h4>
                <p class="text-xs text-slate-500">${emp.position} • ${emp.contract_type}</p>
              </div>
              <span class="px-2.5 py-0.5 rounded-full bg-indigo-100 text-indigo-900 font-extrabold text-[10px]">Vigente</span>
            </div>

            <div class="p-3 bg-slate-50 rounded-2xl border border-slate-100 text-xs space-y-1 text-slate-600">
              <p>• Data Início: <strong>${formatDateBR(emp.admission_date)}</strong></p>
              <p>• Regime Legal: <strong>${emp.contract_type === 'CLT' ? 'Art. 442 da CLT' : emp.contract_type === 'ESTAGIO' ? 'Lei 11.788/2008' : 'Estatuto da Advocacia OAB'}</strong></p>
              <p>• Salário / Remuneração: <strong>${formatBRL(emp.base_salary)}</strong></p>
              <p>• Jornada: <strong>${emp.contract_type === 'ESTAGIO' ? '30 horas semanais' : '44 horas semanais'}</strong></p>
            </div>

            <div class="pt-2 flex justify-end">
              <button 
                onclick="alert('📄 INSTRUMENTO CONTRATUAL:\\n\\nContratante: Jorge Alvim Sociedade Individual de Advocacia\\nContratado: ${emp.full_name}\\nCargo: ${emp.position}\\nRemuneração: ${formatBRL(emp.base_salary)}\\n\\nContrato arquivado digitalmente na pasta do colaborador no Drive do Escritório.')" 
                class="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs transition-all flex items-center space-x-1"
              >
                <span>📜 Visualizar Minuta</span>
              </button>
            </div>
          </div>
        `).join('');
      } catch (err) {
        console.error('Erro ao carregar contratos:', err);
      }
    }

    // 8. BENEFÍCIOS (VT & ALIMENTAÇÃO)
    async function loadHrBenefits() {
      const container = document.getElementById('hr-benefits-summary-container');
      if (!container) return;

      try {
        const res = await fetch('/api/hr/benefits', { headers: getAuthHeaders() });
        if (!res.ok) return;
        const data = await res.json();
        const b = data.benefits || {};

        container.innerHTML = `
          <!-- Cards de Resumo de Benefícios -->
          <div class="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
            <div class="p-4 rounded-2xl bg-blue-50/60 border border-blue-200 space-y-1">
              <span class="text-[10px] font-bold uppercase text-blue-700 block">Custo Total Vale Transporte</span>
              <p class="text-xl font-black text-blue-950 font-mono">${formatBRL(b.total_vt_cost || 0)}</p>
              <p class="text-[11px] text-blue-700">Desconto Empregados (máx 6%): ${formatBRL(b.total_vt_employee_discount || 0)}</p>
            </div>

            <div class="p-4 rounded-2xl bg-emerald-50/60 border border-emerald-200 space-y-1">
              <span class="text-[10px] font-bold uppercase text-emerald-700 block">Custeio Patronal de VT (Escritório)</span>
              <p class="text-xl font-black text-emerald-950 font-mono">${formatBRL(b.total_vt_employer_share || 0)}</p>
              <p class="text-[11px] text-emerald-700">Subvenção legal conforme Lei 7.418/85</p>
            </div>

            <div class="p-4 rounded-2xl bg-amber-50/60 border border-amber-200 space-y-1">
              <span class="text-[10px] font-bold uppercase text-amber-700 block">Total Auxílio Alimentação (VA)</span>
              <p class="text-xl font-black text-amber-950 font-mono">${formatBRL(b.total_va_amount || 0)}</p>
              <p class="text-[11px] text-amber-700">Programa de Alimentação do Trabalhador (PAT)</p>
            </div>
          </div>

          <!-- Tabela de Benefícios por Colaborador -->
          <div class="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm space-y-3">
            <h4 class="font-bold text-sm text-navy-950">Demonstrativo Individual de Benefícios</h4>
            <div class="overflow-x-auto">
              <table class="w-full text-left text-xs">
                <thead>
                  <tr class="bg-slate-50 text-slate-600 font-bold border-b border-slate-200">
                    <th class="py-2.5 px-3">Colaborador</th>
                    <th class="py-2.5 px-3">Cargo</th>
                    <th class="py-2.5 px-3">VT Diário</th>
                    <th class="py-2.5 px-3">Custo Mensal VT</th>
                    <th class="py-2.5 px-3">Desconto Folha (6%)</th>
                    <th class="py-2.5 px-3">Custeio Escritório</th>
                    <th class="py-2.5 px-3">Auxílio Alimentação (VA)</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-slate-100">
                  ${(b.employees_breakdown || []).map(emp => `
                    <tr class="hover:bg-slate-50 transition-colors">
                      <td class="py-2.5 px-3 font-bold text-navy-950">${emp.full_name}</td>
                      <td class="py-2.5 px-3 text-slate-600">${emp.position}</td>
                      <td class="py-2.5 px-3 font-mono">${formatBRL(emp.vt_daily)}</td>
                      <td class="py-2.5 px-3 font-mono font-bold">${formatBRL(emp.vt_monthly_total)}</td>
                      <td class="py-2.5 px-3 font-mono text-rose-700">-${formatBRL(emp.vt_employee_discount)}</td>
                      <td class="py-2.5 px-3 font-mono text-blue-900 font-bold">${formatBRL(emp.vt_employer_cost)}</td>
                      <td class="py-2.5 px-3 font-mono text-emerald-800 font-bold">${formatBRL(emp.va_monthly)}</td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>
          </div>
        `;
      } catch (err) {
        console.error('Erro ao carregar benefícios:', err);
      }
    }

    // 9. FICHA FINANCEIRA GERAL CONSOLIDADA DO ESCRITÓRIO
    async function loadHrAnnualOfficeReport(year = 2026) {
      try {
        const res = await fetch(`/api/hr/reports/annual-financial/office?year=${year}`, { headers: getAuthHeaders() });
        if (!res.ok) return;
        const data = await res.json();
        const s = data.summary || {};
        const employees = data.employees || [];

        // 1. Cards de Resumo Anual
        const cardsContainer = document.getElementById('hr-annual-office-cards');
        if (cardsContainer) {
          cardsContainer.innerHTML = `
            <div class="p-4 rounded-2xl bg-amber-50/70 border border-amber-200 space-y-1">
              <span class="text-[10px] font-bold uppercase text-amber-800 block">Folha Bruta Total do Ano</span>
              <p class="text-xl font-black text-amber-950 font-mono">${formatBRL(s.total_annual_gross || 0)}</p>
              <p class="text-[11px] text-amber-700">${s.total_active_employees} colaboradores (${s.clt_employees} CLT)</p>
            </div>

            <div class="p-4 rounded-2xl bg-rose-50/70 border border-rose-200 space-y-1">
              <span class="text-[10px] font-bold uppercase text-rose-800 block">Retenções Tributárias (INSS + IRRF)</span>
              <p class="text-xl font-black text-rose-950 font-mono">${formatBRL((s.total_annual_inss_collected || 0) + (s.total_annual_irrf_withheld || 0))}</p>
              <p class="text-[11px] text-rose-700">INSS: ${formatBRL(s.total_annual_inss_collected || 0)} | IRRF: ${formatBRL(s.total_annual_irrf_withheld || 0)}</p>
            </div>

            <div class="p-4 rounded-2xl bg-emerald-50/70 border border-emerald-200 space-y-1">
              <span class="text-[10px] font-bold uppercase text-emerald-800 block">Líquido Anual Pago à Equipe</span>
              <p class="text-xl font-black text-emerald-950 font-mono">${formatBRL(s.total_annual_net_salaries_paid || 0)}</p>
              <p class="text-[11px] text-emerald-700">Total creditado via PIX/Bancário</p>
            </div>

            <div class="p-4 rounded-2xl bg-indigo-50/70 border border-indigo-200 space-y-1">
              <span class="text-[10px] font-bold uppercase text-indigo-800 block">Custo Global Anual de Pessoal</span>
              <p class="text-xl font-black text-indigo-950 font-mono">${formatBRL(s.total_annual_personnel_global_cost || 0)}</p>
              <p class="text-[11px] text-indigo-700">Bruto + FGTS + VT Custeio + VA (PAT)</p>
            </div>
          `;
        }

        // 2. Tabela de Colaboradores no Ano
        const tbody = document.getElementById('hr-annual-office-tbody');
        if (tbody) {
          tbody.innerHTML = employees.map(e => `
            <tr class="hover:bg-slate-50 transition-colors">
              <td class="py-2.5 px-3 font-sans font-bold text-navy-950">
                ${e.name}
                <span class="block text-[10px] text-slate-400 font-normal font-sans">${e.position} • ${e.department}</span>
              </td>
              <td class="py-2.5 px-2 text-center">
                <span class="px-2 py-0.5 rounded text-[10px] font-bold ${e.contract_type === 'CLT' ? 'bg-emerald-100 text-emerald-800' : (e.contract_type === 'ESTAGIO' ? 'bg-indigo-100 text-indigo-800' : 'bg-amber-100 text-amber-800')}">
                  ${e.contract_type}
                </span>
              </td>
              <td class="py-2.5 px-3 text-right font-bold text-navy-950">${formatBRL(e.annual_gross)}</td>
              <td class="py-2.5 px-3 text-right text-rose-600">-${formatBRL(e.annual_inss_retained)}</td>
              <td class="py-2.5 px-3 text-right text-amber-600">-${formatBRL(e.annual_irrf_retained)}</td>
              <td class="py-2.5 px-3 text-right text-sky-600">-${formatBRL(e.annual_vt_discount)}</td>
              <td class="py-2.5 px-3 text-right font-bold text-emerald-700">${formatBRL(e.annual_net_paid)}</td>
              <td class="py-2.5 px-3 text-right text-slate-600">${formatBRL(e.annual_fgts_provision)}</td>
              <td class="py-2.5 px-3 text-right text-purple-700">${formatBRL(e.annual_vt_office_subsidy + e.annual_va_cost)}</td>
              <td class="py-2.5 px-3 text-right font-bold text-indigo-900">${formatBRL(e.annual_global_cost)}</td>
            </tr>
          `).join('');
        }

        // 3. Rodapé da Tabela com Totais
        const tfoot = document.getElementById('hr-annual-office-tfoot');
        if (tfoot) {
          tfoot.innerHTML = `
            <tr>
              <td class="py-3 px-3 font-sans uppercase">TOTAIS CONSOLIDADOS DO ESCRITÓRIO</td>
              <td class="py-3 px-2 text-center font-sans">${s.total_active_employees} Colab.</td>
              <td class="py-3 px-3 text-right text-navy-950">${formatBRL(s.total_annual_gross)}</td>
              <td class="py-3 px-3 text-right text-rose-700">-${formatBRL(s.total_annual_inss_collected)}</td>
              <td class="py-3 px-3 text-right text-amber-700">-${formatBRL(s.total_annual_irrf_withheld)}</td>
              <td class="py-3 px-3 text-right text-sky-700">-${formatBRL(s.total_annual_vt_employee_discount)}</td>
              <td class="py-3 px-3 text-right text-emerald-800 text-sm">${formatBRL(s.total_annual_net_salaries_paid)}</td>
              <td class="py-3 px-3 text-right text-blue-900">${formatBRL(s.total_annual_fgts_deposited)}</td>
              <td class="py-3 px-3 text-right text-purple-900">${formatBRL(s.total_annual_vt_employer_subsidy + s.total_annual_va_amount)}</td>
              <td class="py-3 px-3 text-right text-indigo-950 text-sm font-black">${formatBRL(s.total_annual_personnel_global_cost)}</td>
            </tr>
          `;
        }
      } catch (err) {
        console.error('Erro ao carregar Ficha Financeira Geral:', err);
      }
    }

    function printAnnualOfficeReport() {
      window.print();
    }

    // 10. FICHA FINANCEIRA ANUAL INDIVIDUAL
    async function loadHrAnnualEmployeeReport(employeeId, year = 2026) {
      if (!employeeId) return;
      const container = document.getElementById('hr-annual-emp-container');
      if (!container) return;

      try {
        const res = await fetch(`/api/hr/reports/annual-financial/employee/${employeeId}?year=${year}`, { headers: getAuthHeaders() });
        if (!res.ok) return;
        const data = await res.json();
        const emp = data.employee || {};
        const off = data.office_info || {};
        const totals = data.totals || {};
        const breakdown = data.monthly_breakdown || [];
        const thirteenth = data.thirteenth_items || [];

        container.innerHTML = `
          <div class="border border-slate-200 rounded-3xl p-6 sm:p-8 bg-white space-y-6">
            
            <!-- Cabeçalho Timbrado -->
            <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 pb-6 border-b-2 border-slate-200">
              <div class="flex items-center space-x-3">
                <div class="w-12 h-12 bg-navy-900 text-gold-400 rounded-xl flex items-center justify-center font-serif font-bold text-xl border border-gold-500/40">
                  JA
                </div>
                <div>
                  <h3 class="font-serif font-bold text-lg text-navy-950">${off.name}</h3>
                  <p class="text-xs text-slate-600 font-medium">${off.company_type} • ${off.oab_register} • CNPJ ${off.cnpj}</p>
                  <p class="text-[11px] text-slate-400">${off.address}</p>
                </div>
              </div>

              <div class="text-right">
                <span class="inline-block px-3 py-1 bg-teal-50 border border-teal-200 rounded-full text-xs font-bold text-teal-900 uppercase tracking-wider mb-1">
                  Ficha Financeira Anual • ${year}
                </span>
                <p class="text-[11px] text-slate-400 font-mono">Emissão: ${new Date().toLocaleDateString('pt-BR')}</p>
              </div>
            </div>

            <!-- Dados do Colaborador -->
            <div class="grid grid-cols-2 sm:grid-cols-4 gap-4 p-4 bg-slate-50 rounded-2xl border border-slate-100 text-xs">
              <div>
                <span class="text-slate-400 font-bold uppercase text-[10px] block">Colaborador(a)</span>
                <p class="font-bold text-navy-950">${emp.name}</p>
              </div>
              <div>
                <span class="text-slate-400 font-bold uppercase text-[10px] block">CPF / PIS</span>
                <p class="font-mono text-slate-800">${emp.cpf} • ${emp.pis_pasep || '-'}</p>
              </div>
              <div>
                <span class="text-slate-400 font-bold uppercase text-[10px] block">Cargo / Regime</span>
                <p class="font-medium text-slate-800">${emp.position} (${emp.contract_type})</p>
              </div>
              <div>
                <span class="text-slate-400 font-bold uppercase text-[10px] block">Admissão</span>
                <p class="font-medium text-slate-800">${formatDateBR(emp.admission_date)}</p>
              </div>
            </div>

            <!-- Tabela Mês a Mês -->
            <div class="overflow-x-auto border border-slate-200 rounded-2xl">
              <table class="w-full text-left text-xs border-collapse">
                <thead>
                  <tr class="bg-navy-900 text-gold-300 font-bold uppercase tracking-wider text-[11px]">
                    <th class="py-2.5 px-3">Mês de Referência</th>
                    <th class="py-2.5 px-3 text-right">Salário Base</th>
                    <th class="py-2.5 px-3 text-right">Total Bruto</th>
                    <th class="py-2.5 px-3 text-right text-rose-300">INSS Retido</th>
                    <th class="py-2.5 px-3 text-right text-amber-300">IRRF Retido</th>
                    <th class="py-2.5 px-3 text-right text-sky-300">Desc. VT (6%)</th>
                    <th class="py-2.5 px-3 text-right text-emerald-300 font-bold">Líquido Pago</th>
                    <th class="py-2.5 px-3 text-right text-slate-300">FGTS (8%)</th>
                    <th class="py-2.5 px-3 text-center">Data Pgto</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-slate-200 font-mono text-[11px]">
                  ${breakdown.map(m => `
                    <tr class="hover:bg-slate-50">
                      <td class="py-2 px-3 font-sans font-bold text-navy-950">${m.month_label}</td>
                      <td class="py-2 px-3 text-right">${formatBRL(m.base_salary)}</td>
                      <td class="py-2 px-3 text-right font-bold text-navy-950">${formatBRL(m.gross_total)}</td>
                      <td class="py-2 px-3 text-right text-rose-600">-${formatBRL(m.inss_deduction)}</td>
                      <td class="py-2 px-3 text-right text-amber-600">-${formatBRL(m.irrf_deduction)}</td>
                      <td class="py-2 px-3 text-right text-sky-600">-${formatBRL(m.vt_deduction)}</td>
                      <td class="py-2 px-3 text-right font-bold text-emerald-700">${formatBRL(m.net_total)}</td>
                      <td class="py-2 px-3 text-right text-slate-500">${formatBRL(m.fgts_deposit)}</td>
                      <td class="py-2 px-3 text-center text-[10px] text-slate-400 font-sans">${formatDateBR(m.payment_date)}</td>
                    </tr>
                  `).join('')}

                  ${thirteenth.map(t => `
                    <tr class="bg-gold-50/60 hover:bg-gold-50">
                      <td class="py-2 px-3 font-sans font-bold text-gold-950">${t.label}</td>
                      <td class="py-2 px-3 text-right">${formatBRL(t.gross_total)}</td>
                      <td class="py-2 px-3 text-right font-bold text-gold-950">${formatBRL(t.gross_total)}</td>
                      <td class="py-2 px-3 text-right text-rose-600">-${formatBRL(t.inss_deduction)}</td>
                      <td class="py-2 px-3 text-right text-amber-600">-${formatBRL(t.irrf_deduction)}</td>
                      <td class="py-2 px-3 text-right text-slate-400">-</td>
                      <td class="py-2 px-3 text-right font-bold text-emerald-700">${formatBRL(t.net_total)}</td>
                      <td class="py-2 px-3 text-right text-slate-500">${formatBRL(t.fgts_deposit)}</td>
                      <td class="py-2 px-3 text-center text-[10px] text-slate-400 font-sans">${formatDateBR(t.payment_date)}</td>
                    </tr>
                  `).join('')}
                </tbody>
                <tfoot class="bg-slate-100 font-bold font-mono text-xs border-t-2 border-slate-300">
                  <tr>
                    <td class="py-3 px-3 font-sans uppercase">TOTAIS ANUAIS ACUMULADOS (${year})</td>
                    <td class="py-3 px-3 text-right">-</td>
                    <td class="py-3 px-3 text-right text-navy-950">${formatBRL(totals.annual_gross_total)}</td>
                    <td class="py-3 px-3 text-right text-rose-700">-${formatBRL(totals.annual_inss_total)}</td>
                    <td class="py-3 px-3 text-right text-amber-700">-${formatBRL(totals.annual_irrf_total)}</td>
                    <td class="py-3 px-3 text-right text-sky-700">-${formatBRL(totals.annual_vt_total)}</td>
                    <td class="py-3 px-3 text-right text-emerald-800 text-sm">${formatBRL(totals.annual_net_total)}</td>
                    <td class="py-3 px-3 text-right text-blue-900">${formatBRL(totals.annual_fgts_total)}</td>
                    <td class="py-3 px-3 text-center font-sans text-[10px] text-slate-500">Média: ${formatBRL(totals.monthly_average_net)}/mês</td>
                  </tr>
                </tfoot>
              </table>
            </div>

            <!-- Resumo Final em Cards -->
            <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center text-xs">
              <div class="p-3 bg-slate-50 rounded-xl border border-slate-200">
                <span class="text-[10px] font-bold uppercase text-slate-400 block">Total Bruto</span>
                <span class="text-sm font-bold text-navy-950 font-mono">${formatBRL(totals.annual_gross_total)}</span>
              </div>
              <div class="p-3 bg-slate-50 rounded-xl border border-slate-200">
                <span class="text-[10px] font-bold uppercase text-slate-400 block">Deduções Tributárias</span>
                <span class="text-sm font-bold text-rose-700 font-mono">${formatBRL(totals.annual_inss_total + totals.annual_irrf_total)}</span>
              </div>
              <div class="p-3 bg-emerald-50 rounded-xl border border-emerald-200">
                <span class="text-[10px] font-bold uppercase text-emerald-700 block">Líquido Recebido</span>
                <span class="text-sm font-bold text-emerald-800 font-mono">${formatBRL(totals.annual_net_total)}</span>
              </div>
              <div class="p-3 bg-blue-50 rounded-xl border border-blue-200">
                <span class="text-[10px] font-bold uppercase text-blue-700 block">Depósitos FGTS (8%)</span>
                <span class="text-sm font-bold text-blue-900 font-mono">${formatBRL(totals.annual_fgts_total)}</span>
              </div>
            </div>

          </div>
        `;
      } catch (err) {
        console.error('Erro ao carregar Ficha Financeira Individual:', err);
      }
    }

    function printAnnualEmployeeReport() {
      window.print();
    }

    // =========================================================================
    // MODAL DE MODERAÇÃO DE COMENTÁRIOS DO BLOG & CONTROLE DE CONTEÚDO
    // =========================================================================
    function switchBlogSubTab(subtab) {
      const postsSec = document.getElementById('admin-blog-subtab-posts');
      const commentsSec = document.getElementById('admin-blog-subtab-comments');
      const btnPosts = document.getElementById('blog-subtab-btn-posts');
      const btnComments = document.getElementById('blog-subtab-btn-comments');
      if (!postsSec || !commentsSec) return;

      if (subtab === 'posts') {
        postsSec.classList.remove('hidden');
        commentsSec.classList.add('hidden');
        if (btnPosts) btnPosts.className = 'flex items-center space-x-2 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold bg-gradient-to-r from-amber-500 via-gold-500 to-amber-600 text-white shadow-sm transition-all border border-gold-400/60';
        if (btnComments) btnComments.className = 'flex items-center space-x-2 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-semibold text-slate-600 hover:text-navy-950 hover:bg-slate-50 transition-all';
        loadAdminBlogPosts();
      } else {
        postsSec.classList.add('hidden');
        commentsSec.classList.remove('hidden');
        if (btnComments) btnComments.className = 'flex items-center space-x-2 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold bg-gradient-to-r from-amber-500 via-gold-500 to-amber-600 text-white shadow-sm transition-all border border-gold-400/60';
        if (btnPosts) btnPosts.className = 'flex items-center space-x-2 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-semibold text-slate-600 hover:text-navy-950 hover:bg-slate-50 transition-all';
        loadAdminBlogComments();
      }
    }

    let allBlogComments = [];
    async function loadAdminBlogComments() {
      try {
        const res = await fetch('/api/admin/blog/comments', { headers: getAuthHeaders() });
        const data = await res.json();
        if (res.ok && data.success) {
          allBlogComments = data.comments || [];
          const countEl = document.getElementById('blog-subtab-comments-count');
          if (countEl) countEl.textContent = allBlogComments.length;
          renderAdminBlogComments(allBlogComments);
        }
      } catch (err) {
        console.error('Erro ao carregar comentários do blog:', err);
      }
    }

    function renderAdminBlogComments(comments) {
      const tbody = document.getElementById('admin-blog-comments-table-body');
      if (!tbody) return;
      if (comments.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="text-center py-8 text-slate-400">Nenhum comentário registrado nos artigos do blog.</td></tr>';
        return;
      }
      tbody.innerHTML = comments.map(c => `
        <tr class="hover:bg-slate-50 transition-colors">
          <td class="px-5 py-3.5 max-w-xs">
            <p class="font-bold text-navy-950 truncate">${c.post_title || c.post_slug || 'Artigo do Blog'}</p>
            <a href="/blog" target="_blank" class="text-[11px] text-gold-700 hover:underline">Ver Artigo ↗</a>
          </td>
          <td class="px-5 py-3.5">
            <p class="font-bold text-slate-900">${c.author_name}</p>
            <p class="text-[11px] text-emerald-700 font-mono">${c.author_phone || 'S/ Whats'}</p>
            <p class="text-[10px] text-slate-400 truncate">${c.author_email || 'S/ E-mail'}</p>
          </td>
          <td class="px-5 py-3.5 max-w-sm">
            <p class="text-slate-800 text-xs bg-slate-50 p-2.5 rounded-xl border border-slate-200 leading-relaxed">${c.comment_text || c.content || ''}</p>
          </td>
          <td class="px-5 py-3.5 whitespace-nowrap text-slate-500 text-[11px]">
            <div>${c.created_at ? new Date(c.created_at).toLocaleString('pt-BR') : '-'}</div>
            <div class="text-[10px] text-slate-400 font-mono">IP: ${c.ip_address || '—'}</div>
          </td>
          <td class="px-5 py-3.5 text-center">
            ${(c.is_hidden === 0 || c.is_hidden === false || c.is_visible)
              ? '<span class="px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-800 font-bold text-[10px] border border-emerald-300">✅ Visível</span>'
              : '<span class="px-2.5 py-1 rounded-full bg-rose-100 text-rose-800 font-bold text-[10px] border border-rose-300">👁️ Oculto</span>'}
          </td>
          <td class="px-5 py-3.5 text-right whitespace-nowrap">
            <div class="flex items-center justify-end space-x-1.5">
              <button onclick="toggleBlogCommentVisibility('${c.id}')" title="${(c.is_hidden === 0 || c.is_hidden === false) ? 'Esconder do Blog' : 'Tornar Visível'}" class="px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 text-xs font-bold transition-all cursor-pointer">
                ${(c.is_hidden === 0 || c.is_hidden === false) ? '👁️ Esconder' : '✅ Publicar'}
              </button>
              <button onclick="convertBlogCommentToLead('${c.id}')" title="Converter autor em Pré-Cliente / Lead" class="px-2.5 py-1.5 rounded-lg border border-gold-400 bg-gold-50 hover:bg-gold-100 text-gold-950 text-xs font-bold transition-all cursor-pointer">
                👤 Lead
              </button>
              <button onclick="deleteBlogComment('${c.id}')" title="Excluir Comentário" class="px-2.5 py-1.5 rounded-lg border border-rose-300 bg-rose-50 hover:bg-rose-100 text-rose-800 text-xs font-bold transition-all cursor-pointer">
                🗑️
              </button>
            </div>
          </td>
        </tr>
      `).join('');
    }

    async function toggleBlogCommentVisibility(id) {
      try {
        const res = await fetch(`/api/admin/blog/comments/${id}/toggle-visibility`, {
          method: 'PUT',
          headers: getAuthHeaders()
        });
        const data = await res.json();
        if (res.ok && data.success) {
          loadAdminBlogComments();
        } else {
          alert('Erro ao alterar visibilidade: ' + (data.error || 'Falha no servidor.'));
        }
      } catch (err) {
        alert('Erro de comunicação com o servidor.');
      }
    }

    async function deleteBlogComment(id) {
      if (!confirm('Deseja realmente excluir este comentário de forma permanente?')) return;
      try {
        const res = await fetch(`/api/admin/blog/comments/${id}`, {
          method: 'DELETE',
          headers: getAuthHeaders()
        });
        const data = await res.json();
        if (res.ok && data.success) {
          loadAdminBlogComments();
        } else {
          alert('Erro ao excluir comentário: ' + (data.error || 'Falha no servidor.'));
        }
      } catch (err) {
        alert('Erro de comunicação com o servidor.');
      }
    }

    async function convertBlogCommentToLead(id) {
      try {
        const res = await fetch(`/api/admin/blog/comments/${id}/convert-to-lead`, {
          method: 'POST',
          headers: getAuthHeaders()
        });
        const data = await res.json();
        if (res.ok && data.success) {
          alert('✅ Autor do comentário convertido em Pré-Cliente / Lead com sucesso!');
          loadLeads();
        } else {
          alert('Erro ao converter: ' + (data.error || 'Falha no servidor.'));
        }
      } catch (err) {
        alert('Erro de comunicação com o servidor.');
      }
    }

    function filterBlogComments() {
      const term = (document.getElementById('admin-blog-comment-search')?.value || '').toLowerCase();
      const status = document.getElementById('admin-blog-comment-status-filter')?.value || 'ALL';
      const filtered = allBlogComments.filter(c => {
        const matchTerm = !term || (
          (c.author_name && c.author_name.toLowerCase().includes(term)) ||
          (c.content && c.content.toLowerCase().includes(term)) ||
          (c.author_email && c.author_email.toLowerCase().includes(term)) ||
          (c.author_phone && c.author_phone.toLowerCase().includes(term)) ||
          (c.post_title && c.post_title.toLowerCase().includes(term))
        );
        const matchStatus = status === 'ALL' || (status === 'visible' && c.is_visible) || (status === 'hidden' && !c.is_visible);
        return matchTerm && matchStatus;
      });
      renderAdminBlogComments(filtered);
    }

    // =========================================================================
    // BLOCO DE RASCUNHO DE ATIVIDADES, PRAZOS & DESPACHOS DO ESCRITÓRIO
    // =========================================================================
    let allActivityDrafts = [];

    async function loadActivityDrafts() {
      try {
        const res = await fetch('/api/calendar/drafts', { headers: getAuthHeaders() });
        const data = await res.json();
        if (res.ok && data.success) {
          allActivityDrafts = data.drafts || [];
          const badge = document.getElementById('draft-total-badge');
          if (badge) badge.textContent = `${allActivityDrafts.length} rascunhos`;
          renderActivityDrafts(allActivityDrafts);
        }
      } catch (err) {
        console.error('Erro ao carregar rascunhos de atividades:', err);
      }
    }

    function renderActivityDrafts(drafts) {
      const container = document.getElementById('activity-drafts-table-body') || document.getElementById('calendar-drafts-list');
      if (!container) return;
      if (!drafts || drafts.length === 0) {
        container.innerHTML = `
          <tr>
            <td colspan="8" class="text-center py-8 text-slate-400">
              Nenhum rascunho de atividade cadastrado. Clique em "+ Novo Rascunho" para criar despachos e prazos.
            </td>
          </tr>
        `;
        return;
      }

      container.innerHTML = drafts.map(d => {
        const statusBadge = d.status === 'concluido' 
          ? '<span class="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-bold">✅ Concluído</span>'
          : d.status === 'em_andamento'
          ? '<span class="px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 text-[10px] font-bold">⏳ Em Andamento</span>'
          : '<span class="px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 text-[10px] font-bold">📝 Rascunho</span>';

        const deadlineDisplay = d.deadline_date ? (d.deadline_date.includes('-') ? d.deadline_date.split('-').reverse().join('/') : d.deadline_date) : 'Sem prazo';

        return `
          <tr class="hover:bg-slate-50 transition-colors text-xs border-b border-slate-100">
            <td class="px-4 py-3 font-bold text-navy-950">
              <span class="block">${d.activity_title}</span>
              <span class="text-[10px] text-slate-400 uppercase">${d.tribunal || 'TJMG'}</span>
            </td>
            <td class="px-4 py-3 text-slate-700">${d.lawyer_name || 'Dr. Jorge Alvim'}</td>
            <td class="px-4 py-3 text-slate-700">
              <div class="font-semibold text-emerald-800">${d.client_name || '—'}</div>
              ${d.defendant_name ? `<div class="text-[10px] text-rose-700 font-medium">Réu: ${d.defendant_name}</div>` : ''}
            </td>
            <td class="px-4 py-3 text-slate-600 font-mono text-[11px]">
              <div>${d.lawsuit_number || 'S/ Processo'}</div>
              ${d.court_branch ? `<div class="text-[10px] text-slate-400 font-sans">${d.court_branch}</div>` : ''}
            </td>
            <td class="px-4 py-3 font-bold text-rose-700 font-mono">${deadlineDisplay}</td>
            <td class="px-4 py-3 text-slate-600 max-w-xs truncate" title="${(d.notes || '').replace(/"/g, '&quot;')}">${d.notes || '—'}</td>
            <td class="px-4 py-3 text-center">${statusBadge}</td>
            <td class="px-4 py-3 text-right whitespace-nowrap">
              <button onclick="openActivityDraftModal('${d.id}')" class="px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs transition-all cursor-pointer mr-1">
                ✏️
              </button>
              <button onclick="deleteActivityDraft('${d.id}')" class="px-2.5 py-1.5 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold text-xs transition-all cursor-pointer">
                🗑️
              </button>
            </td>
          </tr>
        `;
      }).join('');
    }

    function openActivityDraftModal(draftId = null) {
      const modal = document.getElementById('modal-activity-draft');
      if (!modal) return;
      modal.classList.remove('hidden');

      // Populate dropdowns from allClients and allLawsuits
      const clientSel = document.getElementById('draft-client-select');
      if (clientSel && typeof allClients !== 'undefined' && allClients) {
        clientSel.innerHTML = '<option value="">Selecione um cliente (ou digite abaixo)...</option>' +
          allClients.map(c => `<option value="${c.id}" data-name="${c.full_name}">${c.full_name}</option>`).join('');
      }

      const lawsuitSel = document.getElementById('draft-lawsuit-select');
      if (lawsuitSel && typeof allLawsuits !== 'undefined' && allLawsuits) {
        lawsuitSel.innerHTML = '<option value="">Selecione um processo cadastrado...</option>' +
          allLawsuits.map(l => `<option value="${l.id}" data-number="${l.lawsuit_number}" data-client="${l.client_name || ''}" data-court="${l.court_branch || ''}">${l.lawsuit_number} - ${l.client_name || 'S/ Cliente'}</option>`).join('');
      }

      // Populate lawyer dropdown
      const lawyerSel = document.getElementById('draft-lawyer-select');
      if (lawyerSel && typeof allUsers !== 'undefined' && allUsers && allUsers.length > 0) {
        lawyerSel.innerHTML = allUsers.map(u => `<option value="${u.name || u.username}">${u.name || u.username} (${u.role || 'Advogado'})</option>`).join('');
      }

      if (draftId) {
        const draft = allActivityDrafts.find(d => String(d.id) === String(draftId));
        if (draft) {
          const dId = document.getElementById('draft-id');
          if (dId) dId.value = draft.id;
          const dTitle = document.getElementById('draft-modal-title');
          if (dTitle) dTitle.textContent = 'Editar Rascunho de Atividade';
          const dLawyer = document.getElementById('draft-lawyer-select');
          if (dLawyer) dLawyer.value = draft.lawyer_name || '';
          const dClient = document.getElementById('draft-client-name');
          if (dClient) dClient.value = draft.client_name || '';
          const dDef = document.getElementById('draft-defendant-name');
          if (dDef) dDef.value = draft.defendant_name || '';
          const dLaw = document.getElementById('draft-lawsuit-number');
          if (dLaw) dLaw.value = draft.lawsuit_number || '';
          const dTrib = document.getElementById('draft-tribunal');
          if (dTrib) dTrib.value = draft.tribunal || 'TJMG';
          const dCourt = document.getElementById('draft-court-branch');
          if (dCourt) dCourt.value = draft.court_branch || '';
          const dAct = document.getElementById('draft-activity-title');
          if (dAct) dAct.value = draft.activity_title || '';
          const dDead = document.getElementById('draft-deadline-date');
          if (dDead) dDead.value = draft.deadline_date || '';
          const dNotes = document.getElementById('draft-notes');
          if (dNotes) dNotes.value = draft.notes || '';
          const dStatus = document.getElementById('draft-status-select');
          if (dStatus) dStatus.value = draft.status || 'rascunho';
          return;
        }
      }

      // New Draft Reset
      const dId = document.getElementById('draft-id');
      if (dId) dId.value = '';
      const dTitle = document.getElementById('draft-modal-title');
      if (dTitle) dTitle.textContent = 'Novo Rascunho de Atividade & Prazo';
      const form = document.getElementById('activity-draft-form');
      if (form) form.reset();
      const today = new Date().toISOString().split('T')[0];
      const dDead = document.getElementById('draft-deadline-date');
      if (dDead) dDead.value = today;
    }

    function closeActivityDraftModal() {
      const modal = document.getElementById('modal-activity-draft');
      if (modal) modal.classList.add('hidden');
    }

    function handleDraftClientChange(clientId) {
      if (!clientId) return;
      const client = (typeof allClients !== 'undefined' && allClients) ? allClients.find(c => String(c.id) === String(clientId)) : null;
      if (client) {
        const cName = document.getElementById('draft-client-name');
        if (cName) cName.value = client.full_name;
        // Find any lawsuit for this client
        const clientLawsuit = (typeof allLawsuits !== 'undefined' && allLawsuits) ? allLawsuits.find(l => String(l.client_id) === String(clientId) || (l.client_name && l.client_name.toLowerCase() === client.full_name.toLowerCase())) : null;
        if (clientLawsuit) {
          const lNum = document.getElementById('draft-lawsuit-number');
          if (lNum) lNum.value = clientLawsuit.lawsuit_number || '';
          const cBranch = document.getElementById('draft-court-branch');
          if (cBranch) cBranch.value = clientLawsuit.court_branch || '';
          const dTrib = document.getElementById('draft-tribunal');
          if (dTrib) {
            if (clientLawsuit.court_branch && clientLawsuit.court_branch.includes('TRF')) dTrib.value = 'TRF6';
            else if (clientLawsuit.court_branch && clientLawsuit.court_branch.includes('TRT')) dTrib.value = 'TRT3';
          }
        }
      }
    }

    function handleDraftLawsuitChange(lawsuitId) {
      if (!lawsuitId) return;
      const lawsuit = (typeof allLawsuits !== 'undefined' && allLawsuits) ? allLawsuits.find(l => String(l.id) === String(lawsuitId)) : null;
      if (lawsuit) {
        const lNum = document.getElementById('draft-lawsuit-number');
        if (lNum) lNum.value = lawsuit.lawsuit_number || '';
        const cName = document.getElementById('draft-client-name');
        if (cName && lawsuit.client_name) cName.value = lawsuit.client_name;
        const cBranch = document.getElementById('draft-court-branch');
        if (cBranch && lawsuit.court_branch) cBranch.value = lawsuit.court_branch;
        const dTrib = document.getElementById('draft-tribunal');
        if (dTrib && lawsuit.court_branch) {
          if (lawsuit.court_branch.includes('TRF')) dTrib.value = 'TRF6';
          else if (lawsuit.court_branch.includes('TRT')) dTrib.value = 'TRT3';
        }
      }
    }

    async function loadLatestIntimationIntoDraft() {
      try {
        const res = await fetch('/api/publications/list', { headers: getAuthHeaders() });
        const data = await res.json();
        if (res.ok && data.publications && data.publications.length > 0) {
          const pub = data.publications[0];
          openActivityDraftModal();
          const dAct = document.getElementById('draft-activity-title');
          if (dAct) dAct.value = `Cumprir Intimação: ${pub.title || pub.lawsuit_number || 'Andamento'}`;
          const lNum = document.getElementById('draft-lawsuit-number');
          if (lNum && pub.lawsuit_number) lNum.value = pub.lawsuit_number;
          const dTrib = document.getElementById('draft-tribunal');
          if (dTrib && pub.tribunal) dTrib.value = pub.tribunal;
          const cBranch = document.getElementById('draft-court-branch');
          if (cBranch && pub.court_branch) cBranch.value = pub.court_branch;
          const cName = document.getElementById('draft-client-name');
          if (cName && pub.client_name) cName.value = pub.client_name;
          const dDead = document.getElementById('draft-deadline-date');
          if (dDead && pub.deadline_date) dDead.value = pub.deadline_date;
          const dNotes = document.getElementById('draft-notes');
          if (dNotes) dNotes.value = `[PUXADO DA INTIMAÇÃO EM ${new Date().toLocaleDateString('pt-BR')}]\n` + (pub.content || pub.summary || 'Ver despacho oficial.');
          alert('⚡ Dados da intimação mais recente importados para o rascunho com sucesso!');
        } else {
          alert('Nenhuma intimação recente encontrada para puxar.');
        }
      } catch (err) {
        alert('Erro ao puxar dados da intimação.');
      }
    }

    async function handleSaveActivityDraft(e) {
      e.preventDefault();
      const id = document.getElementById('draft-id')?.value;
      const payload = {
        id: id ? parseInt(id, 10) : undefined,
        lawyer_name: document.getElementById('draft-lawyer-select')?.value || 'Dr. Jorge Alvim',
        client_name: document.getElementById('draft-client-name')?.value || '',
        defendant_name: document.getElementById('draft-defendant-name')?.value || '',
        lawsuit_number: document.getElementById('draft-lawsuit-number')?.value || '',
        tribunal: document.getElementById('draft-tribunal')?.value || 'TJMG',
        court_branch: document.getElementById('draft-court-branch')?.value || '',
        activity_title: document.getElementById('draft-activity-title')?.value || 'Atividade Jurídica',
        deadline_date: document.getElementById('draft-deadline-date')?.value || '',
        notes: document.getElementById('draft-notes')?.value || '',
        status: document.getElementById('draft-status-select')?.value || 'rascunho',
        create_calendar_event: document.getElementById('draft-create-calendar-event')?.checked || false
      };

      try {
        const res = await fetch('/api/calendar/drafts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
          body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (res.ok && data.success) {
          closeActivityDraftModal();
          loadActivityDrafts();
          if (payload.create_calendar_event && typeof loadCalendarEvents === 'function') loadCalendarEvents();
        } else {
          alert('Erro ao salvar rascunho: ' + (data.error || 'Falha no servidor.'));
        }
      } catch (err) {
        alert('Erro de conexão ao salvar rascunho.');
      }
    }

    async function deleteActivityDraft(id) {
      if (!confirm('Deseja realmente excluir este rascunho de atividade?')) return;
      try {
        const res = await fetch(`/api/calendar/drafts/${id}`, {
          method: 'DELETE',
          headers: getAuthHeaders()
        });
        const data = await res.json();
        if (res.ok && data.success) {
          loadActivityDrafts();
        } else {
          alert('Erro ao excluir: ' + (data.error || 'Falha no servidor.'));
        }
      } catch (err) {
        alert('Erro de conexão ao excluir rascunho.');
      }
    }

    function filterActivityDrafts() {
      const term = (document.getElementById('search-drafts-input')?.value || document.getElementById('draft-search-input')?.value || '').toLowerCase();
      const status = document.getElementById('filter-draft-status')?.value || document.getElementById('draft-status-filter')?.value || 'ALL';
      const filtered = allActivityDrafts.filter(d => {
        const matchTerm = !term || (
          (d.activity_title && d.activity_title.toLowerCase().includes(term)) ||
          (d.client_name && d.client_name.toLowerCase().includes(term)) ||
          (d.defendant_name && d.defendant_name.toLowerCase().includes(term)) ||
          (d.lawsuit_number && d.lawsuit_number.toLowerCase().includes(term)) ||
          (d.notes && d.notes.toLowerCase().includes(term))
        );
        const matchStatus = status === 'ALL' || d.status === status;
        return matchTerm && matchStatus;
      });
      renderActivityDrafts(filtered);
    }

    function handleOfficeScratchpadInput() {
      const textarea = document.getElementById('general-office-scratchpad') || document.getElementById('office-scratchpad-textarea');
      if (textarea) {
        localStorage.setItem('ja_office_scratchpad', textarea.value);
        const ind = document.getElementById('scratchpad-saved-indicator');
        if (ind) {
          ind.textContent = 'Salvo às ' + new Date().toLocaleTimeString('pt-BR');
        }
      }
    }

    function loadOfficeScratchpad() {
      const saved = localStorage.getItem('ja_office_scratchpad');
      const textarea = document.getElementById('general-office-scratchpad') || document.getElementById('office-scratchpad-textarea');
      if (textarea && saved) textarea.value = saved;
    }

    // =========================================================================
    // CALCULADORA E EMISSÃO DE RESCISÃO TRABALHISTA CLT (TRCT)
    // =========================================================================
    let currentLaborCalculation = null;
    let allLaborTerminations = [];

    function openLaborTerminationModal() {
      const modal = document.getElementById('modal-labor-termination');
      if (!modal) return;
      modal.classList.remove('hidden');
      const form = document.getElementById('labor-termination-form');
      if (form) form.reset();
      const resultsSec = document.getElementById('labor-calculation-results');
      if (resultsSec) resultsSec.classList.add('hidden');
      
      const today = new Date();
      const oneYearAgo = new Date();
      oneYearAgo.setFullYear(today.getFullYear() - 1);
      const adm = document.getElementById('labor-admission-date');
      if (adm) adm.value = oneYearAgo.toISOString().split('T')[0];
      const dis = document.getElementById('labor-dismissal-date');
      if (dis) dis.value = today.toISOString().split('T')[0];
      const cli = document.getElementById('labor-client-name');
      if (cli) cli.value = 'Jorge Alvim Advocacia';
    }

    function closeLaborTerminationModal() {
      const modal = document.getElementById('modal-labor-termination');
      if (modal) modal.classList.add('hidden');
    }

    async function handleCalculateLaborTermination(e) {
      if (e && e.preventDefault) e.preventDefault();
      const payload = {
        employee_name: document.getElementById('labor-emp-name')?.value || 'Empregado',
        client_name: document.getElementById('labor-client-name')?.value || 'Empresa',
        lawsuit_number: document.getElementById('labor-lawsuit-number')?.value || '',
        admission_date: document.getElementById('labor-admission-date')?.value || '',
        dismissal_date: document.getElementById('labor-dismissal-date')?.value || '',
        base_salary: parseFloat(document.getElementById('labor-base-salary')?.value) || 0,
        dismissal_type: document.getElementById('labor-dismissal-type')?.value || 'sem_justa_causa',
        notice_type: document.getElementById('labor-notice-type')?.value || 'indenizado',
        vacations_overdue_years: parseInt(document.getElementById('labor-vacations-overdue')?.value, 10) || 0,
        fgts_balance: parseFloat(document.getElementById('labor-fgts-balance')?.value) || 0,
        other_credits: parseFloat(document.getElementById('labor-other-credits')?.value) || 0,
        other_discounts: parseFloat(document.getElementById('labor-other-discounts')?.value) || 0
      };

      const btn = document.getElementById('btn-calc-labor');
      if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<span>Calculando Verbas CLT...</span>';
      }

      try {
        const res = await fetch('/api/financial/labor-termination/calculate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
          body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (res.ok && data.success) {
          currentLaborCalculation = { ...payload, calculation: data.calculation };
          displayLaborCalculationResults(data.calculation);
        } else {
          alert('Erro no cálculo: ' + (data.error || 'Verifique os dados informados.'));
        }
      } catch (err) {
        alert('Erro ao calcular rescisão contratual.');
      } finally {
        if (btn) {
          btn.disabled = false;
          btn.innerHTML = '<span>⚡ Calcular Rescisão & Discriminativo</span>';
        }
      }
    }

    function displayLaborCalculationResults(c) {
      const container = document.getElementById('labor-calculation-results');
      if (!container) return;
      container.classList.remove('hidden');

      const earnings = c.earnings || {};
      const deductions = c.deductions || {};
      const summary = c.summary || {};

      const daysMonth = c.days_in_last_month || c.salary_balance_days || 0;
      const salaryBal = earnings.salary_balance !== undefined ? earnings.salary_balance : (c.salary_balance || 0);
      const noticeDays = c.notice_days || 0;
      const noticeVal = earnings.notice_value !== undefined ? earnings.notice_value : (c.notice_value || 0);
      const thirtMonths = c.thirteenth_months || 0;
      const thirtVal = earnings.thirteenth_salary !== undefined ? earnings.thirteenth_salary : (c.thirteenth_value || 0);
      const vacMonths = c.vacation_months || 0;
      const vacProp = earnings.vacation_proportional !== undefined ? (earnings.vacation_proportional + (earnings.vacation_proportional_third || 0)) : (c.vacation_proportional_total || 0);
      const vacOverdue = earnings.vacation_overdue !== undefined ? (earnings.vacation_overdue + (earnings.vacation_overdue_third || 0)) : (c.vacation_overdue_total || 0);
      const fgtsRate = earnings.fgts_fine_rate || `${((c.fgts_fine_rate || 0.4) * 100).toFixed(0)}%`;
      const fgtsFine = earnings.fgts_fine !== undefined ? earnings.fgts_fine : (c.fgts_fine_value || 0);
      const grossTotal = summary.gross_total !== undefined ? summary.gross_total : (c.gross_total || 0);

      const inssSal = deductions.inss_salary !== undefined ? deductions.inss_salary : (c.inss_salary || 0);
      const inss13 = deductions.inss_thirteenth !== undefined ? deductions.inss_thirteenth : (c.inss_13 || 0);
      const noticeDisc = deductions.notice_discount !== undefined ? deductions.notice_discount : (c.notice_discount || 0);
      const otherDisc = deductions.other_discounts !== undefined ? deductions.other_discounts : (c.other_discounts || 0);
      const dedTotal = summary.total_deductions !== undefined ? summary.total_deductions : (c.deductions_total || 0);
      const netTotal = summary.net_total !== undefined ? summary.net_total : (c.net_total || 0);

      const elDaysMonth = document.getElementById('res-days-month'); if (elDaysMonth) elDaysMonth.textContent = daysMonth;
      const elSalBal = document.getElementById('res-salary-balance'); if (elSalBal) elSalBal.textContent = formatBRL(salaryBal);
      const elNotDays = document.getElementById('res-notice-days'); if (elNotDays) elNotDays.textContent = noticeDays;
      const elNotVal = document.getElementById('res-notice-val'); if (elNotVal) elNotVal.textContent = formatBRL(noticeVal);
      const elThirtM = document.getElementById('res-13-months'); if (elThirtM) elThirtM.textContent = thirtMonths;
      const elThirtV = document.getElementById('res-13-val'); if (elThirtV) elThirtV.textContent = formatBRL(thirtVal);
      const elVacM = document.getElementById('res-vac-months'); if (elVacM) elVacM.textContent = vacMonths;
      const elVacP = document.getElementById('res-vac-prop'); if (elVacP) elVacP.textContent = formatBRL(vacProp);
      const elVacO = document.getElementById('res-vac-overdue'); if (elVacO) elVacO.textContent = formatBRL(vacOverdue);
      const elFgtsR = document.getElementById('res-fgts-rate'); if (elFgtsR) elFgtsR.textContent = fgtsRate;
      const elFgtsF = document.getElementById('res-fgts-fine'); if (elFgtsF) elFgtsF.textContent = formatBRL(fgtsFine);
      const elGross = document.getElementById('res-gross-total'); if (elGross) elGross.textContent = formatBRL(grossTotal);

      const elInssS = document.getElementById('res-inss-salary'); if (elInssS) elInssS.textContent = formatBRL(inssSal);
      const elInss13 = document.getElementById('res-inss-13'); if (elInss13) elInss13.textContent = formatBRL(inss13);
      const elNotDisc = document.getElementById('res-notice-disc'); if (elNotDisc) elNotDisc.textContent = formatBRL(noticeDisc);
      const elOthDisc = document.getElementById('res-other-disc'); if (elOthDisc) elOthDisc.textContent = formatBRL(otherDisc);
      const elDedTot = document.getElementById('res-deductions-total'); if (elDedTot) elDedTot.textContent = formatBRL(dedTotal);

      const elNetTot = document.getElementById('res-net-total'); if (elNetTot) elNetTot.textContent = formatBRL(netTotal);
    }

    async function saveLaborTerminationRecord() {
      if (!currentLaborCalculation) {
        alert('Realize o cálculo primeiro antes de salvar.');
        return;
      }

      const payload = {
        ...currentLaborCalculation,
        create_financial_transaction: document.getElementById('labor-create-financial-tx')?.checked || false
      };

      try {
        const res = await fetch('/api/financial/labor-termination/save', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
          body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (res.ok && data.success) {
          alert('✅ Termo de Rescisão Trabalhista CLT salvo e registrado no histórico!');
          closeLaborTerminationModal();
          loadLaborTerminations();
          if (payload.create_financial_transaction) loadFinancialTransactions();
        } else {
          alert('Erro ao salvar rescisão: ' + (data.error || 'Falha no servidor.'));
        }
      } catch (err) {
        alert('Erro de conexão ao salvar rescisão trabalhista.');
      }
    }

    async function loadLaborTerminations() {
      try {
        const res = await fetch('/api/financial/labor-terminations', { headers: getAuthHeaders() });
        const data = await res.json();
        if (res.ok && data.success) {
          allLaborTerminations = data.terminations || [];
          renderLaborTerminationsTable(allLaborTerminations);
        }
      } catch (err) {
        console.error('Erro ao carregar rescisões trabalhistas:', err);
      }
    }

    function renderLaborTerminationsTable(list) {
      const tbody = document.getElementById('labor-terminations-table-body');
      if (!tbody) return;
      if (list.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" class="text-center py-8 text-slate-400">Nenhuma rescisão trabalhista registrada. Clique em "+ Nova Rescisão CLT" para calcular.</td></tr>';
        return;
      }
      tbody.innerHTML = list.map(item => `
        <tr class="hover:bg-slate-50 transition-colors text-xs">
          <td class="px-5 py-3.5 font-bold text-navy-950">${item.employee_name}</td>
          <td class="px-5 py-3.5 text-slate-600">${item.client_name || 'Jorge Alvim Advocacia'}</td>
          <td class="px-5 py-3.5"><span class="px-2 py-0.5 rounded-full bg-slate-100 text-slate-800 text-[10px] font-bold uppercase">${(item.dismissal_type || '').replace(/_/g, ' ')}</span></td>
          <td class="px-5 py-3.5 text-slate-500 font-mono text-[11px]">${item.admission_date} a ${item.dismissal_date}</td>
          <td class="px-5 py-3.5 text-right font-mono font-bold text-slate-900">${formatBRL(item.gross_total)}</td>
          <td class="px-5 py-3.5 text-right font-mono font-extrabold text-emerald-700">${formatBRL(item.net_total)}</td>
          <td class="px-5 py-3.5 text-right whitespace-nowrap">
            <button onclick="printSavedLaborTRCT('${item.id}')" class="px-3 py-1.5 rounded-lg bg-teal-50 hover:bg-teal-100 text-teal-900 font-bold border border-teal-200 cursor-pointer">
              🖨️ TRCT
            </button>
          </td>
        </tr>
      `).join('');
    }

    function filterLaborTerminations() {
      const term = (document.getElementById('labor-search-input')?.value || '').toLowerCase();
      const filtered = allLaborTerminations.filter(item => 
        !term || (item.employee_name && item.employee_name.toLowerCase().includes(term)) ||
        (item.client_name && item.client_name.toLowerCase().includes(term)) ||
        (item.dismissal_type && item.dismissal_type.toLowerCase().includes(term))
      );
      renderLaborTerminationsTable(filtered);
    }

    function printLaborTRCT() {
      if (!currentLaborCalculation) {
        alert('Calcule a rescisão primeiro.');
        return;
      }
      const c = currentLaborCalculation.calculation;
      const w = window.open('', '_blank');
      w.document.write(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>TRCT - Termo de Rescisão de Contrato de Trabalho</title>
          <style>
            body { font-family: Arial, sans-serif; font-size: 11px; color: #1e293b; padding: 20px; line-height: 1.4; }
            .header { text-align: center; border-bottom: 2px solid #0f172a; padding-bottom: 10px; margin-bottom: 15px; }
            .header h2 { margin: 0; font-size: 16px; color: #0f172a; }
            .section { border: 1px solid #cbd5e1; border-radius: 6px; padding: 10px; margin-bottom: 12px; }
            .section-title { font-weight: bold; background: #f1f5f9; padding: 4px 8px; margin: -10px -10px 8px -10px; border-bottom: 1px solid #cbd5e1; text-transform: uppercase; font-size: 10px; }
            .grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px; }
            .table { width: 100%; border-collapse: collapse; margin-top: 5px; }
            .table th, .table td { border: 1px solid #cbd5e1; padding: 5px 8px; text-align: left; }
            .table th { background: #f8fafc; font-weight: bold; }
            .text-right { text-align: right; }
            .signatures { display: grid; grid-template-columns: 1fr 1fr; gap: 40px; margin-top: 50px; text-align: center; }
            .sig-line { border-top: 1px solid #000; padding-top: 5px; font-size: 10px; }
            @media print { body { padding: 0; } }
          </style>
        </head>
        <body>
          <div class="header">
            <h2>TERMO DE RESCISÃO DO CONTRATO DE TRABALHO - TRCT</h2>
            <p style="margin: 3px 0 0 0;">CLT - Consolidação das Leis do Trabalho & Lei nº 12.506/2011</p>
            <p style="margin: 2px 0 0 0; font-size: 10px; color: #64748b;">Jorge Alvim Advocacia & Consultoria Jurídica - OAB/MG 222.943</p>
          </div>

          <div class="section">
            <div class="section-title">1. Identificação do Empregador & Empregado</div>
            <div class="grid">
              <div><strong>Empregador:</strong> ${currentLaborCalculation.client_name || 'Jorge Alvim Advocacia'}</div>
              <div><strong>Empregado:</strong> ${currentLaborCalculation.employee_name}</div>
              <div><strong>Admissão:</strong> ${currentLaborCalculation.admission_date}</div>
              <div><strong>Afastamento / Demissão:</strong> ${currentLaborCalculation.dismissal_date}</div>
              <div><strong>Causa do Afastamento:</strong> ${currentLaborCalculation.dismissal_type.toUpperCase().replace(/_/g, ' ')}</div>
              <div><strong>Salário Base Rescisório:</strong> ${formatBRL(currentLaborCalculation.base_salary)}</div>
            </div>
          </div>

          <div class="section">
            <div class="section-title">2. Discriminação das Verbas Rescisórias (Proventos)</div>
            <table class="table">
              <thead><tr><th>Rubrica</th><th class="text-right">Referência</th><th class="text-right">Valor Bruto</th></tr></thead>
              <tbody>
                <tr><td>Saldo de Salário</td><td class="text-right">${c.salary_balance_days} dias</td><td class="text-right">${formatBRL(c.salary_balance)}</td></tr>
                <tr><td>Aviso Prévio Indenizado / Proporcional (Lei 12.506/11)</td><td class="text-right">${c.notice_days} dias</td><td class="text-right">${formatBRL(c.notice_value)}</td></tr>
                <tr><td>13º Salário Proporcional</td><td class="text-right">${c.thirteenth_months}/12 avos</td><td class="text-right">${formatBRL(c.thirteenth_value)}</td></tr>
                <tr><td>Férias Proporcionais Constitucionais (+ 1/3 CF/88)</td><td class="text-right">${c.vacation_months}/12 avos</td><td class="text-right">${formatBRL(c.vacation_proportional_total)}</td></tr>
                <tr><td>Férias Vencidas Simples/Dobro (+ 1/3 CF/88)</td><td class="text-right">${c.vacations_overdue_years} período(s)</td><td class="text-right">${formatBRL(c.vacation_overdue_total)}</td></tr>
                <tr><td>Multa Rescisória do FGTS (${(c.fgts_fine_rate * 100).toFixed(0)}%)</td><td class="text-right">Saldo ${formatBRL(c.fgts_balance)}</td><td class="text-right">${formatBRL(c.fgts_fine_value)}</td></tr>
                <tr><td>Outros Proventos / Adicionais</td><td class="text-right">-</td><td class="text-right">${formatBRL(c.other_credits)}</td></tr>
                <tr style="font-weight: bold; background: #f8fafc;"><td>TOTAL DE PROVENTOS BRUTO</td><td>-</td><td class="text-right">${formatBRL(c.gross_total)}</td></tr>
              </tbody>
            </table>
          </div>

          <div class="section">
            <div class="section-title">3. Deduções & Descontos Legais</div>
            <table class="table">
              <thead><tr><th>Rubrica de Desconto</th><th class="text-right">Valor</th></tr></thead>
              <tbody>
                <tr><td>Previdência Social (INSS s/ Saldo de Salário)</td><td class="text-right">-${formatBRL(c.inss_salary)}</td></tr>
                <tr><td>Previdência Social (INSS s/ 13º Salário)</td><td class="text-right">-${formatBRL(c.inss_13)}</td></tr>
                <tr><td>Desconto de Aviso Prévio Não Cumprido</td><td class="text-right">-${formatBRL(c.notice_discount)}</td></tr>
                <tr><td>Outros Descontos / Adiantamentos / Faltas</td><td class="text-right">-${formatBRL(c.other_discounts)}</td></tr>
                <tr style="font-weight: bold; background: #f8fafc;"><td>TOTAL DE DEDUÇÕES</td><td class="text-right">-${formatBRL(c.deductions_total)}</td></tr>
              </tbody>
            </table>
          </div>

          <div class="section" style="background: #f0fdf4; border-color: #86efac;">
            <div class="grid" style="font-size: 13px; font-weight: bold; color: #166534;">
              <div>VALOR LÍQUIDO A RECEBER:</div>
              <div class="text-right">${formatBRL(c.net_total)}</div>
            </div>
          </div>

          <div class="signatures">
            <div>
              <div class="sig-line">
                <strong>${currentLaborCalculation.client_name || 'Jorge Alvim Advocacia'}</strong><br>
                Empregador / Responsável Legal
              </div>
            </div>
            <div>
              <div class="sig-line">
                <strong>${currentLaborCalculation.employee_name}</strong><br>
                Empregado / Assistido
              </div>
            </div>
          </div>
        </body>
        </html>
      `);
      w.document.close();
      setTimeout(() => w.print(), 500);
    }

    function printSavedLaborTRCT(id) {
      const item = allLaborTerminations.find(t => String(t.id) === String(id));
      if (!item) return;
      currentLaborCalculation = {
        employee_name: item.employee_name,
        client_name: item.client_name,
        admission_date: item.admission_date,
        dismissal_date: item.dismissal_date,
        dismissal_type: item.dismissal_type,
        base_salary: item.base_salary,
        calculation: {
          salary_balance_days: item.salary_balance_days || 0,
          salary_balance: item.salary_balance || 0,
          notice_days: item.notice_days || 0,
          notice_value: item.notice_value || 0,
          thirteenth_months: item.thirteenth_months || 0,
          thirteenth_value: item.thirteenth_value || 0,
          vacation_months: item.vacation_months || 0,
          vacation_proportional_total: item.vacation_proportional_total || 0,
          vacations_overdue_years: item.vacations_overdue_years || 0,
          vacation_overdue_total: item.vacation_overdue_total || 0,
          fgts_fine_rate: item.fgts_fine_rate || 0.4,
          fgts_balance: item.fgts_balance || 0,
          fgts_fine_value: item.fgts_fine_value || 0,
          other_credits: item.other_credits || 0,
          gross_total: item.gross_total || 0,
          inss_salary: item.inss_salary || 0,
          inss_13: item.inss_13 || 0,
          notice_discount: item.notice_discount || 0,
          other_discounts: item.other_discounts || 0,
          deductions_total: item.deductions_total || 0,
          net_total: item.net_total || 0
        }
      };
      printLaborTRCT();
    }

    // =========================================================================
    // INICIALIZADOR DE GRÁFICOS EM TODAS AS 16 ABAS DO PAINEL (CHART.JS BI)
    // =========================================================================
    window.panelCharts = {};

    function safeCreateChart(canvasId, config) {
      const canvas = document.getElementById(canvasId);
      if (!canvas || typeof Chart === 'undefined') return;
      if (window.panelCharts[canvasId]) {
        window.panelCharts[canvasId].destroy();
        delete window.panelCharts[canvasId];
      }
      // Destrói qualquer instância Chart.js ainda ligada a esta canvas por outro
      // fluxo (ex.: renderFinancialBICharts), evitando "Canvas is already in use".
      const orphan = (typeof Chart.getChart === 'function') ? Chart.getChart(canvas) : null;
      if (orphan) orphan.destroy();
      try {
        window.panelCharts[canvasId] = new Chart(canvas, config);
      } catch (err) {
        console.warn(`Aviso ao criar gráfico ${canvasId}:`, err);
      }
    }

    function renderTabChart(tab) {
      if (typeof Chart === 'undefined') return;
      setTimeout(() => {
        switch(tab) {
          case 'leads':
            safeCreateChart('leadsFunnelChart', {
              type: 'bar',
              data: {
                labels: ['Novos Contatos', 'Em Qualificação', 'Proposta Enviada', 'Convertidos'],
                datasets: [{
                  label: 'Leads & Captação',
                  data: [allLeads.length || 12, Math.round((allLeads.length || 12) * 0.7), Math.round((allLeads.length || 12) * 0.4), Math.round((allLeads.length || 12) * 0.25)],
                  backgroundColor: ['#3b82f6', '#f59e0b', '#8b5cf6', '#10b981'],
                  borderRadius: 8
                }]
              },
              options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } }
            });
            break;
          case 'clients':
            safeCreateChart('clientsDistributionChart', {
              type: 'doughnut',
              data: {
                labels: ['Pessoa Física (PF)', 'Pessoa Jurídica (PJ)', 'Trabalhista', 'Previdenciário'],
                datasets: [{
                  data: [65, 20, 10, 5],
                  backgroundColor: ['#d97706', '#0284c7', '#059669', '#7c3aed']
                }]
              },
              options: { responsive: true, maintainAspectRatio: false }
            });
            break;
          case 'lawsuits':
            safeCreateChart('lawsuitsFaseChart', {
              type: 'bar',
              data: {
                labels: ['Inicial', 'Instrução', 'Recurso / 2ª Instância', 'Execução / Cumprimento', 'Baixado'],
                datasets: [{
                  label: 'Processos',
                  data: [allLawsuits.length || 8, Math.round((allLawsuits.length || 8) * 0.6), Math.round((allLawsuits.length || 8) * 0.3), Math.round((allLawsuits.length || 8) * 0.4), 2],
                  backgroundColor: '#d97706',
                  borderRadius: 6
                }]
              },
              options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } }
            });
            break;
          case 'calendar':
            safeCreateChart('calendarDeadlinesChart', {
              type: 'bar',
              data: {
                labels: ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Próx. Semana'],
                datasets: [{
                  label: 'Prazos Fatais',
                  data: [2, 4, 1, 3, 5, 8],
                  backgroundColor: '#dc2626',
                  borderRadius: 6
                }]
              },
              options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } }
            });
            break;
          case 'publications':
            safeCreateChart('publicationsTribunalChart', {
              type: 'doughnut',
              data: {
                labels: ['TJMG', 'TRF6', 'TRT3', 'TJSP', 'STJ/STF'],
                datasets: [{
                  data: [55, 20, 15, 6, 4],
                  backgroundColor: ['#1e3a8a', '#0284c7', '#0d9488', '#f59e0b', '#6366f1']
                }]
              },
              options: { responsive: true, maintainAspectRatio: false }
            });
            break;
          case 'docs':
            safeCreateChart('docsTypesChart', {
              type: 'bar',
              data: {
                labels: ['Procurações', 'Contratos', 'Declaração Hipossuf.', 'Petições', 'Notificações'],
                datasets: [{
                  label: 'Docs Gerados',
                  data: [15, 12, 10, 8, 5],
                  backgroundColor: '#4f46e5',
                  borderRadius: 6
                }]
              },
              options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } }
            });
            break;
          case 'finance':
            safeCreateChart('financeMonthlyChart', {
              type: 'line',
              data: {
                labels: ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun'],
                datasets: [
                  { label: 'Honorários (Entradas)', data: [18000, 22500, 29000, 31200, 35000, 38500], borderColor: '#10b981', tension: 0.3, fill: false },
                  { label: 'Despesas (Saídas)', data: [8000, 9200, 11000, 10500, 12000, 11800], borderColor: '#f43f5e', tension: 0.3, fill: false }
                ]
              },
              options: { responsive: true, maintainAspectRatio: false }
            });
            safeCreateChart('financeCategoryChart', {
              type: 'doughnut',
              data: {
                labels: ['Honorários Contratuais', 'Honorários Sucumbenciais', 'Consultoria', 'Alvarás'],
                datasets: [{
                  data: [50, 25, 15, 10],
                  backgroundColor: ['#10b981', '#f59e0b', '#0ea5e9', '#8b5cf6']
                }]
              },
              options: { responsive: true, maintainAspectRatio: false }
            });
            break;
          case 'nfse':
            safeCreateChart('nfseStatusChart', {
              type: 'doughnut',
              data: {
                labels: ['Emitidas / Autorizadas', 'Canceladas', 'RPS em Processamento'],
                datasets: [{
                  data: [85, 5, 10],
                  backgroundColor: ['#059669', '#dc2626', '#f59e0b']
                }]
              },
              options: { responsive: true, maintainAspectRatio: false }
            });
            break;
          case 'blog':
            safeCreateChart('blogStatsChart', {
              type: 'bar',
              data: {
                labels: ['Trânsito & CNH', 'Consumidor & Bancário', 'Civil & Família', 'Trabalhista & CLT', 'Previdenciário'],
                datasets: [
                  { label: 'Visualizações', data: [340, 280, 210, 190, 150], backgroundColor: '#3b82f6', borderRadius: 6 },
                  { label: 'Curtidas ❤️', data: [45, 38, 28, 22, 19], backgroundColor: '#ef4444', borderRadius: 6 },
                  { label: 'Comentários 💬', data: [18, 12, 9, 8, 5], backgroundColor: '#10b981', borderRadius: 6 }
                ]
              },
              options: { responsive: true, maintainAspectRatio: false }
            });
            break;
          case 'audit':
            safeCreateChart('auditModulesChart', {
              type: 'bar',
              data: {
                labels: ['Clientes', 'Processos', 'Financeiro', 'Documentos', 'Acessos / Login'],
                datasets: [{
                  label: 'Eventos Auditados',
                  data: [42, 38, 29, 21, 55],
                  backgroundColor: '#0284c7',
                  borderRadius: 6
                }]
              },
              options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } }
            });
            break;
          case 'pre-clients':
            safeCreateChart('preClientsSourcesChart', {
              type: 'doughnut',
              data: {
                labels: ['Blog Jurídico', 'WhatsApp Direto', 'Google / Busca Orgânica', 'Instagram', 'Indicação'],
                datasets: [{
                  data: [40, 30, 15, 10, 5],
                  backgroundColor: ['#d97706', '#10b981', '#3b82f6', '#ec4899', '#8b5cf6']
                }]
              },
              options: { responsive: true, maintainAspectRatio: false }
            });
            break;
          case 'judicial':
            safeCreateChart('judicialTribunalsChart', {
              type: 'bar',
              data: {
                labels: ['TJMG', 'TRF6', 'TRT3', 'TJSP', 'STJ', 'STF'],
                datasets: [{
                  label: 'Processos Consultados',
                  data: [48, 22, 18, 12, 6, 3],
                  backgroundColor: '#1d4ed8',
                  borderRadius: 6
                }]
              },
              options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } }
            });
            break;
          case 'offices':
            safeCreateChart('officesCapacityChart', {
              type: 'bar',
              data: {
                labels: ['Matriz Juiz de Fora', 'Filial Belo Horizonte', 'Atendimento Virtual'],
                datasets: [{
                  label: 'Integrantes',
                  data: [6, 4, 3],
                  backgroundColor: '#d97706',
                  borderRadius: 6
                }]
              },
              options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } }
            });
            break;
          case 'drive':
            safeCreateChart('driveCategoriesChart', {
              type: 'doughnut',
              data: {
                labels: ['Peças & Minutas', 'Certidões & Atos', 'Contratos', 'Geral'],
                datasets: [{
                  data: [35, 25, 25, 15],
                  backgroundColor: ['#059669', '#3b82f6', '#d97706', '#64748b']
                }]
              },
              options: { responsive: true, maintainAspectRatio: false }
            });
            break;
          case 'users':
            safeCreateChart('usersRolesChart', {
              type: 'doughnut',
              data: {
                labels: ['Sócios / Mestre', 'Advogados', 'Estagiários / DP', 'Clientes'],
                datasets: [{
                  data: [2, 3, 3, 10],
                  backgroundColor: ['#d97706', '#10b981', '#6366f1', '#0ea5e9']
                }]
              },
              options: { responsive: true, maintainAspectRatio: false }
            });
            break;
          case 'hr':
            safeCreateChart('hrDepartmentChart', {
              type: 'bar',
              data: {
                labels: ['Adv. Sênior', 'Adv. Júnior', 'Estagiários', 'Secretaria / DP'],
                datasets: [
                  { label: 'Colaboradores', data: [2, 2, 2, 2], backgroundColor: '#0d9488', borderRadius: 6 }
                ]
              },
              options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } }
            });
            break;
        }
      }, 100);
    }

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
