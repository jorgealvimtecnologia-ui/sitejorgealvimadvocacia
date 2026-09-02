import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
export const ROOT_DIR = path.resolve(__dirname, '..', '..');

export const PORT = process.env.PORT || 3000;
export const DB_PATH = path.join(ROOT_DIR, 'leads.db');
export const STORAGE_DIR = path.join(ROOT_DIR, 'storage', 'clients');
export const STORAGE_DRIVE_DIR = path.join(ROOT_DIR, 'storage', 'office_drive');
export const PUBLIC_DIR = ROOT_DIR;

// Garante existência das pastas essenciais
if (!fs.existsSync(STORAGE_DIR)) {
  fs.mkdirSync(STORAGE_DIR, { recursive: true });
}
if (!fs.existsSync(STORAGE_DRIVE_DIR)) {
  fs.mkdirSync(STORAGE_DRIVE_DIR, { recursive: true });
}

export function getClientIp(req) {
  if (!req) return '127.0.0.1';
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) {
    const ips = forwarded.split(',').map(s => s.trim());
    if (ips[0]) return ips[0];
  }
  return req.socket?.remoteAddress || req.ip || '127.0.0.1';
}
