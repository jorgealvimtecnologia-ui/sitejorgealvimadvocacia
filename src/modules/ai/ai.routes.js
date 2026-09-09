import express from 'express';
import { requireAuth } from '../../middleware/auth.js';
import { logAudit } from '../../middleware/audit.js';

export const aiRouter = express.Router();

/**
 * 1. POST /api/ai/draft-document - Gerador Inteligente de Peças Jurídicas & Minutas
 */
aiRouter.post('/api/ai/draft-document', requireAuth, (req, res) => {
  try {
    const {
      doc_type = 'peticao_inicial',
      client_name,
      client_cpf_cnpj,
      adverse_party,
      court_jurisdiction = 'Vara Cível da Comarca de Belo Horizonte/MG',
      facts_summary,
      legal_grounds,
      requests_summary,
      value_in_dispute
    } = req.body;

    if (!doc_type || !client_name || !facts_summary) {
      return res.status(400).json({ error: 'Tipo de documento, nome do cliente e resumo dos fatos são obrigatórios.' });
    }

    const titles = {
      peticao_inicial: 'EXCELENTÍSSIMO(A) SENHOR(A) DOUTOR(A) JUIZ(A) DE DIREITO DA',
      contestacao: 'EXCELENTÍSSIMO(A) SENHOR(A) DOUTOR(A) JUIZ(A) DE DIREITO DA',
      recurso_apelacao: 'EXCELENTÍSSIMO(A) SENHOR(A) DESEMBARGADOR(A) RELATOR(A) DO EGRÉGIO TRIBUNAL DE JUSTIÇA',
      notificacao_extrajudicial: 'NOTIFICAÇÃO EXTRAJUDICIAL COM AVISO DE RECEBIMENTO',
      contrato_honorarios: 'CONTRATO DE PRESTAÇÃO DE SERVIÇOS ADVOCATÍCIOS E HONORÁRIOS'
    };

    const header = titles[doc_type] || 'EXCELENTÍSSIMO(A) SENHOR(A) DOUTOR(A) JUIZ(A) DE DIREITO';
    const nowFormatted = new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });

    let draftContent = '';

    if (doc_type === 'notificacao_extrajudicial') {
      draftContent = `
${header}

NOTIFICANTE: ${client_name.toUpperCase()}, portador(a) do documento nº ${client_cpf_cnpj || 'inscrito no CPF/CNPJ'}, representado(a) por seu advogado signatário, Dr. Jorge Alvim (OAB/MG).

NOTIFICADO(A): ${adverse_party ? adverse_party.toUpperCase() : 'À PARTE INTERESSADA / NOTIFICADA'}.

I - DOS FATOS:
${facts_summary}

II - DOS FUNDAMENTOS JURÍDICOS:
${legal_grounds || 'Diante do inadimplemento e descumprimento das obrigações legais e contratuais estabelecidas pelo Código Civil Brasileiro e legislação extravagante aplicável.'}

III - DO REQUERIMENTO E PRAZO DE REGULARIZAÇÃO:
Serve a presente NOTIFICAÇÃO EXTRAJUDICIAL para NOTIFICAR e CONSTITUIR EM MORA a Notificada para que, no prazo impreterível de 48 (quarenta e oito) horas a contar do recebimento desta:
1. ${requests_summary || 'Proceda à imediata regularização da pendência apontada'};
2. Sob pena de ajuizamento incontinenti da competente AÇÃO JUDICIAL, com pedido de perdas, danos, honorários advocatícios e custas processuais.

Belo Horizonte/MG, ${nowFormatted}.

______________________________________________
JORGE ALVIM ADVOCACIA & TECNOLOGIA
Dr. Jorge Alvim — OAB/MG
      `.trim();
    } else if (doc_type === 'contrato_honorarios') {
      draftContent = `
CONTRATO DE PRESTAÇÃO DE SERVIÇOS ADVOCATÍCIOS E QUOTA LITIS

CONTRATANTE: ${client_name.toUpperCase()}, portador(a) do CPF/CNPJ nº ${client_cpf_cnpj || '________________'}.
CONTRATADO: JORGE ALVIM ADVOCACIA, sociedade de advogados regularmente inscrita na OAB/MG.

CLÁUSULA 1ª - DO OBJETO:
O CONTRATADO obriga-se a prestar assistência jurídica e patrocínio dos interesses do(a) CONTRATANTE na seguinte demanda:
${facts_summary}

CLÁUSULA 2ª - DOS HONORÁRIOS ADVOCATÍCIOS:
Pelos serviços pactuados, o(a) CONTRATANTE pagará ao CONTRATADO o valor ${value_in_dispute ? 'de ' + value_in_dispute : 'acordado entre as partes'}, nas condições:
${requests_summary || 'Conforme estipulado no termo de adesão financeiro.'}

CLÁUSULA 3ª - DO FORO:
Para dirimir quaisquer dúvidas oriundas deste contrato, as partes elegem o foro da Comarca de Belo Horizonte/MG.

Belo Horizonte/MG, ${nowFormatted}.

__________________________________        __________________________________
CONTRATANTE: ${client_name}                CONTRATADO: Jorge Alvim Advocacia
      `.trim();
    } else {
      // Petição Inicial / Contestação / Recursos
      draftContent = `
${header} ${court_jurisdiction.toUpperCase()}

PROCESSO Nº: (Distribuição Inicial / Autos nº _____________)

AUTOR(A): ${client_name.toUpperCase()}, ${client_cpf_cnpj ? 'inscrito(a) sob o CPF/CNPJ nº ' + client_cpf_cnpj : 'já qualificado(a) nos autos'}, por seu advogado Dr. Jorge Alvim (OAB/MG), vem, respeitosamente, à presença de Vossa Excelência, propor a presente

AÇÃO JUDICIAL C/C PEDIDO DE TUTELA DE URGÊNCIA

em face de ${adverse_party ? adverse_party.toUpperCase() : 'PARTE RÉ / ADVERSA'}, pelos fatos e fundamentos a seguir expostos:

I - DOS FATOS:
${facts_summary}

II - DO DIREITO E FUNDAMENTAÇÃO:
${legal_grounds || 'A pretensão do Autor encontra pleno amparo na legislação pátria, na jurisprudência pacífica dos Tribunais Superiores e nos princípios fundamentais da boa-fé, da dignidade e da reparação integral do dano.'}

III - DOS PEDIDOS:
Diante de todo o exposto, requer a Vossa Excelência:
1. A citação do(a) Réu(ré) para, querendo, apresentar resposta no prazo legal;
2. ${requests_summary || 'A total procedência dos pedidos formulados na exordial com a condenação do réu'};
3. A condenação da parte adversa ao pagamento das custas processuais e honorários advocatícios sucumbenciais nos termos do art. 85 do CPC.

Dá-se à causa o valor de: ${value_in_dispute || 'R$ 10.000,00'}.

Nestes termos,
Pede e espera deferimento.

Belo Horizonte/MG, ${nowFormatted}.

______________________________________________
DR. JORGE ALVIM — OAB/MG
Jorge Alvim Advocacia & Tecnologia
      `.trim();
    }

    logAudit(req, {
      event_type: 'CRIACAO',
      event_name: 'IA_GERAR_MINUTA',
      module: 'INTELIGENCIA_ARTIFICIAL',
      description: `Minuta de ${doc_type} gerada pela IA para o cliente ${client_name}.`
    });

    return res.json({
      success: true,
      doc_type,
      title: `${client_name} - ${doc_type.replace(/_/g, ' ').toUpperCase()}`,
      content: draftContent
    });
  } catch (err) {
    console.error('[IA] Falha ao redigir minuta:', err);
    return res.status(500).json({ error: 'Erro ao processar redação inteligente com IA.' });
  }
});

