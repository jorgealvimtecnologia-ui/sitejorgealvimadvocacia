/**
 * Cofre de arquivos (AUD-12): criptografia de documentos em repouso (AES-256-GCM, em fluxo).
 *
 * Formato do arquivo cifrado:  "JAWENC1\0"(8) | iv(12) | texto cifrado ... | etiqueta GCM(16)
 *  - A chave (32 bytes, base64) vem de DOC_ENC_KEY, guardada NO COFRE do servidor (.env.enc), nunca em texto puro.
 *  - Sem DOC_ENC_KEY o recurso fica DESLIGADO: arquivos novos entram em texto puro e nada quebra.
 *  - Arquivos antigos (texto puro) continuam sendo lidos normalmente: a leitura detecta o cabeçalho.
 *  - Arquivo cifrado SEM chave configurada nunca é entregue (erro claro), para não servir lixo ao cliente.
 *  - Perder a chave = perder os documentos cifrados. Guarde uma cópia da DOC_ENC_KEY no gerenciador de senhas.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import { Transform, pipeline } from 'node:stream';
import { promisify } from 'node:util';

const pipe = promisify(pipeline);
export const MAGIC = Buffer.from('JAWENC1\0', 'latin1'); // 8 bytes
const IV_LEN = 12;
const TAG_LEN = 16;
export const HEADER_LEN = MAGIC.length + IV_LEN;

export class VaultKeyMissingError extends Error {
  constructor() {
    super('Arquivo protegido, mas a chave de criptografia (DOC_ENC_KEY) não está configurada neste servidor.');
    this.code = 'VAULT_KEY_MISSING';
  }
}

/** Chave configurada (Buffer de 32 bytes) ou null quando o recurso está desligado. */
export function getDocKey(env = process.env) {
  const raw = String(env.DOC_ENC_KEY || '').trim();
  if (!raw) return null;
  const key = Buffer.from(raw, 'base64');
  if (key.length !== 32) throw new Error('DOC_ENC_KEY inválida: precisa ter 32 bytes em base64 (gere com: node scripts/docs-encrypt-all.js gerar-chave).');
  return key;
}

export function generateDocKey() {
  return crypto.randomBytes(32).toString('base64');
}

export function isEncryptionEnabled(env = process.env) {
  return !!getDocKey(env);
}

/** Lê só o cabeçalho: o arquivo está cifrado por este cofre? */
export function isEncryptedFile(filePath) {
  let fd;
  try {
    fd = fs.openSync(filePath, 'r');
    const buf = Buffer.alloc(MAGIC.length);
    const n = fs.readSync(fd, buf, 0, MAGIC.length, 0);
    return n === MAGIC.length && buf.equals(MAGIC);
  } catch {
    return false;
  } finally {
    if (fd !== undefined) try { fs.closeSync(fd); } catch { /* já fechado */ }
  }
}

/** Transform que cifra: emite cabeçalho+iv no início e a etiqueta no fim; conta os bytes de entrada. */
export function createEncryptStream(key) {
  const iv = crypto.randomBytes(IV_LEN);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  let started = false;
  let plainBytes = 0;
  const t = new Transform({
    transform(chunk, _enc, cb) {
      plainBytes += chunk.length;
      if (!started) { started = true; this.push(Buffer.concat([MAGIC, iv])); }
      this.push(cipher.update(chunk));
      cb();
    },
    flush(cb) {
      if (!started) { started = true; this.push(Buffer.concat([MAGIC, iv])); }
      this.push(cipher.final());
      this.push(cipher.getAuthTag());
      cb();
    },
  });
  Object.defineProperty(t, 'plainBytes', { get: () => plainBytes });
  return t;
}

/** Abre um fluxo de leitura que DECIFRA o arquivo (a etiqueta, no fim, é conferida ao terminar). */
export function createDecryptReadStream(filePath, key) {
  if (!key) throw new VaultKeyMissingError();
  const size = fs.statSync(filePath).size;
  if (size < HEADER_LEN + TAG_LEN) throw new Error('Arquivo cifrado incompleto.');
  const fd = fs.openSync(filePath, 'r');
  const head = Buffer.alloc(HEADER_LEN);
  const tag = Buffer.alloc(TAG_LEN);
  fs.readSync(fd, head, 0, HEADER_LEN, 0);
  fs.readSync(fd, tag, 0, TAG_LEN, size - TAG_LEN);
  fs.closeSync(fd);
  if (!head.subarray(0, MAGIC.length).equals(MAGIC)) throw new Error('Arquivo não está no formato cifrado.');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, head.subarray(MAGIC.length));
  decipher.setAuthTag(tag);
  if (size === HEADER_LEN + TAG_LEN) { decipher.end(); return decipher; } // arquivo original vazio
  const src = fs.createReadStream(filePath, { start: HEADER_LEN, end: size - TAG_LEN - 1 });
  src.on('error', (e) => decipher.destroy(e));
  return src.pipe(decipher);
}

