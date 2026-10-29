/**
 * MÓDULO LOJA JURÍDICA — Front-end de PRÉVIA (nativo, Express 5 / ESM)
 * Jorge Alvim Advocacia — OAB/MG 222.943
 *
 * Vitrine + produto + checkout + confirmação/download + painel do autor +
 * moderação + financeiro, renderizados no PRÓPRIO site (mesma stack e visual).
 *
 * MODO PRÉVIA: dados de exemplo, login de demonstração e PAGAMENTO SIMULADO
 * (nada é cobrado, Mercado Pago não é chamado). Serve para o Dr. Jorge aprovar
 * layout e rotinas antes de ligar os pagamentos. Estas mesmas páginas viram a
 * loja de verdade depois — o backend de split entra por trás.
 *
 * GATE: só responde quando previewOn() é verdadeiro (dev, ou MARKETPLACE_PREVIEW=true).
 * Em produção com a flag desligada, todas as rotas devolvem 404 — o público não alcança.
 * São rotas de PÁGINA (não /api), então o rbacGuard não as filtra; o gate é a flag.
 */
import express from 'express';

export const lojaPreviewRouter = express.Router();

function previewOn() {
  return process.env.MARKETPLACE_PREVIEW === 'true' || process.env.NODE_ENV !== 'production';
}

// Comissão padrão da plataforma (igual ao marketplace real)
const PLATFORM_FEE_PERCENT = Number(process.env.PLATFORM_FEE_PERCENT || 15);

// ---------------------------------------------------------------------------
//  Dados de exemplo (monografias / artigos jurídicos)
// ---------------------------------------------------------------------------
const SAMPLE_PRODUCTS = [
  { id: 1, slug: 'prescricao-intercorrente-execucao-fiscal', title: 'A Prescrição Intercorrente na Execução Fiscal', author: 'Dra. Marina Costa', area: 'Direito Tributário', price_cents: 4990, pages: 48, emoji: '⚖️', cor: 'linear-gradient(135deg,#0A192F,#1e3a5f)',
    abstract: 'Análise do art. 40 da LEF à luz do Tema 390 do STJ: início do prazo, suspensão, intimação da Fazenda e os marcos que levam ao reconhecimento de ofício da prescrição intercorrente.' },
  { id: 2, slug: 'rescisao-indireta-contrato-trabalho', title: 'Rescisão Indireta do Contrato de Trabalho', author: 'Dr. Paulo Mendes', area: 'Direito do Trabalho', price_cents: 3990, pages: 32, emoji: '👷', cor: 'linear-gradient(135deg,#7c2d12,#b45309)',
    abstract: 'A "justa causa do empregador" (art. 483 da CLT): hipóteses, ônus da prova, verbas devidas e estratégia processual para o trabalhador sair com todos os direitos.' },
  { id: 3, slug: 'bpc-loas-requisitos-jurisprudencia', title: 'BPC/LOAS: Requisitos e Jurisprudência Atual', author: 'Dra. Ana Beatriz Lima', area: 'Direito Previdenciário', price_cents: 5900, pages: 56, emoji: '🧓', cor: 'linear-gradient(135deg,#065f46,#059669)',
    abstract: 'Benefício de Prestação Continuada em 2026: critério de miserabilidade, deficiência, recadastro, biometria e os entendimentos recentes da TNU e do STF.' },
  { id: 4, slug: 'responsabilidade-civil-golpes-pix', title: 'Responsabilidade Civil nos Golpes via PIX', author: 'Dr. Rafael Nogueira', area: 'Direito Civil & Bancário', price_cents: 4490, pages: 40, emoji: '💳', cor: 'linear-gradient(135deg,#1e1b4b,#4338ca)',
    abstract: 'O dever de segurança das instituições financeiras (Súmula 479 do STJ), o MED do Banco Central e quando o banco deve devolver valores em fraudes por engenharia social.' },
  { id: 5, slug: 'guarda-compartilhada-alienacao-parental', title: 'Guarda Compartilhada e Alienação Parental', author: 'Dra. Juliana Reis', area: 'Direito de Família', price_cents: 5490, pages: 64, emoji: '👨‍👩‍👧', cor: 'linear-gradient(135deg,#831843,#be185d)',
    abstract: 'Regra legal da guarda compartilhada, identificação da alienação parental (Lei 12.318/2010), perícia psicossocial e medidas protetivas do convívio.' },
];

