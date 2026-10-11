-- 003 · Colunas próprias para Visão Geral (dashboard), Kanban e Ferramentas (editor/calculadora).
-- NULL = herda "liberado" (como já era), então ninguém perde acesso ao migrar; o mestre passa a poder desligar.
ALTER TABLE access_permissions ADD COLUMN tab_dashboard INTEGER;
ALTER TABLE access_permissions ADD COLUMN tab_kanban INTEGER;
ALTER TABLE access_permissions ADD COLUMN tab_tools INTEGER;
