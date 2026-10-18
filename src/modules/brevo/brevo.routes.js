/**
 * ==============================================================================
 * MÓDULO BREVO (E-MAIL MARKETING, NEWSLETTERS & TRANSACIONAL)
 * ==============================================================================
 * Permite ao escritório de advocacia:
 * 1. Gerenciar conexão com a API do Brevo (chave de API, remetente, reply-to);
 * 2. Envio de e-mails transacionais e testes de entrega;
 * 3. Fatiamento inteligente da base de contatos em lotes de até 300/dia
 *    (respeitando a cota 100% gratuita do Brevo sem estourar limites);
 * 4. Exportação direta de CSV nos padrões aceitos pelo Brevo;
 * 5. Sincronização direta de contatos via API v3;
 * 6. Webhook receptor de eventos (aberturas, cliques, descadastros, bounces).
 * ==============================================================================
 */

import express from 'express';
import crypto from 'node:crypto';
import { db } from '../../config/db.js';
import { requireAuth } from '../../middleware/auth.js';
import { logAudit } from '../../middleware/audit.js';

export const brevoRouter = express.Router();

// ------------------------------------------------------------------------------
// 1. INICIALIZAÇÃO DAS TABELAS NO BANCO SQLITE
// ------------------------------------------------------------------------------
db.exec(`
  CREATE TABLE IF NOT EXISTS brevo_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS brevo_logs (
    id TEXT PRIMARY KEY,
    event_type TEXT NOT NULL, -- 'send_test', 'sync', 'delivered', 'opened', 'clicked', 'unsubscribed', 'bounce'
    recipient TEXT,
    subject TEXT,
    status TEXT NOT NULL DEFAULT 'success',
    details TEXT,
    created_at TEXT NOT NULL
  );
`);

// Semeador padrão de configurações
const defaultSettings = [
  ['brevo_api_key', process.env.BREVO_API_KEY || ''],
  ['sender_name', 'Dr. Jorge Alvim - Advocacia'],
  ['sender_email', 'contato@jorgealvimadvocacia.com.br'],
  ['reply_to_email', 'jorgealvimadv@gmail.com'],
  ['reply_to_name', 'Dr. Jorge Alvim'],
  ['daily_batch_limit', '300'],
  ['auto_sync_active', '0']
];

for (const [k, v] of defaultSettings) {
  try {
    db.prepare(`
      INSERT INTO brevo_settings (key, value, updated_at)
      VALUES (?, ?, ?)
      ON CONFLICT(key) DO NOTHING
    `).run(k, v, new Date().toISOString());
  } catch (_) {}
}

function getSetting(key) {
  try {
    const row = db.prepare(`SELECT value FROM brevo_settings WHERE key = ?`).get(key);
    return row ? row.value : null;
  } catch (_) {
    return null;
  }
}

function setSetting(key, value) {
  db.prepare(`
    INSERT INTO brevo_settings (key, value, updated_at)
    VALUES (?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
  `).run(key, String(value), new Date().toISOString());
}

/**
 * Consulta contatos válidos com e-mail para campanhas
 */
