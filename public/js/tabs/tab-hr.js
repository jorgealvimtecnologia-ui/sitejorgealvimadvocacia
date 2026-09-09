/**
 * ============================================================================
 * SUBMÓDULO DESACOPLADO: MÓDULO: RH, DEPARTAMENTO PESSOAL, CLT & RESCISÕES TRABALHISTAS
 * Origem: Decomposição arquitetural do painel-1-app.js
 * ============================================================================
 */

(function () {
  'use strict';

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

    function closeHrModal(modalId, force) {
      if (!force && modalId && typeof window.confirmDiscardModalChanges === 'function') {
        if (!window.confirmDiscardModalChanges(modalId, 'no módulo de RH')) return;
      }
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

    function closeLaborTerminationModal(force) {
      if (!force && typeof window.confirmDiscardModalChanges === 'function') {
        if (!window.confirmDiscardModalChanges('modal-labor-termination', 'no cálculo de rescisão')) return;
      }
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

  // ==========================================================================
  // EXPORTAÇÕES GLOBAIS PARA INTERFACE (ONCLICK & COMPATIBILIDADE)
  // ==========================================================================
  window.formatBRL = typeof formatBRL !== 'undefined' ? formatBRL : window.formatBRL;
  window.formatDateBR = typeof formatDateBR !== 'undefined' ? formatDateBR : window.formatDateBR;
  window.closeHrModal = typeof closeHrModal !== 'undefined' ? closeHrModal : window.closeHrModal;
  window.initHrTab = typeof initHrTab !== 'undefined' ? initHrTab : window.initHrTab;
  window.loadHrDashboard = typeof loadHrDashboard !== 'undefined' ? loadHrDashboard : window.loadHrDashboard;
  window.switchHrSubTab = typeof switchHrSubTab !== 'undefined' ? switchHrSubTab : window.switchHrSubTab;
  window.loadHrEmployees = typeof loadHrEmployees !== 'undefined' ? loadHrEmployees : window.loadHrEmployees;
  window.populateEmployeeSelects = typeof populateEmployeeSelects !== 'undefined' ? populateEmployeeSelects : window.populateEmployeeSelects;
  window.renderHrEmployeesGrid = typeof renderHrEmployeesGrid !== 'undefined' ? renderHrEmployeesGrid : window.renderHrEmployeesGrid;
  window.openEmployeeAnnualFinancial = typeof openEmployeeAnnualFinancial !== 'undefined' ? openEmployeeAnnualFinancial : window.openEmployeeAnnualFinancial;
  window.selectEmployeeForTime = typeof selectEmployeeForTime !== 'undefined' ? selectEmployeeForTime : window.selectEmployeeForTime;
  window.openNewEmployeeModal = typeof openNewEmployeeModal !== 'undefined' ? openNewEmployeeModal : window.openNewEmployeeModal;
  window.openEditEmployeeModal = typeof openEditEmployeeModal !== 'undefined' ? openEditEmployeeModal : window.openEditEmployeeModal;
  window.handleSaveEmployee = typeof handleSaveEmployee !== 'undefined' ? handleSaveEmployee : window.handleSaveEmployee;
  window.loadHrTimeClock = typeof loadHrTimeClock !== 'undefined' ? loadHrTimeClock : window.loadHrTimeClock;
  window.openSignTimeClockModal = typeof openSignTimeClockModal !== 'undefined' ? openSignTimeClockModal : window.openSignTimeClockModal;
  window.handleConfirmSignTimeClock = typeof handleConfirmSignTimeClock !== 'undefined' ? handleConfirmSignTimeClock : window.handleConfirmSignTimeClock;
  window.openQuickPunchModal = typeof openQuickPunchModal !== 'undefined' ? openQuickPunchModal : window.openQuickPunchModal;
  window.handleSaveTimePunch = typeof handleSaveTimePunch !== 'undefined' ? handleSaveTimePunch : window.handleSaveTimePunch;
  window.loadHrPayroll = typeof loadHrPayroll !== 'undefined' ? loadHrPayroll : window.loadHrPayroll;
  window.handleCalculatePayroll = typeof handleCalculatePayroll !== 'undefined' ? handleCalculatePayroll : window.handleCalculatePayroll;
  window.openPayslipModal = typeof openPayslipModal !== 'undefined' ? openPayslipModal : window.openPayslipModal;
  window.printCurrentPayslip = typeof printCurrentPayslip !== 'undefined' ? printCurrentPayslip : window.printCurrentPayslip;
  window.loadHrVacations = typeof loadHrVacations !== 'undefined' ? loadHrVacations : window.loadHrVacations;
  window.openNewVacationModal = typeof openNewVacationModal !== 'undefined' ? openNewVacationModal : window.openNewVacationModal;
  window.calculateVacationPreview = typeof calculateVacationPreview !== 'undefined' ? calculateVacationPreview : window.calculateVacationPreview;
  window.handleSaveVacation = typeof handleSaveVacation !== 'undefined' ? handleSaveVacation : window.handleSaveVacation;
  window.loadHrThirteenth = typeof loadHrThirteenth !== 'undefined' ? loadHrThirteenth : window.loadHrThirteenth;
  window.loadHrExams = typeof loadHrExams !== 'undefined' ? loadHrExams : window.loadHrExams;
  window.openNewExamModal = typeof openNewExamModal !== 'undefined' ? openNewExamModal : window.openNewExamModal;
  window.handleSaveExam = typeof handleSaveExam !== 'undefined' ? handleSaveExam : window.handleSaveExam;
  window.loadHrContracts = typeof loadHrContracts !== 'undefined' ? loadHrContracts : window.loadHrContracts;
  window.loadHrBenefits = typeof loadHrBenefits !== 'undefined' ? loadHrBenefits : window.loadHrBenefits;
  window.loadHrAnnualOfficeReport = typeof loadHrAnnualOfficeReport !== 'undefined' ? loadHrAnnualOfficeReport : window.loadHrAnnualOfficeReport;
  window.printAnnualOfficeReport = typeof printAnnualOfficeReport !== 'undefined' ? printAnnualOfficeReport : window.printAnnualOfficeReport;
  window.loadHrAnnualEmployeeReport = typeof loadHrAnnualEmployeeReport !== 'undefined' ? loadHrAnnualEmployeeReport : window.loadHrAnnualEmployeeReport;
  window.printAnnualEmployeeReport = typeof printAnnualEmployeeReport !== 'undefined' ? printAnnualEmployeeReport : window.printAnnualEmployeeReport;
  window.openLaborTerminationModal = typeof openLaborTerminationModal !== 'undefined' ? openLaborTerminationModal : window.openLaborTerminationModal;
  window.closeLaborTerminationModal = typeof closeLaborTerminationModal !== 'undefined' ? closeLaborTerminationModal : window.closeLaborTerminationModal;
  window.handleCalculateLaborTermination = typeof handleCalculateLaborTermination !== 'undefined' ? handleCalculateLaborTermination : window.handleCalculateLaborTermination;
  window.displayLaborCalculationResults = typeof displayLaborCalculationResults !== 'undefined' ? displayLaborCalculationResults : window.displayLaborCalculationResults;
  window.saveLaborTerminationRecord = typeof saveLaborTerminationRecord !== 'undefined' ? saveLaborTerminationRecord : window.saveLaborTerminationRecord;
  window.loadLaborTerminations = typeof loadLaborTerminations !== 'undefined' ? loadLaborTerminations : window.loadLaborTerminations;
  window.renderLaborTerminationsTable = typeof renderLaborTerminationsTable !== 'undefined' ? renderLaborTerminationsTable : window.renderLaborTerminationsTable;
  window.filterLaborTerminations = typeof filterLaborTerminations !== 'undefined' ? filterLaborTerminations : window.filterLaborTerminations;
  window.printLaborTRCT = typeof printLaborTRCT !== 'undefined' ? printLaborTRCT : window.printLaborTRCT;
  window.printSavedLaborTRCT = typeof printSavedLaborTRCT !== 'undefined' ? printSavedLaborTRCT : window.printSavedLaborTRCT;
})();
