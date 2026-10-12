-- RADAR-05: audiências do processo (leves — só metadados: data, tipo, situação, local).
-- Guardadas como JSON no próprio processo; NÃO guardamos documentos/autos (decisão do
-- Dr. Jorge: evita encher o disco do servidor).
ALTER TABLE lawsuits ADD COLUMN audiencias TEXT;
