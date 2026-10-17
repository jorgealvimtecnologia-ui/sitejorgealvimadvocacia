#!/usr/bin/env node
/**
 * scripts/classify-existing-pj-clients.js
 * Classifica retroativamente contatos existentes que são Pessoas Jurídicas (PJ)
 * com base no nome comercial, organização, CNPJ ou palavras-chave empresariais.
 */
const { DatabaseSync } = require('node:sqlite');
const path = require('node:path');
const fs = require('node:fs');

const dbPath = process.argv[2] || path.resolve(__dirname, '../leads.db');
if (!fs.existsSync(dbPath)) {
  console.error(`❌ Banco de dados não encontrado em: ${dbPath}`);
  process.exit(1);
}

const db = new DatabaseSync(dbPath);

const PJ_PATTERNS = [
  /\b(ltda|eireli|s[\.\/\s]?a|me|epp|s\/s)\b/i,
  /\b(auto\s*pe[cç]as?|posto|supermercado|farm[aá]cia|drogaria|oficina|restaurante|pizzaria|padaria|hotel|pousada|lanchonete|buffet)\b/i,
  /\b(cl[ií]nica|hospital|laborat[oó]rio|advocacia|advogados|contabilidade|assessoria|consultoria|est[uú]dio|pet\s*shop|veterin[aá]ria)\b/i,
  /\b(distribuidora|com[eé]rcio|ind[uú]stria|servi[cç]os|transportes|log[ií]stica|engenharia|construtora|incorporadora|imobili[aá]ria|corretora)\b/i,
  /\b([oó]tica|gr[aá]fica|papelaria|vidra[cç]aria|marmoraria|serralheria|metal[uú]rgica|madeireira|m[oó]veis|ve[ií]culos|concession[aá]ria|lava\s*(jato|r[aá]pido))\b/i,
  /\b(associa[cç][aã]o|instituto|funda[cç][aã]o|cooperativa|coop|sindicato|igreja|prefeitura|c[aâ]mara|secretaria|tribunal|cart[oó]rio|banco|seguros)\b/i,
  /\b(academia|escola|col[eé]gio|faculdade|universidade|tecnologia|sistemas|inform[aá]tica)\b/i
];

function isPJ(name, profession, cnpj) {
  if (cnpj && String(cnpj).trim()) return true;
  const target = `${name || ''} ${profession || ''}`.toLowerCase();
  for (const pat of PJ_PATTERNS) {
    if (pat.test(target)) return true;
  }
  return false;
}

const clients = db.prepare('SELECT id, full_name, profession, cnpj, client_type FROM clients').all();
const updateStmt = db.prepare("UPDATE clients SET client_type = 'PJ', updated_at = datetime('now') WHERE id = ?");

let updatedCount = 0;
let alreadyPJ = 0;
let keptPF = 0;

db.exec('BEGIN');
try {
  clients.forEach(c => {
    if (c.client_type === 'PJ') {
      alreadyPJ++;
      return;
    }
    if (isPJ(c.full_name, c.profession, c.cnpj)) {
      updateStmt.run(c.id);
      updatedCount++;
    } else {
      keptPF++;
    }
  });
  db.exec('COMMIT');
} catch (err) {
  db.exec('ROLLBACK');
  console.error('❌ Erro durante atualização:', err);
  process.exit(1);
}

const total = clients.length;
const totalPJ = alreadyPJ + updatedCount;
console.log('✅ Classificação de Pessoas Jurídicas concluída com sucesso!');
console.log(`📊 Total de clientes analisados: ${total}`);
console.log(`🏢 Contatos reclassificados como PJ: ${updatedCount}`);
console.log(`🏢 Total de PJ agora no banco: ${totalPJ} (${total > 0 ? ((totalPJ / total) * 100).toFixed(1) : 0}%)`);
console.log(`👤 Total de PF agora no banco: ${keptPF} (${total > 0 ? ((keptPF / total) * 100).toFixed(1) : 0}%)`);
