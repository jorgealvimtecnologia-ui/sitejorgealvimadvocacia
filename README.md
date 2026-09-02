# Jorge Alvim Advocacia — Plataforma de Gestão Jurídica

Sistema web integrado para o escritório **Jorge Alvim Advocacia (OAB/MG)**: site institucional
+ ERP jurídico completo (clientes, processos, prazos, financeiro, RH, blog e portais de
autoatendimento para clientes e colaboradores).

> **Stack:** Node.js 22+ · Express 5 · SQLite nativo (`node:sqlite`) · HTML/Tailwind (CDN) ·
> Docker + Nginx. Sem framework de frontend — as telas são servidas como páginas HTML.

---

## 📦 Módulos do sistema

| Área | Descrição |
|------|-----------|
| **Site institucional** | Landing page, áreas de atuação, blog, captação de leads (formulário → WhatsApp) |
| **Painel administrativo** (`/painel`) | Console central de gestão do escritório |
| **Clientes** | Cadastro PF/PJ, documentos, contratos, portal do cliente (`/cliente`) |
| **Processos** | Processos judiciais (CNJ), andamentos, publicações, radar judicial (crawler Python) |
| **Agenda / Prazos** | Calendário, compromissos, prazos fatais |
| **Financeiro** | Livro caixa, transações, integração Asaas, NFS-e / recibos RPS-OAB |
| **RH / Folha** | Colaboradores CLT, ponto, folha de pagamento, rescisões, portal do colaborador (`/colaborador`) |
| **Escritórios** | Sociedades, membros, drive de documentos |
| **Foguetes** | Mensageria interna / despachos rápidos entre a equipe |
| **Blog** | Publicação de artigos com moderação de comentários |
| **Segurança** | Sessões por token, matriz de permissões (RBAC/ABAC), trilha de auditoria (LGPD) |

---

## 🏛️ Arquitetura

```
sitejorgealvimadvocacia/
├── server.js              # Backend Express (API + roteamento das páginas)
├── index.html             # Site institucional
├── painel.html            # Painel administrativo (SPA em HTML)
├── cliente.html           # Portal do cliente
├── colaborador.html       # Portal do colaborador (RH)
├── blog.html              # Blog público
├── src/
│   ├── config/            # db.js (schema SQLite), constants.js
│   ├── middleware/        # auth.js (sessões), audit.js (LGPD), upload.js (multer)
│   └── modules/           # rockets/ (rotas modularizadas)
├── public/js/             # Frontend modular (core: router, auth, api)
├── scripts/               # radar_crawler.py, testes de sistema
├── nginx/                 # Proxy reverso + SSL
├── Dockerfile · docker-compose.yml
└── leads.db               # Banco SQLite (NÃO versionado — contém dados sensíveis)
```

O banco é criado/migrado automaticamente na primeira execução (`src/config/db.js`
e o bloco de init em `server.js`).

---

## 🚀 Como executar (desenvolvimento)

**Pré-requisitos:** Node.js **22 ou superior** (a API `node:sqlite` é nativa a partir do 22.5).

```bash
# 1. Instalar dependências
npm install

# 2. Configurar variáveis de ambiente
cp .env.example .env      # e edite conforme necessário

# 3. Subir o servidor (site + painel + API na porta 3000)
npm run start
```

Acessos:
- Site: <http://localhost:3000>
- Painel: <http://localhost:3000/painel>
- Portal do cliente: <http://localhost:3000/cliente>
- Portal do colaborador: <http://localhost:3000/colaborador>

> O site institucional em si também pode ser desenvolvido com Vite (`npm run dev`),
> mas o **sistema completo** roda pelo servidor Node (`npm run start`).

### Build do site estático (opcional)
```bash
npm run build      # gera dist/ otimizado
npm run preview
```

---

## 🔐 Variáveis de ambiente

Definidas em `.env` (veja `.env.example`):

| Variável | Uso |
|----------|-----|
| `NODE_ENV` | `development` ou `production` |
| `PORT` | Porta do servidor (padrão 3000) |
| `ALLOWED_ORIGINS` | Origens liberadas no CORS (separadas por vírgula) |
| `ASAAS_API_KEY` / `ASAAS_BASE_URL` | Integração financeira Asaas |

---

## 🛡️ Segurança e LGPD

- Senhas com **PBKDF2 + salt**; sessões por token (expiração 24h).
- **Matriz de permissões** granular por módulo (RBAC/ABAC).
- **Trilha de auditoria** de acessos e operações (`audit_logs`).
- O diretório-raiz **não** é exposto estaticamente; apenas assets públicos.
- `leads.db` e uploads em `storage/` **nunca** são versionados.

> ⚠️ **Pendências de segurança conhecidas** (ver histórico do projeto): a coluna
> `plain_password` ainda armazena senhas em texto legível para exibição no painel —
> recomenda-se substituir por um fluxo de "redefinir senha" e remover o armazenamento
> em texto puro.

---

## 🐳 Deploy (produção)

```bash
docker compose up -d --build
```

Sobe a aplicação Node + Nginx (proxy reverso com HTTPS via Let's Encrypt —
ver `init-letsencrypt.sh`).

---

## 📄 Licença

Projeto proprietário — Jorge Alvim Advocacia & Tecnologia.
