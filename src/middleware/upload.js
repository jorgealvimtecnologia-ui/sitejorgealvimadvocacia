import multer from 'multer';
import path from 'path';
import fs from 'fs';
import crypto from 'node:crypto';
import { STORAGE_DIR, STORAGE_DRIVE_DIR } from '../config/constants.js';

// 1. Storage para Documentos de Clientes e Processos (até 50MB)
const clientStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const targetId = req.clientId || req.params.id || 'temp';
    const clientFolder = path.join(STORAGE_DIR, String(targetId));
    if (!fs.existsSync(clientFolder)) {
      fs.mkdirSync(clientFolder, { recursive: true });
    }
    cb(null, clientFolder);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || '.bin';
    const baseName = path.basename(file.originalname, ext).replace(/[^a-zA-Z0-9_-]/g, '_') || 'doc';
    const timestamp = Date.now();
    const randHex = crypto.randomBytes(3).toString('hex');
    cb(null, `${timestamp}_${randHex}_${baseName}${ext}`);
  }
});

export const uploadClientDoc = multer({
  storage: clientStorage,
  limits: { fileSize: 50 * 1024 * 1024 } // 50MB
});

// 2. Storage para Drive do Escritório (até 100MB)
const driveStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, STORAGE_DRIVE_DIR);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    const safeName = path.basename(file.originalname, ext).replace(/[^a-zA-Z0-9_-]/g, '_');
    cb(null, `${safeName}-${uniqueSuffix}${ext}`);
  }
});

export const uploadDrive = multer({
  storage: driveStorage,
  limits: { fileSize: 100 * 1024 * 1024 } // 100MB
});
