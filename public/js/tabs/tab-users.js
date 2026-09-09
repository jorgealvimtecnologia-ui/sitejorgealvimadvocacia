/**
 * ============================================================================
 * SUBMÓDULO DESACOPLADO: MÓDULO: GESTÃO DE USUÁRIOS, SENHAS & RBAC
 * Origem: Decomposição arquitetural do painel-1-app.js
 * ============================================================================
 */

(function () {
  'use strict';

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

        // SEGURANÇA (LGPD): removida a exibição da senha em texto puro. O sistema
        // não guarda nem revela senhas — a troca é feita por "Redefinir senha".
        const passTag = '';

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

    function closeNewUserModal(force) {
      if (!force && typeof window.confirmDiscardModalChanges === 'function') {
        if (!window.confirmDiscardModalChanges('new-user-modal', 'no cadastro de usuário')) return;
      }
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
          if (typeof window.clearUnsavedChanges === 'function') window.clearUnsavedChanges('new-user-modal');
          closeNewUserModal(true);
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

    function closeEditUserModal(force) {
      if (!force && typeof window.confirmDiscardModalChanges === 'function') {
        if (!window.confirmDiscardModalChanges('edit-user-modal', 'na edição do usuário')) return;
      }
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
          if (typeof window.clearUnsavedChanges === 'function') window.clearUnsavedChanges('edit-user-modal');
          closeEditUserModal(true);
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


  // ==========================================================================
  // EXPORTAÇÕES GLOBAIS PARA INTERFACE (ONCLICK & COMPATIBILIDADE)
  // ==========================================================================
  window.loadAccessControlMatrix = typeof loadAccessControlMatrix !== 'undefined' ? loadAccessControlMatrix : window.loadAccessControlMatrix;
  window.filterAccessMatrix = typeof filterAccessMatrix !== 'undefined' ? filterAccessMatrix : window.filterAccessMatrix;
  window.renderAccessMatrix = typeof renderAccessMatrix !== 'undefined' ? renderAccessMatrix : window.renderAccessMatrix;
  window.simulateUserView = typeof simulateUserView !== 'undefined' ? simulateUserView : window.simulateUserView;
  window.exitSimulationView = typeof exitSimulationView !== 'undefined' ? exitSimulationView : window.exitSimulationView;
  window.getFirstAllowedTab = typeof getFirstAllowedTab !== 'undefined' ? getFirstAllowedTab : window.getFirstAllowedTab;
  window.applyAccessControlToUI = typeof applyAccessControlToUI !== 'undefined' ? applyAccessControlToUI : window.applyAccessControlToUI;
  window.toggleAccessSwitch = typeof toggleAccessSwitch !== 'undefined' ? toggleAccessSwitch : window.toggleAccessSwitch;
  window.applyUserTemplate = typeof applyUserTemplate !== 'undefined' ? applyUserTemplate : window.applyUserTemplate;
  window.toggleUserGlobalAccess = typeof toggleUserGlobalAccess !== 'undefined' ? toggleUserGlobalAccess : window.toggleUserGlobalAccess;
  window.loadUsers = typeof loadUsers !== 'undefined' ? loadUsers : window.loadUsers;
  window.filterUsers = typeof filterUsers !== 'undefined' ? filterUsers : window.filterUsers;
  window.renderUsers = typeof renderUsers !== 'undefined' ? renderUsers : window.renderUsers;
  window.openNewUserModal = typeof openNewUserModal !== 'undefined' ? openNewUserModal : window.openNewUserModal;
  window.closeNewUserModal = typeof closeNewUserModal !== 'undefined' ? closeNewUserModal : window.closeNewUserModal;
  window.handleCreateUser = typeof handleCreateUser !== 'undefined' ? handleCreateUser : window.handleCreateUser;
  window.openEditUserModal = typeof openEditUserModal !== 'undefined' ? openEditUserModal : window.openEditUserModal;
  window.closeEditUserModal = typeof closeEditUserModal !== 'undefined' ? closeEditUserModal : window.closeEditUserModal;
  window.handleUpdateUser = typeof handleUpdateUser !== 'undefined' ? handleUpdateUser : window.handleUpdateUser;
  window.deleteUser = typeof deleteUser !== 'undefined' ? deleteUser : window.deleteUser;
})();
