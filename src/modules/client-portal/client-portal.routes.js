/**
 * Módulo PORTAL DO CLIENTE (client-portal) — cadastro, login, perfil, senha,
 * recuperação, mensagens. Extraído do server.js.
 */
import express from 'express';
import crypto from 'node:crypto';
import { db } from '../../config/db.js';
import { requireClientAuth, createClientSession, clientSessions, destroySession } from '../../middleware/auth.js';
import { logAudit } from '../../middleware/audit.js';
import { hashPassword, verifyPassword, isStrongHash } from '../../shared/password-crypto.js';
import { validatePassword } from '../../shared/password-policy.js';
import { generateNextClientFullId } from '../../shared/ids.js';
import { sendLawyerWhatsAppNotification } from '../../shared/notify.js';
import { loginRateLimit } from '../../shared/login-guard.js';

export const clientPortalRouter = express.Router();

clientPortalRouter.post('/api/client-portal/register', (req, res) => {
  try {
    const {
      client_type,
      full_name,
      cpf,
      rg,
      cnpj,
      email,
      phone,
      password,
      street,
      number,
      neighborhood,
      city,
      state,
      cep,
      complement,
      filiation_father,
      filiation_mother,
      nationality,
      marital_status,
      profession,
      rep_name,
      rep_cpf,
      rep_rg,
      rep_street,
      rep_number,
      rep_neighborhood,
      rep_city,
      rep_state,
      rep_cep,
      rep_complement
    } = req.body;

    if (!full_name || !phone || !email || !password) {
      return res.status(400).json({ error: 'Nome/Razão Social, E-mail, Telefone/WhatsApp e Senha são obrigatórios.' });
    }

    {
      const pol = validatePassword(password);
      if (!pol.ok) return res.status(400).json({ error: pol.error });
    }

    const type = client_type === 'PJ' ? 'PJ' : 'PF';
    const cleanEmail = email.trim().toLowerCase();
    const cleanCpf = cpf ? cpf.replace(/\D/g, '') : null;
    const cleanCnpj = cnpj ? cnpj.replace(/\D/g, '') : null;

    if (type === 'PF' && !cpf) {
      return res.status(400).json({ error: 'O CPF é obrigatório para cadastro de Pessoa Física.' });
    }
    if (type === 'PJ' && !cnpj) {
      return res.status(400).json({ error: 'O CNPJ é obrigatório para cadastro de Pessoa Jurídica.' });
    }

    // Verificar se já existe cliente com o mesmo CPF, CNPJ ou E-mail
    let existing = null;
    if (type === 'PF' && cleanCpf) {
      existing = db.prepare(`SELECT id, password_hash FROM clients WHERE REPLACE(REPLACE(REPLACE(cpf, '.', ''), '-', ''), ' ', '') = ?`).get(cleanCpf);
    } else if (type === 'PJ' && cleanCnpj) {
      existing = db.prepare(`SELECT id, password_hash FROM clients WHERE REPLACE(REPLACE(REPLACE(REPLACE(cnpj, '.', ''), '/', ''), '-', ''), ' ', '') = ?`).get(cleanCnpj);
    }

    if (!existing && cleanEmail) {
      existing = db.prepare(`SELECT id, password_hash FROM clients WHERE LOWER(TRIM(email)) = ?`).get(cleanEmail);
    }

    const { hash, salt } = hashPassword(password);
    const now = new Date().toISOString();

    let clientId;

    if (existing) {
      // Se o cliente já foi cadastrado previamente pelo advogado ou formulário, apenas define/atualiza a senha e dados
      clientId = existing.id;
      db.prepare(`
        UPDATE clients SET
          client_type = ?,
          full_name = ?,
          cpf = COALESCE(?, cpf),
          rg = COALESCE(?, rg),
          cnpj = COALESCE(?, cnpj),
          email = ?,
          phone = ?,
          password_hash = ?,
          salt = ?,
          street = COALESCE(?, street),
          number = COALESCE(?, number),
          neighborhood = COALESCE(?, neighborhood),
          city = COALESCE(?, city),
          state = COALESCE(?, state),
          cep = COALESCE(?, cep),
          complement = COALESCE(?, complement),
          filiation_father = COALESCE(?, filiation_father),
          filiation_mother = COALESCE(?, filiation_mother),
          nationality = COALESCE(?, nationality),
          marital_status = COALESCE(?, marital_status),
          profession = COALESCE(?, profession),
          rep_name = COALESCE(?, rep_name),
          rep_cpf = COALESCE(?, rep_cpf),
          rep_rg = COALESCE(?, rep_rg),
          rep_street = COALESCE(?, rep_street),
          rep_number = COALESCE(?, rep_number),
          rep_neighborhood = COALESCE(?, rep_neighborhood),
          rep_city = COALESCE(?, rep_city),
          rep_state = COALESCE(?, rep_state),
          rep_cep = COALESCE(?, rep_cep),
          rep_complement = COALESCE(?, rep_complement),
          updated_at = ?
        WHERE id = ?
      `).run(
        type,
        full_name.trim(),
        cpf || null,
        rg || null,
        cnpj || null,
        cleanEmail,
        phone.trim(),
        hash,
        salt,
        street || null,
        number || null,
        neighborhood || null,
        city || null,
        state || null,
        cep || null,
        complement || null,
        filiation_father || null,
        filiation_mother || null,
        nationality || 'brasileiro(a)',
        marital_status || 'solteiro(a)',
        profession || null,
        rep_name || null,
        rep_cpf || null,
        rep_rg || null,
        rep_street || null,
        rep_number || null,
        rep_neighborhood || null,
        rep_city || null,
        rep_state || null,
        rep_cep || null,
        rep_complement || null,
        now,
        clientId
      );
    } else {
      // Novo cadastro do cliente
      clientId = generateNextClientFullId();
      db.prepare(`
        INSERT INTO clients (
          id, client_type, full_name, cpf, rg, cnpj, email, phone, password_hash, salt,
          street, number, neighborhood, city, state, cep, complement,
          filiation_father, filiation_mother, nationality, marital_status, profession,
          rep_name, rep_cpf, rep_rg, rep_street, rep_number, rep_neighborhood, rep_city, rep_state, rep_cep, rep_complement,
          email_notifications, created_at, updated_at
        ) VALUES (
          ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
          ?, ?, ?, ?, ?, ?, ?,
          ?, ?, ?, ?, ?,
          ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
          1, ?, ?
        )
      `).run(
        clientId,
        type,
        full_name.trim(),
        cpf || null,
        rg || null,
        cnpj || null,
        cleanEmail,
        phone.trim(),
        hash,
        salt,
        street || null,
        number || null,
        neighborhood || null,
        city || null,
        state || null,
        cep || null,
        complement || null,
        filiation_father || null,
        filiation_mother || null,
        nationality || 'brasileiro(a)',
        marital_status || 'solteiro(a)',
        profession || null,
        rep_name || null,
        rep_cpf || null,
        rep_rg || null,
        rep_street || null,
        rep_number || null,
        rep_neighborhood || null,
        rep_city || null,
        rep_state || null,
        rep_cep || null,
        rep_complement || null,
        now,
        now
      );

      // Enviar mensagem de boas-vindas do escritório
      db.prepare(`
        INSERT INTO client_messages (client_id, sender, sender_name, subject, message, created_at)
        VALUES (?, 'office', 'Dr. Jorge Alvim Advocacia', 'Boas-vindas ao Portal do Cliente', 'Seja bem-vindo(a) ao seu Portal de Atendimento e Acompanhamento Processual! Por aqui você pode acompanhar todas as movimentações dos seus processos, consultar seu contrato e nos enviar mensagens.', ?)
      `).run(clientId, now);
    }

    const clientRow = db.prepare(`SELECT * FROM clients WHERE id = ?`).get(clientId);
    const token = createClientSession(clientRow);

    logAudit(req, {
      event_type: 'CRIACAO',
      event_name: 'CADASTRO_PORTAL_CLIENTE',
      module: 'PORTAL_CLIENTE',
      resource_id: clientId,
      user_cpf: clientRow.cpf || clientRow.cnpj,
      user_name: clientRow.full_name,
      user_role: 'client',
      description: `Novo cadastro pelo Portal do Cliente: ${clientRow.full_name} (${clientRow.client_type === 'PJ' ? 'CNPJ: ' + clientRow.cnpj : 'CPF: ' + clientRow.cpf}).`
    });

    // 📲 Dispara notificação por WhatsApp ao Advogado (Dr. Jorge Alvim)
    const clientTypeLabel = clientRow.client_type === 'PJ' ? 'Pessoa Jurídica (PJ)' : 'Pessoa Física (PF)';
    const docInfo = clientRow.client_type === 'PJ' ? `🏢 CNPJ: ${clientRow.cnpj}` : `👤 CPF: ${clientRow.cpf}`;
    const dateStr = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });

    const notifyMsg = 
      `🔔 *NOVO CLIENTE CADASTRADO NO PORTAL!*\n\n` +
      `👤 *Nome:* ${clientRow.full_name}\n` +
      `🆔 *Código:* #${clientRow.id}\n` +
      `🏷️ *Tipo:* ${clientTypeLabel}\n` +
      `${docInfo}\n` +
      `📱 *WhatsApp:* ${clientRow.phone}\n` +
      `✉️ *E-mail:* ${clientRow.email}\n` +
      `📍 *Cidade/UF:* ${clientRow.city || 'Juiz de Fora'} / ${clientRow.state || 'MG'}\n` +
      `📅 *Data:* ${dateStr}\n\n` +
      `👉 *Ver no Painel:* http://localhost:3000/painel`;

    sendLawyerWhatsAppNotification(notifyMsg, { clientId: clientRow.id, type: 'PORTAL_REGISTER' });

    res.status(201).json({
      success: true,
      message: 'Cadastro realizado com sucesso! Bem-vindo(a) ao Portal do Cliente.',
      token,
      client: {
        id: clientRow.id,
        full_name: clientRow.full_name,
        email: clientRow.email,
        phone: clientRow.phone,
        client_type: clientRow.client_type,
        cpf: clientRow.cpf,
        cnpj: clientRow.cnpj
      }
    });

  } catch (err) {
    console.error('Erro no cadastro do cliente:', err);
    res.status(500).json({ error: 'Erro ao processar cadastro do cliente: ' + err.message });
  }
});

