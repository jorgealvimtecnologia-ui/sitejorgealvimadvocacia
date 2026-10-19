#!/usr/bin/env node
/**
 * ==============================================================================
 * GATEWAY WHATSAPP DEDICADO (COMPATÍVEL COM EVOLUTION API) — BAILEYS
 * ==============================================================================
 * Roda em 127.0.0.1:8082 e expõe os endpoints esperados por
 * src/modules/whatsapp/whatsapp.routes.js e src/shared/notify.js:
 *   - GET  /instance/connectionState/:instance
 *   - GET  /instance/connect/:instance
 *   - POST /instance/create
 *   - POST /message/sendText/:instance
 *   - DELETE /instance/logout/:instance
 *
 * Também encaminha mensagens recebidas (inbound) para:
 *   POST http://127.0.0.1:3000/api/whatsapp/webhook
 * ==============================================================================
 */

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import makeWASocket, {
  DisconnectReason,
  fetchLatestBaileysVersion,
  useMultiFileAuthState
} from '@whiskeysockets/baileys';
import QRCode from 'qrcode';
import pino from 'pino';

const PORT = Number(process.env.EVOLUTION_PORT || 8082);
const HOST = process.env.EVOLUTION_HOST || '127.0.0.1';
const API_KEY = process.env.EVOLUTION_API_KEY || 'jorgealvim_evolution_secret_key';
const AUTH_DIR = process.env.WA_AUTH_DIR || '/var/lib/advocacia-whatsapp/auth_info_baileys';
const WEBHOOK_URL = process.env.WA_WEBHOOK_URL || 'http://127.0.0.1:3000/api/whatsapp/webhook';

const logger = pino({ level: process.env.LOG_LEVEL || 'warn' });

let sock = null;
let connectionState = 'close'; // 'open' | 'connecting' | 'close'
let latestQrBase64 = null;
let connectedPhone = '';
let startingPromise = null;
let qrWaiters = [];

function resolveQrWaiters(qr) {
  const list = qrWaiters;
  qrWaiters = [];
  for (const fn of list) {
    try { fn(qr); } catch (_) {}
  }
}

function waitForQr(timeoutMs = 4500) {
  if (latestQrBase64) return Promise.resolve(latestQrBase64);
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      qrWaiters = qrWaiters.filter((fn) => fn !== onQr);
      resolve(latestQrBase64);
    }, timeoutMs);
    function onQr(qr) {
      clearTimeout(timer);
      resolve(qr);
    }
    qrWaiters.push(onQr);
  });
}

function clearAuthDir() {
  try {
    fs.rmSync(AUTH_DIR, { recursive: true, force: true });
    fs.mkdirSync(AUTH_DIR, { recursive: true });
  } catch (err) {
    console.error('[WA-GATEWAY] Erro ao limpar diretório de sessão:', err.message);
  }
}

async function startWhatsApp() {
  if (startingPromise) return startingPromise;
  startingPromise = (async () => {
    try {
      fs.mkdirSync(AUTH_DIR, { recursive: true });
      const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
      let version = [2, 3000, 1015901307];
      try {
        const latest = await fetchLatestBaileysVersion();
        if (latest && latest.version) version = latest.version;
      } catch (_) {}

      connectionState = 'connecting';
      sock = makeWASocket({
        version,
        logger,
        auth: state,
        printQRInTerminal: false,
        browser: ['Jorge Alvim Advocacia', 'Chrome', '120.0.0'],
        syncFullHistory: false,
        markOnlineOnConnect: false
      });

      sock.ev.on('creds.update', saveCreds);

      sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
          try {
            latestQrBase64 = await QRCode.toDataURL(qr, { margin: 2, width: 320 });
            resolveQrWaiters(latestQrBase64);
            console.log('[WA-GATEWAY] Novo QR Code gerado e pronto para leitura.');
          } catch (err) {
            console.error('[WA-GATEWAY] Falha ao converter QR Code:', err.message);
          }
        }

        if (connection === 'open') {
          connectionState = 'open';
          latestQrBase64 = null;
          const rawId = sock?.user?.id || '';
          connectedPhone = rawId.split(':')[0].split('@')[0].replace(/\D/g, '');
          resolveQrWaiters(null);
          console.log(`[WA-GATEWAY] Conectado com sucesso! Chip ativo: ${connectedPhone}`);
        } else if (connection === 'close') {
          connectionState = 'close';
          const statusCode = lastDisconnect?.error?.output?.statusCode;
          const loggedOut = statusCode === DisconnectReason.loggedOut;
          console.warn(`[WA-GATEWAY] Conexão encerrada (status=${statusCode}, loggedOut=${loggedOut}).`);
          sock = null;
          startingPromise = null;
          if (loggedOut) {
            connectedPhone = '';
            latestQrBase64 = null;
            clearAuthDir();
            setTimeout(() => startWhatsApp(), 1500);
          } else {
            setTimeout(() => startWhatsApp(), 3000);
          }
        }
      });

      sock.ev.on('messages.upsert', async (event) => {
        if (event.type !== 'notify' || !Array.isArray(event.messages)) return;
        for (const msg of event.messages) {
          if (!msg?.key || msg.key.fromMe) continue;
          const jid = msg.key.remoteJid || '';
          if (!jid || jid.endsWith('@g.us') || jid === 'status@broadcast') continue;

          try {
            await fetch(WEBHOOK_URL, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ event: 'messages.upsert', data: msg }),
              signal: AbortSignal.timeout(5000)
            });
          } catch (err) {
            console.warn('[WA-GATEWAY] Falha ao entregar webhook local:', err.message);
          }
        }
      });
    } catch (err) {
      console.error('[WA-GATEWAY] Erro ao iniciar Baileys:', err.message);
      connectionState = 'close';
      startingPromise = null;
      setTimeout(() => startWhatsApp(), 5000);
    } finally {
      startingPromise = null;
    }
  })();
  return startingPromise;
}

