# CLAUDE.md — Diretrizes de Engenharia & Protocolo do Roadmap Vivo
## Jorge Alvim Advocacia — OAB/MG 222.943

Este arquivo define os comandos, convenções e regras de arquitetura para o **Claude Code (Anthropic)** atuando neste repositório.

---

### 🗺️ PROTOCOLO OBRIGATÓRIO DO ROADMAP VIVO
Antes de iniciar qualquer tarefa de desenvolvimento:
1. **Verificar a Fila de Prioridades:**
   ```bash
   npm run roadmap:pending
   ```
2. **Assumir a Ordem:**
   ```bash
   npm run roadmap:status <ORD-ID> em_curso "Claude assumiu a implementação"
   ```
3. **Validar com a Suíte de Testes:**
   ```bash
   npm test
   ```
4. **Finalizar com Conformidade:**
   ```bash
   npm run roadmap:status <ORD-ID> conforme "Implementação validada e coberta por testes"
   ```
5. **Inspeção de Funções & Auditoria:**
   * Catálogo de funções com ciclo de vida (⚡ Ativa, 🆕 Criada, 🔄 Modificada, ❌ Excluída): `npm run roadmap:functions`
   * Trilha de auditoria cronológica (data, hora, ordem): `npm run roadmap:history`

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
   * Bateria de Testes (199+ testes): `npm test`
   * E2E Checklist de Produção: `npm run test:checklist`
