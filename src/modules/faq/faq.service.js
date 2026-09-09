/**
 * Módulo FAQ & SEO LOCAL — Serviço de Banco de Dados (SQLite)
 * Jorge Alvim Advocacia — OAB/MG 222.943
 */
import { db } from '../../config/db.js';

// 1. Inicialização da Tabela de FAQs
export function initFaqTable() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS site_faqs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      faq_order INTEGER NOT NULL,
      category TEXT NOT NULL,
      category_label TEXT NOT NULL,
      question TEXT NOT NULL,
      answer TEXT NOT NULL,
      highlight_note TEXT DEFAULT NULL,
      is_active INTEGER DEFAULT 1,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_site_faqs_order ON site_faqs(faq_order ASC);
    CREATE INDEX IF NOT EXISTS idx_site_faqs_active ON site_faqs(is_active);
  `);

  seedFaqsIfEmpty();
}

// 2. Seeder Inicial Idempotente (Direito Militar, Trabalhista, INSS, Trânsito, Família, Atendimento)
// Sem qualquer menção a inventário, conforme diretriz expressa do Dr. Jorge Alvim.
export function seedFaqsIfEmpty() {
  const count = db.prepare(`SELECT COUNT(*) as total FROM site_faqs`).get()?.total || 0;
  if (count === 0) {
    const now = new Date().toISOString();
    const defaults = [
      {
        faq_order: 1,
        category: 'militar',
        category_label: 'Direito Militar • Forças Armadas',
        question: 'Como funciona a consultoria jurídica para Militares das Forças Armadas e pensionistas?',
        answer: 'O Dr. Jorge Alvim é Subtenente R1 do Exército Brasileiro e advogado inscrito na OAB/MG sob o nº 222.943. O escritório atua com reformas militares por invalidez ou incapacidade definitiva, promoções por ressarcimento de preterição, pensões militares, adicional de habilitação e defesas administrativas e judiciais em Processos Administrativos Disciplinares (PAD), Sindicâncias e Inquéritos Policiais Militares (IPM), prestando atendimento presencial em Juiz de Fora e 100% digital seguro para militares em todo o território nacional.',
        highlight_note: '📍 Atendimento presencial para unidades militares de Juiz de Fora (4ª Bda Inf L Mth, 10º BIL, 4º D Sup, 17º B Log) e online para todo o Brasil.'
      },
      {
        faq_order: 2,
        category: 'trabalhista',
        category_label: 'Direito do Trabalho • Rescisão',
        question: 'Fui demitido ou estou com direitos atrasados: qual o prazo para ajuizar Ação Trabalhista em Juiz de Fora?',
        answer: 'Pelo artigo 7º, inciso XXIX da Constituição Federal e pela CLT, o trabalhador dispõe de até 2 (dois) anos após o término do vínculo de emprego para ajuizar uma Reclamatória Trabalhista perante a Justiça do Trabalho (TRT 3ª Região / Varas do Trabalho de Juiz de Fora), podendo cobrar as verbas e direitos relativos aos últimos 5 (cinco) anos contados do ajuizamento (como rescisão indireta, horas extras, insalubridade, FGTS e multa de 40%).',
        highlight_note: '⚡ Realizamos o cálculo prévio e a conferência rescisória sem compromisso para os trabalhadores de Juiz de Fora.'
      },
      {
        faq_order: 3,
        category: 'previdenciario',
        category_label: 'Previdência Social • INSS',
        question: 'O que fazer se o INSS de Juiz de Fora indeferir ou demorar para conceder meu benefício?',
        answer: 'O indeferimento administrativo emitido pela Agência da Previdência Social (APS Juiz de Fora) não encerra os seus direitos. É possível ingressar com Ação Judicial perante a Justiça Federal de Juiz de Fora (TRF6), onde a perícia é realizada por médico perito neutro nomeado pelo juiz. Sendo julgada procedente, o segurado recebe todos os valores atrasados corrigidos desde a Data de Entrada do Requerimento (DER).',
        highlight_note: '⚖️ Atuamos no Fórum Federal de Juiz de Fora e nos Juizados Especiais Federais (JEF).'
      },
      {
        faq_order: 4,
        category: 'transito',
        category_label: 'Trânsito • CNH Suspensa • DETRAN-MG',
        question: 'Como funciona a defesa contra suspensão ou cassação da CNH no DETRAN-MG?',
        answer: 'Ao receber a notificação de instauração de processo de suspensão ou cassação da CNH pelo DETRAN-MG, o motorista não deve entregar seu documento. O CTB garante o direito à ampla defesa técnica em três fases sucessivas (Defesa Prévia, JARI e CETRAN-MG). Enquanto os recursos tramitam, vigora o efeito suspensivo que permite continuar dirigindo legalmente.',
        highlight_note: '🚦 Especial atenção a motoristas profissionais (EAR), condutores de aplicativos e frotistas.'
      },
      {
        faq_order: 5,
        category: 'familia',
        category_label: 'Direito de Família • Divórcio & Pensão',
        question: 'Como funciona o processo de Divórcio, Pensão Alimentícia e Guarda de Filhos em Juiz de Fora?',
        answer: 'O Dr. Jorge Alvim conduz processos de Direito de Família de forma humanizada e ágil. Atuamos em divórcios consensuais (que podem ser formalizados rapidamente em cartório ou homologados em juízo), divórcios litigiosos com partilha justa de bens, ações de fixação, revisão ou execução de pensão alimentícia, além de guarda compartilhada e plano de convivência familiar perante as Varas de Família de Juiz de Fora (Fórum Benjamin Colucci).',
        highlight_note: '👨‍👩‍👧 Atendimento humanizado e discreto para proteção dos filhos e do patrimônio familiar.'
      },
      {
        faq_order: 6,
        category: 'atendimento',
        category_label: 'Atendimento • Sede Física • Plataforma Digital',
        question: 'O escritório atende presencialmente em Benfica e também de forma 100% online?',
        answer: 'Sim! Dispomos de sede física em Juiz de Fora na Rua Henrique Dias, nº 259, Loja 5 — Benfica (atendimento com hora marcada para total privacidade) e também contamos com infraestrutura jurídica 100% digital: assinatura eletrônica mobile na tela do celular (Lei 14.063/2020), envio de documentos por link seguro sem aplicativos e acompanhamento pelo Portal do Cliente em todo o Brasil.',
        highlight_note: '📱 Fale com a nossa equipe pelo WhatsApp oficial: (32) 99815-3429.'
      }
    ];

    const stmt = db.prepare(`
      INSERT INTO site_faqs (faq_order, category, category_label, question, answer, highlight_note, is_active, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, 1, ?)
    `);

    for (const item of defaults) {
      stmt.run(
        item.faq_order,
        item.category,
        item.category_label,
        item.question,
        item.answer,
        item.highlight_note,
        now
      );
    }
    console.log('❓ [FAQ] 6 Perguntas Frequentes iniciais semeadas com sucesso no banco SQLite!');
  } else {
    // Garante que qualquer registro legado contendo 'Inventário' seja atualizado para Direito de Família
    const now = new Date().toISOString();
    db.prepare(`
      UPDATE site_faqs
      SET category = 'familia',
          category_label = 'Direito de Família • Divórcio & Pensão',
          question = 'Como funciona o processo de Divórcio, Pensão Alimentícia e Guarda de Filhos em Juiz de Fora?',
          answer = 'O Dr. Jorge Alvim conduz processos de Direito de Família de forma humanizada e ágil. Atuamos em divórcios consensuais (que podem ser formalizados rapidamente em cartório ou homologados em juízo), divórcios litigiosos com partilha justa de bens, ações de fixação, revisão ou execução de pensão alimentícia, além de guarda compartilhada e plano de convivência familiar perante as Varas de Família de Juiz de Fora (Fórum Benjamin Colucci).',
          highlight_note = '👨‍👩‍👧 Atendimento humanizado e discreto para proteção dos filhos e do patrimônio familiar.',
          updated_at = ?
      WHERE category = 'familia' AND (question LIKE '%Inventário%' OR answer LIKE '%Inventário%')
    `).run(now);
  }
}

// 3. Operações CRUD
export function listFaqs({ onlyActive = false } = {}) {
  const query = onlyActive
    ? `SELECT * FROM site_faqs WHERE is_active = 1 ORDER BY faq_order ASC, id ASC`
    : `SELECT * FROM site_faqs ORDER BY faq_order ASC, id ASC`;
  return db.prepare(query).all();
}

export function getFaqById(id) {
  return db.prepare(`SELECT * FROM site_faqs WHERE id = ?`).get(id);
}

export function createFaq({ faq_order, category, category_label, question, answer, highlight_note, is_active = 1 }) {
  const now = new Date().toISOString();
  let order = Number(faq_order);
  if (!order || isNaN(order)) {
    const maxOrder = db.prepare(`SELECT MAX(faq_order) as m FROM site_faqs`).get()?.m || 0;
    order = maxOrder + 1;
  }

  const result = db.prepare(`
    INSERT INTO site_faqs (faq_order, category, category_label, question, answer, highlight_note, is_active, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    order,
    (category || 'geral').toLowerCase().trim(),
    category_label || 'Geral',
    question.trim(),
    answer.trim(),
    highlight_note ? highlight_note.trim() : null,
    is_active ? 1 : 0,
    now
  );

  return getFaqById(result.lastInsertRowid);
}

export function updateFaq(id, { faq_order, category, category_label, question, answer, highlight_note, is_active }) {
  const now = new Date().toISOString();
  const current = getFaqById(id);
  if (!current) return null;

  db.prepare(`
    UPDATE site_faqs
    SET faq_order = ?,
        category = ?,
        category_label = ?,
        question = ?,
        answer = ?,
        highlight_note = ?,
        is_active = ?,
        updated_at = ?
    WHERE id = ?
  `).run(
    faq_order !== undefined ? Number(faq_order) : current.faq_order,
    category !== undefined ? category.toLowerCase().trim() : current.category,
    category_label !== undefined ? category_label.trim() : current.category_label,
    question !== undefined ? question.trim() : current.question,
    answer !== undefined ? answer.trim() : current.answer,
    highlight_note !== undefined ? (highlight_note ? highlight_note.trim() : null) : current.highlight_note,
    is_active !== undefined ? (is_active ? 1 : 0) : current.is_active,
    now,
    id
  );

  return getFaqById(id);
}

export function deleteFaq(id) {
  const current = getFaqById(id);
  if (!current) return false;
  db.prepare(`DELETE FROM site_faqs WHERE id = ?`).run(id);
  return true;
}
