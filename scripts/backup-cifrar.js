#!/usr/bin/env node
/**
 * Backup externo CIFRADO (AUD-12) — cifra o pacote com uma chave PÚBLICA; só quem tem a chave PRIVADA abre.
 *
 *  Por que chave pública: o servidor guarda só a parte "de trancar". Se o servidor for invadido, quem o invadir
 *  consegue criar cadeados, mas NÃO consegue abrir os backups já feitos. A chave privada fica com o Dr. Jorge
 *  (gerenciador de senhas + cópia impressa), nunca no servidor.
 *
 *  Formato (.enc): "JAWBKP1\0"(8) | tamanho da chave embrulhada (2) | chave AES embrulhada com RSA-OAEP-SHA256 |
 *                  iv(12) | texto cifrado (AES-256-GCM) | etiqueta(16)
 *
 *  Uso:
 *    node scripts/backup-cifrar.js gerar-chaves <pasta>             cria publica.pem e PRIVADA.pem (RSA 4096)
 *    node scripts/backup-cifrar.js cifrar <pacote.tar.gz> [--pub=/etc/advocacia/backup-public.pem]
 *    node scripts/backup-cifrar.js verificar <pacote.tar.gz.enc> --priv=PRIVADA.pem      (no seu notebook)
 *    node scripts/backup-cifrar.js decifrar  <pacote.tar.gz.enc> --priv=PRIVADA.pem [--saida=arquivo]
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';

export const MAGIC = Buffer.from('JAWBKP1\0', 'latin1');
const IV_LEN = 12;
const TAG_LEN = 16;
export const DEFAULT_PUB = '/etc/advocacia/backup-public.pem';

export function generateKeyPair(dir, bits = 4096) {
  fs.mkdirSync(dir, { recursive: true });
  const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: bits,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });
  const pub = path.join(dir, 'backup-public.pem');
  const priv = path.join(dir, 'BACKUP-PRIVADA-NAO-COLOCAR-NO-SERVIDOR.pem');
  fs.writeFileSync(pub, publicKey, { mode: 0o644 });
  fs.writeFileSync(priv, privateKey, { mode: 0o600 });
  return { pub, priv };
}

/** Cifra `inputPath` -> `${inputPath}.enc` (+ .sha256 do arquivo cifrado). */
export async function encryptPackage(inputPath, pubPem) {
  const aesKey = crypto.randomBytes(32);
  const iv = crypto.randomBytes(IV_LEN);
  const wrapped = crypto.publicEncrypt(
    { key: pubPem, padding: crypto.constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha256' },
    aesKey
  );
  const header = Buffer.alloc(MAGIC.length + 2);
  MAGIC.copy(header, 0);
  header.writeUInt16BE(wrapped.length, MAGIC.length);
  const cipher = crypto.createCipheriv('aes-256-gcm', aesKey, iv);
  let started = false;
  const t = new Transform({
    transform(chunk, _e, cb) {
      if (!started) { started = true; this.push(Buffer.concat([header, wrapped, iv])); }
      this.push(cipher.update(chunk)); cb();
    },
    flush(cb) {
      if (!started) { this.push(Buffer.concat([header, wrapped, iv])); }
      this.push(cipher.final()); this.push(cipher.getAuthTag()); cb();
    },
  });
  const out = `${inputPath}.enc`;
  const tmp = `${out}.parcial`;
  try {
    await pipeline(fs.createReadStream(inputPath), t, fs.createWriteStream(tmp, { mode: 0o600 }));
    fs.renameSync(tmp, out);
  } catch (e) {
    try { fs.unlinkSync(tmp); } catch { /* nada */ }
    throw e;
  }
  const hash = await sha256File(out);
  fs.writeFileSync(`${out}.sha256`, `${hash}  ${path.basename(out)}\n`);
  return { out, sha256: hash };
}

function readHeader(encPath, privPem) {
  const size = fs.statSync(encPath).size;
  const fd = fs.openSync(encPath, 'r');
  try {
    const h = Buffer.alloc(MAGIC.length + 2);
    fs.readSync(fd, h, 0, h.length, 0);
    if (!h.subarray(0, MAGIC.length).equals(MAGIC)) throw new Error('Arquivo não é um backup cifrado deste sistema.');
    const wlen = h.readUInt16BE(MAGIC.length);
    const wrapped = Buffer.alloc(wlen);
    fs.readSync(fd, wrapped, 0, wlen, h.length);
    const iv = Buffer.alloc(IV_LEN);
    fs.readSync(fd, iv, 0, IV_LEN, h.length + wlen);
    const tag = Buffer.alloc(TAG_LEN);
    fs.readSync(fd, tag, 0, TAG_LEN, size - TAG_LEN);
    const aesKey = crypto.privateDecrypt(
      { key: privPem, padding: crypto.constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha256' },
      wrapped
    );
    return { start: h.length + wlen + IV_LEN, end: size - TAG_LEN - 1, iv, tag, aesKey };
  } finally {
    fs.closeSync(fd);
  }
}

/** Decifra para `outPath` (ou só confere, se outPath for null). Falha se a etiqueta GCM não bater. */
export async function decryptPackage(encPath, privPem, outPath = null) {
  const { start, end, iv, tag, aesKey } = readHeader(encPath, privPem);
  const decipher = crypto.createDecipheriv('aes-256-gcm', aesKey, iv);
  decipher.setAuthTag(tag);
  const hash = crypto.createHash('sha256');
  let bytes = 0;
  const probe = new Transform({ transform(c, _e, cb) { hash.update(c); bytes += c.length; cb(null, outPath ? c : undefined); } });
  const sink = outPath ? fs.createWriteStream(outPath, { mode: 0o600 }) : new Transform({ transform(_c, _e, cb) { cb(); } });
  if (end < start) { decipher.end(); }
  const src = end < start ? decipher : fs.createReadStream(encPath, { start, end }).pipe(decipher);
  await pipeline(src, probe, sink);
  return { bytes, sha256: hash.digest('hex') };
}

export function sha256File(p) {
  return new Promise((resolve, reject) => {
    const h = crypto.createHash('sha256');
    fs.createReadStream(p).on('data', (c) => h.update(c)).on('end', () => resolve(h.digest('hex'))).on('error', reject);
  });
}

async function main() {
  const [cmd, arg, ...rest] = process.argv.slice(2);
  const opt = (n) => (rest.find((r) => r.startsWith(`--${n}=`)) || '').slice(n.length + 3);
  try {
    if (cmd === 'gerar-chaves') {
      const { pub, priv } = generateKeyPair(arg || '.');
      console.log(`\nChave PÚBLICA (vai para o servidor): ${pub}`);
      console.log(`Chave PRIVADA (guarde no gerenciador de senhas e imprima uma cópia; NUNCA no servidor): ${priv}\n`);
      return 0;
    }
    if (cmd === 'cifrar') {
      const pubFile = opt('pub') || DEFAULT_PUB;
      if (!arg || !fs.existsSync(arg)) throw new Error('Informe o pacote .tar.gz existente.');
      if (!fs.existsSync(pubFile)) throw new Error(`Chave pública não encontrada em ${pubFile}.`);
      const { out, sha256 } = await encryptPackage(arg, fs.readFileSync(pubFile, 'utf8'));
      console.log(`✓ Cifrado: ${out}\n  SHA-256: ${sha256}`);
      return 0;
    }
    if (cmd === 'verificar' || cmd === 'decifrar') {
      const priv = opt('priv');
      if (!arg || !priv) throw new Error('Uso: ... <arquivo.enc> --priv=ARQUIVO_PRIVADA.pem');
      const sidecar = `${arg}.sha256`;
      if (fs.existsSync(sidecar)) {
        const esperado = fs.readFileSync(sidecar, 'utf8').split(/\s+/)[0];
        if (esperado !== (await sha256File(arg))) throw new Error('O arquivo cifrado NÃO confere com o SHA-256 registrado (corrompido ou adulterado).');
      }
      const r = await decryptPackage(arg, fs.readFileSync(priv, 'utf8'), cmd === 'decifrar' ? (opt('saida') || arg.replace(/\.enc$/, '')) : null);
      console.log(`✓ ${cmd === 'verificar' ? 'Backup íntegro e legível com a sua chave privada' : 'Decifrado'}: ${r.bytes} bytes, SHA-256 ${r.sha256}`);
      return 0;
    }
    console.error('Comandos: gerar-chaves <pasta> | cifrar <pacote> | verificar <enc> --priv= | decifrar <enc> --priv= [--saida=]');
    return 1;
  } catch (e) {
    console.error(`✗ ${e.message}`);
    return 1;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exit(await main());
}