function readJsonBody(req) {
  return new Promise((resolve) => {
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
      if (raw.length > 1e6) req.destroy();
    });
    req.on('end', () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch (_) {
        resolve({});
      }
    });
    req.on('error', () => resolve({}));
  });
}

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body)
  });
  res.end(body);
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
  const pathname = url.pathname;

  if (pathname === '/health') {
    return sendJson(res, 200, { ok: true, state: connectionState, connectedPhone });
  }

  const reqKey = req.headers['apikey'] || req.headers['client-token'] || '';
  if (API_KEY && reqKey !== API_KEY) {
    return sendJson(res, 401, { error: 'Unauthorized apikey' });
  }

  if (req.method === 'GET' && pathname.startsWith('/instance/connectionState/')) {
    return sendJson(res, 200, {
      instance: {
        instanceName: pathname.split('/').pop(),
        state: connectionState,
        owner: connectedPhone
      }
    });
  }

  if (
    (req.method === 'GET' && pathname.startsWith('/instance/connect/')) ||
    (req.method === 'POST' && pathname === '/instance/create')
  ) {
    if (!sock && connectionState === 'close') {
      startWhatsApp();
    }
    if (connectionState === 'open') {
      return sendJson(res, 200, {
        instance: { state: 'open', owner: connectedPhone },
        base64: null
      });
    }
    const qr = await waitForQr(4500);
    return sendJson(res, 200, {
      base64: qr || null,
      qrcode: { base64: qr || null },
      pairingCode: null
    });
  }

  if (req.method === 'POST' && pathname.startsWith('/message/sendText/')) {
    if (connectionState !== 'open' || !sock) {
      return sendJson(res, 503, { error: 'WhatsApp instance not connected', state: connectionState });
    }
    const body = await readJsonBody(req);
    const rawNum = String(body.number || body.phone || '').replace(/\D/g, '');
    const text = String(body.text || body.message || body.textMessage?.text || '').trim();
    if (!rawNum || !text) {
      return sendJson(res, 400, { error: 'Missing number or text' });
    }
    const normalized = rawNum.startsWith('55') ? rawNum : `55${rawNum}`;
    try {
      let targetJid = `${normalized}@s.whatsapp.net`;
      try {
        const [result] = await sock.onWhatsApp(normalized);
        if (result && result.exists && result.jid) {
          targetJid = result.jid;
        }
      } catch (_) {}

      const sent = await sock.sendMessage(targetJid, { text });
      return sendJson(res, 200, {
        key: sent?.key || {},
        status: 'SENT',
        jid: targetJid
      });
    } catch (err) {
      console.error('[WA-GATEWAY] Falha ao enviar mensagem:', err.message);
      return sendJson(res, 500, { error: err.message });
    }
  }

  if (req.method === 'DELETE' && pathname.startsWith('/instance/logout/')) {
    try {
      if (sock) await sock.logout();
    } catch (_) {}
    sock = null;
    connectionState = 'close';
    connectedPhone = '';
    latestQrBase64 = null;
    clearAuthDir();
    startWhatsApp();
    return sendJson(res, 200, { status: 'logged_out' });
  }

  return sendJson(res, 404, { error: 'Not found' });
});

server.listen(PORT, HOST, () => {
  console.log(`[WA-GATEWAY] Evolution-compatible Baileys gateway ativo em http://${HOST}:${PORT}`);
  startWhatsApp();
});
