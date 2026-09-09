/**
 * ============================================================================
 * SUBMÓDULO DESACOPLADO: MÓDULO: PRÉ-CLIENTES, TRÁFEGO & VISITAS (TELEMETRIA)
 * Origem: Decomposição arquitetural do painel-1-app.js
 * ============================================================================
 */

(function () {
  'use strict';

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

  // ==========================================================================
  // EXPORTAÇÕES GLOBAIS PARA INTERFACE (ONCLICK & COMPATIBILIDADE)
  // ==========================================================================
  window.initPreClientsTab = typeof initPreClientsTab !== 'undefined' ? initPreClientsTab : window.initPreClientsTab;
  window.loadVisitsStats = typeof loadVisitsStats !== 'undefined' ? loadVisitsStats : window.loadVisitsStats;
  window.loadVisitsLogs = typeof loadVisitsLogs !== 'undefined' ? loadVisitsLogs : window.loadVisitsLogs;
  window.renderVisitsTable = typeof renderVisitsTable !== 'undefined' ? renderVisitsTable : window.renderVisitsTable;
  window.changeVisitsPage = typeof changeVisitsPage !== 'undefined' ? changeVisitsPage : window.changeVisitsPage;
  window.clearVisitsFilters = typeof clearVisitsFilters !== 'undefined' ? clearVisitsFilters : window.clearVisitsFilters;
  window.openPreClientDetailsModal = typeof openPreClientDetailsModal !== 'undefined' ? openPreClientDetailsModal : window.openPreClientDetailsModal;
  window.closePreClientModal = typeof closePreClientModal !== 'undefined' ? closePreClientModal : window.closePreClientModal;
  window.convertPreClientToLead = typeof convertPreClientToLead !== 'undefined' ? convertPreClientToLead : window.convertPreClientToLead;
  window.convertPreClientToClient = typeof convertPreClientToClient !== 'undefined' ? convertPreClientToClient : window.convertPreClientToClient;
  window.exportVisitsCSV = typeof exportVisitsCSV !== 'undefined' ? exportVisitsCSV : window.exportVisitsCSV;
})();
