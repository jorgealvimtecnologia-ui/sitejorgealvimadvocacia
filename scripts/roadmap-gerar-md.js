#!/usr/bin/env node
/**
 * Regenera a seção 11 de ROADMAP_MODIFICACOES_HOJE_E_FUTURO.md a partir da fonte única
 * (docs/roadmap/ordens-auditoria-2026-10-03.json). Mantém o bloco "Concluídas" que já está no arquivo.
 *   node scripts/roadmap-gerar-md.js
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MD = path.join(ROOT, 'ROADMAP_MODIFICACOES_HOJE_E_FUTURO.md');
const JSON_FILE = path.join(ROOT, 'docs/roadmap/ordens-auditoria-2026-10-03.json');
const NOME = { P0: 'P0 — Urgente (sobras)', P1: 'P1 — Alto', P2: 'P2 — Normal', P3: 'P3 — Baixo' };

export function renderSection(ordens, concluidas, hoje = new Date()) {
  const por = Object.fromEntries(['P0', 'P1', 'P2', 'P3'].map((k) => [k, ordens.filter((o) => o.prioridade === k)]));
  const data = hoje.toLocaleDateString('pt-BR');
  let out = '## 🔎 11. Ordens da Auditoria de 03/10/2026 — só o que ainda NÃO foi feito\n\n';
  out += `Atualizado em ${data}. **${ordens.length} ordens abertas**: ${por.P0.length} do P0 (o que sobrou), ${por.P1.length} do P1, ${por.P2.length} do P2 e ${por.P3.length} do P3.\n\n`;
  out += '**Fonte única das ordens:** [`docs/roadmap/ordens-auditoria-2026-10-03.json`](docs/roadmap/ordens-auditoria-2026-10-03.json). Esta seção é gerada por `node scripts/roadmap-gerar-md.js`; o site recebe as mesmas ordens por `npm run roadmap:register-batch -- --aplicar`.\n\n';
  out += '> **Status de registro:** neste repositório ✅. No Roadmap Vivo do site ⏳ **pendente** (AUD-32): exige a chave do agente (`ROADMAP_AGENT_KEY`) no ambiente; sem `--aplicar` o comando só simula, e rodar de novo não duplica.\n\n';
  out += concluidas;
  for (const k of ['P0', 'P1', 'P2', 'P3']) {
    out += `### ${NOME[k]} (${por[k].length})\n\n`;
    for (const o of por[k]) {
      out += `- **${o.ref} — ${o.titulo}**\n`;
      if (o.estado) out += `  - *Estado:* ${o.estado}\n`;
      out += `  - *Situação:* ${o.descricao}\n  - *Pronto quando:* ${o.criterios}\n`;
    }
    out += '\n';
  }
  return out;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { ordens } = JSON.parse(fs.readFileSync(JSON_FILE, 'utf8'));
  const md = fs.readFileSync(MD, 'utf8');
  const i = md.indexOf('## 🔎 11. Ordens da Auditoria de 03/10/2026');
  const j = md.indexOf('### Observação sobre o backlog da seção 8');
  if (i < 0 || j < 0) throw new Error('Marcadores da seção 11 não encontrados no ROADMAP_MODIFICACOES_HOJE_E_FUTURO.md');
  const sec = md.slice(i, j);
  const a = sec.indexOf('### ✅ Concluídas');
  const b = sec.indexOf('### P0');
  const concluidas = a >= 0 && b > a ? sec.slice(a, b) : '';
  fs.writeFileSync(MD, md.slice(0, i) + renderSection(ordens, concluidas) + md.slice(j));
  console.log(`✅ Seção 11 regenerada: ${ordens.length} ordens.`);
}
