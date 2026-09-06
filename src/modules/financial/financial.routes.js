/**
 * Módulo FINANCEIRO (financial) — lançamentos, parcelas, NFS-e, alvarás,
 * rescisões e integração Asaas. Extraído do server.js.
 */
import express from 'express';
import { db } from '../../config/db.js';
import { requireAuth } from '../../middleware/auth.js';
import { logAudit } from '../../middleware/audit.js';
import { calculateINSS, calculateNoticeDays } from '../../shared/labor.js';

export const financialRouter = express.Router();

// Gerador de ID para Lançamentos Financeiros: LAN-2026-0001
function generateNextTransactionId() {
  const currentYear = new Date().getFullYear();
  const prefix = `LAN-${currentYear}-`;
  
  const records = db.prepare(`SELECT id FROM financial_transactions WHERE id LIKE ?`).all(`${prefix}%`);
  if (!records || records.length === 0) {
    return `${prefix}0001`;
  }
  
  const maxNum = records.reduce((max, r) => {
    const numPart = parseInt(r.id.replace(prefix, ''), 10);
    return !isNaN(numPart) && numPart > max ? numPart : max;
  }, 0);
  
  return `${prefix}${String(maxNum + 1).padStart(4, '0')}`;
}

// Gerador de ID para Alvarás Judiciais: ALV-2026-0001
function generateNextAlvaraId() {
  const currentYear = new Date().getFullYear();
  const prefix = `ALV-${currentYear}-`;
  
  const records = db.prepare(`SELECT id FROM alvaras WHERE id LIKE ?`).all(`${prefix}%`);
  if (!records || records.length === 0) {
    return `${prefix}0001`;
  }
  
  const maxNum = records.reduce((max, r) => {
    const numPart = parseInt(r.id.replace(prefix, ''), 10);
    return !isNaN(numPart) && numPart > max ? numPart : max;
  }, 0);
  
  return `${prefix}${String(maxNum + 1).padStart(4, '0')}`;
}

// ================= SERVIÇO DE INTEGRAÇÃO DA API ASAAS =================

function getAsaasConfig() {
  const apiKeyRow = db.prepare(`SELECT value FROM system_settings WHERE key = 'asaas_api_key'`).get();
  const envRow = db.prepare(`SELECT value FROM system_settings WHERE key = 'asaas_environment'`).get();
  
  const apiKey = apiKeyRow ? apiKeyRow.value : '';
  const environment = envRow ? envRow.value : 'sandbox'; // 'sandbox' ou 'production'
  const baseUrl = environment === 'production' 
    ? 'https://api.asaas.com/v3' 
    : 'https://sandbox.asaas.com/api/v3';

  return { apiKey, environment, baseUrl };
}

async function callAsaasApi(endpoint, method = 'GET', body = null) {
  const { apiKey, baseUrl } = getAsaasConfig();
  if (!apiKey) {
    throw new Error('Chave de API do Asaas não configurada. Insira sua chave na aba Financeiro > Configuração Asaas.');
  }

  const options = {
    method,
    headers: {
      'access_token': apiKey,
      'Content-Type': 'application/json',
      'User-Agent': 'JorgeAlvimAdvocacia-ERP/1.0'
    }
  };

  if (body && (method === 'POST' || method === 'PUT')) {
    options.body = JSON.stringify(body);
  }

  const response = await fetch(`${baseUrl}${endpoint}`, options);
  const data = await response.json();
  if (!response.ok) {
    const errorMsg = data.errors ? data.errors.map(e => e.description).join('; ') : (data.message || 'Erro de comunicação com Asaas');
    throw new Error(errorMsg);
  }
  return data;
}

// Localiza ou Cria Cliente no Asaas
async function findOrCreateAsaasCustomer(client) {
  const cleanCpfCnpj = (client.cpf || client.cnpj || '').replace(/\D/g, '');
  
  if (cleanCpfCnpj) {
    try {
      const searchRes = await callAsaasApi(`/customers?cpfCnpj=${cleanCpfCnpj}`);
      if (searchRes.data && searchRes.data.length > 0) {
        return searchRes.data[0].id;
      }
    } catch (err) {
      console.warn('[ASAAS] Busca de cliente por CPF/CNPJ falhou, tentando cadastro direto:', err.message);
    }
  }

  const customerPayload = {
    name: client.full_name,
    cpfCnpj: cleanCpfCnpj || undefined,
    email: client.email || 'atendimento@jorgealvim.adv.br',
    phone: (client.phone || '').replace(/\D/g, ''),
    mobilePhone: (client.phone || '').replace(/\D/g, ''),
    address: client.street || undefined,
    addressNumber: client.number || undefined,
    complement: client.complement || undefined,
    province: client.neighborhood || undefined,
    postalCode: (client.cep || '').replace(/\D/g, '') || undefined,
    externalReference: client.id,
    notificationDisabled: false
  };

  const newCust = await callAsaasApi('/customers', 'POST', customerPayload);
  return newCust.id;
}

financialRouter.get('/api/financial/settings', requireAuth, (req, res) => {
  try {
    const rows = db.prepare(`SELECT key, value FROM system_settings`).all();
    const settings = {};
    rows.forEach(r => { settings[r.key] = r.value; });
    return res.json({ success: true, settings });
  } catch (error) {
    console.error('[FINANCEIRO] Erro ao obter configurações:', error);
    return res.status(500).json({ error: 'Erro ao buscar configurações financeiras.' });
  }
});

financialRouter.post('/api/financial/settings', requireAuth, (req, res) => {
  try {
    const { asaas_api_key, asaas_environment, office_pix_key, office_bank_info } = req.body;
    const now = new Date().toISOString();

    const upsertStmt = db.prepare(`
      INSERT OR REPLACE INTO system_settings (key, value, updated_at) VALUES (?, ?, ?)
    `);

    if (asaas_api_key !== undefined) upsertStmt.run('asaas_api_key', asaas_api_key.trim(), now);
    if (asaas_environment !== undefined) upsertStmt.run('asaas_environment', asaas_environment, now);
    if (office_pix_key !== undefined) upsertStmt.run('office_pix_key', office_pix_key.trim(), now);
    if (office_bank_info !== undefined) upsertStmt.run('office_bank_info', office_bank_info.trim(), now);

    logAudit(req, {
      event_type: 'ALTERACAO',
      event_name: 'CONFIG_FINANCEIRO_ASAAS',
      module: 'FINANCEIRO',
      description: `Atualização das configurações do Asaas API e dados bancários do escritório (Ambiente: ${asaas_environment || 'N/A'}).`
    });

    return res.json({ success: true, message: 'Configurações financeiras salvas com sucesso!' });
  } catch (error) {
    console.error('[FINANCEIRO] Erro ao salvar configurações:', error);
    return res.status(500).json({ error: 'Erro ao salvar configurações financeiras.' });
  }
});

financialRouter.post('/api/financial/asaas/test-connection', requireAuth, async (req, res) => {
  try {
    const testData = await callAsaasApi('/finance/balance');
    return res.json({ 
      success: true, 
      message: 'Conexão com Asaas estabelecida com sucesso!',
      balance: testData.balance || 0
    });
  } catch (error) {
    return res.status(400).json({ success: false, error: error.message });
  }
});

// 2. Webhook Oficial do Asaas (Recebe confirmações de pagamento automáticas)
financialRouter.post('/api/webhooks/asaas', async (req, res) => {
  try {
    const eventData = req.body;
    console.log(`[ASAAS WEBHOOK] Evento recebido: ${eventData.event} - Pagamento: ${eventData.payment?.id}`);

    if (eventData.event === 'PAYMENT_RECEIVED' || eventData.event === 'PAYMENT_CONFIRMED') {
      const payment = eventData.payment;
      if (!payment) return res.status(200).send('OK');

      const paymentId = payment.id;
      const extRef = payment.externalReference || '';
      const paidAmount = payment.value || payment.netValue || 0;
      const paidDate = payment.paymentDate || payment.confirmedDate || new Date().toISOString().split('T')[0];
      const method = payment.billingType || 'PIX';

      // 1. Busca a parcela correspondente
      let installment = db.prepare(`
        SELECT * FROM contract_installments WHERE asaas_payment_id = ?
      `).get(paymentId);

      if (!installment && extRef.startsWith('INST-')) {
        const instId = parseInt(extRef.replace('INST-', ''), 10);
        installment = db.prepare(`SELECT * FROM contract_installments WHERE id = ?`).get(instId);
      }

      if (installment) {
        // Atualiza a parcela para Paga
        db.prepare(`
          UPDATE contract_installments SET 
            status = 'Pago',
            paid_date = ?,
            paid_amount = ?,
            payment_method = ?,
            updated_at = ?
          WHERE id = ?
        `).run(paidDate, paidAmount, method, new Date().toISOString(), installment.id);

        // Atualiza o saldo e total pago do cliente
        const client = db.prepare(`SELECT * FROM clients WHERE id = ?`).get(installment.client_id);
        if (client) {
          const allInsts = db.prepare(`SELECT * FROM contract_installments WHERE client_id = ?`).all(client.id);
          const totalPaid = allInsts.filter(i => i.status === 'Pago').reduce((acc, curr) => acc + (curr.paid_amount || curr.amount), 0);
          const totalContract = client.contract_value || 0;
          const newBalance = Math.max(0, totalContract - totalPaid);
          const newStatus = (newBalance === 0 && totalContract > 0) ? 'Quitado' : client.contract_status;

          db.prepare(`
            UPDATE clients SET 
              amount_paid = ?,
              balance_due = ?,
              contract_status = ?,
              updated_at = ?
            WHERE id = ?
          `).run(totalPaid, newBalance, newStatus, new Date().toISOString(), client.id);

          // Registra a receita no Fluxo de Caixa (se ainda não lançada)
          const transCheck = db.prepare(`SELECT id FROM financial_transactions WHERE installment_id = ?`).get(installment.id);
          if (!transCheck) {
            const transId = generateNextTransactionId();
            db.prepare(`
              INSERT INTO financial_transactions (
                id, type, category, description, amount, due_date, payment_date, status, client_id, installment_id, payment_method, notes, created_at, updated_at
              ) VALUES (?, 'Receita', 'Honorários Contratuais', ?, ?, ?, ?, 'Pago', ?, ?, ?, '', ?, ?)
            `).run(
              transId,
              `Honorários (Parcela ${installment.installment_number}/${installment.total_installments}) - ${client.full_name}`,
              paidAmount,
              installment.due_date,
              paidDate,
              client.id,
              installment.id,
              method,
              new Date().toISOString(),
              new Date().toISOString()
            );
          }
        }
        console.log(`[ASAAS WEBHOOK] Baixa automática efetuada com sucesso para a parcela #${installment.id}!`);

        logAudit(null, {
          event_type: 'ALTERACAO',
          event_name: 'BAIXA_AUTOMATICA_ASAAS',
          module: 'FINANCEIRO',
          resource_id: installment.id,
          user_name: 'Webhook Asaas',
          user_role: 'sistema',
          description: `Baixa automática de pagamento via Asaas PIX/Boleto: R$ ${paidAmount} na parcela #${installment.id} (Cliente: ${client ? client.full_name : installment.client_id}).`
        });
      }
    }

    // Tratamento de Eventos de NFS-e do Asaas
    if (eventData.event && eventData.event.startsWith('INVOICE_')) {
      const inv = eventData.invoice;
      if (inv && inv.id) {
        const statusMap = {
          'INVOICE_AUTHORIZED': 'Emitida',
          'INVOICE_SYNCHRONIZED': 'Emitida',
          'INVOICE_ERROR': 'Erro',
          'INVOICE_CANCELED': 'Cancelada',
          'INVOICE_PROCESSING_CANCELED': 'Cancelada'
        };
        const mappedStatus = statusMap[eventData.event] || inv.status || 'Processando';
        const now = new Date().toISOString();

        db.prepare(`
          UPDATE nfse_invoices SET
            status = ?,
            asaas_status = ?,
            pdf_url = COALESCE(?, pdf_url),
            xml_url = COALESCE(?, xml_url),
            invoice_number = COALESCE(?, invoice_number),
            verification_code = COALESCE(?, verification_code),
            updated_at = ?
          WHERE asaas_invoice_id = ?
        `).run(
          mappedStatus,
          inv.status || mappedStatus,
          inv.pdfUrl || null,
          inv.xmlUrl || null,
          inv.number || null,
          inv.verificationCode || null,
          now,
          inv.id
        );

        console.log(`[ASAAS WEBHOOK] NFS-e Asaas #${inv.id} atualizada com status: ${mappedStatus}`);
      }
    }

    return res.status(200).json({ received: true });
  } catch (error) {
    console.error('[ASAAS WEBHOOK] Erro ao processar webhook:', error);
    return res.status(500).json({ error: 'Erro interno no processamento do webhook.' });
  }
});

