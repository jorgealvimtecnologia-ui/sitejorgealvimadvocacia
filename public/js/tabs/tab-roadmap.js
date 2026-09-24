/**
 * MÓDULO ROADMAP VIVO & RADAR TECNOLÓGICO 2026–2029 (UNIFICADO)
 * Jorge Alvim Advocacia & Legaltech — OAB/MG 222.943
 *
 * Integração da Arquitetura de 4 Camadas, Memória Técnica Internacional
 * (iManage, Clio, Actionstep, Harvey AI) e Auditoria de Fluxo Forense.
 */
(function () {
  'use strict';

  var _roadmapData = null;
  var _selectedYear = '2026';
  var _viewMode = 'years'; // 'years' | 'waves' | 'functions' | 'history'
  var _searchQuery = '';

  function formatDateTime(isoStr) {
    if (!isoStr) return { date: 'N/A', time: 'N/A', full: 'N/A' };
    var d = new Date(isoStr);
    var dia = String(d.getDate()).padStart(2, '0');
    var mes = String(d.getMonth() + 1).padStart(2, '0');
    var ano = d.getFullYear();
    var hora = String(d.getHours()).padStart(2, '0');
    var min = String(d.getMinutes()).padStart(2, '0');
    var seg = String(d.getSeconds()).padStart(2, '0');
    return {
      date: dia + '/' + mes + '/' + ano,
      time: hora + ':' + min + ':' + seg,
      full: dia + '/' + mes + '/' + ano + ' às ' + hora + ':' + min + ':' + seg
    };
  }

  function getToken() {
    if (typeof window.getToken === 'function') {
      var t = window.getToken();
      if (t) return t;
    }
    return localStorage.getItem('ja_admin_token') || localStorage.getItem('token') || sessionStorage.getItem('ja_admin_token') || sessionStorage.getItem('token') || '';
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  async function loadRoadmapTab() {
    var container = document.getElementById('roadmap-live-container');
    if (!container) return;

    container.innerHTML = `
      <div class="p-12 text-center text-slate-400 bg-white rounded-3xl border border-slate-200">
        <div class="inline-block animate-spin text-3xl mb-3">🔄</div>
        <div class="font-bold text-slate-700 text-sm">Carregando Telemetria do Roadmap Vivo Unificado...</div>
        <div class="text-xs text-slate-400 mt-1">Auditando 4 camadas, padrões internacionais e fluxo forense</div>
      </div>
    `;

    try {
      var token = getToken();
      var res = await fetch('/api/admin/roadmap', {
        headers: { 'Authorization': 'Bearer ' + token }
      });

      if (!res.ok) {
        throw new Error('Falha HTTP ' + res.status + ' ao consultar roadmap');
      }

      var data = await res.json();
      if (!data.success) throw new Error(data.error || 'Erro desconhecido');

      _roadmapData = data;
      renderRoadmap(container);
    } catch (err) {
      console.error('[ROADMAP] Erro ao carregar aba:', err);
      container.innerHTML = `
        <div class="p-8 bg-rose-50 border border-rose-200 rounded-3xl text-center">
          <div class="text-2xl mb-2">⚠️</div>
          <div class="font-bold text-rose-800 text-sm">Não foi possível carregar a telemetria do Roadmap</div>
          <div class="text-xs text-rose-600 mt-1">${escapeHtml(err.message)}</div>
          <button onclick="window.loadRoadmapTab()" class="mt-4 px-4 py-2 bg-rose-600 text-white rounded-xl text-xs font-bold hover:bg-rose-700 transition-all cursor-pointer">Tentar Novamente</button>
        </div>
      `;
    }
  }

  function renderRoadmap(container) {
    if (!_roadmapData) return;

    var overall = _roadmapData.overall;
    var layers = _roadmapData.layers;
    var tel = _roadmapData.telemetry;
    var pipeline = _roadmapData.pipelineStages || [];
    var benchmarks = _roadmapData.internationalBenchmarks || [];

    var html = `
      <div class="space-y-6">
        <!-- 1. Header Hero do Roadmap Vivo Unificado -->
        <div class="relative overflow-hidden rounded-3xl border border-slate-800 p-6 sm:p-8 shadow-xl" style="background: linear-gradient(135deg, #020617 0%, #0f172a 50%, #0a192f 100%); color: #ffffff;">
          <div class="absolute -right-10 -bottom-10 opacity-10 pointer-events-none text-9xl">🗺️</div>
          <div class="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div class="space-y-1.5">
              <div class="flex flex-wrap items-center gap-2">
                <span class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-bold tracking-wide uppercase" style="background: rgba(245, 158, 11, 0.15); color: #fbbf24; border: 1px solid rgba(245, 158, 11, 0.3);">
                  🏛️ Legaltech 2026–2029 • ${overall.oab}
                </span>
                <span class="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold" style="background: rgba(16, 185, 129, 0.2); color: #34d399; border: 1px solid rgba(16, 185, 129, 0.4);">
                  🏆 Auditoria de Fluxo: ${overall.flow_audit_score}
                </span>
              </div>
              <h1 class="text-2xl sm:text-3xl font-black tracking-tight flex items-center gap-2.5" style="color: #ffffff;">
                <span>Radar Tecnológico & Roadmap Vivo</span>
                <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold" style="background: rgba(16, 185, 129, 0.2); color: #34d399; border: 1px solid rgba(16, 185, 129, 0.4);">ONLINE</span>
              </h1>
              <p class="text-xs sm:text-sm max-w-2xl leading-relaxed" style="color: #cbd5e1;">
                Plataforma com alinhamento internacional de Information Governance (iManage, Clio, Actionstep, Harvey AI) e expansão SaaS B2B. Auto-auditoria em tempo real sob o Provimento 205/2021 do CFOAB e LGPD.
              </p>
            </div>
            
            <div class="flex flex-row md:flex-col items-center md:items-end gap-3 shrink-0">
              <div class="text-right">
                <div class="text-[11px] uppercase font-semibold" style="color: #94a3b8;">Índice Geral de Aderência</div>
                <div class="text-3xl sm:text-4xl font-black" style="color: #f59e0b;">${overall.compliance_percentage}%</div>
                <div class="text-[10px]" style="color: #94a3b8;">${overall.delivered_count} no ar • ${overall.partial_count} parciais • ${overall.planned_count} planejados</div>
              </div>
              <div class="flex items-center gap-2 mt-1">
                <a href="/api/admin/relatorios/relatorio_roadmap_modificacoes.pdf?token=${encodeURIComponent(getToken())}" target="_blank" class="px-3.5 py-2 rounded-xl text-white font-bold text-xs shadow-md transition-all flex items-center gap-1.5 cursor-pointer" style="background: #d97706;">
                  <span>📄</span> Baixar Relatório PDF
                </a>
                <button onclick="window.loadRoadmapTab()" class="px-3 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer" style="background: #1e293b; color: #e2e8f0; border: 1px solid #334155;" title="Recarregar telemetria">
                  ↻
                </button>
              </div>
            </div>
          </div>

          <!-- Faixa de Telemetria Dinâmica -->
          <div class="mt-6 pt-5 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs" style="border-top: 1px solid rgba(51, 65, 85, 0.7);">
            <div class="rounded-xl p-3" style="background: rgba(15, 23, 42, 0.8); border: 1px solid rgba(51, 65, 85, 0.6);">
              <div class="text-[10px] font-semibold uppercase" style="color: #94a3b8;">Processos c/ CNJ</div>
              <div class="text-lg font-black mt-0.5" style="color: #34d399;">${tel.total_lawsuits} ativos</div>
            </div>
            <div class="rounded-xl p-3" style="background: rgba(15, 23, 42, 0.8); border: 1px solid rgba(51, 65, 85, 0.6);">
              <div class="text-[10px] font-semibold uppercase" style="color: #94a3b8;">Prazos Monitorados</div>
              <div class="text-lg font-black mt-0.5" style="color: #fbbf24;">${tel.pending_deadlines} na janela</div>
            </div>
            <div class="rounded-xl p-3" style="background: rgba(15, 23, 42, 0.8); border: 1px solid rgba(51, 65, 85, 0.6);">
              <div class="text-[10px] font-semibold uppercase" style="color: #94a3b8;">Criptografia & Cifras</div>
              <div class="text-lg font-black mt-0.5" style="color: #38bdf8;">${tel.tls_version}</div>
            </div>
            <div class="rounded-xl p-3" style="background: rgba(15, 23, 42, 0.8); border: 1px solid rgba(51, 65, 85, 0.6);">
              <div class="text-[10px] font-semibold uppercase" style="color: #94a3b8;">Infraestrutura VPS</div>
              <div class="text-lg font-black mt-0.5" style="color: #a855f7;">${overall.infrastructure_cost}</div>
            </div>
          </div>
        </div>

        <!-- 2. Esteira Sequencial de Atendimento Forense (7 Etapas Ponta a Ponta) -->
        <div class="bg-white rounded-3xl border border-slate-200 shadow-sm p-5 sm:p-6">
          <div class="flex items-center justify-between mb-3 border-b border-slate-100 pb-3">
            <h2 class="text-sm font-black text-slate-900 flex items-center gap-2">
              <span>🔄</span> Esteira Sequencial de Atendimento Forense (Ciclo de Vida 1:N)
            </h2>
            <span class="text-[11px] font-bold text-amber-700 bg-amber-50 px-2.5 py-0.5 rounded-full border border-amber-200">Zero Digitação & Sem Fricção</span>
          </div>

          <div class="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2.5 pt-1">
            ${pipeline.map(function(st, idx){
              var isDone = st.status === 'delivered';
              return `
                <div class="p-3 rounded-2xl border flex flex-col justify-between ${isDone ? 'bg-emerald-50/40 border-emerald-200' : 'bg-slate-50 border-slate-200'}">
                  <div>
                    <div class="flex items-center justify-between text-[11px] font-black text-slate-400 mb-1">
                      <span>#${st.step}</span>
                      <span>${st.icon}</span>
                    </div>
                    <div class="text-xs font-bold text-slate-900 leading-tight">${st.name}</div>
                  </div>
                  <div class="mt-2 pt-2 border-t border-slate-200/60 flex items-center justify-between text-[10px]">
                    <span class="${isDone ? 'text-emerald-700 font-bold' : 'text-amber-700 font-medium'}">${isDone ? '🟢 Operacional' : '🟡 Em Evolução'}</span>
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        </div>

        <!-- 3. As 4 Camadas da Plataforma (Cards Interativos com Barras de Progresso) -->
        <div>
          <div class="flex items-center justify-between mb-4">
            <h2 class="text-lg font-black text-slate-900 flex items-center gap-2">
              <span>🏛️</span> As 4 Camadas Arquiteturais
            </h2>
            <span class="text-xs text-slate-500 font-medium">Auditoria contínua de integridade</span>
          </div>

          <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            ${renderLayerCard(layers.core)}
            ${renderLayerCard(layers.security)}
            ${renderLayerCard(layers.integrations)}
            ${renderLayerCard(layers.ai)}
          </div>
        </div>

        <!-- 4. Padrões Internacionais de Information Governance -->
        <div class="bg-gradient-to-r from-slate-900 to-navy-950 rounded-3xl p-5 sm:p-6 text-white shadow-md">
          <div class="flex items-center justify-between mb-3 border-b border-slate-800 pb-3">
            <div class="flex items-center gap-2.5">
              <span class="text-xl">🌐</span>
              <div>
                <h3 class="font-black text-sm text-white">Alinhamento aos Padrões Globais de LegalTech</h3>
                <p class="text-[11px] text-slate-400">Benchmarking internacional (Magic Circle & Global 100)</p>
              </div>
            </div>
            <span class="text-xs font-bold px-2.5 py-1 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30">Nível Ouro</span>
          </div>

          <div class="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-5 gap-3 pt-1">
            ${benchmarks.map(function(bm){
              return `
                <div class="p-3 rounded-2xl border border-slate-800 bg-slate-900/60 flex flex-col justify-between">
                  <div>
                    <div class="text-[10px] font-bold text-amber-400 uppercase tracking-wide">${bm.area}</div>
                    <div class="text-xs font-black text-white mt-0.5">${bm.standard}</div>
                    <div class="text-[11px] text-slate-300 mt-1.5 leading-snug">${bm.feature}</div>
                  </div>
                  <div class="mt-3 pt-2 border-t border-slate-800 text-[10px] text-emerald-400 font-bold flex items-center justify-between">
                    <span>Horizonte:</span>
                    <span class="px-2 py-0.5 rounded bg-slate-800 text-slate-200">${bm.status}</span>
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        </div>

        <!-- 4.1 Auditoria de Arquitetura Cloud & Parecer Técnico (OAB & LGPD) -->
        <div class="bg-white rounded-3xl border border-slate-200 shadow-sm p-6 sm:p-7 space-y-5">
          <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
            <div>
              <div class="flex items-center gap-2">
                <span class="text-xs font-bold px-2.5 py-0.5 rounded-full bg-blue-100 text-blue-800 border border-blue-200">Parecer Técnico Cloud</span>
                <span class="text-xs font-bold px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200">Scorecard de Maturidade</span>
              </div>
              <h2 class="text-lg font-black text-slate-900 mt-1 flex items-center gap-2">
                <span>🛡️</span> Auditoria de Arquitetura Cloud & Blindagem de Risco
              </h2>
              <p class="text-xs text-slate-500 mt-0.5">Diagnóstico de engenharia: VPS Contabo (Frankfurt), persistência SQLite WAL e compliance ético OAB/LGPD</p>
            </div>
            <div class="text-right sm:text-right shrink-0">
              <span class="text-[11px] font-bold text-slate-500 block">Ambiente Auditado:</span>
              <span class="text-xs font-black text-slate-800">Contabo KVM • SQLite 43 Índices</span>
            </div>
          </div>

          <!-- Scorecard dos 5 Pilares Computacionais -->
          <div class="overflow-x-auto">
            <table class="w-full text-left text-xs border-collapse">
              <thead>
                <tr class="border-b border-slate-200 bg-slate-50 text-slate-600 font-bold uppercase text-[10px]">
                  <th class="p-3">Pilar Computacional</th>
                  <th class="p-3">Estado Real no Código</th>
                  <th class="p-3 text-center">Nível de Risco</th>
                  <th class="p-3">Veredito do Arquiteto & Ação de Engenharia</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-100 text-slate-700">
                ${((_roadmapData.cloudAudit && _roadmapData.cloudAudit.scorecard) || []).map(function(sc){
                  var badgeColor = sc.risco === 'BLINDADO' ? 'bg-emerald-100 text-emerald-800 border-emerald-300' :
                                   sc.risco === 'CRÍTICO' ? 'bg-rose-100 text-rose-800 border-rose-300' :
                                   sc.risco === 'MÉDIO' ? 'bg-amber-100 text-amber-800 border-amber-300' : 'bg-slate-100 text-slate-700 border-slate-200';
                  return `
                    <tr>
                      <td class="p-3 font-bold text-slate-900 whitespace-nowrap">${escapeHtml(sc.pilar)}</td>
                      <td class="p-3 font-medium text-slate-700">${escapeHtml(sc.estado)}</td>
                      <td class="p-3 text-center whitespace-nowrap">
                        <span class="px-2 py-0.5 rounded-full text-[10px] font-black border ${badgeColor}">${sc.risco}</span>
                      </td>
                      <td class="p-3">
                        <div class="text-slate-800 font-semibold leading-tight">${escapeHtml(sc.veredito)}</div>
                        <div class="text-[11px] text-slate-500 mt-0.5 leading-tight">${escapeHtml(sc.acao)}</div>
                      </td>
                    </tr>
                  `;
                }).join('')}
              </tbody>
            </table>
          </div>

          <!-- As 3 Fases do Parecer Executivo -->
          <div class="grid grid-cols-1 md:grid-cols-3 gap-3 pt-2">
            ${((_roadmapData.cloudAudit && _roadmapData.cloudAudit.phases) || []).map(function(ph){
              return `
                <div class="p-3.5 rounded-2xl border border-slate-200 bg-slate-50/70 flex flex-col justify-between">
                  <div>
                    <div class="flex items-center justify-between">
                      <span class="text-[11px] font-black text-slate-900">${ph.name}</span>
                      <span class="text-[9px] font-bold px-2 py-0.5 rounded-full ${ph.status === 'Em Finalização' ? 'bg-emerald-100 text-emerald-800 border border-emerald-300' : 'bg-slate-200 text-slate-700'}">${ph.status}</span>
                    </div>
                    <ul class="mt-2.5 space-y-1.5 text-xs text-slate-600">
                      ${ph.items.map(function(it){
                        return `<li class="flex items-start gap-1.5"><span class="text-emerald-600 mt-0.5">▪</span><span>${escapeHtml(it)}</span></li>`;
                      }).join('')}
                    </ul>
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        </div>

        <!-- 4.2 Módulo de Apoio ao Usuário, Resiliência & Prevenção de Falhas (JawSupport) -->
        <div class="bg-white rounded-3xl border border-slate-200 shadow-sm p-6 sm:p-7 space-y-4">
          <div class="flex items-center justify-between border-b border-slate-100 pb-3">
            <div>
              <h2 class="text-lg font-black text-slate-900 flex items-center gap-2">
                <span>🛡️</span> Resiliência de Interface & Apoio ao Usuário (100% Ativo)
              </h2>
              <p class="text-xs text-slate-500 mt-0.5">Recursos operacionais nativos em execução para blindagem contra perda de dados e fadiga do advogado</p>
            </div>
            <span class="text-xs font-bold text-emerald-800 bg-emerald-100 border border-emerald-200 px-3 py-1 rounded-full">JawSupport Ativo</span>
          </div>

          <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            ${((_roadmapData.userSupport && _roadmapData.userSupport.features) || []).map(function(uf){
              return `
                <div class="p-3.5 rounded-2xl border border-slate-200 bg-emerald-50/20 hover:bg-emerald-50/40 transition-all flex flex-col justify-between">
                  <div>
                    <div class="flex items-center justify-between">
                      <span class="text-xs font-black text-slate-900">${escapeHtml(uf.name)}</span>
                      <span class="text-[9px] font-bold px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 border border-emerald-200">ATIVO</span>
                    </div>
                    <p class="text-[11px] text-slate-600 mt-1.5 leading-snug">${escapeHtml(uf.desc)}</p>
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        </div>

        <!-- 4.3 Ações Externas & Credenciais do Titular (Backlog do Dr. Jorge) -->
        <div class="bg-white rounded-3xl border border-slate-200 shadow-sm p-6 sm:p-7 space-y-4">
          <div class="flex items-center justify-between border-b border-slate-100 pb-3">
            <div>
              <h2 class="text-lg font-black text-slate-900 flex items-center gap-2">
                <span>🔑</span> Ações Externas & Configurações do Titular
              </h2>
              <p class="text-xs text-slate-500 mt-0.5">Credenciais e decisões estratégicas reservadas ao Dr. Jorge Eduardo da Silva Alvim</p>
            </div>
            <span class="text-xs font-bold text-amber-800 bg-amber-100 border border-amber-200 px-3 py-1 rounded-full">Ações do Titular</span>
          </div>

          <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            ${((_roadmapData.externalPendingActions) || []).map(function(act){
              var badgeClass = act.badge.includes('AÇÃO') ? 'bg-amber-100 text-amber-900 border-amber-300' :
                               act.badge.includes('TRAVA') ? 'bg-rose-100 text-rose-900 border-rose-300' :
                               act.badge.includes('DECISÃO') ? 'bg-blue-100 text-blue-900 border-blue-300' : 'bg-purple-100 text-purple-900 border-purple-300';
              return `
                <div class="p-3.5 rounded-2xl border border-slate-200 bg-slate-50/70 hover:bg-slate-50 transition-all flex flex-col justify-between">
                  <div>
                    <div class="flex items-center justify-between gap-2">
                      <span class="text-[10px] font-bold text-slate-500 uppercase tracking-wide">${escapeHtml(act.origin)}</span>
                      <span class="text-[9px] font-black px-2 py-0.5 rounded-full border ${badgeClass}">${act.badge}</span>
                    </div>
                    <div class="text-xs font-bold text-slate-900 mt-1">${escapeHtml(act.title)}</div>
                    <div class="text-[11px] text-slate-600 mt-1 leading-snug">${escapeHtml(act.impact)}</div>
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        </div>

        <!-- 4.4 Centro de Comando & Ordens do Construtor do Site (Directives Console) -->
        ${renderBuilderOrdersSection()}

        <!-- 5. Checklists Ano a Ano & Ondas de Entrega -->
        <div class="bg-white rounded-3xl border border-slate-200 shadow-sm p-6 sm:p-7 space-y-5">
          <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-4">
            <div>
              <h2 class="text-lg font-black text-slate-900 flex items-center gap-2">
                <span>🎯</span> Planejamento & Cronograma de Execução
              </h2>
              <p class="text-xs text-slate-500 mt-0.5">Navegue pelas entregas por ano civil ou pela metodologia ágil de 5 Ondas de Entrega</p>
            </div>

            <!-- Seletor de Modo de Visualização (Anos vs Ondas vs Funções vs Histórico) -->
            <div class="flex flex-wrap items-center gap-2">
              <div class="inline-flex p-1 rounded-2xl bg-slate-100 border border-slate-200 text-xs font-bold">
                <button type="button" onclick="window.switchRoadmapView('years')" class="px-3 py-1.5 rounded-xl transition-all cursor-pointer ${_viewMode === 'years' ? 'bg-navy-950 text-white shadow-sm' : 'text-slate-600 hover:text-slate-900'}">
                  📅 Por Ano
                </button>
                <button type="button" onclick="window.switchRoadmapView('waves')" class="px-3 py-1.5 rounded-xl transition-all cursor-pointer ${_viewMode === 'waves' ? 'bg-navy-950 text-white shadow-sm' : 'text-slate-600 hover:text-slate-900'}">
                  🌊 Por Ondas
                </button>
                <button type="button" onclick="window.switchRoadmapView('functions')" class="px-3 py-1.5 rounded-xl transition-all cursor-pointer ${_viewMode === 'functions' ? 'bg-navy-950 text-white shadow-sm' : 'text-slate-600 hover:text-slate-900'}">
                  ⚡ Funções do Sistema
                </button>
                <button type="button" onclick="window.switchRoadmapView('history')" class="px-3 py-1.5 rounded-xl transition-all cursor-pointer ${_viewMode === 'history' ? 'bg-navy-950 text-white shadow-sm' : 'text-slate-600 hover:text-slate-900'}">
                  📜 Histórico Completo
                </button>
              </div>

              ${_viewMode === 'years' ? `
                <div class="inline-flex p-1 rounded-2xl bg-slate-100 border border-slate-200 text-xs font-bold">
                  ${['2026', '2027', '2028', '2029'].map(function(y){
                    var active = (_selectedYear === y);
                    return `
                      <button type="button" onclick="window.selectRoadmapYear('${y}')" class="px-2.5 py-1.5 rounded-xl transition-all cursor-pointer ${active ? 'bg-amber-500 text-slate-950 font-black shadow-sm' : 'text-slate-600 hover:text-slate-900'}">
                        ${y} ${y === '2026' ? '🔥' : ''}
                      </button>
                    `;
                  }).join('')}
                </div>
              ` : ''}
            </div>
          </div>

          <!-- Barra de Pesquisa em Tempo Real do Roadmap Vivo -->
          <div class="flex items-center gap-3 bg-slate-50 border border-slate-200 rounded-2xl px-4 py-2.5 shadow-2xs">
            <span class="text-slate-400 text-sm">🔍</span>
            <input 
              type="text" 
              id="roadmap-search-input" 
              value="${escapeHtml(_searchQuery)}" 
              placeholder="Pesquisar ordens, histórico por data/hora, critérios ou funções do sistema..." 
              oninput="window.setRoadmapSearch(this.value)" 
              class="w-full bg-transparent text-xs text-slate-800 placeholder-slate-400 focus:outline-none"
            />
            ${_searchQuery ? `
              <button onclick="window.setRoadmapSearch('')" class="text-xs text-slate-400 hover:text-slate-700 font-bold px-1.5 py-0.5 rounded cursor-pointer">✕ Limpar</button>
            ` : ''}
          </div>

          <!-- Conteúdo Dinâmico (Anos, Ondas, Funções ou Histórico) -->
          <div id="roadmap-plan-content">
            ${_viewMode === 'years' ? renderYearChecklist(_selectedYear) :
              _viewMode === 'waves' ? renderWavesChecklist() :
              _viewMode === 'functions' ? renderFunctionsCatalog() :
              renderHistory()}
          </div>
        </div>

        <!-- 6. Comparativo de Mercado Jurídico -->
        <div class="bg-white rounded-3xl border border-slate-200 shadow-sm p-6 sm:p-7 space-y-4">
          <div class="flex items-center justify-between">
            <h2 class="text-lg font-black text-slate-900 flex items-center gap-2">
              <span>⚖️</span> Comparativo de Soluções: Jorge Alvim vs. Mercado
            </h2>
            <span class="text-xs font-bold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-200">Soberania Própria 100%</span>
          </div>
          <div class="overflow-x-auto">
            <table class="w-full text-left text-xs border-collapse">
              <thead>
                <tr class="border-b border-slate-200 bg-slate-50 text-slate-600 font-bold uppercase text-[10px]">
                  <th class="p-3">Recurso / Diferencial</th>
                  <th class="p-3 bg-amber-50 text-amber-950 font-black">Plataforma Jorge Alvim</th>
                  <th class="p-3">Projuris</th>
                  <th class="p-3">SAJ ADV</th>
                  <th class="p-3">Astrea</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-100 text-slate-700">
                <tr>
                  <td class="p-3 font-semibold text-slate-900">Propriedade dos Dados</td>
                  <td class="p-3 bg-amber-50/50 font-bold text-emerald-700">100% Própria (VPS Dedicada)</td>
                  <td class="p-3 text-slate-500">Nuvem Compartilhada</td>
                  <td class="p-3 text-slate-500">Nuvem Compartilhada</td>
                  <td class="p-3 text-slate-500">Nuvem Compartilhada</td>
                </tr>
                <tr>
                  <td class="p-3 font-semibold text-slate-900">Custo Mensal de Licença</td>
                  <td class="p-3 bg-amber-50/50 font-bold text-emerald-700">R$ 0 (Apenas Servidor ~R$ 40)</td>
                  <td class="p-3 text-slate-500">R$ 350 - R$ 1.200+/mês</td>
                  <td class="p-3 text-slate-500">R$ 250 - R$ 800+/mês</td>
                  <td class="p-3 text-slate-500">R$ 190 - R$ 600+/mês</td>
                </tr>
                <tr>
                  <td class="p-3 font-semibold text-slate-900">Sigilo OAB & IA Local</td>
                  <td class="p-3 bg-amber-50/50 font-bold text-emerald-700">Total (Sem vazamento de dados)</td>
                  <td class="p-3 text-slate-500">IA em nuvem externa</td>
                  <td class="p-3 text-slate-500">IA em nuvem externa</td>
                  <td class="p-3 text-slate-500">Sem IA local</td>
                </tr>
                <tr>
                  <td class="p-3 font-semibold text-slate-900">Cockpit Executivo (5s)</td>
                  <td class="p-3 bg-amber-50/50 font-bold text-emerald-700">Nativo com Semáforo de Risco</td>
                  <td class="p-3 text-slate-500">Relatórios manuais</td>
                  <td class="p-3 text-slate-500">Dashboard básico</td>
                  <td class="p-3 text-slate-500">Dashboard básico</td>
                </tr>
                <tr>
                  <td class="p-3 font-semibold text-slate-900">Ponto Eletrônico c/ Geo</td>
                  <td class="p-3 bg-amber-50/50 font-bold text-emerald-700">Nativo e Integrado</td>
                  <td class="p-3 text-slate-500">Não possui (exige terceiro)</td>
                  <td class="p-3 text-slate-500">Não possui</td>
                  <td class="p-3 text-slate-500">Não possui</td>
                </tr>
                <tr>
                  <td class="p-3 font-semibold text-slate-900">Expansão SaaS B2B Multi-Tenant</td>
                  <td class="p-3 bg-amber-50/50 font-bold text-emerald-700">Planejado Q2/2027 (tenant_id)</td>
                  <td class="p-3 text-slate-500">Não aplicável (SaaS deles)</td>
                  <td class="p-3 text-slate-500">Não aplicável</td>
                  <td class="p-3 text-slate-500">Não aplicável</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    `;

    container.innerHTML = html;
  }

  var STATUS_META = {
    planejado: { label: '⚪ Planejada', cls: 'bg-slate-700/40 text-slate-300 border-slate-600' },
    em_curso: { label: '🟡 Em execução', cls: 'bg-amber-500/20 text-amber-300 border-amber-500/40' },
    bloqueado: { label: '🔴 Bloqueada', cls: 'bg-rose-500/20 text-rose-300 border-rose-500/40' },
    conforme: { label: '🟢 Concluída', cls: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40' },
    cancelada: { label: '⚫ Arquivada', cls: 'bg-slate-800 text-slate-500 border-slate-700' }
  };

  function activeOrders() {
    return ((_roadmapData && _roadmapData.builderOrders) || []).filter(function (o) { return o.status !== 'cancelada'; });
  }

  function renderOrdersControlPanel(summary) {
    var c = summary.counts || {};
    var last = summary.last_activity;
    var cards = [
      { label: 'Planejadas', value: c.planejado || 0, color: '#cbd5e1' },
      { label: 'Em execução', value: c.em_curso || 0, color: '#fbbf24' },
      { label: 'Bloqueadas', value: c.bloqueado || 0, color: '#fb7185' },
      { label: 'Concluídas', value: c.conforme || 0, color: '#34d399' }
    ];
    var banner = summary.total === 0
      ? '<div class="p-3 rounded-xl bg-slate-800/60 border border-slate-700 text-xs text-slate-300">Nenhuma ordem lançada ainda. Use o formulário abaixo para programar a primeira.</div>'
      : summary.all_done
        ? '<div class="p-3 rounded-xl bg-emerald-500/15 border border-emerald-500/40 text-sm font-black text-emerald-300">✅ Todas as ordens programadas foram concluídas.</div>'
        : '<div class="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-xs font-bold text-amber-200">⏳ Faltam ' + summary.open + ' de ' + summary.total + ' ordem(ns) — ' + summary.progress_percentage + '% do programado concluído.</div>';
    return `
      <div class="space-y-3">
        <div class="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
          ${cards.map(function (k) {
            return '<div class="rounded-xl p-3 bg-slate-900/80 border border-slate-800"><div class="text-[10px] font-semibold uppercase text-slate-400">' + k.label + '</div><div class="text-2xl font-black mt-0.5" style="color:' + k.color + '">' + k.value + '</div></div>';
          }).join('')}
        </div>
        <div class="flex items-center gap-2.5">
          <div class="flex-1 bg-slate-800 rounded-full h-2 overflow-hidden">
            <div class="h-2 rounded-full bg-emerald-400 transition-all" style="width:${summary.progress_percentage || 0}%"></div>
          </div>
          <span class="text-[11px] font-bold text-slate-300 shrink-0">${c.conforme || 0}/${summary.total || 0} (${summary.progress_percentage || 0}%)</span>
        </div>
        ${banner}
        ${last ? '<div class="text-[11px] text-slate-400">Última atividade: <strong class="text-slate-200">' + escapeHtml(last.action) + '</strong> em ' + escapeHtml(last.order_id) + ' por <strong class="text-slate-200">' + escapeHtml(last.performed_by || '') + '</strong> — ' + formatDateTime(last.created_at).full + '</div>' : ''}
      </div>
    `;
  }

  function renderOrderCard(ord) {
    var meta = STATUS_META[ord.status] || STATUS_META.planejado;
    var id = escapeHtml(ord.id);
    var archived = ord.status === 'cancelada';
    return `
      <div class="p-4 rounded-2xl border border-slate-800 bg-slate-900/90 shadow-sm flex flex-col justify-between space-y-3 ${archived ? 'opacity-60' : ''}">
        <div>
          <div class="flex items-center justify-between gap-2">
            <div class="flex items-center gap-1.5">
              <span class="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-slate-800 text-indigo-300 border border-slate-700">${id}</span>
              <span class="text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-800 text-slate-400">${escapeHtml(ord.priority || 'P1')}</span>
            </div>
            <div class="flex items-center gap-1.5">
              ${archived ? `
                <button onclick="window.updateOrderStatus('${id}', 'planejado')" class="text-[10px] font-bold px-2 py-0.5 rounded-full border border-slate-600 text-slate-300 hover:bg-slate-800" title="Reabrir ordem">↺ Reabrir</button>
              ` : `
                <select onchange="window.updateOrderStatus('${id}', this.value)" class="text-[10px] font-black px-2 py-0.5 rounded-full border cursor-pointer ${meta.cls} bg-slate-900 focus:outline-none">
                  ${['planejado', 'em_curso', 'bloqueado', 'conforme'].map(function (st) {
                    return '<option value="' + st + '"' + (ord.status === st ? ' selected' : '') + '>' + STATUS_META[st].label + '</option>';
                  }).join('')}
                </select>
                <button onclick="window.deleteBuilderOrder('${id}')" class="text-slate-500 hover:text-rose-400 text-xs px-1.5 py-0.5 rounded hover:bg-slate-800 transition-colors" title="Arquivar ordem (fica no histórico)">🗄</button>
              `}
            </div>
          </div>

          <div class="text-xs font-bold text-white mt-2 leading-snug">${escapeHtml(ord.title)}</div>
          <div class="flex flex-wrap items-center gap-2 mt-1 text-[10px] text-slate-400">
            <span>${escapeHtml(ord.layer || '')}</span><span>•</span><span>${escapeHtml(ord.wave || '')}</span>
          </div>

          ${ord.description ? '<div class="mt-2 text-[11px] text-slate-300 leading-relaxed whitespace-pre-line">' + escapeHtml(ord.description) + '</div>' : ''}
          ${ord.acceptance_criteria ? `
            <div class="mt-2.5 p-2 rounded-xl bg-slate-950/60 border border-slate-800 text-[11px] text-slate-300 space-y-1">
              <div class="text-[9px] font-bold uppercase tracking-wider text-indigo-400">Critérios de aceite:</div>
              <div class="leading-relaxed whitespace-pre-line">${escapeHtml(ord.acceptance_criteria)}</div>
            </div>
          ` : ''}
        </div>

        <div class="pt-2 border-t border-slate-800/80 flex flex-wrap items-center justify-between gap-1 text-[10px] text-slate-500">
          <span>Lançada por ${escapeHtml(ord.created_by || 'construtor')} em ${formatDateTime(ord.created_at).date}</span>
          ${ord.status === 'em_curso' && ord.assigned_to ? '<span class="text-amber-300">Em execução com: ' + escapeHtml(ord.assigned_to) + '</span>' : ''}
          ${ord.status === 'conforme' && ord.completed_at ? '<span class="text-emerald-300">Concluída em ' + formatDateTime(ord.completed_at).date + '</span>' : ''}
        </div>
      </div>
    `;
  }

  function renderBuilderOrdersSection() {
    var all = (_roadmapData && _roadmapData.builderOrders) || [];
    var summary = (_roadmapData && _roadmapData.ordersSummary) || { counts: {}, open: 0, total: 0, progress_percentage: 0, all_done: false };
    var active = all.filter(function (o) { return o.status !== 'cancelada'; });
    var archived = all.filter(function (o) { return o.status === 'cancelada'; });

    return `
      <!-- Centro de Comando: painel de controle das Ordens do Construtor -->
      <div class="bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-950 rounded-3xl border border-indigo-900/60 shadow-xl p-6 sm:p-7 text-white space-y-6">
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-indigo-900/80 pb-4">
          <div class="space-y-1">
            <h2 class="text-lg sm:text-xl font-black text-white flex items-center gap-2">
              <span>🛠️</span> Centro de Comando: Minhas Ordens
            </h2>
            <p class="text-xs text-slate-300">
              Lance aqui o que deve ser construído. Claude e Antigravity leem esta lista, perguntam qual ordem executar e atualizam o andamento — tudo fica no histórico.
            </p>
          </div>
          <span class="text-xs font-bold px-3 py-1 rounded-full bg-indigo-600/30 text-indigo-200 border border-indigo-500/50 self-start sm:self-auto">
            ${summary.open} em aberto
          </span>
        </div>

        ${renderOrdersControlPanel(summary)}

        <!-- Formulário para lançar nova ordem -->
        <form id="builder-order-form" onsubmit="window.submitBuilderOrder(event)" class="bg-slate-900/80 border border-indigo-900/50 rounded-2xl p-4 sm:p-5 space-y-4">
          <div class="flex items-center justify-between">
            <div class="text-xs font-black uppercase tracking-wider text-indigo-300 flex items-center gap-1.5">
              <span>✍️</span> Lançar nova ordem
            </div>
            <span class="text-[10px] text-slate-400">Gravada no servidor do site</span>
          </div>

          <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
            <div class="lg:col-span-2">
              <label class="block text-[11px] font-bold text-slate-300 mb-1">O que deve ser feito *</label>
              <input type="text" id="order-title" required maxlength="200" placeholder="Ex.: Implementar OCR para extrair dados de RG/CNH" class="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition-colors">
            </div>

            <div>
              <label class="block text-[11px] font-bold text-slate-300 mb-1">Camada</label>
              <select id="order-layer" class="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-xs text-white focus:outline-none focus:border-indigo-500 transition-colors">
                <option value="Core Jurídico">⚙️ Core Jurídico</option>
                <option value="Inteligência Artificial">🤖 Inteligência Artificial</option>
                <option value="Conectividade & Integrações">🔗 Conectividade & Integrações</option>
                <option value="Segurança, Compliance & SaaS">🔒 Segurança & Compliance</option>
              </select>
            </div>

            <div>
              <label class="block text-[11px] font-bold text-slate-300 mb-1">Onda & prioridade</label>
              <div class="grid grid-cols-2 gap-1.5">
                <select id="order-wave" class="w-full px-2 py-2 rounded-xl bg-slate-950 border border-slate-700 text-[11px] text-white focus:outline-none focus:border-indigo-500">
                  <option value="Onda 0 — Blindagem Imediata">Onda 0 (P0)</option>
                  <option value="Onda 1 — Confiabilidade & SRE" selected>Onda 1 (SRE)</option>
                  <option value="Onda 2 — Governança & CI/CD">Onda 2 (CI/CD)</option>
                  <option value="Onda 3 — Produto & Captação">Onda 3 (Produto)</option>
                  <option value="Onda 4 — Escala SaaS B2B">Onda 4 (SaaS)</option>
                </select>
                <select id="order-priority" class="w-full px-2 py-2 rounded-xl bg-slate-950 border border-slate-700 text-[11px] text-white focus:outline-none focus:border-indigo-500">
                  <option value="P0">P0 (Crítico)</option>
                  <option value="P1" selected>P1 (Alta)</option>
                  <option value="P2">P2 (Normal)</option>
                </select>
              </div>
            </div>
          </div>

          <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label class="block text-[11px] font-bold text-slate-300 mb-1">Descrição / contexto</label>
              <textarea id="order-description" rows="2" maxlength="4000" placeholder="Explique com suas palavras o que você quer e por quê." class="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition-colors"></textarea>
            </div>
            <div>
              <label class="block text-[11px] font-bold text-slate-300 mb-1">Como saber que ficou pronto (critérios de aceite)</label>
              <textarea id="order-ac" rows="2" maxlength="4000" placeholder="Ex.: Enviar foto do RG preenche nome e CPF; funciona no celular." class="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition-colors"></textarea>
            </div>
          </div>

          <div class="flex items-center justify-end gap-2 pt-1">
            <button type="submit" id="btn-submit-order" class="px-4 py-2 rounded-xl font-bold text-xs shadow-md transition-all flex items-center gap-1.5 cursor-pointer bg-indigo-600 hover:bg-indigo-500 text-white">
              <span>🚀</span> Lançar ordem
            </button>
          </div>
        </form>

        <!-- Ordens em aberto e concluídas -->
        <div class="space-y-3">
          <div class="text-xs font-bold text-slate-300">📋 Ordens (em aberto primeiro)</div>
          ${active.length === 0
            ? '<div class="p-6 text-center rounded-2xl border border-dashed border-slate-700 bg-slate-950/40 text-slate-400 text-xs">Nenhuma ordem ativa.</div>'
            : '<div class="grid grid-cols-1 md:grid-cols-2 gap-3">' + active.map(renderOrderCard).join('') + '</div>'}
        </div>

        ${archived.length ? `
          <details class="rounded-2xl border border-slate-800 bg-slate-950/40 p-3">
            <summary class="text-xs font-bold text-slate-400 cursor-pointer">🗄 Arquivadas (${archived.length}) — continuam no histórico</summary>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">${archived.map(renderOrderCard).join('')}</div>
          </details>
        ` : ''}
      </div>
    `;
  }

  function renderLayerCard(layer) {
    return `
      <div class="bg-white rounded-3xl border border-slate-200 shadow-sm p-5 flex flex-col justify-between hover:shadow-md transition-shadow">
        <div>
          <div class="flex items-center justify-between mb-3">
            <span class="text-2xl">${layer.icon}</span>
            <span class="text-[10px] font-bold px-2 py-0.5 rounded-full" style="background:${layer.color}15; color:${layer.color}">
              ${layer.status_label}
            </span>
          </div>
          <h3 class="font-black text-slate-900 text-sm">${layer.name}</h3>
          <div class="flex items-baseline gap-1 mt-1">
            <span class="text-2xl font-black" style="color:${layer.color}">${layer.score}%</span>
            <span class="text-[11px] text-slate-400 font-medium">aderência</span>
          </div>

          <!-- Barra de Progresso -->
          <div class="w-full bg-slate-100 rounded-full h-2 mt-2.5 overflow-hidden">
            <div class="h-2 rounded-full transition-all" style="width: ${layer.score}%; background: ${layer.color}"></div>
          </div>

          <!-- Lista de Submódulos -->
          <ul class="mt-4 space-y-2 text-[11px] text-slate-600 border-t border-slate-100 pt-3">
            ${layer.modules.map(function(m){
              return `
                <li class="flex items-start justify-between gap-1.5">
                  <span class="font-medium text-slate-800 leading-tight">${m.name}</span>
                  <span class="shrink-0 text-[10px] font-bold">${m.badge}</span>
                </li>
              `;
            }).join('')}
          </ul>
        </div>
      </div>
    `;
  }

  function orderBelongsToWave(ord, wave) {
    if (!ord || !ord.wave || !wave || !wave.name) return false;
    var ordW = String(ord.wave).toLowerCase();
    var wavN = String(wave.name).toLowerCase();
    if (ordW === wavN) return true;
    var ordM = ordW.match(/onda\s*(\d)/);
    var wavM = wavN.match(/onda\s*(\d)/);
    if (ordM && wavM && ordM[1] === wavM[1]) return true;
    return false;
  }

  function renderYearChecklist(year) {
    var items = (_roadmapData && _roadmapData.checklists && _roadmapData.checklists[year]) || [];
    var builderOrders = activeOrders();
    var yearOrders = builderOrders.filter(function(o){
      var ordY = o.created_at ? new Date(o.created_at).getFullYear().toString() : '2026';
      return ordY === year;
    });

    var q = (_searchQuery || '').toLowerCase().trim();
    if (q) {
      items = items.filter(function(it){
        return (it.task || '').toLowerCase().includes(q) || (it.priority || '').toLowerCase().includes(q);
      });
      yearOrders = yearOrders.filter(function(ord){
        return (ord.title || '').toLowerCase().includes(q) ||
               (ord.id || '').toLowerCase().includes(q) ||
               (ord.acceptance_criteria || '').toLowerCase().includes(q) ||
               (ord.status || '').toLowerCase().includes(q) ||
               (ord.priority || '').toLowerCase().includes(q);
      });
    }

    if (!items.length && !yearOrders.length) {
      return '<div class="p-8 text-center rounded-2xl border border-slate-200 bg-slate-50 text-slate-500 text-xs">Nenhum item encontrado ' + (q ? 'para a busca "' + escapeHtml(q) + '"' : 'para este período.') + '</div>';
    }

    var descriptions = {
      '2026': '🎯 Foco Estratégico: Consolidação do Core Jurídico, DMS Matter-Centric com anexo direto, Zero Digitação (OCR Tesseract), WhatsApp Cloud API e RAG Local.',
      '2027': '🤖 Foco Estratégico: Conciliação Open Finance, Calculadora Previdenciária CNIS, Quality Gates (Actionstep), Biometria Facial Liveness e Arquitetura Multi-Tenant SaaS.',
      '2028': '🔗 Foco Estratégico: Inteligência Contratual com NLP, Peticionamento Eletrônico Direto via Robôs MNI e Criptografia em Repouso.',
      '2029': '📊 Foco Estratégico: Jurimetria Preditiva em Grande Escala, Precificação Algorítmica e Modelos Estocásticos de Fluxo de Caixa.'
    };

    return `
      <div class="space-y-4">
        <div class="p-3.5 rounded-2xl bg-amber-50/70 border border-amber-200/60 text-xs font-semibold text-amber-900">
          ${descriptions[year] || ''}
        </div>

        <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
          ${yearOrders.map(function(ord){
            var isDone = ord.status === 'conforme';
            var isCurrent = ord.status === 'em_curso';
            var isBlocked = ord.status === 'bloqueado';
            var priColor = ord.priority === 'P0' ? 'bg-rose-100 text-rose-800 border-rose-300' :
                           ord.priority === 'P1' ? 'bg-amber-100 text-amber-800 border-amber-300' : 'bg-blue-100 text-blue-800 border-blue-300';
            var cardBg = isDone ? 'bg-emerald-50/60 border-emerald-300' : isCurrent ? 'bg-amber-50/60 border-amber-300' : isBlocked ? 'bg-rose-50/60 border-rose-300' : 'bg-indigo-50/40 border-indigo-200';
            var statusBadge = isDone ? '🟢 Conforme' : isCurrent ? '🟡 Em Curso' : isBlocked ? '🔴 Bloqueado' : '⚪ Na Fila de Prioridades';

            return `
              <div class="p-3.5 rounded-2xl border transition-all flex flex-col justify-between ${cardBg}">
                <div>
                  <div class="flex items-center justify-between gap-1.5 mb-1.5">
                    <div class="flex items-center gap-1.5">
                      <span class="text-[9px] font-black uppercase px-2 py-0.5 rounded-md bg-indigo-600 text-white">
                        🛠️ Diretriz do Construtor
                      </span>
                      <span class="text-[9px] font-mono font-bold text-slate-500">${escapeHtml(ord.id)}</span>
                    </div>
                    <span class="text-[9px] font-black px-1.5 py-0.5 rounded border ${priColor}">${escapeHtml(ord.priority || 'P1')}</span>
                  </div>
                  <div class="text-xs font-bold text-slate-900 leading-snug">
                    ${escapeHtml(ord.title)}
                  </div>
                  ${ord.acceptance_criteria ? `
                    <div class="mt-2 text-[11px] text-slate-600 bg-white/80 rounded-xl p-2 border border-slate-200/80 leading-snug whitespace-pre-line">
                      <strong class="text-indigo-950 font-bold">Critérios de Aceite:</strong>
                      ${escapeHtml(ord.acceptance_criteria)}
                    </div>
                  ` : ''}
                </div>
                <div class="mt-2.5 pt-2 border-t border-slate-200/60 flex items-center justify-between text-[10px]">
                  <span class="font-bold ${isDone ? 'text-emerald-700' : isCurrent ? 'text-amber-700' : isBlocked ? 'text-rose-700' : 'text-indigo-700'}">
                    ${statusBadge}
                  </span>
                  <span class="text-slate-400">${escapeHtml(ord.wave || '')}</span>
                </div>
              </div>
            `;
          }).join('')}

          ${items.map(function(it){
            var isDone = it.done;
            return `
              <div class="p-3.5 rounded-2xl border transition-all flex items-start gap-3 ${isDone ? 'bg-emerald-50/40 border-emerald-200' : 'bg-slate-50/60 border-slate-200'}">
                <div class="mt-0.5 text-base">${isDone ? '✅' : '⏳'}</div>
                <div class="space-y-0.5 flex-1">
                  <div class="text-xs font-bold ${isDone ? 'text-emerald-950' : 'text-slate-800'}">
                    ${escapeHtml(it.task)}
                  </div>
                  <div class="text-[10px] ${isDone ? 'text-emerald-700 font-semibold' : 'text-slate-500'}">
                    ${isDone ? '🟢 Entregue e ativo em produção' : (it.horizon ? 'Horizonte ' + it.horizon + ' • Prioridade ' + (it.priority || 'P1') : '⚪ Programado no cronograma')}
                  </div>
                </div>
              </div>
            `;
          }).join('')}
        </div>
      </div>
    `;
  }

  function renderWavesChecklist() {
    var waves = (_roadmapData && _roadmapData.waves) || [];
    var builderOrders = activeOrders();
    if (!waves.length) return '<p class="text-xs text-slate-400 py-4">Nenhuma onda configurada na telemetria.</p>';

    return `
      <div class="space-y-4">
        <div class="p-3.5 rounded-2xl bg-sky-50/70 border border-sky-200/60 text-xs font-semibold text-sky-950 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <span>🌊 <strong>Metodologia por Ondas de Entrega</strong>: Priorização orientada a risco, integrando as diretrizes técnicas manifestadas pelo construtor com a esteira nativa da plataforma.</span>
          <span class="text-[10px] font-bold px-2.5 py-1 rounded-full bg-sky-200 text-sky-900 shrink-0 self-start sm:self-auto">5 Ondas Estratégicas</span>
        </div>

        <div class="grid grid-cols-1 gap-4">
          ${waves.map(function(wave){
            var waveOrders = builderOrders.filter(function(o){ return orderBelongsToWave(o, wave); });
            var waveItems = wave.items || [];
            if (q) {
              waveItems = waveItems.filter(function(it){
                return (it.task || '').toLowerCase().includes(q) || (it.priority || '').toLowerCase().includes(q);
              });
              waveOrders = waveOrders.filter(function(ord){
                return (ord.title || '').toLowerCase().includes(q) ||
                       (ord.id || '').toLowerCase().includes(q) ||
                       (ord.acceptance_criteria || '').toLowerCase().includes(q) ||
                       (ord.status || '').toLowerCase().includes(q) ||
                       (ord.priority || '').toLowerCase().includes(q);
              });
            }

            var totalCount = (wave.items ? wave.items.length : 0) + waveOrders.length;
            var doneSys = (wave.items ? wave.items.filter(function(it){ return it.done; }).length : 0);
            var doneOrd = waveOrders.filter(function(o){ return o.status === 'conforme'; }).length;
            var doneCount = doneSys + doneOrd;
            var pct = totalCount ? Math.round((doneCount / totalCount) * 100) : 0;

            return `
              <div class="p-5 rounded-3xl border border-slate-200 bg-white shadow-sm hover:shadow-md transition-shadow">
                <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
                  <div class="flex flex-wrap items-center gap-2.5">
                    <span class="w-3 h-3 rounded-full shrink-0" style="background:${wave.color};"></span>
                    <h3 class="font-black text-slate-900 text-sm sm:text-base">${escapeHtml(wave.name)}</h3>
                    <span class="text-[10px] font-bold px-2 py-0.5 rounded-full" style="background:${wave.color}15; color:${wave.color}; border: 1px solid ${wave.color}40;">
                      ${escapeHtml(wave.badge)}
                    </span>
                    ${waveOrders.length ? `
                      <span class="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-800 border border-indigo-200">
                        +${waveOrders.length} ${waveOrders.length === 1 ? 'Diretriz do Construtor' : 'Diretrizes do Construtor'}
                      </span>
                    ` : ''}
                  </div>
                  <div class="flex items-center gap-2 text-xs">
                    <span class="text-slate-500 font-medium">Janela estimada:</span>
                    <span class="font-black text-slate-800 bg-slate-100 px-2 py-0.5 rounded-md">${escapeHtml(wave.window)}</span>
                  </div>
                </div>

                <!-- Barra de Progresso da Onda -->
                <div class="flex items-center gap-2.5 mt-2.5">
                  <div class="flex-1 bg-slate-100 rounded-full h-2 overflow-hidden">
                    <div class="h-2 rounded-full transition-all" style="width: ${pct}%; background: ${wave.color};"></div>
                  </div>
                  <span class="text-[11px] font-bold text-slate-600 shrink-0">${doneCount}/${totalCount} (${pct}%)</span>
                </div>

                <div class="text-xs text-slate-600 font-medium mt-2">
                  <strong class="text-slate-800">Foco Principal:</strong> ${escapeHtml(wave.focus)}
                </div>

                <div class="grid grid-cols-1 md:grid-cols-2 gap-2.5 mt-3.5">
                  <!-- Ordens do Construtor nesta Onda -->
                  ${waveOrders.map(function(ord){
                    var isDone = ord.status === 'conforme';
                    var isCurrent = ord.status === 'em_curso';
                    var isBlocked = ord.status === 'bloqueado';
                    var priColor = ord.priority === 'P0' ? 'bg-rose-100 text-rose-800 border-rose-300' :
                                   ord.priority === 'P1' ? 'bg-amber-100 text-amber-800 border-amber-300' : 'bg-blue-100 text-blue-800 border-blue-300';
                    var statusBadge = isDone ? '🟢 Conforme' : isCurrent ? '🟡 Em Curso' : isBlocked ? '🔴 Bloqueado' : '⚪ Na Fila de Prioridades';
                    var cardBorder = isDone ? 'bg-emerald-50/60 border-emerald-300' :
                                     isCurrent ? 'bg-amber-50/60 border-amber-300' :
                                     isBlocked ? 'bg-rose-50/60 border-rose-300' : 'bg-indigo-50/40 border-indigo-200';

                    return `
                      <div class="p-3.5 rounded-2xl border transition-all flex flex-col justify-between ${cardBorder} shadow-xs">
                        <div>
                          <div class="flex items-center justify-between gap-1.5 mb-1.5">
                            <div class="flex items-center gap-1.5">
                              <span class="text-[9px] font-black uppercase px-2 py-0.5 rounded-md bg-indigo-600 text-white shadow-xs">
                                🛠️ Diretriz do Construtor
                              </span>
                              <span class="text-[9px] font-mono font-bold text-slate-500">${escapeHtml(ord.id)}</span>
                            </div>
                            <span class="text-[9px] font-black px-1.5 py-0.5 rounded border ${priColor}">${escapeHtml(ord.priority || 'P1')}</span>
                          </div>

                          <div class="text-xs font-bold text-slate-900 leading-snug">
                            ${escapeHtml(ord.title)}
                          </div>

                          ${ord.acceptance_criteria ? `
                            <div class="mt-2 text-[11px] text-slate-600 bg-white/80 rounded-xl p-2 border border-slate-200/80 leading-snug whitespace-pre-line">
                              <strong class="text-indigo-950 font-bold">Critérios de Aceite:</strong>
                              ${escapeHtml(ord.acceptance_criteria)}
                            </div>
                          ` : ''}
                        </div>

                        <div class="mt-2.5 pt-2 border-t border-slate-200/60 flex items-center justify-between text-[10px]">
                          <span class="font-bold ${isDone ? 'text-emerald-700' : isCurrent ? 'text-amber-700' : isBlocked ? 'text-rose-700' : 'text-indigo-700'}">
                            ${statusBadge}
                          </span>
                          <span class="text-slate-400">Por ${escapeHtml(ord.created_by || 'construtor')}</span>
                        </div>
                      </div>
                    `;
                  }).join('')}

                  <!-- Itens Nativos da Onda -->
                  ${waveItems.map(function(it){
                    var isDone = it.done;
                    var priColor = it.priority === 'P0' ? 'bg-rose-100 text-rose-800 border-rose-300' :
                                   it.priority === 'P1' ? 'bg-amber-100 text-amber-800 border-amber-300' : 'bg-blue-100 text-blue-800 border-blue-300';
                    return `
                      <div class="p-3 rounded-2xl border transition-all flex items-start gap-2.5 ${isDone ? 'bg-emerald-50/40 border-emerald-200' : 'bg-slate-50/70 border-slate-200'}">
                        <div class="mt-0.5 text-sm">${isDone ? '✅' : '⏳'}</div>
                        <div class="flex-1 min-w-0">
                          <div class="text-xs font-bold ${isDone ? 'text-emerald-950' : 'text-slate-900'} leading-tight">
                            ${escapeHtml(it.task)}
                          </div>
                          <div class="flex items-center gap-2 mt-1">
                            <span class="text-[9px] font-black px-1.5 py-0.5 rounded border ${priColor}">${escapeHtml(it.priority || 'P1')}</span>
                            <span class="text-[10px] ${isDone ? 'text-emerald-700 font-semibold' : 'text-slate-500'}">
                              ${isDone ? '🟢 Entregue em produção' : '⚪ Programado'}
                            </span>
                          </div>
                        </div>
                      </div>
                    `;
                  }).join('')}
                </div>
              </div>
            `;
          }).join('')}
        </div>
      </div>
    `;
  }

  function renderFunctionsCatalog() {
    var functions = (_roadmapData && _roadmapData.systemFunctions) || [];
    var q = (_searchQuery || '').toLowerCase().trim();

    if (q) {
      functions = functions.filter(function(fn){
        return (fn.name || '').toLowerCase().includes(q) ||
               (fn.module || '').toLowerCase().includes(q) ||
               (fn.layer || '').toLowerCase().includes(q) ||
               (fn.description || '').toLowerCase().includes(q) ||
               (fn.marker || '').toLowerCase().includes(q) ||
               (fn.file || '').toLowerCase().includes(q);
      });
    }

    if (!functions.length) {
      return `
        <div class="p-8 text-center rounded-2xl border border-slate-200 bg-slate-50 text-slate-500 text-xs">
          Nenhuma função encontrada ${q ? 'para a busca "' + escapeHtml(q) + '"' : ''}.
        </div>
      `;
    }

    return `
      <div class="space-y-4">
        <div class="p-4 rounded-2xl bg-indigo-50/80 border border-indigo-200/70 text-xs text-indigo-950 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <strong>Catálogo Ativo de Funções & Módulos</strong>: ${functions.length} capacidades mapeadas com inspeção em tempo real no disco.
          </div>
          <div class="flex flex-wrap items-center gap-1.5 text-[10px] font-bold">
            <span class="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-300">⚡ Ativa</span>
            <span class="px-2 py-0.5 rounded-full bg-sky-100 text-sky-800 border border-sky-300">🆕 Criada</span>
            <span class="px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-300">🔄 Modificada</span>
            <span class="px-2 py-0.5 rounded-full bg-rose-100 text-rose-800 border border-rose-300">❌ Excluída</span>
          </div>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
          ${functions.map(function(fn){
            var isAtiva = fn.marker.includes('⚡');
            var isCriada = fn.marker.includes('🆕');
            var isMod = fn.marker.includes('🔄');
            var isExc = fn.marker.includes('❌');

            var badgeClass = isAtiva ? 'bg-emerald-100 text-emerald-800 border-emerald-300' :
                             isCriada ? 'bg-sky-100 text-sky-800 border-sky-300' :
                             isMod ? 'bg-amber-100 text-amber-800 border-amber-300' : 'bg-rose-100 text-rose-800 border-rose-300';

            var cardBorder = isExc ? 'bg-rose-50/40 border-rose-200' :
                             isCriada ? 'bg-sky-50/40 border-sky-200' :
                             isMod ? 'bg-amber-50/40 border-amber-200' : 'bg-white border-slate-200';

            var dt = formatDateTime(fn.lastModified);

            return `
              <div class="p-4 rounded-2xl border transition-all flex flex-col justify-between ${cardBorder} shadow-xs hover:shadow-sm">
                <div>
                  <div class="flex items-center justify-between gap-1.5 mb-1.5">
                    <span class="text-[9px] font-black uppercase px-2 py-0.5 rounded-md border ${badgeClass}">
                      ${escapeHtml(fn.marker)}
                    </span>
                    <span class="text-[9px] font-mono font-bold text-slate-400">${escapeHtml(fn.id)}</span>
                  </div>
                  <div class="text-xs font-bold text-slate-900 leading-snug">
                    ${escapeHtml(fn.name)}
                  </div>
                  <div class="text-[11px] text-slate-600 mt-1.5 leading-relaxed">
                    ${escapeHtml(fn.description)}
                  </div>
                </div>

                <div class="mt-3 pt-2.5 border-t border-slate-100 flex flex-wrap items-center justify-between gap-1 text-[10px] text-slate-400">
                  <span class="font-mono text-slate-500">${escapeHtml(fn.file)}</span>
                  <span>Modificado em: <strong class="text-slate-700">${dt.full}</strong></span>
                </div>
              </div>
            `;
          }).join('')}
        </div>
      </div>
    `;
  }

  function renderHistory() {
    var history = (_roadmapData && _roadmapData.builderHistory) || [];
    var q = (_searchQuery || '').toLowerCase().trim();

    if (q) {
      history = history.filter(function(h){
        var dt = formatDateTime(h.created_at);
        return (h.title || '').toLowerCase().includes(q) ||
               (h.order_id || '').toLowerCase().includes(q) ||
               (h.action || '').toLowerCase().includes(q) ||
               (h.performed_by || '').toLowerCase().includes(q) ||
               (h.new_status || '').toLowerCase().includes(q) ||
               (h.previous_status || '').toLowerCase().includes(q) ||
               (h.details || '').toLowerCase().includes(q) ||
               dt.full.toLowerCase().includes(q);
      });
    }

    if (!history.length) {
      return `
        <div class="p-8 text-center rounded-2xl border border-slate-200 bg-slate-50 text-slate-500 text-xs">
          Nenhum registro de auditoria encontrado ${q ? 'para a busca "' + escapeHtml(q) + '"' : ''}.
        </div>
      `;
    }

    return `
      <div class="space-y-4">
        <div class="p-4 rounded-2xl bg-amber-50/80 border border-amber-200/70 text-xs text-amber-950 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <strong>Trilha de Auditoria & Histórico de Ordens</strong>: Registros cronológicos completos com data completa, hora, autor e transições.
          </div>
          <span class="text-[11px] font-bold text-amber-900 bg-amber-200/60 px-2.5 py-0.5 rounded-full shrink-0">${history.length} evento(s)</span>
        </div>

        <div class="divide-y divide-slate-100 bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs">
          ${history.map(function(h){
            var dt = formatDateTime(h.created_at);
            var isDone = h.new_status === 'conforme';
            var isCurrent = h.new_status === 'em_curso';
            var isBlocked = h.new_status === 'bloqueado';
            var isCreated = h.action === 'CRIADA';

            var actionBadge = isCreated ? 'bg-indigo-100 text-indigo-800 border-indigo-200' :
                              isDone ? 'bg-emerald-100 text-emerald-800 border-emerald-200' :
                              isCurrent ? 'bg-amber-100 text-amber-800 border-amber-200' :
                              isBlocked ? 'bg-rose-100 text-rose-800 border-rose-200' : 'bg-slate-100 text-slate-800 border-slate-200';

            return `
              <div class="p-4 hover:bg-slate-50/80 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div class="space-y-1">
                  <div class="flex flex-wrap items-center gap-2">
                    <span class="text-[9px] font-black uppercase px-2 py-0.5 rounded-md border ${actionBadge}">
                      ${escapeHtml(h.action)}
                    </span>
                    <span class="text-[10px] font-mono font-bold text-slate-500">${escapeHtml(h.order_id)}</span>
                    <span class="text-xs font-bold text-slate-900">${escapeHtml(h.title)}</span>
                  </div>
                  ${h.details ? `
                    <div class="text-[11px] text-slate-600 pl-1 leading-snug">${escapeHtml(h.details)}</div>
                  ` : ''}
                  <div class="text-[10px] text-slate-400 pl-1 flex flex-wrap items-center gap-2">
                    <span>Autor: <strong class="text-slate-600">${escapeHtml(h.performed_by || 'construtor')}</strong></span>
                    ${h.previous_status ? `
                      <span>•</span>
                      <span>De: <code>${escapeHtml(h.previous_status)}</code> ➔ Para: <code>${escapeHtml(h.new_status)}</code></span>
                    ` : ''}
                  </div>
                </div>

                <div class="text-left sm:text-right shrink-0 bg-slate-50 sm:bg-transparent p-2 sm:p-0 rounded-xl">
                  <div class="text-xs font-bold text-slate-800 font-mono">📅 ${dt.date}</div>
                  <div class="text-[11px] text-slate-500 font-mono">⏰ ${dt.time}</div>
                </div>
              </div>
            `;
          }).join('')}
        </div>
      </div>
    `;
  }

  window.setRoadmapSearch = function (val) {
    _searchQuery = val || '';
    var container = document.getElementById('roadmap-plan-content');
    if (container) {
      if (_viewMode === 'years') container.innerHTML = renderYearChecklist(_selectedYear);
      else if (_viewMode === 'waves') container.innerHTML = renderWavesChecklist();
      else if (_viewMode === 'functions') container.innerHTML = renderFunctionsCatalog();
      else if (_viewMode === 'history') container.innerHTML = renderHistory();
    }
  };

  window.switchRoadmapView = function (mode) {
    _viewMode = mode;
    var container = document.getElementById('roadmap-live-container');
    if (container) renderRoadmap(container);
  };

  window.selectRoadmapYear = function (y) {
    _selectedYear = y;
    var container = document.getElementById('roadmap-live-container');
    if (container) renderRoadmap(container);
  };

  window.submitBuilderOrder = async function (e) {
    if (e && e.preventDefault) e.preventDefault();
    var title = (document.getElementById('order-title')?.value || '').trim();
    var layer = document.getElementById('order-layer')?.value || 'Core Jurídico';
    var wave = document.getElementById('order-wave')?.value || 'Onda 1 — Confiabilidade & SRE';
    var priority = document.getElementById('order-priority')?.value || 'P1';
    var acceptance_criteria = (document.getElementById('order-ac')?.value || '').trim();
    var description = (document.getElementById('order-description')?.value || '').trim();

    if (!title) {
      alert('Por favor, informe o título da ordem.');
      return;
    }

    var btn = document.getElementById('btn-submit-order');
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = 'Gravando...';
    }

    try {
      var token = getToken();
      if (!token) {
        throw new Error('Sessão não identificada. Por favor, refaça o login no painel.');
      }

      var res = await fetch('/api/admin/roadmap/orders', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + token
        },
        body: JSON.stringify({ title, description, layer, wave, priority, acceptance_criteria })
      });

      var data = {};
      var ct = res.headers.get('content-type') || '';
      if (ct.includes('application/json')) {
        data = await res.json();
      } else {
        var txt = await res.text();
        throw new Error('HTTP ' + res.status + ': ' + txt.slice(0, 100));
      }

      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Erro ao registrar ordem');
      }

      if (typeof window.wmToast === 'function') {
        window.wmToast('🚀 Ordem lançada no Roadmap Vivo!');
      } else {
        alert('Ordem lançada no Roadmap Vivo!');
      }

      var form = document.getElementById('builder-order-form');
      if (form) form.reset();

      await loadRoadmapTab();
    } catch (err) {
      alert('Aviso: ' + err.message);
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = '<span>🚀</span> Lançar ordem';
      }
    }
  };

  window.updateOrderStatus = async function (orderId, newStatus) {
    try {
      var token = getToken();
      if (!token) throw new Error('Sessão expirada. Faça login novamente.');

      var res = await fetch('/api/admin/roadmap/orders/' + encodeURIComponent(orderId), {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + token
        },
        body: JSON.stringify({ status: newStatus })
      });

      var data = {};
      var ct = res.headers.get('content-type') || '';
      if (ct.includes('application/json')) {
        data = await res.json();
      } else {
        var txt = await res.text();
        throw new Error('HTTP ' + res.status + ': ' + txt.slice(0, 100));
      }

      if (!res.ok || !data.success) throw new Error(data.error || 'Falha ao atualizar');
      if (typeof window.wmToast === 'function') {
        window.wmToast('Status da ordem atualizado para: ' + newStatus);
      }
      await loadRoadmapTab();
    } catch (err) {
      alert('Aviso: ' + err.message);
    }
  };

  window.deleteBuilderOrder = async function (orderId) {
    if (!confirm('Arquivar esta ordem? Ela sai da lista ativa, mas continua no histórico e pode ser reaberta.')) return;
    try {
      var token = getToken();
      if (!token) throw new Error('Sessão expirada. Faça login novamente.');

      var res = await fetch('/api/admin/roadmap/orders/' + encodeURIComponent(orderId), {
        method: 'DELETE',
        headers: { 'Authorization': 'Bearer ' + token }
      });

      var data = {};
      var ct = res.headers.get('content-type') || '';
      if (ct.includes('application/json')) {
        data = await res.json();
      } else {
        var txt = await res.text();
        throw new Error('HTTP ' + res.status + ': ' + txt.slice(0, 100));
      }

      if (!res.ok || !data.success) throw new Error(data.error || 'Falha ao arquivar');
      if (typeof window.wmToast === 'function') {
        window.wmToast('Ordem arquivada (continua no histórico).');
      }
      await loadRoadmapTab();
    } catch (err) {
      alert('Aviso: ' + err.message);
    }
  };

  window.loadRoadmapTab = loadRoadmapTab;
})();