clientPortalRouter.post('/api/client-portal/login', loginRateLimit, (req, res) => {
  try {
    const { login, password } = req.body;
    if (!login || !password) {
      return res.status(400).json({ error: 'Informe seu CPF, CNPJ ou E-mail e a senha cadastrada.' });
    }

    const cleanInput = login.trim();
    const cleanDigits = cleanInput.replace(/\D/g, '');
    const cleanEmail = cleanInput.toLowerCase();

    // Busca flexível do cliente por CPF, CNPJ, Telefone, E-mail ou ID
    let client = null;
    if (cleanDigits.length >= 8) {
      client = db.prepare(`
        SELECT * FROM clients 
        WHERE REPLACE(REPLACE(REPLACE(cpf, '.', ''), '-', ''), ' ', '') = ?
           OR REPLACE(REPLACE(REPLACE(REPLACE(cnpj, '.', ''), '/', ''), '-', ''), ' ', '') = ?
           OR REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(phone, '(', ''), ')', ''), '-', ''), ' ', ''), '+', '') LIKE ?
           OR id = ?
      `).get(cleanDigits, cleanDigits, `%${cleanDigits}%`, cleanInput);
    }

    if (!client) {
      client = db.prepare(`
        SELECT * FROM clients 
        WHERE LOWER(TRIM(email)) = ?
           OR id = ?
           OR LOWER(TRIM(full_name)) LIKE ?
      `).get(cleanEmail, cleanInput, `%${cleanEmail}%`);
    }

    if (!client) {
      logAudit(req, {
        event_type: 'AUTENTICACAO',
        event_name: 'FALHA_LOGIN_CLIENTE',
        module: 'PORTAL_CLIENTE',
        user_name: cleanInput,
        user_role: 'client',
        description: `Tentativa de login no portal com identificador não encontrado: '${cleanInput}'.`
      });
      return res.status(401).json({ error: 'Cadastro não encontrado com este CPF, CNPJ, Telefone ou E-mail.' });
    }

    // Se o cliente ainda não tem senha cadastrada, define a senha digitada se cumprir
    // a política (4–12 caracteres); caso contrário aplica a senha padrão de 1º acesso.
    if (!client.password_hash || !client.salt) {
      if (password && validatePassword(password).ok) {
        const newPass = hashPassword(password);
        db.prepare(`UPDATE clients SET password_hash = ?, salt = ?, updated_at = ? WHERE id = ?`).run(newPass.hash, newPass.salt, new Date().toISOString(), client.id);
        client.password_hash = newPass.hash;
        client.salt = newPass.salt;
      } else {
        const defPass = hashPassword('123456');
        db.prepare(`UPDATE clients SET password_hash = ?, salt = ?, updated_at = ? WHERE id = ?`).run(defPass.hash, defPass.salt, new Date().toISOString(), client.id);
        client.password_hash = defPass.hash;
        client.salt = defPass.salt;
      }
    }

    // SEGURANÇA: sem senha universal. Valida apenas a senha real do cliente.
    const valid = verifyPassword(password, client.password_hash, client.salt);

    if (!valid) {
      logAudit(req, {
        event_type: 'AUTENTICACAO',
        event_name: 'FALHA_LOGIN_CLIENTE',
        module: 'PORTAL_CLIENTE',
        resource_id: client.id,
        user_cpf: client.cpf || client.cnpj,
        user_name: client.full_name,
        user_role: 'client',
        description: `Tentativa de login com senha incorreta para o cliente ${client.full_name}.`
      });
      return res.status(401).json({ error: 'Senha incorreta. Verifique suas credenciais.' });
    }

    // Upgrade transparente do hash para o formato forte, se necessário.
    try {
      if (!isStrongHash(password, client.password_hash, client.salt)) {
        const up = hashPassword(password);
        db.prepare(`UPDATE clients SET password_hash = ?, salt = ?, updated_at = ? WHERE id = ?`).run(up.hash, up.salt, new Date().toISOString(), client.id);
      }
    } catch (e) { /* best-effort */ }

    const token = createClientSession(client);

    logAudit(req, {
      event_type: 'AUTENTICACAO',
      event_name: 'LOGIN_PORTAL_CLIENTE',
      module: 'PORTAL_CLIENTE',
      resource_id: client.id,
      user_cpf: client.cpf || client.cnpj,
      user_name: client.full_name,
      user_role: 'client',
      description: `Cliente ${client.full_name} autenticou-se com sucesso no Portal do Cliente.`
    });

    res.json({
      success: true,
      message: 'Login efetuado com sucesso!',
      token,
      client: {
        id: client.id,
        full_name: client.full_name,
        email: client.email,
        phone: client.phone,
        client_type: client.client_type,
        cpf: client.cpf,
        cnpj: client.cnpj
      }
    });

  } catch (err) {
    console.error('Erro no login do cliente:', err);
    res.status(500).json({ error: 'Erro interno ao autenticar cliente.' });
  }
});

