-- "Trazer todos os dados do Escavador": campos próprios do processo (saem do texto das
-- observações) + TODAS as partes do processo com seus advogados (OAB), de forma estruturada.
-- Colunas NULL = herdam (ninguém perde nada do que já existe).
ALTER TABLE lawsuits ADD COLUMN valor_causa TEXT;
ALTER TABLE lawsuits ADD COLUMN situacao TEXT;
ALTER TABLE lawsuits ADD COLUMN fase TEXT;

CREATE TABLE IF NOT EXISTS lawsuit_parties (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  lawsuit_id TEXT NOT NULL,
  name TEXT NOT NULL,
  document TEXT,                 -- CPF/CNPJ (só dígitos), quando houver
  polo TEXT,                     -- ATIVO | PASSIVO | DESCONHECIDO
  tipo TEXT,                     -- Autor | Réu | Terceiro Interessado | ...
  is_client INTEGER DEFAULT 0,   -- 1 = é a parte que o escritório representa (o cliente)
  advogados TEXT,                -- JSON: [{ "nome": "...", "oab": "222943/MG" }]
  source TEXT,                   -- origem do dado (ex.: 'escavador')
  created_at TEXT NOT NULL,
  FOREIGN KEY (lawsuit_id) REFERENCES lawsuits(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_lawsuit_parties_lawsuit ON lawsuit_parties(lawsuit_id);
