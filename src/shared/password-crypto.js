import crypto from 'node:crypto';

/**
 * Criptografia de senha (PBKDF2-SHA512 210k, OWASP). Fonte única forte,
 * compartilhada pelo server.js e módulos (ex.: HR employee login).
 */
// Funções Auxiliares de Criptografia de Senha
// PBKDF2-HMAC-SHA512 com sal por usuário. 210k iterações (padrão OWASP atual).
const PBKDF2_ITER = 210000;         // formato forte atual
const PBKDF2_ITER_LEGACY = 10000;   // hashes antigos — aceitos no login e migrados na hora
export function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.pbkdf2Sync(password, salt, PBKDF2_ITER, 64, 'sha512').toString('hex');
  return { hash, salt };
}

// Verifica a senha aceitando formatos legados (PBKDF2 10k e SHA-256 sem sal),
// para não travar ninguém. O upgrade ao formato forte é feito no login (ver isStrongHash).
export function verifyPassword(password, storedHash, salt) {
  if (!storedHash || password == null) return false;
  if (salt) {
    if (crypto.pbkdf2Sync(password, salt, PBKDF2_ITER, 64, 'sha512').toString('hex') === storedHash) return true;
    if (crypto.pbkdf2Sync(password, salt, PBKDF2_ITER_LEGACY, 64, 'sha512').toString('hex') === storedHash) return true;
  }
  // Legado: SHA-256 sem sal (colaboradores / versões antigas)
  if (crypto.createHash('sha256').update(password).digest('hex') === storedHash) return true;
  return false;
}

// True somente quando o hash já está no formato forte atual. Usado no login para
// decidir se é preciso reescrever a senha (migração transparente de formato).
export function isStrongHash(password, storedHash, salt) {
  return !!salt && crypto.pbkdf2Sync(password, salt, PBKDF2_ITER, 64, 'sha512').toString('hex') === storedHash;
}
