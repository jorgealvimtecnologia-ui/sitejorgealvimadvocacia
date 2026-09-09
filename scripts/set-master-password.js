/**
 * Define (ou rotaciona) a senha do Usuário Mestre (USR-MASTER-01), gravando um
 * hash forte PBKDF2-SHA512. A senha NUNCA fica no código nem no git — vem por
 * argumento de linha de comando ou pela variável de ambiente MASTER_PASSWORD.
 *
 * Uso:
 *   node scripts/set-master-password.js "NovaSenhaForte"
 *   MASTER_PASSWORD="NovaSenhaForte" node scripts/set-master-password.js
 *
 * Como o boot NÃO reescreve mais a senha do mestre, a troca feita aqui PERSISTE
 * entre reinícios. Para aplicar em produção, rode este mesmo comando no servidor.
 */
import { db } from '../src/config/db.js';
import { hashPassword } from '../src/shared/password-crypto.js';
import { validatePassword } from '../src/shared/password-policy.js';

const pw = (process.argv[2] || process.env.MASTER_PASSWORD || '').trim();
if (!pw) {
  console.error('Uso: node scripts/set-master-password.js "<senha>"  (ou via MASTER_PASSWORD=...)');
  process.exit(1);
}

const pol = validatePassword(pw);
if (!pol.ok) {
  console.error('❌ Senha inválida:', pol.error);
  process.exit(1);
}

const master = db.prepare(
  `SELECT id, username FROM users WHERE id = 'USR-MASTER-01' OR username = 'jorgealvimtecnologia'`
).get();
if (!master) {
  console.error('❌ Usuário mestre não encontrado no banco.');
  process.exit(1);
}

const { hash, salt } = hashPassword(pw);
db.prepare(`UPDATE users SET password_hash = ?, salt = ?, role = 'master' WHERE id = ?`).run(hash, salt, master.id);
console.log(`✅ Senha do Mestre (${master.username}) atualizada com hash forte. Faça login com a nova senha.`);
