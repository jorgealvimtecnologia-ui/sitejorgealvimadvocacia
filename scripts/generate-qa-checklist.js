#!/usr/bin/env node
/**
 * Gera o CHECKLIST DE TESTE FÍSICO do site (cada página, cada botão, link e formulário)
 * a partir do próprio código, em src/modules/qa/qa-checklist.json.
 *
 * Uso: npm run qa:checklist   (rodar de novo sempre que páginas/botões mudarem)
 *
 * Cada item tem id estável (hash de página+seção+tipo+rótulo+ação): regerar o checklist
 * não perde os testes já registrados no painel.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'src', 'modules', 'qa', 'qa-checklist.json');

// Ordem = prioridade no cronograma (o que o cliente vê primeiro)
const PAGES = [
  { file: 'index.html', url: '/', name: 'Site institucional (página inicial)' },
  { file: 'blog.html', url: '/blog', name: 'Blog (lista e artigo)' },
  { file: 'cliente.html', url: '/cliente', name: 'Portal do Cliente' },
  { file: 'colaborador.html', url: '/colaborador', name: 'Portal do Colaborador' },
  { file: 'assinar.html', url: '/assinar', name: 'Assinatura digital (link enviado ao cliente)' },
  { file: 'anexar.html', url: '/anexar', name: 'Envio de documentos (link enviado ao cliente)' },
  { file: 'amazon-colaborador.html', url: '/amazon', name: 'Vitrine Amazon' },
  { file: 'painel.html', url: '/painel', name: 'Painel administrativo' },
  { file: 'teste-pratico.html', url: '/teste-pratico', name: 'Laboratório de testes' }
];

const PANEL_TABS = {
  dashboard: 'Visão Geral / Cockpit', clients: 'Clientes', lawsuits: 'Processos', calendar: 'Agenda',
  publications: 'Publicações / Intimações', finance: 'Financeiro', nfse: 'NFS-e / Recibos', docs: 'Documentos',
  esign: 'Assinaturas', leads: 'Leads', 'pre-clients': 'Pré-clientes', judicial: 'Radar Judicial',
  drive: 'Drive do Escritório', offices: 'Escritórios', hr: 'RH / Colaboradores', users: 'Usuários e Acessos',
  rockets: 'Foguetes (mensagens internas)', notifications: 'Notificações', lgpd: 'LGPD',
  'admin-requests': 'Solicitações administrativas', blog: 'Blog (gestão)', 'site-boxes': 'Conteúdo do site',
  faq: 'FAQ', 'meta-ads': 'Meta Ads / Redes sociais', audit: 'Auditoria', maintenance: 'Manutenção',
  roadmap: 'Roadmap Vivo'
};
const PANEL_TAB_ORDER = Object.keys(PANEL_TABS);

// Botões criados pelos scripts das abas (template strings) → aba do painel
const SCRIPT_TABS = {
  'public/js/modules/cockpit.js': 'dashboard', 'public/js/tabs/tab-clients.js': 'clients',
  'public/js/tabs/tab-lawsuits.js': 'lawsuits', 'public/js/tabs/tab-calendar.js': 'calendar',
  'public/js/tabs/tab-publications.js': 'publications', 'public/js/tabs/tab-finance.js': 'finance',
  'public/js/modules/legal-docs.js': 'docs', 'public/js/tabs/tab-documents.js': 'docs',
  'public/js/tabs/tab-leads.js': 'leads', 'public/js/tabs/tab-radar.js': 'judicial',
  'public/js/tabs/tab-drive.js': 'drive', 'public/js/tabs/tab-offices.js': 'offices',
  'public/js/tabs/tab-hr.js': 'hr', 'public/js/tabs/tab-users.js': 'users',
  'public/js/modules/rockets.js': 'rockets', 'public/js/tabs/tab-blog.js': 'blog',
  'public/js/tabs/tab-faq.js': 'faq', 'public/js/modules/meta-ads.js': 'meta-ads',
  'public/js/tabs/tab-audit.js': 'audit', 'public/js/modules/maintenance.js': 'maintenance',
  'public/js/tabs/tab-roadmap.js': 'roadmap', 'public/js/tabs/tab-traffic.js': 'dashboard'
};

function clean(s) {
  return String(s || '')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(svg|script|style)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\$\{[^}]*\}/g, '…')
    .replace(/&nbsp;|&#160;/g, ' ')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

function attr(tag, name) {
  const m = tag.match(new RegExp(`\\s${name}\\s*=\\s*(["'])([\\s\\S]*?)\\1`, 'i'));
  return m ? m[2] : '';
}

function actionOf(tag) {
  const onclick = attr(tag, 'onclick');
  if (onclick) {
    const fn = onclick.match(/([A-Za-z_$][\w$.]*)\s*\(/);
    return fn ? fn[1].replace(/^window\./, '') : onclick.slice(0, 40);
  }
  return attr(tag, 'type') === 'submit' ? 'enviar formulário' : '';
}

function howTo(kind, label, target) {
  if (kind === 'Formulário') return `Preencha os campos com dados de teste e envie. Confira: mensagem de sucesso, dados gravados e nenhum erro na tela.`;
  if (kind === 'Link') {
    if (/^https?:\/\/(wa\.me|api\.whatsapp)/i.test(target)) return `Clique em “${label}”. Confira: abre o WhatsApp do escritório com a mensagem pronta.`;
    if (/^https?:/i.test(target)) return `Clique em “${label}”. Confira: abre ${target.replace(/^https?:\/\//, '').slice(0, 60)} (em nova aba) sem erro.`;
    if (target.startsWith('#')) return `Clique em “${label}”. Confira: a tela rola/abre a parte correta (${target}).`;
    return `Clique em “${label}”. Confira: abre ${target} sem erro e com o conteúdo certo.`;
  }
  return `Clique em “${label}”. Confira: a ação acontece (abre, salva, filtra ou envia) sem mensagem de erro e a tela responde.`;
}

function itemId(parts) {
  return 'QA-' + crypto.createHash('sha1').update(parts.join('|')).digest('hex').slice(0, 10).toUpperCase();
}

const items = [];
const seen = new Set();
function push(it) {
  const key = [it.page, it.section, it.kind, it.label, it.action].join('|');
  if (seen.has(key)) return;
  seen.add(key);
  items.push({ id: itemId([it.page, it.section, it.kind, it.label, it.action]), ...it });
}

function baseChecks(page, url, section, order) {
  push({ page, url, section, order, kind: 'Página', label: 'Abrir no computador', action: 'abrir',
    how: 'Abra a página/aba. Confira: carrega por completo, sem mensagem de erro e com os dados aparecendo.' });
  push({ page, url, section, order, kind: 'Página', label: 'Abrir no celular', action: 'abrir-celular',
    how: 'Abra no celular. Confira: nada cortado ou sobreposto, textos legíveis e botões fáceis de tocar.' });
}

// ---------- Páginas HTML ----------
for (const [pi, pg] of PAGES.entries()) {
  const file = path.join(ROOT, pg.file);
  if (!fs.existsSync(file)) continue;
  const html = fs.readFileSync(file, 'utf8').replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<!--[\s\S]*?-->/g, ' ');
  const isPanel = pg.file === 'painel.html';
  let section = isPanel ? 'Login e menu do painel' : 'Topo da página';
  let sectionOrder = 0;
  const sectionsSeen = new Set();

  // Lê tag a tag (seções não "engolem" os botões de dentro); para button/a/h1-h3
  // pega o conteúdo até o fechamento correspondente.
  const tagRe = /<(\w+)\b([^>]*)>/g;
  let m;
  while ((m = tagRe.exec(html))) {
    const lower = m[1].toLowerCase();
    const tag = `<${lower}${m[2]}>`;
    const id = attr(tag, 'id');
    let inner = '';
    if (lower === 'button' || lower === 'a' || /^h[1-3]$/.test(lower)) {
      const close = html.indexOf(`</${lower}`, tagRe.lastIndex);
      if (close > -1) {
        inner = html.slice(tagRe.lastIndex, close);
        if (lower !== 'a' || !/<button\b/i.test(inner)) tagRe.lastIndex = close;
      }
    }

    if (lower === 'header' || lower === 'nav') {
      section = isPanel ? 'Cabeçalho e menu do painel' : 'Cabeçalho e menu';
      if (isPanel) sectionOrder = 0;
    } else if (lower === 'footer' && !isPanel) {
      section = 'Rodapé';
    } else if (isPanel && id && id.startsWith('tab-content-')) {
      const key = id.replace('tab-content-', '');
      section = PANEL_TABS[key] || key;
      sectionOrder = 1 + PANEL_TAB_ORDER.indexOf(key);
    } else if (isPanel && id && /modal/i.test(id) && lower === 'div' && /fixed/.test(attr(tag, 'class'))) {
      section = 'Janelas: ' + id.replace(/-/g, ' ');
      sectionOrder = 90;
    } else if (!isPanel && (lower === 'section' && id)) {
      section = id.replace(/[-_]/g, ' ');
    } else if (!isPanel && /^h[1-3]$/.test(lower)) {
      const t = clean(inner);
      if (t && t.length < 90) section = t;
    }

    const sectionKey = `${pg.file}|${section}`;
    if (!sectionsSeen.has(sectionKey) && (lower === 'button' || lower === 'a' || lower === 'form')) {
      sectionsSeen.add(sectionKey);
      if (isPanel && sectionOrder > 0 && sectionOrder < 90) baseChecks(pg.name, pg.url, section, pi * 1000 + sectionOrder);
    }

    const order = pi * 1000 + sectionOrder;
    if (lower === 'button') {
      const label = clean(inner) || attr(tag, 'aria-label') || attr(tag, 'title') || actionOf(tag);
      if (!label) continue;
      push({ page: pg.name, url: pg.url, section, order, kind: 'Botão', label: label.slice(0, 90), action: actionOf(tag), how: howTo('Botão', label.slice(0, 90)) });
    } else if (lower === 'a') {
      const href = attr(tag, 'href');
      if (!href || href === '#' || href.includes('${') || /^(javascript:|mailto:|tel:)/i.test(href)) continue;
      const label = clean(inner) || attr(tag, 'aria-label') || attr(tag, 'title') || href;
      push({ page: pg.name, url: pg.url, section, order, kind: 'Link', label: label.slice(0, 90), action: href.slice(0, 120), how: howTo('Link', label.slice(0, 90), href) });
    } else if (lower === 'form') {
      const label = id ? id.replace(/[-_]/g, ' ') : 'formulário';
      push({ page: pg.name, url: pg.url, section, order, kind: 'Formulário', label, action: 'enviar', how: howTo('Formulário', label) });
    }
  }
  if (!isPanel) baseChecks(pg.name, pg.url, 'Página inteira', pi * 1000 - 1);
}

// ---------- Botões criados pelos scripts das abas do painel ----------
const panelIdx = PAGES.findIndex(p => p.file === 'painel.html');
for (const [rel, tabKey] of Object.entries(SCRIPT_TABS)) {
  const file = path.join(ROOT, rel);
  if (!fs.existsSync(file)) continue;
  const src = fs.readFileSync(file, 'utf8');
  const re = /<button\b([^>]*)>([\s\S]*?)<\/button>/gi;
  let m;
  while ((m = re.exec(src))) {
    const tag = `<button${m[1]}>`;
    const label = clean(m[2]) || attr(tag, 'title') || actionOf(tag);
    if (!label || label === '…') continue;
    const section = PANEL_TABS[tabKey] || tabKey;
    push({ page: 'Painel administrativo', url: '/painel', section, order: panelIdx * 1000 + 1 + PANEL_TAB_ORDER.indexOf(tabKey),
      kind: 'Botão', label: label.slice(0, 90), action: actionOf(tag), how: howTo('Botão', label.slice(0, 90)) });
  }
}

items.sort((a, b) => a.order - b.order);
const pagesSummary = {};
for (const it of items) pagesSummary[it.page] = (pagesSummary[it.page] || 0) + 1;

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify({
  generated_at: new Date().toISOString(),
  total: items.length,
  items: items.map(({ order, ...rest }) => ({ ...rest, order }))
}, null, 2));
console.log(`✓ Checklist gerado: ${items.length} itens → ${path.relative(ROOT, OUT)}`);
for (const [p, n] of Object.entries(pagesSummary)) console.log(`  - ${p}: ${n}`);