// 3. Obter Perfil Completo, Processos, Contrato e Financeiro do Cliente Logado
clientPortalRouter.get('/api/client-portal/me', requireClientAuth, (req, res) => {
  try {
    const clientId = req.client.clientId;
    const client = db.prepare(`
      SELECT 
        id, client_type, full_name, cpf, rg, cnpj, email, phone, social_media,
        street, number, neighborhood, city, state, cep, complement,
        filiation_father, filiation_mother, nationality, marital_status, profession,
        rep_name, rep_cpf, rep_rg, rep_street, rep_number, rep_neighborhood, rep_city, rep_state, rep_cep, rep_complement,
        contract_value, installments_count, installment_value, due_date, amount_paid, balance_due, invoice_number, contract_status,
        email_notifications, created_at, updated_at
      FROM clients WHERE id = ?
    `).get(clientId);

    if (!client) {
      return res.status(404).json({ error: 'Cliente não encontrado.' });
    }

    // Processos Judiciais e Andamentos
    const lawsuits = db.prepare(`
      SELECT * FROM lawsuits WHERE client_id = ? ORDER BY created_at DESC
    `).all(clientId);

    const lawsuitsWithMovements = lawsuits.map(lawsuit => {
      const movements = db.prepare(`
        SELECT * FROM lawsuit_movements WHERE lawsuit_id = ? ORDER BY movement_date DESC, created_at DESC
      `).all(lawsuit.id);
      return { ...lawsuit, movements };
    });

    // Parcelas do Contrato & Cobranças
    const installments = db.prepare(`
      SELECT * FROM contract_installments WHERE client_id = ? ORDER BY installment_number ASC
    `).all(clientId);

    // Mensagens Trocadas com o Escritório
    const messages = db.prepare(`
      SELECT * FROM client_messages WHERE client_id = ? ORDER BY created_at ASC
    `).all(clientId);

    res.json({
      success: true,
      client,
      lawsuits: lawsuitsWithMovements,
      installments,
      messages
    });

  } catch (err) {
    console.error('Erro ao buscar dados do cliente logado:', err);
    res.status(500).json({ error: 'Erro ao carregar dados do portal do cliente.' });
  }
});

