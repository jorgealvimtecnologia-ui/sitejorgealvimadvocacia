#!/usr/bin/env node
/**
 * scripts/clean-and-import-gmail-emails.cjs
 * 1. Remove os 485 registros corrompidos da importação incorreta de e-mails
 * 2. Faz o parsing correto de e-mails reais do Google Contacts (coluna E-mail 1 - Value)
 * 3. Faz o matching seguro (100% de certeza por nome único) nos clientes existentes sem e-mail
 * 4. Insere os demais e-mails reais como cadastros próprios sem inventar telefone fictício
 */
const { DatabaseSync } = require('node:sqlite');
const fs = require('node:fs');
const path = require('node:path');

const dbPath = process.argv[2] || '/var/www/advocacia/leads.db';
const csvFiles = process.argv.slice(3);

if (!fs.existsSync(dbPath)) {
  console.error(`❌ Banco de dados não encontrado em: ${dbPath}`);
  process.exit(1);
}

const db = new DatabaseSync(dbPath);

function parseCSVLine(text) {
  const result = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      if (inQuotes && text[i+1] === '"') { cur += '"'; i++; }
      else { inQuotes = !inQuotes; }
    } else if (c === ',' && !inQuotes) {
      result.push(cur.trim());
      cur = '';
    } else {
      cur += c;
    }
  }
  result.push(cur.trim());
  return result;
}

const normalize = (s) => (s || '')
  .toLowerCase()
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/[^a-z0-9]/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

