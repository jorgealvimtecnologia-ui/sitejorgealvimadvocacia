# Qualidade & Testes

Este projeto tem uma base de qualidade automatizada. Tudo roda **sem tocar no banco
real** (`leads.db`): os testes usam um banco SQLite temporário via `DB_PATH`.

## Comandos

| Comando | O que faz |
| --- | --- |
| `npm test` | Testes de integração da API (runner nativo do Node + Supertest). |
| `npm run test:watch` | Mesmos testes em modo watch (reexecuta ao salvar). |
| `npm run test:health` | Health check de integridade do banco (script legado). |
| `npm run test:e2e` | Testes ponta a ponta (Playwright) num navegador real. |
| `npm run lint` | ESLint — falha em **erros**; avisos não bloqueiam. |
| `npm run lint:fix` | Corrige automaticamente o que o ESLint conseguir. |
| `npm run format` | Formata o código com Prettier. |
| `npm run format:check` | Confere formatação sem alterar arquivos. |

## Testes de integração (`npm test`)

Arquivo: [`tests/api.test.js`](../tests/api.test.js). Usamos o **test runner nativo
do Node** (`node --test`) em vez do Vitest de propósito: o servidor importa o builtin
`node:sqlite`, que o bundler do Vite ainda não resolve. O runner nativo executa o
mesmo ESM do runtime, casando exatamente com produção.

Cobertura atual dos fluxos críticos:

- **Health check** — `GET /health`.
- **Autenticação** — login válido (mestre), sem campos (400), senha errada (401),
  rota protegida sem token (401), `/api/auth/me` com token.
- **CRUD de Clientes** — criar (201), validação de obrigatórios (400), listar, excluir.
- **RBAC** — perfil restrito (secretária) recebe **403** em `/api/financial`, mas
  acessa `/api/clients`; o mestre faz bypass.
- **Validação do Kanban** — cartão sem título (400), cartão válido (200).

### Isolamento do banco

Antes de importar o `server.js`, os testes definem `NODE_ENV=test` (não abre a porta
nem liga os agendadores) e `DB_PATH` apontando para um arquivo temporário do sistema,
apagado ao final. O `leads.db` real **nunca** é lido ou escrito.

## E2E (`npm run test:e2e`)

Arquivo: [`e2e/smoke.spec.js`](../e2e/smoke.spec.js). O Playwright sobe o servidor
automaticamente numa porta de teste com banco temporário e valida, num navegador real:
carregamento do site, login do painel com o usuário mestre e rejeição de senha errada.

Primeira vez (baixa o Chromium):

```bash
npx playwright install chromium
npm run test:e2e
```

## Integração Contínua (CI)

[`.github/workflows/ci.yml`](../.github/workflows/ci.yml) roda em cada push/PR para
`main`: instala dependências, roda **ESLint** e **testes**. O build do Vite roda como
passo informativo (não bloqueia), pois o deploy de produção é por cópia de arquivos —
o Express serve os `.html` diretamente e o build do Vite não faz parte do pipeline.