/**
 * 2. POST /api/ai/analyze-publication - Analisador Inteligente de Publicações, Sentenças e Prazos (CPC/CLT)
 */
aiRouter.post('/api/ai/analyze-publication', requireAuth, (req, res) => {
  try {
    const { publication_text, regime = 'CPC' } = req.body;

    if (!publication_text || publication_text.trim().length < 10) {
      return res.status(400).json({ error: 'Texto da publicação/intimação é obrigatório para análise.' });
    }

    const textLower = publication_text.toLowerCase();
    let detectedType = 'Despacho de Mero Expediente';
    let suggestedDays = 5;
    let suggestedAction = 'Tomar ciência do despacho e cumprir determinações.';
    let urgencyLevel = 'Normal';

    if (textLower.includes('sentença') || textLower.includes('julgo procedente') || textLower.includes('julgo improcedente')) {
      detectedType = 'Sentença de Mérito';
      if (regime === 'CLT') {
        suggestedDays = 8;
        suggestedAction = 'Interpor Recurso Ordinário (RO) no prazo de 8 dias úteis ou Embargos de Declaração em 5 dias.';
      } else {
        suggestedDays = 15;
        suggestedAction = 'Interpor Recurso de Apelação no prazo de 15 dias úteis ou Embargos de Declaração em 5 dias.';
      }
      urgencyLevel = 'Altíssima';
    } else if (textLower.includes('embargos de declaração') || textLower.includes('omissão') || textLower.includes('obscuridade')) {
      detectedType = 'Intimação / Embargos de Declaração';
      suggestedDays = 5;
      suggestedAction = 'Opor Embargos de Declaração no prazo de 5 dias úteis.';
      urgencyLevel = 'Urgente';
    } else if (textLower.includes('contestar') || textLower.includes('contestação') || textLower.includes('apresentar defesa')) {
      detectedType = 'Citação / Prazo para Contestação';
      suggestedDays = 15;
      suggestedAction = 'Elaborar e protocolar Contestação com preliminares e documentos no prazo de 15 dias úteis.';
      urgencyLevel = 'Altíssima';
    } else if (textLower.includes('perícia') || textLower.includes('perito') || textLower.includes('quesitos')) {
      detectedType = 'Determinação Pericial';
      suggestedDays = 15;
      suggestedAction = 'Apresentar quesitos e indicar assistente técnico no prazo legal.';
      urgencyLevel = 'Urgente';
    } else if (textLower.includes('audiência') || textLower.includes('conciliação') || textLower.includes('instrução')) {
      detectedType = 'Designação de Audiência';
      suggestedDays = 10;
      suggestedAction = 'Intimar cliente, alinhar testemunhas e cadastrar na pauta de audiências.';
      urgencyLevel = 'Altíssima';
    }

    // Cálculo da data fatal sugerida a partir de hoje (estimativa em dias úteis)
    const targetDate = new Date();
    let addedDays = 0;
    while (addedDays < suggestedDays) {
      targetDate.setDate(targetDate.getDate() + 1);
      const dayOfWeek = targetDate.getDay();
      if (dayOfWeek !== 0 && dayOfWeek !== 6) { // Ignora sábado e domingo
        addedDays++;
      }
    }
    const fatalDateIso = targetDate.toISOString().split('T')[0];

    // Extração de CNJ por regex
    const cnjMatch = publication_text.match(/\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4}/);
    const detectedCnj = cnjMatch ? cnjMatch[0] : null;

    return res.json({
      success: true,
      analysis: {
        detected_type: detectedType,
        detected_cnj: detectedCnj,
        regime: regime.toUpperCase(),
        deadline_days: suggestedDays,
        deadline_type: 'Dias Úteis',
        fatal_date_estimate: fatalDateIso,
        suggested_action: suggestedAction,
        urgency_level: urgencyLevel,
        summary: `Decisão classificada como "${detectedType}". Prazo fatal sugerido de ${suggestedDays} dias úteis (${regime.toUpperCase()}).`
      }
    });
  } catch (err) {
    console.error('[IA] Falha na análise de publicação:', err);
    return res.status(500).json({ error: 'Erro ao analisar publicação com IA.' });
  }
});