const productById = (id) => SAMPLE_PRODUCTS.find((p) => String(p.id) === String(id));

// Painel do autor (sample) — produtos do "autor logado" + status
const SAMPLE_AUTHOR_PRODUCTS = [
  { title: 'A Prescrição Intercorrente na Execução Fiscal', area: 'Direito Tributário', price_cents: 4990, status: 'approved', vendas: 23 },
  { title: 'Embargos à Execução: Teses de Defesa', area: 'Processo Civil', price_cents: 4290, status: 'pending', vendas: 0 },
  { title: 'Planejamento Tributário Lícito para PMEs', area: 'Direito Tributário', price_cents: 6900, status: 'rejected', vendas: 0 },
];

// Moderação (sample) — produtos aguardando o Dr. Jorge
const SAMPLE_PENDING = [
  { id: 101, title: 'Embargos à Execução: Teses de Defesa', author: 'Dra. Marina Costa', area: 'Processo Civil', price_cents: 4290, pages: 38 },
  { id: 102, title: 'Usucapião Extrajudicial Passo a Passo', author: 'Dr. Carlos Teixeira', area: 'Direito Imobiliário', price_cents: 5290, pages: 44 },
  { id: 103, title: 'Defesa em Processo Administrativo de Trânsito', author: 'Dra. Juliana Reis', area: 'Direito Administrativo', price_cents: 3490, pages: 26 },
];

