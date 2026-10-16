/**
 * COLETOR do robô de notícias (ISOLADO) — lê RSS de fontes oficiais e joga na
 * caixa de Triagem, respeitando os FREIOS confirmados pelo Dr. Jorge:
 *   - 1 notícia por órgão por ciclo (a mais recente que casa com os termos);
 *   - 1 pendente por fonte (a nova substitui a antiga ainda em triagem);
 *   - fila máxima (ao encher, pausa e avisa);
 *   - validade de 7 dias (triagem vencida é descartada automaticamente);
 *   - deduplicação por identificador (nunca repete a mesma notícia).
 * O robô NUNCA publica: só enche a Triagem. O Dr. Jorge revisa e publica.
 * Sem dependências novas (fetch nativo + leitor de RSS por regex).
 */
import { PORTAL_LIMITS } from './portal.schema.js';

const nowISO = () => new Date().toISOString();

function decodeEntities(s) {
  return String(s || '')
    // 1) tira o invólucro CDATA
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    // 2) decodifica entidades ANTES de tirar tags (senão &lt;p&gt; viraria texto "<p>")
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    // 3) remove imagens/tags (inclusive o logo da fonte) deixando só o texto
    .replace(/<[^>]+>/g, ' ')
    // 4) por fim o & e normaliza espaços
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ').trim();
}
function tagText(block, tag) {
  const m = block.match(new RegExp('<' + tag + '[^>]*>([\\s\\S]*?)<\\/' + tag + '>', 'i'));
  return m ? decodeEntities(m[1]) : '';
}
function norm(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

// Extrai o número de visualizações SÓ se o feed informar (nunca inventa).
function viewsOf(block) {
  const m = block.match(/<(views|hits|pageviews|popularity|popularidade|readcount|read_count|acessos|visualizacoes)[^>]*>\s*(?:<!\[CDATA\[)?\s*(\d+)/i);
  return m ? parseInt(m[2], 10) : null;
}
// Converte pubDate em número para ordenar por data (0 quando não dá).
function dateVal(s) { const d = new Date(s); return isNaN(d) ? 0 : d.getTime(); }

// Leitor de RSS/Atom bem simples (suficiente para feeds de órgãos oficiais).
export function parseRss(xml) {
  const items = [];
  const blocks = String(xml || '').match(/<item[\s>][\s\S]*?<\/item>/gi)
    || String(xml || '').match(/<entry[\s>][\s\S]*?<\/entry>/gi) || [];
  for (const b of blocks) {
    let link = tagText(b, 'link');
    if (!link) { const m = b.match(/<link[^>]*href=["']([^"']+)["']/i); if (m) link = m[1]; }
    items.push({
      title: tagText(b, 'title'),
      link,
      pubDate: tagText(b, 'pubDate') || tagText(b, 'published') || tagText(b, 'updated') || tagText(b, 'dc:date'),
      description: tagText(b, 'description') || tagText(b, 'summary') || tagText(b, 'content:encoded'),
      author: tagText(b, 'dc:creator') || tagText(b, 'author') || '',
      views: viewsOf(b) // null quando o feed não informa (nunca inventamos)
    });
  }
  return items;
}

async function fetchText(url, timeoutMs = 20000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(url, { signal: ctrl.signal, headers: { 'User-Agent': 'JornalAlvimBot/1.0 (+portal de notícias)' } });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return await r.text();
  } finally {
    clearTimeout(t);
  }
}

// Conta a fila de revisão (itens aguardando publicação).
function filaAtual(db) {
  return db.prepare("SELECT COUNT(*) AS n FROM portal_items WHERE fase IN ('1_triagem','2_pauta','3_redacao')").get().n;
}

// Descarta triagem vencida (validade em dias).
export function expirarAntigas(db) {
  const limite = new Date(Date.now() - PORTAL_LIMITS.VALIDADE_DIAS * 24 * 3600 * 1000).toISOString();
  const r = db.prepare("UPDATE portal_items SET fase='descartada', updated_at=? WHERE fase='1_triagem' AND created_at < ?").run(nowISO(), limite);
  return r.changes || 0;
}

/**
 * Executa um ciclo de coleta. Retorna um resumo legível.
 * @param {object} db
 * @param {object} [opts] { onlySkey } para coletar de uma fonte específica.
 */
export async function coletar(db, opts = {}) {
  const resumo = { inseridas: 0, substituidas: 0, puladas: 0, expiradas: 0, fonte_erros: [], pausado: false, detalhes: [] };
  resumo.expiradas = expirarAntigas(db);

  const termos = db.prepare('SELECT termo FROM portal_terms WHERE ativo=1').all().map(t => norm(t.termo)).filter(Boolean);
  let fontes = db.prepare('SELECT * FROM portal_sources WHERE ativo=1').all();
  if (opts.onlySkey) fontes = fontes.filter(f => f.skey === opts.onlySkey);

  for (const fonte of fontes) {
    if (filaAtual(db) >= PORTAL_LIMITS.FILA_MAX) { resumo.pausado = true; break; }
    if (!fonte.url) { resumo.detalhes.push(`${fonte.name}: sem URL de feed`); continue; }
    let xml;
    try { xml = await fetchText(fonte.url); }
    catch (e) { resumo.fonte_erros.push(`${fonte.name}: ${e.message}`); continue; }

    const itens = parseRss(xml).filter(i => i.title && i.link);
    // Filtra pelos termos ativos (se houver termos). Mantém a ORDEM do feed (mais recentes primeiro).
    const casam = termos.length
      ? itens.filter(i => { const hay = norm(i.title + ' ' + i.description); return termos.some(t => hay.includes(t)); })
      : itens;
    if (!casam.length) { resumo.detalhes.push(`${fonte.name}: nada novo que case com os termos`); continue; }

    // 1 por fonte por ciclo: escolhe por MAIOR nº de visualizações (quando a
    // fonte informa) e, no empate/ausência, pela data mais recente. Sem inventar.
    const ordenadas = casam.slice().sort((a, b) => {
      const va = (a.views == null ? -1 : a.views), vb = (b.views == null ? -1 : b.views);
      if (vb !== va) return vb - va;
      return dateVal(b.pubDate) - dateVal(a.pubDate);
    });
    const nova = ordenadas[0];
    const externalId = fonte.skey + '|' + (nova.link || nova.title);

    // Dedupe: já existe em qualquer fase? então pula.
    const existe = db.prepare('SELECT id FROM portal_items WHERE external_id = ?').get(externalId);
    if (existe) { resumo.puladas++; resumo.detalhes.push(`${fonte.name}: já estava na esteira`); continue; }

    // 1 pendente por fonte: remove a triagem antiga ainda não revisada desta fonte.
    const antiga = db.prepare("SELECT id FROM portal_items WHERE source = ? AND fase='1_triagem'").get(fonte.name);
    if (antiga) { db.prepare("UPDATE portal_items SET fase='descartada', updated_at=? WHERE id=?").run(nowISO(), antiga.id); resumo.substituidas++; }

    const now = nowISO();
    db.prepare(
      `INSERT INTO portal_items (fase, tipo, source, source_url, source_date, fonte_autor, source_views, external_id, title, summary, category, raw_text, created_at, updated_at)
       VALUES ('1_triagem','oficial',?,?,?,?,?,?,?,?,?,?,?,?)`
    ).run(
      fonte.name, nova.link || '', nova.pubDate || now, nova.author || '',
      (nova.views == null ? null : nova.views),
      externalId,
      (nova.title || '').slice(0, 300),
      (nova.description || '').slice(0, 600),
      fonte.nivel || null,
      (nova.description || '').slice(0, 4000),
      now, now
    );
    resumo.inseridas++;
    resumo.detalhes.push(`${fonte.name}: "${(nova.title || '').slice(0, 60)}"`);
  }
  return resumo;
}