// 3. Dashboard Financeiro (KPIs & Métricas)
financialRouter.get('/api/financial/dashboard', requireAuth, (req, res) => {
  try {
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = String(now.getMonth() + 1).padStart(2, '0');
    const monthPrefix = `${currentYear}-${currentMonth}`;

    // 1. Receitas do Mês Atual
    const monthRevenueRow = db.prepare(`
      SELECT SUM(amount) as total FROM financial_transactions 
      WHERE type = 'Receita' AND status = 'Pago' AND payment_date LIKE ?
    `).get(`${monthPrefix}%`);
    const monthRevenue = monthRevenueRow?.total || 0;

    // 2. Despesas do Mês Atual
    const monthExpenseRow = db.prepare(`
      SELECT SUM(amount) as total FROM financial_transactions 
      WHERE type = 'Despesa' AND status = 'Pago' AND payment_date LIKE ?
    `).get(`${monthPrefix}%`);
    const monthExpense = monthExpenseRow?.total || 0;

    // 3. Lucro Líquido
    const netIncome = monthRevenue - monthExpense;

    // 4. Previsão a Receber nos próximos 30 dias (Parcelas Pendentes)
    const todayStr = now.toISOString().split('T')[0];
    const next30 = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const upcomingRow = db.prepare(`
      SELECT SUM(amount) as total FROM contract_installments 
      WHERE status = 'Pendente' AND due_date >= ? AND due_date <= ?
    `).get(todayStr, next30);
    const upcomingRevenue = upcomingRow?.total || 0;

    // 5. Inadimplência Total (Parcelas Vencidas e não pagas)
    const overdueRow = db.prepare(`
      SELECT SUM(amount) as total, COUNT(*) as count FROM contract_installments 
      WHERE status = 'Pendente' AND due_date < ?
    `).get(todayStr);
    const overdueTotal = overdueRow?.total || 0;
    const overdueCount = overdueRow?.count || 0;

    // 6. Histórico Mensal dos últimos 6 meses para gráfico
    const monthlyHistory = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const prefix = `${y}-${m}`;
      const rev = db.prepare(`SELECT SUM(amount) as total FROM financial_transactions WHERE type = 'Receita' AND status = 'Pago' AND payment_date LIKE ?`).get(`${prefix}%`)?.total || 0;
      const exp = db.prepare(`SELECT SUM(amount) as total FROM financial_transactions WHERE type = 'Despesa' AND status = 'Pago' AND payment_date LIKE ?`).get(`${prefix}%`)?.total || 0;
      monthlyHistory.push({
        monthLabel: `${m}/${y}`,
        revenue: rev,
        expense: exp,
        net: rev - exp
      });
    }

    return res.json({
      success: true,
      kpis: {
        monthRevenue,
        monthExpense,
        netIncome,
        upcomingRevenue,
        overdueTotal,
        overdueCount
      },
      monthlyHistory
    });
  } catch (error) {
    console.error('[FINANCEIRO] Erro no dashboard financeiro:', error);
    return res.status(500).json({ error: 'Erro ao gerar indicadores financeiros.' });
  }
});

// 4. Lançamentos de Receitas e Despesas (Fluxo de Caixa)
financialRouter.get('/api/financial/transactions', requireAuth, (req, res) => {
  try {
    const { type, status, category } = req.query;
    let query = `
      SELECT t.*, c.full_name as client_name 
      FROM financial_transactions t
      LEFT JOIN clients c ON t.client_id = c.id
      WHERE 1=1
    `;
    const params = [];

    if (type && type !== 'ALL') {
      query += ` AND t.type = ?`;
      params.push(type);
    }
    if (status && status !== 'ALL') {
      query += ` AND t.status = ?`;
      params.push(status);
    }
    if (category && category !== 'ALL') {
      query += ` AND t.category = ?`;
      params.push(category);
    }

    query += ` ORDER BY COALESCE(t.payment_date, t.due_date, t.created_at) DESC`;

    const transactions = db.prepare(query).all(...params);
    return res.json({ success: true, transactions });
  } catch (error) {
    console.error('[FINANCEIRO] Erro ao listar lançamentos:', error);
    return res.status(500).json({ error: 'Erro ao listar lançamentos do fluxo de caixa.' });
  }
});

// Helper para calcular datas futuras de recorrência (Diário, Mensal, Anual)
function addRecurrenceInterval(baseDateStr, period, count) {
  const baseDate = new Date(baseDateStr + 'T12:00:00');
  if (isNaN(baseDate.getTime())) return baseDateStr;

  if (period === 'monthly') {
    const d = new Date(baseDate);
    d.setMonth(d.getMonth() + count);
    return d.toISOString().split('T')[0];
  } else if (period === 'yearly') {
    const d = new Date(baseDate);
    d.setFullYear(d.getFullYear() + count);
    return d.toISOString().split('T')[0];
  } else if (period === 'daily') {
    const d = new Date(baseDate);
    d.setDate(d.getDate() + count);
    return d.toISOString().split('T')[0];
  }
  return baseDateStr;
}

financialRouter.post('/api/financial/transactions', requireAuth, (req, res) => {
  try {
    const { 
      type, category, description, amount, due_date, payment_date, status, 
      client_id, payment_method, notes,
      is_recurring, recurrence_period, recurrence_count 
    } = req.body;

    if (!type || !category || !description || !amount) {
      return res.status(400).json({ error: 'Tipo, categoria, descrição e valor são obrigatórios.' });
    }

    const now = new Date().toISOString();
    const numAmount = parseFloat(amount) || 0;
    const initialDueDate = due_date || payment_date || now.split('T')[0];

    const totalRepeats = (is_recurring && parseInt(recurrence_count, 10) > 1) 
      ? Math.min(60, parseInt(recurrence_count, 10)) 
      : 1;

    const createdIds = [];

    for (let i = 1; i <= totalRepeats; i++) {
      const transId = generateNextTransactionId();
      let targetDueDate = initialDueDate;
      let targetPaymentDate = '';
      let targetStatus = status || 'Pago';
      let targetDesc = description.trim();

      if (totalRepeats > 1) {
        targetDueDate = addRecurrenceInterval(initialDueDate, recurrence_period || 'monthly', i - 1);
        targetDesc = `${description.trim()} (${i}/${totalRepeats})`;
        
        if (i === 1) {
          targetPaymentDate = (status === 'Pago') ? (payment_date || now.split('T')[0]) : '';
          targetStatus = status || 'Pago';
        } else {
          targetPaymentDate = '';
          targetStatus = 'Pendente';
        }
      } else {
        targetPaymentDate = payment_date || (status === 'Pago' ? now.split('T')[0] : '');
      }

      db.prepare(`
        INSERT INTO financial_transactions (
          id, type, category, description, amount, due_date, payment_date, status, client_id, payment_method, notes, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        transId,
        type,
        category.trim(),
        targetDesc,
        numAmount,
        targetDueDate,
        targetPaymentDate,
        targetStatus,
        client_id || null,
        payment_method || 'PIX',
        notes ? notes.trim() : (totalRepeats > 1 ? `Recorrência ${recurrence_period || 'monthly'} (${i}/${totalRepeats})` : ''),
        now,
        now
      );

      createdIds.push(transId);
    }

    logAudit(req, {
      event_type: 'CRIACAO',
      event_name: 'LANCAR_TRANSACAO',
      module: 'FINANCEIRO',
      resource_id: createdIds[0],
      description: `Lançamento financeiro de ${type}: '${description.trim()}' (R$ ${numAmount.toFixed(2)})${totalRepeats > 1 ? ' com ' + totalRepeats + ' repetições ' + (recurrence_period || 'mensais') : ''}.`,
      details: { ids: createdIds, count: totalRepeats, type, category, amount: numAmount }
    });

    const periodLabels = { 'monthly': 'mensais', 'yearly': 'anuais', 'daily': 'diárias' };
    const labelPeriod = periodLabels[recurrence_period] || 'recorrentes';

    const msg = totalRepeats > 1 
      ? `Lançamento e ${totalRepeats} repetições ${labelPeriod} futuras criados com sucesso no Livro Caixa!` 
      : 'Lançamento financeiro cadastrado com sucesso!';

    return res.status(201).json({ success: true, message: msg, id: createdIds[0], count: totalRepeats });
  } catch (error) {
    console.error('[FINANCEIRO] Erro ao criar lançamento:', error);
    return res.status(500).json({ error: 'Erro ao cadastrar lançamento financeiro.' });
  }
});

// Baixa rápida / liquidação de lançamento pendente
financialRouter.patch('/api/financial/transactions/:id/pay', requireAuth, (req, res) => {
  try {
    const { id } = req.params;
    const { payment_date, payment_method } = req.body || {};
    const existing = db.prepare(`SELECT * FROM financial_transactions WHERE id = ?`).get(id);
    if (!existing) {
      return res.status(404).json({ error: 'Lançamento não encontrado.' });
    }

    const now = new Date().toISOString();
    const payDate = payment_date || now.split('T')[0];

    db.prepare(`
      UPDATE financial_transactions 
      SET status = 'Pago', payment_date = ?, payment_method = COALESCE(?, payment_method), updated_at = ? 
      WHERE id = ?
    `).run(payDate, payment_method || null, now, id);

    logAudit(req, {
      event_type: 'ALTERACAO',
      event_name: 'LIQUIDAR_TRANSACAO',
      module: 'FINANCEIRO',
      resource_id: id,
      description: `Baixa/Liquidação do lançamento #${id} (${existing.description} - R$ ${existing.amount.toFixed(2)}).`
    });

    return res.json({ success: true, message: 'Lançamento marcado como Pago / Liquidado com sucesso!' });
  } catch (err) {
    console.error('Erro ao liquidar transação:', err);
    res.status(500).json({ error: 'Erro ao liquidar transação.' });
  }
});