// 4. Atualizar Dados Cadastrais pelo Próprio Cliente
clientPortalRouter.put('/api/client-portal/profile', requireClientAuth, (req, res) => {
  try {
    const clientId = req.client.clientId;
    const {
      full_name,
      rg,
      phone,
      email,
      street,
      number,
      neighborhood,
      city,
      state,
      cep,
      complement,
      filiation_father,
      filiation_mother,
      nationality,
      marital_status,
      profession,
      rep_name,
      rep_cpf,
      rep_rg,
      rep_street,
      rep_number,
      rep_neighborhood,
      rep_city,
      rep_state,
      rep_cep,
      rep_complement,
      email_notifications
    } = req.body;

    if (!full_name || !phone || !email) {
      return res.status(400).json({ error: 'Nome, E-mail e Telefone são obrigatórios.' });
    }

    const now = new Date().toISOString();

    db.prepare(`
      UPDATE clients SET
        full_name = ?,
        rg = COALESCE(?, rg),
        phone = ?,
        email = ?,
        street = ?,
        number = ?,
        neighborhood = ?,
        city = ?,
        state = ?,
        cep = ?,
        complement = ?,
        filiation_father = ?,
        filiation_mother = ?,
        nationality = ?,
        marital_status = ?,
        profession = ?,
        rep_name = ?,
        rep_cpf = ?,
        rep_rg = ?,
        rep_street = ?,
        rep_number = ?,
        rep_neighborhood = ?,
        rep_city = ?,
        rep_state = ?,
        rep_cep = ?,
        rep_complement = ?,
        email_notifications = COALESCE(?, email_notifications),
        updated_at = ?
      WHERE id = ?
    `).run(
      full_name.trim(),
      rg || null,
      phone.trim(),
      email.trim().toLowerCase(),
      street || null,
      number || null,
      neighborhood || null,
      city || null,
      state || null,
      cep || null,
      complement || null,
      filiation_father || null,
      filiation_mother || null,
      nationality || 'brasileiro(a)',
      marital_status || 'solteiro(a)',
      profession || null,
      rep_name || null,
      rep_cpf || null,
      rep_rg || null,
      rep_street || null,
      rep_number || null,
      rep_neighborhood || null,
      rep_city || null,
      rep_state || null,
      rep_cep || null,
      rep_complement || null,
      email_notifications !== undefined ? (email_notifications ? 1 : 0) : 1,
      now,
      clientId
    );

    logAudit(req, {
      event_type: 'ALTERACAO',
      event_name: 'ATUALIZAR_PERFIL_CLIENTE',
      module: 'PORTAL_CLIENTE',
      resource_id: clientId,
      user_name: full_name.trim(),
      user_role: 'client',
      description: `O cliente ${full_name.trim()} atualizou seus próprios dados cadastrais e endereço no portal.`
    });

    res.json({ success: true, message: 'Dados cadastrais atualizados com sucesso!' });

  } catch (err) {
    console.error('Erro ao atualizar perfil do cliente:', err);
    res.status(500).json({ error: 'Erro ao atualizar dados: ' + err.message });
  }
});

