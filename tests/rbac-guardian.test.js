/**
 * Guardião do RBAC: reprova (com cópias adulteradas do projeto) cada regra, e prova o
 * comportamento real: as 3 contas mestras entram como mestre; outros e-mails não; env não cria mestre.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkRbacStatic, checkRbacCoverage, APPROVED_MASTER_EMAILS } from '../scripts/check-rbac-guard.js';
import { ruleFor } from '../src/middleware/rbac-rules.js';
import { isMasterEmail, MASTER_EMAILS } from '../src/config/master-emails.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FILES = [
  'src/config/master-emails.js',
  'src/shared/google-auth.js',
  'src/middleware/rbac.js',
  'src/middleware/rbac-rules.js',
  'src/modules/auth/auth.routes.js',
  'src/modules/hr/hr.routes.js',
  'public/js/painel/painel-1-app.js',
  'public/js/painel/painel-3.js',
];

/** Cópia mínima do projeto com uma adulteração; devolve as violações. */
async function mutate(file, fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rbac-guard-'));
  try {
    for (const f of FILES) {
      fs.mkdirSync(path.dirname(path.join(dir, f)), { recursive: true });
      fs.copyFileSync(path.join(ROOT, f), path.join(dir, f));
    }
    if (file) {
      const p = path.join(dir, file);
      const before = fs.readFileSync(p, 'utf8');
      const after = fn(before);
      assert.notEqual(after, before, `a adulteração de ${file} não mudou nada (teste inválido)`);
      fs.writeFileSync(p, after);
    }
    return [...checkRbacStatic(dir), ...(await checkRbacCoverage(dir))];
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

describe('guardião RBAC: projeto real', () => {
  it('está íntegro', async () => {
    assert.deepEqual(await mutate(null), []);
  });
  it('as contas mestras são exatamente as 3 aprovadas', () => {
    assert.deepEqual([...MASTER_EMAILS], [...APPROVED_MASTER_EMAILS]);
    assert.equal(APPROVED_MASTER_EMAILS.length, 3);
  });
});

describe('guardião RBAC: reprova adulterações', () => {
  const cases = [
    ['mestre extra', 'src/config/master-emails.js', (s) => s.replace("'jorgealvim10@gmail.com',", "'jorgealvim10@gmail.com','intruso@x.com',"), /NÃO aprovada/],
    ['mestre removido', 'src/config/master-emails.js', (s) => s.replace("'jorgealvim10@gmail.com',", ''), /aprovada ausente/],
    ['mestre por env', 'src/modules/hr/hr.routes.js', (s) => s + '\nconst x = process.env.GOOGLE_ADMIN_EMAILS;\n', /GOOGLE_ADMIN_EMAILS/],
    ['login sem isMasterEmail', 'src/modules/hr/hr.routes.js', (s) => s.replace(/isMasterEmail\(/g, 'naoEhMestre('), /isMasterEmail/],
    ['mock sem portão', 'src/shared/google-auth.js', (s) => s.replace('if (!mockTokensAllowed(env))', 'if (false)'), /mockTokensAllowed/],
    ['sem aud', 'src/shared/google-auth.js', (s) => s.replace('allowedAudiences(env).has(', 'true || (('), /aud/],
    ['sem email_verified', 'src/shared/google-auth.js', (s) => s.replace(/email_verified/g, 'ev'), /email_verified/],
    ['painel sem permissões', 'public/js/painel/painel-1-app.js', (s) => s.replace('await loadAndApplyUserPermissions();', ''), /loadAndApplyUserPermissions/],
    ['módulo sem exigir aba', 'public/js/painel/painel-1-app.js', (s) => s.replace('if (isM || p.tab_hr === 1) loadHrDashboard();', 'loadHrDashboard();'), /tab_hr/],
    ['entrada sem função central', 'public/js/painel/painel-1-app.js', (s) => s.replace('await applyPermissionsAndLoadModules();', 'loadLeads();'), /entrada/],
    ['menu aberto por padrão', 'public/js/painel/painel-3.js', (s) => s.replace('var WM_MASTER=false, WM_ALLOWED={};', 'var WM_MASTER=true, WM_ALLOWED=null;'), /FECHADO/],
    ['rbac sem deny-by-default', 'src/middleware/rbac.js', (s) => s.replace(/if \(!rule\)\s*\{/, 'if (false) {'), /deny-by-default/],
  ];
  for (const [nome, file, fn, re] of cases) {
    it(nome, async () => {
      const v = await mutate(file, fn);
      assert.ok(v.some((x) => re.test(x)), `esperava violação ${re}, veio: ${JSON.stringify(v)}`);
    });
  }
  it('rota sensível pública', async () => {
    const v = await mutate('src/middleware/rbac-rules.js', (s) => s.replace(/\[\/\^\\\/api\\\/documents/, "[/^\\/api\\/financial(\\/|$)/, PUBLIC],\n  [/^\\/api\\/documents"));
    assert.ok(v.some((x) => /PÚBLICA/.test(x)), JSON.stringify(v));
  });
});

describe('contas mestras e rota de documentos', () => {
  it('reconhece as 3 contas (qualquer caixa/espaço) e só elas', () => {
    for (const e of APPROVED_MASTER_EMAILS) assert.ok(isMasterEmail(` ${e.toUpperCase()} `));
    assert.equal(isMasterEmail('outra@gmail.com'), false);
    assert.equal(isMasterEmail(''), false);
    assert.equal(isMasterEmail(undefined), false);
  });
  it('GOOGLE_ADMIN_EMAILS não cria mestre', () => {
    process.env.GOOGLE_ADMIN_EMAILS = 'intruso@x.com';
    try {
      assert.equal(isMasterEmail('intruso@x.com'), false);
    } finally {
      delete process.env.GOOGLE_ADMIN_EMAILS;
    }
  });
  it('/api/documents tem regra (antes dava 403 até para o mestre)', () => {
    assert.ok(ruleFor('/api/documents/generate', 'POST'));
  });
});
