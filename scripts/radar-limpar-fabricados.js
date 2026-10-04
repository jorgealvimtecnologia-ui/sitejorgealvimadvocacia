#!/usr/bin/env node
/**
 * Remove os andamentos INVENTADOS que versões antigas do Radar Judicial gravaram em processos reais.
 * A sincronização automática usava a busca do Radar, que (sem resultado real) devolvia textos de enchimento
 * ("Distribuição da Ação Judicial", "Consulta Direcionada aos Tribunais"…); eles eram gravados como andamentos.
 *
 *   node scripts/radar-limpar-fabricados.js            # SÓ MOSTRA o que seria apagado (padrão)
 *   node scripts/radar-limpar-fabricados.js --aplicar  # apaga (faça um backup antes: bash backup.sh)
 *
 * Só apaga linhas que casam EXATAMENTE com os textos de enchimento conhecidos.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

/** Condição SQL dos andamentos de enchimento (título + descrição exatos, como o código antigo gravava). */
export const FABRICATED_MOVEMENTS_SQL = `(
  (title = 'Consulta Direcionada aos Tribunais')
  OR (title = 'Processo em Tramitação Regular' AND description = 'Autos em andamento com prazos vigentes.')
  OR (title = 'Distribuição da Ação Judicial' AND description = 'Autos distribuídos perante a comarca.')
  OR (title = 'Conclusos para Despacho Inicial' AND description = 'Aguardando manifestação judicial.')
  OR (title = 'Distribuição da Ação' AND description LIKE 'Processo distribuído para %')
)`;

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const aplicar = process.argv.includes('--aplicar');
  const db = new DatabaseSync(process.env.DB_PATH || path.join(ROOT, 'leads.db'));
  const rows = db.prepare(`SELECT lawsuit_id, title, COUNT(*) AS n FROM lawsuit_movements WHERE ${FABRICATED_MOVEMENTS_SQL} GROUP BY lawsuit_id, title ORDER BY lawsuit_id`).all();
  const total = rows.reduce((s, r) => s + r.n, 0);
  console.log(`\nAndamentos de enchimento encontrados: ${total} (em ${new Set(rows.map((r) => r.lawsuit_id)).size} processo(s))`);
  rows.slice(0, 40).forEach((r) => console.log(`  processo ${r.lawsuit_id}: ${r.n}x "${r.title}"`));
  if (!aplicar) {
    console.log('\nNada foi apagado. Para apagar: node scripts/radar-limpar-fabricados.js --aplicar (antes, faça um backup).\n');
  } else if (total) {
    const r = db.prepare(`DELETE FROM lawsuit_movements WHERE ${FABRICATED_MOVEMENTS_SQL}`).run();
    console.log(`\n✅ ${r.changes} andamento(s) inventado(s) apagado(s).\n`);
  } else {
    console.log('\nNada a apagar.\n');
  }
  db.close();
}
