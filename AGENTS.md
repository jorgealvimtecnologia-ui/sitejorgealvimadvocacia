# 🛡️ GUARDIÃO DA ARQUITETURA MODULAR & DIRETRIZES DE PROJETO
## Jorge Alvim Advocacia — OAB/MG 222.943

Este documento define as regras inegociáveis de engenharia de software e arquitetura modular para este projeto. Todo agente de inteligência artificial e desenvolvedor que atuar neste repositório DEVE OBRIGATORIAMENTE seguir estas diretrizes **antes de escrever, alterar ou salvar qualquer arquivo**.

---

### 🚨 REGRA SUPREMA: MODULARIZAÇÃO OBRIGATÓRIA (PROIBIÇÃO DE MONÓLITOS)
> **A cada nova inclusão, os arquivos devem ser SEMPRE separados por módulos coesos e desacoplados.**  
> **É ESTRITAMENTE PROIBIDO colar ou criar blocos de código compactos e gigantescos em arquivos centrais.**

1. **Arquitetura Backend (`server.js` & `src/modules/`):**
   * O arquivo `server.js` é um **orquestrador de infraestrutura** (Express, middlewares globais, conexão SQLite, graceful shutdown).
   * Novas rotas de API (`/api/...`) **NÃO** devem ser adicionadas diretamente no `server.js`.
   * Toda nova funcionalidade deve ser criada em `src/modules/<nome_modulo>/`:
     * `<nome_modulo>.routes.js`: Definição de endpoints HTTP e validação de entrada.
     * `<nome_modulo>.service.js` (ou controller): Regras de negócio e consultas SQL parametrizadas.
   * **Teto Máximo de Linhas:** `server.js` não pode exceder **3.200 linhas**.

2. **Arquitetura Frontend (`public/js/painel/` & `public/js/tabs/`):**
   * O arquivo `public/js/painel/painel-1-app.js` é um **Core Shell** (roteador de abas, estado global e utilitários de sessão).
   * Novas funcionalidades, abas ou telas do painel **NÃO** devem ser inseridas em `painel-1-app.js`.
   * Cada aba possui seu submódulo próprio e isolado em `public/js/tabs/`:
     * Clientes: `public/js/tabs/tab-clients.js`
     * Processos: `public/js/tabs/tab-lawsuits.js`
     * Financeiro: `public/js/tabs/tab-finance.js`
     * RH & Ponto: `public/js/tabs/tab-hr.js`
     * Agenda: `public/js/tabs/tab-calendar.js`
     * Usuários: `public/js/tabs/tab-users.js`
     * Leads: `public/js/tabs/tab-leads.js`
     * Demais abas: sempre criar `public/js/tabs/tab-<nome>.js`
   * **Teto Máximo de Linhas:** `painel-1-app.js` não pode exceder **1.800 linhas**.

3. **Limite de Extensão de Funções:**
   * Nenhuma função individual deve ultrapassar **250 linhas**. Funções longas devem ser decompostas em subfunções com responsabilidade única (*Single Responsibility Principle*).

---

### 🚫 VETO TOTAL A AUTENTICAÇÃO DE DOIS FATORES (2FA / TOTP)
* **Diretriz Expressa do Usuário:** O sistema **NÃO DEVE TER** autenticação de dois fatores (2FA, TOTP, Google Authenticator, etc.).
* É terminantemente proibido reintroduzir qualquer fluxo, tabela ou biblioteca relacionada a 2FA no projeto.

---

### 🧪 VALIDAÇÃO OBRIGATÓRIA ANTES DE COMMITS
Antes de finalizar qualquer tarefa, execute os validadores do Guardião:
```bash
# 1. Guardião da Arquitetura Modular (verifica tetos de linhas e separação)
npm run check:architecture

# 2. Bateria de Testes Automatizados (123+ testes)
npm test

# 3. Checklist E2E de Produção (Playwright Chromium)
npm run test:checklist
```

Se qualquer teste falhar ou o guardião acusar teto excedido, o código deve ser refatorado em submódulos antes de prosseguir.

---

### 🗺️ PROTOCOLO DO ROADMAP VIVO (CLAUDE & ANTIGRAVITY)
O **Roadmap Vivo no site** (painel → aba Roadmap → "Centro de Comando: Minhas Ordens") é o painel de
controle do Dr. Jorge e a **fonte única** das ordens. Os comandos abaixo leem e gravam **direto no site**
(não no banco local), para que Claude, Antigravity e o painel vejam sempre a mesma lista.

**Configuração (uma vez por máquina):** no arquivo `.env` da raiz (nunca versionado):
```
ROADMAP_AGENT_KEY=<chave fornecida pelo Dr. Jorge>
ROADMAP_AGENT_NAME=claude        # ou antigravity
```

**Ao iniciar uma sessão de trabalho:**
1. Rode `npm run roadmap:pending` e **apresente a lista ao Dr. Jorge**.
2. **Pergunte qual ordem executar.** Não comece nenhuma ordem sem a escolha dele.
3. Ao começar: `npm run roadmap:status -- <ORD-ID> em_curso "o que será feito"`.
4. Durante o trabalho, registre avanços relevantes: `npm run roadmap:note -- <ORD-ID> "andamento"`.
5. Só marque como concluída depois de `npm test` aprovado **e** da publicação combinada com o Dr. Jorge:
   `npm run roadmap:status -- <ORD-ID> conforme "o que foi entregue (commit/versão)"`.
6. Se travar por algo externo (chave, credencial, decisão): `npm run roadmap:status -- <ORD-ID> bloqueado "motivo"`.
7. Se algo ficar **só na intenção** (pedido, ideia ou pendência que não foi feita), registre para não se perder:
   `npm run roadmap:register -- "Título" --prioridade=P1 --criterios="como saber que ficou pronto"`.

**Consultas:** `npm run roadmap:list` (todas), `npm run roadmap:history` (histórico com data/hora),
`npm run roadmap:functions` (catálogo de funções do código). Acrescente `--json` para saída estruturada.

**Ordens de outro banco local** (ex.: criadas antes desta integração): `npm run roadmap:import-local`
envia ao site as ordens do `leads.db` local, preservando id, data e histórico, sem sobrescrever nada.

**Testes físicos (aba "🧪 Testes Físicos" do Roadmap):** o checklist de cada página e botão fica em
`src/modules/qa/qa-checklist.json`. Sempre que criar, remover ou renomear páginas/botões, rode
`npm run qa:checklist` e faça commit do JSON (os testes já feitos continuam registrados). Falhas que o
Dr. Jorge registrar aparecem em `npm run roadmap:pending -- --json` (campo `qa`) — ofereça corrigi-las.

**Segurança:** a chave do agente só acessa as ordens do roadmap (sem clientes, processos ou financeiro).
Nunca coloque a chave em commits, chats ou documentos. Só o Dr. Jorge arquiva ordens.
