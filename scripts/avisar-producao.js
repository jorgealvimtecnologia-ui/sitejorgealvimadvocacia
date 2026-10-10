#!/usr/bin/env node
/**
 * Avisa o titular por e-mail quando a verificação de produção (AUD-20) encontra problema grave.
 * Chamado pelo cron só no caminho de FALHA. Reaproveita o SMTP do sistema (src/shared/email.js).
 */
import '../src/config/load-env.js';
import { sendEmail, isEmailConfigured } from '../src/shared/email.js';

// Rodar a verificação programaticamente seria melhor; aqui lemos o último log para o corpo do e-mail.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const log = path.join(ROOT, 'backups', 'producao-checklist.log');
const trecho = fs.existsSync(log) ? fs.readFileSync(log, 'utf8').split('Verificação de produção').pop() : '(sem log)';

if (!isEmailConfigured()) { console.warn('[CHECKLIST] SMTP não configurado — aviso não enviado.'); process.exit(0); }
const to = process.env.OWNER_EMAIL || 'jorgealvimtecnologia@gmail.com';
await sendEmail({
  to,
  subject: '⚠️ Verificação de produção encontrou um problema — Jorge Alvim Advocacia',
  text: `A verificação automática semanal da produção encontrou algo que precisa de atenção.\n\nVerificação de produção${trecho.slice(0, 2000)}\n\nAbra o painel e verifique. Este e-mail é automático.`,
}).then((r) => console.log(r.sent ? '[CHECKLIST] Aviso enviado.' : `[CHECKLIST] Aviso não enviado: ${r.reason || r.error}`)).catch((e) => console.error(e.message));