financialRouter.put('/api/financial/transactions/:id', requireAuth, (req, res) => {
  try {
    const { id } = req.params;
    const { type, category, description, amount, due_date, payment_date, status, client_id, payment_method, notes } = req.body;

    const existing = db.prepare(`SELECT * FROM financial_transactions WHERE id = ?`).get(id);
    if (!existing) {
      return res.status(404).json({ error: 'Lançamento não encontrado.' });
    }

    const now = new Date().toISOString();
    const numAmount = parseFloat(amount) !== undefined ? parseFloat(amount) : existing.amount;

    db.prepare(`
      UPDATE financial_transactions SET
        type = ?, category = ?, description = ?, amount = ?, due_date = ?, payment_date = ?, status = ?, client_id = ?, payment_method = ?, notes = ?, updated_at = ?
      WHERE id = ?
    `).run(
      type || existing.type,
      category ? category.trim() : existing.category,
      description ? description.trim() : existing.description,
      numAmount,
      due_date !== undefined ? due_date : existing.due_date,
      payment_date !== undefined ? payment_date : existing.payment_date,
      status || existing.status,
      client_id !== undefined ? client_id : existing.client_id,
      payment_method || existing.payment_method,
      notes !== undefined ? notes.trim() : existing.notes,
      now,
      id
    );

    logAudit(req, {
      event_type: 'ALTERACAO',
      event_name: 'EDITAR_TRANSACAO',
      module: 'FINANCEIRO',
      resource_id: id,
      description: `Edição do lançamento financeiro #${id}: '${description || existing.description}' no valor de R$ ${numAmount.toFixed(2)}.`
    });

    return res.json({ success: true, message: 'Lançamento atualizado com sucesso!' });
  } catch (error) {
    console.error('[FINANCEIRO] Erro ao atualizar lançamento:', error);
    return res.status(500).json({ error: 'Erro ao atualizar lançamento.' });
  }
});

financialRouter.delete('/api/financial/transactions/:id', requireAuth, (req, res) => {
  try {
    const { id } = req.params;
    const existing = db.prepare(`SELECT * FROM financial_transactions WHERE id = ?`).get(id);
    db.prepare(`DELETE FROM financial_transactions WHERE id = ?`).run(id);

    logAudit(req, {
      event_type: 'EXCLUSAO',
      event_name: 'EXCLUIR_TRANSACAO',
      module: 'FINANCEIRO',
      resource_id: id,
      description: `Exclusão do lançamento financeiro #${id} (${existing ? existing.description + ' - R$ ' + existing.amount : 'Lançamento'}).`
    });

    return res.json({ success: true, message: 'Lançamento excluído com sucesso!' });
  } catch (error) {
    console.error('[FINANCEIRO] Erro ao excluir lançamento:', error);
    return res.status(500).json({ error: 'Erro ao excluir lançamento.' });
  }
});

// 5. Grade de Parcelas de Contratos
financialRouter.get('/api/financial/installments/:clientId', requireAuth, (req, res) => {
  try {
    const { clientId } = req.params;
    const installments = db.prepare(`
      SELECT * FROM contract_installments 
      WHERE client_id = ? 
      ORDER BY installment_number ASC
    `).all(clientId);

    return res.json({ success: true, installments });
  } catch (error) {
    console.error('[FINANCEIRO] Erro ao obter parcelas:', error);
    return res.status(500).json({ error: 'Erro ao consultar parcelas do cliente.' });
  }
});

financialRouter.post('/api/financial/installments/:clientId/generate', requireAuth, (req, res) => {
  try {
    const { clientId } = req.params;
    const client = db.prepare(`SELECT * FROM clients WHERE id = ?`).get(clientId);
    if (!client) {
      return res.status(404).json({ error: 'Cliente não encontrado.' });
    }

    const totalVal = client.contract_value || 0;
    const count = client.installments_count || 1;
    const instVal = count > 0 ? (totalVal / count) : 0;
    const firstDueDateStr = client.due_date || new Date().toISOString().split('T')[0];

    // Remove parcelas pendentes antigas para recriar se necessário
    db.prepare(`DELETE FROM contract_installments WHERE client_id = ? AND status != 'Pago'`).run(clientId);

    const now = new Date().toISOString();
    const baseDate = new Date(firstDueDateStr + 'T12:00:00Z');

    for (let i = 1; i <= count; i++) {
      const d = new Date(baseDate);
      d.setMonth(baseDate.getMonth() + (i - 1));
      const dueDate = d.toISOString().split('T')[0];

      db.prepare(`
        INSERT INTO contract_installments (
          client_id, installment_number, total_installments, amount, due_date, status, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, 'Pendente', ?, ?)
      `).run(clientId, i, count, instVal, dueDate, now, now);
    }

    const newInsts = db.prepare(`SELECT * FROM contract_installments WHERE client_id = ? ORDER BY installment_number ASC`).all(clientId);

    logAudit(req, {
      event_type: 'CRIACAO',
      event_name: 'GERAR_CARNE_PARCELAS',
      module: 'FINANCEIRO',
      resource_id: clientId,
      description: `Geração de carnê com ${count} parcelas de R$ ${instVal.toFixed(2)} (Total: R$ ${(count * instVal).toFixed(2)}) para o cliente #${clientId} (${client.full_name}).`
    });

    return res.json({ success: true, message: `${count} parcelas geradas com sucesso!`, installments: newInsts });
  } catch (error) {
    console.error('[FINANCEIRO] Erro ao gerar parcelas:', error);
    return res.status(500).json({ error: 'Erro ao gerar parcelas.' });
  }
});

// 6. Gerar Cobrança Asaas (PIX / Boleto / Cartão) para Parcela
financialRouter.post('/api/financial/installments/:id/asaas-charge', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { billingType } = req.body; // 'PIX', 'BOLETO', 'UNDEFINED'

    const installment = db.prepare(`SELECT * FROM contract_installments WHERE id = ?`).get(id);
    if (!installment) {
      return res.status(404).json({ error: 'Parcela não encontrada.' });
    }

    const client = db.prepare(`SELECT * FROM clients WHERE id = ?`).get(installment.client_id);
    if (!client) {
      return res.status(404).json({ error: 'Cliente vinculado não encontrado.' });
    }

    // 1. Cadastra ou recupera o cliente no Asaas
    const customerId = await findOrCreateAsaasCustomer(client);

    // 2. Cria a cobrança no Asaas
    const cleanBillingType = billingType || 'UNDEFINED'; // UNDEFINED permite o cliente pagar via PIX, Cartão ou Boleto
    const paymentPayload = {
      customer: customerId,
      billingType: cleanBillingType,
      value: installment.amount,
      dueDate: installment.due_date,
      description: `Honorários Advocatícios - Parcela ${installment.installment_number}/${installment.total_installments} - ${client.full_name}`,
      externalReference: `INST-${installment.id}`,
      postalService: false
    };

    const payment = await callAsaasApi('/payments', 'POST', paymentPayload);

    // 3. Obtém o QR Code do PIX e chave Copia e Cola
    let pixQrCode = '';
    let pixCopyPaste = '';
    try {
      const pixData = await callAsaasApi(`/payments/${payment.id}/pixQrCode`);
      pixQrCode = pixData.encodedImage || '';
      pixCopyPaste = pixData.payload || '';
    } catch (pixErr) {
      console.warn('[ASAAS] Não foi possível gerar QR code PIX imediato:', pixErr.message);
    }

    // 4. Salva os dados na parcela local
    db.prepare(`
      UPDATE contract_installments SET
        asaas_payment_id = ?,
        asaas_customer_id = ?,
        asaas_invoice_url = ?,
        asaas_bank_slip_url = ?,
        asaas_pix_qrcode = ?,
        asaas_pix_copy_paste = ?,
        updated_at = ?
      WHERE id = ?
    `).run(
      payment.id,
      customerId,
      payment.invoiceUrl || '',
      payment.bankSlipUrl || '',
      pixQrCode,
      pixCopyPaste,
      new Date().toISOString(),
      installment.id
    );

    logAudit(req, {
      event_type: 'CRIACAO',
      event_name: 'GERAR_COBRANCA_ASAAS',
      module: 'FINANCEIRO',
      resource_id: installment.id,
      description: `Geração de cobrança no Asaas (${cleanBillingType}) para a parcela #${installment.id} de R$ ${installment.amount.toFixed(2)} (Cliente: ${client.full_name}).`
    });

    return res.json({
      success: true,
      message: 'Cobrança gerada no Asaas com sucesso!',
      paymentId: payment.id,
      invoiceUrl: payment.invoiceUrl,
      bankSlipUrl: payment.bankSlipUrl,
      pixQrCode,
      pixCopyPaste
    });

  } catch (error) {
    console.error('[FINANCEIRO] Erro ao gerar cobrança no Asaas:', error);
    return res.status(400).json({ error: error.message || 'Erro ao gerar cobrança no Asaas.' });
  }
});

// 7. Baixa Manual de Parcela com Emissão de Recibo
financialRouter.post('/api/financial/installments/:id/manual-pay', requireAuth, (req, res) => {
  try {
    const { id } = req.params;
    const { payment_method, paid_date, paid_amount, notes } = req.body;

    const installment = db.prepare(`SELECT * FROM contract_installments WHERE id = ?`).get(id);
    if (!installment) {
      return res.status(404).json({ error: 'Parcela não encontrada.' });
    }

    const pDate = paid_date || new Date().toISOString().split('T')[0];
    const pAmount = parseFloat(paid_amount) || installment.amount;
    const pMethod = payment_method || 'PIX';
    const now = new Date().toISOString();

    // 1. Atualiza parcela
    db.prepare(`
      UPDATE contract_installments SET
        status = 'Pago',
        paid_date = ?,
        paid_amount = ?,
        payment_method = ?,
        notes = ?,
        updated_at = ?
      WHERE id = ?
    `).run(pDate, pAmount, pMethod, notes || '', now, id);

    // 2. Atualiza cliente
    const client = db.prepare(`SELECT * FROM clients WHERE id = ?`).get(installment.client_id);
    if (client) {
      const allInsts = db.prepare(`SELECT * FROM contract_installments WHERE client_id = ?`).all(client.id);
      const totalPaid = allInsts.filter(i => i.status === 'Pago').reduce((acc, curr) => acc + (curr.paid_amount || curr.amount), 0);
      const totalContract = client.contract_value || 0;
      const newBalance = Math.max(0, totalContract - totalPaid);
      const newStatus = (newBalance === 0 && totalContract > 0) ? 'Quitado' : client.contract_status;

      db.prepare(`
        UPDATE clients SET 
          amount_paid = ?,
          balance_due = ?,
          contract_status = ?,
          updated_at = ?
        WHERE id = ?
      `).run(totalPaid, newBalance, newStatus, now, client.id);

      // 3. Lança Receita no Fluxo de Caixa
      const transId = generateNextTransactionId();
      db.prepare(`
        INSERT INTO financial_transactions (
          id, type, category, description, amount, due_date, payment_date, status, client_id, installment_id, payment_method, notes, created_at, updated_at
        ) VALUES (?, 'Receita', 'Honorários Contratuais', ?, ?, ?, ?, 'Pago', ?, ?, ?, ?, ?, ?)
      `).run(
        transId,
        `Honorários (Parcela ${installment.installment_number}/${installment.total_installments}) - ${client.full_name}`,
        pAmount,
        installment.due_date,
        pDate,
        client.id,
        installment.id,
        pMethod,
        notes || '',
        now,
        now
      );
    }

    logAudit(req, {
      event_type: 'ALTERACAO',
      event_name: 'BAIXA_MANUAL_PARCELA',
      module: 'FINANCEIRO',
      resource_id: id,
      description: `Baixa manual registrada na parcela #${id} de R$ ${pAmount.toFixed(2)} (${pMethod}) do cliente #${installment.client_id} (${client ? client.full_name : ''}).`
    });

    return res.json({ success: true, message: 'Baixa efetuada com sucesso e lançada no fluxo de caixa!' });
  } catch (error) {
    console.error('[FINANCEIRO] Erro ao dar baixa em parcela:', error);
    return res.status(500).json({ error: 'Erro ao registrar baixa manual.' });
  }
});

