/**
 * Áreas do direito (AUD-17): agrupa textos livres ("Ação Trabalhista", "Revisão de benefício INSS"...) nas áreas
 * que o escritório acompanha. Mesma divisão das áreas do site.
 */
export const AREAS = ['Trabalhista', 'Previdenciário', 'Cível e Família', 'Consumidor e Contratos', 'Criminal', 'Tributário', 'Empresarial', 'Outros'];
export const NO_AREA = 'Sem área definida';

const RULES = [
  ['Trabalhista', /trabalh|clt|rescis|verbas|horas? extras?|reclamat|fgts|v[ií]nculo/i],
  ['Previdenciário', /previd|inss|aposent|benef[ií]cio|loas|bpc|aux[ií]lio[- ]doen|pens[ãa]o por morte/i],
  ['Consumidor e Contratos', /consumidor|banc[áa]r|cart[ãa]o|negativa[çc]|contrat|plano de sa[úu]de|seguro|cobran[çc]a indevida|dano moral/i],
  ['Cível e Família', /c[ií]vel|fam[ií]lia|div[óo]rcio|alimentos|guarda|invent[áa]rio|usucapi|loca[çc]|despejo|ind[eê]niza|suces[ãa]o|uni[ãa]o est[áa]vel|cnh|suspens[ãa]o/i],
  ['Criminal', /criminal|penal|crime|habeas|defesa criminal/i],
  ['Tributário', /tribut|fiscal|imposto|execu[çc][ãa]o fiscal|icms|irpf|receita federal/i],
  ['Empresarial', /empres|societ|recupera[çc][ãa]o judicial|fal[êe]ncia|propriedade intelectual/i],
];

/** Devolve a área canônica, ou null se o texto não permitir concluir. */
export function classifyArea(text) {
  const t = String(text || '').trim();
  if (!t) return null;
  for (const [area, re] of RULES) if (re.test(t)) return area;
  return /outro|geral|express/i.test(t) ? null : 'Outros';
}
