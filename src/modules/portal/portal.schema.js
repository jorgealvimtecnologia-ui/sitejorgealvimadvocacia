/**
 * Esquema ISOLADO do portal de notícias (esteira do robô).
 * Tabelas próprias (prefixo portal_) — NÃO tocam blog_posts nem a produção.
 * Criadas de forma idempotente na carga do módulo (CREATE TABLE IF NOT EXISTS).
 *
 * Esteira das matérias (fase):
 *   1_triagem   → o robô trouxe, aguardando o Dr. Jorge aprovar a pauta
 *   2_pauta     → pauta aprovada (ângulo/título escolhido)
 *   3_redacao   → matéria redigida/formatada, pronta para revisão final
 *   4_publicado → publicada no portal (só aqui aparece ao público)
 *   descartada  → descartada pelo Dr. Jorge
 */
/**
 * LIMITES do robô e do portal (freios contra fila/sobrecarga), confirmados
 * pelo Dr. Jorge em 16/10/2026. Tudo ajustável aqui, num lugar só.
 */
export const PORTAL_LIMITS = {
  POR_FONTE_POR_CICLO: 1,   // o robô traz no máximo 1 notícia por órgão/agência por ciclo
  PENDENTES_POR_FONTE: 1,   // mantém só 1 item não revisado por fonte (o mais novo substitui o antigo)
  MANCHETES_POR_BOX: 5,     // cada caixa de fonte na home mostra 5 manchetes (o resto vai p/ "ver todas")
  BOXES_HOME: 4,            // Locais, Federais, Estaduais, Municipais
  FILA_MAX: 40,             // teto da fila de revisão; ao encher, o robô pausa e avisa
  VALIDADE_DIAS: 7,         // item na triagem não revisado em 7 dias é descartado automaticamente
  CADENCIA: 'semanal'       // o robô roda 1x por semana
};

