# 🗺️ Roadmap Executivo Atualizado: Plataforma Jorge Alvim Advocacia & Legaltech
**Advogado Titular:** Dr. Jorge Eduardo da Silva Alvim • OAB/MG 222.943
**Data da Última Atualização:** 09 de Setembro de 2026 • Juiz de Fora - MG
**Ambiente:** Servidor VPS Contabo em Produção (`161.97.71.14`)
**Repositório GitHub:** `jorgealvimtecnologia-ui/sitejorgealvimadvocacia`
**Conformidade Ética e Legal:** Provimento 205/2021 da OAB e LGPD (Lei 13.709/2018)

---

## 📌 Resumo Executivo (v2.7 — Hardening de Segurança)

O ecossistema segue **em produção e operacional**. Nesta atualização, o foco foi o **Pilar 1 de Segurança (P0 / Sigilo OAB / LGPD)** da Fase IV: as falhas críticas de credenciais e autenticação foram **corrigidas no código**.

> ⚠️ **Status de produção:** as correções de segurança abaixo estão **concluídas no código (ambiente local) e ainda NÃO foram deployadas** ao Contabo. Até o deploy, a produção mantém o comportamento antigo (senha-mestre revertida no boot e coluna `plain_password` presente). O deploy é **manual** (`deploy.yml` via `workflow_dispatch`) — nada sobe sozinho.

* **Testes de backend:** 141 testes (`node --test`) — **138 passam**; as 3 falhas restantes são de **Meta Ads** e são **pré-existentes** (falham também no código limpo, sem relação com o hardening).
* **Autenticação:** Google Identity Services (GIS) ativo com auto-cadastro em 1 clique.
* **Segurança Operacional:** Chave SSH sem senha na VPS e rotina de auto-rollback ativa.

---

## 🔒 0. HARDENING DE SEGURANÇA — Fase IV / Pilar 1 (Concluído no código • aguardando deploy)

| # | Correção | Arquivos | Status |
|:---:|:---|:---|:---:|
| **S1** | **Senha-mestre não é mais reescrita no boot.** Removida a sobrescrita forçada para `jorgealvim` que impedia trocar a senha. 1ª criação usa `MASTER_PASSWORD` (`.env`) ou senha aleatória impressa 1×; depois, só o papel `master` é garantido. | `src/config/db.js`, `server.js` | ✅ Código |
| **S2** | **Expurgo do `plain_password`.** Coluna de senha em texto puro **dropada** (`users` e `access_permissions`) e removido todo código que gravava/exibia (inclusive a etiqueta 🔑 no painel de usuários). | `db.js`, `server.js`, `seed-demo.js`, `auth.routes.js`, `access.routes.js`, `tab-users.js` | ✅ Código |
| **S3** | **Hash forte unificado (PBKDF2-SHA512 210k, OWASP).** Eliminada a cópia fraca de 10k iterações que era usada no seed. Fonte única em `password-crypto.js`. | `src/config/db.js`, `src/shared/password-crypto.js` | ✅ Código |
| **S4** | **Política de senha reforçada:** mínimo **8** (era 4) e teto **64** (era 12, que bloqueava senhas fortes). Length-first (NIST 800-63B). | `src/shared/password-policy.js` | ✅ Código |
| **S5** | **RBAC fail-closed.** O gate de permissões passou a **negar** perfis restritos sem matriz e a **negar em qualquer erro** (antes liberava o acesso). Mestre continua com bypass. | `server.js` | ✅ Código |
| **S6** | **Anti-abuso no formulário público `/api/leads`:** rate-limit por IP (8/10min) + honeypot anti-bot. Protege o único write não autenticado exposto à internet. | `src/modules/leads/leads.routes.js` | ✅ Código |
| **S7** | **Ferramenta de rotação de senha do mestre** (`node scripts/set-master-password.js "<senha>"`) — senha vem por argumento/`.env`, nunca hardcoded. `MASTER_PASSWORD` documentado no `.env.example`. | `scripts/set-master-password.js`, `.env.example` | ✅ Código |
| **S8** | **Testes de regressão de segurança** (política de senha, hash forte, aceitação de formatos legados). | `tests/security-hardening.test.js` | ✅ Código |

**Senha do Mestre:** já definida como `Mivl@100` **no banco local** (hash forte). Em produção o mestre segue `jorgealvim` até o deploy destas mudanças + rodar o script no servidor.

---

## 🚀 1. Funcionalidades Entregues & Ativas em Produção (100% Concluídas)

