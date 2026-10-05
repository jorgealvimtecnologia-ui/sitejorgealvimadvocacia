#!/usr/bin/env node
/**
 * ==============================================================================
 * GUARDIÃO DO RBAC — login por senha, login Google e contas mestras
 * ==============================================================================
 * Regras (parte do guardião; roda no `npm run check:architecture`, no `npm test` e na CI):
 *
 *  1. CONTAS MESTRAS: a lista em src/config/master-emails.js é EXATAMENTE a aprovada abaixo.
 *     Adicionar ou remover um mestre exige mudar o código e este guardião (decisão revisada).
 *     Nenhuma variável de ambiente (GOOGLE_ADMIN_EMAILS) decide quem é mestre.
 *  2. LOGIN GOOGLE: o verificador só aceita o token de teste sob portão de ambiente, confere o
 *     destinatário (aud) e o e-mail verificado, e não tem caminho alternativo sem aud.
 *  3. PAINEL (senha, Google, sessão restaurada): TODA entrada passa por
 *     applyPermissionsAndLoadModules(), que aplica as permissões da função/usuário e carrega
 *     SÓ os módulos autorizados. Nenhuma entrada abre módulos por conta própria.
 *  4. ABA NOVA/EXCLUÍDA => RBAC ATUALIZADO: todo módulo do painel (MODULES) está classificado no RBAC
 *     (MODULE_PERM, ALWAYS_ALLOWED ou MASTER_ONLY), toda chave de permissão tem switch e coluna na matriz
 *     "Usuários & Senhas", e nada no RBAC aponta para aba que não existe mais.
 *  5. RBAC FECHADO POR PADRÃO: rota /api sem regra é negada; TODA rota /api existente tem uma
 *     regra; e nenhuma rota sensível (usuários, financeiro, clientes, processos, RH, admin,
 *     LGPD, alertas de prazo) é pública.
 *  6. SEM SENHA ESCRITA NO CÓDIGO: nenhum script, módulo, e2e ou configuração carrega senha literal
 *     (password/PASS = '...') nem a senha antiga do mestre. Senhas vêm do cofre ou do ambiente;
 *     o login por senha continua existindo, conforme a RHABAC, só que com senhas guardadas fora do código.
 *     Os testes automáticos (tests/) usam bancos temporários e ficam fora desta regra.
 * ==============================================================================
 */
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TAG = '🚨 [RBAC]';

/** Contas Google mestras APROVADAS pelo Dr. Jorge. Mudar aqui é uma decisão deliberada. */
export const APPROVED_MASTER_EMAILS = Object.freeze(['jorgealvimtecnologia@gmail.com', 'jorgealvim10@gmail.com', 'jorgealvimadvocacia@gmail.com']);

const LOAD_FUNCS = ['loadLeads', 'loadClients', 'loadLawsuits', 'loadOffices', 'loadDriveFiles', 'loadCalendarSummary', 'loadPublicationsStats', 'loadHrDashboard'];
const MODULE_TAB = { loadLeads: 'tab_leads', loadClients: 'tab_clients', loadLawsuits: 'tab_lawsuits', loadOffices: 'tab_offices', loadDriveFiles: 'tab_drive', loadCalendarSummary: 'tab_calendar', loadPublicationsStats: 'tab_publications', loadHrDashboard: 'tab_hr' };
const SENSITIVE_PREFIXES = ['/api/users', '/api/financial', '/api/clients', '/api/lawsuits', '/api/hr', '/api/admin', '/api/lgpd', '/api/deadline-alerts', '/api/access-control', '/api/nfse', '/api/drive'];

function listJs(dir) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...listJs(p));
    else if (e.name.endsWith('.js')) out.push(p);
  }
  return out;
}

/** Corpo de uma função (da assinatura até a próxima função do mesmo nível, com 4 espaços de recuo). */
function functionBody(src, name) {
  const start = src.search(new RegExp(`(async )?function ${name}\\(`));
  if (start < 0) return null;
  const rest = src.slice(start + 10);
  const next = rest.search(/\n {4}(async )?function [A-Za-z]/);
  return src.slice(start, start + 10 + (next < 0 ? rest.length : next));
}

