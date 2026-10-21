/**
 * Coletor de VÍDEOS institucionais do Portal de Notícias (captação automática via RSS do YouTube).
 *
 * Espelha o critério do robô de notícias: lê os canais oficiais cadastrados (tribunais e órgãos),
 * busca os últimos vídeos pelo feed RSS público do YouTube e grava cada novo vídeo como "pendente"
 * para o Dr. Jorge aprovar antes de publicar no portal. Nada é publicado automaticamente.
 *
 * Funções PURAS de parsing/resolução ficam exportadas para teste; coletarVideos() lê/grava o banco.
 */

// Baixa um texto (HTML/XML) com timeout e User-Agent de navegador (o YouTube rejeita UA vazio).
async function fetchText(url, timeoutMs = 15000) {
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; JornalAlvimBot/1.0; +https://jorgealvimadvocacia.com.br)',
      'Accept-Language': 'pt-BR,pt;q=0.9'
    },
    signal: AbortSignal.timeout(timeoutMs)
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} ao buscar ${url}`);
  return await res.text();
}

// Decodifica entidades XML/HTML básicas presentes nos feeds.
export function decodeEntities(s) {
  return String(s == null ? '' : s)
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

const UC_RE = /^UC[0-9A-Za-z_-]{22}$/;

/**
 * Extrai um channel_id (UC...) direto do que o mestre informou, quando possível,
 * sem precisar ir à rede. Aceita o próprio UC..., ou uma URL /channel/UC...
 */
export function channelIdFromInput(input) {
  const s = String(input || '').trim();
  if (UC_RE.test(s)) return s;
  const m = s.match(/youtube\.com\/channel\/(UC[0-9A-Za-z_-]{22})/i);
  return m ? m[1] : null;
}

/**
 * Normaliza o que o mestre colou para uma URL de canal navegável (para resolver @handle, /c/, /user/).
 */
function channelUrlFromInput(input) {
  const s = String(input || '').trim();
  if (/^https?:\/\//i.test(s)) return s;
  if (s.startsWith('@')) return `https://www.youtube.com/${s}`;
  return `https://www.youtube.com/@${s.replace(/^@/, '')}`;
}

/**
 * Resolve o channel_id (UC...) a partir de qualquer entrada (UC.../URL/@handle),
 * buscando a página do canal e lendo o canonical quando necessário.
 */
export async function resolveChannelId(input, fetcher = fetchText) {
  const direct = channelIdFromInput(input);
  if (direct) return direct;
  const html = await fetcher(channelUrlFromInput(input));
  const m =
    html.match(/"channelId":"(UC[0-9A-Za-z_-]{22})"/) ||
    html.match(/channel\/(UC[0-9A-Za-z_-]{22})/) ||
    html.match(/"externalId":"(UC[0-9A-Za-z_-]{22})"/);
  return m ? m[1] : null;
}

/**
 * Faz o parsing do feed Atom do YouTube (videos.xml). Retorna uma lista de vídeos
 * { youtube_id, title, published, description }.
 */
export function parseYouTubeFeed(xml) {
  const out = [];
  const entries = String(xml || '').split(/<entry>/).slice(1);
  for (const raw of entries) {
    const block = raw.split(/<\/entry>/)[0];
    const idm = block.match(/<yt:videoId>([^<]+)<\/yt:videoId>/);
    if (!idm) continue;
    const youtube_id = idm[1].trim();
    const titlem = block.match(/<title>([\s\S]*?)<\/title>/);
    const pubm = block.match(/<published>([^<]+)<\/published>/);
    const descm = block.match(/<media:description>([\s\S]*?)<\/media:description>/);
    out.push({
      youtube_id,
      title: decodeEntities(titlem ? titlem[1].trim() : '').slice(0, 200),
      published: pubm ? pubm[1].trim() : '',
      description: decodeEntities(descm ? descm[1].trim() : '').replace(/\s+/g, ' ').slice(0, 400)
    });
  }
  return out;
}

const FEED_URL = (channelId) => `https://www.youtube.com/feeds/videos.xml?channel_id=${encodeURIComponent(channelId)}`;

/**
 * Captação: percorre os canais ativos, busca os vídeos novos e grava como "pendente".
 * opts.perChannel limita quantos vídeos recentes considerar por canal (padrão 5).
 */
export async function coletarVideos(db, opts = {}) {
  const perChannel = Number.isInteger(opts.perChannel) ? opts.perChannel : 5;
  const now = new Date().toISOString();
  const canais = db.prepare('SELECT * FROM portal_video_channels WHERE active = 1 ORDER BY id ASC').all();

  const resumo = { canais: canais.length, novos: 0, ignorados: 0, erros: [] };
  if (!canais.length) return resumo;

  const existe = db.prepare('SELECT 1 FROM portal_videos WHERE youtube_id = ?');
  const insert = db.prepare(`
    INSERT INTO portal_videos
      (title, source_name, badge_category, youtube_url, youtube_id, description,
       video_date, ordem, is_published, status, channel_id, origem, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, 100, 0, 'pendente', ?, 'rss', ?, ?)
  `);

  for (const canal of canais) {
    try {
      let channelId = canal.channel_id;
      if (!channelId) {
        channelId = await resolveChannelId(canal.channel_input);
        if (!channelId) {
          resumo.erros.push(`${canal.org_name}: não foi possível resolver o canal (verifique a URL/@handle).`);
          continue;
        }
        db.prepare('UPDATE portal_video_channels SET channel_id = ?, updated_at = ? WHERE id = ?')
          .run(channelId, now, canal.id);
      }

      const xml = await fetchText(FEED_URL(channelId));
      const videos = parseYouTubeFeed(xml).slice(0, perChannel);

      for (const v of videos) {
        if (!v.youtube_id || existe.get(v.youtube_id)) { resumo.ignorados++; continue; }
        insert.run(
          v.title || 'Vídeo institucional',
          canal.org_name,
          (canal.badge_category || 'INSTITUCIONAL').toUpperCase(),
          `https://www.youtube.com/watch?v=${v.youtube_id}`,
          v.youtube_id,
          v.description || '',
          v.published || now,
          channelId,
          now, now
        );
        resumo.novos++;
      }

      db.prepare('UPDATE portal_video_channels SET last_sync_at = ?, updated_at = ? WHERE id = ?')
        .run(now, now, canal.id);
    } catch (err) {
      resumo.erros.push(`${canal.org_name}: ${err.message}`);
    }
  }

  return resumo;
}
