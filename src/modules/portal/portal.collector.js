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

function absUrl(href, base) { try { return new URL(href, base).href; } catch (e) { return href; } }

// Texto que NÃO é manchete: legendas de foto, créditos, bylines, rótulos de
// navegação e chamadas genéricas. Evita que o robô traga "Crédito: Fulano",
// "Foto: ...", "Leia mais", etc. como se fosse notícia (sem inventar nada).
const NAO_MANCHETE = /^(cr[eé]dito|foto|fotos|imagem|imagens|v[ií]deo|v[ií]deos|[aá]udio|arte|ilustra|infogr[aá]fico|charge|legenda|arquivo|divulga[cç][aã]o|reprodu[cç][aã]o|ampliar|compartilh|leia\b|saiba\b|veja\b|clique|acesse|baixe|inscreva|cadastre|assine|newsletter|menu|p[aá]gina\s+inicial|voltar|pr[oó]xim|anterior)/i;
// Crédito de foto típico de assessorias (ex.: "… / Imprensa MG", "Ascom/Secom").
const CREDITO_FOTO = /(\/\s*(imprensa|ascom|secom|comunica[cç][aã]o)\b)|\b(ascom|secom)[\s/]|©|\bfoto[:/]/i;

// Lê a PÁGINA INICIAL do órgão e extrai as manchetes (a "capa do dia").
// Heurística: links para páginas de notícia com texto de manchete (sem inventar).
export function parseCapa(html, baseUrl) {
  const items = [];
  const seen = new Set();
  const re = /<a\s[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = re.exec(html))) {
    const href = m[1];
    const text = decodeEntities(m[2]);
    if (!text || text.length < 25) continue;                 // ignora menus/botões curtos
    if (text.split(/\s+/).length < 4) continue;              // manchete tem ao menos 4 palavras
    if (NAO_MANCHETE.test(text) || CREDITO_FOTO.test(text)) continue; // legenda/crédito/rótulo, não é notícia
    if (!/(noticia|materia|conteudo|imprensa|\/20\d{2}\/|\/20\d{2}-)/i.test(href)) continue; // parece notícia
    if (/\.(jpg|png|svg|gif|gifv|webp|avif|mp4|css|js|pdf)(\?|$)/i.test(href)) continue;
    const link = absUrl(href, baseUrl);
    if (seen.has(link)) continue;
    seen.add(link);
    items.push({ title: text.slice(0, 300), link, pubDate: '', description: '', author: '', views: null });
    if (items.length >= 10) break;
  }
  return items;
}

// Abre a PÁGINA da matéria e extrai o CORPO (parágrafos de texto), ignorando
// menus, rodapés, scripts, legendas de foto e créditos. Sem inventar: se não
// achar parágrafos de texto, devolve vazio (a matéria fica só com o título para
// o Dr. Jorge revisar). Usado para fontes oficiais (transcrição de fonte pública);
// o valor editorial continua sendo o Comentário do Dr. Jorge.
export function extrairCorpo(html) {
  const limpo = String(html || '')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(script|style|noscript|svg|form|nav|header|footer|aside)[\s>][\s\S]*?<\/\1>/gi, ' ');
  // Prefere a região semântica do artigo, quando marcada.
  const reg = limpo.match(/<article[\s>][\s\S]*?<\/article>/i)
    || limpo.match(/<main[\s>][\s\S]*?<\/main>/i);
  const escopo = reg ? reg[0] : limpo;
  const paras = [];
  const re = /<p\b[^>]*>([\s\S]*?)<\/p>/gi;
  let m;
  while ((m = re.exec(escopo))) {
    const t = decodeEntities(m[1]);               // vira texto puro (tags removidas)
    if (!t || t.length < 40) continue;            // ignora parágrafos curtos/ruído
    if (NAO_MANCHETE.test(t) || CREDITO_FOTO.test(t)) continue; // legenda/crédito/rótulo
    paras.push(t);
    if (paras.length >= 40) break;
  }
  if (!paras.length) return { resumo: '', corpoHtml: '' };
  const resumo = paras[0].slice(0, 300);
  const corpoHtml = paras
    .map(p => '<p>' + p.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;') + '</p>')
    .join('\n');
  return { resumo, corpoHtml };
}

