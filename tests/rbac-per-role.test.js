/**
 * TESTE POR PERFIL (função): para CADA perfil da matriz, entra com a senha e confere
 *  1. todas as rotas GET da API: o que a função pode abrir responde, o que não pode dá 403;
 *  2. a Visão Geral e o cockpit: nenhum número de aba bloqueada;
 *  3. o menu: os módulos que o painel mostraria batem com as abas da função.
 * Perfil novo na matriz já nasce testado aqui (os perfis vêm da própria API da matriz).
 */
import { describe, it, after, before } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TMP_DB = path.join(os.tmpdir(), `jaw-roles-${Date.now()}.db`);
process.env.NODE_ENV = 'test';
process.env.DB_PATH = TMP_DB;
process.env.MASTER_PASSWORD = 'SenhaRealDoMestre#2026';

const { app, db } = await import('../server.js');
const { hashPassword } = await import('../src/shared/password-crypto.js');
const { effectivePerms, ALL_TABS } = await import('../src/shared/permissions.js');
const { ruleFor, PUBLIC, ANY, CLIENT, EMPLOYEE, PANEL, PANEL_OR_EMPLOYEE, MASTER } = await import('../src/middleware/rbac-rules.js');

after(() => {
  try { db?.close?.(); } catch {}
  for (const f of [TMP_DB, `${TMP_DB}-wal`, `${TMP_DB}-shm`]) { try { fs.unlinkSync(f); } catch {} }
});

const SENHA = 'SenhaDeTeste#2026';
const auth = (t) => ({ Authorization: `Bearer ${t}` });

