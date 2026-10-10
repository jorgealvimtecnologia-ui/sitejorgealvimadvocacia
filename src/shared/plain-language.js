/**
 * Linguagem simples para o cliente (AUD-16): explica andamentos e termos jurídicos sem juridiquês.
 *
 * Regras de ouro:
 *  - nunca inventa fato: a frase automática só explica O QUE O TIPO DE ANDAMENTO SIGNIFICA, não o conteúdo do caso;
 *  - o advogado sempre pode substituir pelo texto dele (client_text / client_summary);
 *  - nada interno (notas, descrição do andamento, prazos estratégicos) sai daqui: só título oficial + frase simples.
 */

// A ORDEM importa: a primeira regra que casar vence. Termos mais específicos vêm antes dos genéricos
// (ex.: "cumprimento de sentença" e "audiência de julgamento" antes de "sentença").
const MOVEMENT_RULES = [
  [/tr[âa]nsito em julgado/i, 'A decisão se tornou definitiva: não cabe mais recurso.'],
  [/cumprimento de senten[çc]a|execu[çc][ãa]o|penhora|bloqueio/i, 'O processo está na fase de fazer valer o que foi decidido.'],
  [/audi[êe]ncia/i, 'Há uma audiência marcada, realizada ou alterada: é um encontro com o juiz para ouvir as partes.'],
  [/acord[ao]|homologa[çc][ãa]o de acordo|concilia[çc][ãa]o/i, 'As partes chegaram a um acordo ou há uma tentativa de acordo em andamento.'],
  [/recurso|apela[çc][ãa]o|agravo|embargos/i, 'Há um pedido para que uma decisão seja revista.'],
  [/senten[çc]a|julgad[oa]\b/i, 'O juiz decidiu o caso (decisão principal do processo).'],
  [/cita[çc][ãa]o|citad[oa]/i, 'A outra parte foi avisada oficialmente do processo e terá um prazo para responder.'],
  [/intima[çc][ãa]o|intimad[oa]/i, 'O juízo comunicou algo oficialmente. Estamos analisando o que precisa ser feito.'],
  [/conclus[ãa]o|conclusos?/i, 'O processo foi enviado ao juiz para ele analisar e decidir o próximo passo.'],
  [/despacho/i, 'O juiz deu uma orientação para o andamento do processo.'],
  [/decis[ãa]o interlocut[óo]ria|tutela|liminar/i, 'O juiz decidiu um ponto específico no meio do processo.'],
  [/per[ií]cia|perit[oa]/i, 'Haverá (ou houve) uma avaliação técnica por um especialista indicado pelo juiz.'],
  [/juntada|junta(?:r|da)\b/i, 'Um documento foi anexado ao processo.'],
  [/peti[çc][ãa]o|manifesta[çc][ãa]o|contesta[çc][ãa]o|r[ée]plica/i, 'Foi apresentado um pedido ou uma manifestação no processo.'],
  [/alvar[áa]|expedi[çc][ãa]o|levantamento/i, 'Foi autorizada a liberação de um valor ou a emissão de um documento oficial.'],
  [/arquiv/i, 'O processo foi encerrado e guardado (arquivado).'],
  [/distribui[çc][ãa]o|distribu[ií]d[oa]|autua[çc][ãa]o/i, 'O processo foi registrado e encaminhado a um juiz.'],
  [/publica[çc][ãa]o|publicad[oa]/i, 'A decisão ou o comunicado foi divulgado no Diário da Justiça.'],
  [/remessa|baixa|redistribu/i, 'O processo foi enviado para outro setor ou juízo.'],
  [/suspens/i, 'O processo está temporariamente parado por determinação do juiz.'],
];

const FALLBACK_MOVEMENT = 'Houve uma movimentação no processo. Nosso escritório está acompanhando e avisará se precisar de você.';

/** Frase simples sobre um andamento (a partir do título oficial). */
export function explainMovement(title = '') {
  const t = String(title);
  for (const [re, text] of MOVEMENT_RULES) if (re.test(t)) return text;
  return FALLBACK_MOVEMENT;
}

const STATUS_RULES = [
  [/arquiv|encerrad|baixad|conclu[ií]d/i, 'O processo foi encerrado. Se houver algo pendente, entraremos em contato.'],
  [/suspens|sobrest/i, 'O processo está temporariamente parado por determinação do juiz.'],
  [/aguard.*(senten|julg|decis)/i, 'O processo está pronto para o juiz decidir. Agora é aguardar.'],
  [/recurso|2[ªa] inst|segunda inst/i, 'O caso está em análise por um tribunal superior, a pedido de uma das partes.'],
  [/execu|cumprimento/i, 'O processo está na fase de fazer valer o que foi decidido.'],
  [/andamento|ativo|tramit/i, 'O processo está em andamento normalmente.'],
];

/** Situação em uma frase. Prioridade: texto do advogado; senão, a partir do status; senão, genérica. */
export function explainSituation({ client_summary, status } = {}) {
  const custom = String(client_summary || '').trim();
  if (custom) return { text: custom, source: 'advogado' };
  const s = String(status || '');
  for (const [re, text] of STATUS_RULES) if (re.test(s)) return { text, source: 'automatico' };
  return { text: 'O processo está em andamento. Nosso escritório acompanha cada passo.', source: 'automatico' };
}