export function ensurePortalSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS portal_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      fase TEXT NOT NULL DEFAULT '1_triagem',
      tipo TEXT NOT NULL DEFAULT 'oficial',   -- 'oficial' (transcrição da fonte) | 'blog' (autoral do Dr. Jorge)
      source TEXT,                            -- órgão/agência de origem (crédito)
      source_url TEXT,                        -- link da matéria na fonte oficial
      source_date TEXT,                       -- data de publicação na fonte
      fonte_autor TEXT,                       -- autor(es) originais da fonte, se houver
      external_id TEXT,
      slug TEXT,
      title TEXT NOT NULL,
      summary TEXT,
      category TEXT,
      content TEXT,
      raw_text TEXT,
      comentario TEXT,                        -- análise autoral do Dr. Jorge (assinada), opcional, exibida em destaque
      author_name TEXT,                       -- preenchido SÓ em matéria autoral do blog (Dr. Jorge)
      author_oab TEXT,                        -- idem (OAB/MG) — nunca em transcrição oficial
      source_views INTEGER,                   -- visualizações NA FONTE, só quando o órgão informa (NULL = desconhecido, nunca inventar)
      likes_count INTEGER DEFAULT 0,
      views_count INTEGER DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      published_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_portal_items_fase ON portal_items(fase);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_portal_items_ext ON portal_items(external_id) WHERE external_id IS NOT NULL;

    CREATE TABLE IF NOT EXISTS portal_sources (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      skey TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      nivel TEXT,
      type TEXT DEFAULT 'rss',
      modo TEXT DEFAULT 'rss',   -- 'rss' (feed de últimas) ou 'capa' (manchete da home do órgão)
      url TEXT,
      ativo INTEGER DEFAULT 0,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS portal_terms (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      termo TEXT UNIQUE NOT NULL,
      ativo INTEGER DEFAULT 1,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS portal_comments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      item_id INTEGER,
      slug TEXT,
      author_name TEXT,
      author_email TEXT,
      author_phone TEXT,
      comment_text TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pendente',
      is_hidden INTEGER NOT NULL DEFAULT 1,
      ip_address TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS portal_newsletter (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE NOT NULL,
      nome TEXT,
      ativo INTEGER NOT NULL DEFAULT 1,
      token TEXT,
      origem TEXT,
      created_at TEXT NOT NULL,
      unsubscribed_at TEXT
    );

    CREATE TABLE IF NOT EXISTS portal_newsletter_campaigns (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      subject TEXT NOT NULL,
      body TEXT,
      status TEXT NOT NULL DEFAULT 'rascunho',   -- 'rascunho' | 'enviado'
      total INTEGER DEFAULT 0,
      sent_count INTEGER DEFAULT 0,
      created_at TEXT NOT NULL,
      sent_at TEXT
    );

    CREATE TABLE IF NOT EXISTS portal_likes (
      slug TEXT PRIMARY KEY,
      count INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT
    );

    CREATE TABLE IF NOT EXISTS portal_leads (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      origem TEXT NOT NULL,
      nome TEXT,
      email TEXT,
      telefone TEXT,
      slug TEXT,
      created_at TEXT NOT NULL
    );
  `);

  // Migração defensiva: bancos antigos ganham as colunas novas.
  try { db.exec('ALTER TABLE portal_items ADD COLUMN source_views INTEGER'); } catch (e) { /* já existe */ }
  try { db.exec('ALTER TABLE portal_items ADD COLUMN comentario TEXT'); } catch (e) { /* já existe */ }
  try { db.exec("ALTER TABLE portal_sources ADD COLUMN modo TEXT DEFAULT 'rss'"); } catch (e) { /* já existe */ }

  const now = new Date().toISOString();

  // Fontes oficiais (desligadas por padrão; o Dr. Jorge liga quando quiser).
  // Agência Brasil já entra ligada (é a primeira fonte do piloto, Creative Commons).
  const sourceCount = db.prepare('SELECT COUNT(*) AS n FROM portal_sources').get().n;
  if (sourceCount === 0) {
    const ins = db.prepare(
      'INSERT INTO portal_sources (skey, name, nivel, type, modo, url, ativo, created_at) VALUES (?,?,?,?,?,?,?,?)'
    );
    // modo 'rss' = feed de últimas; modo 'capa' = manchete da home/página de
    // notícias do órgão (p/ quem não tem feed confiável). URLs oficiais; o Dr.
    // Jorge pode ajustar qualquer link pelo ✎ na Central, se o órgão mudar.
    const seed = [
      ['agencia_brasil', 'Agência Brasil (EBC)', 'federal', 'rss', 'rss', 'https://agenciabrasil.ebc.com.br/rss/ultimasnoticias/feed.xml', 1],
      ['stf', 'STF — Notícias', 'federal', 'rss', 'rss', 'https://portal.stf.jus.br/', 0],
      ['stj', 'STJ — Notícias', 'federal', 'rss', 'rss', 'https://www.stj.jus.br/', 0],
      ['inss', 'gov.br / INSS', 'federal', 'rss', 'capa', 'https://www.gov.br/inss/pt-br/noticias', 0],
      ['gov_mg', 'Governo de Minas Gerais', 'estadual', 'rss', 'capa', 'https://www.agenciaminas.mg.gov.br/', 0],
      ['mpmg', 'MPMG — Notícias', 'estadual', 'rss', 'rss', 'https://www.mpmg.mp.br/', 0],
      ['tjmg', 'TJMG — Notícias', 'estadual', 'rss', 'capa', 'https://www.tjmg.jus.br/portal-tjmg/noticias/', 0],
      ['pjf', 'Prefeitura de Juiz de Fora', 'municipal', 'rss', 'capa', 'https://www.pjf.mg.gov.br/noticias/', 0]
    ];
    for (const s of seed) ins.run(s[0], s[1], s[2], s[3], s[4], s[5], s[6], now);
  }

  // Backfill das fontes "capa do dia" em bancos já existentes: só atualiza
  // quando a URL ainda é a placeholder original (não toca no que o Dr. Jorge
  // já ajustou à mão). Idempotente: após rodar, a URL muda e não casa de novo.
  const capaDefaults = [
    ['inss', 'https://www.gov.br/inss/pt-br/noticias', 'https://www.gov.br/inss/pt-br'],
    ['gov_mg', 'https://www.agenciaminas.mg.gov.br/', 'https://www.mg.gov.br/'],
    ['tjmg', 'https://www.tjmg.jus.br/portal-tjmg/noticias/', 'https://www.tjmg.jus.br/'],
    ['pjf', 'https://www.pjf.mg.gov.br/noticias/', 'https://www.pjf.mg.gov.br/']
  ];
  const updCapa = db.prepare("UPDATE portal_sources SET modo='capa', url=? WHERE skey=? AND url=?");
  for (const [skey, novaUrl, antigaUrl] of capaDefaults) updCapa.run(novaUrl, skey, antigaUrl);

  // Termos de busca (o robô filtra as notícias por eles).
  const termCount = db.prepare('SELECT COUNT(*) AS n FROM portal_terms').get().n;
  if (termCount === 0) {
    const ins = db.prepare('INSERT INTO portal_terms (termo, ativo, created_at) VALUES (?,?,?)');
    const seed = ['INSS', 'BPC', 'LOAS', 'aposentadoria', 'golpe', 'Pix', 'CNH', 'consumidor', 'militar', 'Juiz de Fora', 'Minas Gerais'];
    for (const t of seed) ins.run(t, 1, now);
  }

  // A esteira começa VAZIA: enche só quando o Dr. Jorge ativa fontes e capta.
  // Remove pautas de exemplo antigas (dados fictícios do scaffolding inicial).
  db.prepare("DELETE FROM portal_items WHERE external_id LIKE 'demo-%'").run();
}
