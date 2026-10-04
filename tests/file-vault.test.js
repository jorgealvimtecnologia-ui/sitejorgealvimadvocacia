/**
 * AUD-12: documentos cifrados em repouso (AES-256-GCM), leitura transparente e migração segura.
 */
import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { pipeline } from 'node:stream/promises';
import {
  getDocKey, generateDocKey, isEncryptedFile, createEncryptStream, createDecryptReadStream,
  encryptFileInPlace, decryptFileInPlace, plainSizeOf, MAGIC,
} from '../src/shared/file-vault.js';

const TMP_DB = path.join(os.tmpdir(), `jaw-vault-${Date.now()}.db`);
process.env.NODE_ENV = 'test';
process.env.DB_PATH = TMP_DB;
process.env.MASTER_PASSWORD = 'SenhaRealDoMestre#2026';
delete process.env.DOC_ENC_KEY;

const { app, db } = await import('../server.js');
const TMPDIR = fs.mkdtempSync(path.join(os.tmpdir(), 'vault-'));
const KEY = Buffer.from(generateDocKey(), 'base64');
const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');
const readAll = async (stream) => { const c = []; for await (const x of stream) c.push(x); return Buffer.concat(c); };
const created = [];

after(() => {
  delete process.env.DOC_ENC_KEY;
  try { db?.close?.(); } catch {}
  for (const f of [TMP_DB, `${TMP_DB}-wal`, `${TMP_DB}-shm`]) { try { fs.unlinkSync(f); } catch {} }
  fs.rmSync(TMPDIR, { recursive: true, force: true });
  created.forEach((p) => fs.rmSync(p, { recursive: true, force: true }));
});

async function writeEncrypted(name, plain) {
  const src = path.join(TMPDIR, `${name}.src`);
  const dst = path.join(TMPDIR, name);
  fs.writeFileSync(src, plain);
  await pipeline(fs.createReadStream(src), createEncryptStream(KEY), fs.createWriteStream(dst));
  return dst;
}

describe('chave', () => {
  it('sem DOC_ENC_KEY o recurso fica desligado', () => assert.equal(getDocKey({}), null));
  it('aceita 32 bytes em base64 e recusa tamanho errado', () => {
    assert.equal(getDocKey({ DOC_ENC_KEY: generateDocKey() }).length, 32);
    assert.throws(() => getDocKey({ DOC_ENC_KEY: Buffer.from('curta').toString('base64') }), /32 bytes/);
  });
});

describe('cifrar e decifrar em fluxo', () => {
  for (const [nome, tamanho] of [['vazio', 0], ['pequeno', 37], ['grande', 3 * 1024 * 1024 + 11]]) {
    it(`devolve exatamente o original (${nome})`, async () => {
      const plain = crypto.randomBytes(tamanho);
      const f = await writeEncrypted(`rt-${nome}`, plain);
      assert.equal(isEncryptedFile(f), true);
      assert.equal(plainSizeOf(f), tamanho);
      assert.equal(sha(await readAll(createDecryptReadStream(f, KEY))), sha(plain));
    });
  }
  it('o texto original não aparece no arquivo cifrado', async () => {
    const f = await writeEncrypted('sigilo', Buffer.from('CPF 123.456.789-00 SENTENCA SIGILOSA'));
    assert.ok(!fs.readFileSync(f).includes('SIGILOSA'));
    assert.ok(fs.readFileSync(f).subarray(0, 8).equals(MAGIC));
  });
  it('arquivo adulterado é detectado (etiqueta GCM)', async () => {
    const f = await writeEncrypted('adulterado', crypto.randomBytes(5000));
    const b = fs.readFileSync(f); b[100] ^= 0xff; fs.writeFileSync(f, b);
    await assert.rejects(() => readAll(createDecryptReadStream(f, KEY)));
  });
  it('chave errada não decifra', async () => {
    const f = await writeEncrypted('chave-errada', crypto.randomBytes(2000));
    await assert.rejects(() => readAll(createDecryptReadStream(f, crypto.randomBytes(32))));
  });
  it('sem chave configurada nunca entrega o conteúdo cifrado', async () => {
    const f = await writeEncrypted('sem-chave', Buffer.from('x'));
    assert.throws(() => createDecryptReadStream(f, null), /DOC_ENC_KEY/);
  });
});

