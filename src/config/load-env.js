/**
 * Carrega o ambiente (.env + cofre .env.enc) ANTES de qualquer outro módulo.
 *
 * Em ESM os `import` rodam na ordem em que aparecem, antes do corpo do server.js.
 * Por isso este arquivo é o PRIMEIRO import do server.js: módulos que leem
 * process.env ao serem importados (ex.: SMTP em src/shared/email.js, PORT e DB_PATH
 * em src/config/constants.js) passam a enxergar os valores do .env. Antes, o .env
 * só era carregado depois deles — o SMTP configurado no .env era ignorado.
 *
 * Se existe .env.enc e o cofre não abre (chave ausente/errada), o servidor NÃO
 * inicia: rodar com a configuração incompleta seria pior.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEnvironment } from '../shared/env-vault.js';

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

try {
  const r = loadEnvironment({ dir: ROOT_DIR });
  if (r.vault) console.log(`🔐 [ENV] Cofre .env.enc carregado (${r.vaultNames.length} variável(is) criptografada(s)).`);
  if (r.plainSecrets.length && process.env.NODE_ENV === 'production') {
    console.warn(
      `⚠️  [ENV] SEGREDOS EM TEXTO PURO no .env (${r.plainSecrets.join(', ')}). Migre para o cofre: node scripts/env-vault.js migrate`
    );
  }
} catch (e) {
  console.error(`❌ [ENV] ${e.message}`);
  if (process.env.NODE_ENV !== 'test') process.exit(1);
  throw e;
}
