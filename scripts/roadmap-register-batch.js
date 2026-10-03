#!/usr/bin/env node
/**
 * ==============================================================================
 * REGISTRO EM LOTE DE ORDENS NO ROADMAP VIVO (SITE)
 * ==============================================================================
 * Lê um arquivo JSON de ordens e as registra no site via `roadmap-agent.js register`,
 * reaproveitando a mesma chave e a mesma API. Por padrão só SIMULA (não envia nada).
 * Ordens cujo título já existe no site são puladas, então rodar de novo não duplica.
 * O bloco opcional "sincronizar" do JSON ([{titulo, status, nota}]) atualiza o ESTADO de ordens que já
 * existem no site (ex.: AUD-01 -> conforme) — só quando o estado é diferente, então também não repete.
 *
 * Uso:
 *   npm run roadmap:register-batch -- [arquivo.json]            # simulação
 *   npm run roadmap:register-batch -- [arquivo.json] --aplicar  # envia ao site
 *
 * Arquivo padrão: docs/roadmap/ordens-auditoria-2026-10-03.json
 * Requer ROADMAP_AGENT_KEY no .env (ver CLAUDE.md) apenas com --aplicar.
 * ==============================================================================
 */
import path from 'node:path';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const AGENT = path.join(ROOT_DIR, 'scripts', 'roadmap-agent.js');
const DEFAULT_FILE = path.join('docs', 'roadmap', 'ordens-auditoria-2026-10-03.json');

const args = process.argv.slice(2);
const aplicar = args.includes('--aplicar');
const file = path.resolve(ROOT_DIR, args.find((a) => !a.startsWith('--')) || DEFAULT_FILE);

function fail(msg) {
  console.error(`✖ ${msg}`);
  process.exit(1);
}

function runAgent(agentArgs) {
  try {
    return execFileSync(process.execPath, [AGENT, ...agentArgs], { cwd: ROOT_DIR, encoding: 'utf8' });
  } catch (e) {
    const detail = String(e.stderr || e.stdout || e.message).trim();
    throw new Error(detail || 'falha ao executar roadmap-agent.js');
  }
}

if (!fs.existsSync(file)) fail(`Arquivo não encontrado: ${file}`);
let ordens;
try {
  ordens = JSON.parse(fs.readFileSync(file, 'utf8')).ordens;
} catch (e) {
  fail(`JSON inválido em ${file}: ${e.message}`);
}
if (!Array.isArray(ordens) || !ordens.length) fail('O arquivo não contém a lista "ordens".');
for (const o of ordens) {
  if (!o.titulo) fail(`Ordem sem título (ref: ${o.ref || '?'}).`);
}

console.log(
  `\n${aplicar ? 'REGISTRANDO' : 'SIMULAÇÃO —'} ${ordens.length} ordem(ns) de ${path.relative(ROOT_DIR, file)}\n`
);

let existentes = new Set();
if (aplicar) {
  try {
    const lista = JSON.parse(runAgent(['list', '--json']));
    existentes = new Set((lista.orders || []).map((o) => String(o.title).trim().toLowerCase()));
  } catch (e) {
    fail(`Não foi possível consultar as ordens do site: ${e.message}`);
  }
}

let criadas = 0,
  puladas = 0,
  falhas = 0,
  atualizadas = 0;
for (const o of ordens) {
  const rotulo = `${o.ref ? `${o.ref} ` : ''}[${o.prioridade || 'P1'}] ${o.titulo}`;
  if (!aplicar) {
    console.log(`  • ${rotulo}`);
    continue;
  }
  if (existentes.has(o.titulo.trim().toLowerCase())) {
    console.log(`  = já existe, pulada: ${rotulo}`);
    puladas++;
    continue;
  }
  try {
    const out = JSON.parse(
      runAgent([
        'register',
        o.titulo,
        '--json',
        `--prioridade=${o.prioridade || 'P1'}`,
        `--criterios=${o.criterios || ''}`,
        `--descricao=${o.descricao || ''}`,
      ])
    );
    console.log(`  ✓ [${out.id}] ${rotulo}`);
    criadas++;
  } catch (e) {
    console.log(`  ✖ falhou: ${rotulo} — ${e.message}`);
    falhas++;
  }
}

// Sincroniza o ESTADO de ordens que já existem no site (planejado/em_curso/bloqueado/conforme).
const sincronizar = (() => {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8')).sincronizar || [];
  } catch {
    return [];
  }
})();
const STATUS_VALIDOS = ['planejado', 'em_curso', 'bloqueado', 'conforme'];
if (sincronizar.length) {
  console.log(`\nEstado das ordens que já existem no site (${sincronizar.length} a conferir):`);
  let noSite = [];
  if (aplicar) {
    try {
      noSite = JSON.parse(runAgent(['list', '--json'])).orders || [];
    } catch (e) {
      fail(`Não foi possível consultar as ordens do site: ${e.message}`);
    }
  }
  for (const s of sincronizar) {
    if (!STATUS_VALIDOS.includes(s.status)) fail(`Status inválido em "sincronizar" (${s.titulo}): ${s.status}`);
    if (!aplicar) {
      console.log(`  • ${s.titulo} -> ${s.status}`);
      continue;
    }
    const ordem = noSite.find((o) => String(o.title).trim().toLowerCase() === s.titulo.trim().toLowerCase());
    if (!ordem) {
      console.log(`  - não está no site, ignorada: ${s.titulo}`);
    } else if (ordem.status === s.status) {
      console.log(`  = já está "${s.status}": ${s.titulo}`);
    } else {
      try {
        runAgent(['status', ordem.id, s.status, s.nota || '']);
        console.log(`  ✓ [${ordem.id}] ${ordem.status} -> ${s.status}: ${s.titulo}`);
        atualizadas++;
      } catch (e) {
        console.log(`  ✖ falhou: ${s.titulo} — ${e.message}`);
        falhas++;
      }
    }
  }
}

if (aplicar) {
  console.log(`\nResumo: ${criadas} criada(s), ${puladas} já existia(m), ${atualizadas} atualizada(s), ${falhas} falha(s).\n`);
  process.exit(falhas ? 1 : 0);
} else {
  console.log('\nNada foi enviado. Rode novamente com --aplicar para registrar no site.\n');
}
