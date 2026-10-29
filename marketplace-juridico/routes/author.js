'use strict';

/**
 * Painel do Autor: upload seguro de PDFs, listagem e status de moderação.
 *
 * Segurança do upload:
 *  - multer grava em pasta PRIVADA (fora do public do Express).
 *  - valida MIME e extensão (.pdf) e checa a assinatura mágica "%PDF".
 *  - nome de arquivo aleatório (não confia no nome do cliente).
 *  - calcula sha256 para integridade.
 */

const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const router = express.Router();

const { db } = require('../db');
const cfg = require('../config');
const { requireRole } = require('../middleware/auth');
const dashboards = require('./dashboard');

fs.mkdirSync(cfg.storage.privateDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, cfg.storage.privateDir),
  filename: (req, file, cb) => {
    const rand = crypto.randomBytes(16).toString('hex');
    cb(null, `${Date.now()}_${rand}.pdf`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: cfg.storage.maxPdfBytes, files: 1 },
  fileFilter: (req, file, cb) => {
    const okMime = file.mimetype === 'application/pdf';
    const okExt = path.extname(file.originalname).toLowerCase() === '.pdf';
    if (!okMime || !okExt) return cb(new Error('Apenas arquivos PDF são aceitos.'));
    cb(null, true);
  },
});

function slugify(s) {
  return s.toString().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
    .slice(0, 80) + '-' + crypto.randomBytes(3).toString('hex');
}

function isPdfSignature(filePath) {
  const fd = fs.openSync(filePath, 'r');
  const buf = Buffer.alloc(5);
  fs.readSync(fd, buf, 0, 5, 0);
  fs.closeSync(fd);
  return buf.toString('latin1').startsWith('%PDF-');
}

// Tela do painel
router.get('/', requireRole('author', 'admin'), (req, res) => {
  const products = db.prepare(
    `SELECT * FROM products WHERE author_id = ? ORDER BY created_at DESC`
  ).all(req.session.user.id);

  const mpConnected = !!db.prepare('SELECT mp_access_token FROM users WHERE id = ?')
    .get(req.session.user.id).mp_access_token;

  const finance = dashboards.authorSummary(req.session.user.id);
  res.render('author/dashboard', { products, mpConnected, finance, query: req.query });
});

// Formulário de envio
router.get('/novo', requireRole('author', 'admin'), (req, res) => {
  res.render('author/upload', { error: null });
});

// Recebe o upload
router.post('/novo', requireRole('author', 'admin'), (req, res) => {
  upload.single('pdf')(req, res, (err) => {
    if (err) return res.status(400).render('author/upload', { error: err.message });
    try {
      const { title, abstract, area, price } = req.body;
      if (!req.file) throw new Error('Envie o arquivo PDF.');
      if (!isPdfSignature(req.file.path)) {
        fs.unlinkSync(req.file.path);
        throw new Error('Arquivo não é um PDF válido.');
      }
      const priceCents = Math.round(Number(String(price).replace(',', '.')) * 100);
      if (!title || !abstract || !(priceCents >= 0)) {
        fs.unlinkSync(req.file.path);
        throw new Error('Preencha título, resumo e preço.');
      }

      const sha256 = crypto.createHash('sha256')
        .update(fs.readFileSync(req.file.path)).digest('hex');

      db.prepare(`
        INSERT INTO products
          (author_id, title, slug, abstract, area, price_cents,
           file_path, file_original_name, file_size_bytes, file_sha256, status)
        VALUES (@author_id, @title, @slug, @abstract, @area, @price_cents,
           @file_path, @orig, @size, @sha, 'pending')
      `).run({
        author_id: req.session.user.id,
        title, slug: slugify(title), abstract, area: area || null,
        price_cents: priceCents,
        file_path: req.file.path,
        orig: req.file.originalname,
        size: req.file.size,
        sha: sha256,
      });

      res.redirect('/painel/autor?enviado=1');
    } catch (e) {
      res.status(400).render('author/upload', { error: e.message });
    }
  });
});

module.exports = router;
