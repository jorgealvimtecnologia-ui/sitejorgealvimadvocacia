-- ============================================================================
--  MARKETPLACE JURÍDICO — Schema SQLite
--  Executado uma vez na inicialização (db/index.js roda de forma idempotente).
--
--  Convenção monetária: TODO valor em dinheiro é INTEGER em CENTAVOS.
--  Nunca usar REAL/float para dinheiro (erro de arredondamento). A conversão
--  para reais (ex.: application_fee do Mercado Pago) é feita só na borda da API.
-- ============================================================================

-- ---------------------------------------------------------------------------
--  PRAGMAs de performance para VPS (Contabo). WAL permite leituras
--  concorrentes com uma escrita; busy_timeout evita "database is locked".
--  Estes PRAGMAs de conexão (foreign_keys, busy_timeout) são reaplicados a
--  CADA conexão em db/index.js — PRAGMAs de conexão não persistem no arquivo.
--  journal_mode=WAL e synchronous persistem no arquivo .db.
-- ---------------------------------------------------------------------------
PRAGMA journal_mode = WAL;
PRAGMA synchronous = NORMAL;      -- seguro com WAL; bem mais rápido que FULL
PRAGMA foreign_keys = ON;
PRAGMA busy_timeout = 5000;       -- 5s de espera em lock antes de erro
PRAGMA temp_store = MEMORY;

