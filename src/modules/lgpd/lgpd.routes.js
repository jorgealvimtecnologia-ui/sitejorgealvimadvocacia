import express from 'express';
import crypto from 'node:crypto';
import { db } from '../../config/db.js';
import { requireAuth } from '../../middleware/auth.js';
import { logAudit } from '../../middleware/audit.js';
import { createNotification } from '../notifications/notifications.routes.js';

export const lgpdRouter = express.Router();

// ============================================================================
//  MÓDULO LGPD (Lei 13.709/2018)
//  - Registro de consentimentos (art. 8º).
//  - Requisições dos titulares (art. 18: acesso, correção, exclusão,
//    portabilidade, revogação, oposição), com protocolo e prazo legal (15 dias).
//  - Mapa de dados: localiza onde os dados de uma pessoa estão no sistema,
//    apoiando o direito de acesso e de eliminação.
//  - Página pública de privacidade + formulário de requisição do titular.
// ============================================================================

db.exec(`
  CREATE TABLE IF NOT EXISTS lgpd_consents (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    subject_type TEXT NOT NULL DEFAULT 'cliente',  -- 'cliente', 'lead', 'visitante'
    subject_id TEXT,
    subject_name TEXT,
    subject_doc TEXT,                              -- CPF/CNPJ
    purpose TEXT NOT NULL,                         -- finalidade do tratamento
    channel TEXT,                                  -- 'site', 'contrato', 'whatsapp', etc.
    consent_text TEXT,
    granted INTEGER NOT NULL DEFAULT 1,
    ip TEXT,
    user_agent TEXT,
    created_at TEXT NOT NULL,
    revoked_at TEXT
  );
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS lgpd_requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    protocol TEXT UNIQUE NOT NULL,
    subject_name TEXT NOT NULL,
    subject_doc TEXT,
    subject_email TEXT,
    subject_phone TEXT,
    request_type TEXT NOT NULL,     -- 'acesso','correcao','exclusao','portabilidade','revogacao','oposicao','info'
    description TEXT,
    status TEXT NOT NULL DEFAULT 'aberto',  -- 'aberto','em_andamento','concluido','recusado'
    response TEXT,
    handled_by TEXT,
    source TEXT DEFAULT 'painel',   -- 'painel' | 'publico'
    ip TEXT,
    created_at TEXT NOT NULL,
    due_date TEXT,                  -- prazo legal (15 dias)
    updated_at TEXT NOT NULL
  );
`);

const REQUEST_TYPES = {
  acesso: 'Acesso aos dados', correcao: 'Correção de dados', exclusao: 'Exclusão/eliminação',
  portabilidade: 'Portabilidade', revogacao: 'Revogação de consentimento', oposicao: 'Oposição ao tratamento', info: 'Informação/dúvida'
};

