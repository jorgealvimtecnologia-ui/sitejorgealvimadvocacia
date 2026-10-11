-- AUD-16: portal do cliente em linguagem simples, com o advogado no controle do que o cliente vê.
-- Processo: visível (padrão sim), resumo da situação, "o que o cliente precisa fazer" e se há ação pendente.
ALTER TABLE lawsuits ADD COLUMN client_visible INTEGER NOT NULL DEFAULT 1;
ALTER TABLE lawsuits ADD COLUMN client_summary TEXT;
ALTER TABLE lawsuits ADD COLUMN client_next_action TEXT;
ALTER TABLE lawsuits ADD COLUMN client_action_needed INTEGER NOT NULL DEFAULT 0;
ALTER TABLE lawsuits ADD COLUMN client_updated_at TEXT;
-- Andamento: OCULTO por padrão (confidencialidade). O advogado publica o que o cliente pode ver e, se quiser, escreve a explicação simples.
ALTER TABLE lawsuit_movements ADD COLUMN client_visible INTEGER NOT NULL DEFAULT 0;
ALTER TABLE lawsuit_movements ADD COLUMN client_text TEXT;
