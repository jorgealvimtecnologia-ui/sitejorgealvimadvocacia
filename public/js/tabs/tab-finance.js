/**
 * ============================================================================
 * SUBMÓDULO DESACOPLADO: MÓDULO: FINANCEIRO, CARNÊS, ALVARÁS, LIVRO CAIXA & NFS-E ASAAS
 * Origem: Decomposição arquitetural do painel-1-app.js
 * ============================================================================
 */

(function () {
  'use strict';

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

    function closeTransactionModal(force) {
      if (!force && typeof window.confirmDiscardModalChanges === 'function') {
        if (!window.confirmDiscardModalChanges('transaction-modal', 'no lançamento financeiro')) return;
      }
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
          if (typeof window.clearUnsavedChanges === 'function') window.clearUnsavedChanges('transaction-modal');
          closeTransactionModal(true);
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

    function closeManualPayModal(force) {
      if (!force && typeof window.confirmDiscardModalChanges === 'function') {
        if (!window.confirmDiscardModalChanges('manual-pay-modal', 'desta baixa de pagamento')) return;
      }
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
          if (typeof window.clearUnsavedChanges === 'function') {
            window.clearUnsavedChanges('manual-pay-modal');
          }
          closeManualPayModal(true);
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

    function closeAlvaraModal(force) {
      if (!force && typeof window.confirmDiscardModalChanges === 'function') {
        if (!window.confirmDiscardModalChanges('alvara-modal', 'no alvará judicial')) return;
      }
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
          if (typeof window.clearUnsavedChanges === 'function') window.clearUnsavedChanges('alvara-modal');
          closeAlvaraModal(true);
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

    function closeNfseModal(force) {
      if (!force && typeof window.confirmDiscardModalChanges === 'function') {
        if (!window.confirmDiscardModalChanges('nfse-issue-modal', 'na emissão da nota fiscal ou recibo')) return;
      }
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
            instSelect.value = String(selectedInstallmentId);
            if (defaultAmount) amountInput.value = defaultAmount;
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
          if (typeof window.clearUnsavedChanges === 'function') window.clearUnsavedChanges('nfse-issue-modal');
          closeNfseModal(true);
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


  // ==========================================================================
  // EXPORTAÇÕES GLOBAIS PARA INTERFACE (ONCLICK & COMPATIBILIDADE)
  // ==========================================================================
  window.initFinanceTab = typeof initFinanceTab !== 'undefined' ? initFinanceTab : window.initFinanceTab;
  window.switchFinanceSubTab = typeof switchFinanceSubTab !== 'undefined' ? switchFinanceSubTab : window.switchFinanceSubTab;
  window.populateFinanceClientDropdowns = typeof populateFinanceClientDropdowns !== 'undefined' ? populateFinanceClientDropdowns : window.populateFinanceClientDropdowns;
  window.renderFinancialBICharts = typeof renderFinancialBICharts !== 'undefined' ? renderFinancialBICharts : window.renderFinancialBICharts;
  window.loadFinancialDashboard = typeof loadFinancialDashboard !== 'undefined' ? loadFinancialDashboard : window.loadFinancialDashboard;
  window.loadFinancialSettings = typeof loadFinancialSettings !== 'undefined' ? loadFinancialSettings : window.loadFinancialSettings;
  window.toggleAsaasSettingsUI = typeof toggleAsaasSettingsUI !== 'undefined' ? toggleAsaasSettingsUI : window.toggleAsaasSettingsUI;
  window.saveFinancialSettings = typeof saveFinancialSettings !== 'undefined' ? saveFinancialSettings : window.saveFinancialSettings;
  window.testAsaasConnection = typeof testAsaasConnection !== 'undefined' ? testAsaasConnection : window.testAsaasConnection;
  window.copyWebhookUrl = typeof copyWebhookUrl !== 'undefined' ? copyWebhookUrl : window.copyWebhookUrl;
  window.loadFinancialTransactions = typeof loadFinancialTransactions !== 'undefined' ? loadFinancialTransactions : window.loadFinancialTransactions;
  window.renderFinancialTransactions = typeof renderFinancialTransactions !== 'undefined' ? renderFinancialTransactions : window.renderFinancialTransactions;
  window.toggleRecurringOptions = typeof toggleRecurringOptions !== 'undefined' ? toggleRecurringOptions : window.toggleRecurringOptions;
  window.openNewTransactionModal = typeof openNewTransactionModal !== 'undefined' ? openNewTransactionModal : window.openNewTransactionModal;
  window.closeTransactionModal = typeof closeTransactionModal !== 'undefined' ? closeTransactionModal : window.closeTransactionModal;
  window.handleTransTypeChange = typeof handleTransTypeChange !== 'undefined' ? handleTransTypeChange : window.handleTransTypeChange;
  window.handleSaveTransaction = typeof handleSaveTransaction !== 'undefined' ? handleSaveTransaction : window.handleSaveTransaction;
  window.quickPayTransaction = typeof quickPayTransaction !== 'undefined' ? quickPayTransaction : window.quickPayTransaction;
  window.deleteTransaction = typeof deleteTransaction !== 'undefined' ? deleteTransaction : window.deleteTransaction;
  window.handleFinClientSelect = typeof handleFinClientSelect !== 'undefined' ? handleFinClientSelect : window.handleFinClientSelect;
  window.loadClientInstallments = typeof loadClientInstallments !== 'undefined' ? loadClientInstallments : window.loadClientInstallments;
  window.renderClientInstallments = typeof renderClientInstallments !== 'undefined' ? renderClientInstallments : window.renderClientInstallments;
  window.generateInstallmentsForSelectedClient = typeof generateInstallmentsForSelectedClient !== 'undefined' ? generateInstallmentsForSelectedClient : window.generateInstallmentsForSelectedClient;
  window.generateAsaasCharge = typeof generateAsaasCharge !== 'undefined' ? generateAsaasCharge : window.generateAsaasCharge;
  window.showExistingAsaasChargeModal = typeof showExistingAsaasChargeModal !== 'undefined' ? showExistingAsaasChargeModal : window.showExistingAsaasChargeModal;
  window.closeAsaasChargeModal = typeof closeAsaasChargeModal !== 'undefined' ? closeAsaasChargeModal : window.closeAsaasChargeModal;
  window.copyAsaasPixCode = typeof copyAsaasPixCode !== 'undefined' ? copyAsaasPixCode : window.copyAsaasPixCode;
  window.sendAsaasChargeWhatsApp = typeof sendAsaasChargeWhatsApp !== 'undefined' ? sendAsaasChargeWhatsApp : window.sendAsaasChargeWhatsApp;
  window.openManualPayModal = typeof openManualPayModal !== 'undefined' ? openManualPayModal : window.openManualPayModal;
  window.closeManualPayModal = typeof closeManualPayModal !== 'undefined' ? closeManualPayModal : window.closeManualPayModal;
  window.handleConfirmManualPay = typeof handleConfirmManualPay !== 'undefined' ? handleConfirmManualPay : window.handleConfirmManualPay;
  window.generateReceiptForInstallment = typeof generateReceiptForInstallment !== 'undefined' ? generateReceiptForInstallment : window.generateReceiptForInstallment;
  window.loadAlvaras = typeof loadAlvaras !== 'undefined' ? loadAlvaras : window.loadAlvaras;
  window.renderAlvaras = typeof renderAlvaras !== 'undefined' ? renderAlvaras : window.renderAlvaras;
  window.openNewAlvaraModal = typeof openNewAlvaraModal !== 'undefined' ? openNewAlvaraModal : window.openNewAlvaraModal;
  window.closeAlvaraModal = typeof closeAlvaraModal !== 'undefined' ? closeAlvaraModal : window.closeAlvaraModal;
  window.recalcAlvaraPreview = typeof recalcAlvaraPreview !== 'undefined' ? recalcAlvaraPreview : window.recalcAlvaraPreview;
  window.handleSaveAlvara = typeof handleSaveAlvara !== 'undefined' ? handleSaveAlvara : window.handleSaveAlvara;
  window.generateAlvaraPrestacaoContas = typeof generateAlvaraPrestacaoContas !== 'undefined' ? generateAlvaraPrestacaoContas : window.generateAlvaraPrestacaoContas;
  window.renderCashflowReport = typeof renderCashflowReport !== 'undefined' ? renderCashflowReport : window.renderCashflowReport;
  window.printCashflowReport = typeof printCashflowReport !== 'undefined' ? printCashflowReport : window.printCashflowReport;
  window.openClientFinancialTab = typeof openClientFinancialTab !== 'undefined' ? openClientFinancialTab : window.openClientFinancialTab;
  window.loadNfseList = typeof loadNfseList !== 'undefined' ? loadNfseList : window.loadNfseList;
  window.renderNfseTable = typeof renderNfseTable !== 'undefined' ? renderNfseTable : window.renderNfseTable;
  window.openNewNfseModal = typeof openNewNfseModal !== 'undefined' ? openNewNfseModal : window.openNewNfseModal;
  window.closeNfseModal = typeof closeNfseModal !== 'undefined' ? closeNfseModal : window.closeNfseModal;
  window.handleNfseDocTypeChange = typeof handleNfseDocTypeChange !== 'undefined' ? handleNfseDocTypeChange : window.handleNfseDocTypeChange;
  window.handleNfseClientSelect = typeof handleNfseClientSelect !== 'undefined' ? handleNfseClientSelect : window.handleNfseClientSelect;
  window.handleNfseInstallmentSelect = typeof handleNfseInstallmentSelect !== 'undefined' ? handleNfseInstallmentSelect : window.handleNfseInstallmentSelect;
  window.handleNfseSubmit = typeof handleNfseSubmit !== 'undefined' ? handleNfseSubmit : window.handleNfseSubmit;
  window.openNfsePreview = typeof openNfsePreview !== 'undefined' ? openNfsePreview : window.openNfsePreview;
  window.closeNfsePreviewModal = typeof closeNfsePreviewModal !== 'undefined' ? closeNfsePreviewModal : window.closeNfsePreviewModal;
  window.printNfseDoc = typeof printNfseDoc !== 'undefined' ? printNfseDoc : window.printNfseDoc;
  window.syncAsaasNfse = typeof syncAsaasNfse !== 'undefined' ? syncAsaasNfse : window.syncAsaasNfse;
  window.cancelNfseDoc = typeof cancelNfseDoc !== 'undefined' ? cancelNfseDoc : window.cancelNfseDoc;
})();
