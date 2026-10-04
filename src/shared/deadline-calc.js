/**
 * Motor de cálculo de prazos processuais (CPC/15, CLT, CPP, JEF) — funções PURAS (sem banco), para teste.
 * O módulo juridico lê os feriados do banco e chama computeLegalDeadline().
 */

// Helper: Verifica se uma data é dia útil forense (não é sábado, domingo, feriado nem recesso forense)
export function isCourtBusinessDay(dateObj, holidaysMap) {
  const dayOfWeek = dateObj.getDay(); // 0 = Domingo, 6 = Sábado
  if (dayOfWeek === 0 || dayOfWeek === 6) {
    return { isBusinessDay: false, reason: dayOfWeek === 0 ? 'Domingo' : 'Sábado' };
  }

  const y = dateObj.getFullYear();
  const m = String(dateObj.getMonth() + 1).padStart(2, '0');
  const d = String(dateObj.getDate()).padStart(2, '0');
  const dateStr = `${y}-${m}-${d}`;

  // Recesso Forense (art. 220 CPC: 20 de dezembro a 20 de janeiro)
  const month = dateObj.getMonth() + 1;
  const day = dateObj.getDate();
  if ((month === 12 && day >= 20) || (month === 1 && day <= 20)) {
    return { isBusinessDay: false, reason: 'Recesso Forense (Art. 220 CPC)' };
  }

  // Feriado cadastrado
  if (holidaysMap.has(dateStr)) {
    return { isBusinessDay: false, reason: `Feriado: ${holidaysMap.get(dateStr)}` };
  }

  return { isBusinessDay: true, reason: 'Dia Útil' };
}

// Helper: Próximo dia útil
export function getNextCourtBusinessDay(dateObj, holidaysMap) {
  const next = new Date(dateObj);
  next.setDate(next.getDate() + 1);
  while (!isCourtBusinessDay(next, holidaysMap).isBusinessDay) {
    next.setDate(next.getDate() + 1);
  }
  return next;
}

// Motor de Cálculo de Prazos Processuais (CPC/15, CLT, CPP, JEF)
export function computeLegalDeadline(disponibilizacaoStr, daysCount, regime = 'cpc', customHolidays = [], holidaysRows = []) {
  const holidaysMap = new Map();
  holidaysRows.forEach(h => holidaysMap.set(h.holiday_date, h.name));
  customHolidays.forEach(ch => holidaysMap.set(ch.date, ch.name));

  const [y, m, d] = disponibilizacaoStr.slice(0, 10).split('-').map(Number);
  const dataD0 = new Date(y, m - 1, d, 12, 0, 0); // Data da Disponibilização

  // 1. Data da Publicação (D1) = 1º dia útil seguinte à disponibilização (art. 224, § 2º, CPC)
  const dataPublicacao = getNextCourtBusinessDay(dataD0, holidaysMap);

  // 2. Início do Prazo (D2) = 1º dia útil seguinte à publicação (art. 224, § 3º, CPC)
  const dataInicioContagem = getNextCourtBusinessDay(dataPublicacao, holidaysMap);

  const pad = (n) => String(n).padStart(2, '0');
  const fmt = (dt) => `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`;

  const memoriaCalculo = [];
  const feriadosCompensados = [];

  let diasUteisContados = 0;
  let cursor = new Date(dataInicioContagem);
  let dataFatal = null;

  if (regime === 'cpc' || regime === 'clt' || regime === 'jef') {
    // Contagem em DIAS ÚTEIS (Art. 219 CPC / Art. 775 CLT)
    while (diasUteisContados < daysCount) {
      const info = isCourtBusinessDay(cursor, holidaysMap);
      const curFmt = fmt(cursor);

      if (info.isBusinessDay) {
        diasUteisContados++;
        memoriaCalculo.push({
          dia_numero: diasUteisContados,
          data: curFmt,
          status: 'contado',
          descricao: `${diasUteisContados}º Dia Útil`
        });
        if (diasUteisContados === daysCount) {
          dataFatal = new Date(cursor);
          break;
        }
      } else {
        memoriaCalculo.push({
          dia_numero: null,
          data: curFmt,
          status: 'ignorado',
          descricao: info.reason
        });
        if (!feriadosCompensados.some(f => f.date === curFmt)) {
          feriadosCompensados.push({ date: curFmt, reason: info.reason });
        }
      }

      cursor.setDate(cursor.getDate() + 1);
    }
  } else {
    // Contagem em DIAS CORRIDOS (Art. 798 CPP - Penal)
    for (let i = 1; i <= daysCount; i++) {
      const curFmt = fmt(cursor);
      memoriaCalculo.push({
        dia_numero: i,
        data: curFmt,
        status: 'contado',
        descricao: `${i}º Dia Corrido`
      });
      if (i === daysCount) {
        dataFatal = new Date(cursor);
      }
      cursor.setDate(cursor.getDate() + 1);
    }

    // Se o último dia cair em dia não útil, prorroga para o 1º dia útil subsequente (art. 798, § 3º, CPP)
    let infoFatal = isCourtBusinessDay(dataFatal, holidaysMap);
    while (!infoFatal.isBusinessDay) {
      memoriaCalculo.push({
        dia_numero: null,
        data: fmt(dataFatal),
        status: 'prorrogado',
        descricao: `Vencimento em ${infoFatal.reason} -> Prorrogado para o 1º dia útil seguinte`
      });
      dataFatal.setDate(dataFatal.getDate() + 1);
      infoFatal = isCourtBusinessDay(dataFatal, holidaysMap);
    }
  }

  return {
    success: true,
    regime: regime.toUpperCase(),
    prazo_dias: daysCount,
    tipo_dias: (regime === 'cpp' ? 'Corridos' : 'Úteis'),
    data_disponibilizacao: fmt(dataD0),
    data_publicacao: fmt(dataPublicacao),
    data_inicio_prazo: fmt(dataInicioContagem),
    data_fatal: fmt(dataFatal),
    dias_uteis_contados: diasUteisContados,
    total_dias_corridos: Math.round((dataFatal - dataD0) / (1000 * 60 * 60 * 24)),
    feriados_compensados: feriadosCompensados,
    memoria_calculo: memoriaCalculo
  };
}

