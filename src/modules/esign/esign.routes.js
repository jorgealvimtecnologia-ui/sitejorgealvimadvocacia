import express from 'express';
import crypto from 'node:crypto';
import { db } from '../../config/db.js';
import { requireAuth } from '../../middleware/auth.js';
import { logAudit } from '../../middleware/audit.js';
import { createNotification } from '../notifications/notifications.routes.js';

export const esignRouter = express.Router();

// ============================================================================
//  ASSINATURA ELETRÔNICA INTERNA (Lei 14.063/2020 — assinatura eletrônica
//  simples/avançada com TRILHA DE EVIDÊNCIAS). Não é ICP-Brasil.
//  Fluxo: o operador cria uma solicitação a partir de um documento (procuração,
//  contrato de honorários, etc.). O signatário recebe um link com token único,
//  lê o documento e assina (digitando ou desenhando). No ato são capturados
//  IP, user-agent, data/hora, geolocalização (se autorizada) e um hash de
//  evidência (SHA-256) que sela o conteúdo + os dados do ato. Cada passo é
//  registrado em signature_events para comprovação posterior.
// ============================================================================

db.exec(`
  CREATE TABLE IF NOT EXISTS signature_requests (
    id TEXT PRIMARY KEY,
    token TEXT UNIQUE NOT NULL,
    doc_type TEXT NOT NULL DEFAULT 'outro',   -- 'procuracao', 'contrato_honorarios', 'declaracao', 'outro'
    doc_title TEXT NOT NULL,
    content_html TEXT NOT NULL,               -- corpo do documento (HTML/texto) exibido para assinatura
    document_hash TEXT NOT NULL,              -- SHA-256 do conteúdo no momento da criação
    client_id TEXT,
    signer_name TEXT NOT NULL,
    signer_email TEXT,
    signer_cpf TEXT,
    status TEXT NOT NULL DEFAULT 'pendente',  -- 'pendente', 'assinado', 'cancelado', 'expirado', 'recusado'
    created_by TEXT,
    created_by_name TEXT,
    created_at TEXT NOT NULL,
    expires_at TEXT,
    -- Dados do ato de assinatura:
    signed_at TEXT,
    signed_name TEXT,
    signature_type TEXT,                      -- 'digitada' | 'desenhada'
    signature_data TEXT,                      -- nome digitado ou dataURL do traço
    signer_ip TEXT,
    signer_user_agent TEXT,
    signer_geo TEXT,
    evidence_hash TEXT,                       -- SHA-256 final que sela o ato
    notes TEXT
  );
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS signature_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    request_id TEXT NOT NULL,
    event_type TEXT NOT NULL,                 -- 'criado', 'aberto', 'assinado', 'cancelado', 'recusado'
    ip TEXT,
    user_agent TEXT,
    geo TEXT,
    detail TEXT,
    created_at TEXT NOT NULL,
    FOREIGN KEY (request_id) REFERENCES signature_requests(id) ON DELETE CASCADE
  );
`);

function sha256(str) {
  return crypto.createHash('sha256').update(String(str), 'utf8').digest('hex');
}

function getIp(req) {
  const fwd = req.headers['x-forwarded-for'];
  if (fwd) return String(fwd).split(',')[0].trim();
  return req.socket?.remoteAddress || req.ip || '0.0.0.0';
}