-- ===========================================================================
--  USERS — admin, autores e (opcionalmente) clientes cadastrados
-- ===========================================================================
CREATE TABLE IF NOT EXISTS users (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    name                TEXT    NOT NULL,
    email               TEXT    NOT NULL UNIQUE,
    password_hash       TEXT    NOT NULL,                 -- bcrypt/argon2
    cpf_cnpj            TEXT,                              -- para repasse/nota
    role                TEXT    NOT NULL DEFAULT 'author'
                        CHECK (role IN ('admin', 'author', 'customer')),
    status              TEXT    NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending', 'active', 'suspended')),

    -- ---- Credenciais OAuth do Mercado Pago (conta do AUTOR) ----
    -- access_token e refresh_token são gravados CIFRADOS (AES-256-GCM).
    -- Ver lib/crypto.js. Nunca gravar em texto puro.
    mp_user_id          TEXT,                              -- collector id do autor
    mp_access_token     TEXT,                              -- cifrado
    mp_refresh_token    TEXT,                              -- cifrado
    mp_public_key       TEXT,                              -- usada no Brick do autor
    mp_token_expires_at TEXT,                              -- ISO 8601 (UTC)
    mp_connected_at     TEXT,

    created_at          TEXT    NOT NULL DEFAULT (datetime('now')),
    updated_at          TEXT    NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_users_role        ON users(role);
CREATE INDEX IF NOT EXISTS idx_users_status      ON users(status);
CREATE INDEX IF NOT EXISTS idx_users_mp_user_id  ON users(mp_user_id);

-- ===========================================================================
--  PRODUCTS — Monografias / Artigos (PDF)
-- ===========================================================================
CREATE TABLE IF NOT EXISTS products (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    author_id           INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    title               TEXT    NOT NULL,
    slug                TEXT    NOT NULL UNIQUE,
    abstract            TEXT    NOT NULL,                  -- resumo
    area                TEXT,                              -- ex.: Direito Militar
    price_cents         INTEGER NOT NULL CHECK (price_cents >= 0),

    -- Caminho ABSOLUTO do arquivo na pasta privada (fora do public do Express).
    file_path           TEXT    NOT NULL,
    file_original_name  TEXT,
    file_size_bytes     INTEGER,
    file_sha256         TEXT,                              -- integridade do arquivo
    pages               INTEGER,

    status              TEXT    NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending', 'approved', 'rejected')),
    rejection_reason    TEXT,
    moderated_by        INTEGER REFERENCES users(id),
    moderated_at        TEXT,

    downloads_count     INTEGER NOT NULL DEFAULT 0,
    published           INTEGER NOT NULL DEFAULT 0,        -- 0/1: visível na vitrine

    created_at          TEXT    NOT NULL DEFAULT (datetime('now')),
    updated_at          TEXT    NOT NULL DEFAULT (datetime('now'))
);
-- Índice composto é o que a vitrine mais usa: "aprovados e publicados, recentes".
CREATE INDEX IF NOT EXISTS idx_products_vitrine   ON products(status, published, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_products_author    ON products(author_id);
CREATE INDEX IF NOT EXISTS idx_products_status    ON products(status);
CREATE INDEX IF NOT EXISTS idx_products_area      ON products(area);

-- ===========================================================================
--  ORDERS — pedido mestre (um checkout = um pedido, 1+ itens)
-- ===========================================================================
CREATE TABLE IF NOT EXISTS orders (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    uuid                TEXT    NOT NULL UNIQUE,           -- id público (external_reference)
    customer_name       TEXT    NOT NULL,
    customer_email      TEXT    NOT NULL,
    customer_cpf        TEXT    NOT NULL,                  -- usado no watermark + MP payer
    user_id             INTEGER REFERENCES users(id),      -- se cliente logado (opcional)

    total_cents         INTEGER NOT NULL CHECK (total_cents >= 0),
    payment_method      TEXT    CHECK (payment_method IN ('pix', 'credit_card')),

    -- Estado interno do pedido (derivado do status do MP via webhook)
    status              TEXT    NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending', 'paid', 'rejected',
                                          'cancelled', 'refunded')),

    -- Dados do Mercado Pago
    mp_payment_id       TEXT,                              -- id do pagamento no MP
    mp_status           TEXT,                              -- approved, pending, rejected...
    mp_status_detail    TEXT,
    paid_at             TEXT,

    created_at          TEXT    NOT NULL DEFAULT (datetime('now')),
    updated_at          TEXT    NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_orders_status        ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_mp_payment    ON orders(mp_payment_id);
CREATE INDEX IF NOT EXISTS idx_orders_email         ON orders(customer_email);
CREATE INDEX IF NOT EXISTS idx_orders_created       ON orders(created_at DESC);

-- ===========================================================================
--  ORDER_ITEMS — detalhamento do split por item
-- ===========================================================================
CREATE TABLE IF NOT EXISTS order_items (
    id                      INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id                INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    product_id              INTEGER NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
    author_id               INTEGER NOT NULL REFERENCES users(id),

    -- Snapshot de valores no momento da compra (não depende de alteração futura)
    price_cents             INTEGER NOT NULL,              -- preço cobrado do cliente
    platform_fee_percent    REAL    NOT NULL,              -- % da comissão (ex.: 15.0)
    platform_fee_cents      INTEGER NOT NULL,              -- R$ da comissão (application_fee)
    author_net_cents        INTEGER NOT NULL,              -- R$ líquido do autor

    -- Com split 1:1 o pagamento cai direto na conta do autor; guardamos o id
    mp_payment_id           TEXT,

    created_at              TEXT    NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_items_order     ON order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_items_product   ON order_items(product_id);
CREATE INDEX IF NOT EXISTS idx_items_author    ON order_items(author_id);

-- ===========================================================================
--  DOWNLOAD_TOKENS — acesso temporário ao PDF (anti-pirataria)
-- ===========================================================================
CREATE TABLE IF NOT EXISTS download_tokens (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    token           TEXT    NOT NULL UNIQUE,               -- UUID v4
    order_id        INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    order_item_id   INTEGER NOT NULL REFERENCES order_items(id) ON DELETE CASCADE,
    product_id      INTEGER NOT NULL REFERENCES products(id),

    expires_at      TEXT    NOT NULL,                      -- ISO 8601 (UTC)
    max_uses        INTEGER NOT NULL DEFAULT 5,
    used_count      INTEGER NOT NULL DEFAULT 0,
    last_used_at    TEXT,
    last_ip         TEXT,
    revoked         INTEGER NOT NULL DEFAULT 0,

    created_at      TEXT    NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_tokens_order    ON download_tokens(order_id);
CREATE INDEX IF NOT EXISTS idx_tokens_expires  ON download_tokens(expires_at);

-- ===========================================================================
--  REVIEWS — avaliação 1..5, obrigatoriamente atrelada a compra real
-- ===========================================================================
CREATE TABLE IF NOT EXISTS reviews (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id      INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    order_id        INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    customer_email  TEXT    NOT NULL,
    rating          INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
    comment         TEXT,
    created_at      TEXT    NOT NULL DEFAULT (datetime('now')),

    -- Uma avaliação por produto por pedido (impede review sem compra / duplicada)
    UNIQUE (order_id, product_id)
);
CREATE INDEX IF NOT EXISTS idx_reviews_product ON reviews(product_id);

-- ===========================================================================
--  WEBHOOK_EVENTS — log/idempotência de notificações do Mercado Pago
--  Garante que o mesmo evento não gere token de download duas vezes.
-- ===========================================================================
CREATE TABLE IF NOT EXISTS webhook_events (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    mp_event_id     TEXT UNIQUE,                           -- id da notificação
    mp_payment_id   TEXT,
    type            TEXT,
    raw             TEXT,                                  -- payload bruto (auditoria)
    processed       INTEGER NOT NULL DEFAULT 0,
    received_at     TEXT    NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_webhook_payment ON webhook_events(mp_payment_id);
