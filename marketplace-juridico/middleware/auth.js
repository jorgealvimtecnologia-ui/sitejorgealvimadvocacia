'use strict';

/**
 * Middlewares de autenticação/autorização baseados em sessão.
 * Assume express-session já configurado em app.js, com req.session.user = { id, role }.
 */

const { db } = require('../db');

function requireAuth(req, res, next) {
  if (!req.session || !req.session.user) {
    return res.redirect('/login');
  }
  next();
}

function requireRole(...roles) {
  return (req, res, next) => {
    const u = req.session && req.session.user;
    if (!u) return res.redirect('/login');
    if (!roles.includes(u.role)) {
      return res.status(403).render('error', { message: 'Acesso negado.' });
    }
    next();
  };
}

/** Garante que o autor só mexe nos próprios produtos. */
function ownsProduct(req, res, next) {
  const u = req.session.user;
  if (u.role === 'admin') return next();
  const prod = db.prepare('SELECT author_id FROM products WHERE id = ?').get(req.params.id);
  if (!prod || prod.author_id !== u.id) {
    return res.status(403).render('error', { message: 'Produto não pertence a você.' });
  }
  next();
}

module.exports = { requireAuth, requireRole, ownsProduct };
