# Marketplace de Monografias e Artigos Jurídicos (PDF)

Módulo Node.js + Express + SQLite + Tailwind para vender PDFs de autores
externos com **split de pagamento** via Mercado Pago (OAuth 2.0 / Marketplace),
**download protegido com marca d'água** e painéis de **autor** e **admin**.

Projetado para acoplar ao site existente (`jorgealvimadvocacia.com.br`) na VPS
Contabo. Pode rodar standalone ou montado como sub-app Express.

---

## Estrutura

```
marketplace-juridico/
├── app.js                 # entrada; monta rotas (webhook ANTES do json global)
├── config/index.js        # lê .env
├── db/
│   ├── schema.sql         # tabelas + índices + WAL
│   └── index.js           # conexão better-sqlite3 + migrate()
├── lib/crypto.js          # AES-256-GCM p/ cifrar tokens do MP
├── services/
│   ├── mercadopago.js     # OAuth, split payment, consulta, assinatura webhook
│   ├── pdf.js             # marca d'água (pdf-lib)
│   └── downloadTokens.js  # tokens UUID, validação, limite de uso
├── middleware/auth.js     # requireAuth / requireRole / ownsProduct
├── routes/
│   ├── oauth.js           # /oauth/connect, /oauth/callback
│   ├── author.js          # painel do autor + upload (multer, pasta privada)
│   ├── admin.js           # moderação + financeiro
│   ├── checkout.js        # /checkout (Pix e cartão com split)
│   ├── webhooks.js        # /webhooks/mercadopago
│   ├── download.js        # /download/:token
│   └── dashboard.js       # queries agregadas (autor/plataforma)
├── views/ (EJS + Tailwind) # dashboards, upload, moderação, checkout
└── scripts/create-admin.js
```

## Instalação

```bash
npm install
cp .env.example .env          # preencha as variáveis
npm run genkey                # gera TOKEN_ENCRYPTION_KEY -> cole no .env
npm run migrate               # cria o banco/esquema
npm run seed:admin "Jorge Alvim" email@dominio.com SenhaForte
npm start
```

No Mercado Pago (painel do desenvolvedor), na sua aplicação **Marketplace**:
- configure a **Redirect URI** = `https://.../oauth/callback`;
- configure o **Webhook** = `https://.../webhooks/mercadopago` e copie o
  **secret** para `MP_WEBHOOK_SECRET`.

No Nginx: garanta que `PRIVATE_UPLOADS_DIR` **não** é servido como estático.

---

## Fluxo ponta a ponta

1. **Autor** faz login → `/oauth/connect` → autoriza no MP → tokens cifrados no SQLite.
2. **Autor** envia PDF (multer → pasta privada) → status `pending`.
3. **Admin** aprova em `/painel/admin/moderacao` → produto vai para a vitrine.
4. **Cliente** paga em `/checkout` (Pix ou cartão). O pagamento é criado com o
   **token do autor** + `application_fee` (comissão) → dinheiro cai direto na
   conta do autor; a plataforma retém a comissão.
5. **Webhook** confirma `approved` → gera `download_tokens`.
6. **Cliente** acessa `/download/:token` → PDF é carimbado com e-mail/CPF e entregue.

---

## Decisões de arquitetura e pontos de atenção (importante)

- **Split 1:1 = um pagamento por autor.** O `/payments` é autenticado com o
  token de **um** vendedor. Carrinho com autores diferentes deve virar **um
  pedido por autor** (o `checkout.js` valida isso). O modelo 1:N (vários
  vendedores num pagamento) é restrito e exige aprovação comercial do MP.

- **`application_fee` × `sponsor_id`.** No modelo atual, a divisão é definida
  por *token do vendedor + `application_fee`* (em reais). O `sponsor_id` ficou
  como campo opcional/informativo — não é o mecanismo de split. O código já usa
  `application_fee`.

- **Sandbox do MP não fecha o split.** O OAuth só emite credenciais de
  **produção**; cartões/compradores de teste falham no fluxo de split. A
  validação final deve ser uma **transação real de valor baixo** em produção.

- **PCI.** O cartão é tokenizado no navegador pelo **Brick**; o número nunca
  passa pelo seu servidor. Mantenha assim.

- **LGPD / marca d'água.** O rodapé estampa e-mail e **CPF mascarado**
  (`123.***.***-09`) para rastrear vazamentos sem expor o CPF inteiro. Informe
  o comprador no checkout que o arquivo é personalizado/licenciado
  individualmente e defina a retenção do CPF em `orders`.

- **Chave de cifragem.** Se `TOKEN_ENCRYPTION_KEY` for perdida ou trocada, os
  tokens do MP ficam irrecuperáveis e os autores precisam reconectar. Guarde-a
  como segredo de produção e faça backup fora do servidor.

- **Webhook precisa do corpo bruto.** Por isso é montado **antes** do
  `express.json()` global (ver `app.js`) e valida a assinatura `x-signature`.

- **SQLite + VPS.** Com WAL + `busy_timeout` atende bem baixo/médio volume e um
  único processo. Se escalar para múltiplos processos/alto volume de escrita
  concorrente, considere migrar para PostgreSQL (o schema é portável).

- **Conta do vendedor.** O split exige conta MP com KYC adequado; fees podem
  depender de aprovação do executivo comercial do MP.

## Dependências
`express`, `better-sqlite3`, `ejs`, `express-session`, `multer`, `pdf-lib`,
`helmet`, `express-rate-limit`, `bcrypt`, `dotenv`. Node ≥ 18 (usa `fetch` nativo).