// 5. Alterar Senha (Cliente Logado)
clientPortalRouter.post('/api/client-portal/change-password', requireClientAuth, (req, res) => {
  try {
    const clientId = req.client.clientId;
    const { current_password, new_password } = req.body;

    if (!current_password || !new_password) {
      return res.status(400).json({ error: 'Informe a senha atual e a nova senha.' });
    }

    {
      const pol = validatePassword(new_password);
      if (!pol.ok) return res.status(400).json({ error: pol.error });
    }

    const client = db.prepare(`SELECT full_name, cpf, cnpj, password_hash, salt FROM clients WHERE id = ?`).get(clientId);
    if (!client || !client.password_hash || !client.salt) {
      return res.status(400).json({ error: 'Cadastro de senha inválido.' });
    }

    const valid = verifyPassword(current_password, client.password_hash, client.salt);
    if (!valid) {
      return res.status(401).json({ error: 'A senha atual digitada está incorreta.' });
    }

    const { hash, salt } = hashPassword(new_password);
    db.prepare(`UPDATE clients SET password_hash = ?, salt = ?, updated_at = ? WHERE id = ?`).run(hash, salt, new Date().toISOString(), clientId);

    logAudit(req, {
      event_type: 'ALTERACAO',
      event_name: 'ALTERAR_SENHA_CLIENTE',
      module: 'PORTAL_CLIENTE',
      resource_id: clientId,
      user_name: client.full_name,
      user_cpf: client.cpf || client.cnpj,
      user_role: 'client',
      description: `O cliente ${client.full_name} alterou sua senha de acesso ao portal com sucesso.`
    });

    res.json({ success: true, message: 'Sua senha foi alterada com sucesso!' });

  } catch (err) {
    console.error('Erro ao alterar senha do cliente:', err);
    res.status(500).json({ error: 'Erro ao alterar senha.' });
  }
});

