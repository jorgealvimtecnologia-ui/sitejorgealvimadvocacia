/**
 * ==============================================================================
 * MÓDULO WHATSAPP DEDICADO & EVOLUTION API
 * ==============================================================================
 * Permite ao escritório de advocacia:
 * 1. Gerenciar conexão com chip dedicado via Evolution API (QR Code e status);
 * 2. Envio de notificações automáticas (prazos, andamentos e novos clientes);
 * 3. Webhook receptor de mensagens de clientes com auto-resposta e redirecionamento
 *    para o WhatsApp pessoal do Dr. Jorge Alvim (5532998153429);
 * 4. Histórico e auditoria de mensagens enviadas e recebidas.
 * ==============================================================================
 */

import express from 'express';
import crypto from 'node:crypto';
import { db } from '../../config/db.js';
import { requireAuth } from '../../middleware/auth.js';
import { logAudit } from '../../middleware/audit.js';

export const whatsappRouter = express.Router();

// ------------------------------------------------------------------------------
// 1. INICIALIZAÇÃO DAS TABELAS NO BANCO SQLITE
// ------------------------------------------------------------------------------
db.exec(`
  CREATE TABLE IF NOT EXISTS whatsapp_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS whatsapp_messages_log (
    id TEXT PRIMARY KEY,
    phone TEXT NOT NULL,
    direction TEXT NOT NULL, -- 'outbound' ou 'inbound'
    message TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'sent', -- 'sent', 'received', 'failed'
    created_at TEXT NOT NULL
  );
`);

// Semeador padrão de configurações
const defaultSettings = [
  ['evolution_api_url', process.env.EVOLUTION_API_URL || process.env.WHATSAPP_GATEWAY_URL || 'http://localhost:8082'],
  ['evolution_api_key', process.env.EVOLUTION_API_KEY || process.env.WHATSAPP_API_KEY || 'jorgealvim_evolution_secret_key'],
  ['instance_name', 'jorgealvim_advocacia'],
  ['dedicated_phone', ''], // Preenchido após pareamento do chip
  ['forward_phone', '5532998153429'], // WhatsApp de atendimento do Dr. Jorge
  ['auto_reply_enabled', '1'],
  ['auto_reply_text', 'Olá! Esta é a linha automática de notificações e andamentos do escritório Jorge Alvim Advocacia. Para falar diretamente com o Dr. Jorge Alvim, clique no link oficial de atendimento: https://wa.me/5532998153429']
];

for (const [k, v] of defaultSettings) {
  try {
    db.prepare(`
      INSERT INTO whatsapp_settings (key, value, updated_at)
      VALUES (?, ?, ?)
      ON CONFLICT(key) DO NOTHING
    `).run(k, v, new Date().toISOString());
  } catch (_) {}
}

export function getWhatsAppSetting(key, defaultValue = '') {
  try {
    const row = db.prepare(`SELECT value FROM whatsapp_settings WHERE key = ?`).get(key);
    return row ? row.value : defaultValue;
  } catch (_) {
    return defaultValue;
  }
}

export function setWhatsAppSetting(key, value) {
  try {
    db.prepare(`
      INSERT INTO whatsapp_settings (key, value, updated_at)
      VALUES (?, ?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
    `).run(key, String(value), new Date().toISOString());
  } catch (_) {}
}

