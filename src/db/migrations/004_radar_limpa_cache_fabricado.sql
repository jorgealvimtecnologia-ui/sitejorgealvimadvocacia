-- 004 · Limpa o cache de buscas do Radar Judicial.
-- Versões antigas guardavam ali (por 2 horas) resultados INVENTADOS (processo de enchimento, andamentos e advogado
-- padrão). Depois desta migration o cache só recebe resultados reais de fontes externas.
DELETE FROM judicial_search_cache;
