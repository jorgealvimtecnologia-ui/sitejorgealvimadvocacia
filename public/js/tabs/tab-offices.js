/**
 * ============================================================================
 * SUBMÓDULO DESACOPLADO: MÓDULO: GESTÃO DE ESCRITÓRIOS, FILIAIS & EQUIPE
 * Origem: Decomposição arquitetural do painel-1-app.js
 * ============================================================================
 */

(function () {
  'use strict';

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

    function closeOfficeModal(force) {
      if (!force && typeof window.confirmDiscardModalChanges === 'function') {
        if (!window.confirmDiscardModalChanges('office-modal', 'no cadastro de escritório')) return;
      }
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
          if (typeof window.clearUnsavedChanges === 'function') window.clearUnsavedChanges('office-modal');
          closeOfficeModal(true);
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


  // ==========================================================================
  // EXPORTAÇÕES GLOBAIS PARA INTERFACE (ONCLICK & COMPATIBILIDADE)
  // ==========================================================================
  window.initOfficesTab = typeof initOfficesTab !== 'undefined' ? initOfficesTab : window.initOfficesTab;
  window.loadOffices = typeof loadOffices !== 'undefined' ? loadOffices : window.loadOffices;
  window.filterOfficesList = typeof filterOfficesList !== 'undefined' ? filterOfficesList : window.filterOfficesList;
  window.renderOfficesList = typeof renderOfficesList !== 'undefined' ? renderOfficesList : window.renderOfficesList;
  window.searchOfficeByDoc = typeof searchOfficeByDoc !== 'undefined' ? searchOfficeByDoc : window.searchOfficeByDoc;
  window.openOfficeModal = typeof openOfficeModal !== 'undefined' ? openOfficeModal : window.openOfficeModal;
  window.openEditOfficeModal = typeof openEditOfficeModal !== 'undefined' ? openEditOfficeModal : window.openEditOfficeModal;
  window.closeOfficeModal = typeof closeOfficeModal !== 'undefined' ? closeOfficeModal : window.closeOfficeModal;
  window.addOfficeMemberRow = typeof addOfficeMemberRow !== 'undefined' ? addOfficeMemberRow : window.addOfficeMemberRow;
  window.fetchOfficeCnpjFromModal = typeof fetchOfficeCnpjFromModal !== 'undefined' ? fetchOfficeCnpjFromModal : window.fetchOfficeCnpjFromModal;
  window.handleSaveOffice = typeof handleSaveOffice !== 'undefined' ? handleSaveOffice : window.handleSaveOffice;
  window.quickSaveOffice = typeof quickSaveOffice !== 'undefined' ? quickSaveOffice : window.quickSaveOffice;
  window.deleteOffice = typeof deleteOffice !== 'undefined' ? deleteOffice : window.deleteOffice;
  window.deleteCurrentModalOffice = typeof deleteCurrentModalOffice !== 'undefined' ? deleteCurrentModalOffice : window.deleteCurrentModalOffice;
})();