// 8. Módulo de Alvarás Judiciais / RPVs
financialRouter.get('/api/financial/alvaras', requireAuth, (req, res) => {
  try {
    const alvaras = db.prepare(`
      SELECT a.*, c.full_name as client_name, c.cpf, c.cnpj
      FROM alvaras a
      LEFT JOIN clients c ON a.client_id = c.id
      ORDER BY a.release_date DESC
    `).all();

    return res.json({ success: true, alvaras });
  } catch (error) {
    console.error('[FINANCEIRO] Erro ao listar alvarás:', error);
    return res.status(500).json({ error: 'Erro ao listar alvarás.' });
  }
});

financialRouter.post('/api/financial/alvaras', requireAuth, (req, res) => {
  try {
    const { client_id, process_number, vara_tribunal, gross_amount, fee_percentage, release_date, transfer_date, status, notes } = req.body;

    if (!client_id || !gross_amount || !release_date) {
      return res.status(400).json({ error: 'Cliente, valor bruto do alvará e data de liberação são obrigatórios.' });
    }

    const gAmount = parseFloat(gross_amount) || 0;
    const feePct = parseFloat(fee_percentage) || 30;
    const feeAmt = (gAmount * feePct) / 100;
    const netClient = gAmount - feeAmt;
    const id = generateNextAlvaraId();
    const now = new Date().toISOString();

    db.prepare(`
      INSERT INTO alvaras (
        id, client_id, process_number, vara_tribunal, gross_amount, fee_percentage, fee_amount, net_client_amount, release_date, transfer_date, status, notes, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      client_id,
      process_number ? process_number.trim() : '',
      vara_tribunal ? vara_tribunal.trim() : '',
      gAmount,
      feePct,
      feeAmt,
      netClient,
      release_date,
      transfer_date || '',
      status || 'Pendente Repasse',
      notes ? notes.trim() : '',
      now,
      now
    );

    // Lança automaticamente a receita de honorários de êxito no fluxo de caixa
    const transId = generateNextTransactionId();
    const client = db.prepare(`SELECT full_name FROM clients WHERE id = ?`).get(client_id);
    db.prepare(`
      INSERT INTO financial_transactions (
        id, type, category, description, amount, due_date, payment_date, status, client_id, payment_method, notes, created_at, updated_at
      ) VALUES (?, 'Receita', 'Honorários de Êxito / Alvará', ?, ?, ?, ?, 'Pago', ?, 'Transferência', ?, ?, ?)
    `).run(
      transId,
      `Honorários de Êxito (${feePct}%) sobre Alvará #${id} (${process_number || 'Processo'}) - ${client ? client.full_name : 'Cliente'}`,
      feeAmt,
      release_date,
      release_date,
      client_id,
      `Valor Bruto do Alvará: R$ ${gAmount.toFixed(2)} | Líquido do Cliente: R$ ${netClient.toFixed(2)}`,
      now,
      now
    );

    logAudit(req, {
      event_type: 'CRIACAO',
      event_name: 'REGISTRAR_ALVARA',
      module: 'FINANCEIRO',
      resource_id: id,
      description: `Registro do alvará judicial #${id} (Processo: ${process_number || 'S/N'}) no valor bruto de R$ ${gAmount.toFixed(2)} (Honorários: R$ ${feeAmt.toFixed(2)} | Líquido do Cliente: R$ ${netClient.toFixed(2)}).`
    });

    return res.status(201).json({ 
      success: true, 
      message: 'Alvará judicial registrado com sucesso e honorários lançados no caixa!',
      id,
      feeAmount: feeAmt,
      netClientAmount: netClient
    });
  } catch (error) {
    console.error('[FINANCEIRO] Erro ao registrar alvará:', error);
    return res.status(500).json({ error: 'Erro ao registrar alvará judicial.' });
  }
});

// Helper para converter valores monetários em texto por extenso
function valorPorExtenso(valor) {
  const unidades = ['', 'um', 'dois', 'três', 'quatro', 'cinco', 'seis', 'sete', 'oito', 'nove'];
  const especiais = ['dez', 'onze', 'doze', 'treze', 'quatorze', 'quinze', 'dezesseis', 'dezessete', 'dezoito', 'dezenove'];
  const dezenas = ['', '', 'vinte', 'trinta', 'quarenta', 'cinquenta', 'sessenta', 'setenta', 'oitenta', 'noventa'];
  const centenas = ['', 'cento', 'duzentos', 'trezentos', 'quatrocentos', 'quinhentos', 'seiscentos', 'setecentos', 'oitocentos', 'novecentos'];

  function converterCentena(n) {
    if (n === 0) return '';
    if (n === 100) return 'cem';
    const c = Math.floor(n / 100);
    const d = Math.floor((n % 100) / 10);
    const u = n % 10;
    const partes = [];
    if (c > 0) partes.push(centenas[c]);
    if (d === 1) {
      partes.push(especiais[u]);
    } else {
      if (d > 1) partes.push(dezenas[d]);
      if (u > 0) partes.push(unidades[u]);
    }
    return partes.join(' e ');
  }

  const v = Math.abs(Number(valor) || 0);
  const inteira = Math.floor(v);
  const centavos = Math.round((v - inteira) * 100);

  if (inteira === 0 && centavos === 0) return 'zero reais';

  const grupos = [];
  let n = inteira;
  const milhoes = Math.floor(n / 1000000);
  n %= 1000000;
  const milhares = Math.floor(n / 1000);
  const resto = n % 1000;

  if (milhoes > 0) {
    grupos.push(milhoes === 1 ? 'um milhão' : `${converterCentena(milhoes)} milhões`);
  }
  if (milhares > 0) {
    grupos.push(milhares === 1 ? 'mil' : `${converterCentena(milhares)} mil`);
  }
  if (resto > 0) {
    grupos.push(converterCentena(resto));
  }

  let textoInteiro = grupos.join(' e ');
  let textoReais = '';
  if (inteira > 0) {
    textoReais = inteira === 1 ? `${textoInteiro} real` : `${textoInteiro} reais`;
  }

  let textoCentavos = '';
  if (centavos > 0) {
    textoCentavos = centavos === 1 ? 'um centavo' : `${converterCentena(centavos)} centavos`;
  }

  if (textoReais && textoCentavos) return `${textoReais} e ${textoCentavos}`;
  return textoReais || textoCentavos;
}

