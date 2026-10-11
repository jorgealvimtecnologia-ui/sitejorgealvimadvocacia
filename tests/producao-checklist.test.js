/**
 * AUD-20: verificação de produção — o checklist reprova site fora do ar, degradado ou backup velho,
 * e aprova produção saudável. Roda tudo NO MESMO processo (sem subprocesso) contra um servidor de teste.
 */
import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
import { runChecklist } from '../scripts/producao-checklist.js';

const servers = [];
after(() => servers.forEach((s) => { try { s.close(); } catch { /* já fechado */ } }));

function serve(resposta) {
  return new Promise((resolve) => {
    const srv = http.createServer((req, res) => {
      const r = typeof resposta === 'function' ? resposta(req) : resposta;
      res.writeHead(r.status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(r.body));
    });
    servers.push(srv);
    srv.listen(0, '127.0.0.1', () => resolve(`http://127.0.0.1:${srv.address().port}`));
  });
}
const by = (r, nome) => r.checks.find((c) => c.nome === nome);

describe('checklist de produção (AUD-20)', () => {
  it('site saudável: sem problema grave', async () => {
    const url = await serve({ status: 200, body: { status: 'ok', uptime_s: 100, db: 'ok', disk: 'ok', disk_free_percent: 60, jobs: { varredura_prazos: 'ok' } } });
    const r = await runChecklist({ url });
    assert.equal(r.ok, true);
    assert.equal(by(r, 'Site no ar e saudável').estado, 'ok');
    assert.equal(by(r, 'Disco do servidor').estado, 'ok');
    assert.equal(by(r, 'Certificado HTTPS').estado, 'aviso'); // http:// não tem cert, é ignorado
  });

  it('disco baixo vira aviso; crítico vira falha', async () => {
    const aviso = await runChecklist({ url: await serve({ status: 200, body: { status: 'degraded', db: 'ok', disk: 'low', disk_free_percent: 9, jobs: {} } }) });
    assert.equal(by(aviso, 'Disco do servidor').estado, 'aviso');
    const falha = await runChecklist({ url: await serve({ status: 200, body: { status: 'degraded', db: 'ok', disk: 'critical', disk_free_percent: 3, jobs: {} } }) });
    assert.equal(by(falha, 'Disco do servidor').estado, 'falha');
    assert.equal(falha.ok, false);
  });

  it('tarefa automática parada é falha', async () => {
    const r = await runChecklist({ url: await serve({ status: 200, body: { status: 'degraded', db: 'ok', disk: 'ok', disk_free_percent: 50, jobs: { sincronizacao_tribunais: 'stale' } } }) });
    assert.ok(r.checks.some((c) => c.nome.includes('sincronizacao_tribunais') && c.estado === 'falha'));
    assert.equal(r.ok, false);
  });

  it('banco fora (503) é falha grave', async () => {
    const r = await runChecklist({ url: await serve({ status: 503, body: { status: 'fail', db: 'fail' } }) });
    assert.equal(by(r, 'Site no ar').estado, 'falha');
    assert.equal(r.ok, false);
  });

  it('site fora do ar é falha', async () => {
    const r = await runChecklist({ url: 'http://127.0.0.1:1' });
    assert.equal(by(r, 'Site no ar').estado, 'falha');
    assert.equal(r.ok, false);
  });

  it('modo servidor: backup recente, cópia cifrada e teste de restauração OK', async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pc-srv-'));
    fs.mkdirSync(path.join(tmp, 'backups'));
    const pkg = path.join(tmp, 'backups', 'backup_jorgealvim_2026-10-04_03-00-00.tar.gz');
    fs.writeFileSync(pkg, 'x'); fs.writeFileSync(`${pkg}.enc`, 'y');
    fs.writeFileSync(path.join(tmp, 'backups', 'restore-test.log'), '2026-10-04 OK pacote íntegro\n');
    const url = await serve({ status: 200, body: { status: 'ok', db: 'ok', disk: 'ok', disk_free_percent: 50, jobs: {} } });
    const r = await runChecklist({ url, servidor: tmp });
    assert.equal(by(r, 'Backup diário').estado, 'ok');
    assert.equal(by(r, 'Cópia externa cifrada').estado, 'ok');
    assert.equal(by(r, 'Teste de restauração').estado, 'ok');
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it('backup com mais de 36h é falha; sem .enc é aviso', async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pc-old-'));
    fs.mkdirSync(path.join(tmp, 'backups'));
    const pkg = path.join(tmp, 'backups', 'backup_jorgealvim_2026-10-01_03-00-00.tar.gz');
    fs.writeFileSync(pkg, 'x');
    const antigo = Date.now() - 50 * 3600 * 1000;
    fs.utimesSync(pkg, new Date(antigo), new Date(antigo));
    const url = await serve({ status: 200, body: { status: 'ok', db: 'ok', disk: 'ok', disk_free_percent: 50, jobs: {} } });
    const r = await runChecklist({ url, servidor: tmp });
    assert.equal(by(r, 'Backup diário').estado, 'falha');
    assert.equal(by(r, 'Cópia externa cifrada').estado, 'aviso');
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it('modo servidor sem pasta de backups é falha', async () => {
    const url = await serve({ status: 200, body: { status: 'ok', db: 'ok' } });
    const r = await runChecklist({ url, servidor: '/caminho/que/nao/existe/xyz' });
    assert.equal(by(r, 'Backup diário').estado, 'falha');
  });
});