// 6. Solicitar Recuperação de Senha (Gera Código de Recuperação)
clientPortalRouter.post('/api/client-portal/forgot-password', (req, res) => {
  try {
    const { login } = req.body;
    if (!login) {
      return res.status(400).json({ error: 'Informe seu CPF, CNPJ ou E-mail para recuperar a senha.' });
    }

    const cleanInput = login.trim();
    const cleanDigits = cleanInput.replace(/\D/g, '');
    const cleanEmail = cleanInput.toLowerCase();

    let client = null;
    if (cleanDigits.length >= 11) {
      client = db.prepare(`
        SELECT id, email, full_name, cpf, cnpj FROM clients 
        WHERE REPLACE(REPLACE(REPLACE(cpf, '.', ''), '-', ''), ' ', '') = ?
           OR REPLACE(REPLACE(REPLACE(REPLACE(cnpj, '.', ''), '/', ''), '-', ''), ' ', '') = ?
      `).get(cleanDigits, cleanDigits);
    }

    if (!client) {
      client = db.prepare(`SELECT id, email, full_name, cpf, cnpj FROM clients WHERE LOWER(TRIM(email)) = ?`).get(cleanEmail);
    }

    if (!client) {
      return res.status(404).json({ error: 'Não encontramos nenhum cadastro com este CPF/CNPJ ou E-mail.' });
    }

    // Código de 6 dígitos
    const resetCode = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString(); // 1 hora

    db.prepare(`
      UPDATE clients SET reset_token = ?, reset_token_expires = ? WHERE id = ?
    `).run(resetCode, expiresAt, client.id);

    console.log(`🔐 [RESET SENHA] Código gerado para cliente ${client.full_name} (${client.id}): ${resetCode}`);

    logAudit(req, {
      event_type: 'AUTENTICACAO',
      event_name: 'SOLICITAR_RESET_SENHA',
      module: 'PORTAL_CLIENTE',
      resource_id: client.id,
      user_name: client.full_name,
      user_cpf: client.cpf || client.cnpj,
      user_role: 'client',
      description: `Código de recuperação de senha gerado para o cliente ${client.full_name}.`
    });

    res.json({
      success: true,
      message: `Código de redefinição enviado com sucesso! Utilize o código ${resetCode} para definir sua nova senha.`,
      reset_code_demo: resetCode
    });

  } catch (err) {
    console.error('Erro na solicitação de recuperação de senha:', err);
    res.status(500).json({ error: 'Erro ao gerar solicitação de recuperação de senha.' });
  }
});

