-- Dedupe de ANDAMENTOS: guarda o id de origem (Escavador) de cada movimentação para
-- não duplicar quando o processo for ATUALIZADO (re-buscar andamentos). NULL = andamento
-- antigo/manual (dedupe cai para data+título+descrição).
ALTER TABLE lawsuit_movements ADD COLUMN source_id TEXT;
CREATE INDEX IF NOT EXISTS idx_lawsuit_movements_source ON lawsuit_movements(lawsuit_id, source_id);
