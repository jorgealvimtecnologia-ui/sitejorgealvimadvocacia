  (function(){
    var MODULES={
      dashboard:{label:'Visão Geral',emoji:'📊'},
      leads:{label:'Atendimentos & Leads',emoji:'📥'},
      'pre-clients':{label:'Tráfego & Acessos (IPs)',emoji:'🌐'},
      clients:{label:'Clientes & Contratos',emoji:'👥'},
      rockets:{label:'Foguetes',emoji:'🚀'},
      lawsuits:{label:'Processos & Prazos (CNJ)',emoji:'⚖️'},
      publications:{label:'Intimações & DJEN',emoji:'📢'},
      calendar:{label:'Agenda & Prazos',emoji:'📅'},
      judicial:{label:'Radar Judicial',emoji:'🔍'},
      docs:{label:'Gerador de Documentos',emoji:'📄'},
      'admin-requests':{label:'Requerimentos Adm.',emoji:'🏛️'},
      finance:{label:'Financeiro & Caixa',emoji:'💰'},
      nfse:{label:'Notas Fiscais (NFS-e)',emoji:'🧾'},
      esign:{label:'Assinaturas',emoji:'✍️'},
      hr:{label:'RH & Pessoal',emoji:'👔'},
      offices:{label:'Escritórios',emoji:'🏢'},
      drive:{label:'Drive do Escritório',emoji:'📁'},
      users:{label:'Usuários & Senhas',emoji:'🔐'},
      blog:{label:'Blog & Moderação',emoji:'💬'},
      'site-boxes':{label:'Boxes da Home (Site)',emoji:'🏛️'},
      audit:{label:'Auditoria & Logs',emoji:'🛡️'},
      lgpd:{label:'LGPD & Privacidade',emoji:'🔒'},
      notifications:{label:'Alertas & Prazos',emoji:'🔔'},
      editor:{label:'Editor de Texto',emoji:'📝'},
      calc:{label:'Calculadora',emoji:'🧮'},
      kanban:{label:'Fluxo de Trabalho (Kanban 5W2H)',emoji:'🗂️'},
      explorer:{label:'Explorar Arquivos',emoji:'🗃️'},
      maintenance:{label:'Manutenção & Saúde',emoji:'🛠️'},
      'meta-ads':{label:'Meta Ads & Marketing',emoji:'📢'}
    };
    var TOOLS={editor:1,calc:1,kanban:1,explorer:1,maintenance:1};
    var GROUPS=[
      {label:'Visão Geral',emoji:'📊',items:['dashboard']},
      {label:'Clientes & Atendimento',emoji:'👥',items:['leads','clients','rockets']},
      {label:'Jurídico',emoji:'⚖️',items:['lawsuits','publications','calendar','judicial','docs','admin-requests']},
      {label:'Financeiro',emoji:'💰',items:['finance','nfse','esign']},
      {label:'Escritório & Pessoas',emoji:'🏛️',items:['hr','offices','drive','users']},
      {label:'Conteúdo & Compliance',emoji:'🛡️',items:['blog','site-boxes','meta-ads','audit','lgpd','notifications']},
      {label:'Ferramentas & Sistema',emoji:'🧰',items:['pre-clients','maintenance','explorer','kanban','editor','calc']}
    ];
    var LOADERS={leads:'loadLeads',clients:'loadClients',lawsuits:'loadLawsuits',calendar:'initCalendarTab',
      publications:'initPublicationsTab',docs:'initDocsTab',finance:'initFinanceTab',nfse:'loadNfseList',
      blog:'loadAdminBlogPosts','site-boxes':'loadSiteBoxesTab',audit:'initAuditTab','pre-clients':'initPreClientsTab',judicial:'initJudicialTab',
      offices:'initOfficesTab',drive:'initDriveTab',hr:'initHrTab',rockets:'initRocketsTab',
      dashboard:'loadDashboardOverview',esign:'loadEsignRequests',lgpd:'loadLgpdRequests',
      notifications:'loadNotificationsList','admin-requests':'loadAdminRequests',maintenance:'loadMaintenanceHealth',
      'meta-ads':'loadMetaAdsTab'};

    var windows={}, order=[], zTop=10, desktop=null, taskbar=null, storage=null;

    // Mapa "Novo": módulo -> função de abertura de cadastro já existente no painel.
    var NOVO={clients:'openNewClientModal',lawsuits:'openNewLawsuitModal',calendar:'openCalendarEventModal',
      blog:'openNewBlogPostModal',users:'openNewUserModal',finance:'openNewTransactionModal',
      nfse:'openNewNfseModal',hr:'openNewEmployeeModal',offices:'openOfficeModal',docs:'openLegalDocModal'};
    var IMPORT={clients:1};

    function wmToast(msg){
      var t=document.getElementById('jaw-toast');
      if(!t){
        t=document.createElement('div'); t.id='jaw-toast';
        // Acessibilidade: leitores de tela anunciam o aviso sem roubar o foco.
        t.setAttribute('role','status'); t.setAttribute('aria-live','polite'); t.setAttribute('aria-atomic','true');
        document.body.appendChild(t);
      }
      t.textContent=msg; t.classList.add('show'); clearTimeout(t._h);
      t._h=setTimeout(function(){ t.classList.remove('show'); },2400);
    }
    function winBody(id){ return windows[id]?windows[id].body:null; }
    function firstTable(b){ return b?b.querySelector('table'):null; }
    function tableRows(tbl){
      var rows=[]; tbl.querySelectorAll('tr').forEach(function(tr){
        var cells=Array.prototype.map.call(tr.querySelectorAll('th,td'),function(c){return (c.innerText||'').replace(/\s+/g,' ').trim();});
        if(cells.some(function(x){return x;})) rows.push(cells);
      }); return rows;
    }
    function actNovo(id){ var fn=NOVO[id]; if(fn&&typeof window[fn]==='function'){ try{ window[fn](); }catch(e){ wmToast('Não foi possível abrir o cadastro.'); } } else wmToast('Este módulo não tem cadastro direto.'); }
    function actSave(id){
      var modals=Array.prototype.slice.call(document.querySelectorAll('[id$="-modal"],[id$="Modal"]'))
        .filter(function(m){ return m.offsetParent!==null && !m.classList.contains('hidden'); });
      for(var i=modals.length-1;i>=0;i--){
        var btn=Array.prototype.slice.call(modals[i].querySelectorAll('button'))
          .find(function(b){ return /salvar|cadastrar|guardar|gravar|criar|confirmar|atualizar dados/i.test(b.textContent); });
        if(btn){ btn.click(); return; }
      }
      wmToast('Abra um cadastro ou edição para salvar.');
    }
    function actPrint(id){
      var b=winBody(id); if(!b) return;
      var css=Array.prototype.map.call(document.querySelectorAll('link[rel=stylesheet],style'),function(n){return n.outerHTML;}).join('');
      var w=window.open('','_blank','width=900,height=700');
      if(!w){ wmToast('Permita pop-ups para imprimir.'); return; }
      w.document.write('<html><head><title>'+(MODULES[id].label||'Impressão')+'</title>'+css+'</head><body style="padding:18px;background:#fff">'+b.innerHTML+'</body></html>');
      w.document.close(); setTimeout(function(){ try{ w.focus(); w.print(); }catch(e){} },500);
    }
    function actExport(id){
      var t=firstTable(winBody(id)); if(!t){ wmToast('Nada para exportar nesta janela.'); return; }
      var csv=tableRows(t).map(function(r){ return r.map(function(c){ return '"'+c.replace(/"/g,'""')+'"'; }).join(';'); }).join('\n');
      var blob=new Blob(['﻿'+csv],{type:'text/csv;charset=utf-8'}); var a=document.createElement('a');
      a.href=URL.createObjectURL(blob); a.download=(MODULES[id].label||'export').replace(/[^\w-]+/g,'_')+'.csv';
      document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(a.href); wmToast('Exportado em CSV.');
    }
    function actCopy(id){
      var b=winBody(id); if(!b) return; var t=firstTable(b);
      var txt=t?tableRows(t).map(function(r){return r.join('\t');}).join('\n'):(b.innerText||'').trim();
      if(navigator.clipboard&&navigator.clipboard.writeText){ navigator.clipboard.writeText(txt).then(function(){wmToast('Copiado para a área de transferência.');},function(){wmToast('Não foi possível copiar.');}); }
      else wmToast('Cópia não suportada neste navegador.');
    }
    function actFind(id){
      var b=winBody(id); if(!b) return;
      var inp=b.querySelector('input[id*=search],input[id*=busca],input[type=search]')||b.querySelector('input[type=text]');
      if(inp){ inp.focus(); try{ inp.select(); }catch(e){} wmToast('Busca ativada — digite para filtrar.'); } else wmToast('Este módulo não tem campo de busca.');
    }
    function actRefresh(id){ loadData(id); wmToast('Dados atualizados.'); }
    function actDelete(id){ wmToast('Para excluir, use o botão de excluir (🗑️) na linha do registro.'); }
    function actGerarDoc(id){ openModule('docs'); }
    function actSend(id){ wmToast('Abra o registro do cliente para enviar por WhatsApp/e-mail.'); }
    function wmAction(id,act){
      switch(act){
        case 'novo': return actNovo(id); case 'salvar': return actSave(id); case 'imprimir': return actPrint(id);
        case 'exportar': return actExport(id); case 'copiar': return actCopy(id); case 'localizar': return actFind(id);
        case 'atualizar': return actRefresh(id); case 'excluir': return actDelete(id);
        case 'gerardoc': return actGerarDoc(id); case 'enviar': return actSend(id);
        case 'importar': return openImportClientsModal();
      }
    }
    // ----- Importação em massa de clientes (CSV) -----
    function parseCSV(text){
      text=text.replace(/\r\n/g,'\n').replace(/\r/g,'\n').trim();
      if(!text) return [];
      var delim=((text.split('\n')[0].match(/;/g)||[]).length >= (text.split('\n')[0].match(/,/g)||[]).length)?';':',';
      var rows=[],row=[],cur='',q=false;
      for(var i=0;i<text.length;i++){ var c=text[i];
        if(q){ if(c==='"'){ if(text[i+1]==='"'){cur+='"';i++;} else q=false; } else cur+=c; }
        else { if(c==='"') q=true; else if(c===delim){ row.push(cur); cur=''; } else if(c==='\n'){ row.push(cur); rows.push(row); row=[]; cur=''; } else cur+=c; }
      }
      row.push(cur); rows.push(row);
      return rows.filter(function(r){ return r.some(function(x){return (x||'').trim();}); });
    }
    var CSV_MAP={ 'nome':'full_name','nome completo':'full_name','cliente':'full_name','razao social':'full_name','razão social':'full_name',
      'cpf':'cpf','cnpj':'cnpj','rg':'rg','email':'email','e-mail':'email',
      'telefone':'phone','celular':'phone','fone':'phone','whatsapp':'phone','telefone/whatsapp':'phone',
      'cidade':'city','estado':'state','uf':'state','bairro':'neighborhood','rua':'street','endereco':'street','endereço':'street','logradouro':'street',
      'numero':'number','número':'number','nº':'number','cep':'cep','profissao':'profession','profissão':'profession',
      'estado civil':'marital_status','nacionalidade':'nationality',
      'valor':'contract_value','valor contrato':'contract_value','honorarios':'contract_value','honorários':'contract_value',
      'parcelas':'installments_count','pago':'amount_paid','valor pago':'amount_paid','tipo':'client_type' };
    function openImportClientsModal(){
      var ov=document.createElement('div'); ov.style.cssText='position:fixed;inset:0;background:rgba(2,6,23,.55);z-index:10000;display:flex;align-items:center;justify-content:center;padding:16px';
      var box=document.createElement('div'); box.style.cssText='background:#fff;border-radius:14px;max-width:560px;width:100%;max-height:88vh;overflow:auto;box-shadow:0 20px 60px rgba(2,6,23,.4)';
      box.innerHTML='<div style="padding:16px 18px;border-bottom:1px solid #e2e8f0;display:flex;justify-content:space-between;align-items:center">'
        +'<div style="font-weight:800;color:#0f172a;font-size:15px">📥 Importar clientes (CSV)</div>'
        +'<button id="imp-x" style="border:0;background:transparent;font-size:18px;cursor:pointer;color:#64748b">✕</button></div>'
        +'<div style="padding:18px;font-size:13px;color:#334155;line-height:1.6">'
        +'<p>Selecione um arquivo <b>.csv</b> com uma linha de cabeçalho. Colunas reconhecidas: '
        +'<span style="font-family:monospace;font-size:11px">nome, cpf, cnpj, email, telefone, cidade, uf, bairro, rua, numero, cep, profissao, valor, parcelas, pago</span>. '
        +'Obrigatórios: <b>nome</b> e <b>telefone</b>.</p>'
        +'<p style="margin-top:8px"><a id="imp-modelo" href="#" style="color:#b45309;font-weight:700">⬇️ Baixar modelo de planilha</a></p>'
        +'<input id="imp-file" type="file" accept=".csv,text/csv" style="margin-top:10px;font-size:13px"/>'
        +'<div id="imp-status" style="margin-top:12px;font-size:12.5px;color:#475569"></div>'
        +'</div>'
        +'<div style="padding:14px 18px;border-top:1px solid #e2e8f0;display:flex;justify-content:flex-end;gap:8px">'
        +'<button id="imp-cancel" style="padding:8px 14px;border:1px solid #cbd5e1;background:#fff;border-radius:9px;font-weight:700;font-size:13px;cursor:pointer;color:#334155">Cancelar</button>'
        +'<button id="imp-go" disabled style="padding:8px 16px;border:0;background:#94a3b8;border-radius:9px;font-weight:800;font-size:13px;cursor:not-allowed;color:#fff">Importar</button></div>';
      ov.appendChild(box); document.body.appendChild(ov);
      var parsed=[]; var fileInput=box.querySelector('#imp-file'), status=box.querySelector('#imp-status'), go=box.querySelector('#imp-go');
      function close(){ ov.remove(); }
      box.querySelector('#imp-x').onclick=close; box.querySelector('#imp-cancel').onclick=close;
      box.querySelector('#imp-modelo').onclick=function(e){ e.preventDefault();
        var csv='nome;cpf;telefone;email;cidade;uf;valor;parcelas\nMaria Souza;111.111.111-11;(32) 99999-0001;maria@ex.com;Juiz de Fora;MG;3000;3\n';
        var b=new Blob(['﻿'+csv],{type:'text/csv;charset=utf-8'}); var a=document.createElement('a'); a.href=URL.createObjectURL(b); a.download='modelo-clientes.csv'; a.click(); URL.revokeObjectURL(a.href); };
      fileInput.onchange=function(){ var f=fileInput.files[0]; if(!f) return; var rd=new FileReader();
        rd.onload=function(){ try{
          var rows=parseCSV(String(rd.result)); if(rows.length<2){ status.textContent='Arquivo sem dados (precisa de cabeçalho + linhas).'; return; }
          var headers=rows[0].map(function(h){ return (h||'').trim().toLowerCase(); });
          var fields=headers.map(function(h){ return CSV_MAP[h]||null; });
          if(fields.indexOf('full_name')<0 || fields.indexOf('phone')<0){ status.textContent='❌ O cabeçalho precisa conter ao menos "nome" e "telefone".'; go.disabled=true; go.style.cssText=go.style.cssText.replace('#f59e0b','#94a3b8'); return; }
          parsed=[]; for(var i=1;i<rows.length;i++){ var o={}; rows[i].forEach(function(v,idx){ if(fields[idx]) o[fields[idx]]=(v||'').trim(); }); if(o.full_name&&o.phone) parsed.push(o); }
          status.innerHTML='✅ <b>'+parsed.length+'</b> cliente(s) prontos para importar.';
          go.disabled=false; go.style.background='#16a34a'; go.style.cursor='pointer';
        }catch(err){ status.textContent='Erro ao ler o arquivo: '+err.message; } };
        rd.readAsText(f,'UTF-8'); };
      go.onclick=async function(){ if(!parsed.length) return; go.disabled=true; go.textContent='Importando...';
        try{ var res=await fetch('/api/clients/import',{method:'POST',headers:Object.assign({'Content-Type':'application/json'}, (typeof getAuthHeaders==='function'?getAuthHeaders():{})),body:JSON.stringify({rows:parsed})});
          var d=await res.json();
          if(res.ok&&d.success){ status.innerHTML='✅ Importados: <b>'+d.imported+'</b>. Ignorados: '+(d.errors?d.errors.length:0)+'.';
            wmToast('Importação concluída: '+d.imported+' cliente(s).'); loadData('clients');
            setTimeout(close,1400);
          } else { status.textContent='❌ '+(d.error||'Falha na importação.'); go.disabled=false; go.textContent='Importar'; }
        }catch(e){ status.textContent='❌ Erro de comunicação.'; go.disabled=false; go.textContent='Importar'; } };
    }
    function tbBtn(label,emoji,act,id){
      var b=document.createElement('button'); b.className='jaw-tb-btn'; b.type='button'; b.title=label; b.setAttribute('aria-label',label);
      b.innerHTML='<span class="e" aria-hidden="true">'+emoji+'</span><span>'+label+'</span>';
      b.addEventListener('click',function(e){ e.stopPropagation(); wmAction(id,act); });
      return b;
    }
    function buildToolbar(id){
      var tb=document.createElement('div'); tb.className='jaw-toolbar';
      function grp(cap,btns){
        var g=document.createElement('div'); g.className='jaw-tb-group';
        var row=document.createElement('div'); row.className='jaw-tb-row';
        btns.forEach(function(x){ if(x) row.appendChild(x); });
        var c=document.createElement('div'); c.className='jaw-tb-cap'; c.textContent=cap;
        g.appendChild(row); g.appendChild(c); return g;
      }
      function sep(){ var s=document.createElement('div'); s.className='jaw-tb-sep'; return s; }
      tb.appendChild(grp('Arquivo',[ NOVO[id]?tbBtn('Novo','➕','novo',id):null, IMPORT[id]?tbBtn('Importar','📥','importar',id):null, tbBtn('Salvar','💾','salvar',id), tbBtn('Imprimir','🖨️','imprimir',id), tbBtn('Exportar','⬇️','exportar',id) ]));
      tb.appendChild(sep());
      tb.appendChild(grp('Editar & registro',[ tbBtn('Copiar','📋','copiar',id), tbBtn('Localizar','🔎','localizar',id), tbBtn('Atualizar','🔄','atualizar',id), tbBtn('Excluir','🗑️','excluir',id) ]));
      tb.appendChild(sep());
      tb.appendChild(grp('Documentos',[ tbBtn('Gerar doc','📄','gerardoc',id), tbBtn('Enviar','✉️','enviar',id) ]));
      return tb;
    }

    function call(name){ try{ if(typeof window[name]==='function') window[name](); }catch(e){ console.warn('[WM] '+name,e); } }
    function loadData(id){
      if(id==='users'){ call('loadAccessControlMatrix'); call('loadUsers'); }
      else if(LOADERS[id]){ call(LOADERS[id]); }
      try{ if(typeof renderTabChart==='function') renderTabChart(id); }catch(e){}
    }

    function updateEmpty(){
      var e=desktop.querySelector('.jaw-empty');
      var anyVisible=order.some(function(id){return windows[id] && !windows[id].minimized;});
      if(!e){ e=document.createElement('div'); e.className='jaw-empty';
        e.innerHTML='🗔  Selecione um módulo no menu acima para abrir uma janela.'; desktop.appendChild(e); }
      e.style.display=anyVisible?'none':'block';
    }

    var zMaxTop = 600;
    function focusWin(id){
      var w=windows[id]; if(!w) return;
      if(w.max){
        w.el.style.setProperty('z-index', (++zMaxTop), 'important');
      } else {
        w.el.style.zIndex=(++zTop);
      }
      Object.keys(windows).forEach(function(k){
        windows[k].el.classList.toggle('active',k===id);
        if(windows[k].max && k !== id){
          windows[k].el.style.setProperty('z-index', '595', 'important');
        }
      });
      renderTaskbar();
    }
    function minimizeWin(id){
      var w=windows[id]; if(!w) return; w.minimized=true; w.el.style.display='none'; w.el.classList.remove('active');
      var top=null,tz=-1;
      order.forEach(function(k){ var o=windows[k]; if(o&&!o.minimized){ var z=parseInt(o.el.style.zIndex||0,10); if(z>=tz){tz=z;top=k;} } });
      if(top) focusWin(top); else { updateEmpty(); renderTaskbar(); }
    }
    function toggleMax(id){
      var w=windows[id]; if(!w) return;
      var btnMax = w.el.querySelector('.jaw-max');
      if(w.snapped){
        unSnap(w, id);
      }
      if(w.max){
        w.el.classList.remove('jaw-maximized');
        w.el.style.position = '';
        w.el.style.left=w.prev.l+'px';
        w.el.style.top=w.prev.t+'px';
        w.el.style.width=w.prev.w+'px';
        w.el.style.height=w.prev.h+'px';
        w.el.style.maxWidth = '';
        w.el.style.maxHeight = '';
        w.el.style.borderRadius = '';
        w.el.style.border = '';
        w.el.style.boxShadow = '';
        w.el.style.margin = '';
        if(w.body){
          w.body.style.height = '';
          w.body.style.maxHeight = '';
        }
        w.el.style.zIndex=(++zTop);
        w.max=false;
        if(btnMax){ btnMax.textContent = '▢'; btnMax.title = 'Maximizar janela'; }
      } else {
        w.prev={l:w.el.offsetLeft,t:w.el.offsetTop,w:w.el.offsetWidth,h:w.el.offsetHeight};
        w.el.classList.add('jaw-maximized');
        w.el.style.setProperty('position', 'fixed', 'important');
        w.el.style.setProperty('left', '0px', 'important');
        w.el.style.setProperty('top', '0px', 'important');
        w.el.style.setProperty('width', '100vw', 'important');
        w.el.style.setProperty('height', 'calc(100vh - 42px)', 'important');
        w.el.style.setProperty('max-width', '100vw', 'important');
        w.el.style.setProperty('max-height', 'calc(100vh - 42px)', 'important');
        w.el.style.setProperty('border-radius', '0px', 'important');
        w.el.style.setProperty('border', 'none', 'important');
        w.el.style.setProperty('box-shadow', 'none', 'important');
        w.el.style.setProperty('margin', '0px', 'important');
        w.el.style.setProperty('z-index', (++zMaxTop), 'important');
        var hasToolbar = !!w.el.querySelector('.jaw-toolbar');
        if(w.body){
          w.body.style.setProperty('height', 'calc(100vh - 42px - 38px - ' + (hasToolbar ? '44px' : '0px') + ')', 'important');
          w.body.style.setProperty('max-height', 'none', 'important');
        }
        w.max=true;
        if(btnMax){ btnMax.textContent = '❐'; btnMax.title = 'Restaurar tamanho'; }
      }
      focusWin(id);
    }
    function closeWin(id){
      var w=windows[id]; if(!w) return;
      var content=document.getElementById('tab-content-'+id);
      if(content){ content.classList.add('hidden'); storage.appendChild(content); }
      w.el.remove(); delete windows[id]; order=order.filter(function(x){return x!==id;});
      updateEmpty(); renderTaskbar();
    }

    // =========================================================================
    // ORGANIZAÇÃO DE JANELAS EM CASCATA DEGRADÊ (ESTILO WINDOWS)
    // =========================================================================
    function cascadeWindows(){
      var visibleWins = order.filter(function(id){ return windows[id] && !windows[id].minimized; });
      if(!visibleWins.length){
        wmToast('Nenhuma janela aberta para organizar em cascata.');
        return;
      }
      var dw = desktop.clientWidth || 1000;
      var dh = desktop.clientHeight || 600;
      var ww = Math.min(840, Math.max(480, dw - 180));
      var wh = Math.min(520, Math.max(360, dh - 130));

      visibleWins.forEach(function(id, idx){
        var w = windows[id];
        if(w.max) toggleMax(id);
        var offset = (idx % 10) * 36;
        w.el.style.width = ww + 'px';
        w.el.style.height = wh + 'px';
        w.el.style.left = (24 + offset) + 'px';
        w.el.style.top = (16 + offset) + 'px';
        w.prev = { l: 24 + offset, t: 16 + offset, w: ww, h: wh };
        focusWin(id);
      });
      wmToast('🗂️ Janelas organizadas em cascata degradê (estilo Windows).');
    }

    function tileWindows(){
      var visibleWins = order.filter(function(id){ return windows[id] && !windows[id].minimized; });
      if(!visibleWins.length){
        wmToast('Nenhuma janela aberta para organizar lado a lado.');
        return;
      }
      var dw = desktop.clientWidth || 1000;
      var dh = desktop.clientHeight || 600;
      var n = visibleWins.length;

      if(n === 1){
        var w = windows[visibleWins[0]];
        if(!w.max) toggleMax(visibleWins[0]);
      } else if(n === 2){
        var halfW = Math.floor(dw / 2) - 8;
        visibleWins.forEach(function(id, i){
          var w = windows[id];
          if(w.max) toggleMax(id);
          w.el.style.width = halfW + 'px';
          w.el.style.height = (dh - 20) + 'px';
          w.el.style.left = (i * (halfW + 8) + 4) + 'px';
          w.el.style.top = '10px';
          w.prev = { l: parseInt(w.el.style.left), t: 10, w: halfW, h: dh - 20 };
          focusWin(id);
        });
      } else {
        var cols = Math.ceil(Math.sqrt(n));
        var rows = Math.ceil(n / cols);
        var cellW = Math.floor(dw / cols) - 8;
        var cellH = Math.floor(dh / rows) - 8;
        visibleWins.forEach(function(id, i){
          var w = windows[id];
          if(w.max) toggleMax(id);
          var c = i % cols;
          var r = Math.floor(i / cols);
          w.el.style.width = cellW + 'px';
          w.el.style.height = cellH + 'px';
          w.el.style.left = (c * (cellW + 8) + 4) + 'px';
          w.el.style.top = (r * (cellH + 8) + 4) + 'px';
          w.prev = { l: parseInt(w.el.style.left), t: parseInt(w.el.style.top), w: cellW, h: cellH };
          focusWin(id);
        });
      }
      wmToast('🪟 Janelas organizadas lado a lado.');
    }

    function minimizeAllWindows(){
      order.forEach(function(id){
        if(windows[id] && !windows[id].minimized) minimizeWin(id);
      });
      wmToast('Área de trabalho limpa.');
    }

    function openCascadeExample(){
      var demoModules = ['clients', 'lawsuits', 'finance'];
      demoModules.forEach(function(id){
        openModule(id);
      });
      setTimeout(function(){
        cascadeWindows();
        focusWin('finance');
        wmToast('✨ Exemplo Ativo: 3 janelas sobrepostas em cascata degradê (estilo Windows)!');
      }, 120);
    }

    // =========================================================================
    // AERO SNAP (ENCAIXE AUTOMÁTICO DE JANELAS EM MEIA-TELA OU TELA CHEIA)
    // =========================================================================
    function getSnapGhost(){
      var g = document.getElementById('jaw-snap-ghost');
      if(!g){
        g = document.createElement('div');
        g.id = 'jaw-snap-ghost';
        document.body.appendChild(g);
      }
      return g;
    }

    function showSnapGhost(type){
      var g = getSnapGhost();
      if(!type){
        g.classList.remove('active');
        return;
      }
      g.className = 'jaw-snap-ghost active snap-' + type;
      if(type === 'top'){
        g.style.left = '0px';
        g.style.top = '0px';
        g.style.width = '100vw';
        g.style.height = 'calc(100vh - 42px)';
      } else if(type === 'left'){
        g.style.left = '0px';
        g.style.top = '0px';
        g.style.width = '50vw';
        g.style.height = 'calc(100vh - 42px)';
      } else if(type === 'right'){
        g.style.left = '50vw';
        g.style.top = '0px';
        g.style.width = '50vw';
        g.style.height = 'calc(100vh - 42px)';
      }
    }

    function hideSnapGhost(){
      var g = document.getElementById('jaw-snap-ghost');
      if(g) g.classList.remove('active');
    }

    function applySnap(w, id, side){
      if(w.max){
        w.el.classList.remove('jaw-maximized');
        w.max = false;
      }
      if(!w.prev){
        w.prev = { l: w.el.offsetLeft, t: w.el.offsetTop, w: w.el.offsetWidth, h: w.el.offsetHeight };
      }
      w.snapped = side;
      w.el.classList.remove('jaw-snapped-left', 'jaw-snapped-right');
      w.el.classList.add('jaw-snapped', 'jaw-snapped-' + side);
      w.el.style.setProperty('position', 'fixed', 'important');
      w.el.style.setProperty('top', '0px', 'important');
      w.el.style.setProperty('height', 'calc(100vh - 42px)', 'important');
      w.el.style.setProperty('max-height', 'calc(100vh - 42px)', 'important');
      w.el.style.setProperty('width', '50vw', 'important');
      w.el.style.setProperty('max-width', '50vw', 'important');
      w.el.style.setProperty('left', (side === 'left' ? '0px' : '50vw'), 'important');
      w.el.style.setProperty('border-radius', '0px', 'important');
      w.el.style.setProperty('z-index', (++zMaxTop), 'important');
      w.el.style.setProperty('box-shadow', '0 12px 36px rgba(2,6,23,0.35)', 'important');

      var hasToolbar = !!w.el.querySelector('.jaw-toolbar');
      if(w.body){
        w.body.style.setProperty('height', 'calc(100vh - 42px - 38px - ' + (hasToolbar ? '44px' : '0px') + ')', 'important');
        w.body.style.setProperty('max-height', 'none', 'important');
      }
      focusWin(id);
      wmToast(side === 'left' ? '⬅️ Janela encaixada à esquerda (Aero Snap 50%)' : '➡️ Janela encaixada à direita (Aero Snap 50%)');
    }

    function unSnap(w, id){
      if(!w.snapped) return;
      w.el.classList.remove('jaw-snapped', 'jaw-snapped-left', 'jaw-snapped-right');
      w.el.style.position = '';
      w.el.style.borderRadius = '';
      w.el.style.boxShadow = '';
      w.el.style.left = (w.prev ? w.prev.l : 40) + 'px';
      w.el.style.top = (w.prev ? w.prev.t : 40) + 'px';
      w.el.style.width = (w.prev ? w.prev.w : 800) + 'px';
      w.el.style.height = (w.prev ? w.prev.h : 500) + 'px';
      w.el.style.maxWidth = '';
      w.el.style.maxHeight = '';
      if(w.body){
        w.body.style.height = '';
        w.body.style.maxHeight = '';
      }
      w.snapped = false;
    }

    // =========================================================================
    // ARRASTAR E POSICIONAR EM QUALQUER LUGAR DA TELA (MOUSE & TOUCH + AERO SNAP)
    // =========================================================================
    function makeDrag(handle,w,id){
      handle.addEventListener('dblclick', function(ev){
        if(ev.target.closest('.jaw-ctrls') || ev.target.closest('button')) return;
        if(id) toggleMax(id);
      });

      function startDrag(e){
        if(e.target.closest('.jaw-ctrls') || e.target.closest('button')) return;
        if(w.max){
          toggleMax(id);
          w.el.style.left = Math.max(0, Math.min(e.clientX - 200, desktop.clientWidth - w.el.offsetWidth)) + 'px';
          w.el.style.top = '10px';
        } else if(w.snapped){
          unSnap(w, id);
          w.el.style.left = Math.max(0, Math.min(e.clientX - 200, desktop.clientWidth - w.el.offsetWidth)) + 'px';
          w.el.style.top = '10px';
        }
        e.preventDefault();
        focusWin(id);
        w.el.classList.add('jaw-dragging');

        var isTouch = e.type === 'touchstart';
        var sx = isTouch ? e.touches[0].clientX : e.clientX;
        var sy = isTouch ? e.touches[0].clientY : e.clientY;
        var ol = w.el.offsetLeft, ot = w.el.offsetTop;
        var snapCandidate = null;

        function mv(ev){
          var cx = ev.type.startsWith('touch') ? ev.touches[0].clientX : ev.clientX;
          var cy = ev.type.startsWith('touch') ? ev.touches[0].clientY : ev.clientY;
          var nl = ol + (cx - sx);
          var nt = ot + (cy - sy);

          var maxLeft = Math.max(desktop.clientWidth - 80, 200);
          var maxTop = Math.max(desktop.clientHeight - 40, 200);
          nl = Math.max(-w.el.offsetWidth + 80, Math.min(nl, maxLeft));
          nt = Math.max(0, Math.min(nt, maxTop));

          w.el.style.left = nl + 'px';
          w.el.style.top = nt + 'px';

          // Detecção de bordas Aero Snap estilo Windows
          var screenW = window.innerWidth;
          if(cy <= 18){
            snapCandidate = 'top';
          } else if(cx <= 18){
            snapCandidate = 'left';
          } else if(cx >= screenW - 18){
            snapCandidate = 'right';
          } else {
            snapCandidate = null;
          }
          showSnapGhost(snapCandidate);
        }

        function up(){
          hideSnapGhost();
          w.el.classList.remove('jaw-dragging');
          if(snapCandidate === 'top'){
            if(!w.max) toggleMax(id);
          } else if(snapCandidate === 'left' || snapCandidate === 'right'){
            applySnap(w, id, snapCandidate);
          } else {
            w.prev = { l: w.el.offsetLeft, t: w.el.offsetTop, w: w.el.offsetWidth, h: w.el.offsetHeight };
          }
          snapCandidate = null;
          document.removeEventListener('mousemove', mv);
          document.removeEventListener('mouseup', up);
          document.removeEventListener('touchmove', mv);
          document.removeEventListener('touchend', up);
        }

        document.addEventListener('mousemove', mv);
        document.addEventListener('mouseup', up);
        document.addEventListener('touchmove', mv, { passive: false });
        document.addEventListener('touchend', up);
      }

      handle.addEventListener('mousedown', startDrag);
      handle.addEventListener('touchstart', startDrag, { passive: false });
    }

    function makeResize(handle,w){
      function startResize(ev){
        ev.preventDefault(); ev.stopPropagation();
        var isTouch = ev.type === 'touchstart';
        var sx = isTouch ? ev.touches[0].clientX : ev.clientX;
        var sy = isTouch ? ev.touches[0].clientY : ev.clientY;
        var ow = w.el.offsetWidth, oh = w.el.offsetHeight;
        function mv(e){
          var cx = e.type.startsWith('touch') ? e.touches[0].clientX : e.clientX;
          var cy = e.type.startsWith('touch') ? e.touches[0].clientY : e.clientY;
          w.el.style.width = Math.max(320, ow + (cx - sx)) + 'px';
          w.el.style.height = Math.max(200, oh + (cy - sy)) + 'px';
        }
        function up(){
          w.prev = { l: w.el.offsetLeft, t: w.el.offsetTop, w: w.el.offsetWidth, h: w.el.offsetHeight };
          document.removeEventListener('mousemove', mv);
          document.removeEventListener('mouseup', up);
          document.removeEventListener('touchmove', mv);
          document.removeEventListener('touchend', up);
        }
        document.addEventListener('mousemove', mv);
        document.addEventListener('mouseup', up);
        document.addEventListener('touchmove', mv, { passive: false });
        document.addEventListener('touchend', up);
      }
      handle.addEventListener('mousedown', startResize);
      handle.addEventListener('touchstart', startResize, { passive: false });
    }

    function createWindow(id,meta){
      var el=document.createElement('div'); el.className='jaw-window'; el.id='jaw-win-'+id;
      var n=order.length; var dw=desktop.clientWidth||1000, dh=desktop.clientHeight||600;
      var ww=Math.min(940,dw-40), wh=Math.min(600,dh-30);
      el.style.width=ww+'px'; el.style.height=wh+'px';
      el.style.left=Math.min(20+n*28,Math.max(0,dw-ww-10))+'px';
      el.style.top=Math.min(16+n*26,Math.max(0,dh-wh-10))+'px';
      el.innerHTML='<div class="jaw-titlebar"><div class="jaw-title"><span>'+meta.emoji+'</span><span>'+meta.label+'</span></div>'
        +'<div class="jaw-ctrls"><button class="jaw-min" title="Minimizar" aria-label="Minimizar janela">—</button>'
        +'<button class="jaw-max" title="Maximizar" aria-label="Maximizar janela">▢</button>'
        +'<button class="jaw-close" title="Fechar" aria-label="Fechar janela">✕</button></div></div>'
        +'<div class="jaw-winbody"></div><div class="jaw-resize"></div>';
      if(!TOOLS[id]) el.insertBefore(buildToolbar(id), el.querySelector('.jaw-winbody'));
      desktop.appendChild(el);
      var w={el:el,body:el.querySelector('.jaw-winbody'),minimized:false,max:false};
      el.addEventListener('mousedown',function(){ focusWin(id); },true);
      makeDrag(el.querySelector('.jaw-titlebar'),w,id);
      makeResize(el.querySelector('.jaw-resize'),w);
      el.querySelector('.jaw-min').addEventListener('click',function(e){e.stopPropagation();minimizeWin(id);});
      el.querySelector('.jaw-max').addEventListener('click',function(e){e.stopPropagation();toggleMax(id);});
      el.querySelector('.jaw-close').addEventListener('click',function(e){e.stopPropagation();closeWin(id);});
      return w;
    }

    function buildEditor(){
      var box=document.createElement('div'); box.style.cssText='display:flex;flex-direction:column;height:100%;min-height:420px';
      var bar=document.createElement('div'); bar.style.cssText='display:flex;flex-wrap:wrap;gap:4px;padding:6px;background:#f1f5f9;border:1px solid #e2e8f0;border-radius:10px;margin-bottom:8px';
      var area=document.createElement('div'); var KEY='ja_editor_content';
      var status=document.createElement('div'); status.style.cssText='font-size:11px;color:#94a3b8;margin-top:6px';
      function save(explicit){ try{ localStorage.setItem(KEY,area.innerHTML); }catch(e){} status.textContent=explicit?('Salvo ✓ '+new Date().toLocaleTimeString('pt-BR')):'Rascunho salvo automaticamente'; }
      function fmt(html,cmd,val,title){ var btn=document.createElement('button'); btn.type='button'; btn.title=title||''; btn.innerHTML=html;
        btn.style.cssText='min-width:32px;height:30px;border:1px solid #cbd5e1;background:#fff;border-radius:7px;cursor:pointer;font-size:13px;font-weight:700;color:#334155;padding:0 8px';
        btn.addEventListener('mousedown',function(e){e.preventDefault();});
        btn.addEventListener('click',function(){ area.focus(); document.execCommand(cmd,false,val||null); save(); }); return btn; }
      bar.appendChild(fmt('<b>N</b>','bold',null,'Negrito'));
      bar.appendChild(fmt('<i>I</i>','italic',null,'Itálico'));
      bar.appendChild(fmt('<u>S</u>','underline',null,'Sublinhado'));
      bar.appendChild(fmt('•','insertUnorderedList',null,'Lista'));
      bar.appendChild(fmt('1.','insertOrderedList',null,'Lista numerada'));
      bar.appendChild(fmt('T','formatBlock','H2','Título'));
      bar.appendChild(fmt('¶','formatBlock','P','Parágrafo'));
      bar.appendChild(fmt('⯇','justifyLeft',null,'Alinhar à esquerda'));
      bar.appendChild(fmt('≡','justifyCenter',null,'Centralizar'));
      bar.appendChild(fmt('⯈','justifyRight',null,'Alinhar à direita'));
      var color=document.createElement('input'); color.type='color'; color.value='#1e293b'; color.title='Cor do texto';
      color.style.cssText='width:32px;height:30px;border:1px solid #cbd5e1;border-radius:7px;background:#fff;cursor:pointer;padding:2px';
      color.addEventListener('input',function(){ area.focus(); document.execCommand('foreColor',false,color.value); save(); });
      bar.appendChild(color);
      function act(txt,fn,bg){ var btn=document.createElement('button'); btn.type='button'; btn.textContent=txt;
        btn.style.cssText='height:30px;border:1px solid #cbd5e1;background:'+(bg||'#fff')+';border-radius:7px;cursor:pointer;font-size:11.5px;font-weight:700;color:#334155;padding:0 10px';
        btn.addEventListener('click',fn); return btn; }
      function downloadDoc(){ var html='<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40"><head><meta charset="utf-8"></head><body>'+area.innerHTML+'</body></html>';
        var blob=new Blob(['﻿'+html],{type:'application/msword'}); var a=document.createElement('a'); a.href=URL.createObjectURL(blob);
        a.download='documento-'+new Date().toISOString().slice(0,10)+'.doc'; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(a.href); }
      function printDoc(){ var w=window.open('','_blank','width=820,height=700'); if(!w){ alert('Permita pop-ups para imprimir.'); return; }
        w.document.write('<html><head><meta charset="utf-8"><title>Documento</title></head><body style="font-family:Georgia,serif;padding:26px;line-height:1.6">'+area.innerHTML+'</body></html>'); w.document.close(); setTimeout(function(){ w.focus(); w.print(); },400); }
      bar.appendChild(act('💾 Salvar',function(){ save(true); },'#dcfce7'));
      bar.appendChild(act('⬇️ Baixar .doc',downloadDoc));
      bar.appendChild(act('🖨️ Imprimir',printDoc));
      bar.appendChild(act('🧹 Limpar',function(){ if(confirm('Limpar todo o texto?')){ area.innerHTML='<p></p>'; save(true); } },'#fee2e2'));
      area.contentEditable='true'; area.spellcheck=true;
      area.style.cssText='flex:1;min-height:320px;overflow:auto;border:1px solid #cbd5e1;border-radius:10px;padding:16px;background:#fff;font-size:14px;line-height:1.6;color:#1e293b;outline:none';
      try{ area.innerHTML=localStorage.getItem(KEY)||'<p></p>'; }catch(e){ area.innerHTML='<p></p>'; }
      area.addEventListener('input',function(){ save(); });
      box.appendChild(bar); box.appendChild(area); box.appendChild(status);
      return box;
    }
    function buildCalc(){
      var box=document.createElement('div'); box.style.cssText='max-width:300px;margin:10px auto';
      var disp=document.createElement('input'); disp.type='text'; disp.readOnly=true; disp.value='0';
      disp.style.cssText='width:100%;box-sizing:border-box;text-align:right;font-size:26px;font-weight:700;padding:14px;border:1px solid #cbd5e1;border-radius:10px;background:#0f172a;color:#fff;margin-bottom:10px;font-family:monospace';
      var grid=document.createElement('div'); grid.style.cssText='display:grid;grid-template-columns:repeat(4,1fr);gap:8px';
      var expr='';
      function refresh(){ disp.value=expr||'0'; }
      function press(t){
        if(t==='C'){ expr=''; }
        else if(t==='⌫'){ expr=(expr==='Erro')?'':expr.slice(0,-1); }
        else if(t==='='){ try{ var s=expr.replace(/×/g,'*').replace(/÷/g,'/').replace(/,/g,'.');
            if(!/^[0-9+\-*/%.() ]+$/.test(s)){ expr='Erro'; } else { var r=Function('"use strict";return('+s+')')(); expr=(r===undefined||r===null||!isFinite(r))?'Erro':String(Math.round(r*1e10)/1e10); } }catch(e){ expr='Erro'; } }
        else { if(expr==='Erro') expr=''; expr+=t; }
        refresh();
      }
      ['C','⌫','%','÷','7','8','9','×','4','5','6','-','1','2','3','+','0','.','='].forEach(function(k){
        var btn=document.createElement('button'); btn.type='button'; btn.textContent=k;
        var isOp=['÷','×','-','+','%'].indexOf(k)>=0, isFn=(k==='C'||k==='⌫'), isEq=(k==='=');
        btn.style.cssText='height:52px;border:1px solid #cbd5e1;border-radius:10px;font-size:18px;font-weight:700;cursor:pointer;'+
          (isEq?'background:linear-gradient(to right,#f59e0b,#d4a017);color:#0f172a;':isOp?'background:#e0e7ff;color:#3730a3;':isFn?'background:#fee2e2;color:#991b1b;':'background:#fff;color:#1e293b;');
        if(k==='0') btn.style.gridColumn='span 2';
        btn.addEventListener('click',function(){ press(k); });
        grid.appendChild(btn);
      });
      box.appendChild(disp); box.appendChild(grid);
      return box;
    }
    function buildKanban(){
      var COLS=[{key:'todo',label:'A fazer',wip:5},{key:'doing',label:'Em andamento',wip:3},{key:'waiting',label:'Aguardando',wip:0},{key:'done',label:'Concluído',wip:0}];
      var PRIO={normal:{l:'Normal',c:'#475569',bg:'#f1f5f9',br:'#cbd5e1'},importante:{l:'Importante',c:'#b45309',bg:'#fef3c7',br:'#f59e0b'},urgente:{l:'Urgente',c:'#b91c1c',bg:'#fee2e2',br:'#ef4444'},critico:{l:'Urgente + importante',c:'#7f1d1d',bg:'#fecaca',br:'#dc2626'}};
      var cards=[];
      var box=document.createElement('div'); box.style.cssText='display:flex;flex-direction:column;height:100%;min-height:460px';
      var head=document.createElement('div'); head.style.cssText='display:flex;align-items:center;gap:8px;margin-bottom:10px;flex-wrap:wrap';
      head.innerHTML='<button id="kb-new" style="background:linear-gradient(to right,#f59e0b,#d4a017);color:#0f172a;border:0;border-radius:9px;font-weight:800;font-size:12.5px;padding:8px 14px;cursor:pointer">➕ Novo cartão</button>'
        +'<button id="kb-reload" style="background:#f1f5f9;border:1px solid #cbd5e1;border-radius:9px;font-weight:700;font-size:12px;padding:8px 12px;cursor:pointer;color:#334155">🔄 Atualizar</button>'
        +'<span style="font-size:11px;color:#94a3b8">Arraste os cartões entre as colunas. Limite (WIP) evita sobrecarga.</span>';
      var board=document.createElement('div'); board.style.cssText='display:flex;gap:10px;overflow-x:auto;flex:1;align-items:flex-start;padding-bottom:6px';
      box.appendChild(head); box.appendChild(board);
      function api(url,opts){ opts=opts||{}; opts.headers=Object.assign({'Content-Type':'application/json'},(typeof getAuthHeaders==='function'?getAuthHeaders():{}),opts.headers||{}); return fetch(url,opts).then(function(r){return r.json();}); }
      function load(){ api('/api/kanban').then(function(d){ cards=(d&&d.cards)||[]; render(); }).catch(function(){ wmToast&&wmToast('Erro ao carregar o Kanban.'); }); }
      function fmtDate(s){ if(!s) return ''; try{ if(/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0,10).split('-').reverse().join('/'); }catch(e){} return s; }
      function render(){
        board.innerHTML='';
        COLS.forEach(function(col){
          var list=cards.filter(function(c){return (c.column_key||'todo')===col.key;});
          var over=col.wip>0 && list.length>col.wip;
          var colEl=document.createElement('div'); colEl.style.cssText='flex:1;min-width:180px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:8px;display:flex;flex-direction:column;max-height:100%';
          var badge=col.wip>0?('<span style="font-size:10px;font-weight:700;border-radius:20px;padding:1px 8px;'+(over?'background:#fee2e2;color:#b91c1c;border:1px solid #ef4444':'background:#eef2f7;color:#475569;border:1px solid #cbd5e1')+'">'+list.length+' / '+col.wip+'</span>'):('<span style="font-size:10px;font-weight:700;border-radius:20px;padding:1px 8px;background:#eef2f7;color:#475569;border:1px solid #cbd5e1">'+list.length+'</span>');
          colEl.innerHTML='<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px"><span style="font-size:12.5px;font-weight:800;color:#0f172a">'+col.label+'</span>'+badge+'</div>';
          var listEl=document.createElement('div'); listEl.style.cssText='flex:1;overflow-y:auto;display:flex;flex-direction:column;gap:6px;min-height:40px';
          listEl.addEventListener('dragover',function(e){ e.preventDefault(); listEl.style.background='#e0e7ff'; });
          listEl.addEventListener('dragleave',function(){ listEl.style.background=''; });
          listEl.addEventListener('drop',function(e){ e.preventDefault(); listEl.style.background=''; var id=e.dataTransfer.getData('text/plain'); var card=cards.find(function(x){return x.id===id;}); if(card && card.column_key!==col.key){ card.column_key=col.key; render(); api('/api/kanban/'+id,{method:'PUT',body:JSON.stringify({column_key:col.key})}); } });
          list.forEach(function(c){ listEl.appendChild(cardEl(c)); });
          colEl.appendChild(listEl); board.appendChild(colEl);
        });
      }
      function cardEl(c){
        var p=PRIO[c.priority]||PRIO.normal;
        var el=document.createElement('div'); el.draggable=true;
        el.style.cssText='background:#fff;border:1px solid #e2e8f0;border-left:3px solid '+p.br+';border-radius:8px;padding:8px 10px;cursor:pointer';
        var dl=c.deadline?('<div style="font-size:10px;color:#b91c1c;margin-top:4px">📅 '+fmtDate(c.deadline)+'</div>'):'';
        el.innerHTML='<div style="font-size:12px;font-weight:600;color:#0f172a">'+(c.title||'(sem título)')+'</div>'
          +'<div style="display:flex;gap:6px;align-items:center;margin-top:5px"><span style="font-size:9px;font-weight:700;border-radius:20px;padding:1px 7px;background:'+p.bg+';color:'+p.c+'">'+p.l+'</span>'+(c.w_who?'<span style="font-size:10px;color:#64748b">'+c.w_who+'</span>':'')+'</div>'+dl;
        el.addEventListener('dragstart',function(e){ e.dataTransfer.setData('text/plain',c.id); e.dataTransfer.effectAllowed='move'; });
        el.addEventListener('click',function(){ openCard(c); });
        return el;
      }
      function field(label,val,ph){ return '<label style="display:block;font-size:10px;font-weight:700;color:#64748b;text-transform:uppercase;margin:8px 0 3px">'+label+'</label><textarea data-k="'+val+'" placeholder="'+(ph||'')+'" style="width:100%;box-sizing:border-box;border:1px solid #cbd5e1;border-radius:8px;padding:7px;font-size:12.5px;min-height:38px;resize:vertical"></textarea>'; }
      function openCard(card){
        var isNew=!card; card=card||{priority:'normal',column_key:'todo'};
        var ov=document.createElement('div'); ov.style.cssText='position:fixed;inset:0;background:rgba(2,6,23,.55);z-index:10000;display:flex;align-items:center;justify-content:center;padding:16px';
        var m=document.createElement('div'); m.style.cssText='background:#fff;border-radius:14px;max-width:620px;width:100%;max-height:90vh;overflow:auto;box-shadow:0 20px 60px rgba(2,6,23,.4)';
        m.innerHTML='<div style="padding:14px 18px;border-bottom:1px solid #e2e8f0;display:flex;justify-content:space-between;align-items:center"><b style="color:#0f172a">🗂️ '+(isNew?'Novo cartão (5W2H)':'Editar cartão (5W2H)')+'</b><button id="kc-x" style="border:0;background:transparent;font-size:18px;cursor:pointer;color:#64748b">✕</button></div>'
          +'<div style="padding:16px">'
          +'<label style="display:block;font-size:10px;font-weight:700;color:#64748b;text-transform:uppercase;margin-bottom:3px">Título</label>'
          +'<input id="kc-title" style="width:100%;box-sizing:border-box;border:1px solid #cbd5e1;border-radius:8px;padding:8px;font-size:13px;font-weight:600"/>'
          +'<div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:10px">'
          +'<div style="flex:1;min-width:150px"><label style="display:block;font-size:10px;font-weight:700;color:#64748b;text-transform:uppercase;margin-bottom:3px">Coluna</label><select id="kc-col" style="width:100%;box-sizing:border-box;border:1px solid #cbd5e1;border-radius:8px;padding:8px;font-size:12.5px">'+COLS.map(function(x){return '<option value="'+x.key+'">'+x.label+'</option>';}).join('')+'</select></div>'
          +'<div style="flex:1;min-width:150px"><label style="display:block;font-size:10px;font-weight:700;color:#64748b;text-transform:uppercase;margin-bottom:3px">Prioridade (Eisenhower)</label><select id="kc-prio" style="width:100%;box-sizing:border-box;border:1px solid #cbd5e1;border-radius:8px;padding:8px;font-size:12.5px">'+Object.keys(PRIO).map(function(k){return '<option value="'+k+'">'+PRIO[k].l+'</option>';}).join('')+'</select></div>'
          +'<div style="flex:1;min-width:150px"><label style="display:block;font-size:10px;font-weight:700;color:#64748b;text-transform:uppercase;margin-bottom:3px">Prazo (When)</label><input id="kc-deadline" type="date" style="width:100%;box-sizing:border-box;border:1px solid #cbd5e1;border-radius:8px;padding:7px;font-size:12.5px"/></div>'
          +'</div>'
          +'<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:6px">'
          +field('What · o quê','w_what','O que precisa ser feito')+field('Why · por quê','w_why','Motivo / objetivo')
          +field('Where · onde','w_where','Vara / sistema / local')+field('Who · quem','w_who','Responsável')
          +field('How · como','h_how','Passos / método')+field('How much · quanto','h_howmuch','Horas / custo')
          +'</div>'
          +'</div>'
          +'<div style="padding:14px 18px;border-top:1px solid #e2e8f0;display:flex;justify-content:space-between;gap:8px">'
          +'<button id="kc-del" style="padding:8px 14px;border:1px solid #fecaca;background:#fee2e2;color:#b91c1c;border-radius:9px;font-weight:700;font-size:12.5px;cursor:pointer'+(isNew?';visibility:hidden':'')+'">🗑️ Excluir</button>'
          +'<div style="display:flex;gap:8px"><button id="kc-cancel" style="padding:8px 14px;border:1px solid #cbd5e1;background:#fff;border-radius:9px;font-weight:700;font-size:12.5px;cursor:pointer;color:#334155">Cancelar</button>'
          +'<button id="kc-save" style="padding:8px 16px;border:0;background:#16a34a;color:#fff;border-radius:9px;font-weight:800;font-size:12.5px;cursor:pointer">Salvar</button></div></div>';
        ov.appendChild(m); document.body.appendChild(ov);
        m.querySelector('#kc-title').value=card.title||'';
        m.querySelector('#kc-col').value=card.column_key||'todo';
        m.querySelector('#kc-prio').value=card.priority||'normal';
        m.querySelector('#kc-deadline').value=(card.deadline||'').slice(0,10);
        ['w_what','w_why','w_where','w_who','h_how','h_howmuch'].forEach(function(k){ var t=m.querySelector('[data-k="'+k+'"]'); if(t) t.value=card[k]||''; });
        function close(){ ov.remove(); }
        m.querySelector('#kc-x').onclick=close; m.querySelector('#kc-cancel').onclick=close;
        m.querySelector('#kc-save').onclick=function(){
          var payload={ title:m.querySelector('#kc-title').value.trim()||'Sem título', column_key:m.querySelector('#kc-col').value, priority:m.querySelector('#kc-prio').value, deadline:m.querySelector('#kc-deadline').value };
          ['w_what','w_why','w_where','w_who','h_how','h_howmuch'].forEach(function(k){ payload[k]=m.querySelector('[data-k="'+k+'"]').value; });
          var req=isNew?api('/api/kanban',{method:'POST',body:JSON.stringify(payload)}):api('/api/kanban/'+card.id,{method:'PUT',body:JSON.stringify(payload)});
          req.then(function(d){ if(d&&(d.success)){ close(); load(); wmToast&&wmToast(isNew?'Cartão criado.':'Cartão salvo.'); } else { alert((d&&d.error)||'Erro ao salvar.'); } });
        };
        m.querySelector('#kc-del').onclick=function(){ if(isNew) return; if(!confirm('Excluir este cartão?')) return; api('/api/kanban/'+card.id,{method:'DELETE'}).then(function(){ close(); load(); wmToast&&wmToast('Cartão excluído.'); }); };
      }
      head.querySelector('#kb-new').addEventListener('click',function(){ openCard(null); });
      head.querySelector('#kb-reload').addEventListener('click',load);
      load();
      return box;
    }
    function buildExplorer(){
      var box=document.createElement('div'); box.style.cssText='display:flex;flex-direction:column;height:100%;min-height:460px;font-size:13px';
      var state={path:'',parent:null,entries:[],sel:null};
      function api(url,opts){ opts=opts||{}; opts.headers=Object.assign({'Content-Type':'application/json'},(typeof getAuthHeaders==='function'?getAuthHeaders():{}),opts.headers||{}); return fetch(url,opts).then(function(r){return r.json();}); }
      function human(b){ if(!b) return '—'; var u=['B','KB','MB','GB'],i=0; while(b>=1024&&i<3){b/=1024;i++;} return b.toFixed(i?1:0)+' '+u[i]; }
      function dt(ms){ if(!ms) return '—'; var d=new Date(ms); return d.toLocaleDateString('pt-BR')+' '+d.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'}); }
      function tb(label,emoji,fn){ var b=document.createElement('button'); b.type='button'; b.title=label; b.setAttribute('aria-label',label);
        b.style.cssText='display:inline-flex;align-items:center;gap:5px;background:#fff;border:1px solid #cbd5e1;border-radius:8px;padding:6px 10px;font-size:12px;font-weight:600;color:#334155;cursor:pointer';
        b.innerHTML='<span>'+emoji+'</span><span>'+label+'</span>'; b.addEventListener('click',fn); return b; }
      var bar=document.createElement('div'); bar.style.cssText='display:flex;flex-wrap:wrap;gap:6px;padding:8px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;margin-bottom:8px';
      var crumb=document.createElement('div'); crumb.style.cssText='display:flex;flex-wrap:wrap;align-items:center;gap:4px;padding:6px 10px;background:#0f172a;color:#e2e8f0;border-radius:8px;margin-bottom:8px;font-size:12px;font-family:monospace';
      var scroll=document.createElement('div'); scroll.style.cssText='flex:1;overflow:auto;border:1px solid #e2e8f0;border-radius:10px;background:#fff';
      var table=document.createElement('table'); table.style.cssText='width:100%;border-collapse:collapse';
      table.innerHTML='<thead><tr>'
        +'<th style="text-align:left;padding:8px 10px;position:sticky;top:0;background:#f1f5f9;border-bottom:2px solid #e2e8f0;font-size:11px;color:#475569">Nome</th>'
        +'<th style="text-align:right;padding:8px 10px;position:sticky;top:0;background:#f1f5f9;border-bottom:2px solid #e2e8f0;font-size:11px;color:#475569;width:110px">Tamanho</th>'
        +'<th style="text-align:left;padding:8px 10px;position:sticky;top:0;background:#f1f5f9;border-bottom:2px solid #e2e8f0;font-size:11px;color:#475569;width:170px">Modificado</th></tr></thead><tbody></tbody>';
      scroll.appendChild(table);
      var tbody=table.querySelector('tbody');
      var status=document.createElement('div'); status.style.cssText='font-size:11px;color:#94a3b8;margin-top:6px';

      bar.appendChild(tb('Nova pasta','📁',function(){ var n=prompt('Nome da nova pasta:'); if(n){ api('/api/explorer/mkdir',{method:'POST',body:JSON.stringify({path:state.path,name:n.trim()})}).then(function(d){ if(d.success){wmToast&&wmToast('Pasta criada.');load(state.path);}else wmToast&&wmToast(d.error||'Erro'); }); } }));
      bar.appendChild(tb('Renomear','✏️',function(){ if(!state.sel){wmToast&&wmToast('Selecione um item.');return;} var n=prompt('Novo nome:',state.sel.name); if(n&&n.trim()!==state.sel.name){ api('/api/explorer/rename',{method:'POST',body:JSON.stringify({path:state.sel.path,newName:n.trim()})}).then(function(d){ if(d.success){wmToast&&wmToast('Renomeado.');load(state.path);}else wmToast&&wmToast(d.error||'Erro'); }); } }));
      bar.appendChild(tb('Mover','↪️',function(){ if(!state.sel){wmToast&&wmToast('Selecione um item.');return;} var dest=prompt('Mover para qual pasta? (caminho a partir da raiz; vazio = raiz)',state.path); if(dest===null)return; api('/api/explorer/move',{method:'POST',body:JSON.stringify({path:state.sel.path,dest:dest.trim()})}).then(function(d){ if(d.success){wmToast&&wmToast('Movido.');load(state.path);}else wmToast&&wmToast(d.error||'Erro'); }); }));
      bar.appendChild(tb('Excluir','🗑️',function(){ if(!state.sel){wmToast&&wmToast('Selecione um item.');return;} if(!confirm('Excluir "'+state.sel.name+'"'+(state.sel.type==='dir'?' e todo o conteúdo?':' ?')))return; api('/api/explorer/delete',{method:'DELETE',body:JSON.stringify({path:state.sel.path})}).then(function(d){ if(d.success){wmToast&&wmToast('Excluído.');load(state.path);}else wmToast&&wmToast(d.error||'Erro'); }); }));
      bar.appendChild(tb('Baixar','⬇️',function(){ if(!state.sel||state.sel.type==='dir'){wmToast&&wmToast('Selecione um arquivo.');return;} var h=Object.assign({},(typeof getAuthHeaders==='function'?getAuthHeaders():{})); fetch('/api/explorer/download?path='+encodeURIComponent(state.sel.path),{headers:h}).then(function(r){return r.blob();}).then(function(bl){ var a=document.createElement('a'); a.href=URL.createObjectURL(bl); a.download=state.sel.name; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(a.href); }); }));
      bar.appendChild(tb('Atualizar','🔄',function(){ load(state.path); }));

      function crumbLink(label,p){ var s=document.createElement('span'); s.textContent=label; s.style.cssText='cursor:pointer;color:#facc15'; s.addEventListener('click',function(){ load(p); }); return s; }
      function renderCrumb(){ crumb.innerHTML=''; crumb.appendChild(crumbLink('🗄️ Sistema','')); var parts=(state.path||'').split('/').filter(Boolean); var acc='';
        parts.forEach(function(seg){ acc=acc?acc+'/'+seg:seg; var sep=document.createElement('span'); sep.textContent=' / '; sep.style.color='#64748b'; crumb.appendChild(sep); crumb.appendChild(crumbLink(seg,acc)); }); }
      function render(){
        renderCrumb(); tbody.innerHTML=''; state.sel=null;
        if(state.parent!==null){ var up=document.createElement('tr'); up.style.cursor='pointer';
          up.innerHTML='<td style="padding:7px 10px;border-bottom:1px solid #f1f5f9">📁 <b>..</b> <span style="color:#94a3b8">(voltar)</span></td><td></td><td></td>';
          up.addEventListener('dblclick',function(){ load(state.parent); }); up.addEventListener('click',function(){ load(state.parent); }); tbody.appendChild(up); }
        if(!state.entries.length){ var e=document.createElement('tr'); e.innerHTML='<td colspan="3" style="padding:24px;text-align:center;color:#94a3b8">Pasta vazia</td>'; tbody.appendChild(e); }
        state.entries.forEach(function(it){ var tr=document.createElement('tr'); tr.style.cursor='pointer';
          tr.innerHTML='<td style="padding:7px 10px;border-bottom:1px solid #f1f5f9">'+(it.type==='dir'?'📁':'📄')+' '+it.name+'</td>'
            +'<td style="padding:7px 10px;border-bottom:1px solid #f1f5f9;text-align:right;color:#64748b;font-variant-numeric:tabular-nums">'+(it.type==='dir'?'—':human(it.size))+'</td>'
            +'<td style="padding:7px 10px;border-bottom:1px solid #f1f5f9;color:#64748b">'+dt(it.mtime)+'</td>';
          tr.addEventListener('click',function(){ [].slice.call(tbody.querySelectorAll('tr')).forEach(function(x){x.style.background='';}); tr.style.background='#fef3c7'; state.sel=it; });
          tr.addEventListener('dblclick',function(){ if(it.type==='dir') load(it.path); });
          tbody.appendChild(tr); });
        status.textContent=state.entries.length+' item(ns) · dados do sistema (documentos de clientes e drive do escritório)';
      }
      function load(p){ api('/api/explorer/list?path='+encodeURIComponent(p||'')).then(function(d){ if(!d.success){ wmToast&&wmToast(d.error||'Erro ao listar.'); return; } state.path=d.path; state.parent=d.parent; state.entries=d.entries; render(); }).catch(function(){ wmToast&&wmToast('Falha ao carregar o explorador.'); }); }
      box.appendChild(bar); box.appendChild(crumb); box.appendChild(scroll); box.appendChild(status);
      load('');
      return box;
    }
    var BUILDERS={editor:buildEditor,calc:buildCalc,kanban:buildKanban,explorer:buildExplorer};

    function openModule(id){
      var meta=MODULES[id]; if(!meta||!desktop) return;
      if(!moduleAllowed(id)){ if(typeof wmToast==='function') wmToast('Você não tem permissão para acessar este módulo.'); closeAllMenus(); return; }
      var w=windows[id];
      if(!w){ w=createWindow(id,meta); windows[id]=w; order.push(id); }
      var content=document.getElementById('tab-content-'+id);
      if(!content && BUILDERS[id]){ content=BUILDERS[id](); content.id='tab-content-'+id; content.className='space-y-6'; storage.appendChild(content); }
      if(content){ if(content.parentNode!==w.body) w.body.appendChild(content); content.classList.remove('hidden'); }
      w.minimized=false; w.el.style.display='flex';
      focusWin(id); loadData(id); updateEmpty();
      closeAllMenus();
    }

    function renderTaskbar(){
      if(!taskbar) return;
      taskbar.innerHTML='<span class="jaw-tb-label">Janelas</span>';
      order.forEach(function(id){
        var w=windows[id]; if(!w) return; var meta=MODULES[id];
        var b=document.createElement('button');
        b.className='jaw-taskbtn'+(w.el.classList.contains('active')&&!w.minimized?' active':'')+(w.minimized?' min':'');
        b.innerHTML='<span>'+meta.emoji+'</span><span>'+meta.label+'</span>';
        b.addEventListener('click',function(){
          if(w.minimized){ w.minimized=false; w.el.style.display='flex'; focusWin(id); updateEmpty(); }
          else if(w.el.classList.contains('active')){ minimizeWin(id); }
          else{ focusWin(id); }
        });
        taskbar.appendChild(b);
      });

      // Controles Rápidos de Janelas estilo Windows no rodapé
      var actionsWrap = document.createElement('div');
      actionsWrap.style.cssText = 'margin-left:auto;display:flex;align-items:center;gap:5px;flex-shrink:0';

      var btnExemplo = document.createElement('button');
      btnExemplo.type = 'button';
      btnExemplo.className = 'jaw-taskbtn';
      btnExemplo.style.cssText = 'background:linear-gradient(to right, #b45309, #d97706);border-color:#f59e0b;color:#ffffff;font-weight:800;box-shadow:0 2px 10px rgba(217,119,6,0.4);cursor:pointer';
      btnExemplo.innerHTML = '<span>✨</span><span>Exemplo Cascata</span>';
      btnExemplo.title = 'Abrir 3 janelas sobrepostas em cascata degradê (estilo Windows)';
      btnExemplo.addEventListener('click', openCascadeExample);
      actionsWrap.appendChild(btnExemplo);

      var btnCascata = document.createElement('button');
      btnCascata.type = 'button';
      btnCascata.className = 'jaw-taskbtn';
      btnCascata.innerHTML = '<span>🗂️</span><span>Cascata</span>';
      btnCascata.title = 'Reorganizar todas as janelas abertas em cascata diagonal com efeito degradê';
      btnCascata.addEventListener('click', cascadeWindows);
      actionsWrap.appendChild(btnCascata);

      var btnLock = document.createElement('button');
      btnLock.type = 'button';
      btnLock.className = 'jaw-taskbtn';
      btnLock.style.cssText = 'background:#0f172a;border-color:#334155;color:#facc15;font-weight:700;cursor:pointer';
      btnLock.innerHTML = '<span>🔒</span><span class="hidden sm:inline">Bloquear</span>';
      btnLock.title = 'Bloquear Tela do Sistema (Atalho: Ctrl + L)';
      btnLock.addEventListener('click', function(){ if(window.lockSystem) window.lockSystem(); });
      actionsWrap.appendChild(btnLock);

      taskbar.appendChild(actionsWrap);
    }

    function closeAllMenus(){ document.querySelectorAll('#jaw-menubar .jaw-group.open').forEach(function(g){g.classList.remove('open');}); }
    function buildMenu(){
      var bar=document.createElement('div'); bar.id='jaw-menubar'; bar.style.zIndex='300';
      bar.innerHTML='<span class="jaw-start">JORGE ALVIM · MÓDULOS</span>';
      GROUPS.forEach(function(g){
        var wrap=document.createElement('div'); wrap.className='jaw-group';
        var btn=document.createElement('button'); btn.innerHTML='<span>'+g.emoji+'</span><span>'+g.label+'</span><span style="opacity:.6">▾</span>';
        var dd=document.createElement('div'); dd.className='jaw-dropdown';
        g.items.forEach(function(id){ var m=MODULES[id]; if(!m) return;
          var mb=document.createElement('button'); mb.setAttribute('data-mid', id); mb.innerHTML='<span>'+m.emoji+'</span><span>'+m.label+'</span>';
          mb.addEventListener('click',function(){ openModule(id); }); dd.appendChild(mb); });
        btn.addEventListener('click',function(e){ e.stopPropagation(); var wasOpen=wrap.classList.contains('open'); closeAllMenus(); if(!wasOpen) wrap.classList.add('open'); });
        wrap.appendChild(btn); wrap.appendChild(dd); bar.appendChild(wrap);
      });

      // Menu dedicado: Janelas & Efeito Cascata (Estilo Windows)
      var winGroup = document.createElement('div'); winGroup.className = 'jaw-group';
      var winBtn = document.createElement('button');
      winBtn.style.cssText = 'background:#1e293b;border:1px solid #d4a017;color:#facc15;font-weight:800;border-radius:8px';
      winBtn.innerHTML = '<span>🪟</span><span>Janelas</span><span style="opacity:.7">▾</span>';
      var winDd = document.createElement('div'); winDd.className = 'jaw-dropdown';

      var winActions = [
        { label: '✨ Exemplo Cascata Degradê', emoji: '✨', fn: openCascadeExample },
        { label: '🗂️ Organizar em Cascata', emoji: '🗂️', fn: cascadeWindows },
        { label: '🪟 Organizar Lado a Lado', emoji: '🪟', fn: tileWindows },
        { label: '— Minimizar Todas', emoji: '—', fn: minimizeAllWindows },
        { label: '🔒 Bloquear Tela Agora (Ctrl+L)', emoji: '🔒', fn: function(){ if(window.lockSystem) window.lockSystem(); } }
      ];
      winActions.forEach(function(act){
        var b = document.createElement('button');
        b.innerHTML = '<span>' + act.emoji + '</span><span>' + act.label + '</span>';
        b.addEventListener('click', function(){ closeAllMenus(); act.fn(); });
        winDd.appendChild(b);
      });
      winBtn.addEventListener('click', function(e){
        e.stopPropagation();
        var wasOpen = winGroup.classList.contains('open');
        closeAllMenus();
        if(!wasOpen) winGroup.classList.add('open');
      });
      winGroup.appendChild(winBtn);
      winGroup.appendChild(winDd);
      bar.appendChild(winGroup);

      return bar;
    }

    // ---- Controle de acesso (RBAC): restringe módulos por perfil do usuário ----
    var WM_MASTER=true, WM_ALLOWED=null;
    var MODULE_PERM={ leads:'tab_leads','pre-clients':'tab_leads', clients:'tab_clients', docs:'tab_clients',
      lawsuits:'tab_lawsuits','admin-requests':'tab_lawsuits', judicial:'tab_radar', offices:'tab_offices',
      drive:'tab_drive', calendar:'tab_calendar', publications:'tab_publications', hr:'tab_hr',
      finance:'tab_financial', nfse:'tab_financial', esign:'tab_financial', users:'tab_users',
      audit:'tab_settings', lgpd:'tab_settings', blog:'tab_settings', 'site-boxes':'tab_settings', explorer:'tab_settings', maintenance:'tab_settings', 'meta-ads':'tab_settings' };
    var ALWAYS_ALLOWED={dashboard:1,editor:1,calc:1,kanban:1,notifications:1,rockets:1,'meta-ads':1,'site-boxes':1};
    function moduleAllowed(id){ if(WM_MASTER||!WM_ALLOWED) return true; if(ALWAYS_ALLOWED[id]) return true; return !!WM_ALLOWED[id]; }
    function applyPerms(){
      document.querySelectorAll('#jaw-menubar .jaw-group').forEach(function(g){
        var vis=0; g.querySelectorAll('.jaw-dropdown button').forEach(function(b){
          var mid=b.getAttribute('data-mid');
          if(mid && !moduleAllowed(mid)){ b.style.display='none'; } else { b.style.display=''; vis++; }
        });
        g.style.display = vis ? '' : 'none';
      });
      order.slice().forEach(function(id){ if(!moduleAllowed(id)) closeWin(id); });
    }
    function fetchPerms(){
      try{
        fetch('/api/access-control/my-permissions',{headers:(typeof getAuthHeaders==='function'?getAuthHeaders():{})})
          .then(function(r){return r.json();}).then(function(d){
            if(!d||!d.success) return;
            if(d.is_master){ WM_MASTER=true; WM_ALLOWED=null; }
            else { WM_MASTER=false; WM_ALLOWED={}; var p=d.permissions||{};
              Object.keys(MODULE_PERM).forEach(function(id){ if(p[MODULE_PERM[id]]) WM_ALLOWED[id]=1; }); }
            applyPerms();
            if(!order.some(function(id){return windows[id]&&!windows[id].minimized;})) openModule('dashboard');
          }).catch(function(){});
      }catch(e){}
    }

    function init(){
      var main=document.querySelector('main'); if(!main||document.getElementById('jaw-desktop')) return;
      var oldbar=document.getElementById('tabs-horizontal-bar'); if(oldbar) oldbar.style.display='none';
      Object.keys(MODULES).forEach(function(id){ var c=document.getElementById('tab-content-'+id); if(c) c.classList.add('hidden'); });
      var menubar=buildMenu(); main.parentNode.insertBefore(menubar,main);
      desktop=document.createElement('div'); desktop.id='jaw-desktop'; main.parentNode.insertBefore(desktop,main);
      storage=main; main.style.display='none';
      taskbar=document.createElement('div'); taskbar.id='jaw-taskbar'; taskbar.style.zIndex='650'; document.body.appendChild(taskbar);
      document.addEventListener('click',closeAllMenus);
      document.addEventListener('keydown',function(e){
        var active=null,az=-1;
        Object.keys(windows).forEach(function(k){ var w=windows[k]; if(w&&!w.minimized){ var z=parseInt(w.el.style.zIndex||0,10); if(z>=az){ az=z; active=k; } } });
        if(!active) return;
        var k=(e.key||'').toLowerCase();
        if(e.ctrlKey&&k==='s'){ e.preventDefault(); wmAction(active,'salvar'); }
        else if(e.ctrlKey&&k==='p'){ e.preventDefault(); wmAction(active,'imprimir'); }
        else if(e.ctrlKey&&k==='f'){ e.preventDefault(); wmAction(active,'localizar'); }
        else if(e.ctrlKey&&k==='n'){ e.preventDefault(); wmAction(active,'novo'); }
        else if(k==='f5'){ e.preventDefault(); wmAction(active,'atualizar'); }
      });
      window.switchTab=function(id){ return openModule(id); };
      window.openModule=openModule;
      window.wmAction=wmAction;
      window.openCascadeExample=openCascadeExample;
      window.cascadeWindows=cascadeWindows;
      window.tileWindows=tileWindows;
      window.minimizeAllWindows=minimizeAllWindows;
      window.toggleMax=toggleMax;
      window.minimizeWin=minimizeWin;
      window.snapWindow=function(id, side){ if(windows[id]) applySnap(windows[id], id, side); };
      updateEmpty();
      if(typeof getToken==='function' && getToken()){ openModule('dashboard'); fetchPerms(); }
      if(typeof window.showPanelScreen==='function'){
        var _sps=window.showPanelScreen;
        window.showPanelScreen=function(u){ var r=_sps.apply(this,arguments); if(!order.length) openModule('dashboard'); fetchPerms(); return r; };
      }
    }
    if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',init); else init();
  })();
