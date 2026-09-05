-- 001 · Índices do Kanban (primeira migration; idempotente)
CREATE INDEX IF NOT EXISTS idx_kanban_column ON kanban_cards(column_key);
CREATE INDEX IF NOT EXISTS idx_kanban_deadline ON kanban_cards(deadline);
