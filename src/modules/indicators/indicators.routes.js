/**
 * Indicadores do dono (AUD-17): GET /api/financial/owner-indicators?months=12&horizon=6
 * Fica sob /api/financial: exige a aba Financeiro (regra já existente em rbac-rules.js).
 */
import express from 'express';
import { db } from '../../config/db.js';
import { requireAuth } from '../../middleware/auth.js';
import { buildOwnerIndicators } from './owner-indicators.js';

export const indicatorsRouter = express.Router();

indicatorsRouter.get('/api/financial/owner-indicators', requireAuth, (req, res) => {
  try {
    return res.json({ success: true, ...buildOwnerIndicators(db, { months: req.query.months, horizon: req.query.horizon }) });
  } catch (err) {
    console.error('[INDICADORES] Falha ao calcular:', err);
    return res.status(500).json({ error: 'Não foi possível calcular os indicadores.' });
  }
});
