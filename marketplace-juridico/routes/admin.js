'use strict';

/**
 * Painel do Admin: moderação de PDFs e visão macro do marketplace.
 */

const express = require('express');
const router = express.Router();

const { db } = require('../db');
const { requireRole } = require('../middleware/auth');
const dashboards = require('./dashboard');

router.use(requireRole('admin'));

// Fila de moderação
router.get('/moderacao', (req, res) => {
  const pending = db.prepare(`
    SELECT p.*, u.name AS author_name, u.email AS author_email
    FROM products p JOIN users u ON u.id = p.author_id
    WHERE p.status = 'pending'
    ORDER BY p.created_at ASC
  `).all();
  res.render('admin/moderation', { pending });
});

// Aprovar
router.post('/moderacao/:id/aprovar', (req, res) => {
  db.prepare(`
    UPDATE products
    SET status='approved', published=1, moderated_by=?, moderated_at=datetime('now'),
        rejection_reason=NULL, updated_at=datetime('now')
    WHERE id=? AND status='pending'
  `).run(req.session.user.id, req.params.id);
  res.redirect('/painel/admin/moderacao');
});

// Rejeitar (com motivo)
router.post('/moderacao/:id/rejeitar', (req, res) => {
  db.prepare(`
    UPDATE products
    SET status='rejected', published=0, moderated_by=?, moderated_at=datetime('now'),
        rejection_reason=?, updated_at=datetime('now')
    WHERE id=? AND status='pending'
  `).run(req.session.user.id, req.body.reason || 'Sem motivo informado', req.params.id);
  res.redirect('/painel/admin/moderacao');
});

// Dashboard financeiro da plataforma
router.get('/financeiro', (req, res) => {
  res.render('admin/dashboard', { data: dashboards.platformSummary() });
});

module.exports = router;
