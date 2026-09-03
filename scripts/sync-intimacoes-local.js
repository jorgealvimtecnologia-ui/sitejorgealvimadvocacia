#!/usr/bin/env node
/**
 * SINCRONIZAÇÃO LOCAL DE INTIMAÇÕES (Opção B)
 * ------------------------------------------------------------------
 * Roda no BRASIL (seu PC), onde o DJEN não é bloqueado, baixa as
 * intimações da ComunicaAPI e envia para o sistema em produção.
 * O servidor (na França) é bloqueado pelo DJEN, por isso esta parte
 * roda aqui. Os andamentos (DataJud) continuam automáticos no servidor.
 *
 * Como usar:  node scripts/sync-intimacoes-local.js
 * (dá pra agendar no Windows via Agendador de Tarefas, ex.: 08h e 14h)
 * ------------------------------------------------------------------
 */

// ===== CONFIGURAÇÃO =====
const PROD_URL = process.env.PROD_URL || 'https://jorgealvimadvocacia.com.br';
const USER = process.env.SYNC_USER || 'jorgealvimtecnologia';
const PASS = process.env.SYNC_PASS || 'jorgealvim';

// OABs do escritório (mesma lista do servidor).
const OABS = [
  { oab: '222943', uf: 'MG', nome: 'Dr. Jorge Alvim' },
  { oab: '198765', uf: 'MG', nome: 'Dr. Jorge Eduardo Alvim' },
  { oab: '210450', uf: 'MG', nome: 'Dra. Mariana Fonseca Alvim' },
  { oab: '165430', uf: 'MG', nome: 'Dr. Roberto Medeiros Fonseca' },
  { oab: '225890', uf: 'MG', nome: 'Dra. Camila Vasconcelos' }
];

const ITENS = 100, MAX_PAGES = 60;
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function login() {
  const r = await fetch(`${PROD_URL}/api/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: USER, password: PASS })
  });
  const d = await r.json();
  if (!d.token) throw new Error('Falha no login: ' + (d.error || 'sem token'));
  return d.token;
}

async function fetchOab(oab, uf) {
  const all = [];
  for (let pagina = 1; pagina <= MAX_PAGES; pagina++) {
    const url = `https://comunicaapi.pje.jus.br/api/v1/comunicacao?numeroOab=${oab}&ufOab=${uf}&pagina=${pagina}&itensPorPagina=${ITENS}`;
    const res = await fetch(url, { headers: { 'Accept': 'application/json', 'User-Agent': 'JorgeAlvimAdvocacia/1.0' } });
    if (res.status === 429) { await sleep(4000); pagina--; continue; } // rate-limit: espera e repete
    if (!res.ok) { console.warn(`  ! DJEN HTTP ${res.status} (OAB ${oab})`); break; }
    const data = await res.json();
    const items = data.items || [];
    if (items.length === 0) break;
    all.push(...items);
    if (items.length < ITENS) break;
    await sleep(400); // polidez entre páginas p/ evitar 429
  }
  return all;
}

async function ingest(token, oab, uf, nome, items) {
  const r = await fetch(`${PROD_URL}/api/court/publications/ingest`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
    body: JSON.stringify({ oab, uf, nome, items })
  });
  return r.json();
}

(async () => {
  console.log(`\n🇧🇷 Sincronização local de intimações → ${PROD_URL}\n`);
  let token;
  try { token = await login(); console.log('✓ Login OK'); }
  catch (e) { console.error('✗', e.message); process.exit(1); }

  let totalBaixadas = 0, totalNovas = 0;
  for (const { oab, uf, nome } of OABS) {
    process.stdout.write(`• OAB ${uf} ${oab} (${nome}) … `);
    try {
      const items = await fetchOab(oab, uf);
      totalBaixadas += items.length;
      if (items.length === 0) { console.log('0 encontradas'); continue; }
      // Envia em lotes de 25 para não estourar o corpo da requisição.
      let novas = 0;
      const LOTE = 25;
      for (let i = 0; i < items.length; i += LOTE) {
        const res = await ingest(token, oab, uf, nome, items.slice(i, i + LOTE));
        novas += res.saved || 0;
      }
      totalNovas += novas;
      console.log(`${items.length} baixadas, ${novas} novas`);
    } catch (e) {
      console.log('ERRO: ' + e.message);
    }
  }
  console.log(`\n✅ Concluído: ${totalBaixadas} intimações analisadas, ${totalNovas} novas enviadas ao sistema.\n`);
})();