/**
 * 3. POST /api/ai/qualify-lead - Triagem e Diagnóstico Preliminar de Atendimento
 */
aiRouter.post('/api/ai/qualify-lead', requireAuth, (req, res) => {
  try {
    const { name, area, message, phone } = req.body;
    if (!message) {
      return res.status(400).json({ error: 'Relato do atendimento é obrigatório.' });
    }

    const msgLower = message.toLowerCase();
    let probabilityScore = 75; // %
    let priority = 'Normal';
    let recommendations = [];

    if (msgLower.includes('urgente') || msgLower.includes('mandado') || msgLower.includes('bloqueio') || msgLower.includes('penhora') || msgLower.includes('preso')) {
      priority = 'Urgente / Imediata';
      probabilityScore = 90;
      recommendations.push('⚡ Caso de urgência! Contatar o cliente via WhatsApp imediatamente.');
    }

    if (msgLower.includes('demissão') || msgLower.includes('rescisão') || msgLower.includes('horas extras') || msgLower.includes('sem carteira')) {
      recommendations.push('💼 Ramo Trabalhista: Solicitar extrato do FGTS, CTPS digital e holerites dos últimos 12 meses.');
    } else if (msgLower.includes('divórcio') || msgLower.includes('pensão') || msgLower.includes('guarda') || msgLower.includes('família') || msgLower.includes('alimentos')) {
      recommendations.push('👨‍👩‍👧 Direito de Família: Verificar certidão de casamento/nascimento dos filhos e comprovantes de despesas/rendimentos.');
    } else if (msgLower.includes('banco') || msgLower.includes('juros') || msgLower.includes('golpe') || msgLower.includes('pix')) {
      recommendations.push('💳 Direito Bancário/Consumidor: Coletar extratos com as transações impugnadas e boletim de ocorrência.');
    } else {
      recommendations.push('📋 Agendar consulta jurídica inicial para colheita detalhada de provas e procuração.');
    }

    return res.json({
      success: true,
      qualification: {
        client_name: name || 'Lead Interessado',
        area: area || 'Geral',
        priority,
        probability_score: `${probabilityScore}%`,
        recommendations,
        next_step: `Disparar mensagem no WhatsApp (${phone || 'não informado'}) e solicitar documentos pertinentes.`
      }
    });
  } catch (err) {
    console.error('[IA] Falha na qualificação de lead:', err);
    return res.status(500).json({ error: 'Erro ao processar diagnóstico com IA.' });
  }
});