// ------------------------------------------------------------------------------
// 2. STATUS DA CONEXÃO & CONFIGURAÇÕES
// ------------------------------------------------------------------------------
whatsappRouter.get('/api/whatsapp/config', requireAuth, async (req, res) => {
  try {
    const apiUrl = getWhatsAppSetting('evolution_api_url');
    const apiKey = getWhatsAppSetting('evolution_api_key');
    const instance = getWhatsAppSetting('instance_name', 'jorgealvim_advocacia');
    const dedicatedPhone = getWhatsAppSetting('dedicated_phone');
    const forwardPhone = getWhatsAppSetting('forward_phone', '5532998153429');
    const autoReplyEnabled = getWhatsAppSetting('auto_reply_enabled', '1') === '1';
    const autoReplyText = getWhatsAppSetting('auto_reply_text');

    let connectionState = 'waiting_activation';
    let isConnected = false;
    let activePhone = dedicatedPhone;

    // Tenta checar o status na Evolution API se o servidor estiver acessível
    if (apiUrl) {
      try {
        const checkRes = await fetch(`${apiUrl}/instance/connectionState/${instance}`, {
          headers: { 'apikey': apiKey },
          signal: AbortSignal.timeout(3000)
        });
        if (checkRes.ok) {
          const data = await checkRes.json();
          connectionState = data.instance?.state || data.state || 'close';
          isConnected = connectionState === 'open';
          const ownerPhone = data.instance?.owner || '';
          if (isConnected && ownerPhone && !activePhone) {
            activePhone = ownerPhone;
            setWhatsAppSetting('dedicated_phone', ownerPhone);
          }
        }
      } catch (_) {
        // Evolution API ainda não iniciada ou chip pendente
        connectionState = 'waiting_activation';
      }
    }

    res.json({
      success: true,
      apiUrl,
      instance,
      dedicatedPhone: activePhone,
      forwardPhone,
      autoReplyEnabled,
      autoReplyText,
      connectionState,
      isConnected
    });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao consultar configuração do WhatsApp: ' + err.message });
  }
});

whatsappRouter.post('/api/whatsapp/config', requireAuth, (req, res) => {
  try {
    const { apiUrl, apiKey, instance, dedicatedPhone, forwardPhone, autoReplyEnabled, autoReplyText, webhookToken } = req.body;

    if (apiUrl !== undefined) setWhatsAppSetting('evolution_api_url', apiUrl.trim());
    if (apiKey !== undefined && apiKey.trim()) setWhatsAppSetting('evolution_api_key', apiKey.trim());
    if (instance !== undefined) setWhatsAppSetting('instance_name', instance.trim());
    if (dedicatedPhone !== undefined) setWhatsAppSetting('dedicated_phone', dedicatedPhone.trim());
    if (forwardPhone !== undefined) setWhatsAppSetting('forward_phone', forwardPhone.trim());
    if (autoReplyEnabled !== undefined) setWhatsAppSetting('auto_reply_enabled', autoReplyEnabled ? '1' : '0');
    if (autoReplyText !== undefined) setWhatsAppSetting('auto_reply_text', autoReplyText.trim());
    // Token de autenticação do webhook (configure o mesmo valor na Evolution API).
    if (webhookToken !== undefined) setWhatsAppSetting('webhook_token', webhookToken.trim());

    logAudit(req, {
      event_type: 'CONFIGURACAO',
      event_name: 'WHATSAPP_CONFIG_UPDATED',
      module: 'WHATSAPP',
      description: 'Configurações do WhatsApp/Evolution API atualizadas.'
    });

    res.json({ success: true, message: 'Configurações salvas com sucesso!' });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao salvar configurações do WhatsApp: ' + err.message });
  }
});