function getValidContacts() {
  const contacts = [];
  const seenEmails = new Set();

  try {
    // 1. Clientes cadastrados
    const clientRows = db.prepare(`
      SELECT id, full_name, email, phone, city, state, 'cliente' as tipo
      FROM clients
      WHERE email IS NOT NULL AND trim(email) != '' AND email LIKE '%@%' AND deleted_at IS NULL
      ORDER BY id ASC
    `).all();

    for (const row of clientRows) {
      const emailClean = row.email.trim().toLowerCase();
      if (!seenEmails.has(emailClean)) {
        seenEmails.add(emailClean);
        contacts.push({
          id: `cli_${row.id}`,
          nome: row.full_name ? row.full_name.trim() : 'Cliente',
          email: emailClean,
          telefone: row.phone || '',
          cidade: row.city || '',
          estado: row.state || '',
          tipo: 'Cliente'
        });
      }
    }
  } catch (e) {
    console.warn('[BREVO] Falha ao ler clients:', e.message);
  }

  try {
    // 2. Leads / Pré-clientes
    const leadRows = db.prepare(`
      SELECT id, name, email, phone, city, 'lead' as tipo
      FROM leads
      WHERE email IS NOT NULL AND trim(email) != '' AND email LIKE '%@%'
      ORDER BY id ASC
    `).all();

    for (const row of leadRows) {
      const emailClean = row.email.trim().toLowerCase();
      if (!seenEmails.has(emailClean)) {
        seenEmails.add(emailClean);
        contacts.push({
          id: `lead_${row.id}`,
          nome: row.name ? row.name.trim() : 'Contato',
          email: emailClean,
          telefone: row.phone || '',
          cidade: row.city || '',
          estado: '',
          tipo: 'Lead / Interessado'
        });
      }
    }
  } catch (e) {
    console.warn('[BREVO] Falha ao ler leads:', e.message);
  }

  return contacts;
}

// ------------------------------------------------------------------------------
// 2. ROTAS ADMINISTRATIVAS DO BREVO
// ------------------------------------------------------------------------------

/**
 * GET /api/brevo/config
 * Retorna status da conexão, dados da conta Brevo e métricas de contatos
 */
brevoRouter.get('/api/brevo/config', requireAuth, async (req, res) => {
  try {
    const apiKey = getSetting('brevo_api_key') || process.env.BREVO_API_KEY || '';
    const senderName = getSetting('sender_name') || 'Dr. Jorge Alvim - Advocacia';
    const senderEmail = getSetting('sender_email') || 'contato@jorgealvimadvocacia.com.br';
    const replyToEmail = getSetting('reply_to_email') || 'jorgealvimadv@gmail.com';
    const replyToName = getSetting('reply_to_name') || 'Dr. Jorge Alvim';
    const dailyBatchLimit = parseInt(getSetting('daily_batch_limit') || '300', 10);

    const contacts = getValidContacts();
    const totalContacts = contacts.length;
    const totalBatches = Math.ceil(totalContacts / dailyBatchLimit) || 1;

    if (!apiKey) {
      return res.json({
        configured: false,
        status: 'waiting_config',
        message: 'Aguardando configuração da Chave de API Brevo (xkeysib-...).',
        settings: {
          sender_name: senderName,
          sender_email: senderEmail,
          reply_to_email: replyToEmail,
          reply_to_name: replyToName,
          daily_batch_limit: dailyBatchLimit
        },
        stats: {
          total_contacts: totalContacts,
          daily_batch_limit: dailyBatchLimit,
          total_batches: totalBatches
        }
      });
    }

    // Valida a chave na API do Brevo (GET /v3/account)
    let accountData = null;
    let isConnected = false;
    let errorMessage = null;

    try {
      const response = await fetch('https://api.brevo.com/v3/account', {
        headers: {
          'accept': 'application/json',
          'api-key': apiKey
        }
      });

      if (response.ok) {
        accountData = await response.json();
        isConnected = true;
      } else {
        const errJson = await response.json().catch(() => ({}));
        errorMessage = errJson.message || `Erro HTTP ${response.status} ao conectar no Brevo`;
      }
    } catch (netErr) {
      errorMessage = `Falha de rede ao consultar Brevo: ${netErr.message}`;
    }

    return res.json({
      configured: true,
      status: isConnected ? 'connected' : 'error',
      message: isConnected ? 'Conectado à API do Brevo com sucesso.' : errorMessage,
      account: accountData ? {
        email: accountData.email,
        companyName: accountData.companyName,
        plan: accountData.plan && accountData.plan.length ? accountData.plan[0].type : 'free',
        credits: accountData.plan && accountData.plan.length ? accountData.plan[0].credits : null
      } : null,
      settings: {
        sender_name: senderName,
        sender_email: senderEmail,
        reply_to_email: replyToEmail,
        reply_to_name: replyToName,
        daily_batch_limit: dailyBatchLimit
      },
      stats: {
        total_contacts: totalContacts,
        daily_batch_limit: dailyBatchLimit,
        total_batches: totalBatches
      }
    });
  } catch (err) {
    console.error('[BREVO] Erro ao obter config:', err);
    res.status(500).json({ error: 'Erro interno ao consultar configuração do Brevo.' });
  }
});

