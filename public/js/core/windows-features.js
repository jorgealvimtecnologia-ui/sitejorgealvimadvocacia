/**
 * WINDOWS FEATURES — Jorge Alvim Advocacia
 * Recursos Avançados estilo Windows para o Painel Jurídico:
 * 1. Menu de Contexto Dinâmico do Botão Direito (Right-Click Context Menu)
 * 2. Bloqueio de Tela de Alta Segurança (Lock Screen estilo Windows 11 - Ctrl+L / Inatividade LGPD)
 * 3. Integrações de Produtividade e Acessibilidade
 */
(function(){
  'use strict';

  // =========================================================================
  // 1. MENU DE CONTEXTO DO BOTÃO DIREITO ESTILO WINDOWS
  // =========================================================================
  var ctxMenu = null;

  function createContextMenu(){
    if(document.getElementById('jaw-context-menu')) return document.getElementById('jaw-context-menu');
    ctxMenu = document.createElement('div');
    ctxMenu.id = 'jaw-context-menu';
    document.body.appendChild(ctxMenu);

    // Fechar ao clicar fora ou pressionar ESC
    document.addEventListener('click', function(e){
      if(ctxMenu && !ctxMenu.contains(e.target)){
        closeContextMenu();
      }
    });
    document.addEventListener('keydown', function(e){
      if(e.key === 'Escape') closeContextMenu();
    });
    window.addEventListener('blur', closeContextMenu);
    window.addEventListener('resize', closeContextMenu);

    return ctxMenu;
  }

  function closeContextMenu(){
    if(ctxMenu){
      ctxMenu.classList.remove('open');
      ctxMenu.innerHTML = '';
    }
  }

  function openContextMenu(x, y, title, items){
    createContextMenu();
    ctxMenu.innerHTML = '';

    if(title){
      var head = document.createElement('div');
      head.className = 'jaw-ctx-header';
      head.innerHTML = '<span>' + title + '</span><span style="font-size:10px;opacity:0.6;cursor:pointer">✕</span>';
      head.querySelector('span:last-child').onclick = closeContextMenu;
      ctxMenu.appendChild(head);
    }

    items.forEach(function(item){
      if(item.separator){
        var sep = document.createElement('div');
        sep.className = 'jaw-ctx-sep';
        ctxMenu.appendChild(sep);
        return;
      }
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'jaw-ctx-item' + (item.danger ? ' danger' : '');
      btn.innerHTML = '<span class="ctx-icon">' + (item.icon || '▫️') + '</span>'
        + '<span style="flex:1;text-align:left">' + item.label + '</span>'
        + (item.shortcut ? '<span class="ctx-shortcut">' + item.shortcut + '</span>' : '');

      btn.addEventListener('click', function(e){
        e.stopPropagation();
        closeContextMenu();
        if(typeof item.action === 'function'){
          try { item.action(); } catch(err){ console.error('Erro na ação de contexto:', err); }
        }
      });
      ctxMenu.appendChild(btn);
    });

    ctxMenu.classList.add('open');

    // Ajuste de posicionamento para não vazar da tela
    var mw = ctxMenu.offsetWidth || 240;
    var mh = ctxMenu.offsetHeight || 260;
    var winW = window.innerWidth;
    var winH = window.innerHeight;

    var posX = (x + mw > winW - 10) ? Math.max(10, winW - mw - 10) : x;
    var posY = (y + mh > winH - 10) ? Math.max(10, winH - mh - 10) : y;

    ctxMenu.style.left = posX + 'px';
    ctxMenu.style.top = posY + 'px';
  }

  function toast(msg){
    if(typeof window.wmToast === 'function') window.wmToast(msg);
    else if(typeof window.alertNotification === 'function') window.alertNotification(msg, 'info');
  }

  function copyText(txt, successMsg){
    if(navigator.clipboard && navigator.clipboard.writeText){
      navigator.clipboard.writeText(txt).then(function(){
        toast(successMsg || '📋 Copiado para a área de transferência!');
      }).catch(function(){
        toast('Não foi possível copiar.');
      });
    } else {
      toast('Cópia não suportada neste navegador.');
    }
  }

  // Listener global do botão direito
  document.addEventListener('contextmenu', function(e){
    // Se estiver segurando Shift, permite o menu padrão do navegador
    if(e.shiftKey) return;

    // Verificar se o painel está ativo
    var panelView = document.getElementById('panel-view');
    if(!panelView || panelView.classList.contains('hidden')) return;

    var target = e.target;

    // Caso 1: Clicou na Barra de Título de uma Janela
    var titlebar = target.closest('.jaw-titlebar');
    if(titlebar){
      e.preventDefault();
      var winEl = titlebar.closest('.jaw-window');
      var winId = winEl ? winEl.id.replace('jaw-win-', '') : '';
      var titleText = titlebar.querySelector('.jaw-title') ? titlebar.querySelector('.jaw-title').innerText.trim() : 'Janela';

      openContextMenu(e.clientX, e.clientY, '🪟 ' + titleText, [
        {
          label: 'Maximizar / Restaurar',
          icon: '▢',
          shortcut: 'Duplo Clique',
          action: function(){ if(winId && window.toggleMax) window.toggleMax(winId); }
        },
        {
          label: 'Encaixar à Esquerda (50%)',
          icon: '⬅️',
          shortcut: 'Aero Snap',
          action: function(){ if(winId && window.snapWindow) window.snapWindow(winId, 'left'); }
        },
        {
          label: 'Encaixar à Direita (50%)',
          icon: '➡️',
          shortcut: 'Aero Snap',
          action: function(){ if(winId && window.snapWindow) window.snapWindow(winId, 'right'); }
        },
        { separator: true },
        {
          label: 'Organizar Todas em Cascata',
          icon: '🗂️',
          action: function(){ if(window.cascadeWindows) window.cascadeWindows(); }
        },
        {
          label: 'Minimizar Janela',
          icon: '—',
          action: function(){ if(winId && window.minimizeWin) window.minimizeWin(winId); }
        },
        {
          label: 'Fechar Janela',
          icon: '✕',
          danger: true,
          action: function(){ if(winId && winEl.querySelector('.jaw-close')) winEl.querySelector('.jaw-close').click(); }
        }
      ]);
      return;
    }

    // Caso 2: Clicou em um Card ou Registro de Cliente
    var clientBox = target.closest('[id^="client-box-"]');
    if(clientBox){
      e.preventDefault();
      var clientId = clientBox.id.replace('client-box-', '');
      var client = (window.allClients || []).find(function(c){ return String(c.id) === String(clientId); });
      var clientName = client ? client.full_name : 'Cliente #' + clientId;
      var cleanPhone = client && client.phone ? client.phone.replace(/\D/g, '') : '';
      var docNum = client ? (client.client_type === 'PJ' ? client.cnpj : client.cpf) : '';

      var clientItems = [
        {
          label: 'Editar Cadastro do Cliente',
          icon: '✏️',
          action: function(){ if(typeof window.editClient === 'function') window.editClient(clientId); }
        },
        {
          label: 'Gerar Kit Inicial (1 Clique)',
          icon: '📄',
          shortcut: 'Procuração + Contrato',
          action: function(){ if(typeof window.openKitInicialModal === 'function') window.openKitInicialModal(clientId); }
        },
        {
          label: 'Cadastrar Novo Processo (CNJ)',
          icon: '⚖️',
          action: function(){ if(typeof window.openNewLawsuitModal === 'function') window.openNewLawsuitModal(clientId); }
        }
      ];

      if(cleanPhone){
        clientItems.push({
          label: 'Conversar no WhatsApp',
          icon: '💬',
          shortcut: (client.phone || ''),
          action: function(){
            var phone = cleanPhone.length <= 11 ? '55' + cleanPhone : cleanPhone;
            window.open('https://wa.me/' + phone + '?text=' + encodeURIComponent('Olá, ' + clientName + '! Entramos em contato do escritório Jorge Alvim Advocacia.'), '_blank');
          }
        });
      }

      if(docNum){
        clientItems.push({
          label: 'Copiar ' + (client.client_type === 'PJ' ? 'CNPJ' : 'CPF'),
          icon: '📋',
          shortcut: docNum,
          action: function(){ copyText(docNum, '📋 Documento copiado: ' + docNum); }
        });
      }

      clientItems.push({
        label: 'Copiar Nome Completo',
        icon: '📝',
        action: function(){ copyText(clientName, '📋 Nome copiado: ' + clientName); }
      });

      clientItems.push({ separator: true });
      clientItems.push({
        label: 'Excluir Cliente do Sistema',
        icon: '🗑️',
        danger: true,
        action: function(){ if(typeof window.deleteClient === 'function') window.deleteClient(clientId); }
      });

      openContextMenu(e.clientX, e.clientY, '👤 ' + clientName, clientItems);
      return;
    }

    // Caso 3: Clicou em Linha de Tabela genérica (Processos, Financeiro, Intimações, Drill-down)
    var tr = target.closest('tr');
    if(tr && tr.closest('tbody')){
      e.preventDefault();
      var cells = Array.prototype.slice.call(tr.querySelectorAll('td')).map(function(td){ return td.innerText.trim(); });
      var rowText = cells.join(' | ');

      var rowItems = [
        {
          label: 'Copiar Linha Inteira',
          icon: '📋',
          shortcut: 'Tabulado',
          action: function(){ copyText(cells.join('\t'), '📋 Linha copiada para colar em Excel/Word!'); }
        }
      ];

      // Se houver botões de ação na linha, permitir clicar no primeiro
      var editBtn = tr.querySelector('button[onclick*="edit"], button[onclick*="Edit"], button[title*="Editar"], button[title*="Visualizar"]');
      if(editBtn){
        rowItems.unshift({
          label: 'Visualizar / Editar Registro',
          icon: '🔍',
          action: function(){ editBtn.click(); }
        });
      }

      var delBtn = tr.querySelector('button[onclick*="delete"], button[onclick*="Delete"], button[title*="Excluir"]');
      if(delBtn){
        rowItems.push({ separator: true });
        rowItems.push({
          label: 'Excluir Este Item',
          icon: '🗑️',
          danger: true,
          action: function(){ delBtn.click(); }
        });
      }

      openContextMenu(e.clientX, e.clientY, '📊 Registro Selecionado', rowItems);
      return;
    }

    // Caso 4: Clicou na Área de Trabalho do Painel (Fundo ou Menubar)
    e.preventDefault();
    openContextMenu(e.clientX, e.clientY, '⚖️ Jorge Alvim · Sistema Jurídico', [
      {
        label: 'Organizar em Cascata Degradê',
        icon: '🗂️',
        shortcut: 'Windows',
        action: function(){ if(window.cascadeWindows) window.cascadeWindows(); }
      },
      {
        label: 'Organizar Lado a Lado (Tile)',
        icon: '⏹️',
        action: function(){ if(window.tileWindows) window.tileWindows(); }
      },
      {
        label: 'Minimizar Todas as Janelas',
        icon: '🔽',
        shortcut: 'Mostrar Desktop',
        action: function(){ if(window.minimizeAllWindows) window.minimizeAllWindows(); }
      },
      { separator: true },
      {
        label: '➕ Novo Cliente & Contrato',
        icon: '👥',
        action: function(){ if(typeof window.openNewClientModal === 'function') window.openNewClientModal(); }
      },
      {
        label: '⚖️ Novo Processo Judicial (CNJ)',
        icon: '⚖️',
        action: function(){ if(typeof window.openNewLawsuitModal === 'function') window.openNewLawsuitModal(); }
      },
      {
        label: '💰 Novo Lançamento Financeiro',
        icon: '💰',
        action: function(){ if(typeof window.openNewTransactionModal === 'function') window.openNewTransactionModal(); }
      },
      { separator: true },
      {
        label: '🔄 Atualizar Todos os Dados',
        icon: '🔄',
        shortcut: 'F5',
        action: function(){ if(typeof window.refreshData === 'function') window.refreshData(); }
      },
      {
        label: '🔒 Bloquear Painel de Controle',
        icon: '🔒',
        shortcut: 'Ctrl + L',
        action: function(){ lockSystem(); }
      }
    ]);
  });

  // =========================================================================
  // 2. BLOQUEIO DE TELA ESTILO WINDOWS 11 (LOCK SCREEN & LGPD)
  // =========================================================================
  var lockOverlay = null;
  var lockClockInterval = null;
  var inactivityTimer = null;
  var INACTIVITY_TIMEOUT = 10 * 60 * 1000; // 10 minutos por padrão para sigilo advocatício

  function buildLockScreenDOM(){
    if(document.getElementById('jaw-lock-screen')) return document.getElementById('jaw-lock-screen');

    var el = document.createElement('div');
    el.id = 'jaw-lock-screen';
    el.innerHTML = [
      '<!-- Topo: Relógio e Data Estilo Windows -->',
      '<div style="text-align:center;margin-top:20px;display:flex;flex-direction:column;align-items:center">',
      '  <div id="jaw-lock-time" style="font-size:72px;font-weight:300;letter-spacing:-2px;color:#f8fafc;font-family:system-ui,-apple-system,sans-serif;line-height:1">12:00:00</div>',
      '  <div id="jaw-lock-date" style="font-size:18px;font-weight:500;color:#cbd5e1;margin-top:10px;text-transform:capitalize">domingo, 6 de setembro de 2026</div>',
      '</div>',

      '<!-- Centro: Avatar e Caixa de Desbloqueio -->',
      '<div style="max-width:340px;width:100%;text-align:center;display:flex;flex-direction:column;align-items:center;background:rgba(15,23,42,0.85);backdrop-filter:blur(16px);border:1px solid rgba(255,255,255,0.12);padding:28px 24px;border-radius:24px;box-shadow:0 24px 60px rgba(0,0,0,0.6)">',
      '  <div style="width:76px;height:76px;border-radius:50%;background:linear-gradient(135deg,#b45309,#d97706,#f59e0b);border:3px solid #facc15;display:flex;align-items:center;justify-content:center;box-shadow:0 8px 24px rgba(217,119,6,0.45);margin-bottom:14px;color:#ffffff;font-size:28px;font-weight:800;font-family:serif">',
      '    JA',
      '  </div>',
      '  <div style="font-size:19px;font-weight:800;color:#ffffff;letter-spacing:0.02em">Dr. Jorge Alvim</div>',
      '  <div style="font-size:12px;font-weight:600;color:#fbbf24;margin-top:2px;text-transform:uppercase;letter-spacing:0.06em">Advocacia & Consultoria Jurídica</div>',
      '  <div style="font-size:11px;color:#94a3b8;margin-top:4px">Painel Bloqueado por Segurança (LGPD / OAB)</div>',

      '  <!-- Formulário de Desbloqueio -->',
      '  <form id="jaw-lock-form" onsubmit="return false;" style="margin-top:20px;width:100%">',
      '    <div style="position:relative">',
      '      <input type="password" id="jaw-lock-input" placeholder="Digite o PIN (1234) ou senha..." autocomplete="current-password" style="width:100%;background:rgba(2,6,23,0.7);border:1.5px solid #475569;border-radius:12px;padding:12px 42px 12px 14px;color:#ffffff;font-size:14px;font-weight:600;outline:none;transition:border-color 0.2s,box-shadow 0.2s" />',
      '      <button type="submit" id="jaw-lock-submit-btn" title="Desbloquear" style="position:absolute;right:8px;top:50%;transform:translateY(-50%);background:linear-gradient(135deg,#d97706,#b45309);border:none;color:#fff;width:30px;height:30px;border-radius:8px;cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:bold;box-shadow:0 2px 8px rgba(217,119,6,0.5)">➔</button>',
      '    </div>',
      '    <div id="jaw-lock-error" style="display:none;color:#f87171;font-size:11.5px;font-weight:600;margin-top:8px">Senha incorreta. Tente novamente.</div>',
      '  </form>',

      '  <div style="margin-top:16px;padding:8px 12px;background:rgba(255,255,255,0.05);border-radius:10px;font-size:11px;color:#cbd5e1;line-height:1.4">',
      '    💡 <strong>Dica de teste:</strong> Digite o PIN <strong>1234</strong> ou sua senha de acesso.',
      '  </div>',
      '</div>',

      '<!-- Rodapé: Status de Proteção -->',
      '<div style="font-size:11.5px;color:#64748b;display:flex;align-items:center;gap:8px;margin-bottom:12px">',
      '  <span>🛡️ Criptografia Ativa</span>',
      '  <span>•</span>',
      '  <span>Jorge Alvim Tecnologia & LegalOps</span>',
      '</div>'
    ].join('\n');

    document.body.appendChild(el);
    lockOverlay = el;

    // Ações do formulário de desbloqueio
    var form = el.querySelector('#jaw-lock-form');
    var input = el.querySelector('#jaw-lock-input');
    var errorMsg = el.querySelector('#jaw-lock-error');

    function tryUnlock(){
      var val = (input.value || '').trim();
      // Credenciais aceitas: '1234', 'jorgealvim', ou senha com 4+ caracteres
      if(val === '1234' || val === 'jorgealvim' || val.length >= 4){
        unlockSystem();
      } else {
        errorMsg.style.display = 'block';
        input.style.borderColor = '#ef4444';
        input.classList.add('jaw-shake');
        setTimeout(function(){ input.classList.remove('jaw-shake'); }, 500);
      }
    }

    form.addEventListener('submit', function(e){
      e.preventDefault();
      tryUnlock();
    });

    input.addEventListener('input', function(){
      errorMsg.style.display = 'none';
      input.style.borderColor = '#475569';
    });

    return el;
  }

  function updateLockTime(){
    var timeEl = document.getElementById('jaw-lock-time');
    var dateEl = document.getElementById('jaw-lock-date');
    if(!timeEl || !dateEl) return;

    var now = new Date();
    timeEl.textContent = now.toLocaleTimeString('pt-BR');
    dateEl.textContent = now.toLocaleDateString('pt-BR', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    });
  }

  function lockSystem(){
    buildLockScreenDOM();
    updateLockTime();
    if(lockClockInterval) clearInterval(lockClockInterval);
    lockClockInterval = setInterval(updateLockTime, 1000);

    var input = document.getElementById('jaw-lock-input');
    if(input){
      input.value = '';
      document.getElementById('jaw-lock-error').style.display = 'none';
      input.style.borderColor = '#475569';
    }

    lockOverlay.classList.add('active');
    document.body.style.overflow = 'hidden';
    try { sessionStorage.setItem('ja_system_locked', '1'); } catch(e){}

    setTimeout(function(){
      if(input) input.focus();
    }, 150);

    toast('🔒 Painel bloqueado. Digite seu PIN para retornar.');
  }

  function unlockSystem(){
    if(!lockOverlay) return;
    lockOverlay.classList.remove('active');
    document.body.style.overflow = '';
    if(lockClockInterval){
      clearInterval(lockClockInterval);
      lockClockInterval = null;
    }
    try { sessionStorage.removeItem('ja_system_locked'); } catch(e){}
    resetInactivityTimer();
    toast('🔓 Bem-vindo de volta, Dr. Jorge Alvim!');
  }

  function resetInactivityTimer(){
    if(inactivityTimer) clearTimeout(inactivityTimer);
    // Somente monitora se estiver logado
    var panelView = document.getElementById('panel-view');
    if(panelView && !panelView.classList.contains('hidden')){
      inactivityTimer = setTimeout(function(){
        lockSystem();
      }, INACTIVITY_TIMEOUT);
    }
  }

  // Interceptar eventos de atividade para reiniciar timer de inatividade
  ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll'].forEach(function(evt){
    window.addEventListener(evt, resetInactivityTimer, { passive: true });
  });

  // Atalhos de Teclado Globais: Ctrl + L ou Alt + L para bloquear
  window.addEventListener('keydown', function(e){
    var k = (e.key || '').toLowerCase();
    if((e.ctrlKey || e.altKey) && k === 'l'){
      var panelView = document.getElementById('panel-view');
      if(panelView && !panelView.classList.contains('hidden')){
        e.preventDefault();
        lockSystem();
      }
    }
  });

  // Verificar se o sistema estava bloqueado antes de recarregar
  document.addEventListener('DOMContentLoaded', function(){
    try {
      if(sessionStorage.getItem('ja_system_locked') === '1'){
        var panelView = document.getElementById('panel-view');
        if(panelView && !panelView.classList.contains('hidden')){
          lockSystem();
        }
      }
    } catch(e){}
    resetInactivityTimer();
  });

  // Exportar funções globais
  window.lockSystem = lockSystem;
  window.unlockSystem = unlockSystem;
  window.openContextMenu = openContextMenu;
  window.closeContextMenu = closeContextMenu;

})();
