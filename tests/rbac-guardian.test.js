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
  'src/shared/permissions.js',
  'public/js/tabs/tab-users.js',
  'painel.html',
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
    ['aba NOVA sem regra de acesso', 'public/js/painel/painel-3.js', (s) => s.replace("var MODULES={", "var MODULES={ 'aba-nova':{label:'Aba Nova'},"), /ABA NOVA SEM REGRA.*aba-nova/],
    ['aba EXCLUÍDA ainda no RBAC', 'public/js/painel/painel-3.js', (s) => s.replace("var ALWAYS_ALLOWED={", "var ALWAYS_ALLOWED={'aba-fantasma':1,"), /ABA EXCLUÍDA.*aba-fantasma/],
    ['permissão nova sem switch na matriz', 'src/shared/permissions.js', (s) => s.replace("'tab_tools'];", "'tab_tools', 'tab_nova'];"), /tab_nova.*não tem switch/],
    ['switch da matriz de aba que não existe', 'public/js/tabs/tab-users.js', (s) => s.replace("{ key: 'tab_alerts'", "{ key: 'tab_velha', label: 'x', icon: 'x', title: 'x' },\n      { key: 'tab_alerts'"), /tab_velha/],
    ['coluna da matriz sem th no painel', 'painel.html', (s) => s.replace('🔔 Alertas</th>', '</th>'.replace('</th>', '🔔 Alertas</th>\n<th class="x">extra</th>')), /colunas/],
    ['aba no HTML fora do RBAC', 'painel.html', (s) => s.replace('id="tab-content-dashboard"', 'id="tab-content-dashboard"') + '<div id="tab-content-escondida"></div>', /tab-content-escondida/],
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

describe('administração: a API segue a mesma aba do menu', () => {
  const alvo = (p, m = 'GET') => ruleFor(p, m)?.[1];
  it('manutenção (backups, sessões, VACUUM) é só do mestre', () => {
    for (const p of ['/api/admin/maintenance/backups', '/api/admin/maintenance/backups/download/x', '/api/admin/maintenance/mode', '/api/admin/maintenance/sessions/disconnect-all'])
      assert.equal(alvo(p), 'master', p);
  });
  it('cada área exige a SUA aba (não uma aba genérica)', () => {
    const esperado = {
      '/api/admin/audit-logs': 'tab_audit', '/api/lgpd/requests': 'tab_audit',
      '/api/admin/blog/posts': 'tab_blog', '/api/admin/site/faqs': 'tab_blog',
      '/api/admin/whatsapp/test': 'tab_settings', '/api/notifications': 'tab_alerts',
      '/api/nfse/x': 'tab_nfse', '/api/esign/requests': 'tab_esign', '/api/signatures/x': 'tab_esign',
      '/api/financial/summary': 'tab_financial', '/api/notifications/whatsapp-template': 'tab_esign'
    };
    for (const [p, aba] of Object.entries(esperado)) assert.deepEqual(alvo(p), { panelTab: aba }, p);
  });
  it('tráfego e pré-clientes exigem a aba Leads', () => {
    for (const p of ['/api/admin/visits/stats', '/api/admin/pre-clients/x/convert-to-lead'])
      assert.deepEqual(alvo(p), { panelTab: 'tab_leads' }, p);
  });
  it('rota /api/admin nova sem regra é NEGADA (não vira "qualquer operador")', () => {
    assert.equal(ruleFor('/api/admin/rota-nova-sem-regra', 'GET'), undefined);
  });
});
