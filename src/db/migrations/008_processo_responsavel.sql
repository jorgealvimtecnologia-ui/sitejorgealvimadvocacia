-- AUD-27 Parte 2: vínculo do processo ao ADVOGADO RESPONSÁVEL, base do escopo de dados
-- (data_scope). Processo SEM responsável = pool do escritório (visível a todos), para não
-- esconder nada do que já existe. A restrição "só os meus" vale para processos COM responsável.
ALTER TABLE lawsuits ADD COLUMN responsible_user_id TEXT;
ALTER TABLE lawsuits ADD COLUMN responsible_name TEXT;
CREATE INDEX IF NOT EXISTS idx_lawsuits_responsible ON lawsuits(responsible_user_id);