// Cabeçalhos de navegador comum: muitos sites de órgãos (STF, prefeituras)
// devolvem 403 para "robôs". Identificando-se como um browser, a leitura das
// páginas públicas costuma ser liberada. (Alguns sites com WAF/Cloudflare
// ainda podem recusar — aí o robô só avisa e segue, sem inventar nada.)
async function fetchText(url, timeoutMs = 20000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(url, {
      signal: ctrl.signal,
      redirect: 'follow',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,application/rss+xml;q=0.8,*/*;q=0.7',
        'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.8'
      }
    });
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

    let casam;
    if (fonte.modo === 'capa') {
      // Modo CAPA: pega a manchete principal da home do órgão (a "notícia do dia").
      casam = parseCapa(xml, fonte.url);
      if (!casam.length) { resumo.detalhes.push(`${fonte.name}: não encontrei manchetes na capa`); continue; }
    } else {
      // Modo RSS: últimas notícias do feed, filtradas pelos termos ativos.
      const itens = parseRss(xml).filter(i => i.title && i.link);
      casam = termos.length
        ? itens.filter(i => { const hay = norm(i.title + ' ' + i.description); return termos.some(t => hay.includes(t)); })
        : itens;
      if (!casam.length) { resumo.detalhes.push(`${fonte.name}: nada novo que case com os termos`); continue; }
    }

    // 1 por fonte por ciclo: escolhe por MAIOR nº de visualizações (quando a
    // fonte informa) e, no empate/ausência, pela data mais recente. Sem inventar.
    const ordenadas = casam.slice().sort((a, b) => {
      const va = (a.views == null ? -1 : a.views), vb = (b.views == null ? -1 : b.views);
      if (vb !== va) return vb - va;
      return dateVal(b.pubDate) - dateVal(a.pubDate);
    });
    // Pega a PRIMEIRA notícia ainda não vista (pula as já captadas ou descartadas
    // e traz a próxima) — assim, ao descartar uma, a recaptura traz outra.
    let nova = null, externalId = null;
    for (const cand of ordenadas) {
      const eid = fonte.skey + '|' + (cand.link || cand.title);
      if (!db.prepare('SELECT id FROM portal_items WHERE external_id = ?').get(eid)) { nova = cand; externalId = eid; break; }
    }
    if (!nova) { resumo.puladas++; resumo.detalhes.push(`${fonte.name}: nada novo (todas as recentes já passaram pela esteira)`); continue; }

    // Abre a matéria escolhida e traz o CORPO (não só o título). No modo CAPA o
    // description vem vazio (só a manchete da home), então aqui seguimos o link
    // e extraímos os parágrafos. Se falhar ou não achar corpo, mantém o que tem
    // (título + resumo do feed) — nunca inventa.
    let exResumo = (nova.description || '').slice(0, 600);
    let exCorpo = (nova.description || '').slice(0, 4000);
    if (nova.link && (fonte.modo === 'capa' || !exCorpo)) {
      try {
        const got = extrairCorpo(await fetchText(nova.link));
        if (got.corpoHtml) {
          exCorpo = got.corpoHtml.slice(0, 8000);
          if (!exResumo) exResumo = got.resumo;
        } else {
          resumo.detalhes.push(`${fonte.name}: abri a matéria mas não achei o corpo (fica só o título para revisão)`);
        }
      } catch (e) {
        resumo.fonte_erros.push(`${fonte.name} (corpo): ${e.message}`);
      }
    }

    // A esteira ACUMULA: cada captação adiciona uma notícia nova por fonte (sem
    // repetir, graças ao dedupe acima), até o teto da fila (FILA_MAX). Assim o
    // Dr. Jorge enche a Triagem mais rápido captando várias vezes.
    const now = nowISO();
    db.prepare(
      `INSERT INTO portal_items (fase, tipo, source, source_url, source_date, fonte_autor, source_views, external_id, title, summary, category, raw_text, created_at, updated_at)
       VALUES ('1_triagem','oficial',?,?,?,?,?,?,?,?,?,?,?,?)`
    ).run(
      fonte.name, nova.link || '', nova.pubDate || now, nova.author || '',
      (nova.views == null ? null : nova.views),
      externalId,
      (nova.title || '').slice(0, 300),
      exResumo.slice(0, 600),
      fonte.nivel || null,
      exCorpo.slice(0, 8000),
      now, now
    );
    resumo.inseridas++;
    resumo.detalhes.push(`${fonte.name}: "${(nova.title || '').slice(0, 60)}"`);
  }
  return resumo;
}