// ------------------------------------------------------------------------------
// 3. CONSULTA DE QR CODE PARA CONEXÃO DO CHIP NO CELULAR
// ------------------------------------------------------------------------------
whatsappRouter.get('/api/whatsapp/qrcode', requireAuth, async (req, res) => {
  try {
    const apiUrl = getWhatsAppSetting('evolution_api_url');
    const apiKey = getWhatsAppSetting('evolution_api_key');
    const instance = getWhatsAppSetting('instance_name', 'jorgealvim_advocacia');

    if (!apiUrl) {
      return res.json({
        success: false,
        status: 'waiting_activation',
        message: 'Aguardando inicialização da Evolution API e ativação do chip dedicado.'
      });
    }

    try {
      // 1. Tenta obter o QR Code da instância existente
      const qrRes = await fetch(`${apiUrl}/instance/connect/${instance}`, {
        headers: { 'apikey': apiKey },
        signal: AbortSignal.timeout(7000)
      });

      if (qrRes.ok) {
        const qrData = await qrRes.json();
        if (qrData.instance?.state === 'open') {
          const ownerPhone = qrData.instance?.owner || '';
          if (ownerPhone) setWhatsAppSetting('dedicated_phone', ownerPhone);
          return res.json({
            success: true,
            status: 'already_connected',
            connectedPhone: ownerPhone,
            message: 'Chip dedicado conectado e operacional!'
          });
        }
        const base64 = qrData.base64 || (qrData.qrcode && qrData.qrcode.base64) || null;
        if (base64) {
          return res.json({
            success: true,
            status: 'qrcode_ready',
            qrcode: base64,
            pairingCode: qrData.pairingCode || null,
            message: 'Aponte a câmera do seu WhatsApp para o QR Code.'
          });
        }
      }

      // 2. Se a instância ainda não existir, cria a instância na Evolution API
      const createRes = await fetch(`${apiUrl}/instance/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'apikey': apiKey },
        body: JSON.stringify({
          instanceName: instance,
          token: apiKey,
          qrcode: true,
          integration: 'WHATSAPP-BAILEYS'
        }),
        signal: AbortSignal.timeout(8000)
      });

      if (createRes.ok) {
        const createData = await createRes.json();
        const base64 = createData.qrcode?.base64 || createData.base64 || null;
        if (base64) {
          return res.json({
            success: true,
            status: 'qrcode_ready',
            qrcode: base64,
            message: 'Instância criada com sucesso! Aponte o WhatsApp Business para o QR Code.'
          });
        }
      }

      return res.json({
        success: false,
        status: 'waiting_activation',
        message: 'Aguardando inicialização da Evolution API no servidor.'
      });
    } catch (fetchErr) {
      return res.json({
        success: false,
        status: 'waiting_activation',
        message: 'A Evolution API está pronta no código e aguarda a ativação do chip dedicado pelo Dr. Jorge.'
      });
    }
  } catch (err) {
    res.status(500).json({ error: 'Erro ao gerar QR Code: ' + err.message });
  }
});

// ------------------------------------------------------------------------------
// 4. TESTE DE DISPARO DE MENSAGEM
// ------------------------------------------------------------------------------
whatsappRouter.post('/api/whatsapp/test', requireAuth, async (req, res) => {
  try {
    const { phone, message } = req.body;
    const destPhone = (phone || getWhatsAppSetting('forward_phone', '5532998153429')).replace(/\D/g, '');
    const cleanPhone = destPhone.startsWith('55') ? destPhone : `55${destPhone}`;
    const testMsg = message || `🧪 *TESTE DE SISTEMA - JORGE ALVIM ADVOCACIA*\n\n✅ O motor de envio do WhatsApp está operacional!`;

    const apiUrl = getWhatsAppSetting('evolution_api_url');
    const apiKey = getWhatsAppSetting('evolution_api_key');
    const instance = getWhatsAppSetting('instance_name', 'jorgealvim_advocacia');

    let sent = false;
    let details = '';

    if (apiUrl) {
      try {
        const sendRes = await fetch(`${apiUrl}/message/sendText/${instance}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'apikey': apiKey },
          body: JSON.stringify({ number: cleanPhone, text: testMsg }),
          signal: AbortSignal.timeout(10000)
        });
        if (sendRes.ok) {
          sent = true;
          details = 'Enviado com sucesso via Evolution API!';
        } else {
          details = `Falha na Evolution API (HTTP ${sendRes.status})`;
        }
      } catch (err) {
        details = 'Evolution API offline ou chip ainda não conectado.';
      }
    }

    // Registra no histórico
    const msgId = `WA-TEST-${Date.now()}`;
    db.prepare(`
      INSERT INTO whatsapp_messages_log (id, phone, direction, message, status, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(msgId, cleanPhone, 'outbound', testMsg, sent ? 'sent' : 'simulated', new Date().toISOString());

    res.json({
      success: true,
      sent,
      phone: cleanPhone,
      details,
      fallbackLink: `https://wa.me/${cleanPhone}?text=${encodeURIComponent(testMsg)}`
    });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao realizar teste de WhatsApp: ' + err.message });
  }
});