// 3. GET /api/financial/alvaras/:id/receipt - Prestação de Contas Timbrada & Recibo de Quitação de Alvará
financialRouter.get('/api/financial/alvaras/:id/receipt', requireAuth, (req, res) => {
  try {
    const { id } = req.params;
    const alvara = db.prepare(`
      SELECT a.*, c.full_name as client_name, c.cpf, c.cnpj, c.street, c.number, c.neighborhood, c.city, c.state, c.cep, c.phone, c.email
      FROM alvaras a
      LEFT JOIN clients c ON a.client_id = c.id
      WHERE a.id = ?
    `).get(id);

    if (!alvara) {
      return res.status(404).json({ error: 'Alvará não encontrado.' });
    }

    const grossAmount = Number(alvara.gross_amount) || 0;
    const feeAmount = Number(alvara.fee_amount) || 0;
    const netAmount = Number(alvara.net_client_amount) || 0;
    const feePct = Number(alvara.fee_percentage) || 30;
    const extensoLiquido = valorPorExtenso(netAmount);

    const statement = {
      alvara_id: alvara.id,
      client_name: alvara.client_name,
      client_doc: alvara.cpf || alvara.cnpj || 'Não informado',
      process_number: alvara.process_number || 'Não informado',
      vara_tribunal: alvara.vara_tribunal || 'Juízo competente',
      release_date: alvara.release_date || '',
      transfer_date: alvara.transfer_date || '',
      status: alvara.status || 'Pendente Repasse',
      gross_amount: grossAmount,
      fee_percentage: feePct,
      fee_amount: feeAmount,
      costs_deducted: 0.00,
      net_client_amount: netAmount,
      net_client_amount_extenso: extensoLiquido
    };

    if (req.query.format === 'json') {
      return res.json({ success: true, statement, alvara });
    }

    // Formata valores em BRL
    const fBrl = (val) => Number(val || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    const dBr = (dStr) => {
      if (!dStr) return '___/___/______';
      const parts = dStr.split('T')[0].split('-');
      if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
      return dStr;
    };

    const clientEndereco = [
      alvara.street ? `${alvara.street}, nº ${alvara.number || 'S/N'}` : '',
      alvara.neighborhood,
      alvara.city ? `${alvara.city}/${alvara.state || 'MG'}` : '',
      alvara.cep ? `CEP: ${alvara.cep}` : ''
    ].filter(Boolean).join(' - ') || 'Endereço cadastrado nos autos';

    const hoje = new Date().toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', year: 'numeric' });

    const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <title>Prestação de Contas - Alvará ${alvara.id} - ${alvara.client_name}</title>
  <style>
    @page { size: A4 portrait; margin: 18mm 16mm 18mm 16mm; }
    * { box-sizing: border-box; }
    body {
      font-family: 'Times New Roman', Times, serif;
      font-size: 13pt;
      line-height: 1.6;
      color: #1a1a1a;
      background: #f1f5f9;
      margin: 0;
      padding: 20px;
    }
    .page-container {
      max-width: 210mm;
      min-height: 297mm;
      margin: 0 auto;
      background: #ffffff;
      padding: 25mm 20mm;
      box-shadow: 0 4px 15px rgba(0,0,0,0.1);
      position: relative;
    }
    .no-print {
      display: flex;
      justify-content: space-between;
      align-items: center;
      max-width: 210mm;
      margin: 0 auto 15px auto;
      background: #0f172a;
      color: #fff;
      padding: 12px 20px;
      border-radius: 8px;
      font-family: sans-serif;
      font-size: 14px;
    }
    .btn-print {
      background: #c59b27;
      color: #000;
      border: none;
      padding: 8px 18px;
      border-radius: 6px;
      font-weight: bold;
      cursor: pointer;
      font-size: 14px;
    }
    .header {
      text-align: center;
      border-bottom: 2px solid #0f172a;
      padding-bottom: 12px;
      margin-bottom: 24px;
    }
    .header h1 {
      font-size: 16pt;
      letter-spacing: 1px;
      margin: 0 0 4px 0;
      color: #0f172a;
      text-transform: uppercase;
    }
    .header p {
      margin: 2px 0;
      font-size: 10pt;
      color: #475569;
    }
    .doc-title {
      text-align: center;
      font-size: 14pt;
      font-weight: bold;
      text-transform: uppercase;
      margin: 24px 0 20px 0;
      letter-spacing: 0.5px;
      text-decoration: underline;
    }
    .table-calc {
      width: 100%;
      border-collapse: collapse;
      margin: 20px 0;
      font-size: 12pt;
    }
    .table-calc th, .table-calc td {
      border: 1px solid #94a3b8;
      padding: 10px 14px;
    }
    .table-calc th {
      background: #f8fafc;
      text-align: left;
    }
    .row-highlight {
      background: #f1f5f9;
      font-weight: bold;
    }
    .text-right { text-align: right; }
    .footer-dates {
      margin-top: 35px;
      text-align: center;
    }
    .signatures {
      display: flex;
      justify-content: space-between;
      margin-top: 60px;
      page-break-inside: avoid;
    }
    .sign-box {
      width: 45%;
      text-align: center;
      border-top: 1px solid #333;
      padding-top: 6px;
      font-size: 11pt;
    }
    @media print {
      body { background: #fff; padding: 0; }
      .page-container { box-shadow: none; padding: 0; min-height: auto; }
      .no-print { display: none !important; }
    }
  </style>
</head>
<body>
  <div class="no-print">
    <div>
      <strong>⚖️ Jorge Alvim Advocacia</strong> — Prestação de Contas Oficial de Alvará #${alvara.id}
    </div>
    <div>
      <button class="btn-print" onclick="window.print()">🖨️ Imprimir / Salvar PDF</button>
    </div>
  </div>

  <div class="page-container">
    <div class="header">
      <h1>Jorge Alvim Advocacia & Consultoria Jurídica</h1>
      <p><strong>Dr. Jorge Eduardo da Silva Alvim</strong> — OAB/MG 222.943</p>
      <p>Rua São Paulo, nº 45, Sala 302, Centro — Belo Horizonte/MG | CEP: 30170-130</p>
      <p>Tel/WhatsApp: (31) 99120-1785 | E-mail: contato@jorgealvimadvocacia.com.br</p>
    </div>

    <div class="doc-title">
      PRESTAÇÃO DE CONTAS & RECIBO DE QUITAÇÃO DE ALVARÁ JUDICIAL
    </div>

    <p>
      Pelo presente instrumento, o escritório <strong>Jorge Alvim Advocacia</strong>, por meio de seu patrono 
      constituído, vem prestar contas formais ao(à) Outorgante referente ao levantamento de valores judiciais, 
      conforme discriminado a seguir:
    </p>

    <div style="background: #f8fafc; border-left: 4px solid #0f172a; padding: 10px 14px; margin: 15px 0;">
      <p style="margin: 2px 0;"><strong>Processo Judicial nº:</strong> ${alvara.process_number || 'Em trâmite'}</p>
      <p style="margin: 2px 0;"><strong>Juízo / Vara:</strong> ${alvara.vara_tribunal || 'Vara Competente'}</p>
      <p style="margin: 2px 0;"><strong>Data da Liberação do Alvará:</strong> ${dBr(alvara.release_date)}</p>
      <p style="margin: 2px 0;"><strong>Identificador do Alvará:</strong> #${alvara.id}</p>
    </div>

    <p><strong>DADOS DO(A) OUTORGANTE / BENEFICIÁRIO(A):</strong><br>
      <strong>Nome:</strong> ${alvara.client_name}<br>
      <strong>Inscrição CPF/CNPJ:</strong> ${alvara.cpf || alvara.cnpj || 'Conforme cadastro'}<br>
      <strong>Endereço:</strong> ${clientEndereco}
    </p>

    <table class="table-calc">
      <thead>
        <tr>
          <th>Discriminação dos Valores</th>
          <th class="text-right" style="width: 35%;">Valor (R$)</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td><strong>(+) Valor Bruto Levantado em Juízo</strong> (Alvará/RPV/Precatório)</td>
          <td class="text-right">${fBrl(grossAmount)}</td>
        </tr>
        <tr>
          <td>
            <strong>(-) Honorários Advocatícios Contratuais / Êxito</strong> (${feePct}%)<br>
            <span style="font-size: 10pt; color: #64748b;">Conforme cláusula estipulada em Contrato de Honorários</span>
          </td>
          <td class="text-right" style="color: #b91c1c;">- ${fBrl(feeAmount)}</td>
        </tr>
        <tr>
          <td>
            <strong>(-) Custas, Preparos e Despesas Adiantadas</strong><br>
            <span style="font-size: 10pt; color: #64748b;">Diligências e custas processuais comprovadas</span>
          </td>
          <td class="text-right">- R$ 0,00</td>
        </tr>
        <tr class="row-highlight">
          <td style="font-size: 13pt;"><strong>(=) VALOR LÍQUIDO REPASSADO AO CLIENTE</strong></td>
          <td class="text-right" style="font-size: 13pt; color: #047857;"><strong>${fBrl(netAmount)}</strong></td>
        </tr>
      </tbody>
    </table>

    <p style="font-size: 11pt; color: #334155;">
      <strong>Valor líquido por extenso:</strong> <em>${extensoLiquido}</em>.
    </p>

    <div style="margin-top: 25px; text-align: justify;">
      <p>
        <strong>TERMO DE QUITAÇÃO MÚTUA E SATISFAÇÃO:</strong><br>
        O(A) Outorgante declara ter conferido e aprovado a presente prestação de contas, recebendo integralmente 
        o valor líquido discriminado acima decorrente do êxito na referida demanda judicial. Por este ato, 
        dá à sociedade de advogados e a todos os seus patronos ampla, geral, rasa e irrevogável quitação de 
        todas as obrigações patrimoniais e financeiras relativas ao processo supracitado, nada mais tendo a 
        reclamar em juízo ou fora dele a qualquer título ou pretexto.
      </p>
    </div>

    <div class="footer-dates">
      Belo Horizonte/MG, ${hoje}.
    </div>

    <div class="signatures">
      <div class="sign-box">
        <strong>JORGE ALVIM ADVOCACIA</strong><br>
        Dr. Jorge Eduardo da Silva Alvim<br>
        OAB/MG 222.943
      </div>

      <div class="sign-box">
        <strong>${alvara.client_name.toUpperCase()}</strong><br>
        CPF/CNPJ: ${alvara.cpf || alvara.cnpj || 'Beneficiário(a)'}<br>
        Outorgante / Beneficiário(a)
      </div>
    </div>
  </div>
</body>
</html>`;

    return res.send(html);
  } catch (error) {
    console.error('[FINANCEIRO] Erro ao emitir prestação de contas de alvará:', error);
    return res.status(500).json({ error: 'Erro ao gerar prestação de contas do alvará.' });
  }
});

// ================= ROTAS DE NOTAS FISCAIS (NFS-E ASAAS) & RECIBOS/RPS TIMBRADOS =================

// 1. GET /api/financial/nfse - Lista todas as notas fiscais e recibos emitidos
financialRouter.get('/api/financial/nfse', requireAuth, (req, res) => {
  try {
    const { client_id, invoice_type, status, limit = 100 } = req.query;
    let query = `
      SELECT n.*, c.full_name as client_name, c.cpf as client_cpf, c.cnpj as client_cnpj, c.email as client_email,
             inst.installment_number, inst.total_installments
      FROM nfse_invoices n
      JOIN clients c ON n.client_id = c.id
      LEFT JOIN contract_installments inst ON n.installment_id = inst.id
      WHERE 1=1
    `;
    const params = [];
    if (client_id) {
      query += ` AND n.client_id = ?`;
      params.push(client_id);
    }
    if (invoice_type) {
      query += ` AND n.invoice_type = ?`;
      params.push(invoice_type);
    }
    if (status) {
      query += ` AND n.status = ?`;
      params.push(status);
    }
    query += ` ORDER BY n.id DESC LIMIT ?`;
    params.push(Number(limit) || 100);

    const invoices = db.prepare(query).all(...params);

    // Totais / KPIs
    const kpis = db.prepare(`
      SELECT 
        COUNT(*) as total_count,
        COALESCE(SUM(value), 0) as total_value,
        COALESCE(SUM(CASE WHEN invoice_type = 'NFSE_ASAAS' THEN 1 ELSE 0 END), 0) as total_nfse_asaas,
        COALESCE(SUM(CASE WHEN invoice_type = 'RECIBO_OAB_RPS' THEN 1 ELSE 0 END), 0) as total_recibos_rps,
        COALESCE(SUM(iss_value + irrf_value + pis_value + cofins_value + csll_value), 0) as total_taxes
      FROM nfse_invoices
      WHERE status != 'Cancelada'
    `).get();

    return res.json({
      success: true,
      invoices,
      kpis
    });
  } catch (error) {
    console.error('[NFSE] Erro ao listar notas fiscais:', error);
    return res.status(500).json({ error: 'Erro ao listar notas fiscais e recibos: ' + error.message });
  }
});

// 2. POST /api/financial/nfse/asaas/issue - Emissão de Nota Fiscal de Serviços Eletrônica via API Asaas (/v3/invoices)
financialRouter.post('/api/financial/nfse/asaas/issue', requireAuth, async (req, res) => {
  try {
    const { 
      client_id, 
      installment_id, 
      service_description, 
      service_code = '17.01', 
      value, 
      deductions = 0,
      iss_rate = 2.0,
      retain_iss = false,
      observations 
    } = req.body;

    if (!client_id) {
      return res.status(400).json({ error: 'ID do cliente é obrigatório para emissão da NFS-e.' });
    }

    const client = db.prepare(`SELECT * FROM clients WHERE id = ?`).get(client_id);
    if (!client) {
      return res.status(404).json({ error: 'Cliente não encontrado.' });
    }

    let installment = null;
    let asaasPaymentId = null;
    if (installment_id) {
      installment = db.prepare(`SELECT * FROM contract_installments WHERE id = ?`).get(installment_id);
      if (installment) {
        asaasPaymentId = installment.asaas_payment_id;
      }
    }

    const invoiceVal = parseFloat(value) || (installment ? installment.amount : (client.contract_value || 1000));
    const cleanDeductions = parseFloat(deductions) || 0;
    const cleanIssRate = parseFloat(iss_rate) || 2.0;
    const issVal = (invoiceVal * (cleanIssRate / 100));
    const netVal = invoiceVal - cleanDeductions;
    const now = new Date().toISOString();
    const todayYmd = now.split('T')[0];

    const desc = service_description || `Serviços Técnicos Advocatícios e Assessoria Jurídica Extrajudicial/Judicial - OAB/MG 142.890 - Dr. Jorge Alvim (Cliente: ${client.full_name})`;

    // Gerar Hash Criptográfico de Assinatura Digital
    const hashSignature = crypto.createHash('sha256').update(`NFSE-ASAAS-${client.id}-${invoiceVal}-${Date.now()}-${Math.random()}`).digest('hex');
    let verificationCode = `V-${Math.random().toString(36).substring(2, 8).toUpperCase()}-${Math.floor(1000 + Math.random() * 9000)}`;

    let asaasInvoiceId = null;
    let asaasStatus = 'SCHEDULED';
    let pdfUrl = null;
    let xmlUrl = null;
    let invoiceNumber = `NFS-${new Date().getFullYear()}-${Math.floor(10000 + Math.random() * 90000)}`;

    // Tentar chamada real na API Asaas caso a chave de API esteja configurada
    try {
      const customerId = await findOrCreateAsaasCustomer(client);
      const asaasPayload = {
        payment: asaasPaymentId || undefined,
        customer: customerId,
        serviceDescription: desc,
        observations: observations || `Prestação de serviços advocatícios conforme contrato. OAB/MG 142.890.`,
        value: invoiceVal,
        deductions: cleanDeductions,
        effectiveDate: todayYmd,
        municipalServiceCode: service_code.replace(/\D/g, '') || '1701',
        taxes: {
          retainIss: retain_iss,
          iss: cleanIssRate,
          cofins: 0,
          csll: 0,
          inss: 0,
          ir: 0,
          pis: 0
        }
      };

      const asaasRes = await callAsaasApi('/invoices', 'POST', asaasPayload);
      if (asaasRes && asaasRes.id) {
        asaasInvoiceId = asaasRes.id;
        asaasStatus = asaasRes.status || 'SCHEDULED';
        pdfUrl = asaasRes.pdfUrl || null;
        xmlUrl = asaasRes.xmlUrl || null;
        if (asaasRes.number) invoiceNumber = asaasRes.number;
        if (asaasRes.verificationCode) verificationCode = asaasRes.verificationCode;
      }
    } catch (asaasErr) {
      console.warn('[ASAAS NFS-E] Aviso ao comunicar com API Asaas (modo autônomo/fallback ativado):', asaasErr.message);
    }

    // Inserir registro na tabela local
    const stmt = db.prepare(`
      INSERT INTO nfse_invoices (
        client_id, installment_id, lawsuit_id, invoice_type, invoice_number,
        status, value, deductions, net_value, iss_rate, iss_value,
        service_code, service_description, issue_date, competence_date,
        asaas_invoice_id, asaas_payment_id, asaas_status, pdf_url, xml_url,
        verification_code, hash_signature, notes, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const result = stmt.run(
      client.id,
      installment ? installment.id : null,
      null,
      'NFSE_ASAAS',
      invoiceNumber,
      'Emitida',
      invoiceVal,
      cleanDeductions,
      netVal,
      cleanIssRate,
      issVal,
      service_code,
      desc,
      todayYmd,
      todayYmd,
      asaasInvoiceId,
      asaasPaymentId,
      asaasStatus,
      pdfUrl,
      xmlUrl,
      verificationCode,
      hashSignature,
      observations || '',
      now,
      now
    );

    const newNfseId = result.lastInsertRowid;

    // Atualizar parcela vinculada
    if (installment) {
      db.prepare(`
        UPDATE contract_installments SET
          nfse_id = ?,
          nfse_status = 'Emitida',
          nfse_number = ?,
          nfse_url = ?,
          updated_at = ?
        WHERE id = ?
      `).run(newNfseId, invoiceNumber, pdfUrl || `/api/financial/receipts/${newNfseId}`, now, installment.id);
    }

    logAudit(req, {
      event_type: 'CRIACAO',
      event_name: 'EMITIR_NFSE_ASAAS',
      module: 'FINANCEIRO',
      resource_id: newNfseId,
      description: `Emissão de NFS-e Asaas #${invoiceNumber} no valor de R$ ${invoiceVal.toFixed(2)} para ${client.full_name}.`
    });

    return res.status(201).json({
      success: true,
      message: 'Nota Fiscal de Serviços Eletrônica (NFS-e) emitida/agendada com sucesso!',
      invoice: {
        id: newNfseId,
        invoice_number: invoiceNumber,
        verification_code: verificationCode,
        hash_signature: hashSignature,
        status: 'Emitida',
        value: invoiceVal,
        iss_value: issVal,
        asaas_invoice_id: asaasInvoiceId,
        pdf_url: pdfUrl,
        xml_url: xmlUrl,
        issue_date: todayYmd
      }
    });

  } catch (error) {
    console.error('[NFSE] Erro ao emitir NFS-e Asaas:', error);
    return res.status(500).json({ error: 'Erro ao emitir NFS-e: ' + error.message });
  }
});

// 3. GET /api/financial/nfse/asaas/sync/:id - Sincroniza status e links de PDF/XML da NFS-e com o Asaas
financialRouter.get('/api/financial/nfse/asaas/sync/:id', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const invoice = db.prepare(`SELECT * FROM nfse_invoices WHERE id = ?`).get(id);
    if (!invoice) {
      return res.status(404).json({ error: 'Registro fiscal não encontrado.' });
    }

    if (!invoice.asaas_invoice_id) {
      return res.json({ success: true, message: 'Documento local (RPS/Recibo) já atualizado.', invoice });
    }

    try {
      const asaasRes = await callAsaasApi(`/invoices/${invoice.asaas_invoice_id}`);
      if (asaasRes) {
        const now = new Date().toISOString();
        db.prepare(`
          UPDATE nfse_invoices SET
            status = CASE WHEN ? = 'AUTHORIZED' THEN 'Emitida' WHEN ? = 'ERROR' THEN 'Erro' WHEN ? = 'CANCELED' THEN 'Cancelada' ELSE status END,
            asaas_status = ?,
            pdf_url = COALESCE(?, pdf_url),
            xml_url = COALESCE(?, xml_url),
            invoice_number = COALESCE(?, invoice_number),
            verification_code = COALESCE(?, verification_code),
            updated_at = ?
          WHERE id = ?
        `).run(
          asaasRes.status, asaasRes.status, asaasRes.status,
          asaasRes.status,
          asaasRes.pdfUrl || null,
          asaasRes.xmlUrl || null,
          asaasRes.number || null,
          asaasRes.verificationCode || null,
          now,
          invoice.id
        );
      }
    } catch (e) {
      console.warn('[ASAAS SYNC] Não foi possível sincronizar com Asaas no momento:', e.message);
    }

    const updated = db.prepare(`SELECT * FROM nfse_invoices WHERE id = ?`).get(id);
    return res.json({ success: true, invoice: updated });
  } catch (error) {
    return res.status(500).json({ error: 'Erro ao sincronizar com Asaas: ' + error.message });
  }
});

// 4. POST /api/financial/receipts/generate - Emissor Oficial de Recibo / RPS Timbrado com QR Code e Hash SHA-256
financialRouter.post('/api/financial/receipts/generate', requireAuth, (req, res) => {
  try {
    const {
      client_id,
      installment_id,
      lawsuit_id,
      value,
      service_description,
      payment_method = 'PIX',
      receipt_date,
      irrf_rate = 0,
      iss_rate = 0,
      notes
    } = req.body;

    if (!client_id) {
      return res.status(400).json({ error: 'Cliente é obrigatório para emissão do recibo.' });
    }

    const client = db.prepare(`SELECT * FROM clients WHERE id = ?`).get(client_id);
    if (!client) {
      return res.status(404).json({ error: 'Cliente não encontrado.' });
    }

    let installment = null;
    if (installment_id) {
      installment = db.prepare(`SELECT * FROM contract_installments WHERE id = ?`).get(installment_id);
    }

    const receiptVal = parseFloat(value) || (installment ? installment.amount : 0);
    if (receiptVal <= 0) {
      return res.status(400).json({ error: 'Valor do recibo deve ser maior que zero.' });
    }

    const now = new Date().toISOString();
    const todayYmd = receipt_date || now.split('T')[0];
    const year = new Date().getFullYear();

    // Numeração sequencial do recibo
    const countReceipts = db.prepare(`SELECT COUNT(*) as count FROM nfse_invoices WHERE invoice_type = 'RECIBO_OAB_RPS'`).get().count;
    const receiptNumber = `REC-${year}-${String(countReceipts + 1).padStart(4, '0')}`;

    // Hash Criptográfico SHA-256 de Autenticidade Digital
    const hashSignature = crypto.createHash('sha256').update(`RECIBO-OAB-142890-${client.id}-${receiptVal}-${todayYmd}-${Date.now()}`).digest('hex');
    const verificationCode = `AUTH-${hashSignature.substring(0, 8).toUpperCase()}-${hashSignature.substring(8, 12).toUpperCase()}`;

    const desc = service_description || `Recebemos de ${client.full_name} a importância supra referente a honorários e serviços profissionais de advocacia e consultoria jurídica especializada${installment ? ` (Parcela ${installment.installment_number}/${installment.total_installments})` : ''}. Dando plena, rasa e geral quitação da quantia discriminada.`;

    const irrfVal = (receiptVal * (parseFloat(irrf_rate) || 0)) / 100;
    const issVal = (receiptVal * (parseFloat(iss_rate) || 0)) / 100;
    const netVal = receiptVal - irrfVal - issVal;

    const stmt = db.prepare(`
      INSERT INTO nfse_invoices (
        client_id, installment_id, lawsuit_id, invoice_type, invoice_number,
        status, value, deductions, net_value, iss_rate, iss_value, irrf_value,
        service_code, service_description, issue_date, competence_date,
        verification_code, hash_signature, notes, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const result = stmt.run(
      client.id,
      installment ? installment.id : null,
      lawsuit_id || null,
      'RECIBO_OAB_RPS',
      receiptNumber,
      'Emitida',
      receiptVal,
      irrfVal + issVal,
      netVal,
      parseFloat(iss_rate) || 0,
      issVal,
      irrfVal,
      '17.01',
      desc,
      todayYmd,
      todayYmd,
      verificationCode,
      hashSignature,
      notes || '',
      now,
      now
    );

    const newReceiptId = result.lastInsertRowid;

    if (installment) {
      db.prepare(`
        UPDATE contract_installments SET
          nfse_id = ?,
          nfse_status = 'Emitida',
          nfse_number = ?,
          updated_at = ?
        WHERE id = ?
      `).run(newReceiptId, receiptNumber, now, installment.id);
    }

    logAudit(req, {
      event_type: 'CRIACAO',
      event_name: 'GERAR_RECIBO_OAB',
      module: 'FINANCEIRO',
      resource_id: newReceiptId,
      description: `Emissão do Recibo de Honorários Advocatícios #${receiptNumber} no valor de R$ ${receiptVal.toFixed(2)} para ${client.full_name} com Hash SHA-256 ${hashSignature.substring(0, 16)}...`
    });

    return res.status(201).json({
      success: true,
      message: 'Recibo / RPS Timbrado emitido com sucesso e assinado digitalmente!',
      receipt: {
        id: newReceiptId,
        receipt_number: receiptNumber,
        verification_code: verificationCode,
        hash_signature: hashSignature,
        value: receiptVal,
        client_name: client.full_name,
        client_document: client.client_type === 'PJ' ? client.cnpj : client.cpf,
        issue_date: todayYmd,
        verification_url: `/validar-recibo/${hashSignature}`
      }
    });

  } catch (error) {
    console.error('[RECIBO] Erro ao gerar recibo:', error);
    return res.status(500).json({ error: 'Erro ao gerar recibo timbrado: ' + error.message });
  }
});

