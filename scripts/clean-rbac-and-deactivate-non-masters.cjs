#!/usr/bin/env node
/**
 * scripts/clean-rbac-and-deactivate-non-masters.cjs
 * 1. Remove clientes da tabela de permissões internas (access_permissions)
 * 2. Desativa (is_active = 0) todos os usuários colaboradores/fictícios, mantendo exclusivamente o Mestre ativo
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

db.exec('BEGIN');
try {
  // 1. Remove clientes da matriz de controle de acesso interna
  const delClients = db.prepare(`DELETE FROM access_permissions WHERE role_template = 'cliente' OR user_type = 'cliente'`).run();

  // 2. Desativa todos os usuários que não são o Mestre
  const deactOthers = db.prepare(`
    UPDATE access_permissions 
    SET is_active = 0, updated_at = datetime('now')
    WHERE role_template != 'master' AND user_id != 'USR-MASTER-01'
  `).run();

  // 3. Garante o Mestre ativo
  const actMaster = db.prepare(`
    UPDATE access_permissions 
    SET is_active = 1, updated_at = datetime('now')
    WHERE role_template = 'master' OR user_id = 'USR-MASTER-01'
  `).run();

  db.exec('COMMIT');

  const remaining = db.prepare(`SELECT user_id, user_name, role_template, is_active FROM access_permissions`).all();
  console.log('✅ Matriz RBAC higienizada com sucesso!');
  console.log(`🗑️ Clientes removidos da matriz interna: ${delClients.changes}`);
  console.log(`🔒 Usuários/Colaboradores desativados: ${deactOthers.changes}`);
  console.log('📋 Lista final de operadores na matriz de acessos:');
  console.table(remaining.map(r => ({
    ID: r.user_id,
    Nome: r.user_name,
    Função: r.role_template,
    Status: r.is_active === 1 ? '🟢 ATIVO (Mestre)' : '🔴 DESATIVADO'
  })));
} catch (err) {
  db.exec('ROLLBACK');
  console.error('❌ Erro ao atualizar matriz RBAC:', err);
  process.exit(1);
}