function logEvent(requestId, type, req, detail = null) {
  try {
    db.prepare(`
      INSERT INTO signature_events (request_id, event_type, ip, user_agent, geo, detail, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      requestId, type, getIp(req),
      (req.headers['user-agent'] || '').substring(0, 255),
      req.body?.geo ? String(req.body.geo).substring(0, 120) : null,
      detail, new Date().toISOString()
    );
  } catch (e) { /* silencioso */ }
}

function publicBaseUrl(req) {
  const envUrl = process.env.PUBLIC_BASE_URL;
  if (envUrl) return envUrl.replace(/\/$/, '');
  const proto = (req.headers['x-forwarded-proto'] || req.protocol || 'https').split(',')[0];
  return `${proto}://${req.headers.host}`;
}

function escapeHtml(s) {
  return String(s || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// ----------------------------------------------------------------------------
//  ROTAS ADMINISTRATIVAS (painel)
// ----------------------------------------------------------------------------

/** POST /api/esign/requests — cria uma solicitação de assinatura. */
esignRouter.post('/api/esign/requests', requireAuth, (req, res) => {
  try {
    const {
      doc_type = 'outro', doc_title, content_html,
      client_id = null, signer_name, signer_email = null, signer_cpf = null,
      expires_in_days = 15, notes = null
    } = (req.body || {});

    if (!doc_title || !content_html || !signer_name) {
      return res.status(400).json({ error: 'Título, conteúdo do documento e nome do signatário são obrigatórios.' });
    }

    const year = new Date().getFullYear();
    const prefix = `SIGN-${year}-`;
    const last = db.prepare(`SELECT id FROM signature_requests WHERE id LIKE ? ORDER BY id DESC LIMIT 1`).get(`${prefix}%`);
    let next = 1;
    if (last?.id) { const m = last.id.match(/(\d+)$/); if (m) next = parseInt(m[1], 10) + 1; }
    const id = `${prefix}${String(next).padStart(4, '0')}`;
    const token = crypto.randomBytes(24).toString('hex');
    const now = new Date();
    const nowIso = now.toISOString();
    const expiresAt = new Date(now.getTime() + (parseInt(expires_in_days, 10) || 15) * 86400000).toISOString();
    const documentHash = sha256(content_html);

    db.prepare(`
      INSERT INTO signature_requests
        (id, token, doc_type, doc_title, content_html, document_hash, client_id,
         signer_name, signer_email, signer_cpf, status, created_by, created_by_name, created_at, expires_at, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pendente', ?, ?, ?, ?, ?)
    `).run(
      id, token, doc_type, doc_title.trim(), content_html, documentHash, client_id,
      signer_name.trim(), signer_email, signer_cpf,
      req.user.id || req.user.userId, req.user.name || req.user.username, nowIso, expiresAt, notes
    );

    logEvent(id, 'criado', req, `Documento "${doc_title}" para ${signer_name}`);
    logAudit(req, {
      event_type: 'CRIACAO', event_name: 'CRIAR_SOLICITACAO_ASSINATURA', module: 'ASSINATURA',
      resource_id: id, description: `Solicitação de assinatura ${id} ("${doc_title}") criada para ${signer_name}.`,
      details: { doc_type, signer_name, signer_email }
    });

    const signUrl = `${publicBaseUrl(req)}/assinar/${token}`;
    return res.status(201).json({
      success: true,
      message: `Solicitação ${id} criada. Envie o link ao signatário.`,
      request: db.prepare(`SELECT id, token, doc_title, signer_name, status, expires_at FROM signature_requests WHERE id = ?`).get(id),
      sign_url: signUrl
    });
  } catch (err) {
    console.error('[ASSINATURA] Falha ao criar solicitação:', err);
    return res.status(500).json({ error: 'Erro ao criar solicitação de assinatura.' });
  }
});

/** GET /api/esign/requests — lista com filtros (?status=&q=). */
esignRouter.get('/api/esign/requests', requireAuth, (req, res) => {
  try {
    const { status, q } = req.query;
    let sql = `SELECT id, token, doc_type, doc_title, client_id, signer_name, signer_email,
                      status, created_at, created_by_name, expires_at, signed_at, evidence_hash
               FROM signature_requests WHERE 1=1`;
    const p = [];
    if (status) { sql += ` AND status = ?`; p.push(status); }
    if (q) { sql += ` AND (id LIKE ? OR doc_title LIKE ? OR signer_name LIKE ?)`; const t = `%${q.trim()}%`; p.push(t, t, t); }
    sql += ` ORDER BY created_at DESC LIMIT 300`;
    const rows = db.prepare(sql).all(...p);
    const stats = {
      pendente: db.prepare(`SELECT COUNT(*) c FROM signature_requests WHERE status='pendente'`).get().c,
      assinado: db.prepare(`SELECT COUNT(*) c FROM signature_requests WHERE status='assinado'`).get().c,
      cancelado: db.prepare(`SELECT COUNT(*) c FROM signature_requests WHERE status IN ('cancelado','recusado','expirado')`).get().c
    };
    return res.json({ success: true, count: rows.length, stats, requests: rows });
  } catch (err) {
    console.error('[ASSINATURA] Falha ao listar:', err);
    return res.status(500).json({ error: 'Erro ao listar solicitações.' });
  }
});

/** GET /api/esign/requests/:id — detalhe + trilha de eventos. */
esignRouter.get('/api/esign/requests/:id', requireAuth, (req, res) => {
  try {
    const r = db.prepare(`SELECT * FROM signature_requests WHERE id = ?`).get(req.params.id);
    if (!r) return res.status(404).json({ error: 'Solicitação não encontrada.' });
    const events = db.prepare(`SELECT * FROM signature_events WHERE request_id = ? ORDER BY created_at ASC`).all(r.id);
    r.sign_url = `${publicBaseUrl(req)}/assinar/${r.token}`;
    if (r.evidence_hash) r.verify_url = `${publicBaseUrl(req)}/validar-assinatura/${r.evidence_hash}`;
    return res.json({ success: true, request: r, events });
  } catch (err) {
    return res.status(500).json({ error: 'Erro ao carregar solicitação.' });
  }
});

/** POST /api/esign/requests/:id/cancel — cancela uma solicitação pendente. */
esignRouter.post('/api/esign/requests/:id/cancel', requireAuth, (req, res) => {
  try {
    const r = db.prepare(`SELECT * FROM signature_requests WHERE id = ?`).get(req.params.id);
    if (!r) return res.status(404).json({ error: 'Solicitação não encontrada.' });
    if (r.status === 'assinado') return res.status(400).json({ error: 'Documento já assinado não pode ser cancelado.' });
    db.prepare(`UPDATE signature_requests SET status='cancelado' WHERE id=?`).run(r.id);
    logEvent(r.id, 'cancelado', req, `Cancelado por ${req.user.name || req.user.username}`);
    logAudit(req, {
      event_type: 'ALTERACAO', event_name: 'CANCELAR_ASSINATURA', module: 'ASSINATURA',
      resource_id: r.id, description: `Solicitação de assinatura ${r.id} cancelada.`
    });
    return res.json({ success: true, message: 'Solicitação cancelada.' });
  } catch (err) {
    return res.status(500).json({ error: 'Erro ao cancelar solicitação.' });
  }
});

// ----------------------------------------------------------------------------
//  ROTAS PÚBLICAS (signatário — sem autenticação, via token)
// ----------------------------------------------------------------------------

/** GET /api/esign/public/:token — dados do documento para o signatário. */
esignRouter.get('/api/esign/public/:token', (req, res) => {
  try {
    const r = db.prepare(`SELECT * FROM signature_requests WHERE token = ?`).get(req.params.token);
    if (!r) return res.status(404).json({ error: 'Documento não encontrado.' });

    if (r.status === 'pendente' && r.expires_at && new Date(r.expires_at) < new Date()) {
      db.prepare(`UPDATE signature_requests SET status='expirado' WHERE id=?`).run(r.id);
      r.status = 'expirado';
    }
    if (r.status === 'pendente') logEvent(r.id, 'aberto', req, 'Documento visualizado pelo signatário');

    return res.json({
      success: true,
      request: {
        id: r.id, doc_type: r.doc_type, doc_title: r.doc_title, content_html: r.content_html,
        signer_name: r.signer_name, status: r.status, created_at: r.created_at, expires_at: r.expires_at,
        signed_at: r.signed_at, evidence_hash: r.evidence_hash, document_hash: r.document_hash
      }
    });
  } catch (err) {
    console.error('[ASSINATURA] Falha no acesso público:', err);
    return res.status(500).json({ error: 'Erro ao carregar documento.' });
  }
});

/** POST /api/esign/public/:token/sign — registra a assinatura. */
esignRouter.post('/api/esign/public/:token/sign', (req, res) => {
  try {
    const { signer_name_confirm, signature_type = 'digitada', signature_data, agree } = (req.body || {});
    const r = db.prepare(`SELECT * FROM signature_requests WHERE token = ?`).get(req.params.token);
    if (!r) return res.status(404).json({ error: 'Documento não encontrado.' });
    if (r.status !== 'pendente') return res.status(400).json({ error: `Documento não está pendente (status: ${r.status}).` });
    if (r.expires_at && new Date(r.expires_at) < new Date()) {
      db.prepare(`UPDATE signature_requests SET status='expirado' WHERE id=?`).run(r.id);
      return res.status(400).json({ error: 'O prazo para assinatura expirou.' });
    }
    if (!agree) return res.status(400).json({ error: 'É necessário declarar que leu e concorda com o documento.' });
    if (!signer_name_confirm || !signature_data) return res.status(400).json({ error: 'Confirme seu nome completo e forneça a assinatura.' });

    const ip = getIp(req);
    const ua = (req.headers['user-agent'] || '').substring(0, 255);
    const geo = req.body?.geo ? String(req.body.geo).substring(0, 120) : null;
    const signedAt = new Date().toISOString();

    // Hash de evidência: sela conteúdo + identidade + ato + ambiente.
    const evidencePayload = [
      r.id, r.document_hash, signer_name_confirm.trim(),
      signature_type, ip, ua, geo || '', signedAt
    ].join('|');
    const evidenceHash = sha256(evidencePayload);

    db.prepare(`
      UPDATE signature_requests
      SET status='assinado', signed_at=?, signed_name=?, signature_type=?, signature_data=?,
          signer_ip=?, signer_user_agent=?, signer_geo=?, evidence_hash=?
      WHERE id=?
    `).run(signedAt, signer_name_confirm.trim(), signature_type, signature_data, ip, ua, geo, evidenceHash, r.id);

    logEvent(r.id, 'assinado', req, `Assinado por ${signer_name_confirm.trim()} (${signature_type})`);

    createNotification({
      category: 'assinatura', level: 'info',
      title: `✍️ Documento assinado: ${r.doc_title}`,
      message: `${signer_name_confirm.trim()} assinou "${r.doc_title}" (${r.id}).`,
      link: '#tab:esign', resource_type: 'signature_request', resource_id: r.id,
      dedupe_key: `assinatura:concluida:${r.id}`
    });

    return res.json({
      success: true,
      message: 'Documento assinado com sucesso!',
      evidence_hash: evidenceHash,
      signed_at: signedAt,
      verify_url: `${publicBaseUrl(req)}/validar-assinatura/${evidenceHash}`
    });
  } catch (err) {
    console.error('[ASSINATURA] Falha ao registrar assinatura:', err);
    return res.status(500).json({ error: 'Erro ao registrar assinatura.' });
  }
});

/** GET /api/esign/verify/:hash — verificação pública de autenticidade (JSON). */
esignRouter.get('/api/esign/verify/:hash', (req, res) => {
  try {
    const r = db.prepare(`SELECT * FROM signature_requests WHERE evidence_hash = ?`).get(req.params.hash);
    if (!r) return res.status(404).json({ success: false, error: 'Assinatura não encontrada. Hash inválido.' });
    return res.json({
      success: true,
      valid: true,
      document: {
        id: r.id, doc_title: r.doc_title, doc_type: r.doc_type,
        signer_name: r.signed_name || r.signer_name, signed_at: r.signed_at,
        document_hash: r.document_hash, evidence_hash: r.evidence_hash,
        signer_ip: r.signer_ip, signature_type: r.signature_type, signer_geo: r.signer_geo
      }
    });
  } catch (err) {
    return res.status(500).json({ error: 'Erro na verificação.' });
  }
});

// ----------------------------------------------------------------------------
//  PÁGINAS PÚBLICAS (HTML servido pelo próprio módulo)
// ----------------------------------------------------------------------------

const PAGE_HEAD = `
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="robots" content="noindex, nofollow" />
  <script src="https://cdn.tailwindcss.com"></script>
  <link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@600;700&family=Plus+Jakarta+Sans:wght@400;500;600;700&family=Dancing+Script:wght@600;700&display=swap" rel="stylesheet" />
  <style>
    body{font-family:'Plus Jakarta Sans',system-ui,sans-serif;background:#FDFBF7;color:#0F172A}
    .font-serif{font-family:'Playfair Display',Georgia,serif}
    .font-sign{font-family:'Dancing Script',cursive}
  </style>`;

/** GET /assinar/:token — página de assinatura para o signatário. */
esignRouter.get('/assinar/:token', (req, res) => {
  const token = escapeHtml(req.params.token);
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(`<!DOCTYPE html><html lang="pt-BR"><head><title>Assinatura de Documento • Jorge Alvim Advocacia</title>${PAGE_HEAD}</head>
<body class="min-h-screen">
  <header class="bg-white border-b border-slate-200 py-4 px-4 sm:px-8 flex items-center gap-3">
    <div class="w-10 h-10 rounded-xl bg-amber-50 border-2 border-amber-400 flex items-center justify-center text-amber-700 font-bold">JA</div>
    <div><div class="font-serif font-bold text-navy-900 text-lg">Jorge Alvim Advocacia</div>
    <div class="text-[11px] uppercase tracking-widest text-amber-700 font-bold">Assinatura Eletrônica Segura</div></div>
  </header>
  <main class="max-w-3xl mx-auto px-4 py-8" id="app">
    <div id="loading" class="text-center py-20 text-slate-500">Carregando documento…</div>
  </main>
  <script>
    const TOKEN = ${JSON.stringify(req.params.token)};
    const app = document.getElementById('app');
    let geoStr = null;
    navigator.geolocation && navigator.geolocation.getCurrentPosition(
      p => { geoStr = p.coords.latitude.toFixed(5) + ',' + p.coords.longitude.toFixed(5); },
      () => {}, { timeout: 5000 }
    );
    function esc(s){const d=document.createElement('div');d.textContent=s==null?'':s;return d.innerHTML;}

    async function load() {
      try {
        const r = await fetch('/api/esign/public/' + TOKEN);
        const data = await r.json();
        if (!r.ok) return app.innerHTML = card('❌ ' + (data.error || 'Documento indisponível.'), 'red');
        render(data.request);
      } catch(e){ app.innerHTML = card('Erro de conexão. Tente novamente.', 'red'); }
    }
    function card(msg, tone){
      const c = tone==='red' ? 'border-red-200 bg-red-50 text-red-800' : 'border-emerald-200 bg-emerald-50 text-emerald-800';
      return '<div class="rounded-2xl border '+c+' p-8 text-center font-semibold">'+msg+'</div>';
    }
    function render(req){
      if (req.status === 'assinado') {
        return app.innerHTML = card('✅ Este documento já foi assinado em ' + new Date(req.signed_at).toLocaleString('pt-BR') + '.<br><span class="text-xs font-mono break-all">Código: '+esc(req.evidence_hash)+'</span>', 'green');
      }
      if (req.status !== 'pendente') {
        return app.innerHTML = card('Este documento está com status "'+esc(req.status)+'" e não pode ser assinado.', 'red');
      }
      app.innerHTML = \`
        <div class="mb-4">
          <span class="inline-block px-3 py-1 rounded-md bg-amber-100 border border-amber-300 text-amber-800 text-xs font-bold uppercase tracking-wider">\${esc(req.doc_type).replace(/_/g,' ')}</span>
          <h1 class="font-serif text-2xl font-bold text-navy-900 mt-2">\${esc(req.doc_title)}</h1>
          <p class="text-sm text-slate-500 mt-1">Signatário: <strong>\${esc(req.signer_name)}</strong></p>
        </div>
        <div class="rounded-2xl border border-slate-200 bg-white shadow-sm p-6 max-h-[45vh] overflow-y-auto text-sm leading-relaxed text-slate-700 whitespace-pre-wrap">\${req.content_html}</div>
        <div class="rounded-2xl border border-slate-200 bg-white shadow-sm p-6 mt-5">
          <h2 class="font-bold text-navy-900 mb-3">Sua assinatura</h2>
          <div class="flex gap-2 mb-3">
            <button type="button" id="tab-type" onclick="setMode('digitada')" class="px-3 py-1.5 rounded-lg text-xs font-bold border">Digitar</button>
            <button type="button" id="tab-draw" onclick="setMode('desenhada')" class="px-3 py-1.5 rounded-lg text-xs font-bold border">Desenhar</button>
          </div>
          <div id="mode-type">
            <input id="typed" oninput="document.getElementById('preview').textContent=this.value" placeholder="Digite seu nome completo" class="w-full border border-slate-300 rounded-lg px-3 py-2 text-base" />
            <div class="mt-2 h-16 flex items-center justify-center border border-dashed border-slate-300 rounded-lg"><span id="preview" class="font-sign text-3xl text-navy-900"></span></div>
          </div>
          <div id="mode-draw" class="hidden">
            <canvas id="pad" width="600" height="150" class="w-full border border-slate-300 rounded-lg bg-slate-50 touch-none"></canvas>
            <button type="button" onclick="clearPad()" class="mt-1 text-xs text-slate-500 underline">Limpar traço</button>
          </div>
          <label class="flex items-start gap-2 mt-4 text-sm text-slate-700">
            <input type="checkbox" id="agree" class="mt-1" />
            <span>Declaro que li e <strong>concordo</strong> com o conteúdo deste documento e assino-o eletronicamente. Estou ciente de que serão registrados data, hora, IP e localização como prova do ato.</span>
          </label>
          <div class="mt-3">
            <label class="text-xs text-slate-500">Confirme seu nome completo</label>
            <input id="confirm" placeholder="Nome completo" class="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm mt-1" value="\${esc(req.signer_name)}" />
          </div>
          <button id="submit" onclick="doSign()" class="w-full mt-4 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold shadow transition">Assinar documento</button>
          <p id="err" class="text-red-600 text-sm mt-2 hidden"></p>
        </div>\`;
      setMode('digitada');
    }
    let mode='digitada', ctx, drawing=false, hasDrawing=false;
    function setMode(m){
      mode=m;
      document.getElementById('mode-type').classList.toggle('hidden', m!=='digitada');
      document.getElementById('mode-draw').classList.toggle('hidden', m!=='desenhada');
      const a='px-3 py-1.5 rounded-lg text-xs font-bold border bg-amber-500 text-white border-amber-500';
      const i='px-3 py-1.5 rounded-lg text-xs font-bold border bg-white text-slate-700 border-slate-300';
      document.getElementById('tab-type').className = m==='digitada'?a:i;
      document.getElementById('tab-draw').className = m==='desenhada'?a:i;
      if (m==='desenhada') initPad();
    }
    function initPad(){
      const c=document.getElementById('pad'); if(!c||ctx) { if(ctx) return; }
      ctx=c.getContext('2d'); ctx.lineWidth=2.5; ctx.lineCap='round'; ctx.strokeStyle='#0B192C';
      const pos=e=>{const r=c.getBoundingClientRect();const t=e.touches?e.touches[0]:e;return[(t.clientX-r.left)*(c.width/r.width),(t.clientY-r.top)*(c.height/r.height)];};
      const start=e=>{drawing=true;hasDrawing=true;const[x,y]=pos(e);ctx.beginPath();ctx.moveTo(x,y);e.preventDefault();};
      const move=e=>{if(!drawing)return;const[x,y]=pos(e);ctx.lineTo(x,y);ctx.stroke();e.preventDefault();};
      const end=()=>{drawing=false;};
      c.onmousedown=start;c.onmousemove=move;window.addEventListener('mouseup',end);
      c.ontouchstart=start;c.ontouchmove=move;c.ontouchend=end;
    }
    function clearPad(){const c=document.getElementById('pad');ctx&&ctx.clearRect(0,0,c.width,c.height);hasDrawing=false;}
    async function doSign(){
      const err=document.getElementById('err'); err.classList.add('hidden');
      const agree=document.getElementById('agree').checked;
      const confirm=document.getElementById('confirm').value.trim();
      let sigData, sigType=mode;
      if(mode==='digitada'){ sigData=document.getElementById('typed').value.trim(); if(!sigData){return showErr('Digite sua assinatura.');} }
      else { if(!hasDrawing){return showErr('Desenhe sua assinatura.');} sigData=document.getElementById('pad').toDataURL('image/png'); }
      if(!confirm) return showErr('Confirme seu nome completo.');
      if(!agree) return showErr('Marque a declaração de concordância.');
      const btn=document.getElementById('submit'); btn.disabled=true; btn.textContent='Assinando…';
      try{
        const r=await fetch('/api/esign/public/'+TOKEN+'/sign',{method:'POST',headers:{'Content-Type':'application/json'},
          body:JSON.stringify({signer_name_confirm:confirm,signature_type:sigType,signature_data:sigData,agree:true,geo:geoStr})});
        const d=await r.json();
        if(!r.ok){btn.disabled=false;btn.textContent='Assinar documento';return showErr(d.error||'Falha ao assinar.');}
        app.innerHTML = card('✅ <strong>Documento assinado com sucesso!</strong><br><br>Código de verificação:<br><span class="text-xs font-mono break-all">'+esc(d.evidence_hash)+'</span><br><br><a class="underline" href="'+d.verify_url+'">Validar autenticidade</a>', 'green');
        window.scrollTo(0,0);
      }catch(e){btn.disabled=false;btn.textContent='Assinar documento';showErr('Erro de conexão.');}
      function showErr(m){err.textContent=m;err.classList.remove('hidden');}
    }
    function showErr(m){const e=document.getElementById('err');e.textContent=m;e.classList.remove('hidden');}
    load();
  </script>
</body></html>`);
});

/** GET /validar-assinatura/:hash — página pública de verificação. */
esignRouter.get('/validar-assinatura/:hash', (req, res) => {
  const r = db.prepare(`SELECT * FROM signature_requests WHERE evidence_hash = ?`).get(req.params.hash);
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  const body = r ? `
    <div class="rounded-2xl border border-emerald-300 bg-emerald-50 p-8">
      <div class="text-emerald-700 font-bold text-lg mb-4">✅ Assinatura autêntica e válida</div>
      <dl class="text-sm text-slate-700 space-y-2">
        <div><dt class="text-slate-500 text-xs uppercase">Documento</dt><dd class="font-semibold">${escapeHtml(r.doc_title)} (${escapeHtml(r.id)})</dd></div>
        <div><dt class="text-slate-500 text-xs uppercase">Signatário</dt><dd class="font-semibold">${escapeHtml(r.signed_name || r.signer_name)}</dd></div>
        <div><dt class="text-slate-500 text-xs uppercase">Data/hora</dt><dd>${r.signed_at ? new Date(r.signed_at).toLocaleString('pt-BR') : '—'}</dd></div>
        <div><dt class="text-slate-500 text-xs uppercase">IP registrado</dt><dd>${escapeHtml(r.signer_ip || '—')}</dd></div>
        <div><dt class="text-slate-500 text-xs uppercase">Hash do documento (SHA-256)</dt><dd class="font-mono text-xs break-all">${escapeHtml(r.document_hash)}</dd></div>
        <div><dt class="text-slate-500 text-xs uppercase">Hash de evidência (SHA-256)</dt><dd class="font-mono text-xs break-all">${escapeHtml(r.evidence_hash)}</dd></div>
      </dl>
    </div>` : `
    <div class="rounded-2xl border border-red-300 bg-red-50 p-8 text-center text-red-800 font-semibold">
      ❌ Nenhuma assinatura corresponde a este código. O documento pode ter sido adulterado ou o código está incorreto.
    </div>`;
  res.send(`<!DOCTYPE html><html lang="pt-BR"><head><title>Validação de Assinatura • Jorge Alvim Advocacia</title>${PAGE_HEAD}</head>
<body class="min-h-screen"><main class="max-w-2xl mx-auto px-4 py-10">
  <h1 class="font-serif text-2xl font-bold text-navy-900 mb-1">Validação de Assinatura Eletrônica</h1>
  <p class="text-sm text-slate-500 mb-6">Conferência de autenticidade — Jorge Alvim Advocacia</p>
  ${body}
</main></body></html>`);
});
