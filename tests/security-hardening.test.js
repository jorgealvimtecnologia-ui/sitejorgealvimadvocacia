/**
 * Regressão de segurança (itens 4 e 5 do hardening):
 * - política de senha: mínimo 8, sem teto baixo, complexidade;
 * - hash forte PBKDF2 210k e compatibilidade com formatos legados no login.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { validatePassword, PASSWORD_MIN, PASSWORD_MAX } from '../src/shared/password-policy.js';
import { hashPassword, verifyPassword, isStrongHash } from '../src/shared/password-crypto.js';

test('política: mínimo é 8 e teto não bloqueia senhas fortes', () => {
  assert.equal(PASSWORD_MIN, 8);
  assert.ok(PASSWORD_MAX >= 64);
});

test('política: rejeita senha curta (< 8)', () => {
  assert.equal(validatePassword('Ab1@').ok, false);       // 4 chars
  assert.equal(validatePassword('Abc123!').ok, false);    // 7 chars
});

test('política: rejeita senha longa demais (> 64)', () => {
  assert.equal(validatePassword('a'.repeat(65)).ok, false);
});

test('política: aceita senha de 8+ caracteres (Mivl@100)', () => {
  const r = validatePassword('Mivl@100');
  assert.equal(r.ok, true, r.error);
});

test('política: aceita passphrase longa (sem teto artificial)', () => {
  assert.equal(validatePassword('Cavalo-Bateria-Grampo-2026!').ok, true);
});

test('hash: round-trip forte e isStrongHash', () => {
  const { hash, salt } = hashPassword('Mivl@100');
  assert.equal(verifyPassword('Mivl@100', hash, salt), true);
  assert.equal(verifyPassword('errada', hash, salt), false);
  assert.equal(isStrongHash('Mivl@100', hash, salt), true);
});

test('login aceita formatos legados (para migração transparente)', () => {
  // PBKDF2 10k (formato antigo) deve ser aceito no login...
  const salt = 'abc123';
  const legacy10k = crypto.pbkdf2Sync('velha', salt, 10000, 64, 'sha512').toString('hex');
  assert.equal(verifyPassword('velha', legacy10k, salt), true);
  // ...mas NÃO deve ser considerado "forte" (será reescrito no login).
  assert.equal(isStrongHash('velha', legacy10k, salt), false);
  // SHA-256 sem sal (colaboradores antigos)
  const legacySha = crypto.createHash('sha256').update('velha').digest('hex');
  assert.equal(verifyPassword('velha', legacySha, null), true);
});