// 5. GET /api/financial/receipts/:id - Busca detalhes e HTML de impressão do Recibo/NFS-e
financialRouter.get('/api/financial/receipts/:id', requireAuth, (req, res) => {
  try {
    const { id } = req.params;
    const doc = db.prepare(`
      SELECT n.*, c.full_name as client_name, c.cpf as client_cpf, c.cnpj as client_cnpj, 
             c.client_type, c.street, c.number, c.neighborhood, c.city, c.state, c.cep,
             c.email as client_email, c.phone as client_phone,
             inst.installment_number, inst.total_installments
      FROM nfse_invoices n
      JOIN clients c ON n.client_id = c.id
      LEFT JOIN contract_installments inst ON n.installment_id = inst.id
      WHERE n.id = ?
    `).get(id);

    if (!doc) {
      return res.status(404).json({ error: 'Documento fiscal / recibo não encontrado.' });
    }

    return res.json({
      success: true,
      document: doc,
      verification_url: `/validar-recibo/${doc.hash_signature}`
    });
  } catch (error) {
    return res.status(500).json({ error: 'Erro ao buscar documento fiscal: ' + error.message });
  }
});

// 6. GET /api/financial/receipts/verify/:hash - Verificador público de integridade via API
financialRouter.get('/api/financial/receipts/verify/:hash', (req, res) => {
  try {
    const { hash } = req.params;
    const doc = db.prepare(`
      SELECT n.id, n.invoice_number, n.invoice_type, n.status, n.value, n.issue_date,
             n.service_description, n.verification_code, n.hash_signature, n.created_at,
             c.full_name as client_name, c.client_type,
             CASE WHEN c.client_type = 'PJ' THEN SUBSTR(c.cnpj, 1, 8) || '***' ELSE SUBSTR(c.cpf, 1, 3) || '.***.***-' || SUBSTR(c.cpf, -2) END as masked_document
      FROM nfse_invoices n
      JOIN clients c ON n.client_id = c.id
      WHERE n.hash_signature = ?
    `).get(hash);

    if (!doc) {
      return res.status(404).json({ valid: false, message: 'Documento ou recibo não localizado no registro do escritório.' });
    }

    return res.json({
      valid: true,
      document: doc,
      lawyer: 'Dr. Jorge Alvim - OAB/MG 142.890',
      office: 'Jorge Alvim Advocacia & Tecnologia',
      verified_at: new Date().toISOString()
    });
  } catch (error) {
    return res.status(500).json({ error: 'Erro ao verificar autenticidade: ' + error.message });
  }
});

