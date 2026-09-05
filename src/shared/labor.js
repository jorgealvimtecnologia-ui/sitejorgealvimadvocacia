/**
 * Cálculos trabalhistas/CLT compartilhados (folha, rescisão, INSS/IRRF/FGTS/VT).
 * Usados pelo módulo HR e pela rota /api/documents/generate-template.
 */
// Função auxiliar para calcular dias de aviso prévio proporcional (Lei 12.506/2011)
export function calculateNoticeDays(admissionDate, dismissalDate) {
  const start = new Date(admissionDate);
  const end = new Date(dismissalDate);
  let years = end.getFullYear() - start.getFullYear();
  const m = end.getMonth() - start.getMonth();
  if (m < 0 || (m === 0 && end.getDate() < start.getDate())) {
    years--;
  }
  const completeYears = Math.max(0, years);
  const additionalDays = Math.min(60, completeYears * 3);
  return { notice_days: 30 + additionalDays, complete_years: completeYears };
}

// Função para cálculo progressivo simplificado de INSS
export function calculateINSS(amount) {
  if (amount <= 0) return 0;
  if (amount <= 1412.00) return +(amount * 0.075).toFixed(2);
  if (amount <= 2666.68) return +(1412.00 * 0.075 + (amount - 1412.00) * 0.09).toFixed(2);
  if (amount <= 4000.03) return +(1412.00 * 0.075 + (2666.68 - 1412.00) * 0.09 + (amount - 2666.68) * 0.12).toFixed(2);
  if (amount <= 7786.02) return +(1412.00 * 0.075 + (2666.68 - 1412.00) * 0.09 + (4000.03 - 2666.68) * 0.12 + (amount - 4000.03) * 0.14).toFixed(2);
  return 908.85; // Teto INSS aproximado
}

// 1. Simulação / Cálculo de Rescisão Trabalhista CLT

export function calculateINSSProgressivo(grossSalary) {
  const salary = Number(grossSalary) || 0;
  if (salary <= 0) return 0;

  // Faixas 2026:
  // 1ª: até 1.518,00 -> 7,5%
  // 2ª: 1.518,01 a 2.793,88 -> 9% (dedução 22,77)
  // 3ª: 2.793,89 a 4.190,83 -> 12% (dedução 106,59)
  // 4ª: 4.190,84 a 8.157,41 -> 14% (dedução 190,40)
  // Teto máximo: 951,63
  let inss = 0;
  if (salary <= 1518.00) {
    inss = salary * 0.075;
  } else if (salary <= 2793.88) {
    inss = (salary * 0.09) - 22.77;
  } else if (salary <= 4190.83) {
    inss = (salary * 0.12) - 106.59;
  } else if (salary <= 8157.41) {
    inss = (salary * 0.14) - 190.40;
  } else {
    inss = 951.63; // Teto
  }
  return Math.max(0, Math.round(inss * 100) / 100);
}

// Cálculo de IRRF 2026 (após INSS e dependentes R$ 189,59/cada)
export function calculateIRRF(grossSalary, inssDeduction, dependentsCount = 0, otherDeductions = 0) {
  const salary = Number(grossSalary) || 0;
  const inss = Number(inssDeduction) || 0;
  const deps = Number(dependentsCount) || 0;
  const depDeduction = deps * 189.59;

  const baseCalculo = Math.max(0, salary - inss - depDeduction - otherDeductions);

  let irrf = 0;
  if (baseCalculo <= 2259.20) {
    irrf = 0;
  } else if (baseCalculo <= 2826.65) {
    irrf = (baseCalculo * 0.075) - 169.44;
  } else if (baseCalculo <= 3751.05) {
    irrf = (baseCalculo * 0.15) - 381.44;
  } else if (baseCalculo <= 4664.68) {
    irrf = (baseCalculo * 0.225) - 662.77;
  } else {
    irrf = (baseCalculo * 0.275) - 896.00;
  }
  return Math.max(0, Math.round(irrf * 100) / 100);
}

// Cálculo de Vale-Transporte (Lei 7.418/85 - Desconto máximo de 6% do salário base)
export function calculateVTDeduction(baseSalary, vtDailyValue = 12.00, workingDays = 22, vtEnabled = 1) {
  if (!vtEnabled) return 0;
  const totalCost = workingDays * vtDailyValue;
  const maxDeduction = (Number(baseSalary) || 0) * 0.06;
  return Math.round(Math.min(totalCost, maxDeduction) * 100) / 100;
}

// Cálculo de FGTS 8% (Recolhimento Patronal - Lei 8.036/90)
export function calculateFGTS(grossSalary, isEstagio = false) {
  if (isEstagio) return 0;
  return Math.round((Number(grossSalary) || 0) * 0.08 * 100) / 100;
}