/** Verificações estáticas (sem importar nada, sem banco). */
export function checkRbacStatic(root = ROOT_DIR) {
  const violations = [];
  const read = (rel) => (fs.existsSync(path.join(root, rel)) ? fs.readFileSync(path.join(root, rel), 'utf8') : null);

  // 1) Contas mestras
  const me = read('src/config/master-emails.js');
  if (me === null) {
    violations.push(`${TAG} src/config/master-emails.js não existe: a lista de contas mestras precisa estar num único arquivo.`);
  } else {
    const arr = me.match(/MASTER_EMAILS\s*=\s*Object\.freeze\(\[([\s\S]*?)\]\)/);
    const found = arr ? [...arr[1].matchAll(/['"]([^'"]+)['"]/g)].map((m) => m[1].toLowerCase().trim()) : [];
    if (!arr) violations.push(`${TAG} MASTER_EMAILS não encontrado em src/config/master-emails.js (esperado: Object.freeze([...])).`);
    for (const e of found.filter((x) => !APPROVED_MASTER_EMAILS.includes(x))) violations.push(`${TAG} Conta mestra NÃO aprovada em src/config/master-emails.js: ${e}. Mestre novo exige decisão do Dr. Jorge e mudança deste guardião.`);
    for (const e of APPROVED_MASTER_EMAILS.filter((x) => arr && !found.includes(x))) violations.push(`${TAG} Conta mestra aprovada ausente de src/config/master-emails.js: ${e}.`);
  }
  for (const f of [...listJs(path.join(root, 'src')), path.join(root, 'server.js')]) {
    const rel = path.relative(root, f).split(path.sep).join('/');
    if (rel === 'src/config/master-emails.js' || !fs.existsSync(f)) continue;
    if (/process\.env\.GOOGLE_ADMIN_EMAILS/.test(fs.readFileSync(f, 'utf8'))) {
      violations.push(`${TAG} ${rel} usa GOOGLE_ADMIN_EMAILS para decidir mestres. Mestres só podem vir de src/config/master-emails.js.`);
    }
  }
  for (const rel of ['src/modules/auth/auth.routes.js', 'src/modules/hr/hr.routes.js']) {
    const t = read(rel);
    if (t !== null && /verifyGoogleToken\(/.test(t) && !/isMasterEmail\(/.test(t)) {
      violations.push(`${TAG} ${rel} faz login Google mas não usa isMasterEmail(): contas mestras não seriam reconhecidas.`);
    }
  }

  // 2) Verificador do Google
  const g = read('src/shared/google-auth.js');
  if (g === null) {
    violations.push(`${TAG} src/shared/google-auth.js não existe.`);
  } else {
    const i = g.indexOf("startsWith('mock-google-token:')");
    if (i >= 0 && !/mockTokensAllowed\(/.test(g.slice(i, i + 400))) violations.push(`${TAG} google-auth.js aceita o token de teste (mock-google-token) SEM o portão mockTokensAllowed(): qualquer um entraria como mestre.`);
    if (!/allowedAudiences\(env\)\.has\(/.test(g) || !/data\.aud/.test(g)) violations.push(`${TAG} google-auth.js não confere o destinatário (aud) do token: um token de outro aplicativo seria aceito.`);
    if (!/email_verified/.test(g)) violations.push(`${TAG} google-auth.js não confere o e-mail verificado (email_verified).`);
    if (/googleapis\.com\/oauth2\/v3\/userinfo/.test(g)) violations.push(`${TAG} google-auth.js voltou a ter o caminho por /userinfo, que não informa o aud.`);
    if (/process\.env\.NODE_ENV\s*!==\s*['"]production['"][^;\n]*mock/i.test(g)) violations.push(`${TAG} google-auth.js libera o token de teste por "não é produção": deve ser negado por padrão.`);
  }

  // 2b) Logins: vínculo EXATO entre pessoas (nunca por pedaço de nome) e operador suspenso não entra
  for (const rel of ['src/modules/auth/auth.routes.js', 'src/modules/hr/hr.routes.js', 'src/modules/access/access.routes.js']) {
    const t = read(rel);
    if (t === null) { violations.push(`${TAG} ${rel} não existe.`); continue; }
    if (/FROM (hr_employees|users)\s+WHERE[^`]*name\)?\s+LIKE/i.test(t)) {
      violations.push(`${TAG} ${rel} vincula pessoas por PEDAÇO do nome (LIKE): a operadora "Ana" receberia a sessão/dados de RH da "Mariana". Use src/shared/identity-link.js (vínculo exato).`);
    }
    // AUD-27: a RHABAC decide o acesso por FUNÇÃO (cargo), nunca por NOME PRÓPRIO.
    const semComentario = t.split('\n').filter((l) => !/^\s*(\/\/|\*)/.test(l)).join('\n');
    const nomeProprio = semComentario.match(/\b(mariana|gabriela|carlos|patricia|roberto|fernanda|camila)\b/i);
    if (nomeProprio) {
      violations.push(`${TAG} ${rel} decide acesso/identidade por NOME PRÓPRIO ("${nomeProprio[0]}"): proibido (AUD-27). A função vem do cargo/perfil, nunca do nome. Só o mestre é reconhecido (por e-mail/login).`);
    }
  }
  const authT = read('src/modules/auth/auth.routes.js');
  if (authT !== null && !/susp\.is_active === 0/.test(authT)) violations.push(`${TAG} auth.routes.js: o login por SENHA não barra operador suspenso (is_active = 0) na Matriz de Acessos.`);
  const hrT = read('src/modules/hr/hr.routes.js');
  if (hrT !== null && !/authSuspended/.test(hrT)) violations.push(`${TAG} hr.routes.js: o login do colaborador emite sessão de painel (adminToken) para operador suspenso.`);
  const rbacT = read('src/middleware/rbac.js');
  if (rbacT !== null && !/isSuspended\(panel\.userId\)/.test(rbacT)) violations.push(`${TAG} rbac.js: sessão de operador suspenso continua com acesso à API (falta a checagem isSuspended no guarda).`);

  // 3) Painel: toda entrada aplica as permissões
  const app = read('public/js/painel/painel-1-app.js');
  if (app === null) {
    violations.push(`${TAG} public/js/painel/painel-1-app.js não existe.`);
  } else {
    const central = functionBody(app, 'applyPermissionsAndLoadModules');
    if (!central) {
      violations.push(`${TAG} painel-1-app.js perdeu applyPermissionsAndLoadModules(): senha e Google deixam de aplicar as permissões por função.`);
    } else {
      if (!/await loadAndApplyUserPermissions\(\)/.test(central)) violations.push(`${TAG} applyPermissionsAndLoadModules() não chama loadAndApplyUserPermissions(): o menu apareceria completo.`);
      for (const fn of LOAD_FUNCS) {
        if (!new RegExp(`if \\(isM \\|\\| p\\.${MODULE_TAB[fn]} === 1\\) ${fn}\\(\\);`).test(central)) violations.push(`${TAG} applyPermissionsAndLoadModules() carrega ${fn}() sem exigir ${MODULE_TAB[fn]}.`);
      }
    }
    const entries = app.match(/showPanelScreen\(data\.user\);/g) || [];
    const guarded = app.match(/showPanelScreen\(data\.user\);\s*\n\s*await applyPermissionsAndLoadModules\(\)/g) || [];
    if (entries.length !== guarded.length) violations.push(`${TAG} painel-1-app.js: ${entries.length - guarded.length} entrada(s) (senha, Google ou sessão restaurada) abrem o painel sem applyPermissionsAndLoadModules().`);
    if (entries.length < 3) violations.push(`${TAG} painel-1-app.js: esperadas 3 entradas autenticadas (senha, Google, sessão restaurada), encontradas ${entries.length}. Um novo caminho de login precisa passar pela função central e atualizar este guardião.`);
    for (const fn of ['handleLogin', 'checkAuth', 'submitAdminGooglePayload']) {
      const body = functionBody(app, fn);
      if (!body) { violations.push(`${TAG} painel-1-app.js: função de entrada ${fn} não encontrada.`); continue; }
      for (const f of LOAD_FUNCS) if (new RegExp(`\\b${f}\\(`).test(body)) violations.push(`${TAG} ${fn} chama ${f}() por conta própria, sem checar a permissão do usuário.`);
    }
  }

  // 3b) Controle de janelas/menu: FECHADO por padrão (antes de as permissões chegarem, ou se falharem)
  const wm = read('public/js/painel/painel-3.js');
  if (wm === null) violations.push(`${TAG} public/js/painel/painel-3.js não existe.`);
  else if (!/var WM_MASTER=false,\s*WM_ALLOWED=\{\};/.test(wm)) violations.push(`${TAG} painel-3.js: o controle de módulos não começa FECHADO (WM_MASTER=false, WM_ALLOWED={}): enquanto as permissões não chegam, ou se falharem, o painel abriria tudo.`);

  // 3c) Aba criada/excluída => o RBAC precisa acompanhar (matriz, menu, servidor)
  if (wm !== null) {
    const mBlock = wm.slice(wm.indexOf('var MODULES'));
    const modules = new Set([...mBlock.slice(0, mBlock.indexOf('\n    };') > 0 ? mBlock.indexOf('\n    };') : 6000).matchAll(/(?:^|[\s,{])'?([a-z][a-z-]*)'?\s*:\s*\{\s*label:/g)].map((x) => x[1]));
    const objKeys = (name) => {
      const i = wm.indexOf(`var ${name}=`);
      if (i < 0) return null;
      const body = wm.slice(i, wm.indexOf('};', i));
      return [...body.matchAll(/'?([a-z][a-z-]*)'?\s*:\s*(?:'tab_\w+'|1)/g)].map((x) => x[1]);
    };
    const perm = objKeys('MODULE_PERM'), always = objKeys('ALWAYS_ALLOWED'), masterOnly = objKeys('MASTER_ONLY');
    if (modules.size < 20 || !perm || !always || !masterOnly) {
      violations.push(`${TAG} painel-3.js: não consegui ler MODULES / MODULE_PERM / ALWAYS_ALLOWED / MASTER_ONLY. Mantenha esses quatro objetos (o guardião confere que toda aba tem regra de acesso).`);
    } else {
      const classified = new Set([...perm, ...always, ...masterOnly]);
      for (const id of modules) if (!classified.has(id)) violations.push(`${TAG} ABA NOVA SEM REGRA DE ACESSO: "${id}" existe em MODULES (painel-3.js) mas não está em MODULE_PERM, ALWAYS_ALLOWED nem MASTER_ONLY. Atualize o RBAC: coluna na matriz (tab-users.js + painel.html), src/shared/permissions.js, regras da API (rbac-rules.js) e painel-1-app.js.`);
      for (const id of classified) if (!modules.has(id)) violations.push(`${TAG} ABA EXCLUÍDA AINDA NO RBAC: "${id}" está em MODULE_PERM/ALWAYS_ALLOWED/MASTER_ONLY mas não existe mais em MODULES. Remova do RBAC (e a coluna da matriz, se ela só servia a essa aba).`);
      const html = read('painel.html') || '';
      for (const id of new Set([...html.matchAll(/id="tab-content-([a-z-]+)"/g)].map((x) => x[1]))) if (!modules.has(id)) violations.push(`${TAG} painel.html tem a aba "tab-content-${id}" que não está em MODULES (painel-3.js): ela ficaria fora do RBAC.`);

      // chaves de permissão: as usadas existem, e cada uma tem switch e coluna na matriz
      const permFile = path.join(root, 'src/shared/permissions.js');
      if (!fs.existsSync(permFile)) violations.push(`${TAG} src/shared/permissions.js não existe.`);
      else {
        const known = new Set([...fs.readFileSync(permFile, 'utf8').matchAll(/'(tab_\w+)'/g)].map((x) => x[1]));
        const used = new Set([...wm.matchAll(/:\s*'(tab_\w+)'/g)].map((x) => x[1]));
        for (const k of used) if (!known.has(k)) violations.push(`${TAG} painel-3.js usa a permissão "${k}", que não existe em src/shared/permissions.js.`);
        const users = read('public/js/tabs/tab-users.js') || '';
        const switches = new Set([...users.matchAll(/\{ key: '(tab_\w+)'/g)].map((x) => x[1]));
        for (const k of known) if (!switches.has(k)) violations.push(`${TAG} a permissão "${k}" não tem switch na matriz (TABS_CONFIG em public/js/tabs/tab-users.js).`);
        for (const k of switches) if (!known.has(k)) violations.push(`${TAG} a matriz tem o switch "${k}", que não existe em src/shared/permissions.js (aba excluída?).`);
        const th = html.slice(Math.max(0, html.indexOf('id="access-matrix-tbody"') - 4000), html.indexOf('id="access-matrix-tbody"'));
        const cols = (th.match(/<th /g) || []).length;
        if (cols !== switches.size + 4) violations.push(`${TAG} a tabela da matriz (painel.html) tem ${cols} colunas, mas deveria ter ${switches.size + 4} (${switches.size} switches + cadastrado, perfil, testar visão e status).`);
      }
    }
  }

  // 4a) rbac.js continua negando por padrão
  const rbac = read('src/middleware/rbac.js');
  if (rbac === null) violations.push(`${TAG} src/middleware/rbac.js não existe.`);
  else if (!/if \(!rule\)\s*\{[\s\S]{0,200}?return deny\(/.test(rbac)) violations.push(`${TAG} rbac.js deixou de NEGAR rotas /api sem regra (deny-by-default).`);
  return violations;
}

/** Cobertura: toda rota /api tem regra e nenhuma rota sensível é pública. Importa só o módulo puro de regras. */
export async function checkRbacCoverage(root = ROOT_DIR) {
  const violations = [];
  const rulesFile = path.join(root, 'src/middleware/rbac-rules.js');
  if (!fs.existsSync(rulesFile)) return [`${TAG} src/middleware/rbac-rules.js não existe.`];
  const mod = await import(`${pathToFileURL(rulesFile).href}?t=${Date.now()}${Math.random()}`);
  const { ruleFor, PUBLIC } = mod;

  const RE = /\.(get|post|put|patch|delete)\(\s*['"`](\/api\/[^'"`]+)['"`]/g;
  const seen = new Set();
  for (const f of [...listJs(path.join(root, 'src')), path.join(root, 'server.js')]) {
    if (!fs.existsSync(f)) continue;
    const text = fs.readFileSync(f, 'utf8');
    let m;
    while ((m = RE.exec(text))) {
      const method = m[1].toUpperCase();
      const route = m[2].replace(/:[A-Za-z_]+/g, 'x').replace(/\$\{[^}]+\}/g, 'x').split('?')[0];
      const key = `${method} ${route}`;
      if (seen.has(key)) continue;
      seen.add(key);
      if (!ruleFor(route, method)) violations.push(`${TAG} ${key} (${path.relative(root, f).split(path.sep).join('/')}) NÃO tem regra em rbac-rules.js: o servidor nega por padrão, então ela responde 403 até para o mestre.`);
    }
  }
  for (const prefix of SENSITIVE_PREFIXES) {
    for (const method of ['GET', 'POST', 'PUT', 'PATCH', 'DELETE']) {
      const rule = ruleFor(`${prefix}/x`, method);
      if (rule && rule[1] === PUBLIC) violations.push(`${TAG} ${method} ${prefix}/… é PÚBLICA em rbac-rules.js: rota sensível sem login.`);
    }
  }
  return violations;
}

/** Tudo junto. @returns {Promise<{violations:string[]}>} */
const SENHA_LITERAL = /\b(password|passwd|new_password|current_password|[A-Z_]*PASS)\b['"]?\s*[:=]\s*['"][^'"$]{4,}['"]/;
// a senha antiga só conta quando aparece como senha (o texto "jorgealvim" também é apelido de usuário, o que é permitido)
const SENHA_ANTIGA = /(password|passwd|pass|senha)[^\n]*['"`]jorgealvim['"`]/i;

/** REGRA 6: nenhuma senha escrita no código (fora de tests/, que usam bancos temporários). */
export function checkNoWrittenPasswords(root = ROOT_DIR) {
  const violations = [];
  const arquivos = [];
  const walk = (dir) => {
    if (!fs.existsSync(dir)) return;
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) { if (!['node_modules', '.git', 'tests', 'vendor'].includes(e.name)) walk(p); }
      else if (/\.(js|mjs|py|sh|yml|yaml)$/.test(e.name)) arquivos.push(p);
    }
  };
  ['scripts', 'src', 'e2e', '.github', 'public/js'].forEach((d) => walk(path.join(root, d)));
  ['server.js', 'playwright.config.js'].forEach((f) => fs.existsSync(path.join(root, f)) && arquivos.push(path.join(root, f)));
  for (const f of arquivos) {
    const rel = path.relative(root, f);
    if (rel === 'scripts/check-rbac-guard.js') continue;
    fs.readFileSync(f, 'utf8').split('\n').forEach((linha, i) => {
      if (/^\s*(\/\/|\*|#)/.test(linha)) return;
      if (SENHA_LITERAL.test(linha) || SENHA_ANTIGA.test(linha)) {
        violations.push(`${TAG} Senha escrita no código em ${rel}:${i + 1}. Use o cofre/variável de ambiente (o login por senha segue valendo, mas a senha fica fora do código).`);
      }
    });
  }
  return violations;
}

export async function checkRbac(root = ROOT_DIR) {
  return { violations: [...checkRbacStatic(root), ...checkNoWrittenPasswords(root), ...(await checkRbacCoverage(root))] };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { violations } = await checkRbac(ROOT_DIR);
  console.log('\nGuardião do RBAC (senha, Google e contas mestras)');
  if (violations.length) violations.forEach((v) => console.log(`  ${v}`));
  else console.log(`  ✅ RBAC íntegro: ${APPROVED_MASTER_EMAILS.length} contas mestras, login por senha e Google só abrem abas conforme a permissão`);
  process.exit(violations.length ? 1 : 0);
}
