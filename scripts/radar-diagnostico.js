#!/usr/bin/env node
/**
 * ==============================================================================
 * DIAGNÓSTICO DO RADAR JUDICIAL (somente leitura; nunca imprime chaves)
 * ==============================================================================
 *   node scripts/radar-diagnostico.js
 *
 * Mostra, em linguagem simples, POR QUE o Radar não devolve dados:
 *   1. a chave do DataJud está configurada? o DataJud aceita? (HTTP 200 / 401 / 403…)
 *   2. a ComunicaAPI (DJEN: busca por nome, OAB e número) responde?
 *   3. o motor Python existe?
 *   4. quantos registros FABRICADOS (de versões antigas do Radar) ficaram gravados no banco?
 * ==============================================================================
 */
import '../src/config/load-env.js';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { FABRICATED_MOVEMENTS_SQL } from './radar-limpar-fabricados.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = (ok, msg) => console.log(`${ok === true ? '✅' : ok === false ? '🚨' : 'ℹ️ '} ${msg}`);

function describeHttp(status, { usaChave = false } = {}) {
  if (status === 200) return 'respondeu normalmente';
  if (usaChave && (status === 401 || status === 403)) return 'RECUSOU a chave (ela pode ter sido trocada pelo CNJ ou estar errada)';
  if (!usaChave && (status === 401 || status === 403)) return 'BLOQUEOU o acesso desta origem (comum quando o servidor está FORA DO BRASIL ou o IP é de datacenter)';
  if (status === 404) return 'endereço não encontrado';
  if (status === 429) return 'limite de consultas excedido (tente depois)';
  if (status >= 500) return 'o serviço do CNJ está com problema';
  return `respondeu com código ${status}`;
}

async function probe(url, init) {
  try {
    const r = await fetch(url, { ...init, signal: AbortSignal.timeout(12000) });
    return { status: r.status };
  } catch (e) {
    return { error: e.cause?.code || e.message };
  }
}

console.log('\nDiagnóstico do Radar Judicial\n');

// 0. De onde o servidor "sai" para a internet (os tribunais costumam bloquear quem está fora do Brasil)
const pais = await (async () => {
  try {
    const r = await fetch('https://ipinfo.io/country', { signal: AbortSignal.timeout(8000) });
    return (await r.text()).trim().slice(0, 2).toUpperCase();
  } catch {
    return '';
  }
})();
if (pais) out(pais === 'BR', `Origem do servidor: país ${pais}${pais === 'BR' ? '.' : ' — FORA DO BRASIL: o Diário da Justiça (ComunicaAPI) bloqueia essa origem. Veja a ordem AUD-40 (saída pelo Brasil).'}`);

// 1. DataJud
const key = String(process.env.DATAJUD_API_KEY || '').trim();
if (!key) {
  out(false, 'DataJud: a chave DATAJUD_API_KEY NÃO está configurada no servidor. Sem ela, a busca por número de processo não funciona.');
} else {
  out(true, `DataJud: chave configurada (${key.length} caracteres; o valor não é mostrado).`);
  const auth = /^APIKey\s+/i.test(key) ? key : `APIKey ${key}`;
  const r = await probe('https://api-publica.datajud.cnj.jus.br/api_publica_tjmg/_search', {
    method: 'POST',
    headers: { Authorization: auth, 'Content-Type': 'application/json' },
    // consulta LEVE (um número inexistente): confere só se a chave é aceita, sem pesar o índice do tribunal
    body: JSON.stringify({ size: 1, query: { match: { numeroProcesso: '00000000000000000000' } } }),
  });
  if (r.error) out(false, `DataJud: não consegui conectar (${r.error}). O servidor pode estar sem acesso à internet para esse endereço.`);
  else out(r.status === 200, `DataJud: ${describeHttp(r.status, { usaChave: true })} (HTTP ${r.status}).`);
}

// 2. ComunicaAPI (DJEN)
const c = await probe('https://comunicaapi.pje.jus.br/api/v1/comunicacao?numeroOab=222943&ufOab=MG&itensPorPagina=1&pagina=1', {
  headers: { Accept: 'application/json', 'User-Agent': 'JorgeAlvimAdvocacia-Diagnostico/1.0' },
});
if (c.error) out(false, `ComunicaAPI (DJEN): não consegui conectar (${c.error}).`);
else out(c.status === 200, `ComunicaAPI (DJEN): ${describeHttp(c.status)} (HTTP ${c.status}).${c.status === 403 ? ' Sem ela, não há busca por nome/OAB e a sincronização das intimações (DJEN) não traz nada.' : ''}`);

// 3. Motor Python
try {
  const v = execFileSync('python3', ['--version'], { encoding: 'utf8', timeout: 5000 }).trim();
  out(true, `Motor Python: ${v} encontrado.`);
} catch {
  out(false, 'Motor Python: python3 NÃO foi encontrado no servidor. O Radar usa só o caminho nativo (apenas busca por número, via DataJud).');
}

// 4. Dados fabricados gravados por versões antigas
try {
  const db = new DatabaseSync(process.env.DB_PATH || path.join(ROOT, 'leads.db'), { readOnly: true });
  const n = db.prepare(`SELECT COUNT(*) AS n FROM lawsuit_movements WHERE ${FABRICATED_MOVEMENTS_SQL}`).get().n;
  out(n === 0, n === 0 ? 'Banco: nenhum andamento inventado gravado nos processos.' : `Banco: ${n} andamento(s) INVENTADO(S) gravado(s) em processos reais (de versões antigas do Radar). Veja: node scripts/radar-limpar-fabricados.js`);
  let cache = 0;
  try { cache = db.prepare('SELECT COUNT(*) AS n FROM judicial_search_cache').get().n; } catch { /* sem tabela */ }
  out(null, `Banco: ${cache} busca(s) guardada(s) em cache (podem conter resultados inventados antigos; a atualização limpa o cache).`);
  db.close();
} catch (e) {
  out(false, `Banco: não consegui ler (${e.message}).`);
}
console.log('');
