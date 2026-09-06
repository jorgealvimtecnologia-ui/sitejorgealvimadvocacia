import express from 'express';
import crypto from 'node:crypto';
import { db } from '../../config/db.js';
import { requireAuth } from '../../middleware/auth.js';
import { logAudit } from '../../middleware/audit.js';
import { getClientIp } from '../../config/constants.js';

export const signaturesRouter = express.Router();

/**
 * 1. POST /api/signatures/request - Criar Nova Solicitação de Assinatura Eletrônica
 */
signaturesRouter.post('/api/signatures/request', requireAuth, (req, res) => {
  try {
    const {
      client_id,
      client_name,
      client_cpf_cnpj,
      client_phone,
      client_email,
      document_type = 'procuracao',
      document_title,
      document_content
    } = req.body;

    if (!client_name || !document_content) {
      return res.status(400).json({ error: 'Nome do signatário e conteúdo do documento são obrigatórios.' });
    }

    const token = crypto.randomBytes(24).toString('hex');
    const now = new Date().toISOString();
    const docTitle = document_title || `${document_type.toUpperCase()} - ${client_name}`;

    const insertStmt = db.prepare(`
      INSERT INTO electronic_signatures (
        token, client_id, client_name, client_cpf_cnpj, client_phone, client_email,
        document_type, document_title, document_content, status, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pendente', ?)
    `);

    insertStmt.run(
      token,
      client_id || null,
      client_name.trim(),
      client_cpf_cnpj ? client_cpf_cnpj.trim() : null,
      client_phone ? client_phone.trim() : null,
      client_email ? client_email.trim() : null,
      document_type,
      docTitle,
      document_content,
      now
    );

    const signUrl = `${req.protocol}://${req.get('host')}/assinar.html?token=${token}`;

    logAudit(req, {
      event_type: 'CRIACAO',
      event_name: 'SOLICITAR_ASSINATURA',
      module: 'ASSINATURA_DIGITAL',
      resource_id: token,
      description: `Solicitação de assinatura gerada para ${client_name} (${docTitle}).`,
      details: { token, client_name, docTitle }
    });

    return res.status(201).json({
      success: true,
      token,
      sign_url: signUrl,
      document_title: docTitle,
      message: 'Solicitação de assinatura criada com sucesso!'
    });
  } catch (err) {
    console.error('[ASSINATURA] Falha ao criar solicitação:', err);
    return res.status(500).json({ error: 'Erro ao criar solicitação de assinatura.' });
  }
});

/**
 * 2. GET /api/signatures/list - Listar Assinaturas do Escritório
 */
signaturesRouter.get('/api/signatures/list', requireAuth, (req, res) => {
  try {
    const list = db.prepare(`SELECT * FROM electronic_signatures ORDER BY created_at DESC`).all();
    return res.json({ success: true, count: list.length, signatures: list });
  } catch (err) {
    console.error('[ASSINATURA] Falha ao listar assinaturas:', err);
    return res.status(500).json({ error: 'Erro ao listar assinaturas.' });
  }
});

/**
 * 3. GET /api/signatures/:token - Consulta Pública para o Signatário Visualizar e Assinar
 */
signaturesRouter.get('/api/signatures/:token', (req, res) => {
  try {
    const { token } = req.params;
    const doc = db.prepare(`SELECT * FROM electronic_signatures WHERE token = ?`).get(token);

    if (!doc) {
      return res.status(404).json({ error: 'Documento não encontrado ou link expirado.' });
    }

    return res.json({
      success: true,
      document: {
        token: doc.token,
        client_name: doc.client_name,
        client_cpf_cnpj: doc.client_cpf_cnpj,
        document_type: doc.document_type,
        document_title: doc.document_title,
        document_content: doc.document_content,
        status: doc.status,
        signed_at: doc.signed_at,
        audit_hash: doc.audit_hash
      }
    });
  } catch (err) {
    console.error('[ASSINATURA] Falha ao buscar documento:', err);
    return res.status(500).json({ error: 'Erro ao carregar documento para assinatura.' });
  }
});

/**
 * 4. POST /api/signatures/:token/sign - Conclusão e Registro da Assinatura Touch com Hash SHA-256
 */
signaturesRouter.post('/api/signatures/:token/sign', (req, res) => {
  try {
    const { token } = req.params;
    const { signature_image, confirmed_cpf, geolocation } = req.body;

    const doc = db.prepare(`SELECT * FROM electronic_signatures WHERE token = ?`).get(token);
    if (!doc) {
      return res.status(404).json({ error: 'Documento não encontrado.' });
    }

    if (doc.status === 'assinado') {
      return res.status(400).json({ error: 'Este documento já foi assinado anteriormente.' });
    }

    if (!signature_image) {
      return res.status(400).json({ error: 'O desenho da assinatura é obrigatório.' });
    }

    const signerIp = getClientIp(req);
    const userAgent = (req.headers['user-agent'] || 'Dispositivo Móvel').substring(0, 255);
    const signedAt = new Date().toISOString();

    // Cria Hash Criptográfico SHA-256 de Autenticidade e Não-Repúdio
    const rawDataToHash = `${doc.token}|${doc.client_name}|${doc.document_content}|${signedAt}|${signerIp}|${userAgent}`;
    const auditHash = crypto.createHash('sha256').update(rawDataToHash).digest('hex');

    db.prepare(`
      UPDATE electronic_signatures 
      SET status = 'assinado', signature_image = ?, signer_ip = ?, signer_user_agent = ?, signed_at = ?, audit_hash = ?
      WHERE token = ?
    `).run(
      signature_image,
      signerIp,
      userAgent,
      signedAt,
      auditHash,
      token
    );

    return res.json({
      success: true,
      message: 'Documento assinado com sucesso com plena validade jurídica!',
      signed_at: signedAt,
      audit_hash: auditHash,
      certificate_url: `/api/signatures/${token}/certificate`
    });
  } catch (err) {
    console.error('[ASSINATURA] Falha ao registrar assinatura:', err);
    return res.status(500).json({ error: 'Erro ao processar assinatura eletrônica.' });
  }
});

/**
 * 5. GET /api/signatures/:token/certificate - Certificado e Trilha de Autenticidade
 */
signaturesRouter.get('/api/signatures/:token/certificate', (req, res) => {
  try {
    const { token } = req.params;
    const doc = db.prepare(`SELECT * FROM electronic_signatures WHERE token = ?`).get(token);

    if (!doc || doc.status !== 'assinado') {
      return res.status(404).json({ error: 'Certificado disponível apenas após a assinatura do documento.' });
    }

    return res.json({
      success: true,
      certificate: {
        document_title: doc.document_title,
        signer_name: doc.client_name,
        signer_doc: doc.client_cpf_cnpj || 'Não informado',
        signed_at_utc: doc.signed_at,
        signed_at_br: new Date(doc.signed_at).toLocaleString('pt-BR'),
        signer_ip: doc.signer_ip,
        device_user_agent: doc.signer_user_agent,
        sha256_hash: doc.audit_hash,
        legal_basis: 'Lei nº 14.063/2020 e Art. 10, § 2º da Medida Provisória nº 2.200-2/2001 (Assinatura Eletrônica Avançada)',
        authenticity_url: `${req.protocol}://${req.get('host')}/assinar.html?token=${doc.token}`
      }
    });
  } catch (err) {
    console.error('[ASSINATURA] Falha ao emitir certificado:', err);
    return res.status(500).json({ error: 'Erro ao emitir certificado.' });
  }
});
