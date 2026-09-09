/**
 * Módulo FAQ & SEO LOCAL — Rotas de API
 * Jorge Alvim Advocacia — OAB/MG 222.943
 */
import express from 'express';
import { requireAuth } from '../../middleware/auth.js';
import { logAudit } from '../../middleware/audit.js';
import {
  initFaqTable,
  listFaqs,
  getFaqById,
  createFaq,
  updateFaq,
  deleteFaq
} from './faq.service.js';

export const faqRouter = express.Router();

// Inicializa a tabela e os dados iniciais
initFaqTable();

// 1. Rota Pública para o Site (index.html)
faqRouter.get('/api/site/faqs', (req, res) => {
  try {
    const faqs = listFaqs({ onlyActive: true });
    return res.json({ success: true, faqs });
  } catch (error) {
    console.error('[ERRO] Falha ao listar FAQs públicos:', error);
    return res.status(500).json({ error: 'Erro ao consultar FAQs.' });
  }
});

// 2. Rota Administrativa para o Painel (Listagem Completa)
faqRouter.get('/api/admin/site/faqs', requireAuth, (req, res) => {
  try {
    const faqs = listFaqs({ onlyActive: false });
    return res.json({ success: true, faqs });
  } catch (error) {
    console.error('[ERRO] Falha ao listar FAQs no painel:', error);
    return res.status(500).json({ error: 'Erro ao listar FAQs no painel.' });
  }
});

// 3. Rota Administrativa: Criar Nova Pergunta
faqRouter.post('/api/admin/site/faqs', requireAuth, (req, res) => {
  try {
    const { faq_order, category, category_label, question, answer, highlight_note, is_active } = req.body;
    if (!question || !answer) {
      return res.status(400).json({ error: 'Pergunta e resposta são obrigatórias.' });
    }

    const created = createFaq({
      faq_order,
      category,
      category_label,
      question,
      answer,
      highlight_note,
      is_active: is_active !== undefined ? is_active : 1
    });

    try {
      logAudit(req, {
        event_type: 'CRIACAO',
        event_name: 'FAQ_CREATE',
        module: 'faq',
        resource_id: String(created.id),
        description: `Criou a pergunta de FAQ #${created.id}: "${question.substring(0, 40)}..."`
      });
    } catch (_) {}

    return res.status(201).json({ success: true, faq: created });
  } catch (error) {
    console.error('[ERRO] Falha ao criar FAQ:', error);
    return res.status(500).json({ error: 'Erro ao cadastrar pergunta de FAQ.' });
  }
});

// 4. Rota Administrativa: Atualizar Pergunta
faqRouter.put('/api/admin/site/faqs/:id', requireAuth, (req, res) => {
  try {
    const id = Number(req.params.id);
    const existing = getFaqById(id);
    if (!existing) {
      return res.status(404).json({ error: 'Pergunta de FAQ não encontrada.' });
    }

    const { faq_order, category, category_label, question, answer, highlight_note, is_active } = req.body;
    const updated = updateFaq(id, {
      faq_order,
      category,
      category_label,
      question,
      answer,
      highlight_note,
      is_active
    });

    try {
      logAudit(req, {
        event_type: 'EDICAO',
        event_name: 'FAQ_UPDATE',
        module: 'faq',
        resource_id: String(id),
        description: `Atualizou a pergunta de FAQ #${id}: "${(question || existing.question).substring(0, 40)}..."`
      });
    } catch (_) {}

    return res.json({ success: true, faq: updated });
  } catch (error) {
    console.error('[ERRO] Falha ao atualizar FAQ:', error);
    return res.status(500).json({ error: 'Erro ao atualizar pergunta de FAQ.' });
  }
});

// 5. Rota Administrativa: Excluir Pergunta
faqRouter.delete('/api/admin/site/faqs/:id', requireAuth, (req, res) => {
  try {
    const id = Number(req.params.id);
    const existing = getFaqById(id);
    if (!existing) {
      return res.status(404).json({ error: 'Pergunta de FAQ não encontrada.' });
    }

    deleteFaq(id);

    try {
      logAudit(req, {
        event_type: 'EXCLUSAO',
        event_name: 'FAQ_DELETE',
        module: 'faq',
        resource_id: String(id),
        description: `Excluiu a pergunta de FAQ #${id}: "${existing.question.substring(0, 40)}..."`
      });
    } catch (_) {}

    return res.json({ success: true, message: 'Pergunta excluída com sucesso.' });
  } catch (error) {
    console.error('[ERRO] Falha ao excluir FAQ:', error);
    return res.status(500).json({ error: 'Erro ao excluir pergunta de FAQ.' });
  }
});