/** Glossário que o portal usa para explicar termos "ao toque". */
export const GLOSSARY = [
  { term: 'Citação', meaning: 'Aviso oficial à outra parte de que existe um processo contra ela, para que responda.' },
  { term: 'Intimação', meaning: 'Comunicação oficial do juízo para que alguém faça ou saiba de algo no processo.' },
  { term: 'Despacho', meaning: 'Orientação do juiz para o andamento do processo, sem decidir o mérito do caso.' },
  { term: 'Sentença', meaning: 'A decisão do juiz que resolve o caso na primeira instância.' },
  { term: 'Acórdão', meaning: 'Decisão tomada em conjunto por juízes de um tribunal (segunda instância).' },
  { term: 'Recurso', meaning: 'Pedido para que uma decisão seja revista por outro juiz ou tribunal.' },
  { term: 'Apelação', meaning: 'Recurso contra uma sentença, levado ao tribunal.' },
  { term: 'Agravo', meaning: 'Recurso contra uma decisão do juiz tomada no meio do processo.' },
  { term: 'Trânsito em julgado', meaning: 'Quando a decisão não pode mais ser contestada porque acabaram os prazos para recorrer.' },
  { term: 'Audiência', meaning: 'Encontro com o juiz (presencial ou por vídeo) para ouvir as partes e as testemunhas.' },
  { term: 'Perícia', meaning: 'Avaliação técnica feita por um especialista nomeado pelo juiz (por exemplo, médico ou engenheiro).' },
  { term: 'Liminar', meaning: 'Decisão rápida, dada no início, para proteger um direito enquanto o processo segue.' },
  { term: 'Tutela', meaning: 'Medida para garantir um direito com urgência antes da decisão final.' },
  { term: 'Alvará', meaning: 'Autorização do juiz, por exemplo para liberar um valor depositado no processo.' },
  { term: 'Penhora', meaning: 'Bloqueio de bens ou valores para garantir o pagamento de uma dívida reconhecida.' },
  { term: 'Execução', meaning: 'Fase em que se busca fazer cumprir o que ficou decidido ou o que consta em um título.' },
  { term: 'Cumprimento de sentença', meaning: 'Fase em que a parte que perdeu é cobrada a cumprir a decisão.' },
  { term: 'Contestação', meaning: 'A resposta da parte que foi processada ao pedido feito contra ela.' },
  { term: 'Réplica', meaning: 'Resposta de quem processou à contestação da outra parte.' },
  { term: 'Juntada', meaning: 'Anexar um documento ao processo.' },
  { term: 'Conclusos', meaning: 'Quando o processo está com o juiz para ele analisar e decidir.' },
  { term: 'Distribuição', meaning: 'Sorteio ou registro que define qual juiz cuidará do processo.' },
  { term: 'Petição', meaning: 'Documento em que se faz um pedido ou uma manifestação ao juiz.' },
  { term: 'Prazo', meaning: 'Tempo limite que a lei ou o juiz dá para algo ser feito no processo.' },
  { term: 'Parte', meaning: 'Quem participa do processo: quem pede (autor) e quem responde (réu).' },
  { term: 'Vara', meaning: 'A unidade da Justiça onde o processo tramita, com um juiz responsável.' },
  { term: 'Competência', meaning: 'Qual juízo pode, pela lei, julgar aquele tipo de caso.' },
  { term: 'Honorários', meaning: 'Pagamento devido ao advogado pelo trabalho prestado.' },
  { term: 'Custas', meaning: 'Taxas cobradas pela Justiça para o processo andar.' },
  { term: 'Arquivamento', meaning: 'Encerramento do processo, que fica guardado sem novos andamentos.' },
];

/**
 * Visão do processo para o CLIENTE. Só campos curados: nada de notas internas, nome de juiz, descrição interna
 * nem andamentos que o advogado não publicou.
 */
export function buildClientLawsuitView(lawsuit, movements = []) {
  const sit = explainSituation(lawsuit);
  const action = String(lawsuit.client_next_action || '').trim();
  const needed = !!lawsuit.client_action_needed && !!action;
  const timeline = movements
    .filter((m) => m.client_visible === 1 || m.client_visible === true)
    .map((m) => {
      const custom = String(m.client_text || '').trim();
      return {
        id: m.id,
        date: m.movement_date,
        title: m.title,
        simple: custom || explainMovement(m.title),
        source: custom ? 'advogado' : 'automatico',
      };
    });
  return {
    id: lawsuit.id,
    cnj_number: lawsuit.cnj_number,
    tribunal: lawsuit.tribunal,
    instance: lawsuit.instance,
    action_type: lawsuit.action_type,
    subject: lawsuit.subject,
    status: lawsuit.status,
    distribution_date: lawsuit.distribution_date,
    situation: sit.text,
    situation_source: sit.source,
    action_needed: needed,
    next_action: action || 'Nada a fazer agora. Nosso escritório acompanha o processo para você.',
    updated_at: lawsuit.client_updated_at || lawsuit.updated_at,
    timeline,
  };
}