| # | Módulo / Área | O que foi Implementado | Status |
|:---:|:---|:---|:---:|
| **01** | **Google Identity Services (OAuth 2.0)** | Login sem senha (advogado) e Login + Auto-Cadastro 1 clique (cliente), com nome/e-mail/foto do Google. | ✅ NO AR |
| **02** | **QA Checklist de Produção (Playwright)** | 11 testes em 9 páginas críticas (HTTP 200, zero erros de console, viewport mobile). | ✅ NO AR |
| **03** | **Vitrine Colaborador Amazon** | Página de conversão com busca instantânea, 5 categorias e 16 produtos curados. | ✅ NO AR |
| **04** | **Integração Editorial Amazon no Blog** | Selo "Parceiro", super banner, vitrine e card de recomendação nos artigos. | ✅ NO AR |
| **05** | **Configurador Amplo de Meta Ads** | Tráfego pago no painel: verba, alcance dinâmico, raio geográfico, nichos e simulador (status PAUSED). | ✅ NO AR |
| **06** | **Cockpit Matinal & Prazos CPC-15** | "Meu Dia Hoje" (prazos fatais, audiências, leads) + calculadora do Art. 219 CPC (dias úteis/recesso). | ✅ NO AR |
| **07** | **Gerador do Kit Comercial Contratual** | Procuração *Ad Judicia*, Hipossuficiência e Contrato de Honorários em 1 clique. | ✅ NO AR |
| **08** | **Assinatura Eletrônica Mobile & Magic Links** | Assinatura touchscreen (IP+data) e link de 72h para o cliente anexar RG/CPF sem login. | ✅ NO AR |
| **09** | **Recibo de Alvará & Valor por Extenso** | Prestação de contas com dedução de honorários e conversão para texto por extenso. | ✅ NO AR |
| **10** | **Validador de Homônimos & Campos Dinâmicos** | Score anti-fraude (CPF+Nome+Mãe+Nascimento) e motor de campos customizados. | ✅ NO AR |
| **11** | **Auto-Cura SQLite** | `VACUUM`, `REINDEX`, `wal_checkpoint(TRUNCATE)` e snapshots do banco em 1 clique. | ✅ NO AR |
| **12** | **Refatoração Modular do Backend** | Monólito quebrado em `src/modules/*` e conexão única do banco (fim dos "dois cérebros"). | ✅ NO AR |
| **13** | **Deploy com Auto-Rollback & SSH** | Deploy com backup prévio, health check e chave SSH sem senha. | ✅ NO AR |
| **14** | **FAQ Inteligente & Direito de Família** | Aba de gestão de FAQ em Conteúdo & Compliance; conteúdo de Direito de Família. | ✅ NO AR |
| **15** | **Publicação Instagram/Facebook & LGPD Soft-Delete** | Publicação de artigos nas redes; exclusão ética de clientes (art. 16, I, OAB) com bloqueio de login. | ✅ NO AR |

---

## ⏳ 2. O Que Falta Fazer (Roadmap Priorizado)

### 🔴 P0 — Segurança restante (continuação da Fase IV / Pilar 1)
| # | Pendência | Por que ficou para depois |
|:---:|:---|:---|
| **F1** | **Deployar o hardening (S1–S8) à produção** e rodar `set-master-password.js` no Contabo para trocar a senha real. | Requer ação no servidor (deploy manual) — hoje segurado a pedido. |
| **F2** | **Proteger `/storage/*` (documentos de clientes/drive) com autenticação + dono do arquivo** (item 3 da auditoria). | O drive gera URLs abertas que o navegador abre **sem token**; exige ajuste coordenado no front para não quebrar downloads. Precisa do app rodando para validar. |
| **F3** | **Token de sessão em cookie `HttpOnly`+`Secure`+`SameSite` e escapar 100% dos `innerHTML`** (item 7). | Refatoração de auth nos 3 portais + varredura de XSS; alto risco sem testes ao vivo. |
| **F4** | **Revisar/remover bypasses hardcoded** remanescentes em `client-portal.routes.js` e `hr.routes.js`. | Não auditado em detalhe nesta rodada. |

### 🟠 P1 — Confiabilidade / SRE (Fase IV / Pilar 2)
* Migrar de `node:sqlite` (`DatabaseSync` síncrono, bloqueia o event loop) para `better-sqlite3` (WAL + `synchronous=NORMAL`).
* Deep Healthcheck (`/health/live` e `/health/ready`) com teste de latência e gravação em disco.
* Graceful Shutdown (`SIGTERM`/`SIGINT`).

### 🟡 P2 — Modularização / Clean Code (Fase IV / Pilar 3)
* Decompor `painel-1-app.js` em submódulos ES6 dinâmicos (`import()`), com *lazy loading* de modais.
* Enxugar `server.js` (~2.7k linhas) delegando tudo para `src/modules/*`.

### 🟢 P3 — DevSecOps & Observabilidade (Fase IV / Pilar 4)
* SonarQube/SonarCloud (Quality Gate de segurança e complexidade).
* Logs estruturados JSON com Pino.
* Workflow noturno do Playwright no GitHub Actions.

### 💡 Evoluções de produto (ímãs de clientes)
* **FAQ na Home** com busca local (dúvidas trabalhistas/previdenciárias/cíveis).
* **Simuladores** de rescisão trabalhista e aposentadoria → lead qualificado via WhatsApp.
* **2FA por app (TOTP)** para o Painel do Advogado.
* Converter o modal de boas-vindas em *toast* discreto.

### 🅰️ Ações externas do Dr. Jorge (credenciais)
| Prioridade | Ação | Onde |
|:---:|:---|:---|
| P1 | Ativar Google Client ID oficial | Google Cloud Console |
| P2 | Cloudflare Free (CDN + SSL + anti-bot) | Cloudflare + Registro.br |
| P3 | Alcançar 3 vendas na Amazon (libera PA-API v5) | Divulgação de `/amazon` |

---

## 🔒 3. Garantias Éticas e de Segurança
* **Provimento 205/2021 da OAB:** marketing jurídico sóbrio, informativo e sem promessa de êxito.
* **LGPD (Lei 13.709/2018):** dados e documentos sob conexão segura; **senhas apenas em hash forte (PBKDF2 210k) — nunca em texto puro** (após deploy do Pilar 1).