/**
 * POST /api/brevo/config
 * Atualiza credenciais e parâmetros
 */
brevoRouter.post('/api/brevo/config', requireAuth, (req, res) => {
  try {
    const {
      brevo_api_key,
      sender_name,
      sender_email,
      reply_to_email,
      reply_to_name,
      daily_batch_limit
    } = req.body || {};

    if (brevo_api_key !== undefined) setSetting('brevo_api_key', brevo_api_key.trim());
    if (sender_name !== undefined) setSetting('sender_name', sender_name.trim());
    if (sender_email !== undefined) setSetting('sender_email', sender_email.trim());
    if (reply_to_email !== undefined) setSetting('reply_to_email', reply_to_email.trim());
    if (reply_to_name !== undefined) setSetting('reply_to_name', reply_to_name.trim());
    if (daily_batch_limit !== undefined) {
      const limit = Math.max(10, Math.min(1000, parseInt(daily_batch_limit, 10) || 300));
      setSetting('daily_batch_limit', limit);
    }

    logAudit(req, 'UPDATE_BREVO_CONFIG', {
      user: req.session?.user?.username || 'admin',
      sender_email,
      reply_to_email
    });

    return res.json({ success: true, message: 'Configurações do Brevo salvas com sucesso.' });
  } catch (err) {
    console.error('[BREVO] Erro ao salvar config:', err);
    res.status(500).json({ error: 'Erro interno ao salvar configurações do Brevo.' });
  }
});

/**
 * GET /api/brevo/batches
 * Retorna os lotes de contatos estruturados por dias da semana para envio diário
 */
brevoRouter.get('/api/brevo/batches', requireAuth, (req, res) => {
  try {
    const dailyLimit = parseInt(getSetting('daily_batch_limit') || '300', 10);
    const contacts = getValidContacts();
    const total = contacts.length;

    const days = ['Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado', 'Domingo'];
    const batches = [];

    let currentBatch = 1;
    for (let i = 0; i < total; i += dailyLimit) {
      const slice = contacts.slice(i, i + dailyLimit);
      const dayName = days[(currentBatch - 1) % days.length];
      batches.push({
        batchId: currentBatch,
        name: `Lote ${currentBatch} (${dayName})`,
        count: slice.length,
        startIndex: i + 1,
        endIndex: i + slice.length,
        downloadUrl: `/api/brevo/export-batch/${currentBatch}`
      });
      currentBatch++;
    }

    return res.json({
      totalContacts: total,
      dailyBatchLimit: dailyLimit,
      totalBatches: batches.length,
      batches
    });
  } catch (err) {
    console.error('[BREVO] Erro ao listar lotes:', err);
    res.status(500).json({ error: 'Erro ao calcular lotes de contatos.' });
  }
});

/**
 * GET /api/brevo/export-batch/:batchId
 * Baixa o CSV padronizado do lote selecionado, compatível com importação direta no Brevo
 */
