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
  var _viewMode = 'years'; // 'years' | 'waves'

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

        <!-- 5. Checklists Ano a Ano & Ondas de Entrega -->
        <div class="bg-white rounded-3xl border border-slate-200 shadow-sm p-6 sm:p-7 space-y-5">
          <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-4">
            <div>
              <h2 class="text-lg font-black text-slate-900 flex items-center gap-2">
                <span>🎯</span> Planejamento & Cronograma de Execução
              </h2>
              <p class="text-xs text-slate-500 mt-0.5">Navegue pelas entregas por ano civil ou pela metodologia ágil de 5 Ondas de Entrega</p>
            </div>

            <!-- Seletor de Modo de Visualização (Anos vs Ondas) -->
            <div class="flex flex-wrap items-center gap-2">
              <div class="inline-flex p-1 rounded-2xl bg-slate-100 border border-slate-200 text-xs font-bold">
                <button type="button" onclick="window.switchRoadmapView('years')" class="px-3.5 py-1.5 rounded-xl transition-all cursor-pointer ${_viewMode === 'years' ? 'bg-navy-950 text-white shadow-sm' : 'text-slate-600 hover:text-slate-900'}">
                  📅 Por Ano (2026–2029)
                </button>
                <button type="button" onclick="window.switchRoadmapView('waves')" class="px-3.5 py-1.5 rounded-xl transition-all cursor-pointer ${_viewMode === 'waves' ? 'bg-navy-950 text-white shadow-sm' : 'text-slate-600 hover:text-slate-900'}">
                  🌊 Por Ondas (0 a 4)
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

          <!-- Conteúdo Dinâmico (Anos ou Ondas) -->
          <div id="roadmap-plan-content">
            ${_viewMode === 'years' ? renderYearChecklist(_selectedYear) : renderWavesChecklist()}
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

  function renderYearChecklist(year) {
    var items = (_roadmapData && _roadmapData.checklists && _roadmapData.checklists[year]) || [];
    if (!items.length) return '<p class="text-xs text-slate-400 py-4">Nenhum item programado para este período.</p>';

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
    if (!waves.length) return '<p class="text-xs text-slate-400 py-4">Nenhuma onda configurada na telemetria.</p>';

    return `
      <div class="space-y-4">
        <div class="p-3.5 rounded-2xl bg-sky-50/70 border border-sky-200/60 text-xs font-semibold text-sky-950 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <span>🌊 <strong>Metodologia por Ondas de Entrega</strong>: Priorização orientada a risco, separando correções críticas imediatas (P0 em 48h) de confiabilidade, governança e expansão SaaS B2B.</span>
          <span class="text-[10px] font-bold px-2.5 py-1 rounded-full bg-sky-200 text-sky-900 shrink-0 self-start sm:self-auto">5 Ondas Estratégicas</span>
        </div>

        <div class="grid grid-cols-1 gap-4">
          ${waves.map(function(wave){
            return `
              <div class="p-5 rounded-3xl border border-slate-200 bg-white shadow-sm hover:shadow-md transition-shadow">
                <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
                  <div class="flex flex-wrap items-center gap-2.5">
                    <span class="w-3 h-3 rounded-full shrink-0" style="background:${wave.color};"></span>
                    <h3 class="font-black text-slate-900 text-sm sm:text-base">${escapeHtml(wave.name)}</h3>
                    <span class="text-[10px] font-bold px-2 py-0.5 rounded-full" style="background:${wave.color}15; color:${wave.color}; border: 1px solid ${wave.color}40;">
                      ${escapeHtml(wave.badge)}
                    </span>
                  </div>
                  <div class="flex items-center gap-1.5 text-xs">
                    <span class="text-slate-500 font-medium">Janela estimada:</span>
                    <span class="font-black text-slate-800 bg-slate-100 px-2 py-0.5 rounded-md">${escapeHtml(wave.window)}</span>
                  </div>
                </div>

                <div class="text-xs text-slate-600 font-medium mt-2.5">
                  <strong class="text-slate-800">Foco Principal:</strong> ${escapeHtml(wave.focus)}
                </div>

                <div class="grid grid-cols-1 md:grid-cols-2 gap-2.5 mt-3.5">
                  ${wave.items.map(function(it){
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
                            <span class="text-[9px] font-black px-1.5 py-0.5 rounded border ${priColor}">${it.priority || 'P1'}</span>
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

  window.loadRoadmapTab = loadRoadmapTab;
})();
