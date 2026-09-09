/**
 * ============================================================================
 * SUBMÓDULO DESACOPLADO: MÓDULO: INICIALIZADOR DE GRÁFICOS BI (CHART.JS)
 * Origem: Decomposição arquitetural do painel-1-app.js
 * ============================================================================
 */

(function () {
  'use strict';

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


  // ==========================================================================
  // EXPORTAÇÕES GLOBAIS PARA INTERFACE (ONCLICK & COMPATIBILIDADE)
  // ==========================================================================
  window.safeCreateChart = typeof safeCreateChart !== 'undefined' ? safeCreateChart : window.safeCreateChart;
  window.renderTabChart = typeof renderTabChart !== 'undefined' ? renderTabChart : window.renderTabChart;
})();