brevoRouter.get('/api/brevo/export-batch/:batchId', requireAuth, (req, res) => {
  try {
    const batchId = parseInt(req.params.batchId, 10);
    if (!batchId || batchId < 1) {
      return res.status(400).send('Lote inválido.');
    }

    const dailyLimit = parseInt(getSetting('daily_batch_limit') || '300', 10);
    const contacts = getValidContacts();
    const startIndex = (batchId - 1) * dailyLimit;
    const batchContacts = contacts.slice(startIndex, startIndex + dailyLimit);

    if (batchContacts.length === 0) {
      return res.status(404).send('Nenhum contato encontrado para este lote.');
    }

    // Formato CSV padronizado para Brevo: EMAIL,FIRSTNAME,LASTNAME,SMS,TAGS
    const header = 'EMAIL,FIRSTNAME,LASTNAME,SMS,TAGS\n';
    const rows = batchContacts.map(c => {
      const nameParts = (c.nome || '').trim().split(/\s+/);
      const firstName = nameParts[0] || 'Cliente';
      const lastName = nameParts.slice(1).join(' ') || '';
      
      // Sanitização de telefone para DDI+DDD+Numero (ex: +5532999999999)
      let phoneClean = (c.telefone || '').replace(/\D/g, '');
      if (phoneClean.length === 10 || phoneClean.length === 11) {
        phoneClean = '+55' + phoneClean;
      } else if (phoneClean.startsWith('55') && (phoneClean.length === 12 || phoneClean.length === 13)) {
        phoneClean = '+' + phoneClean;
      }

      // Escapa aspas para CSV
      const esc = (txt) => `"${String(txt || '').replace(/"/g, '""')}"`;

      return `${esc(c.email)},${esc(firstName)},${esc(lastName)},${esc(phoneClean)},${esc(c.tipo)}`;
    });

    const csvContent = '\uFEFF' + header + rows.join('\n'); // Com BOM para abrir perfeitamente no Excel

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="Brevo_Lote_${batchId}_${batchContacts.length}_contatos.csv"`);
    return res.send(csvContent);
  } catch (err) {
    console.error('[BREVO] Erro ao exportar lote CSV:', err);
    res.status(500).send('Erro ao exportar lote.');
  }
});

/**
 * POST /api/brevo/test
 * Dispara e-mail de teste via Brevo REST API v3 (/v3/smtp/email)
 */
brevoRouter.post('/api/brevo/test', requireAuth, async (req, res) => {
  try {
    const apiKey = getSetting('brevo_api_key') || process.env.BREVO_API_KEY || '';
    if (!apiKey) {
      return res.status(400).json({ error: 'Chave de API do Brevo não configurada.' });
    }

    const { target_email } = req.body || {};
    const recipientEmail = (target_email || getSetting('reply_to_email') || 'jorgealvimadv@gmail.com').trim();
    const senderName = getSetting('sender_name') || 'Dr. Jorge Alvim - Advocacia';
    const senderEmail = getSetting('sender_email') || 'contato@jorgealvimadvocacia.com.br';
    const replyToEmail = getSetting('reply_to_email') || 'jorgealvimadv@gmail.com';
    const replyToName = getSetting('reply_to_name') || 'Dr. Jorge Alvim';

    const payload = {
      sender: { name: senderName, email: senderEmail },
      to: [{ email: recipientEmail, name: 'Dr. Jorge Alvim' }],
      replyTo: { email: replyToEmail, name: replyToName },
      subject: '🧪 Teste de Integração - Jorge Alvim Advocacia & Brevo',
      htmlContent: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 12px; background-color: #ffffff;">
          <h2 style="color: #0f172a; margin-top: 0;">✅ Integração com o Brevo Funcionando!</h2>
          <p style="color: #475569; font-size: 15px; line-height: 1.6;">
            Olá, Dr. Jorge Alvim! Este é um e-mail de teste automático enviado diretamente pelo servidor do seu escritório através da <strong>API do Brevo</strong>.
          </p>
          <div style="background-color: #f8fafc; border-left: 4px solid #10b981; padding: 12px 16px; margin: 20px 0; border-radius: 4px;">
            <p style="margin: 0; font-size: 14px; color: #334155;">
              <strong>Remetente:</strong> ${senderName} (${senderEmail})<br/>
              <strong>E-mail de Resposta (Reply-To):</strong> ${replyToEmail}<br/>
              <strong>Data/Hora do Disparo:</strong> ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}
            </p>
          </div>
          <p style="color: #475569; font-size: 14px; line-height: 1.5;">
            Se você clicar em <strong>"Responder"</strong> neste e-mail, verá que a resposta será encaminhada diretamente para a sua caixa de entrada pessoal (<em>${replyToEmail}</em>).
          </p>
          <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 24px 0;" />
          <p style="font-size: 12px; color: #94a3b8; text-align: center; margin: 0;">
            Jorge Alvim Advocacia • Sistema de Gestão & Mensageria Integrada
          </p>
        </div>
      `,
      textContent: `Teste de integração com Brevo realizado com sucesso em ${new Date().toISOString()}. Remetente: ${senderName} (${senderEmail}). Respostas vão para: ${replyToEmail}.`
    };

    const response = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'accept': 'application/json',
        'content-type': 'application/json',
        'api-key': apiKey
      },
      body: JSON.stringify(payload)
    });

    const responseData = await response.json().catch(() => ({}));

    if (!response.ok) {
      const errMsg = responseData.message || `Erro HTTP ${response.status}`;
      db.prepare(`
        INSERT INTO brevo_logs (id, event_type, recipient, subject, status, details, created_at)
        VALUES (?, 'send_test', ?, ?, 'failed', ?, ?)
      `).run(crypto.randomUUID(), recipientEmail, payload.subject, errMsg, new Date().toISOString());

      return res.status(response.status).json({
        success: false,
        error: `Falha ao disparar pelo Brevo: ${errMsg}`
      });
    }

    db.prepare(`
      INSERT INTO brevo_logs (id, event_type, recipient, subject, status, details, created_at)
      VALUES (?, 'send_test', ?, ?, 'success', ?, ?)
    `).run(crypto.randomUUID(), recipientEmail, payload.subject, JSON.stringify(responseData), new Date().toISOString());

    return res.json({
      success: true,
      messageId: responseData.messageId,
      message: `E-mail de teste enviado com sucesso para ${recipientEmail}!`
    });
  } catch (err) {
    console.error('[BREVO] Erro ao enviar teste:', err);
    res.status(500).json({ error: `Erro interno ao enviar e-mail: ${err.message}` });
  }
});