db.exec('BEGIN');
try {
  console.log('🔄 1. Removendo registros corrompidos da importação anterior...');
  const delRes = db.prepare(`
    DELETE FROM clients 
    WHERE id >= 'JA-CLI-2026-3121' OR email LIKE '*%'
  `).run();
  console.log(`🗑️ Registros corrompidos removidos: ${delRes.changes}`);

  // Limpa RBAC caso algum tenha entrado
  const delRbac = db.prepare(`
    DELETE FROM access_permissions 
    WHERE role_template = 'cliente' OR user_type = 'cliente' OR user_id >= 'JA-CLI-2026-3121'
  `).run();
  console.log(`🔒 Registros removidos da matriz de permissões: ${delRbac.changes}`);

  // 2. Carrega todos os clientes legítimos da base
  const existingClients = db.prepare(`
    SELECT id, full_name, email, phone FROM clients WHERE deleted_at IS NULL
  `).all();
  console.log(`📋 Clientes base legítimos no sistema: ${existingClients.length}`);

  // Mapa de nomes únicos para match seguro
  const nameMap = new Map();
  for (const c of existingClients) {
    const norm = normalize(c.full_name);
    if (norm.length >= 4) {
      if (!nameMap.has(norm)) nameMap.set(norm, []);
      nameMap.get(norm).push(c);
    }
  }

  // Mapa de emails existentes para evitar duplicidade
  const existingEmails = new Set();
  for (const c of existingClients) {
    if (c.email && c.email.includes('@')) {
      existingEmails.add(c.email.trim().toLowerCase());
    }
  }

  // 3. Processa arquivos CSV de e-mails
  const defaultCsvPaths = [
    '/home/jorgealvim/Downloads/contacts(1).csv',
    '/home/jorgealvim/Downloads/contacts(4).csv',
    '/tmp/contacts(1).csv',
    '/tmp/contacts(4).csv'
  ];

  const targetCsvs = csvFiles.length > 0 ? csvFiles : defaultCsvPaths.filter(p => fs.existsSync(p));
  console.log(`📂 Arquivos CSV a processar:`, targetCsvs);

  let enrichedCount = 0;
  let newCreatedCount = 0;
  let skippedCount = 0;

  // Calculador de próximo ID
  let currentMaxId = 0;
  const allIds = db.prepare(`SELECT id FROM clients`).all();
  allIds.forEach(r => {
    const m = (r.id || '').match(/\d+$/);
    if (m) {
      const n = parseInt(m[0], 10);
      if (n > currentMaxId) currentMaxId = n;
    }
  });

  const nextClientId = () => {
    currentMaxId++;
    return `JA-CLI-2026-${String(currentMaxId).padStart(4, '0')}`;
  };

  const updateClientEmail = db.prepare(`UPDATE clients SET email = ?, updated_at = ? WHERE id = ?`);
  const insertClient = db.prepare(`
    INSERT INTO clients (
      id, client_type, full_name, email, phone, contract_status, registration_status, social_media, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, 'Ativo', 'pendente', 'Importado via Gmail', ?, ?)
  `);

  const nowIso = new Date().toISOString();

  for (const csvPath of targetCsvs) {
    if (!fs.existsSync(csvPath)) continue;
    const content = fs.readFileSync(csvPath, 'utf8');
    const lines = content.split(/\r?\n/).filter(Boolean);
    if (lines.length < 2) continue;

    const headers = parseCSVLine(lines[0]);
    const lowerHeaders = headers.map(h => h.toLowerCase());

    // Identifica coluna de email real
    let emailIdx = lowerHeaders.findIndex(h => h.includes('e-mail 1 - value') || h.includes('email 1 - value'));
    if (emailIdx === -1) {
      emailIdx = lowerHeaders.findIndex(h => (h.includes('email') || h.includes('e-mail')) && !h.includes('label') && !h.includes('type'));
    }

    // Identifica colunas de nome
    const fnIdx = lowerHeaders.indexOf('first name');
    const mnIdx = lowerHeaders.indexOf('middle name');
    const lnIdx = lowerHeaders.indexOf('last name');
    const nameIdx = lowerHeaders.findIndex(h => h === 'name' || h === 'nome' || h === 'given name');

    for (let i = 1; i < lines.length; i++) {
      const row = parseCSVLine(lines[i]);
      if (!row || !row.length) continue;

      let email = '';
      if (emailIdx !== -1 && row[emailIdx]) {
        email = row[emailIdx].replace(/['"]/g, '').trim().toLowerCase();
      } else {
        // Fallback: procura campo com @
        for (const col of row) {
          if (col && col.includes('@') && col.includes('.')) {
            email = col.replace(/['"]/g, '').trim().toLowerCase();
            break;
          }
        }
      }

      if (!email || !email.includes('@') || email.startsWith('*')) {
        skippedCount++;
        continue;
      }

      if (existingEmails.has(email)) {
        skippedCount++;
        continue;
      }

      // Nome
      let fullName = '';
      if (fnIdx !== -1) {
        fullName = [row[fnIdx], mnIdx !== -1 ? row[mnIdx] : '', lnIdx !== -1 ? row[lnIdx] : '']
          .filter(Boolean).map(s => s.trim()).join(' ');
      }
      if (!fullName && nameIdx !== -1) {
        fullName = (row[nameIdx] || '').trim();
      }
      if (!fullName) {
        fullName = email.split('@')[0];
      }

      const normName = normalize(fullName);

      // Match Seguro: se existir exatamente 1 cliente com o mesmo nome e sem email
      if (normName && normName.length >= 4 && nameMap.has(normName)) {
        const matches = nameMap.get(normName);
        if (matches.length === 1 && (!matches[0].email || matches[0].email.trim() === '')) {
          updateClientEmail.run(email, nowIso, matches[0].id);
          existingEmails.add(email);
          matches[0].email = email;
          enrichedCount++;
          continue;
        }
      }

      // Se não deu match exato e seguro, insere como novo cadastro de e-mail limpo
      const newId = nextClientId();
      insertClient.run(newId, 'PF', fullName, email, '', nowIso, nowIso);
      existingEmails.add(email);
      newCreatedCount++;
    }
  }

  db.exec('COMMIT');

  const totalFinal = db.prepare(`SELECT COUNT(*) as c FROM clients WHERE deleted_at IS NULL`).get().c;
  const emailsValidos = db.prepare(`SELECT COUNT(*) as c FROM clients WHERE email IS NOT NULL AND email LIKE '%@%'`).get().c;
  const phonesValidos = db.prepare(`SELECT COUNT(*) as c FROM clients WHERE phone IS NOT NULL AND TRIM(phone) != ''`).get().c;

  console.log('\n======================================================');
  console.log('✅ OPERAÇÃO DE IMPORTAÇÃO E MESCLAGEM CONCLUÍDA!');
  console.log('======================================================');
  console.log(`🗑️ Registros corrompidos removidos: ${delRes.changes}`);
  console.log(`🔗 Clientes existentes enriquecidos com e-mail: ${enrichedCount}`);
  console.log(`✨ Novos contatos legítimos criados com e-mail: ${newCreatedCount}`);
  console.log(`⏩ Contatos duplicados ou inválidos ignorados: ${skippedCount}`);
  console.log('------------------------------------------------------');
  console.log(`👥 Total Geral de Clientes na Base: ${totalFinal}`);
  console.log(`📱 Clientes com Telefone/WhatsApp: ${phonesValidos}`);
  console.log(`✉️ Clientes com E-mail Válido: ${emailsValidos}`);
  console.log('======================================================\n');

} catch (err) {
  db.exec('ROLLBACK');
  console.error('❌ Erro na operação:', err);
  process.exit(1);
}