describe('migração segura de arquivo existente', () => {
  it('cifra, confere e preserva o conteúdo; repetir não faz nada', async () => {
    const f = path.join(TMPDIR, 'antigo.pdf');
    const plain = crypto.randomBytes(100000);
    fs.writeFileSync(f, plain);
    assert.equal(await encryptFileInPlace(f, KEY), 'cifrado');
    assert.equal(isEncryptedFile(f), true);
    assert.equal(await encryptFileInPlace(f, KEY), 'ja_cifrado');
    assert.equal(sha(await readAll(createDecryptReadStream(f, KEY))), sha(plain));
    assert.equal(fs.existsSync(`${f}.enc-tmp`), false);
  });
  it('decifrar devolve o original byte a byte', async () => {
    const f = path.join(TMPDIR, 'volta.bin');
    const plain = crypto.randomBytes(5000);
    fs.writeFileSync(f, plain);
    await encryptFileInPlace(f, KEY);
    assert.equal(await decryptFileInPlace(f, KEY), 'decifrado');
    assert.ok(fs.readFileSync(f).equals(plain));
  });
});

describe('ponta a ponta no servidor (drive do escritório)', () => {
  let h;
  const sobe = async (nome, conteudo) => {
    const r = await request(app).post('/api/drive/upload').set(h).field('folder', 'Geral').attach('drive_files', Buffer.from(conteudo), nome);
    assert.equal(r.status, 200, JSON.stringify(r.body));
    const url = r.body.documents?.[0]?.fileUrl || r.body.files?.[0]?.fileUrl || JSON.stringify(r.body).match(/\/storage\/office_drive\/[^"]+/)?.[0];
    assert.ok(url, JSON.stringify(r.body));
    created.push(path.join(process.cwd(), url.replace(/^\//, '')));
    return url;
  };
  it('entra como mestre', async () => {
    const r = await request(app).post('/api/auth/login').send({ username: 'jorgealvimtecnologia', password: process.env.MASTER_PASSWORD });
    h = { Authorization: `Bearer ${r.body.token}` };
    assert.ok(r.body.token);
  });
  it('sem chave: envio e leitura funcionam em texto puro (nada quebra)', async () => {
    const url = await sobe('sem-cofre.txt', 'conteudo puro');
    assert.equal(isEncryptedFile(path.join(process.cwd(), url.replace(/^\//, ''))), false);
    const g = await request(app).get(url).set(h);
    assert.equal(g.status, 200);
    assert.equal(g.text, 'conteudo puro');
  });
  it('com chave: o arquivo vai cifrado ao disco e volta legível, com o tamanho original', async () => {
    process.env.DOC_ENC_KEY = KEY.toString('base64');
    const url = await sobe('peticao.txt', 'PETICAO SIGILOSA do cliente');
    const disk = path.join(process.cwd(), url.replace(/^\//, ''));
    assert.equal(isEncryptedFile(disk), true);
    assert.ok(!fs.readFileSync(disk).includes('SIGILOSA'));
    const g = await request(app).get(url).set(h);
    assert.equal(g.status, 200);
    assert.equal(g.text, 'PETICAO SIGILOSA do cliente');
    assert.equal(g.headers['content-length'], String(Buffer.byteLength('PETICAO SIGILOSA do cliente')));
    const linha = db.prepare('SELECT file_size FROM office_drive_files WHERE filename = ?').get(path.basename(disk));
    assert.equal(linha.file_size, Buffer.byteLength('PETICAO SIGILOSA do cliente'));
  });
  it('arquivo antigo em texto puro continua legível depois de ligar a chave', async () => {
    const f = path.join(process.cwd(), 'storage', 'office_drive', `legado-${Date.now()}.txt`);
    fs.writeFileSync(f, 'documento legado'); created.push(f);
    const g = await request(app).get(`/storage/office_drive/${path.basename(f)}`).set(h);
    assert.equal(g.text, 'documento legado');
  });
  it('arquivo cifrado SEM a chave dá erro claro e não vaza o conteúdo cifrado', async () => {
    const url = await sobe('so-com-chave.txt', 'segredo');
    delete process.env.DOC_ENC_KEY;
    const g = await request(app).get(url).set(h);
    assert.equal(g.status, 503);
    assert.match(g.body.error, /DOC_ENC_KEY/);
    process.env.DOC_ENC_KEY = KEY.toString('base64');
  });
  it('sem login não baixa (protegido como antes)', async () => {
    const url = await sobe('privado.txt', 'privado');
    assert.equal((await request(app).get(url)).status, 401);
  });
  it('não aceita HTML/SVG como documento (execução no navegador)', async () => {
    const r = await request(app).post('/api/drive/upload').set(h).attach('drive_files', Buffer.from('<script>alert(1)</script>'), 'ataque.html');
    assert.ok(r.status >= 400);
    const s = await request(app).post('/api/drive/upload').set(h).attach('drive_files', Buffer.from('<svg onload=alert(1)>'), 'ataque.svg');
    assert.ok(s.status >= 400);
  });
  it('caminho fora da pasta e arquivos ocultos são negados', async () => {
    assert.ok([400, 403, 404].includes((await request(app).get('/storage/office_drive/..%2f..%2fserver.js').set(h)).status));
    assert.equal((await request(app).get('/storage/office_drive/.env').set(h)).status, 404);
  });
});
