'use strict';

/**
 * Ponto de entrada do módulo Marketplace.
 *
 * Integração ao site existente (Node.js/Express):
 *  - Se você já tem um app Express, pode montar este como sub-app:
 *        const marketplace = require('./marketplace-juridico/app');
 *        app.use('/', marketplace);     // ou app.use('/loja', marketplace)
 *  - Ou rodá-lo standalone (npm start).
 *
 * ORDEM IMPORTA: o webhook precisa do corpo BRUTO, por isso é montado ANTES do
 * express.json() global.
 */

const path = require('path');
const express = require('express');
const session = require('express-session');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const cfg = require('./config');
const { migrate } = require('./db');

migrate(); // aplica o schema (idempotente)

const app = express();
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.set('trust proxy', 1); // atrás do Nginx na Contabo (req.ip correto, cookies secure)

app.use(helmet({ contentSecurityPolicy: false })); // ajuste a CSP p/ o SDK do MP
app.use(express.static(path.join(__dirname, 'public'))); // só assets públicos

// 1) WEBHOOK primeiro (corpo bruto)
app.use('/webhooks', require('./routes/webhooks'));

// 2) Parsers globais depois
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 3) Sessão
app.use(session({
  secret: cfg.session.secret,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    secure: cfg.env === 'production',
    maxAge: 1000 * 60 * 60 * 8,
  },
}));

// Rate-limit no download e no checkout (anti-abuso)
app.use('/download', rateLimit({ windowMs: 60 * 1000, max: 20 }));
app.use('/checkout', rateLimit({ windowMs: 60 * 1000, max: 15 }));

// 4) Rotas
app.use('/oauth', require('./routes/oauth'));
app.use('/painel/autor', require('./routes/author'));
app.use('/painel/admin', require('./routes/admin'));
app.use('/checkout', require('./routes/checkout'));
app.use('/download', require('./routes/download'));

// Páginas mínimas de exemplo (login/erro) — integre ao seu layout existente.
app.get('/login', (req, res) => res.render('login', { error: null }));

app.use((req, res) => res.status(404).render('error', { message: 'Página não encontrada.' }));

if (require.main === module) {
  app.listen(cfg.port, () => console.log(`Marketplace rodando na porta ${cfg.port}`));
}

module.exports = app;
