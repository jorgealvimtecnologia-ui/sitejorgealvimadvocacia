'use strict';

/**
 * Cifragem simétrica AES-256-GCM para proteger os tokens OAuth do Mercado Pago
 * em repouso no SQLite. GCM é autenticado (detecta adulteração).
 *
 * Formato armazenado (string): base64(iv).base64(authTag).base64(ciphertext)
 *
 * IMPORTANTE: se a TOKEN_ENCRYPTION_KEY for perdida/trocada, todos os tokens
 * cifrados tornam-se irrecuperáveis (os autores precisarão reconectar o MP).
 * Guarde-a com o mesmo cuidado de uma chave de produção.
 */

const crypto = require('crypto');
const config = require('../config');

const KEY = Buffer.from(config.crypto.tokenKeyHex, 'hex');
if (KEY.length !== 32) {
  throw new Error('TOKEN_ENCRYPTION_KEY deve ter 32 bytes (64 chars hex).');
}

const ALGO = 'aes-256-gcm';

function encrypt(plaintext) {
  if (plaintext == null) return null;
  const iv = crypto.randomBytes(12); // 96 bits é o recomendado para GCM
  const cipher = crypto.createCipheriv(ALGO, KEY, iv);
  const enc = Buffer.concat([cipher.update(String(plaintext), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv.toString('base64'), tag.toString('base64'), enc.toString('base64')].join('.');
}

function decrypt(stored) {
  if (stored == null) return null;
  const [ivB64, tagB64, dataB64] = String(stored).split('.');
  if (!ivB64 || !tagB64 || !dataB64) throw new Error('Formato de token cifrado inválido.');
  const decipher = crypto.createDecipheriv(ALGO, KEY, Buffer.from(ivB64, 'base64'));
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
  const dec = Buffer.concat([
    decipher.update(Buffer.from(dataB64, 'base64')),
    decipher.final(),
  ]);
  return dec.toString('utf8');
}

module.exports = { encrypt, decrypt };
