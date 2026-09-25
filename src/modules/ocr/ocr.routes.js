/**
 * Módulo OCR — "Zero Digitação" de documentos (RG / CNH)
 * Jorge Alvim Advocacia — OAB/MG 222.943
 *
 * Recebe a foto/scan de um RG ou CNH, chama o motor Python (scripts/ocr_documento.py,
 * padrão do radar_crawler.py) e devolve os campos extraídos (nome, CPF, RG, data de
 * nascimento, filiação) para pré-preencher o cadastro do cliente — sem digitação manual.
 *
 * Requisitos no servidor: tesseract-ocr + tesseract-ocr-por e `pip install pytesseract pillow`.
 * Sem esse ambiente, a rota responde 503 com orientação (degradação graciosa, nunca quebra).
 */
import express from 'express';
import fs from 'fs';
import path from 'path';
import multer from 'multer';
import { execFile } from 'node:child_process';
import { ROOT_DIR } from '../../config/constants.js';
import { requireAuth } from '../../middleware/auth.js';
import { logAudit } from '../../middleware/audit.js';

export const ocrRouter = express.Router();

// Binário do Python (server usa python3; configurável por ambiente).
const PYTHON_BIN = process.env.PYTHON_BIN || 'python3';

// Upload temporário: grava o arquivo em storage/temp e apaga logo após o OCR.
const TEMP_DIR = path.join(ROOT_DIR, 'storage', 'temp');
try { fs.mkdirSync(TEMP_DIR, { recursive: true }); } catch (e) {}

const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, TEMP_DIR),
    filename: (req, file, cb) => {
      const ext = (path.extname(file.originalname) || '.img').toLowerCase();
      cb(null, `ocr_${Date.now()}_${Math.random().toString(36).slice(2, 8)}${ext}`);
    }
  }),
  limits: { fileSize: 15 * 1024 * 1024 }, // 15MB — foto de celular cabe folgado
  fileFilter: (req, file, cb) => {
    if (/^image\//.test(file.mimetype)) return cb(null, true);
    cb(new Error('Envie uma imagem (JPG/PNG) do documento.'));
  }
});

function runOcr(filePath, tipo) {
  return new Promise((resolve) => {
    const scriptPath = path.join(ROOT_DIR, 'scripts', 'ocr_documento.py');
    const args = [scriptPath, '--file', filePath, '--type', tipo || 'auto'];
    execFile(PYTHON_BIN, args, { timeout: 25000, maxBuffer: 10 * 1024 * 1024 }, (error, stdout, stderr) => {
      if (error && !stdout) {
        // Python ausente / erro de execução → degradação graciosa.
        // ENOENT (código do próprio execFile) é o sinal confiável de binário ausente no Linux.
        const semPython = error.code === 'ENOENT' ||
          /ENOENT|not found|n[ãa]o foi encontrado/i.test(error.message || '');
        return resolve({
          ok: false,
          codigo: semPython ? 'SEM_PYTHON' : 'FALHA_EXEC',
          erro: semPython
            ? 'OCR indisponível: Python 3 não encontrado no servidor.'
            : ('Falha ao executar o OCR: ' + error.message)
        });
      }
      try {
        resolve(JSON.parse(String(stdout).trim()));
      } catch (e) {
        resolve({ ok: false, codigo: 'PARSE', erro: 'Resposta do OCR ilegível.' });
      }
    });
  });
}

/**
 * POST /api/ocr/documento  (campo do arquivo: "documento")
 * Body opcional: type = rg | cnh | auto
 * Resposta: { ok, tipo, campos:{nome,cpf,rg,data_nascimento,nome_mae}, confianca }
 */
ocrRouter.post('/api/ocr/documento', requireAuth, upload.single('documento'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ ok: false, erro: 'Nenhuma imagem enviada (campo "documento").' });
  }
  const filePath = req.file.path;
  const tipo = ['rg', 'cnh'].includes(String(req.body.type || '').toLowerCase())
    ? req.body.type.toLowerCase()
    : 'auto';
  try {
    const resultado = await runOcr(filePath, tipo);

    if (!resultado || !resultado.ok) {
      const semAmbiente = resultado && ['SEM_PYTHON', 'SEM_TESSERACT'].includes(resultado.codigo);
      return res.status(semAmbiente ? 503 : 422).json(
        resultado || { ok: false, erro: 'Não foi possível ler o documento.' }
      );
    }

    try {
      logAudit(req, {
        event_type: 'LEITURA',
        event_name: 'OCR_DOCUMENTO',
        module: 'clients',
        description: `Leitura OCR de documento (${resultado.tipo}) — confiança ${resultado.confianca}`,
        details: { tipo: resultado.tipo, confianca: resultado.confianca }
      });
    } catch (e) {}

    return res.json(resultado);
  } finally {
    // Nunca deixa a foto do documento (dado pessoal/LGPD) parada em disco.
    fs.unlink(filePath, () => {});
  }
});
