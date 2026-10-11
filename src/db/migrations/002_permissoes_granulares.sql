-- 002 · Permissões granulares da matriz de acessos.
-- NULL = "herda" do campo antigo (veja src/shared/permissions.js), então ninguém ganha nem perde acesso
-- ao migrar; o mestre só passa a poder ligar/desligar cada aba separadamente.
ALTER TABLE access_permissions ADD COLUMN tab_nfse INTEGER;
ALTER TABLE access_permissions ADD COLUMN tab_esign INTEGER;
ALTER TABLE access_permissions ADD COLUMN tab_blog INTEGER;
ALTER TABLE access_permissions ADD COLUMN tab_audit INTEGER;
ALTER TABLE access_permissions ADD COLUMN tab_alerts INTEGER;
