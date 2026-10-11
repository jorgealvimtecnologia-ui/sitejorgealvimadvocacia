/**
 * Limpeza CIRÚRGICA (scripts/limpar-equipe-ficticia.js): tira a equipe fictícia, os andamentos
 * inventados e as intimações de OAB de terceiros, mas PRESERVA o mestre e TODOS os clientes/logins.
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SCRIPT = path.join(ROOT, 'scripts', 'limpar-equipe-ficticia.js');
const DB = path.join(os.tmpdir(), `jaw-limpeza-${Date.now()}.db`);

function run(aplicar) {
  return execFileSync('node', [SCRIPT, ...(aplicar ? ['--aplicar'] : [])], {
    env: { ...process.env, DB_PATH: DB, KEEP_OAB: '222943' }, encoding: 'utf8'
  });
}

before(() => {
  const db = new DatabaseSync(DB);
  db.exec(`
    CREATE TABLE access_permissions (user_id TEXT, role_template TEXT, user_name TEXT);
    CREATE TABLE users (id TEXT, username TEXT);
    CREATE TABLE clients (id TEXT, full_name TEXT);
    CREATE TABLE office_members (id TEXT, name TEXT);
    CREATE TABLE hr_employees (id TEXT, name TEXT);
    CREATE TABLE lawsuit_movements (id INTEGER PRIMARY KEY, lawsuit_id TEXT, title TEXT, description TEXT);
    CREATE TABLE court_publications (id TEXT, advogado_oab TEXT);
  `);
  // Mestre + operadores de equipe fictícios + clientes (inclusive os de teste).
  db.exec(`INSERT INTO access_permissions (user_id, role_template, user_name) VALUES
    ('USR-MASTER-01','master','Dr. Jorge'),
    ('EMP-1','secretaria','Juliana'),
    ('EMP-2','advogado','Camila'),
    ('EMP-3','estagiario','Gabriel'),
    ('CLI-1','cliente','Usuario Google'),
    ('CLI-2','cliente','jorgealvim'),
    ('CLI-3','cliente','jorgealvim1');`);
  db.exec(`INSERT INTO users (id, username) VALUES ('USR-MASTER-01','jorgealvimtecnologia');`);
  db.exec(`INSERT INTO clients (id, full_name) VALUES ('CLI-1','Usuario Google'),('CLI-2','jorgealvim'),('CLI-3','jorgealvim1'),('CLI-R','Parte importada (Radar)');`);
  db.exec(`INSERT INTO office_members (id, name) VALUES ('EMP-1','Juliana'),('EMP-2','Camila');`);
  db.exec(`INSERT INTO hr_employees (id, name) VALUES ('EMP-1','Juliana'),('EMP-2','Camila');`);
  // Andamentos: 1 inventado (enchimento) + 1 real.
  db.exec(`INSERT INTO lawsuit_movements (lawsuit_id, title, description) VALUES
    ('LAW-1','Consulta Direcionada aos Tribunais',''),
    ('LAW-1','Juntada de Petição','Petição protocolada hoje');`);
  // Intimações: 1 da OAB do Dr. Jorge + 1 de terceiro.
  db.exec(`INSERT INTO court_publications (id, advogado_oab) VALUES ('PUB-1','222943/MG'),('PUB-2','111222/SP');`);
  db.close();
});

after(() => {
  for (const f of [DB, `${DB}-wal`, `${DB}-shm`]) { try { fs.unlinkSync(f); } catch {} }
});

describe('Limpeza cirúrgica da equipe fictícia', () => {
  it('a simulação não apaga nada', () => {
    const out = run(false);
    assert.match(out, /SIMULAÇÃO/);
    const db = new DatabaseSync(DB);
    assert.equal(db.prepare('SELECT COUNT(*) n FROM clients').get().n, 4);
    assert.equal(db.prepare('SELECT COUNT(*) n FROM office_members').get().n, 2);
    db.close();
  });

  it('ao aplicar: tira a equipe, os inventados e as intimações de terceiros; mantém mestre e clientes', () => {
    run(true);
    const db = new DatabaseSync(DB);
    // Equipe fictícia some.
    assert.equal(db.prepare('SELECT COUNT(*) n FROM office_members').get().n, 0, 'office_members deve esvaziar');
    assert.equal(db.prepare('SELECT COUNT(*) n FROM hr_employees').get().n, 0, 'hr_employees deve esvaziar');
    assert.equal(db.prepare(`SELECT COUNT(*) n FROM access_permissions WHERE role_template NOT IN ('master','cliente')`).get().n, 0, 'permissões de equipe somem');
    // Mestre e TODOS os clientes ficam.
    assert.equal(db.prepare(`SELECT COUNT(*) n FROM access_permissions WHERE user_id='USR-MASTER-01'`).get().n, 1, 'mestre preservado');
    assert.equal(db.prepare(`SELECT COUNT(*) n FROM access_permissions WHERE role_template='cliente'`).get().n, 3, 'clientes preservados na matriz');
    assert.equal(db.prepare('SELECT COUNT(*) n FROM clients').get().n, 4, 'todos os clientes preservados');
    // Andamento inventado some; o real fica.
    assert.equal(db.prepare('SELECT COUNT(*) n FROM lawsuit_movements').get().n, 1, 'só o andamento real fica');
    assert.equal(db.prepare(`SELECT title FROM lawsuit_movements`).get().title, 'Juntada de Petição');
    // Intimação de terceiro some; a da OAB do Dr. Jorge fica.
    assert.equal(db.prepare('SELECT COUNT(*) n FROM court_publications').get().n, 1, 'só a intimação da sua OAB fica');
    assert.equal(db.prepare('SELECT advogado_oab FROM court_publications').get().advogado_oab, '222943/MG');
    db.close();
  });
});
