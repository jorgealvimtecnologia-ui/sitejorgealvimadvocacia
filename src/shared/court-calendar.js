/**
 * Calendário forense: feriados nacionais e forenses gerados POR REGRA (sem lista manual por ano).
 *
 * Os feriados móveis (Carnaval, Quarta-Feira de Cinzas, Semana Santa, Corpus Christi) dependem da data da
 * Páscoa, calculada aqui pelo algoritmo gregoriano (Meeus/Jones/Butcher). Assim o sistema nunca "fica sem ano":
 * a cada partida do servidor o calendário é estendido para os próximos anos.
 *
 * Importante: feriados MUNICIPAIS/LOCAIS e pontos facultativos de cada tribunal variam e mudam por portaria;
 * esses o escritório cadastra em "Feriados locais" (jurisdiction 'local'). Os itens com jurisdiction 'MG' abaixo
 * seguem o calendário que o sistema já usava e devem ser conferidos com o tribunal do processo.
 */

const pad = (n) => String(n).padStart(2, '0');

/** Domingo de Páscoa do ano (algoritmo gregoriano anônimo). */
export function easterSunday(year) {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(year, month - 1, day));
}

function addDays(date, n) {
  return new Date(date.getTime() + n * 86400000);
}

function iso(date) {
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

/** Feriados (nacionais e forenses) de um ano, no formato da tabela court_holidays. */
export function holidaysForYear(year) {
  const easter = easterSunday(year);
  const fixo = (mmdd, name, jurisdiction = 'nacional') => ({ date: `${year}-${mmdd}`, name, jurisdiction });
  const movel = (offset, name, jurisdiction = 'nacional') => ({ date: iso(addDays(easter, offset)), name, jurisdiction });

  const list = [
    fixo('01-01', 'Confraternização Universal'),
    movel(-48, 'Carnaval (Segunda-Feira)'),
    movel(-47, 'Carnaval (Terça-Feira)'),
    movel(-46, 'Quarta-Feira de Cinzas (Forense)', 'MG'),
    movel(-4, 'Quarta-Feira Santa (Forense Federal/TJMG)', 'MG'),
    movel(-3, 'Quinta-Feira Santa (Forense)', 'MG'),
    movel(-2, 'Sexta-Feira Santa / Paixão de Cristo'),
    fixo('04-21', 'Tiradentes'),
    fixo('05-01', 'Dia do Trabalhador'),
    movel(60, 'Corpus Christi'),
    fixo('08-11', 'Dia da Criação dos Cursos Jurídicos / Dia do Advogado', 'MG'),
    fixo('09-07', 'Independência do Brasil'),
    fixo('10-12', 'Nossa Senhora Aparecida'),
    fixo('10-28', 'Dia do Servidor Público (Forense)', 'MG'),
    fixo('11-02', 'Finados'),
    fixo('11-15', 'Proclamação da República'),
    fixo('11-20', 'Dia da Consciência Negra'),
    fixo('12-08', 'Dia da Justiça (Feriado Forense)', 'MG'),
    fixo('12-25', 'Natal'),
  ];
  return list.map((h) => ({
    id: `HOL-${h.date}`,
    holiday_date: h.date,
    name: h.name,
    jurisdiction: h.jurisdiction,
    is_forensic_recess: 0,
  }));
}

/**
 * Garante os feriados de fromYear a toYear no banco, sem apagar nem alterar nada que já exista
 * (INSERT OR IGNORE: o que o escritório cadastrou ou ajustou continua valendo).
 * @returns {number} quantos feriados novos foram inseridos
 */
export function ensureCourtHolidays(db, fromYear, toYear) {
  const insert = db.prepare(
    'INSERT OR IGNORE INTO court_holidays (id, holiday_date, name, jurisdiction, is_forensic_recess) VALUES (?, ?, ?, ?, ?)'
  );
  let inseridos = 0;
  for (let y = fromYear; y <= toYear; y++) {
    for (const h of holidaysForYear(y)) {
      const r = insert.run(h.id, h.holiday_date, h.name, h.jurisdiction, h.is_forensic_recess);
      inseridos += Number(r.changes || 0);
    }
  }
  return inseridos;
}

/** Quantos anos à frente o calendário cobre, para avisar antes de o prazo "furar" o último ano cadastrado. */
export function holidayCoverage(db, today = new Date()) {
  const row = db.prepare('SELECT MIN(holiday_date) AS first, MAX(holiday_date) AS last FROM court_holidays').get() || {};
  const lastYear = row.last ? Number(String(row.last).slice(0, 4)) : null;
  const thisYear = today.getFullYear();
  const yearsAhead = lastYear == null ? 0 : lastYear - thisYear;
  const MIN_YEARS_AHEAD = 2;
  return {
    first_year: row.first ? Number(String(row.first).slice(0, 4)) : null,
    last_year: lastYear,
    years_ahead: yearsAhead,
    ok: yearsAhead >= MIN_YEARS_AHEAD,
    warning: yearsAhead >= MIN_YEARS_AHEAD
      ? null
      : `O calendário de feriados forenses só vai até ${lastYear ?? '—'}. Prazos que passam desse ano podem ser calculados errado: cadastre os feriados do ano seguinte.`,
  };
}
