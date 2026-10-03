/** Permissões granulares: coluna nova NULL herda da antiga (ninguém ganha/perde acesso ao migrar); valor explícito vence. */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { effectivePerms, hasTab, ALL_TABS } from '../src/shared/permissions.js';

describe('effectivePerms', () => {
  it('sem linha: tudo 0, com todas as chaves', () => {
    const p = effectivePerms(null);
    assert.deepEqual(Object.keys(p).sort(), [...ALL_TABS].sort());
    assert.ok(Object.values(p).every((v) => v === 0));
  });
  it('NULL herda: financeiro -> nfse/assinaturas; config -> blog/auditoria; processos/agenda -> alertas', () => {
    const fin = effectivePerms({ tab_financial: 1 });
    assert.equal(fin.tab_nfse, 1);
    assert.equal(fin.tab_esign, 1);
    assert.equal(fin.tab_blog, 0);
    const cfg = effectivePerms({ tab_settings: 1 });
    assert.equal(cfg.tab_blog, 1);
    assert.equal(cfg.tab_audit, 1);
    assert.equal(effectivePerms({ tab_lawsuits: 1 }).tab_alerts, 1);
    assert.equal(effectivePerms({ tab_calendar: 1 }).tab_alerts, 1);
    assert.equal(effectivePerms({ tab_clients: 1 }).tab_alerts, 0);
  });
  it('valor explícito vence a herança (liga e desliga separadamente)', () => {
    assert.equal(effectivePerms({ tab_financial: 1, tab_nfse: 0 }).tab_nfse, 0);
    assert.equal(effectivePerms({ tab_financial: 1, tab_nfse: 0 }).tab_esign, 1);
    assert.equal(effectivePerms({ tab_settings: 0, tab_blog: 1 }).tab_blog, 1);
    assert.equal(effectivePerms({ tab_lawsuits: 1, tab_alerts: 0 }).tab_alerts, 0);
  });
  it('hasTab', () => {
    assert.equal(hasTab({ tab_settings: 1 }, 'tab_audit'), true);
    assert.equal(hasTab({ tab_settings: 0 }, 'tab_audit'), false);
  });
});

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');

describe('consistência: toda chave de aba usada existe', () => {
  it('regras do servidor, menu e matriz só usam chaves conhecidas, e a matriz mostra todas', () => {
    const known = new Set(ALL_TABS);
    const usadas = [
      ...[...read('src/middleware/rbac-rules.js').matchAll(/tab\('(tab_\w+)'\)/g)].map((m) => m[1]),
      ...[...read('public/js/painel/painel-3.js').matchAll(/'(tab_\w+)'/g)].map((m) => m[1]),
      ...[...read('public/js/painel/painel-1-app.js').matchAll(/perms?\.(tab_\w+)/g)].map((m) => m[1]),
    ];
    for (const k of usadas) assert.ok(known.has(k) || k === 'tab_master_only', `chave desconhecida: ${k}`);
    const matriz = [...read('public/js/tabs/tab-users.js').matchAll(/\{ key: '(tab_\w+)'/g)].map((m) => m[1]);
    // todas as abas que o servidor conhece (menos o portal do cliente, que é só do cliente) têm um switch na matriz
    for (const k of ALL_TABS) assert.ok(matriz.includes(k), `a matriz não tem switch para ${k}`);
    // e o cabeçalho da tabela tem uma coluna por switch
    const html = read('painel.html');
    const th = html.slice(html.indexOf('id="access-matrix-tbody"') - 3000, html.indexOf('id="access-matrix-tbody"'));
    assert.equal((th.match(/<th /g) || []).length, matriz.length + 4, 'colunas do cabeçalho != switches + (cadastrado, perfil, testar visão, status)');
  });
});