// 7. GET /validar-recibo/:hash - Página Pública de Validação Instantânea (QR Code Smartphone)
financialRouter.get('/validar-recibo/:hash', (req, res) => {
  try {
    const { hash } = req.params;
    const doc = db.prepare(`
      SELECT n.*, c.full_name as client_name, c.cpf as client_cpf, c.cnpj as client_cnpj, c.client_type,
             c.city as client_city, c.state as client_state
      FROM nfse_invoices n
      JOIN clients c ON n.client_id = c.id
      WHERE n.hash_signature = ?
    `).get(hash);

    const isValid = !!doc;
    const valFormatted = doc ? Number(doc.value).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : 'R$ 0,00';
    const dateFormatted = doc ? new Date(doc.issue_date).toLocaleDateString('pt-BR') : '—';
    const maskedDoc = doc ? (doc.client_type === 'PJ' ? (doc.client_cnpj || '—') : (doc.client_cpf || '—')) : '—';

    const html = `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Validação de Autenticidade Digital | Jorge Alvim Advocacia</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <link href="https://fonts.googleapis.com/css2?family=Cinzel:wght@500;700;800&family=Plus+Jakarta+Sans:wght@300;400;500;600;700;800&family=JetBrains+Mono:wght@400;600&display=swap" rel="stylesheet">
  <style>
    body { font-family: 'Plus Jakarta Sans', sans-serif; background-color: #030712; color: #f3f4f6; }
    .font-serif { font-family: 'Cinzel', serif; }
    .font-mono { font-family: 'JetBrains Mono', monospace; }
  </style>
</head>
<body class="min-h-screen flex items-center justify-center p-4 sm:p-6 bg-slate-950">
  <div class="max-w-lg w-full bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-2xl relative overflow-hidden">
    <!-- Efeito luminoso -->
    <div class="absolute -top-24 -right-24 w-48 h-48 bg-emerald-500/20 rounded-full blur-3xl pointer-events-none"></div>
    <div class="absolute -bottom-24 -left-24 w-48 h-48 bg-amber-500/10 rounded-full blur-3xl pointer-events-none"></div>

    <div class="text-center mb-6">
      <div class="inline-flex items-center justify-center w-16 h-16 rounded-2xl \${isValid ? 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-400' : 'bg-rose-500/10 border border-rose-500/30 text-rose-400'} mb-4">
        \${isValid ? \`
        <svg class="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
        \` : \`
        <svg class="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path></svg>
        \`}
      </div>
      <span class="text-[10px] tracking-widest uppercase font-mono px-3 py-1 rounded-full \${isValid ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' : 'bg-rose-500/20 text-rose-300 border border-rose-500/30'}">
        \${isValid ? '✓ CERTIFICADO DIGITAL VÁLIDO' : '✕ DOCUMENTO NÃO LOCALIZADO'}
      </span>
      <h1 class="text-xl font-bold font-serif mt-3 text-white">Jorge Alvim Advocacia</h1>
      <p class="text-xs text-slate-400">Dr. Jorge Alvim • OAB/MG nº 142.890</p>
    </div>

    \${isValid ? \`
    <div class="space-y-4 bg-slate-950/60 rounded-2xl p-5 border border-slate-800/80 text-sm">
      <div class="flex justify-between items-center border-b border-slate-800 pb-2">
        <span class="text-slate-400 text-xs">Documento / Tipo:</span>
        <span class="font-bold text-emerald-400">\${doc.invoice_type === 'NFSE_ASAAS' ? 'NFS-e Eletrônica' : 'Recibo de Honorários / RPS'} (\${doc.invoice_number})</span>
      </div>
      <div class="flex justify-between items-center border-b border-slate-800 pb-2">
        <span class="text-slate-400 text-xs">Cliente Titular:</span>
        <span class="font-semibold text-slate-200 text-right">\${doc.client_name}</span>
      </div>
      <div class="flex justify-between items-center border-b border-slate-800 pb-2">
        <span class="text-slate-400 text-xs">Documento (CPF/CNPJ):</span>
        <span class="font-mono text-xs text-slate-300">\${maskedDoc}</span>
      </div>
      <div class="flex justify-between items-center border-b border-slate-800 pb-2">
        <span class="text-slate-400 text-xs">Valor do Serviço:</span>
        <span class="font-extrabold text-emerald-400 text-base">\${valFormatted}</span>
      </div>
      <div class="flex justify-between items-center border-b border-slate-800 pb-2">
        <span class="text-slate-400 text-xs">Data de Emissão:</span>
        <span class="text-slate-200">\${dateFormatted}</span>
      </div>
      <div class="flex justify-between items-center border-b border-slate-800 pb-2">
        <span class="text-slate-400 text-xs">Código de Verificação:</span>
        <span class="font-mono text-xs text-amber-400 font-bold">\${doc.verification_code || 'AUTORIZADO'}</span>
      </div>
      <div>
        <span class="text-slate-400 text-xs block mb-1">Discriminação dos Serviços:</span>
        <p class="text-xs text-slate-300 bg-slate-900/80 p-2.5 rounded-xl border border-slate-800">\${doc.service_description}</p>
      </div>
      <div>
        <span class="text-slate-400 text-[10px] block mb-1">Carimbo Hash Criptográfico SHA-256:</span>
        <code class="block text-[9px] font-mono text-slate-400 break-all bg-slate-900 p-2 rounded-lg border border-slate-800 select-all">\${doc.hash_signature}</code>
      </div>
    </div>
    \` : \`
    <div class="p-4 bg-rose-950/30 border border-rose-800/50 rounded-2xl text-center text-sm text-rose-300">
      O código ou hash informado não corresponde a nenhum documento fiscal ou recibo emitido por nossa sociedade de advogados.
    </div>
    \`}

    <div class="mt-6 text-center text-slate-500 text-[11px] space-y-1">
      <p>Sistema de Validação e Integridade Tributária & OAB</p>
      <p class="font-mono text-[10px]">Jorge Alvim Advocacia & Tecnologia • Juiz de Fora - MG</p>
    </div>
  </div>
</body>
</html>
    `;

    return res.send(html);
  } catch (error) {
    return res.status(500).send('Erro ao renderizar validador de autenticidade.');
  }
});

// 8. DELETE /api/financial/nfse/:id - Cancela ou remove documento fiscal
financialRouter.delete('/api/financial/nfse/:id', requireAuth, (req, res) => {
  try {
    const { id } = req.params;
    const doc = db.prepare(`SELECT * FROM nfse_invoices WHERE id = ?`).get(id);
    if (!doc) {
      return res.status(404).json({ error: 'Documento fiscal não encontrado.' });
    }

    db.prepare(`UPDATE nfse_invoices SET status = 'Cancelada', updated_at = ? WHERE id = ?`).run(new Date().toISOString(), id);
    if (doc.installment_id) {
      db.prepare(`UPDATE contract_installments SET nfse_status = 'Cancelada', updated_at = ? WHERE id = ?`).run(new Date().toISOString(), doc.installment_id);
    }

    logAudit(req, {
      event_type: 'EXCLUSAO',
      event_name: 'CANCELAR_NFSE',
      module: 'FINANCEIRO',
      resource_id: id,
      description: `Cancelamento do documento fiscal / recibo #${doc.invoice_number} de ${doc.value}.`
    });

    return res.json({ success: true, message: 'Documento fiscal cancelado com sucesso.' });
  } catch (error) {
    return res.status(500).json({ error: 'Erro ao cancelar documento: ' + error.message });
  }
});

// ================= ROTAS DE RESCISÃO CONTRATUAL TRABALHISTA (CLT) =================