/**
 * POST /api/brevo/webhook
 * Webhook público para receber eventos de entrega, leitura e cliques do Brevo
 */
brevoRouter.post('/api/brevo/webhook', (req, res) => {
  try {
    const event = req.body || {};
    const eventType = event.event || 'unknown';
    const email = event.email || '';
    const subject = event.subject || '';

    db.prepare(`
      INSERT INTO brevo_logs (id, event_type, recipient, subject, status, details, created_at)
      VALUES (?, ?, ?, ?, 'received', ?, ?)
    `).run(crypto.randomUUID(), eventType, email, subject, JSON.stringify(event), new Date().toISOString());

    return res.status(200).json({ received: true });
  } catch (err) {
    console.error('[BREVO] Erro no webhook:', err);
    return res.status(200).json({ received: true }); // Sempre 200 para o Brevo não re-tentar indefinidamente
  }
});

/**
 * GET /api/brevo/logs
 * Retorna os últimos 50 eventos registrados
 */
brevoRouter.get('/api/brevo/logs', requireAuth, (req, res) => {
  try {
    const logs = db.prepare(`
      SELECT id, event_type, recipient, subject, status, details, created_at
      FROM brevo_logs
      ORDER BY created_at DESC
      LIMIT 50
    `).all();

    return res.json({ logs });
  } catch (err) {
    console.error('[BREVO] Erro ao listar logs:', err);
    res.status(500).json({ error: 'Erro ao consultar logs do Brevo.' });
  }
});