// ------------------------------------------------------------------------------
// 5. WEBHOOK RECEPTOR DE MENSAGENS DE CLIENTES (AUTO-RESPOSTA & AUDITORIA)
// ------------------------------------------------------------------------------
whatsappRouter.post('/api/whatsapp/webhook', async (req, res) => {
  try {
    // Autenticidade do webhook: sem conferir, um POST forjado dispara auto-resposta para
    // números arbitrários (abuso do número do escritório e gasto de API). Valida um token
    // configurável; se ainda não configurado, só avisa (não quebra a integração atual).
    const expectedToken = getWhatsAppSetting('webhook_token', '');
    if (expectedToken) {
      const received = (req.headers['x-webhook-token'] || req.headers['apikey'] || '').toString().trim();
      if (received !== expectedToken) {
        return res.status(401).json({ error: 'Webhook não autorizado.' });
      }
    } else {
      console.warn('[WHATSAPP WEBHOOK] ⚠️ webhook_token não configurado — operando SEM autenticação. Configure em Ajustes do WhatsApp e na Evolution API.');
    }

    const body = req.body || {};
    res.status(200).json({ received: true });

    // Processamento assíncrono pós-resposta
    const event = body.event || body.type;
    const data = body.data || body;

    if (event === 'messages.upsert' || event === 'message') {
      const msgInfo = data.message || data;
      const key = data.key || msgInfo.key || {};
      const fromMe = key.fromMe || false;

      // Só processa mensagens recebidas de clientes (inbound)
      if (!fromMe) {
        const sender = (key.remoteJid || '').replace('@s.whatsapp.net', '').replace(/\D/g, '');
        const text = msgInfo.conversation || msgInfo.extendedTextMessage?.text || msgInfo.body || '';

        if (sender && text) {
          const logId = `WA-IN-${Date.now()}-${crypto.randomBytes(2).toString('hex')}`;
          db.prepare(`
            INSERT INTO whatsapp_messages_log (id, phone, direction, message, status, created_at)
            VALUES (?, ?, ?, ?, ?, ?)
          `).run(logId, sender, 'inbound', text, 'received', new Date().toISOString());

          console.log(`[📲 WHATSAPP RECEBIDO] De: ${sender} | Mensagem: "${text.slice(0, 80)}"`);

          // Se auto-resposta estiver ativa, envia o direcionamento ao cliente
          const autoReplyEnabled = getWhatsAppSetting('auto_reply_enabled', '1') === '1';
          const autoReplyText = getWhatsAppSetting('auto_reply_text');
          const apiUrl = getWhatsAppSetting('evolution_api_url');
          const apiKey = getWhatsAppSetting('evolution_api_key');
          const instance = getWhatsAppSetting('instance_name', 'jorgealvim_advocacia');

          if (autoReplyEnabled && autoReplyText && apiUrl) {
            try {
              await fetch(`${apiUrl}/message/sendText/${instance}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'apikey': apiKey },
                body: JSON.stringify({ number: sender, text: autoReplyText }),
                signal: AbortSignal.timeout(5000)
              });
            } catch (_) {}
          }
        }
      }
    }
  } catch (err) {
    console.warn('[WHATSAPP WEBHOOK] Erro ao processar:', err.message);
  }
});

// ------------------------------------------------------------------------------
// 6. HISTÓRICO DE MENSAGENS PARA O PAINEL
// ------------------------------------------------------------------------------
whatsappRouter.get('/api/whatsapp/messages', requireAuth, (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit || 50, 10), 100);
    const rows = db.prepare(`
      SELECT * FROM whatsapp_messages_log
      ORDER BY created_at DESC
      LIMIT ?
    `).all(limit);

    res.json({ success: true, messages: rows });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao buscar mensagens do WhatsApp: ' + err.message });
  }
});
