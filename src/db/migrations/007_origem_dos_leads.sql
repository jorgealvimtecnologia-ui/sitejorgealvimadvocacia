-- AUD-17: de onde vem cada cliente. Capturado no site (UTM/referência, só o domínio) e classificado em src/shared/lead-origin.js.
-- Leads antigos ou cadastrados à mão ficam "Não informado".
ALTER TABLE leads ADD COLUMN origin TEXT;
ALTER TABLE leads ADD COLUMN origin_detail TEXT;
CREATE INDEX IF NOT EXISTS idx_leads_origin ON leads(origin);
