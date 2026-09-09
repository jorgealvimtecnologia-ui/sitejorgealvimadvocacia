/**
 * ============================================================================
 * SUBMÓDULO DESACOPLADO: MÓDULO: AGENDA FORENSE, CALENDÁRIOS & RASCUNHOS DE ATIVIDADES
 * Origem: Decomposição arquitetural do painel-1-app.js
 * ============================================================================
 */

(function () {
  'use strict';

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

    function closeCalendarEventModal(force) {
      if (!force && typeof window.confirmDiscardModalChanges === 'function') {
        if (!window.confirmDiscardModalChanges('modal-calendar-event', 'no compromisso da agenda')) return;
      }
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
          if (typeof window.clearUnsavedChanges === 'function') window.clearUnsavedChanges('modal-calendar-event');
          alert(`✅ ${data.message}`);
          closeCalendarEventModal(true);
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

    function closeActivityDraftModal(force) {
      if (!force && typeof window.confirmDiscardModalChanges === 'function') {
        if (!window.confirmDiscardModalChanges('modal-activity-draft', 'deste rascunho de atividade')) return;
      }
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
          if (typeof window.clearUnsavedChanges === 'function') {
            window.clearUnsavedChanges('modal-activity-draft');
          }
          closeActivityDraftModal(true);
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

  // ==========================================================================
  // EXPORTAÇÕES GLOBAIS PARA INTERFACE (ONCLICK & COMPATIBILIDADE)
  // ==========================================================================
  window.initCalendarTab = typeof initCalendarTab !== 'undefined' ? initCalendarTab : window.initCalendarTab;
  window.loadCalendarLawyers = typeof loadCalendarLawyers !== 'undefined' ? loadCalendarLawyers : window.loadCalendarLawyers;
  window.loadCalendarClientsAndLawsuits = typeof loadCalendarClientsAndLawsuits !== 'undefined' ? loadCalendarClientsAndLawsuits : window.loadCalendarClientsAndLawsuits;
  window.loadCalendarEvents = typeof loadCalendarEvents !== 'undefined' ? loadCalendarEvents : window.loadCalendarEvents;
  window.loadCalendarSummary = typeof loadCalendarSummary !== 'undefined' ? loadCalendarSummary : window.loadCalendarSummary;
  window.renderCalendar = typeof renderCalendar !== 'undefined' ? renderCalendar : window.renderCalendar;
  window.renderMonthlyGrid = typeof renderMonthlyGrid !== 'undefined' ? renderMonthlyGrid : window.renderMonthlyGrid;
  window.renderEventPill = typeof renderEventPill !== 'undefined' ? renderEventPill : window.renderEventPill;
  window.renderWeeklyGrid = typeof renderWeeklyGrid !== 'undefined' ? renderWeeklyGrid : window.renderWeeklyGrid;
  window.renderListView = typeof renderListView !== 'undefined' ? renderListView : window.renderListView;
  window.renderKanbanView = typeof renderKanbanView !== 'undefined' ? renderKanbanView : window.renderKanbanView;
  window.setCalendarViewMode = typeof setCalendarViewMode !== 'undefined' ? setCalendarViewMode : window.setCalendarViewMode;
  window.handleCalendarFilterChange = typeof handleCalendarFilterChange !== 'undefined' ? handleCalendarFilterChange : window.handleCalendarFilterChange;
  window.navigateCalendarMonth = typeof navigateCalendarMonth !== 'undefined' ? navigateCalendarMonth : window.navigateCalendarMonth;
  window.goToCurrentCalendarMonth = typeof goToCurrentCalendarMonth !== 'undefined' ? goToCurrentCalendarMonth : window.goToCurrentCalendarMonth;
  window.handleDayClick = typeof handleDayClick !== 'undefined' ? handleDayClick : window.handleDayClick;
  window.openCalendarEventModal = typeof openCalendarEventModal !== 'undefined' ? openCalendarEventModal : window.openCalendarEventModal;
  window.closeCalendarEventModal = typeof closeCalendarEventModal !== 'undefined' ? closeCalendarEventModal : window.closeCalendarEventModal;
  window.handleCalendarEventSubmit = typeof handleCalendarEventSubmit !== 'undefined' ? handleCalendarEventSubmit : window.handleCalendarEventSubmit;
  window.openCalendarViewModal = typeof openCalendarViewModal !== 'undefined' ? openCalendarViewModal : window.openCalendarViewModal;
  window.closeCalendarViewModal = typeof closeCalendarViewModal !== 'undefined' ? closeCalendarViewModal : window.closeCalendarViewModal;
  window.toggleCurrentEventStatus = typeof toggleCurrentEventStatus !== 'undefined' ? toggleCurrentEventStatus : window.toggleCurrentEventStatus;
  window.editCurrentCalendarEvent = typeof editCurrentCalendarEvent !== 'undefined' ? editCurrentCalendarEvent : window.editCurrentCalendarEvent;
  window.deleteCurrentCalendarEvent = typeof deleteCurrentCalendarEvent !== 'undefined' ? deleteCurrentCalendarEvent : window.deleteCurrentCalendarEvent;
  window.openCalendarSyncModal = typeof openCalendarSyncModal !== 'undefined' ? openCalendarSyncModal : window.openCalendarSyncModal;
  window.closeCalendarSyncModal = typeof closeCalendarSyncModal !== 'undefined' ? closeCalendarSyncModal : window.closeCalendarSyncModal;
  window.toggleCalendarAllDay = typeof toggleCalendarAllDay !== 'undefined' ? toggleCalendarAllDay : window.toggleCalendarAllDay;
  window.handleEventTypeChange = typeof handleEventTypeChange !== 'undefined' ? handleEventTypeChange : window.handleEventTypeChange;
  window.handleCalendarClientSelect = typeof handleCalendarClientSelect !== 'undefined' ? handleCalendarClientSelect : window.handleCalendarClientSelect;
  window.loadActivityDrafts = typeof loadActivityDrafts !== 'undefined' ? loadActivityDrafts : window.loadActivityDrafts;
  window.renderActivityDrafts = typeof renderActivityDrafts !== 'undefined' ? renderActivityDrafts : window.renderActivityDrafts;
  window.openActivityDraftModal = typeof openActivityDraftModal !== 'undefined' ? openActivityDraftModal : window.openActivityDraftModal;
  window.closeActivityDraftModal = typeof closeActivityDraftModal !== 'undefined' ? closeActivityDraftModal : window.closeActivityDraftModal;
  window.handleDraftClientChange = typeof handleDraftClientChange !== 'undefined' ? handleDraftClientChange : window.handleDraftClientChange;
  window.handleDraftLawsuitChange = typeof handleDraftLawsuitChange !== 'undefined' ? handleDraftLawsuitChange : window.handleDraftLawsuitChange;
  window.loadLatestIntimationIntoDraft = typeof loadLatestIntimationIntoDraft !== 'undefined' ? loadLatestIntimationIntoDraft : window.loadLatestIntimationIntoDraft;
  window.handleSaveActivityDraft = typeof handleSaveActivityDraft !== 'undefined' ? handleSaveActivityDraft : window.handleSaveActivityDraft;
  window.deleteActivityDraft = typeof deleteActivityDraft !== 'undefined' ? deleteActivityDraft : window.deleteActivityDraft;
  window.filterActivityDrafts = typeof filterActivityDrafts !== 'undefined' ? filterActivityDrafts : window.filterActivityDrafts;
  window.handleOfficeScratchpadInput = typeof handleOfficeScratchpadInput !== 'undefined' ? handleOfficeScratchpadInput : window.handleOfficeScratchpadInput;
  window.loadOfficeScratchpad = typeof loadOfficeScratchpad !== 'undefined' ? loadOfficeScratchpad : window.loadOfficeScratchpad;
})();
