/**
 * Guarda de regressão do painel: TODO caminho de entrada (senha, Google, sessão restaurada)
 * passa por applyPermissionsAndLoadModules(), que aplica as permissões do usuário e carrega
 * só os módulos autorizados. Antes, o login com Google carregava TODOS os módulos e nunca
 * aplicava as permissões, então o menu aparecia completo mesmo com a API negando os dados.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = fs.readFileSync(path.join(ROOT, 'public/js/painel/painel-1-app.js'), 'utf8');

/** Corpo de uma função declarada em SRC (da assinatura até a próxima função do mesmo nível). */
function body(name) {
  const start = SRC.search(new RegExp(`(async )?function ${name}\\(`));
  assert.ok(start >= 0, `função ${name} não encontrada`);
  const rest = SRC.slice(start + 10);
  const next = rest.search(/\n {4}(async )?function [A-Za-z]/);
  return SRC.slice(start, start + 10 + (next < 0 ? rest.length : next));
}

describe('painel: entrada pós-login por função (RBAC)', () => {
  it('cada entrada autenticada chama applyPermissionsAndLoadModules logo após mostrar o painel', () => {
    const entradas = SRC.match(/showPanelScreen\(data\.user\);/g) || [];
    assert.equal(entradas.length, 3, 'esperava 3 entradas: senha, Google e sessão restaurada');
    const comPermissao =
      SRC.match(/showPanelScreen\(data\.user\);\s*\n\s*await applyPermissionsAndLoadModules\(\)/g) || [];
    assert.equal(comPermissao.length, entradas.length, 'uma entrada não aplica as permissões do usuário');
  });

  it('o login com Google usa a mesma função (e não carrega módulos por conta própria)', () => {
    const g = body('submitAdminGooglePayload');
    assert.match(g, /await applyPermissionsAndLoadModules\(\)/);
    for (const f of [
      'loadLeads',
      'loadClients',
      'loadLawsuits',
      'loadOffices',
      'loadDriveFiles',
      'loadCalendarSummary',
      'loadPublicationsStats',
      'loadHrDashboard',
    ]) {
      assert.ok(!new RegExp(`\\b${f}\\(`).test(g), `o login Google chama ${f}() sem checar permissão`);
    }
  });

  it('as 3 funções de entrada (senha, Google, sessão restaurada) não carregam módulo nenhum por conta própria', () => {
    // (switchTab e o botão "Atualizar" também chamam load*(), mas são ações do usuário já logado; o servidor barra o que não pode.)
    for (const fn of ['handleLogin', 'checkAuth', 'submitAdminGooglePayload']) {
      const corpo = body(fn);
      assert.match(corpo, /applyPermissionsAndLoadModules\(\)/, `${fn} deveria usar applyPermissionsAndLoadModules`);
      for (const f of [
        'loadLeads',
        'loadClients',
        'loadLawsuits',
        'loadOffices',
        'loadDriveFiles',
        'loadCalendarSummary',
        'loadPublicationsStats',
        'loadHrDashboard',
      ]) {
        assert.ok(!new RegExp(`\\b${f}\\(`).test(corpo), `${fn} chama ${f}() sem checar permissão`);
      }
    }
  });

  it('a função central carrega cada módulo SOMENTE se o mestre ou a aba permitir', () => {
    const central = body('applyPermissionsAndLoadModules');
    assert.match(central, /await loadAndApplyUserPermissions\(\)/);
    const mapa = {
      loadLeads: 'tab_leads',
      loadClients: 'tab_clients',
      loadLawsuits: 'tab_lawsuits',
      loadOffices: 'tab_offices',
      loadDriveFiles: 'tab_drive',
      loadCalendarSummary: 'tab_calendar',
      loadPublicationsStats: 'tab_publications',
      loadHrDashboard: 'tab_hr',
    };
    for (const [fn, aba] of Object.entries(mapa)) {
      assert.match(
        central,
        new RegExp(`if \\(isM \\|\\| p\\.${aba} === 1\\) ${fn}\\(\\);`),
        `${fn} deveria exigir ${aba}`
      );
    }
  });
});
