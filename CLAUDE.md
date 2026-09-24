# CLAUDE.md — Diretrizes de Engenharia & Protocolo do Roadmap Vivo
## Jorge Alvim Advocacia — OAB/MG 222.943

Este arquivo define os comandos, convenções e regras de arquitetura para o **Claude Code (Anthropic)** atuando neste repositório.

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

**Segurança:** a chave do agente só acessa as ordens do roadmap (sem clientes, processos ou financeiro).
Nunca coloque a chave em commits, chats ou documentos. Só o Dr. Jorge arquiva ordens.

---

### 🚨 REGRAS SUPREMAS DE ARQUITETURA (GUARDIÃO MODULAR)
1. **Proibição de Monólitos:**
   * `server.js` é apenas um orquestrador. Teto máximo: **3.200 linhas**.
   * `public/js/painel/painel-1-app.js` é o Core Shell. Teto máximo: **1.800 linhas**.
   * Novas rotas de API devem SEMPRE ficar em `src/modules/<nome>/<nome>.routes.js`.
   * Novas abas do painel devem SEMPRE ficar em `public/js/tabs/tab-<nome>.js`.
   * Funções individuais não devem ultrapassar 250 linhas.

2. **🚫 Veto Absoluto a 2FA / TOTP:**
   * O sistema NÃO utiliza autenticação de dois fatores por decisão expressa do usuário.

3. **Comandos de Verificação Mandatórios:**
   * Guardião de Arquitetura: `npm run check:architecture`
   * Bateria de Testes (200+ testes): `npm test`
   * E2E Checklist de Produção: `npm run test:checklist`
