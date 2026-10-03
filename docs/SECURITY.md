# Segurança — defesa em profundidade

Camadas independentes de proteção, de forma que a falha de uma não derrube o sistema.

## Autenticação e senhas

- **Hash PBKDF2-SHA512, 210k iterações** — senha nunca é gravada em texto puro
  (coluna `plain_password` é limpa no boot). Upgrade transparente de hashes legados
  no login (sem travar ninguém).
- **Política de senha: 10 a 64 caracteres** (frases longas permitidas, sem regras de
  composição — NIST 800-63B) — fonte única da verdade em
  [`src/shared/password-policy.js`](../src/shared/password-policy.js), aplicada em
  **todos** os pontos: criação/edição de usuário, redefinição, portal do cliente
  (cadastro, troca e recuperação) e nos scripts de reset/definição da senha do mestre.
  O front reforça com `minlength`/`maxlength` (UX) e `tests/password-policy.test.js`
  falha se algum formulário divergir da política; o backend é a autoridade.
- **Senhas antigas não travam ninguém:** quem entra com uma senha criada antes da política
  atual continua entrando, e o login devolve `password_policy_outdated` para o painel e o
  portal do cliente avisarem que é hora de trocar. (A comparação só é possível no momento
  do login, pois o banco guarda apenas o hash.)
- **Sem senhas universais** — removidas dos portais e da assinatura de ponto.

## Anti força-bruta (duas camadas)

1. **Rate-limit por IP** — 15 tentativas / 15 min por IP (`loginRateLimit`).
2. **Bloqueio progressivo por FALHAS** — conta falhas consecutivas por (IP + usuário)
   e impõe uma espera que **cresce**: 5–7 falhas → 30 s; 8–11 → 2 min; 12–19 → 15 min;
   20+ → 1 h. Um login bem-sucedido zera o contador. Resposta `429` com `Retry-After`.
   Cobertos por teste automatizado.

## Autorização (RBAC — na tela E no servidor)

- **Front** filtra o menu e bloqueia `openModule` conforme a matriz de permissões.
- **Backend** (defesa em profundidade): middleware por prefixo em `server.js` barra
  rotas por perfil mesmo via API direta (ex.: secretária → `/api/financial` = 403);
  o mestre faz bypass. Coberto por teste (`RBAC — perfil restrito`).

## Cabeçalhos e transporte

