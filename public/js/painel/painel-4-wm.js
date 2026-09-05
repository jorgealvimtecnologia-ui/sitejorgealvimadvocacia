  (function(){
    function arr(name){ var v; try{ v=(0,eval)(name); }catch(e){ v=undefined; } return Array.isArray(v)?v:(v&&Array.isArray(v.items)?v.items:[]); }
    // Registro: id do elemento do número -> {t: título, r: função que devolve as linhas}
    var DRILLS={
      // Clientes
      'stat-cli-total':{t:'Clientes cadastrados',r:function(){return arr('allClients');}},
      'stat-cli-contract-total':{t:'Contratos (com honorários)',r:function(){return arr('allClients').filter(function(c){return parseFloat(c.contract_value)>0;});}},
      'stat-cli-paid-total':{t:'Clientes — total recebido',r:function(){return arr('allClients').filter(function(c){return parseFloat(c.amount_paid)>0;});}},
      'stat-cli-due-total':{t:'Clientes — saldo a receber',r:function(){return arr('allClients').filter(function(c){return parseFloat(c.balance_due)>0;});}},
      // Atendimentos & Leads
      'leads-count-badge':{t:'Atendimentos & Leads',r:function(){return arr('allLeads');}},
      // Processos
      'tab-lawsuits-count':{t:'Processos',r:function(){return arr('allLawsuits');}},
      // Financeiro
      'fin-kpi-revenue':{t:'Financeiro — lançamentos',r:function(){return arr('allTransactions');}},
      'fin-kpi-expense':{t:'Financeiro — lançamentos',r:function(){return arr('allTransactions');}},
      'fin-kpi-net':{t:'Financeiro — lançamentos',r:function(){return arr('allTransactions');}},
      'fin-kpi-upcoming':{t:'Parcelas a vencer',r:function(){return arr('allInstallments').filter(function(x){return (x.status||'')!=='Pago';});}},
      'fin-kpi-overdue':{t:'Parcelas vencidas',r:function(){return arr('allInstallments').filter(function(x){return (x.status||'')!=='Pago' && x.due_date && new Date(x.due_date+'T23:59:59')<new Date();});}},
      'fin-kpi-overdue-count':{t:'Parcelas vencidas',r:function(){return arr('allInstallments').filter(function(x){return (x.status||'')!=='Pago' && x.due_date && new Date(x.due_date+'T23:59:59')<new Date();});}},
      'cli-installments-count':{t:'Parcelas do cliente',r:function(){return arr('allInstallments');}},
      // NFS-e
      'nfse-kpi-total-count':{t:'Notas & Recibos',r:function(){return arr('allNfseInvoices');}},
      'nfse-kpi-total-val':{t:'Notas & Recibos',r:function(){return arr('allNfseInvoices');}},
      'nfse-kpi-asaas-count':{t:'NFS-e (Asaas)',r:function(){return arr('allNfseInvoices').filter(function(x){return (x.invoice_type||'').toLowerCase().indexOf('nfse')>=0 || x.asaas_invoice_id;});}},
      'nfse-kpi-receipts-count':{t:'Recibos',r:function(){return arr('allNfseInvoices').filter(function(x){return (x.invoice_type||'').toLowerCase().indexOf('recibo')>=0;});}},
      'nfse-kpi-taxes-val':{t:'Notas & Recibos',r:function(){return arr('allNfseInvoices');}},
      // Drive
      'drive-stat-total':{t:'Arquivos do Drive',r:function(){return arr('allDriveFiles');}},
      // Escritórios
      'stat-acc-total':{t:'Usuários & acessos',r:function(){return arr('allUsers');}},
      'access-matrix-count':{t:'Usuários & acessos',r:function(){return arr('allUsers');}},
      // Blog
      'blog-kpi-total':{t:'Artigos do blog',r:function(){return arr('adminBlogPosts');}},
      'blog-kpi-published':{t:'Artigos publicados',r:function(){return arr('adminBlogPosts').filter(function(p){return p.is_published;});}},
      'blog-kpi-views':{t:'Artigos (por visualizações)',r:function(){return arr('adminBlogPosts').slice().sort(function(a,b){return (b.views_count||0)-(a.views_count||0);});}},
      'blog-subtab-comments-count':{t:'Comentários do blog',r:function(){return arr('allBlogComments');}},
      // Auditoria
      'audit-kpi-total':{t:'Trilha de auditoria (página atual)',r:function(){return arr('currentAuditLogs');}},
      'audit-total-records':{t:'Trilha de auditoria (página atual)',r:function(){return arr('currentAuditLogs');}},
      'audit-kpi-creations':{t:'Auditoria — criações',r:function(){return arr('currentAuditLogs').filter(function(x){return (x.event_type||'')==='CRIACAO';});}},
      'audit-kpi-updates':{t:'Auditoria — alterações',r:function(){return arr('currentAuditLogs').filter(function(x){return (x.event_type||'')==='ALTERACAO';});}},
      'audit-kpi-deletions':{t:'Auditoria — exclusões',r:function(){return arr('currentAuditLogs').filter(function(x){return (x.event_type||'')==='EXCLUSAO';});}},
      // Intimações
      'pub-stat-total':{t:'Intimações & DJEN',r:function(){return arr('publicationsState');}},
      // RH / Colaboradores
      'hr-stat-total-emp':{t:'Colaboradores (RH)',r:function(){return arr('hrState.employees');}},
      'hr-stat-gross-payroll':{t:'Folha — colaboradores (bruto)',r:function(){return arr('hrState.employees');}},
      'hr-stat-net-payroll':{t:'Folha — colaboradores (líquido)',r:function(){return arr('hrState.employees');}},
      // Agenda / Eventos
      'cal-stat-total':{t:'Agenda — eventos do mês',r:function(){return arr('calendarState.events');}},
      'cal-stat-deadlines':{t:'Agenda — prazos',r:function(){return arr('calendarState.events').filter(function(e){return /prazo|deadline/i.test(e.event_type||'');});}},
      'cal-stat-hearings':{t:'Agenda — audiências/sessões',r:function(){return arr('calendarState.events').filter(function(e){return /audi|sess|hearing/i.test(e.event_type||'');});}},
      // Visitas / Pré-clientes
      'visits-count-badge':{t:'Visitas ao site',r:function(){return arr('currentVisitsList');}}
    };

    var SKIP=['id','files','password_hash','salt','plain_password','details','details_json','errors_json','texto','content','cover_image','destinatarios_json','ical_uid','reset_token','reset_token_expires','asaas_pix_qrcode','asaas_pix_copy_paste','asaas_bank_slip_url','asaas_invoice_url','hash_signature','signature_hash','xml_url','pdf_url','updated_at'];
    var PREF=['full_name','name','title','numero_processo','numeroprocessocommascara','cnj_number','client_name','cpf','cnpj','email','phone','status','contract_status','event_type','event_name','category','tribunal','role','contract_value','amount','amount_paid','balance_due','value','net_value','installment_value','due_date','deadline_date','data_disponibilizacao','paid_date','created_at','views_count'];
    var MONEY=['contract_value','amount','amount_paid','balance_due','value','net_value','installment_value','base_salary','paid_amount','deductions','iss_value'];
    function label(k){ return k.replace(/_/g,' ').replace(/\b\w/g,function(c){return c.toUpperCase();}); }
    function fmt(k,v){
      if(v===null||v===undefined||v==='') return '—';
      if(MONEY.indexOf(k)>=0 && !isNaN(parseFloat(v))) return 'R$ '+parseFloat(v).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2});
      var s=String(v);
      if(/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0,10).split('-').reverse().join('/');
      if(s.length>60) s=s.slice(0,60)+'…';
      return s;
    }
    function columns(rows){
      var keys=[]; for(var i=0;i<Math.min(rows.length,25);i++){ Object.keys(rows[i]||{}).forEach(function(k){ if(keys.indexOf(k)<0) keys.push(k); }); }
      keys=keys.filter(function(k){ return SKIP.indexOf(k)<0; });
      keys.sort(function(a,b){ var ia=PREF.indexOf(a),ib=PREF.indexOf(b); ia=ia<0?999:ia; ib=ib<0?999:ib; return ia-ib; });
      return keys.slice(0,7);
    }
    function openDrill(title,rows){
      rows=(rows||[]).slice();
      var cols=columns(rows);
      var ov=document.createElement('div'); ov.id='drill-ov';
      var box=document.createElement('div'); box.id='drill-box';
      box.innerHTML='<div id="drill-head"><div style="font-weight:800;color:#0f172a;font-size:15px">🔎 '+title+' <span id="drill-count" style="font-weight:700;color:#64748b;font-size:12px"></span></div><button id="drill-x" style="border:0;background:transparent;font-size:20px;cursor:pointer;color:#64748b">✕</button></div>'
        +'<div id="drill-tools"><input id="drill-search" placeholder="🔎 filtrar nesta caixa de dados..."/></div>'
        +'<div id="drill-scroll"><table id="drill-table"><thead></thead><tbody></tbody></table><div id="drill-empty" style="display:none;text-align:center;color:#94a3b8;padding:30px;font-size:13px">Nenhum registro para este número.</div></div>'
        +'<div id="drill-foot"><span style="font-size:11px;color:#94a3b8">Clique fora para fechar</span><div style="display:flex;gap:8px"><button class="drill-btn" id="drill-csv">⬇️ Exportar CSV</button><button class="drill-btn p" id="drill-close">Fechar</button></div></div>';
      ov.appendChild(box); document.body.appendChild(ov);
      var thead=box.querySelector('thead'), tbody=box.querySelector('tbody'), empty=box.querySelector('#drill-empty'), cnt=box.querySelector('#drill-count');
      thead.innerHTML='<tr>'+cols.map(function(k){return '<th>'+label(k)+'</th>';}).join('')+'</tr>';
      function draw(list){
        cnt.textContent='('+list.length+' registro'+(list.length===1?'':'s')+')';
        if(!list.length){ tbody.innerHTML=''; empty.style.display='block'; return; } empty.style.display='none';
        var cap=list.slice(0,1000);
        tbody.innerHTML=cap.map(function(row){ return '<tr>'+cols.map(function(k){return '<td>'+fmt(k,row[k])+'</td>';}).join('')+'</tr>'; }).join('')
          + (list.length>1000?'<tr><td colspan="'+cols.length+'" style="text-align:center;color:#94a3b8">… e mais '+(list.length-1000)+' (use o filtro ou exporte)</td></tr>':'');
      }
      draw(rows);
      box.querySelector('#drill-search').addEventListener('input',function(e){ var q=e.target.value.toLowerCase().trim();
        if(!q){ draw(rows); return; }
        draw(rows.filter(function(row){ return cols.some(function(k){ return String(row[k]==null?'':row[k]).toLowerCase().indexOf(q)>=0; }); })); });
      function close(){ ov.remove(); }
      box.querySelector('#drill-x').onclick=close; box.querySelector('#drill-close').onclick=close;
      ov.addEventListener('click',function(e){ if(e.target===ov) close(); });
      box.querySelector('#drill-csv').onclick=function(){
        var csv=[cols.map(label).join(';')].concat(rows.map(function(row){ return cols.map(function(k){ return '"'+String(row[k]==null?'':row[k]).replace(/"/g,'""')+'"'; }).join(';'); })).join('\n');
        var b=new Blob(['﻿'+csv],{type:'text/csv;charset=utf-8'}); var a=document.createElement('a'); a.href=URL.createObjectURL(b); a.download=title.replace(/[^\w]+/g,'_')+'.csv'; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(a.href);
      };
    }
    function wire(){
      Object.keys(DRILLS).forEach(function(id){
        var el=document.getElementById(id); if(!el || el.dataset.drillWired) return;
        el.dataset.drillWired='1'; el.classList.add('kpi-drill'); el.title='Clique para ver os dados por trás deste número';
        el.addEventListener('click',function(ev){ ev.stopPropagation(); var cfg=DRILLS[id]; openDrill(cfg.t, cfg.r()); });
      });
    }
    var deb; function schedule(){ clearTimeout(deb); deb=setTimeout(wire,300); }
    if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',schedule); else schedule();
    try{ new MutationObserver(schedule).observe(document.body,{childList:true,subtree:true}); }catch(e){}
    window.openDrill=openDrill;
  })();