/** Todas as rotas GET da API, lidas do código (mesma varredura do guardião). */
function listarRotasGet() {
  const arquivos = [];
  const varrer = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) varrer(p);
      else if (e.name.endsWith('.js')) arquivos.push(p);
    }
  };
  varrer(path.join(ROOT, 'src'));
  arquivos.push(path.join(ROOT, 'server.js'));
  const rotas = new Set();
  for (const f of arquivos) {
    const t = fs.readFileSync(f, 'utf8');
    for (const m of t.matchAll(/\.get\(\s*['"`](\/api\/[^'"`]+)['"`]/g)) {
      rotas.add(m[1].replace(/:[A-Za-z_]+/g, 'x').replace(/\$\{[^}]+\}/g, 'x').split('?')[0]);
    }
  }
  // fora do teste: fluxo contínuo, chamadas a serviços externos, downloads pesados
  const EXCLUIR = /\/search-live\b|\/stream\b|\/legaltech\/(cep|cnpj)|\/meta-ads|datajud|\/lookup\/|\/download|export-full|google-config/;
  return [...rotas].filter((r) => !EXCLUIR.test(r)).sort();
}
const ROTAS = listarRotasGet();

/** O que a regra manda para quem NÃO é mestre: 'permitido' | 'negado'. */
function esperado(rota, perms) {
  const regra = ruleFor(rota, 'GET');
  if (!regra) return 'negado';
  const need = regra[1];
  if (need === PUBLIC) return null; // sem login: não se aplica
  if (need === ANY || need === PANEL || need === PANEL_OR_EMPLOYEE) return 'permitido';
  if (need === CLIENT || need === EMPLOYEE || need === MASTER) return 'negado';
  if (need && need.panelTab) return perms[need.panelTab] === 1 ? 'permitido' : 'negado';
  return 'negado';
}

const RBAC_MSG = /não tem permissão|Acesso negado|Recurso não disponível|restrita ao Usuário Mestre|perfil de operador está desativado/i;
let masterToken;
let perfis = [];
const logados = {}; // perfil -> { token, perms, userId }

before(async () => {
  masterToken = (await request(app).post('/api/auth/login').send({ identifier: 'jorgealvimtecnologia', password: process.env.MASTER_PASSWORD })).body.token;
  assert.ok(masterToken, 'login do mestre falhou');
  const m = await request(app).get('/api/access-control/matrix').set(auth(masterToken));
  perfis = Object.keys(m.body.templates).filter((k) => !['master', 'cliente'].includes(k));
  const p = hashPassword(SENHA);
  for (const perfil of perfis) {
    const id = `U-ROLE-${perfil}`;
    const username = `perfil.${perfil}`.replace(/_/g, '.');
    db.prepare(`INSERT INTO users (id, username, password_hash, salt, name, role, created_at) VALUES (?, ?, ?, ?, ?, ?, datetime('now'))`).run(id, username, p.hash, p.salt, `Teste ${perfil}`, perfil);
    db.prepare(`INSERT INTO access_permissions (id, user_id, user_type, user_name, user_identifier, role_template, is_active, data_scope, created_at, updated_at) VALUES (?, ?, 'admin', ?, ?, 'custom', 1, 'office', datetime('now'), datetime('now'))`).run(`P-${id}`, id, `Teste ${perfil}`, username);
    const ap = await request(app).post('/api/access-control/apply-template').set(auth(masterToken)).send({ user_id: id, template_key: perfil });
    assert.equal(ap.status, 200, `aplicar o perfil ${perfil}: ${JSON.stringify(ap.body)}`);
    const l = await request(app).post('/api/auth/login').send({ identifier: username, password: SENHA });
    assert.equal(l.status, 200, `login do perfil ${perfil}: ${JSON.stringify(l.body)}`);
    const row = db.prepare('SELECT * FROM access_permissions WHERE user_id = ?').get(id);
    logados[perfil] = { token: l.body.token, perms: effectivePerms(row), userId: id };
  }
  // dados reais para provar que nada vaza: receita, cliente e processo
  db.prepare(`INSERT INTO financial_transactions (id, type, category, description, amount, status, payment_date, created_at, updated_at) VALUES ('FT-ROLE', 'Receita', 'honorarios', 'x', 98765.43, 'Pago', date('now'), datetime('now'), datetime('now'))`).run();
});

describe('perfis disponíveis', () => {
  it('há perfis para testar (a lista vem da própria matriz)', () => {
    assert.ok(perfis.length >= 5, `só ${perfis.length} perfis: ${perfis.join(', ')}`);
    assert.ok(ROTAS.length > 80, `só ${ROTAS.length} rotas GET encontradas`);
  });
});

describe('1. rotas da API por perfil', () => {
  it('cada perfil: permitido onde a função manda, 403 onde não manda (todas as rotas GET)', async function () {
    const falhas = [];
    let verificadas = 0;
    for (const perfil of perfis) {
      const { token, perms } = logados[perfil];
      for (const rota of ROTAS) {
        const esp = esperado(rota, perms);
        if (esp === null) continue;
        const r = await request(app).get(rota).set(auth(token)).timeout(8000).catch((e) => ({ status: 0, erro: e.message }));
        verificadas++;
        const negou = r.status === 403;
        // 403 do RBAC (as mensagens do guarda) ≠ 403 que o próprio handler ou um serviço externo devolve
        const doRbac = negou && RBAC_MSG.test(String((r.body && r.body.error) || ''));
        if (esp === 'negado' && !negou) falhas.push(`${perfil}: ${rota} deveria dar 403 e deu ${r.status}`);
        if (esp === 'permitido' && doRbac) falhas.push(`${perfil}: ${rota} deveria liberar e o RBAC negou: ${JSON.stringify(r.body).slice(0, 90)}`);
      }
    }
    assert.ok(verificadas > 300, `poucas verificações: ${verificadas}`);
    assert.deepEqual(falhas, [], `\n${falhas.slice(0, 25).join('\n')}`);
  });
});

/**
 * Tabela INDEPENDENTE das regras (escrita à mão): área da API -> aba que a libera.
 * Se alguém afrouxar uma regra em rbac-rules.js, o teste 1 acompanharia a regra; este NÃO acompanha.
 */
const AREA_ABA = {
  '/api/clients': 'tab_clients', '/api/ocr': 'tab_clients', '/api/documents': 'tab_clients', '/api/legal-docs': 'tab_clients',
  '/api/leads': 'tab_leads', '/api/analytics/summary': 'tab_leads', '/api/admin/visits': 'tab_leads', '/api/admin/pre-clients': 'tab_leads',
  '/api/lawsuits': 'tab_lawsuits', '/api/admin-requests': 'tab_lawsuits',
  '/api/court': 'tab_publications', '/api/publications': 'tab_publications', '/api/sync': 'tab_publications',
  '/api/calendar': 'tab_calendar', '/api/booking/settings': 'tab_calendar', '/api/booking/appointments': 'tab_calendar', '/api/judicial': 'tab_radar', '/api/offices': 'tab_offices', '/api/drive': 'tab_drive',
  '/api/hr/': 'tab_hr', '/api/financial': 'tab_financial', '/api/nfse': 'tab_nfse', '/api/esign/requests': 'tab_esign',
  '/api/dashboard': 'tab_dashboard', '/api/kanban': 'tab_kanban', '/api/notifications': 'tab_alerts',
  '/api/admin/audit-logs': 'tab_audit', '/api/lgpd': 'tab_audit', '/api/admin/blog': 'tab_blog', '/api/admin/site': 'tab_blog',
  '/api/meta-ads': 'tab_settings', '/api/explorer': 'tab_settings',
};
const SO_MESTRE = ['/api/users', '/api/admin/maintenance', '/api/admin/backup', '/api/admin/roadmap', '/api/admin/qa', '/api/deadline-alerts', '/api/access-control/matrix'];

describe('1b. tabela independente: área da API x aba, por perfil', () => {
  it('cada perfil só abre a área cuja aba tem; só o mestre abre as áreas de administração', async () => {
    const falhas = [];
    let n = 0;
    for (const perfil of perfis) {
      const { token, perms } = logados[perfil];
      for (const rota of ROTAS) {
        const pref = Object.keys(AREA_ABA).find((a) => rota.startsWith(a));
        if (pref && /^\/api\/(hr\/(employee|portal|reports\/annual-financial\/employee)|notifications\/(stream|whatsapp-template)|esign\/(public|verify|requests\/[^/]+\/chancelado))/.test(rota)) continue;
        if (pref) {
          const aba = AREA_ABA[pref];
          const r = await request(app).get(rota).set(auth(token)).timeout(8000).catch(() => ({ status: 0 }));
          n++;
          if (perms[aba] !== 1 && r.status !== 403) falhas.push(`${perfil}: ${rota} abriu sem a aba ${aba} (status ${r.status})`);
        }
        if (SO_MESTRE.some((a) => rota.startsWith(a))) {
          const r = await request(app).get(rota).set(auth(token)).timeout(8000).catch(() => ({ status: 0 }));
          n++;
          if (r.status !== 403) falhas.push(`${perfil}: ${rota} é só do mestre e abriu (status ${r.status})`);
        }
      }
    }
    assert.ok(n > 150, `poucas verificações: ${n}`);
    assert.deepEqual(falhas, [], `\n${falhas.slice(0, 25).join('\n')}`);
  });
});

describe('2. Visão Geral e cockpit por perfil', () => {
  it('nenhum perfil recebe números de área bloqueada', async () => {
    const falhas = [];
    for (const perfil of perfis) {
      const { token, perms } = logados[perfil];
      if (perms.tab_dashboard !== 1) continue;
      const o = (await request(app).get('/api/dashboard/overview?refresh=1').set(auth(token))).body;
      if (!o.financeiro) continue;
      if (perms.tab_financial !== 1 && (o.financeiro.receita_mes || 0) !== 0) falhas.push(`${perfil}: vê a receita (${o.financeiro.receita_mes}) sem a aba Financeiro`);
      if (perms.tab_financial !== 1 && JSON.stringify(o.financeiro).match(/98765/)) falhas.push(`${perfil}: valor do financeiro vazou`);
      if (perms.tab_hr !== 1 && (o.equipe?.funcionarios_ativos || 0) !== 0) falhas.push(`${perfil}: vê funcionários sem a aba RH`);
      if (perms.tab_lawsuits !== 1 && (o.juridico?.processos_total || 0) !== 0) falhas.push(`${perfil}: vê processos sem a aba Processos`);
      if (perms.tab_clients !== 1 && (o.juridico?.clientes_total || 0) !== 0) falhas.push(`${perfil}: vê clientes sem a aba Clientes`);
      if (perms.tab_leads !== 1 && (o.comercial?.leads_novos || 0) + (o.comercial?.leads_mes || 0) !== 0) falhas.push(`${perfil}: vê leads sem a aba Leads`);
      if (perms.tab_esign !== 1 && (o.compliance?.assinaturas_pendentes || 0) !== 0) falhas.push(`${perfil}: vê assinaturas sem a aba Assinaturas`);
      const agenda = perms.tab_calendar === 1 || perms.tab_lawsuits === 1;
      if (!agenda && (o.prazos?.proximos || []).length) falhas.push(`${perfil}: vê prazos sem Agenda nem Processos`);
      const c = (await request(app).get('/api/dashboard/meu-dia-hoje').set(auth(token))).body;
      if (perms.tab_publications !== 1 && (c.intimacoes || []).length) falhas.push(`${perfil}: vê intimações do DJEN sem a aba Intimações`);
      if (!agenda && ((c.audiencias || []).length || (c.prazos?.semana || []).length)) falhas.push(`${perfil}: vê audiências/prazos sem Agenda nem Processos`);
    }
    assert.deepEqual(falhas, [], `\n${falhas.join('\n')}`);
  });
  it('o mestre continua vendo o financeiro real', async () => {
    const o = (await request(app).get('/api/dashboard/overview?refresh=1').set(auth(masterToken))).body;
    assert.ok(o.financeiro.receita_mes >= 98765, `receita do mestre: ${o.financeiro.receita_mes}`);
  });
});

describe('3. menu do painel por perfil', () => {
  const wm = fs.readFileSync(path.join(ROOT, 'public/js/painel/painel-3.js'), 'utf8');
  const bloco = (nome) => {
    const i = wm.indexOf(`var ${nome}=`);
    return wm.slice(i, wm.indexOf('};', i));
  };
  const modulePerm = Object.fromEntries([...bloco('MODULE_PERM').matchAll(/'?([a-z][a-z-]*)'?\s*:\s*'(tab_\w+)'/g)].map((m) => [m[1], m[2]]));
  const sempre = new Set([...bloco('ALWAYS_ALLOWED').matchAll(/'?([a-z][a-z-]*)'?\s*:\s*1/g)].map((m) => m[1]));

  it('o menu só mostra módulos cuja aba a função tem (e o que o servidor também libera)', () => {
    const falhas = [];
    for (const perfil of perfis) {
      const { perms } = logados[perfil];
      for (const [modulo, aba] of Object.entries(modulePerm)) {
        if (perms[aba] !== 1) continue; // não aparece: nada a conferir
        assert.ok(ALL_TABS.includes(aba), `${modulo} usa a permissão ${aba}, que não existe`);
      }
      // todo módulo liberado a todos tem de ser inofensivo: sem aba nem rota de dados sensíveis
      for (const m of sempre) if (!['rockets'].includes(m)) falhas.push(`${perfil}: módulo "${m}" aberto a todos sem aba (deveria ter uma coluna na matriz)`);
    }
    assert.deepEqual([...new Set(falhas)], [], `\n${[...new Set(falhas)].join('\n')}`);
  });
});
