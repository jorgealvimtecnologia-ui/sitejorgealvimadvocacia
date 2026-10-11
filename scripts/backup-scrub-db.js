#!/usr/bin/env node
/**
 * ==============================================================================
 * HIGIENIZA UMA CÓPIA DE BACKUP DO BANCO (remove segredos em texto puro)
 * ==============================================================================
 * O backup é levado a HD externo sem criptografia. Algumas telas gravam chaves de
 * API DENTRO do leads.db (ex.: chave do Asaas em system_settings, token da Meta em
 * meta_api_settings) e as sessões ativas guardam tokens de login. Nada disso deve
 * viajar no backup.
 *
 * Roda SEMPRE sobre a CÓPIA (nunca sobre o banco de produção):
 *   node scripts/backup-scrub-db.js <arquivo-da-copia.db>
 *
 * O que faz na cópia:
 *   - esvazia o valor de qualquer configuração cuja chave contenha api_key, token,
 *     secret ou password (tabelas system_settings e meta_api_settings);
 *   - apaga auth_sessions (tokens de login ativos) e magic_upload_tokens;
 *   - roda VACUUM para os valores antigos não ficarem recuperáveis em páginas livres.
 *
 * Consequência na restauração: o sistema volta sem as chaves de API e sem sessões
 * abertas. É preciso informar de novo as chaves (painel ou .env) e fazer login.
 * ==============================================================================
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

/** Tabelas de configuração (chave/valor) cujos valores secretos devem ser esvaziados. */
export const SETTINGS_TABLES = ['system_settings', 'meta_api_settings'];
/** Tabelas de credenciais efêmeras (sessões e links) que não devem ir ao backup. */
export const EPHEMERAL_TABLES = ['auth_sessions', 'magic_upload_tokens'];

const SECRET_KEY_SQL = `(lower(key) LIKE '%api_key%' OR lower(key) LIKE '%token%' OR lower(key) LIKE '%secret%' OR lower(key) LIKE '%password%')`;

/**
 * Higieniza o arquivo de banco informado. Retorna um resumo do que foi limpo.
 * Tabelas ausentes são ignoradas (o esquema varia conforme os módulos ativos).
 * @param {string} dbFile caminho da CÓPIA do banco
 * @returns {{ settingsCleared: number, ephemeralDeleted: number }}
 */
export function scrubBackupDb(dbFile) {
  const db = new DatabaseSync(dbFile);
  let settingsCleared = 0;
  let ephemeralDeleted = 0;
  try {
    // Sem WAL na cópia: tudo no arquivo principal, e o VACUUM final o compacta.
    db.exec('PRAGMA journal_mode = DELETE;');
    for (const table of SETTINGS_TABLES) {
      try {
        const r = db
          .prepare(`UPDATE ${table} SET value = '' WHERE ${SECRET_KEY_SQL} AND value IS NOT NULL AND value != ''`)
          .run();
        settingsCleared += Number(r.changes) || 0;
      } catch (e) {
        if (!/no such table/i.test(e.message)) throw e;
      }
    }
    for (const table of EPHEMERAL_TABLES) {
      try {
        const r = db.prepare(`DELETE FROM ${table}`).run();
        ephemeralDeleted += Number(r.changes) || 0;
      } catch (e) {
        if (!/no such table/i.test(e.message)) throw e;
      }
    }
    db.exec('VACUUM;');
  } finally {
    db.close();
  }
  return { settingsCleared, ephemeralDeleted };
}

/**
 * Conta quantos segredos ainda existem na cópia do banco (somente leitura de fato).
 * Usado para relatar o que há em backups ANTIGOS antes de limpá-los.
 * @param {string} dbFile caminho da cópia do banco
 * @returns {{ secrets: number, ephemeral: number }}
 */
export function countBackupDbSecrets(dbFile) {
  const db = new DatabaseSync(dbFile);
  let secrets = 0;
  let ephemeral = 0;
  try {
    for (const table of SETTINGS_TABLES) {
      try {
        secrets += db
          .prepare(`SELECT COUNT(*) c FROM ${table} WHERE ${SECRET_KEY_SQL} AND value IS NOT NULL AND value != ''`)
          .get().c;
      } catch (e) {
        if (!/no such table/i.test(e.message)) throw e;
      }
    }
    for (const table of EPHEMERAL_TABLES) {
      try {
        ephemeral += db.prepare(`SELECT COUNT(*) c FROM ${table}`).get().c;
      } catch (e) {
        if (!/no such table/i.test(e.message)) throw e;
      }
    }
  } finally {
    db.close();
  }
  return { secrets, ephemeral };
}

// Execução direta (usada por backup.sh).
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const file = process.argv[2];
  if (!file) {
    console.error('Uso: node scripts/backup-scrub-db.js <arquivo-da-copia.db>');
    process.exit(1);
  }
  try {
    const r = scrubBackupDb(path.resolve(file));
    console.log(
      `   ✓ Cópia higienizada: ${r.settingsCleared} segredo(s) de configuração esvaziado(s), ${r.ephemeralDeleted} sessão/link(s) temporário(s) removido(s).`
    );
  } catch (e) {
    console.error('❌ Falha ao higienizar a cópia do banco:', e.message);
    process.exit(1);
  }
}