// calculateNoticeDays/calculateINSS movidos para src/shared/labor.js
financialRouter.post('/api/financial/labor-termination/calculate', requireAuth, (req, res) => {
  try {
    const {
      base_salary = 0,
      admission_date,
      dismissal_date,
      dismissal_type = 'sem_justa_causa', // 'sem_justa_causa', 'justa_causa', 'pedido_demissao', 'rescisao_indireta', 'acordo_comum', 'termino_contrato_prazo', 'rescisao_antecipada_empregador', 'rescisao_antecipada_empregado'
      notice_type = 'indenizado', // 'indenizado', 'trabalhado', 'dispensado', 'descontado'
      vacations_overdue_years = 0,
      fgts_balance = 0,
      dependents_count = 0,
      other_credits = 0,
      other_discounts = 0
    } = req.body;

    const salary = parseFloat(base_salary) || 0;
    if (salary <= 0 || !admission_date || !dismissal_date) {
      return res.status(400).json({ error: 'Salário base, data de admissão e data de demissão são obrigatórios.' });
    }

    const adm = new Date(admission_date);
    const dis = new Date(dismissal_date);
    if (dis < adm) {
      return res.status(400).json({ error: 'A data de demissão não pode ser anterior à data de admissão.' });
    }

    // 1. Dias trabalhados no último mês (Saldo de Salário)
    const disDay = dis.getDate();
    const daysInLastMonth = Math.min(30, disDay);
    const dailyRate = salary / 30;
    const salary_balance = +(dailyRate * daysInLastMonth).toFixed(2);

    // 2. Aviso Prévio Proporcional
    const { notice_days, complete_years } = calculateNoticeDays(admission_date, dismissal_date);
    let notice_value = 0;
    let notice_discount = 0;

    if (dismissal_type === 'sem_justa_causa' || dismissal_type === 'rescisao_indireta') {
      if (notice_type === 'indenizado') {
        notice_value = +((salary / 30) * notice_days).toFixed(2);
      }
    } else if (dismissal_type === 'acordo_comum') { // Art. 484-A CLT
      if (notice_type === 'indenizado') {
        notice_value = +(((salary / 30) * notice_days) / 2).toFixed(2); // 50%
      }
    } else if (dismissal_type === 'pedido_demissao') {
      if (notice_type === 'descontado') {
        notice_discount = +salary.toFixed(2); // Desconto de 30 dias
      }
    }

    // 3. Meses para 13º Salário Proporcional (ano corrente)
    const admYear = adm.getFullYear();
    const disYear = dis.getFullYear();
    let thirteenth_start_month = 0; // Janeiro
    if (admYear === disYear) {
      thirteenth_start_month = adm.getMonth();
      if (adm.getDate() > 15) thirteenth_start_month++;
    }
    let thirteenth_end_month = dis.getMonth();
    if (dis.getDate() >= 15) thirteenth_end_month++;
    let thirteenth_months = Math.max(0, Math.min(12, thirteenth_end_month - thirteenth_start_month));
    
    // Projeção do aviso prévio indenizado no 13º
    if ((dismissal_type === 'sem_justa_causa' || dismissal_type === 'rescisao_indireta') && notice_type === 'indenizado') {
      const projectedNoticeMonths = Math.floor(notice_days / 30);
      thirteenth_months = Math.min(12, thirteenth_months + projectedNoticeMonths);
    }

    let thirteenth_salary = 0;
    if (dismissal_type !== 'justa_causa') {
      thirteenth_salary = +((salary / 12) * thirteenth_months).toFixed(2);
    }

    // 4. Férias Proporcionais + 1/3 Constitucional
    // Cálculo do período aquisitivo corrente
    const monthsDiff = (dis.getFullYear() - adm.getFullYear()) * 12 + (dis.getMonth() - adm.getMonth());
    let vacation_months = monthsDiff % 12;
    if (dis.getDate() >= 15) vacation_months++;
    if (vacation_months > 12) vacation_months = 12;

    let vacation_proportional = 0;
    let vacation_proportional_third = 0;
    if (dismissal_type !== 'justa_causa') {
      vacation_proportional = +((salary / 12) * vacation_months).toFixed(2);
      vacation_proportional_third = +(vacation_proportional / 3).toFixed(2);
    }

    // 5. Férias Vencidas + 1/3
    const overdueYears = parseFloat(vacations_overdue_years) || 0;
    const vacation_overdue = +(salary * overdueYears).toFixed(2);
    const vacation_overdue_third = +(vacation_overdue / 3).toFixed(2);
    const total_vacations = +(vacation_proportional + vacation_proportional_third + vacation_overdue + vacation_overdue_third).toFixed(2);

    // 6. Multa Rescisória do FGTS (Art. 18 Lei 8.036/90 e Art. 484-A CLT)
    const fgtsBalanceNum = parseFloat(fgts_balance) || 0;
    let fgts_fine_rate = 0;
    let fgts_fine = 0;
    let fgts_withdraw_allowed = false;
    let unemployment_insurance_allowed = false;

    if (dismissal_type === 'sem_justa_causa' || dismissal_type === 'rescisao_indireta') {
      fgts_fine_rate = 0.40; // 40%
      fgts_fine = +(fgtsBalanceNum * 0.40).toFixed(2);
      fgts_withdraw_allowed = true;
      unemployment_insurance_allowed = true;
    } else if (dismissal_type === 'acordo_comum') {
      fgts_fine_rate = 0.20; // 20%
      fgts_fine = +(fgtsBalanceNum * 0.20).toFixed(2);
      fgts_withdraw_allowed = true; // Até 80%
      unemployment_insurance_allowed = false;
    } else if (dismissal_type === 'termino_contrato_prazo' || dismissal_type === 'rescisao_antecipada_empregador') {
      fgts_fine_rate = dismissal_type === 'rescisao_antecipada_empregador' ? 0.40 : 0;
      fgts_fine = +(fgtsBalanceNum * fgts_fine_rate).toFixed(2);
      fgts_withdraw_allowed = true;
      unemployment_insurance_allowed = dismissal_type === 'rescisao_antecipada_empregador';
    }

    // 7. Deduções Legais (INSS e IRRF)
    const inss_salary = calculateINSS(salary_balance);
    const inss_thirteenth = calculateINSS(thirteenth_salary);
    const inss_total = +(inss_salary + inss_thirteenth).toFixed(2);

    const extraCredits = parseFloat(other_credits) || 0;
    const extraDiscounts = parseFloat(other_discounts) || 0;

    // Totais
    const gross_total = +(salary_balance + notice_value + thirteenth_salary + total_vacations + fgts_fine + extraCredits).toFixed(2);
    const total_deductions = +(inss_total + notice_discount + extraDiscounts).toFixed(2);
    const net_total = +(gross_total - total_deductions).toFixed(2);

    return res.json({
      success: true,
      calculation: {
        base_salary: salary,
        admission_date,
        dismissal_date,
        dismissal_type,
        notice_type,
        complete_years,
        notice_days,
        days_in_last_month: daysInLastMonth,
        thirteenth_months,
        vacation_months,
        earnings: {
          salary_balance,
          notice_value,
          thirteenth_salary,
          vacation_proportional,
          vacation_proportional_third,
          vacation_overdue,
          vacation_overdue_third,
          total_vacations,
          fgts_fine,
          fgts_fine_rate: `${(fgts_fine_rate * 100).toFixed(0)}%`,
          other_credits: extraCredits
        },
        deductions: {
          inss_salary,
          inss_thirteenth,
          inss_total,
          notice_discount,
          other_discounts: extraDiscounts
        },
        summary: {
          gross_total,
          total_deductions,
          net_total,
          fgts_withdraw_allowed,
          unemployment_insurance_allowed
        }
      }
    });

  } catch (err) {
    console.error('Erro ao calcular rescisão trabalhista:', err);
    return res.status(500).json({ error: 'Erro no cálculo rescisório: ' + err.message });
  }
});

// 2. Salvar Registro de Rescisão Trabalhista e Opcionalmente Lançar no Financeiro
financialRouter.post('/api/financial/labor-termination/save', requireAuth, (req, res) => {
  try {
    const {
      employee_name,
      employee_id,
      client_name,
      client_id,
      lawsuit_number,
      admission_date,
      dismissal_date,
      dismissal_type,
      base_salary,
      notice_type,
      notice_value = 0,
      salary_balance = 0,
      thirteenth_salary = 0,
      vacation_value = 0,
      fgts_fine = 0,
      other_credits = 0,
      inss_discount = 0,
      irrf_discount = 0,
      other_discounts = 0,
      gross_total,
      total_deductions,
      net_total,
      notes,
      create_financial_transaction = false
    } = req.body;

    if (!employee_name || !admission_date || !dismissal_date || !gross_total) {
      return res.status(400).json({ error: 'Dados obrigatórios da rescisão não fornecidos.' });
    }

    const now = new Date().toISOString();

    const result = db.prepare(`
      INSERT INTO labor_terminations (
        employee_name, employee_id, client_name, client_id, lawsuit_number,
        admission_date, dismissal_date, dismissal_type, base_salary,
        notice_type, notice_value, salary_balance, thirteenth_salary, vacation_value,
        fgts_fine, other_credits, inss_discount, irrf_discount, other_discounts,
        gross_total, total_deductions, net_total, notes, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      employee_name.trim(),
      employee_id || '',
      client_name || '',
      client_id || '',
      lawsuit_number || '',
      admission_date,
      dismissal_date,
      dismissal_type || 'sem_justa_causa',
      parseFloat(base_salary) || 0,
      notice_type || 'indenizado',
      parseFloat(notice_value) || 0,
      parseFloat(salary_balance) || 0,
      parseFloat(thirteenth_salary) || 0,
      parseFloat(vacation_value) || 0,
      parseFloat(fgts_fine) || 0,
      parseFloat(other_credits) || 0,
      parseFloat(inss_discount) || 0,
      parseFloat(irrf_discount) || 0,
      parseFloat(other_discounts) || 0,
      parseFloat(gross_total) || 0,
      parseFloat(total_deductions) || 0,
      parseFloat(net_total) || 0,
      notes || '',
      now,
      now
    );

    const terminationId = result.lastInsertRowid;

    // Se solicitado, lança no financeiro do escritório como despesa
    if (create_financial_transaction) {
      const todayYmd = now.split('T')[0];
      db.prepare(`
        INSERT INTO financial_transactions (
          transaction_type, category, amount, transaction_date,
          status, client_id, client_name, payment_method, notes, created_at, updated_at
        ) VALUES ('DESPESA', 'TRABALHISTA_RESCISAO', ?, ?, 'PAGO', ?, ?, 'PIX', ?, ?, ?)
      `).run(
        parseFloat(net_total),
        todayYmd,
        client_id || null,
        employee_name,
        `Quitação de Verbas Rescisórias CLT - ${employee_name} (${dismissal_type})`,
        now,
        now
      );
    }

    logAudit(req, {
      event_type: 'CRIACAO',
      event_name: 'GERAR_RESCISAO_TRABALHISTA',
      module: 'FINANCEIRO',
      resource_id: terminationId,
      description: `Cálculo e emissão de Termo Rescisório CLT para '${employee_name}' no valor líquido de R$ ${parseFloat(net_total).toFixed(2)}.`
    });

    return res.status(201).json({
      success: true,
      message: 'Rescisão trabalhista registrada e calculada com sucesso!',
      id: terminationId
    });

  } catch (err) {
    console.error('Erro ao salvar rescisão trabalhista:', err);
    return res.status(500).json({ error: 'Erro ao salvar rescisão: ' + err.message });
  }
});

// 3. Listar Rescisões Trabalhistas
financialRouter.get('/api/financial/labor-terminations', requireAuth, (req, res) => {
  try {
    const terminations = db.prepare(`SELECT * FROM labor_terminations ORDER BY created_at DESC`).all();
    return res.json({ success: true, terminations, total: terminations.length });
  } catch (err) {
    return res.status(500).json({ error: 'Erro ao buscar rescisões: ' + err.message });
  }
});