// 7. Redefinir Senha com Código
clientPortalRouter.post('/api/client-portal/reset-password', (req, res) => {
  try {
    const { login, reset_code, new_password } = req.body;
    if (!login || !reset_code || !new_password) {
      return res.status(400).json({ error: 'Informe o identificador (CPF/E-mail), código de recuperação e a nova senha.' });
    }

    {
      const pol = validatePassword(new_password);
      if (!pol.ok) return res.status(400).json({ error: pol.error });
    }

    const cleanInput = login.trim();
    const cleanDigits = cleanInput.replace(/\D/g, '');
    const cleanEmail = cleanInput.toLowerCase();

    let client = null;
    if (cleanDigits.length >= 11) {
      client = db.prepare(`
        SELECT * FROM clients 
        WHERE REPLACE(REPLACE(REPLACE(cpf, '.', ''), '-', ''), ' ', '') = ?
           OR REPLACE(REPLACE(REPLACE(REPLACE(cnpj, '.', ''), '/', ''), '-', ''), ' ', '') = ?
      `).get(cleanDigits, cleanDigits);
    }

    if (!client) {
      client = db.prepare(`SELECT * FROM clients WHERE LOWER(TRIM(email)) = ?`).get(cleanEmail);
    }

    if (!client) {
      return res.status(404).json({ error: 'Cadastro não encontrado.' });
    }

    if (!client.reset_token || client.reset_token !== reset_code.trim()) {
      return res.status(400).json({ error: 'Código de recuperação inválido ou incorreto.' });
    }

    if (new Date(client.reset_token_expires) < new Date()) {
      return res.status(400).json({ error: 'Código de recuperação expirado. Solicite um novo código.' });
    }

    const { hash, salt } = hashPassword(new_password);
    db.prepare(`
      UPDATE clients SET 
        password_hash = ?, 
        salt = ?, 
        reset_token = NULL, 
        reset_token_expires = NULL, 
        updated_at = ? 
      WHERE id = ?
    `).run(hash, salt, new Date().toISOString(), client.id);

    logAudit(req, {
      event_type: 'ALTERACAO',
      event_name: 'REDEFINIR_SENHA_CODIGO',
      module: 'PORTAL_CLIENTE',
      resource_id: client.id,
      user_name: client.full_name,
      user_cpf: client.cpf || client.cnpj,
      user_role: 'client',
      description: `Senha do cliente ${client.full_name} redefinida com sucesso via código de verificação.`
    });

    res.json({ success: true, message: 'Senha redefinida com sucesso! Você já pode fazer login.' });

  } catch (err) {
    console.error('Erro ao redefinir senha:', err);
    res.status(500).json({ error: 'Erro ao redefinir senha.' });
  }
});