/** Tamanho original (sem cabeçalho nem etiqueta) de um arquivo cifrado. */
export function plainSizeOf(filePath) {
  return Math.max(0, fs.statSync(filePath).size - HEADER_LEN - TAG_LEN);
}

/**
 * Cifra um arquivo existente com segurança: grava um temporário, CONFERE decifrando e comparando
 * o SHA-256 do original, e só então troca. Em qualquer falha o original permanece intacto.
 * @returns {'cifrado'|'ja_cifrado'}
 */
export async function encryptFileInPlace(filePath, key) {
  if (!key) throw new VaultKeyMissingError();
  if (isEncryptedFile(filePath)) return 'ja_cifrado';
  const tmp = `${filePath}.enc-tmp`;
  const originalHash = await sha256File(filePath);
  try {
    await pipe(fs.createReadStream(filePath), createEncryptStream(key), fs.createWriteStream(tmp, { mode: 0o640 }));
    const check = await sha256Stream(createDecryptReadStream(tmp, key));
    if (check !== originalHash) throw new Error('Conferência falhou: o arquivo cifrado não reproduz o original.');
    fs.renameSync(tmp, filePath);
    return 'cifrado';
  } catch (e) {
    try { fs.unlinkSync(tmp); } catch { /* nada a limpar */ }
    throw e;
  }
}

/** Operação inversa (emergência / mudança de chave): devolve o arquivo ao texto puro, também com conferência. */
export async function decryptFileInPlace(filePath, key) {
  if (!isEncryptedFile(filePath)) return 'ja_puro';
  const tmp = `${filePath}.dec-tmp`;
  try {
    await pipe(createDecryptReadStream(filePath, key), fs.createWriteStream(tmp, { mode: 0o640 }));
    fs.renameSync(tmp, filePath);
    return 'decifrado';
  } catch (e) {
    try { fs.unlinkSync(tmp); } catch { /* nada a limpar */ }
    throw e;
  }
}

export function sha256File(filePath) {
  return sha256Stream(fs.createReadStream(filePath));
}

function sha256Stream(stream) {
  return new Promise((resolve, reject) => {
    const h = crypto.createHash('sha256');
    stream.on('data', (c) => h.update(c));
    stream.on('end', () => resolve(h.digest('hex')));
    stream.on('error', reject);
  });
}

/**
 * Motor de armazenamento do multer: grava o upload JÁ CIFRADO no disco (se a chave existir).
 * Reaproveita a lógica de destino/nome do multer.diskStorage recebida em `base`.
 * `file.size` devolvido é o tamanho ORIGINAL (o que a tela mostra), não o do arquivo cifrado.
 */
export function encryptedDiskStorage(base, env = process.env) {
  return {
    _handleFile(req, file, cb) {
      base.getDestination(req, file, (err, destination) => {
        if (err) return cb(err);
        base.getFilename(req, file, (err2, filename) => {
          if (err2) return cb(err2);
          const finalPath = `${destination}/${filename}`;
          let key = null;
          try { key = getDocKey(env); } catch (e) { return cb(e); }
          const out = fs.createWriteStream(finalPath, { mode: 0o640 });
          const done = (e, size) => {
            if (e) { try { fs.unlinkSync(finalPath); } catch { /* nada gravado */ } return cb(e); }
            cb(null, { destination, filename, path: finalPath, size });
          };
          if (!key) {
            let n = 0;
            file.stream.on('data', (c) => { n += c.length; });
            return pipeline(file.stream, out, (e) => done(e, n));
          }
          const enc = createEncryptStream(key);
          pipeline(file.stream, enc, out, (e) => done(e, enc.plainBytes));
        });
      });
    },
    _removeFile(req, file, cb) {
      fs.unlink(file.path, cb);
    },
  };
}