// ---------------------------------------------------------------------------
//  Helpers de apresentação
// ---------------------------------------------------------------------------
function brl(cents) {
  return (Number(cents || 0) / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}
function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

const NAV = [
  { href: '/loja/preview', label: 'Vitrine' },
  { href: '/loja/preview/autor', label: 'Painel do Autor' },
  { href: '/loja/preview/admin/moderacao', label: 'Moderação' },
  { href: '/loja/preview/admin/financeiro', label: 'Financeiro' },
];

function layout(title, body, active) {
  const nav = NAV.map((n) => `<a href="${n.href}" class="nav-link${n.href === active ? ' active' : ''}">${n.label}</a>`).join('');
  return `<!doctype html>
<html lang="pt-br">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)} · Loja Jurídica — Jorge Alvim Advocacia</title>
<style>
  :root{ --navy:#0A192F; --navy2:#152a47; --emerald:#059669; --emerald-d:#047857; --gold:#C9A227; --ink:#0f172a; --muted:#64748b; --line:#e2e8f0; --bg:#f6f8fb; }
  *{box-sizing:border-box}
  body{margin:0;font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;background:var(--bg);color:var(--ink);padding-top:34px}
  h1,h2,h3,.serif{font-family:Georgia,'Times New Roman',serif}
  a{color:inherit}
  .preview-banner{position:fixed;top:0;left:0;right:0;height:34px;z-index:50;background:#fffbeb;color:#92400e;border-bottom:1px solid #fde68a;display:flex;align-items:center;justify-content:center;gap:8px;font-size:.78rem;font-weight:700}
  header.site{background:var(--navy);color:#e2e8f0}
  .bar{max-width:1120px;margin:0 auto;padding:14px 20px;display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap}
  .brand{display:flex;align-items:center;gap:10px;font-weight:800;font-size:1.05rem;letter-spacing:.2px}
  .brand .dot{width:30px;height:30px;border-radius:9px;background:linear-gradient(135deg,var(--gold),#e9c75a);display:flex;align-items:center;justify-content:center;color:var(--navy);font-size:1rem}
  nav.nav{display:flex;gap:4px;flex-wrap:wrap}
  .nav-link{padding:6px 12px;border-radius:999px;font-size:.82rem;font-weight:700;color:#cbd5e1;text-decoration:none}
  .nav-link:hover{background:#ffffff14;color:#fff}
  .nav-link.active{background:var(--emerald);color:#fff}
  main{max-width:1120px;margin:0 auto;padding:26px 20px 60px}
  .hero{background:linear-gradient(135deg,var(--navy),var(--navy2));color:#e2e8f0;border-radius:20px;padding:34px 30px;margin-bottom:26px;position:relative;overflow:hidden}
  .hero h1{margin:0 0 8px;font-size:1.7rem;color:#fff}
  .hero p{margin:0;color:#aebfd4;max-width:640px;line-height:1.6;font-size:.95rem}
  .hero .tag{display:inline-block;font-size:.72rem;font-weight:800;letter-spacing:.14em;text-transform:uppercase;color:var(--gold);margin-bottom:10px}
  .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:18px}
  .card{background:#fff;border:1px solid var(--line);border-radius:16px;overflow:hidden;display:flex;flex-direction:column;transition:transform .12s,box-shadow .12s}
  .card:hover{transform:translateY(-3px);box-shadow:0 12px 30px #0a192f18}
  .cover{height:140px;display:flex;align-items:center;justify-content:center;font-size:2.6rem;position:relative}
  .cover .area{position:absolute;top:10px;left:10px;font-size:.64rem;font-weight:800;text-transform:uppercase;letter-spacing:.08em;background:#ffffffe6;color:var(--navy);padding:3px 8px;border-radius:999px}
  .card .body{padding:14px 15px;display:flex;flex-direction:column;gap:8px;flex:1}
  .card h3{margin:0;font-size:1rem;line-height:1.3;color:var(--navy)}
  .card .author{font-size:.78rem;color:var(--muted)}
  .card .foot{margin-top:auto;display:flex;align-items:center;justify-content:space-between;gap:8px}
  .price{font-weight:800;color:var(--emerald-d);font-size:1.05rem}
  .btn{display:inline-flex;align-items:center;gap:6px;border:none;cursor:pointer;text-decoration:none;font-weight:800;font-size:.84rem;padding:9px 16px;border-radius:999px;transition:filter .12s}
  .btn:hover{filter:brightness(1.07)}
  .btn-primary{background:var(--emerald);color:#fff}
  .btn-ghost{background:#eef2f7;color:var(--navy)}
  .btn-gold{background:var(--gold);color:var(--navy)}
  .btn-danger{background:#fee2e2;color:#991b1b}
  .btn-ok{background:#dcfce7;color:#166534}
  .panel{background:#fff;border:1px solid var(--line);border-radius:16px;padding:22px 24px}
  .pbadge{font-size:.68rem;font-weight:800;text-transform:uppercase;letter-spacing:.06em;padding:3px 9px;border-radius:999px}
  .st-approved{background:#dcfce7;color:#166534}.st-pending{background:#fef9c3;color:#854d0e}.st-rejected{background:#fee2e2;color:#991b1b}
  table{width:100%;border-collapse:collapse;font-size:.88rem}
  th,td{text-align:left;padding:10px 12px;border-bottom:1px solid var(--line)}
  th{font-size:.72rem;text-transform:uppercase;letter-spacing:.06em;color:var(--muted)}
  label{display:block;font-size:.8rem;font-weight:700;color:var(--navy);margin:0 0 5px}
  input,select,textarea{width:100%;padding:10px 12px;border:1px solid var(--line);border-radius:10px;font-size:.9rem;font-family:inherit;margin-bottom:14px;background:#fff}
  .two{display:grid;grid-template-columns:1fr 1fr;gap:0 16px}
  .kpi{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:14px;margin-bottom:20px}
  .kpi .box{background:#fff;border:1px solid var(--line);border-radius:14px;padding:16px 18px}
  .kpi .box .n{font-size:1.5rem;font-weight:800;color:var(--navy);font-family:Georgia,serif}
  .kpi .box .l{font-size:.74rem;color:var(--muted);text-transform:uppercase;letter-spacing:.05em;font-weight:700}
  .muted{color:var(--muted)}
  footer.site{border-top:1px solid var(--line);color:var(--muted);font-size:.8rem;text-align:center;padding:26px 20px}
  .note{background:#f0f9ff;border:1px solid #bae6fd;color:#075985;border-radius:12px;padding:12px 15px;font-size:.84rem;line-height:1.5}
  .flash{background:#dcfce7;border:1px solid #86efac;color:#166534;border-radius:12px;padding:12px 15px;font-weight:700;margin-bottom:18px}
  @media(max-width:560px){.two{grid-template-columns:1fr}}
</style>
</head>
<body>
  <div class="preview-banner">🧪 PRÉVIA — dados de exemplo · pagamento simulado · nada é cobrado</div>
  <header class="site">
    <div class="bar">
      <a href="/loja/preview" style="text-decoration:none;color:#fff"><div class="brand"><span class="dot">⚖️</span><span>Jorge Alvim Advocacia · <span style="color:var(--gold)">Loja Jurídica</span></span></div></a>
      <nav class="nav">${nav}</nav>
    </div>
  </header>
  <main>${body}</main>
  <footer class="site">
    Loja Jurídica — Jorge Alvim Advocacia · OAB/MG 222.943 · Monografias e artigos em PDF com split de pagamento.<br>
    <span class="muted">Prévia interna para aprovação. Nenhuma venda é real nesta tela.</span>
  </footer>
</body>
</html>`;
}

function productCard(p) {
  return `<div class="card">
    <div class="cover" style="background:${p.cor}"><span class="area">${esc(p.area)}</span><span>${p.emoji}</span></div>
    <div class="body">
      <h3>${esc(p.title)}</h3>
      <div class="author">por ${esc(p.author)} · ${p.pages} págs.</div>
      <div class="foot">
        <span class="price">${brl(p.price_cents)}</span>
        <a class="btn btn-primary" href="/loja/preview/produto/${p.id}">Ver →</a>
      </div>
    </div>
  </div>`;
}

// ===========================================================================
//  ROTAS (todas atrás do gate previewOn)
// ===========================================================================
lojaPreviewRouter.use('/loja/preview', (req, res, next) => {
  if (!previewOn()) return res.status(404).send('Prévia da loja indisponível.');
  next();
});

// VITRINE ------------------------------------------------------------------
lojaPreviewRouter.get('/loja/preview', (req, res) => {
  const body = `
    <section class="hero">
      <span class="tag">Conhecimento jurídico aplicado</span>
      <h1>Monografias e artigos jurídicos em PDF</h1>
      <p>Materiais revisados, de autores convidados, com download protegido e marca d'água individual. Compre, baixe e use com segurança.</p>
    </section>
    <div class="grid">${SAMPLE_PRODUCTS.map(productCard).join('')}</div>`;
  res.send(layout('Vitrine', body, '/loja/preview'));
});

// PRODUTO ------------------------------------------------------------------
lojaPreviewRouter.get('/loja/preview/produto/:id', (req, res) => {
  const p = productById(req.params.id);
  if (!p) return res.status(404).send(layout('Não encontrado', '<div class="panel">Produto não encontrado. <a href="/loja/preview">Voltar à vitrine</a></div>'));
  const body = `
    <a href="/loja/preview" class="btn btn-ghost" style="margin-bottom:18px">← Voltar à vitrine</a>
    <div class="panel" style="display:grid;grid-template-columns:280px 1fr;gap:28px;align-items:start">
      <div class="cover" style="background:${p.cor};height:300px;border-radius:14px;font-size:4rem"><span class="area">${esc(p.area)}</span><span>${p.emoji}</span></div>
      <div>
        <h1 style="margin:0 0 6px;color:var(--navy);font-size:1.6rem">${esc(p.title)}</h1>
        <div class="muted" style="margin-bottom:16px">por <strong>${esc(p.author)}</strong> · ${p.pages} páginas · ${esc(p.area)}</div>
        <p style="line-height:1.7;color:#334155">${esc(p.abstract)}</p>
        <div style="display:flex;align-items:center;gap:18px;margin-top:22px;flex-wrap:wrap">
          <span class="price" style="font-size:1.7rem">${brl(p.price_cents)}</span>
          <a class="btn btn-primary" style="padding:13px 26px;font-size:.95rem" href="/loja/preview/checkout/${p.id}">🛒 Comprar agora</a>
        </div>
        <div class="note" style="margin-top:20px">🔒 Pagamento via Pix ou cartão (tokenizado no navegador). O PDF é entregue com <strong>marca d'água individual</strong> (seu e-mail + CPF mascarado) para rastrear vazamentos — conforme a LGPD.</div>
      </div>
    </div>`;
  res.send(layout(p.title, body));
});

// CHECKOUT (form) ----------------------------------------------------------
lojaPreviewRouter.get('/loja/preview/checkout/:id', (req, res) => {
  const p = productById(req.params.id);
  if (!p) return res.status(404).send(layout('Não encontrado', '<div class="panel">Produto não encontrado.</div>'));
  const body = `
    <a href="/loja/preview/produto/${p.id}" class="btn btn-ghost" style="margin-bottom:18px">← Voltar ao produto</a>
    <div style="display:grid;grid-template-columns:1fr 320px;gap:24px;align-items:start">
      <div class="panel">
        <h2 style="margin:0 0 16px;color:var(--navy)">Finalizar compra</h2>
        <form method="post" action="/loja/preview/checkout/${p.id}">
          <div class="two">
            <div><label>Nome completo</label><input name="nome" required placeholder="Seu nome" value="Cliente de Exemplo"></div>
            <div><label>CPF</label><input name="cpf" required placeholder="000.000.000-00" value="123.456.789-09"></div>
          </div>
          <label>E-mail</label><input type="email" name="email" required placeholder="voce@email.com" value="cliente@exemplo.com.br">
          <label>Forma de pagamento</label>
          <select name="metodo"><option value="pix">Pix</option><option value="cartao">Cartão de crédito</option></select>
          <button class="btn btn-primary" style="width:100%;justify-content:center;padding:13px;margin-top:6px" type="submit">Pagar ${brl(p.price_cents)} (simulado)</button>
          <p class="muted" style="font-size:.76rem;text-align:center;margin:12px 0 0">Prévia: nenhum valor é cobrado. No modo real, o pagamento cai direto na conta do autor e a plataforma retém ${PLATFORM_FEE_PERCENT}%.</p>
        </form>
      </div>
      <div class="panel">
        <h3 style="margin:0 0 12px;color:var(--navy);font-size:1rem">Resumo do pedido</h3>
        <div style="display:flex;gap:12px;align-items:center;margin-bottom:12px">
          <div class="cover" style="background:${p.cor};width:54px;height:54px;border-radius:10px;font-size:1.4rem">${p.emoji}</div>
          <div><div style="font-weight:700;font-size:.9rem;color:var(--navy)">${esc(p.title)}</div><div class="muted" style="font-size:.78rem">${esc(p.author)}</div></div>
        </div>
        <div style="display:flex;justify-content:space-between;border-top:1px solid var(--line);padding-top:12px;font-weight:800;color:var(--navy)"><span>Total</span><span class="price">${brl(p.price_cents)}</span></div>
      </div>
    </div>`;
  res.send(layout('Checkout', body));
});

// CHECKOUT (pagamento simulado) -------------------------------------------
lojaPreviewRouter.post('/loja/preview/checkout/:id', (req, res) => {
  const p = productById(req.params.id);
  if (!p) return res.status(404).send(layout('Não encontrado', '<div class="panel">Produto não encontrado.</div>'));
  const email = (req.body && req.body.email) || 'cliente@exemplo.com.br';
  const pedido = 'JA-' + Date.now().toString().slice(-8);
  const body = `
    <div class="panel" style="text-align:center;max-width:620px;margin:10px auto">
      <div style="font-size:3rem">✅</div>
      <h1 style="color:var(--emerald-d);margin:8px 0 4px">Pagamento aprovado <span style="font-size:1rem;color:var(--muted)">(simulado)</span></h1>
      <p class="muted">Pedido <strong>#${pedido}</strong> · confirmação enviada para ${esc(email)}</p>
      <div style="background:#f8fafc;border:1px solid var(--line);border-radius:12px;padding:16px;margin:18px 0;text-align:left;display:flex;gap:12px;align-items:center">
        <div class="cover" style="background:${p.cor};width:52px;height:52px;border-radius:10px;font-size:1.3rem">${p.emoji}</div>
        <div><div style="font-weight:700;color:var(--navy)">${esc(p.title)}</div><div class="muted" style="font-size:.8rem">${esc(p.author)} · ${brl(p.price_cents)}</div></div>
      </div>
      <a class="btn btn-primary" style="padding:13px 26px" href="/loja/preview/download/${p.id}">⬇️ Baixar meu PDF</a>
      <p style="margin-top:16px"><a href="/loja/preview" class="muted">Voltar à vitrine</a></p>
    </div>`;
  res.send(layout('Pagamento aprovado', body));
});

// DOWNLOAD (simulado) ------------------------------------------------------
lojaPreviewRouter.get('/loja/preview/download/:id', (req, res) => {
  const p = productById(req.params.id);
  if (!p) return res.status(404).send(layout('Não encontrado', '<div class="panel">Produto não encontrado.</div>'));
  const body = `
    <div class="panel" style="max-width:640px;margin:10px auto;text-align:center">
      <div style="font-size:2.6rem">📄🔐</div>
      <h1 style="color:var(--navy);margin:8px 0">Download protegido</h1>
      <p class="muted">Na loja real, agora começaria o download de:</p>
      <p style="font-weight:700;color:var(--navy);font-size:1.05rem">${esc(p.title)}.pdf</p>
      <div class="note" style="text-align:left;margin-top:18px">
        🖋️ O PDF é entregue <strong>carimbado</strong> no rodapé com <strong>seu e-mail</strong> e o <strong>CPF mascarado</strong> (ex.: <code>123.***.***-09</code>), individualizando a cópia para rastrear vazamentos — sem expor o CPF inteiro (LGPD). O link expira em 48h e tem limite de usos.
      </div>
      <p class="muted" style="margin-top:16px;font-size:.8rem">(Prévia: nenhum arquivo é gerado nesta tela.)</p>
      <p style="margin-top:8px"><a href="/loja/preview" class="muted">Voltar à vitrine</a></p>
    </div>`;
  res.send(layout('Download', body));
});

// PAINEL DO AUTOR ----------------------------------------------------------
lojaPreviewRouter.get('/loja/preview/autor', (req, res) => {
  const vendas = SAMPLE_AUTHOR_PRODUCTS.reduce((s, p) => s + p.vendas, 0);
  const bruto = SAMPLE_AUTHOR_PRODUCTS.reduce((s, p) => s + p.vendas * p.price_cents, 0);
  const liquido = Math.round(bruto * (1 - PLATFORM_FEE_PERCENT / 100));
  const flash = req.query.enviado ? '<div class="flash">✅ PDF enviado! Entrou na fila de moderação (status: pendente).</div>' : '';
  const rows = SAMPLE_AUTHOR_PRODUCTS.map((p) => `<tr>
      <td><strong>${esc(p.title)}</strong><div class="muted" style="font-size:.78rem">${esc(p.area)}</div></td>
      <td>${brl(p.price_cents)}</td>
      <td><span class="pbadge st-${p.status}">${p.status === 'approved' ? 'Aprovado' : p.status === 'pending' ? 'Pendente' : 'Rejeitado'}</span></td>
      <td>${p.vendas}</td>
    </tr>`).join('');
  const body = `${flash}
    <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px;margin-bottom:18px">
      <div><h1 style="margin:0;color:var(--navy)">Painel do Autor</h1><div class="muted">Bem-vindo, Dra. Marina Costa</div></div>
      <a class="btn btn-gold" href="/loja/preview/autor/novo">＋ Enviar novo PDF</a>
    </div>
    <div class="kpi">
      <div class="box"><div class="n">${vendas}</div><div class="l">Vendas</div></div>
      <div class="box"><div class="n">${brl(bruto)}</div><div class="l">Faturamento bruto</div></div>
      <div class="box"><div class="n">${brl(liquido)}</div><div class="l">Líquido (após ${PLATFORM_FEE_PERCENT}%)</div></div>
      <div class="box"><div class="n">✅</div><div class="l">Conta Mercado Pago conectada</div></div>
    </div>
    <div class="panel"><h3 style="margin:0 0 10px;color:var(--navy)">Meus produtos</h3>
      <table><thead><tr><th>Título</th><th>Preço</th><th>Status</th><th>Vendas</th></tr></thead><tbody>${rows}</tbody></table>
    </div>`;
  res.send(layout('Painel do Autor', body, '/loja/preview/autor'));
});

// UPLOAD (form) ------------------------------------------------------------
lojaPreviewRouter.get('/loja/preview/autor/novo', (req, res) => {
  const areas = ['Direito Tributário', 'Direito do Trabalho', 'Direito Previdenciário', 'Direito Civil & Bancário', 'Direito de Família', 'Processo Civil', 'Direito Administrativo', 'Direito Imobiliário'];
  const body = `
    <a href="/loja/preview/autor" class="btn btn-ghost" style="margin-bottom:18px">← Voltar ao painel</a>
    <div class="panel" style="max-width:720px">
      <h2 style="margin:0 0 4px;color:var(--navy)">Enviar novo material</h2>
      <p class="muted" style="margin:0 0 18px">O arquivo vai para uma pasta privada e entra na fila de moderação do Dr. Jorge.</p>
      <form method="get" action="/loja/preview/autor">
        <input type="hidden" name="enviado" value="1">
        <label>Título</label><input name="titulo" required placeholder="Ex.: Embargos à Execução: Teses de Defesa">
        <div class="two">
          <div><label>Área do Direito</label><select name="area">${areas.map((a) => `<option>${a}</option>`).join('')}</select></div>
          <div><label>Preço (R$)</label><input name="preco" placeholder="49,90" value="49,90"></div>
        </div>
        <label>Resumo</label><textarea name="resumo" rows="4" placeholder="Breve descrição do conteúdo..."></textarea>
        <label>Arquivo PDF</label><input type="file" accept="application/pdf">
        <button class="btn btn-primary" style="margin-top:6px" type="submit">Enviar para moderação</button>
      </form>
    </div>`;
  res.send(layout('Enviar PDF', body, '/loja/preview/autor'));
});

// MODERAÇÃO (admin) --------------------------------------------------------
lojaPreviewRouter.get('/loja/preview/admin/moderacao', (req, res) => {
  let flash = '';
  if (req.query.aprovado) flash = `<div class="flash">✅ Produto "${esc(req.query.aprovado)}" aprovado — já aparece na vitrine (simulado).</div>`;
  if (req.query.rejeitado) flash = `<div class="flash" style="background:#fee2e2;border-color:#fca5a5;color:#991b1b">🚫 Produto "${esc(req.query.rejeitado)}" rejeitado (simulado).</div>`;
  const rows = SAMPLE_PENDING.map((p) => `<tr>
      <td><strong>${esc(p.title)}</strong><div class="muted" style="font-size:.78rem">${esc(p.area)} · ${p.pages} págs.</div></td>
      <td>${esc(p.author)}</td>
      <td>${brl(p.price_cents)}</td>
      <td style="white-space:nowrap">
        <a class="btn btn-ok" style="padding:6px 12px" href="/loja/preview/admin/moderacao?aprovado=${encodeURIComponent(p.title)}">Aprovar</a>
        <a class="btn btn-danger" style="padding:6px 12px" href="/loja/preview/admin/moderacao?rejeitado=${encodeURIComponent(p.title)}">Rejeitar</a>
      </td>
    </tr>`).join('');
  const body = `${flash}
    <h1 style="margin:0 0 4px;color:var(--navy)">Moderação de produtos</h1>
    <p class="muted" style="margin:0 0 18px">${SAMPLE_PENDING.length} materiais aguardando sua aprovação antes de irem à vitrine.</p>
    <div class="panel"><table><thead><tr><th>Produto</th><th>Autor</th><th>Preço</th><th>Ação</th></tr></thead><tbody>${rows}</tbody></table></div>`;
  res.send(layout('Moderação', body, '/loja/preview/admin/moderacao'));
});

// FINANCEIRO (admin) -------------------------------------------------------
lojaPreviewRouter.get('/loja/preview/admin/financeiro', (req, res) => {
  const linhas = [
    { autor: 'Dra. Marina Costa', vendas: 23, bruto: 114770 },
    { autor: 'Dr. Paulo Mendes', vendas: 11, bruto: 43890 },
    { autor: 'Dra. Ana Beatriz Lima', vendas: 8, bruto: 47200 },
    { autor: 'Dr. Rafael Nogueira', vendas: 15, bruto: 67350 },
  ];
  const bruto = linhas.reduce((s, l) => s + l.bruto, 0);
  const comissao = Math.round(bruto * (PLATFORM_FEE_PERCENT / 100));
  const vendas = linhas.reduce((s, l) => s + l.vendas, 0);
  const rows = linhas.map((l) => {
    const c = Math.round(l.bruto * (PLATFORM_FEE_PERCENT / 100));
    return `<tr><td><strong>${esc(l.autor)}</strong></td><td>${l.vendas}</td><td>${brl(l.bruto)}</td><td>${brl(c)}</td><td>${brl(l.bruto - c)}</td></tr>`;
  }).join('');
  const body = `
    <h1 style="margin:0 0 4px;color:var(--navy)">Financeiro da plataforma</h1>
    <p class="muted" style="margin:0 0 18px">Visão consolidada de vendas e comissão (${PLATFORM_FEE_PERCENT}%).</p>
    <div class="kpi">
      <div class="box"><div class="n">${vendas}</div><div class="l">Vendas totais</div></div>
      <div class="box"><div class="n">${brl(bruto)}</div><div class="l">Faturamento bruto</div></div>
      <div class="box"><div class="n" style="color:var(--emerald-d)">${brl(comissao)}</div><div class="l">Comissão da plataforma</div></div>
      <div class="box"><div class="n">${brl(bruto - comissao)}</div><div class="l">Repasse aos autores</div></div>
    </div>
    <div class="panel"><h3 style="margin:0 0 10px;color:var(--navy)">Por autor</h3>
      <table><thead><tr><th>Autor</th><th>Vendas</th><th>Bruto</th><th>Comissão (${PLATFORM_FEE_PERCENT}%)</th><th>Repasse</th></tr></thead><tbody>${rows}</tbody></table>
    </div>`;
  res.send(layout('Financeiro', body, '/loja/preview/admin/financeiro'));
});

// ---------------------------------------------------------------------------
//  BLINDAGEM: tratador de erros do router. No Express 5, QUALQUER erro (síncrono
//  ou promessa rejeitada) lançado por uma rota acima é encaminhado para cá —
//  então um erro numa página NUNCA derruba o processo do servidor. Responde
//  uma página 500 amigável e segue vivo.
// ---------------------------------------------------------------------------
lojaPreviewRouter.use('/loja/preview', (err, req, res, next) => {
  console.error('[LOJA][preview] erro tratado na rota', req.originalUrl, '→', err && err.message);
  if (res.headersSent) return next(err);
  try {
    res.status(500).send(layout('Erro', '<div class="panel" style="text-align:center"><h1 style="color:#991b1b">Ops, algo deu errado</h1><p class="muted">Não foi possível carregar esta página da prévia.</p><a class="btn btn-primary" href="/loja/preview">← Voltar à vitrine</a></div>'));
  } catch (_) {
    res.status(500).type('text').send('Erro ao carregar a prévia da loja.');
  }
});