// 8. Excluir Conta do Cliente (Direito do Titular LGPD)
clientPortalRouter.delete('/api/client-portal/account', requireClientAuth, (req, res) => {
  try {
    const clientId = req.client.clientId;
    const { password } = req.body;

    if (!password) {
      return res.status(400).json({ error: 'Confirme sua senha para validar a exclusão da conta.' });
    }

    const client = db.prepare(`SELECT * FROM clients WHERE id = ?`).get(clientId);
    if (!client || !verifyPassword(password, client.password_hash, client.salt)) {
      return res.status(401).json({ error: 'Senha incorreta. Não foi possível autorizar a exclusão.' });
    }

    logAudit(req, {
      event_type: 'EXCLUSAO',
      event_name: 'EXCLUSAO_CONTA_LGPD',
      module: 'PORTAL_CLIENTE',
      resource_id: clientId,
      user_name: client.full_name,
      user_cpf: client.cpf || client.cnpj,
      user_role: 'client',
      description: `EXCLUSÃO DEFINITIVA DE CONTA E DADOS solicitada pelo titular ${client.full_name} (${client.cpf || client.cnpj}) conforme art. 18 da LGPD.`
    });

    // Excluir cliente e dados vinculados em cascata
    db.prepare(`DELETE FROM clients WHERE id = ?`).run(clientId);

    // Invalidar sessões ativas
    for (const [token, session] of clientSessions.entries()) {
      if (session.clientId === clientId) {
        destroySession(token);
      }
    }

    res.json({ success: true, message: 'Sua conta e dados foram excluídos com sucesso do sistema.' });

  } catch (err) {
    console.error('Erro ao excluir conta do cliente:', err);
    res.status(500).json({ error: 'Erro ao excluir conta: ' + err.message });
  }
});

// 9. Enviar Mensagem para o Escritório
clientPortalRouter.post('/api/client-portal/messages', requireClientAuth, (req, res) => {
  try {
    const clientId = req.client.clientId;
    const clientName = req.client.fullName;
    const { subject, message } = req.body;

    if (!message || !message.trim()) {
      return res.status(400).json({ error: 'Digite o conteúdo da mensagem.' });
    }

    const now = new Date().toISOString();
    const result = db.prepare(`
      INSERT INTO client_messages (client_id, sender, sender_name, subject, message, created_at)
      VALUES (?, 'client', ?, ?, ?, ?)
    `).run(clientId, clientName, (subject || 'Mensagem do Cliente').trim(), message.trim(), now);

    logAudit(req, {
      event_type: 'CRIACAO',
      event_name: 'ENVIAR_MENSAGEM_PORTAL',
      module: 'PORTAL_CLIENTE',
      resource_id: clientId,
      user_name: clientName,
      user_role: 'client',
      description: `Mensagem enviada pelo cliente ${clientName}: '${subject || 'Mensagem'}' ao escritório.`
    });

    res.status(201).json({
      success: true,
      message: 'Mensagem enviada ao Dr. Jorge Alvim com sucesso!',
      messageId: result.lastInsertRowid
    });

  } catch (err) {
    console.error('Erro ao registrar mensagem do cliente:', err);
    res.status(500).json({ error: 'Erro ao enviar mensagem.' });
  }
});

// 10. Atualizar Notificações por E-mail do Andamento Processual
clientPortalRouter.patch('/api/client-portal/email-notifications', requireClientAuth, (req, res) => {
  try {
    const clientId = req.client.clientId;
    const { enabled } = req.body;
    const val = enabled ? 1 : 0;

    db.prepare(`UPDATE clients SET email_notifications = ?, updated_at = ? WHERE id = ?`).run(val, new Date().toISOString(), clientId);
    res.json({ success: true, message: `Notificações por e-mail ${val ? 'ativadas' : 'desativadas'} com sucesso!` });

  } catch (err) {
    res.status(500).json({ error: 'Erro ao atualizar preferência de notificação.' });
  }
});