function getIp(req) {
  const fwd = req.headers['x-forwarded-for'];
  if (fwd) return String(fwd).split(',')[0].trim();
  return req.socket?.remoteAddress || req.ip || '0.0.0.0';
}
function escapeHtml(s) {
  return String(s || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function genProtocol() {
  const y = new Date().getFullYear();
  const last = db.prepare(`SELECT protocol FROM lgpd_requests WHERE protocol LIKE ? ORDER BY id DESC LIMIT 1`).get(`LGPD-${y}-%`);
  let n = 1;
  if (last?.protocol) { const m = last.protocol.match(/(\d+)$/); if (m) n = parseInt(m[1], 10) + 1; }
  return `LGPD-${y}-${String(n).padStart(4, '0')}`;
}

// ----------------------------------------------------------------------------
//  CONSENTIMENTOS
// ----------------------------------------------------------------------------

/** POST /api/lgpd/consents — registra um consentimento. */
lgpdRouter.post('/api/lgpd/consents', requireAuth, (req, res) => {
  try {
    const { subject_type = 'cliente', subject_id = null, subject_name, subject_doc = null,
            purpose, channel = 'painel', consent_text = null, granted = 1 } = (req.body || {});
    if (!subject_name || !purpose) return res.status(400).json({ error: 'Titular e finalidade são obrigatórios.' });
    const now = new Date().toISOString();
    const info = db.prepare(`
      INSERT INTO lgpd_consents (subject_type, subject_id, subject_name, subject_doc, purpose, channel, consent_text, granted, ip, user_agent, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(subject_type, subject_id, subject_name.trim(), subject_doc, purpose.trim(), channel, consent_text,
           granted ? 1 : 0, getIp(req), (req.headers['user-agent'] || '').substring(0, 255), now);
    logAudit(req, { event_type: 'CRIACAO', event_name: 'REGISTRAR_CONSENTIMENTO', module: 'LGPD',
      resource_id: String(info.lastInsertRowid), description: `Consentimento registrado para ${subject_name} (${purpose}).` });
    return res.status(201).json({ success: true, id: info.lastInsertRowid });
  } catch (err) {
    return res.status(500).json({ error: 'Erro ao registrar consentimento.' });
  }
});

/** GET /api/lgpd/consents — lista consentimentos. */
lgpdRouter.get('/api/lgpd/consents', requireAuth, (req, res) => {
  try {
    const rows = db.prepare(`SELECT * FROM lgpd_consents ORDER BY created_at DESC LIMIT 300`).all();
    return res.json({ success: true, count: rows.length, consents: rows });
  } catch (err) {
    return res.status(500).json({ error: 'Erro ao listar consentimentos.' });
  }
});

/** POST /api/lgpd/consents/:id/revoke — revoga um consentimento. */
lgpdRouter.post('/api/lgpd/consents/:id/revoke', requireAuth, (req, res) => {
  try {
    const c = db.prepare(`SELECT * FROM lgpd_consents WHERE id = ?`).get(req.params.id);
    if (!c) return res.status(404).json({ error: 'Consentimento não encontrado.' });
    db.prepare(`UPDATE lgpd_consents SET granted = 0, revoked_at = ? WHERE id = ?`).run(new Date().toISOString(), c.id);
    logAudit(req, { event_type: 'ALTERACAO', event_name: 'REVOGAR_CONSENTIMENTO', module: 'LGPD',
      resource_id: String(c.id), description: `Consentimento de ${c.subject_name} revogado.` });
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ error: 'Erro ao revogar consentimento.' });
  }
});

// ----------------------------------------------------------------------------
//  REQUISIÇÕES DE TITULARES
// ----------------------------------------------------------------------------

/** GET /api/lgpd/requests — lista + estatísticas. */
lgpdRouter.get('/api/lgpd/requests', requireAuth, (req, res) => {
  try {
    const { status } = req.query;
    let sql = `SELECT * FROM lgpd_requests WHERE 1=1`; const p = [];
    if (status) { sql += ` AND status = ?`; p.push(status); }
    sql += ` ORDER BY created_at DESC LIMIT 300`;
    const rows = db.prepare(sql).all(...p);
    const stats = {
      aberto: db.prepare(`SELECT COUNT(*) c FROM lgpd_requests WHERE status='aberto'`).get().c,
      em_andamento: db.prepare(`SELECT COUNT(*) c FROM lgpd_requests WHERE status='em_andamento'`).get().c,
      concluido: db.prepare(`SELECT COUNT(*) c FROM lgpd_requests WHERE status='concluido'`).get().c,
      vencendo: db.prepare(`SELECT COUNT(*) c FROM lgpd_requests WHERE status IN ('aberto','em_andamento') AND due_date IS NOT NULL AND due_date <= ?`).get(new Date(Date.now() + 3 * 86400000).toISOString()).c
    };
    return res.json({ success: true, count: rows.length, stats, types: REQUEST_TYPES, requests: rows });
  } catch (err) {
    return res.status(500).json({ error: 'Erro ao listar requisições.' });
  }
});

function createRequest({ subject_name, subject_doc, subject_email, subject_phone, request_type, description, source, ip }) {
  const now = new Date().toISOString();
  const due = new Date(Date.now() + 15 * 86400000).toISOString();
  const protocol = genProtocol();
  const info = db.prepare(`
    INSERT INTO lgpd_requests (protocol, subject_name, subject_doc, subject_email, subject_phone, request_type, description, status, source, ip, created_at, due_date, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'aberto', ?, ?, ?, ?, ?)
  `).run(protocol, subject_name, subject_doc || null, subject_email || null, subject_phone || null,
         request_type, description || null, source, ip || null, now, due, now);
  return { id: info.lastInsertRowid, protocol, due_date: due };
}

/** POST /api/lgpd/requests — cria requisição pelo painel. */
lgpdRouter.post('/api/lgpd/requests', requireAuth, (req, res) => {
  try {
    const { subject_name, subject_doc, subject_email, subject_phone, request_type, description } = (req.body || {});
    if (!subject_name || !request_type) return res.status(400).json({ error: 'Titular e tipo de requisição são obrigatórios.' });
    if (!REQUEST_TYPES[request_type]) return res.status(400).json({ error: 'Tipo de requisição inválido.' });
    const r = createRequest({ subject_name: subject_name.trim(), subject_doc, subject_email, subject_phone, request_type, description, source: 'painel', ip: getIp(req) });
    logAudit(req, { event_type: 'CRIACAO', event_name: 'NOVA_REQUISICAO_LGPD', module: 'LGPD',
      resource_id: r.protocol, description: `Requisição LGPD ${r.protocol} (${REQUEST_TYPES[request_type]}) para ${subject_name}.` });
    return res.status(201).json({ success: true, ...r });
  } catch (err) {
    return res.status(500).json({ error: 'Erro ao criar requisição.' });
  }
});

/** PATCH /api/lgpd/requests/:id — atualiza status/resposta. */
lgpdRouter.patch('/api/lgpd/requests/:id', requireAuth, (req, res) => {
  try {
    const { status, response } = (req.body || {});
    const r = db.prepare(`SELECT * FROM lgpd_requests WHERE id = ?`).get(req.params.id);
    if (!r) return res.status(404).json({ error: 'Requisição não encontrada.' });
    const now = new Date().toISOString();
    db.prepare(`UPDATE lgpd_requests SET status = COALESCE(?, status), response = COALESCE(?, response), handled_by = ?, updated_at = ? WHERE id = ?`)
      .run(status || null, response || null, req.user.name || req.user.username, now, r.id);
    logAudit(req, { event_type: 'ALTERACAO', event_name: 'ATUALIZAR_REQUISICAO_LGPD', module: 'LGPD',
      resource_id: r.protocol, description: `Requisição ${r.protocol} atualizada para "${status || r.status}".` });
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ error: 'Erro ao atualizar requisição.' });
  }
});

/** GET /api/lgpd/data-map?q=... — localiza onde os dados de uma pessoa estão. */
lgpdRouter.get('/api/lgpd/data-map', requireAuth, (req, res) => {
  try {
    const q = (req.query.q || '').trim();
    if (!q) return res.status(400).json({ error: 'Informe nome, CPF/CNPJ ou e-mail para buscar.' });
    const like = `%${q}%`;
    const map = [];
    const safe = (label, table, sql, params) => {
      try {
        const rows = db.prepare(sql).all(...params);
        if (rows.length) map.push({ source: label, table, count: rows.length, records: rows.slice(0, 20) });
      } catch (e) { /* tabela pode não existir */ }
    };
    safe('Clientes', 'clients',
      `SELECT id, full_name, cpf, cnpj, email, phone, created_at FROM clients WHERE full_name LIKE ? OR cpf LIKE ? OR cnpj LIKE ? OR email LIKE ?`,
      [like, like, like, like]);
    safe('Leads / Contatos', 'leads',
      `SELECT * FROM leads WHERE name LIKE ? OR email LIKE ? OR phone LIKE ?`, [like, like, like]);
    safe('Portal do Cliente', 'clients',
      `SELECT id, full_name, email FROM clients WHERE email LIKE ?`, [like]);
    safe('Logs de Auditoria', 'audit_logs',
      `SELECT id, event_name, user_name, user_cpf, created_at FROM audit_logs WHERE user_name LIKE ? OR user_cpf LIKE ? ORDER BY created_at DESC LIMIT 50`,
      [like, like]);
    safe('Consentimentos', 'lgpd_consents',
      `SELECT id, subject_name, subject_doc, purpose, granted, created_at FROM lgpd_consents WHERE subject_name LIKE ? OR subject_doc LIKE ?`,
      [like, like]);
    safe('Assinaturas', 'signature_requests',
      `SELECT id, doc_title, signer_name, signer_cpf, status, created_at FROM signature_requests WHERE signer_name LIKE ? OR signer_cpf LIKE ?`,
      [like, like]);
    const total = map.reduce((s, m) => s + m.count, 0);
    logAudit(req, { event_type: 'CONSULTA', event_name: 'MAPA_DADOS_LGPD', module: 'LGPD',
      description: `Mapa de dados consultado para "${q}" (${total} registro(s) em ${map.length} fonte(s)).` });
    return res.json({ success: true, query: q, total, sources: map });
  } catch (err) {
    console.error('[LGPD] Falha no mapa de dados:', err);
    return res.status(500).json({ error: 'Erro ao mapear dados.' });
  }
});

// ----------------------------------------------------------------------------
//  ROTA PÚBLICA (titular) + PÁGINA DE PRIVACIDADE
// ----------------------------------------------------------------------------

/** POST /api/lgpd/public-request — titular abre requisição pela página pública. */
lgpdRouter.post('/api/lgpd/public-request', (req, res) => {
  try {
    const { subject_name, subject_doc, subject_email, subject_phone, request_type, description } = (req.body || {});
    if (!subject_name || !request_type || !subject_email) {
      return res.status(400).json({ error: 'Nome, e-mail e tipo de solicitação são obrigatórios.' });
    }
    if (!REQUEST_TYPES[request_type]) return res.status(400).json({ error: 'Tipo de solicitação inválido.' });
    const r = createRequest({ subject_name: subject_name.trim(), subject_doc, subject_email, subject_phone, request_type, description, source: 'publico', ip: getIp(req) });
    createNotification({
      category: 'lgpd', level: 'warning',
      title: `🔐 Nova solicitação LGPD: ${REQUEST_TYPES[request_type]}`,
      message: `${subject_name} (${subject_email}) — protocolo ${r.protocol}. Prazo legal: 15 dias.`,
      link: '#tab:lgpd', resource_type: 'lgpd_request', resource_id: r.protocol,
      dedupe_key: `lgpd:nova:${r.protocol}`
    });
    return res.status(201).json({ success: true, protocol: r.protocol,
      message: `Solicitação registrada. Guarde seu protocolo: ${r.protocol}. Responderemos em até 15 dias.` });
  } catch (err) {
    console.error('[LGPD] Falha na requisição pública:', err);
    return res.status(500).json({ error: 'Erro ao registrar solicitação.' });
  }
});

/** GET /privacidade — Política de Privacidade + formulário do titular. */
lgpdRouter.get('/privacidade', (req, res) => {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(`<!DOCTYPE html><html lang="pt-BR"><head>
  <meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Política de Privacidade & LGPD • Jorge Alvim Advocacia</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@600;700&family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap" rel="stylesheet" />
  <style>body{font-family:'Plus Jakarta Sans',system-ui,sans-serif;background:#FDFBF7;color:#0F172A}.font-serif{font-family:'Playfair Display',Georgia,serif}</style>
  </head><body class="min-h-screen">
  <header class="bg-white border-b border-slate-200 py-4 px-4 sm:px-8"><a href="/" class="font-serif font-bold text-navy-900 text-lg">Jorge Alvim Advocacia</a></header>
  <main class="max-w-3xl mx-auto px-4 py-10">
    <h1 class="font-serif text-3xl font-bold text-navy-900 mb-2">Política de Privacidade</h1>
    <p class="text-sm text-slate-500 mb-8">Tratamento de dados pessoais conforme a Lei 13.709/2018 (LGPD)</p>
    <div class="prose prose-sm max-w-none text-slate-700 space-y-4">
      <p><strong>1. Controlador.</strong> Jorge Alvim Advocacia, com escritório na Rua Henrique Dias, nº 259, Loja 5, Benfica, Juiz de Fora - MG, é o controlador dos dados pessoais coletados.</p>
      <p><strong>2. Dados coletados.</strong> Nome, CPF/CNPJ, RG, endereço, e-mail, telefone, dados processuais e documentos fornecidos para a prestação de serviços jurídicos, além de dados de navegação do site.</p>
      <p><strong>3. Finalidade.</strong> Os dados são tratados para prestação de serviços advocatícios, cumprimento de obrigações legais e regulatórias (inclusive do Estatuto da OAB), comunicação com o cliente e defesa de direitos em processos.</p>
      <p><strong>4. Compartilhamento.</strong> Os dados podem ser compartilhados com o Poder Judiciário, órgãos públicos e partes processuais estritamente no interesse do cliente, e com operadores (contabilidade, TI) sob dever de confidencialidade.</p>
      <p><strong>5. Segurança.</strong> Adotamos controle de acesso, trilha de auditoria e sigilo profissional para proteger seus dados.</p>
      <p><strong>6. Seus direitos.</strong> Você pode solicitar acesso, correção, exclusão, portabilidade, revogação de consentimento e oposição ao tratamento, pelo formulário abaixo ou pelo e-mail <strong>jorgealvimadvocacia@gmail.com</strong>. Responderemos em até 15 dias.</p>
      <p><strong>7. Retenção.</strong> Documentos e dados de processos são mantidos pelo prazo legal e ético aplicável, inclusive após o encerramento do caso, para defesa do cliente e do escritório.</p>
    </div>

    <div class="mt-10 rounded-2xl border border-slate-200 bg-white shadow-sm p-6">
      <h2 class="font-serif text-xl font-bold text-navy-900 mb-4">Solicitação do Titular (LGPD)</h2>
      <div id="form">
        <div class="grid sm:grid-cols-2 gap-3">
          <input id="name" placeholder="Nome completo *" class="border border-slate-300 rounded-lg px-3 py-2 text-sm" />
          <input id="doc" placeholder="CPF/CNPJ" class="border border-slate-300 rounded-lg px-3 py-2 text-sm" />
          <input id="email" type="email" placeholder="E-mail *" class="border border-slate-300 rounded-lg px-3 py-2 text-sm" />
          <input id="phone" placeholder="Telefone" class="border border-slate-300 rounded-lg px-3 py-2 text-sm" />
        </div>
        <select id="type" class="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm mt-3">
          <option value="">Tipo de solicitação *</option>
          ${Object.entries(REQUEST_TYPES).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}
        </select>
        <textarea id="desc" rows="3" placeholder="Descreva sua solicitação" class="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm mt-3"></textarea>
        <button onclick="send()" id="btn" class="w-full mt-4 py-3 rounded-xl bg-navy-900 bg-slate-900 hover:bg-slate-800 text-white font-bold">Enviar solicitação</button>
        <p id="msg" class="text-sm mt-2"></p>
      </div>
    </div>
  </main>
  <script>
    async function send(){
      const msg=document.getElementById('msg'); msg.textContent=''; msg.className='text-sm mt-2';
      const body={subject_name:name.value.trim(),subject_doc:doc.value.trim(),subject_email:email.value.trim(),subject_phone:phone.value.trim(),request_type:type.value,description:desc.value.trim()};
      if(!body.subject_name||!body.subject_email||!body.request_type){msg.textContent='Preencha nome, e-mail e tipo.';msg.className='text-sm mt-2 text-red-600';return;}
      const btn=document.getElementById('btn'); btn.disabled=true; btn.textContent='Enviando…';
      try{
        const r=await fetch('/api/lgpd/public-request',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
        const d=await r.json();
        if(!r.ok){btn.disabled=false;btn.textContent='Enviar solicitação';msg.textContent=d.error||'Falha.';msg.className='text-sm mt-2 text-red-600';return;}
        document.getElementById('form').innerHTML='<div class="rounded-xl border border-emerald-300 bg-emerald-50 p-6 text-emerald-800 font-semibold">✅ '+d.message+'</div>';
      }catch(e){btn.disabled=false;btn.textContent='Enviar solicitação';msg.textContent='Erro de conexão.';msg.className='text-sm mt-2 text-red-600';}
    }
    const name=document.getElementById('name'),doc=document.getElementById('doc'),email=document.getElementById('email'),phone=document.getElementById('phone'),type=document.getElementById('type'),desc=document.getElementById('desc');
  </script>
  </body></html>`);
});