- HTTPS (Let's Encrypt), **HSTS**, **CSP**, **CORS** por origem (`ALLOWED_ORIGINS`).
- Diretório-raiz não é servido (não expõe `leads.db`/`server.js`); uploads sandbox.
- Proteção contra **path traversal** no Explorer (`expResolve` dentro de `EXPLORER_ROOT`).

## Dependências (OWASP A06)

- **`npm audit`** roda na CI (`npm run audit`, produção, nível high+) como sinal.
  Estado atual: **0 vulnerabilidades**.

## Login com Google

Os 4 logins Google (painel, unificado, colaborador, portal do cliente) passam por `verifyGoogleToken` (`src/shared/google-auth.js`),
que exige: validação **com o Google**; token emitido **para este sistema** (`aud` = nosso Client ID; extras em `GOOGLE_ALLOWED_AUDIENCES`);
emissor Google; **e-mail verificado**. Depois do login a sessão é a mesma do login por senha: o acesso a cada aba segue a matriz de
permissões do usuário (RBAC), sem atalho para "todas as abas".

> **Incidente corrigido (03/10/2026):** a função aceitava um "token de teste" (`mock-google-token:<id>:<e-mail>:<nome>`) **em qualquer
> ambiente, inclusive produção**. Como o e-mail do Dr. Jorge é aceito como mestre, qualquer pessoa na internet podia entrar como
> **mestre** sem conta Google, com acesso a clientes, financeiro e usuários. Existia desde 19/09/2026. Agora o token de teste só vale com
> `NODE_ENV=test` (ou, fora de produção, `ALLOW_MOCK_GOOGLE_TOKEN=1`); o caminho alternativo por `/userinfo`, que não informa o `aud`, foi removido.
> **Depois de publicar a correção, rode no servidor:** `node scripts/check-google-forgery.js` (somente leitura). Ele procura `google_id`
> que não é numérico (rastro de login forjado) e lista os logins Google por IP. Se achar algo: trocar a senha da conta, apagar o
> `google_id` suspeito, encerrar as sessões e revisar a auditoria.

## Segredos do `.env` (cofre criptografado + guardião)

- O `.env` com segredos **nunca** fica em texto puro no GitHub, na imagem Docker nem no servidor: os segredos vão para
  `.env.enc` (AES-256-GCM, chave via scrypt) e a chave fica **fora do projeto** (`/etc/advocacia/env.key`, 600).
- O guardião (`npm run check:architecture`, na CI e no `npm test`) reprova `.env`/chaves versionados, `.dockerignore` sem `.env`,
  script que envie o `.env`, nginx sem bloqueio de arquivos ocultos e `backup.sh` que copie o `.env`. O deploy recusa publicar
  com segredos em texto puro no servidor. A CI confere o site ao vivo todo dia (`/.env`, `/.git/config`, `/leads.db`...).
- Toda alteração do `.env` gera e-mail ao titular com relatório **só de nomes** e a cópia **criptografada** do cofre.
- Roteiro completo, migração e comandos: [`docs/INFRA.md`](INFRA.md#env-criptografado-no-servidor-cofre-e-o-guardião-do-env).

## NÃO implementado (decisão do produto)

- **2FA/TOTP** — deliberadamente fora de escopo por ora.

## Checklist OWASP Top 10 (revisar a cada release)

| # | Risco | Como estamos |
| --- | --- | --- |
| A01 | Quebra de controle de acesso | RBAC na tela **e** no servidor; mestre = bypass. |
| A02 | Falhas criptográficas | PBKDF2-SHA512 210k; sem texto puro; HTTPS/HSTS. |
| A03 | Injeção | SQL via *prepared statements* (`db.prepare`) em todo o código. |
| A04 | Design inseguro | Validação centralizada de entrada + política de senha única. |
| A05 | Configuração incorreta | CSP/HSTS/CORS; raiz não servida; segredos no `.env`. |
| A06 | Componentes vulneráveis | `npm audit` na CI (high+). |
| A07 | Falhas de autenticação | Rate-limit + bloqueio progressivo; sem senhas universais. |
| A08 | Integridade de dados/software | Deploy com backup pré-deploy; migrations versionadas. |
| A09 | Falhas de log/monitoramento | Trilha de auditoria (`logAudit`) + `/health`. |
| A10 | SSRF | Sem fetch de URLs controladas pelo usuário nas rotas do painel. |

## Rotina de segurança por release

Rodar **antes de cada deploy de produção** (leva poucos minutos):

1. **`npm audit`** — `npm run audit` (produção, high+). Deve dar **0**. Se acender, avaliar
   `npm audit fix` (sem `--force`) e revisar o que muda.
2. **Testes** — `npm test` deve estar **verde** (inclui login, RBAC, política de senha,
   bloqueio progressivo). A CI também roda isso a cada push/PR.
3. **Lint** — `npm run lint` sem **erros** (avisos toleráveis).
4. **Revisão rápida OWASP Top 10** — passar os olhos na tabela acima; qualquer rota nova
   deve entrar com `requireAuth`/RBAC, validação de entrada (`validate`) e prepared
   statements (nunca concatenar SQL).
5. **Segredos** — conferir que nada sensível (chaves Asaas, tokens) foi commitado; tudo
   no `.env` do servidor.
6. **Deploy** — `deploy-servidor.bat` (faz backup pré-deploy; rollback via
   `reverter-deploy.bat` se preciso).

> Periodicidade mínima recomendada mesmo sem release novo: rodar o passo 1 (`npm audit`)
> a cada 1–2 meses, pois vulnerabilidades de dependências surgem com o tempo.

## Guardião do RBAC e contas mestras

- **Senha do painel e senha Google obedecem à mesma regra de permissões** (por função/usuário, negado por padrão). Toda entrada do painel passa por `applyPermissionsAndLoadModules()`; toda rota `/api` tem regra em `src/middleware/rbac-rules.js`.
- **Contas mestras (únicas):** `jorgealvimtecnologia@gmail.com`, `jorgealvim10@gmail.com`, `jorgealvimadvocacia@gmail.com` (`src/config/master-emails.js`). Variável de ambiente não cria mestre (`GOOGLE_ADMIN_EMAILS` foi aposentada).
- `npm run check:rbac` (e `check:architecture`) reprova: mestre fora da lista, Google sem `aud`/e-mail verificado, token de teste sem portão, painel que abre módulo sem checar a aba, rota `/api` sem regra ou rota sensível pública.
- Atenção: `jorgealvimadvocacia@gmail.com` é o e-mail público do escritório (alvo de phishing). Proteja as 3 contas Google com verificação em duas etapas **do próprio Google** (isso não é 2FA do sistema).

- **API de administração por aba (corrigido):** `/api/admin/*` era liberada a qualquer operador logado; o menu escondia as abas, mas o servidor não barrava. Agora: manutenção/backups/sessões = só mestre; auditoria, blog, FAQ/site e WhatsApp = aba Config; tráfego e pré-clientes = aba Leads; `/api/admin/*` sem regra é negada.
- **Painel fechado por padrão:** o gerenciador de janelas só libera módulos depois de receber as permissões do servidor (e fecha se a resposta falhar).
- **Matriz de acessos com colunas separadas:** além das 14 originais, agora há **NFS-e**, **Assinaturas**, **Blog & Site**, **Auditoria & LGPD** e **Alertas** (a coluna "Ficha Anual" passou a se chamar **Financeiro**). Migration `002`: as colunas novas **herdam** a antiga (Financeiro → NFS-e/Assinaturas; Config → Blog/Auditoria; Processos ou Agenda → Alertas), então ninguém ganha nem perde acesso ao atualizar; depois o mestre liga/desliga cada uma. Manutenção (backups, sessões, VACUUM) e Roadmap são só do mestre. Menu e API usam as mesmas chaves (`src/shared/permissions.js`).
- **Mais três colunas na matriz:** Visão Geral, Kanban e Ferramentas (editor/calculadora) — migration `003`, herdam "liberado" para ninguém perder acesso; o mestre desliga por pessoa e a API (`/api/dashboard`, `/api/kanban`) passa a negar. Papel `sem_perfil` (não reconhecido) não libera nada. O gerador de documentos usa a aba **Clientes** no menu e na API (antes o servidor pedia Processos).
- **Logins (auditoria):** (1) operador **suspenso** (`is_active = 0`) não entra mais com a senha e perde a API mesmo com sessão aberta; (2) o vínculo operador↔colaborador do RH passou a ser **exato** (`src/shared/identity-link.js`: mesmo id ou nome completo igual, sem título/acento, e único) — antes casava por pedaço do nome e a operadora "Ana" recebia a sessão de colaborador da "Mariana"; (3) "esqueci a senha" não casa mais por pedaço de nome; (4) ferramentas que liam dados (sincronização DJEN, documentos, IA, tráfego, conflito de interesses) exigem a aba do dado.
