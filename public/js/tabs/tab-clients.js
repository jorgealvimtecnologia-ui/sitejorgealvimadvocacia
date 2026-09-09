/**
 * ============================================================================
 * SUBMÓDULO DESACOPLADO: MÓDULO: GESTÃO DE CLIENTES & CONTRATOS
 * Origem: Decomposição arquitetural do painel-1-app.js
 * ============================================================================
 */

(function () {
  'use strict';

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

    function closeClientModal(force) {
      if (!force && typeof window.confirmDiscardModalChanges === 'function') {
        if (!window.confirmDiscardModalChanges('client-modal', 'no cadastro do cliente')) return;
      }
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
          if (typeof window.clearUnsavedChanges === 'function') window.clearUnsavedChanges('client-modal');
          closeClientModal(true);
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


  // ==========================================================================
  // EXPORTAÇÕES GLOBAIS PARA INTERFACE (ONCLICK & COMPATIBILIDADE)
  // ==========================================================================
  window.loadClients = typeof loadClients !== 'undefined' ? loadClients : window.loadClients;
  window.updateClientsStats = typeof updateClientsStats !== 'undefined' ? updateClientsStats : window.updateClientsStats;
  window.filterClients = typeof filterClients !== 'undefined' ? filterClients : window.filterClients;
  window.renderClients = typeof renderClients !== 'undefined' ? renderClients : window.renderClients;
  window.recalcInlineRow = typeof recalcInlineRow !== 'undefined' ? recalcInlineRow : window.recalcInlineRow;
  window.saveInlineClient = typeof saveInlineClient !== 'undefined' ? saveInlineClient : window.saveInlineClient;
  window.triggerClientDocUpload = typeof triggerClientDocUpload !== 'undefined' ? triggerClientDocUpload : window.triggerClientDocUpload;
  window.toggleClientTypeUI = typeof toggleClientTypeUI !== 'undefined' ? toggleClientTypeUI : window.toggleClientTypeUI;
  window.recalcContractBalances = typeof recalcContractBalances !== 'undefined' ? recalcContractBalances : window.recalcContractBalances;
  window.setClientStep = typeof setClientStep !== 'undefined' ? setClientStep : window.setClientStep;
  window.nextClientStep = typeof nextClientStep !== 'undefined' ? nextClientStep : window.nextClientStep;
  window.prevClientStep = typeof prevClientStep !== 'undefined' ? prevClientStep : window.prevClientStep;
  window.openNewClientModal = typeof openNewClientModal !== 'undefined' ? openNewClientModal : window.openNewClientModal;
  window.openEditClientModal = typeof openEditClientModal !== 'undefined' ? openEditClientModal : window.openEditClientModal;
  window.closeClientModal = typeof closeClientModal !== 'undefined' ? closeClientModal : window.closeClientModal;
  window.handleSaveClient = typeof handleSaveClient !== 'undefined' ? handleSaveClient : window.handleSaveClient;
  window.deleteClient = typeof deleteClient !== 'undefined' ? deleteClient : window.deleteClient;
})();
