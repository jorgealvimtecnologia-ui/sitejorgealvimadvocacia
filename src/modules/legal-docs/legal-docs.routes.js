/**
 * ==============================================================================
 * MÓDULO GERADOR DE KIT INICIAL & DOCUMENTOS JURÍDICOS (FASE 3)
 * ==============================================================================
 * 1. Procuração Ad Judicia et Extra (art. 105 CPC)
 * 2. Contrato de Prestação de Serviços & Honorários Advocatícios
 * 3. Declaração de Hipossuficiência Econômica (Justiça Gratuita - art. 98 CPC)
 * ==============================================================================
 */

import express from 'express';
import crypto from 'node:crypto';
import { db } from '../../config/db.js';
import { requireAuth } from '../../middleware/auth.js';
import { logAudit } from '../../middleware/audit.js';

export const legalDocsRouter = express.Router();

const LAWYER_INFO = {
  name: 'JORGE EDUARDO DA SILVA ALVIM',
  oab: 'OAB/MG 222.943',
  nationality: 'brasileiro',
  marital_status: 'casado',
  profession: 'advogado',
  address: 'Rua Henrique Dias, nº 259, Galeria 259, Loja 5, Bairro Benfica, Juiz de Fora - MG, CEP 36.080-000',
  phone: '(32) 99815-3429',
  email: 'contato@jorgealvimadvocacia.com.br'
};

function formatMoney(val) {
  const num = parseFloat(val) || 0;
  return num.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function getFullClientQualification(c) {
  const isPJ = c.client_type === 'PJ';
  if (isPJ) {
    const repInfo = c.rep_name 
      ? `, neste ato representada por seu administrador ${c.rep_name}, inscrito no CPF sob o nº ${c.rep_cpf || '—'}, RG nº ${c.rep_rg || '—'}`
      : '';
    return `${c.full_name.toUpperCase()}, pessoa jurídica de direito privado inscrita no CNPJ sob o nº ${c.cnpj || '—'}, com sede na ${c.street || '—'}, nº ${c.number || 'S/N'} ${c.complement ? `(${c.complement})` : ''}, Bairro ${c.neighborhood || '—'}, ${c.city || 'Juiz de Fora'} - ${c.state || 'MG'}, CEP ${c.cep || '—'}${repInfo}`;
  }

  const filiation = (c.filiation_mother || c.filiation_father)
    ? `, filho(a) de ${c.filiation_mother || '—'} e ${c.filiation_father || '—'}`
    : '';

  return `${c.full_name.toUpperCase()}, ${c.nationality || 'brasileiro(a)'}, ${c.marital_status || 'estado civil não informado'}, ${c.profession || 'profissão não informada'}, portador(a) da Carteira de Identidade RG nº ${c.rg || '—'}, inscrito(a) no CPF sob o nº ${c.cpf || '—'}${filiation}, residente e domiciliado(a) na ${c.street || '—'}, nº ${c.number || 'S/N'} ${c.complement ? `(${c.complement})` : ''}, Bairro ${c.neighborhood || '—'}, ${c.city || 'Juiz de Fora'} - ${c.state || 'MG'}, CEP ${c.cep || '—'}, Telefone/WhatsApp: ${c.phone || '—'}, e-mail: ${c.email || 'não informado'}`;
}

function getLetterheadHTML() {
  return `
    <div style="text-align: center; border-bottom: 2.5px solid #b8860b; padding-bottom: 14px; margin-bottom: 26px; font-family: 'Playfair Display', Georgia, serif;">
      <div style="font-size: 20px; font-weight: 800; color: #0a192f; letter-spacing: 1.5px;">
        ${LAWYER_INFO.name}
      </div>
      <div style="font-size: 11.5px; font-weight: bold; color: #996515; margin-top: 4px; letter-spacing: 2px; text-transform: uppercase;">
        Advocacia & Consultoria Jurídica • ${LAWYER_INFO.oab}
      </div>
      <div style="font-size: 10px; color: #64748b; margin-top: 4px; font-family: 'Plus Jakarta Sans', system-ui, sans-serif;">
        ${LAWYER_INFO.address} • Tel/WhatsApp: ${LAWYER_INFO.phone} • ${LAWYER_INFO.email}
      </div>
    </div>
  `;
}

function generateProcuracao(client) {
  const clientQualif = getFullClientQualification(client);
  const letterhead = getLetterheadHTML();
  const dateStr = new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });

  const bodyHTML = `
    ${letterhead}
    <div style="text-align: center; margin-bottom: 24px;">
      <h2 style="font-size: 16px; font-weight: 800; letter-spacing: 2px; color: #0a192f; text-decoration: underline; text-transform: uppercase;">
        PROCURAÇÃO "AD JUDICIA ET EXTRA"
      </h2>
    </div>

    <div style="text-align: justify; line-height: 1.75; font-size: 11pt; color: #0f172a; font-family: Georgia, serif;">
      <p style="margin-bottom: 16px;">
        <strong>OUTORGANTE:</strong> ${clientQualif}.
      </p>

      <p style="margin-bottom: 16px;">
        <strong>OUTORGADO:</strong> <strong>${LAWYER_INFO.name}</strong>, ${LAWYER_INFO.nationality}, ${LAWYER_INFO.marital_status}, ${LAWYER_INFO.profession}, inscrito na <strong>${LAWYER_INFO.oab}</strong>, com escritório profissional situado na ${LAWYER_INFO.address}, onde recebe intimações, avisos e notificações de estilo.
      </p>

      <p style="margin-bottom: 16px; text-indent: 2em;">
        <strong>PODERES:</strong> Por este instrumento particular de mandato, o(a) Outorgante confere ao Outorgado os amplos e gerais poderes da cláusula <strong>"AD JUDICIA ET EXTRA"</strong> para o foro em geral, em qualquer Juízo, Instância ou Tribunal, bem como perante quaisquer repartições públicas federais, estaduais e municipais, autarquias e entidades paraestatais, cartórios extrajudiciais e órgãos de proteção ao crédito, para defender os direitos e interesses do(a) Outorgante em juízo ou fora dele.
      </p>

      <p style="margin-bottom: 16px; text-indent: 2em;">
        <strong>PODERES ESPECIAIS:</strong> O Outorgado dispõe expressamente dos poderes especiais contidos no <strong>art. 105 do Código de Processo Civil</strong>, tais como confessar, reconhecer a procedência do pedido, transigir, desistir, renunciar ao direito sobre o qual se funda a ação, receber valores decorrentes de acordos, condenações e alvarás judiciais ou RPVs/Precatórios, dar quitação plena e irrevogável, firmar compromissos e substabelecer esta com ou sem reserva de iguais poderes, agindo sempre no fiel cumprimento do mandato outorgado.
      </p>

      <div style="text-align: center; margin-top: 36px; margin-bottom: 40px;">
        <p>Juiz de Fora - MG, ${dateStr}.</p>
      </div>

      <div style="margin-top: 50px; text-align: center;">
        <div style="border-top: 1.5px solid #0f172a; width: 60%; margin: 0 auto 6px auto;"></div>
        <strong style="font-size: 11pt;">${client.full_name.toUpperCase()}</strong><br/>
        <span style="font-size: 9.5pt; color: #64748b;">Outorgante • CPF/CNPJ: ${client.cpf || client.cnpj || '—'}</span>
      </div>
    </div>
  `;

  return { title: `Procuração Ad Judicia - ${client.full_name}`, html: bodyHTML };
}

function generateContrato(client) {
  const clientQualif = getFullClientQualification(client);
  const letterhead = getLetterheadHTML();
  const dateStr = new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });
  const contractVal = parseFloat(client.contract_value) || 0;
  const installments = client.installments_count || 1;

  const bodyHTML = `
    ${letterhead}
    <div style="text-align: center; margin-bottom: 22px;">
      <h2 style="font-size: 15px; font-weight: 800; letter-spacing: 1.5px; color: #0a192f; text-decoration: underline; text-transform: uppercase;">
        CONTRATO DE PRESTAÇÃO DE SERVIÇOS ADVOCATÍCIOS & HONORÁRIOS
      </h2>
    </div>

    <div style="text-align: justify; line-height: 1.7; font-size: 10.5pt; color: #0f172a; font-family: Georgia, serif;">
      <p style="margin-bottom: 12px;">
        <strong>CONTRATANTE:</strong> ${clientQualif}.
      </p>

      <p style="margin-bottom: 14px;">
        <strong>CONTRATADO:</strong> <strong>${LAWYER_INFO.name}</strong>, ${LAWYER_INFO.nationality}, ${LAWYER_INFO.marital_status}, ${LAWYER_INFO.profession}, regularmente inscrito na <strong>${LAWYER_INFO.oab}</strong>, com endereço profissional na ${LAWYER_INFO.address}.
      </p>

      <p style="margin-bottom: 12px; text-indent: 1.5em;">
        <strong>CLÁUSULA 1ª — DO OBJETO:</strong> O presente contrato tem por objeto a prestação de serviços jurídicos e consultoria pelo CONTRATADO em defesa dos interesses do(a) CONTRATANTE, compreendendo a elaboração de peças, acompanhamento processual em 1ª Instância e interposição de recursos ordinários cabíveis perante o Poder Judiciário ou órgãos administrativos.
      </p>

      <p style="margin-bottom: 12px; text-indent: 1.5em;">
        <strong>CLÁUSULA 2ª — DOS HONORÁRIOS ADVOCATÍCIOS:</strong> Em remuneração pelos serviços advocatícios pactuados, o(a) CONTRATANTE pagará ao CONTRATADO o valor total de <strong>${formatMoney(contractVal)}</strong>, a ser liquidado em <strong>${installments} parcela(s)</strong> nos termos do cadastro ajustado com o escritório.
        <br/><em>Parágrafo Único:</em> Em caso de êxito econômico decorrente da ação, os honorários contratuais de êxito (se estipulados) incidirão sobre o proveito bruto obtido pelo constituinte e serão retidos por ocasião do levantamento de Alvará Judicial ou RPV.
      </p>

      <p style="margin-bottom: 12px; text-indent: 1.5em;">
        <strong>CLÁUSULA 3ª — DAS DESPESAS PROCESSUAIS:</strong> Todas as custas judiciais, emolumentos cartorários, taxas de desarquivamento, despesas de condução, cópias reprográficas e honorários periciais correrão por conta do(a) CONTRATANTE, salvo concessão expressa de Gratuidade da Justiça pelo Magistrado.
      </p>

      <p style="margin-bottom: 12px; text-indent: 1.5em;">
        <strong>CLÁUSULA 4ª — DO FORO:</strong> As partes elegem expressamente o Foro da Comarca de Juiz de Fora - MG para dirimir quaisquer controvérsias oriundas deste instrumento, renunciando a qualquer outro por mais privilegiado que seja.
      </p>

      <div style="text-align: center; margin-top: 30px; margin-bottom: 36px;">
        <p>Juiz de Fora - MG, ${dateStr}.</p>
      </div>

      <div style="display: flex; justify-content: space-around; margin-top: 40px; text-align: center;">
        <div style="width: 45%;">
          <div style="border-top: 1.5px solid #0f172a; margin-bottom: 5px;"></div>
          <strong>${client.full_name.toUpperCase()}</strong><br/>
          <span style="font-size: 9pt; color: #64748b;">CONTRATANTE</span>
        </div>
        <div style="width: 45%;">
          <div style="border-top: 1.5px solid #0f172a; margin-bottom: 5px;"></div>
          <strong>${LAWYER_INFO.name}</strong><br/>
          <span style="font-size: 9pt; color: #64748b;">CONTRATADO • ${LAWYER_INFO.oab}</span>
        </div>
      </div>
    </div>
  `;

  return { title: `Contrato de Honorários - ${client.full_name}`, html: bodyHTML };
}

function generateHipossuficiencia(client) {
  const clientQualif = getFullClientQualification(client);
  const letterhead = getLetterheadHTML();
  const dateStr = new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });

  const bodyHTML = `
    ${letterhead}
    <div style="text-align: center; margin-bottom: 24px;">
      <h2 style="font-size: 15px; font-weight: 800; letter-spacing: 2px; color: #0a192f; text-decoration: underline; text-transform: uppercase;">
        DECLARAÇÃO DE HIPOSSUFICIÊNCIA ECONÔMICA
      </h2>
      <div style="font-size: 11px; color: #64748b; margin-top: 3px; font-family: 'Plus Jakarta Sans', sans-serif;">
        (Benefício da Gratuidade da Justiça — Art. 98 e seguintes do CPC/2015 e Lei Federal nº 1.060/50)
      </div>
    </div>

    <div style="text-align: justify; line-height: 1.8; font-size: 11pt; color: #0f172a; font-family: Georgia, serif;">
      <p style="margin-bottom: 18px;">
        Eu, <strong>${clientQualif}</strong>,
      </p>

      <p style="text-indent: 2.5em; margin-bottom: 20px;">
        <strong>DECLARO</strong>, para os devidos fins de direito e sob as penas da Lei, perante o Poder Judiciário, que atualmente não possuo condições econômico-financeiras de suportar o pagamento de custas processuais, taxas judiciárias, emolumentos, honorários periciais e despesas sucumbenciais sem prejuízo do meu próprio sustento e da manutenção de minha família.
      </p>

      <p style="text-indent: 2.5em; margin-bottom: 24px;">
        Por tais razões, requeiro expressamente a concessão dos benefícios integrais da <strong>JUSTIÇA GRATUITA</strong>, nos exatos termos do artigo 5º, inciso LXXIV, da Constituição Federal de 1988 c/c os artigos 98 e seguintes da Lei nº 13.105/2015 (Código de Processo Civil) e artigo 4º da Lei nº 1.060/1950.
      </p>

      <p style="text-indent: 2.5em; margin-bottom: 30px;">
        Por ser a mais lídima expressão da verdade, firmo o presente documento.
      </p>

      <div style="text-align: center; margin-top: 36px; margin-bottom: 40px;">
        <p>Juiz de Fora - MG, ${dateStr}.</p>
      </div>

      <div style="margin-top: 50px; text-align: center;">
        <div style="border-top: 1.5px solid #0f172a; width: 60%; margin: 0 auto 6px auto;"></div>
        <strong style="font-size: 11pt;">${client.full_name.toUpperCase()}</strong><br/>
        <span style="font-size: 9.5pt; color: #64748b;">Declarante • CPF/CNPJ: ${client.cpf || client.cnpj || '—'}</span>
      </div>
    </div>
  `;

  return { title: `Declaração de Hipossuficiência - ${client.full_name}`, html: bodyHTML };
}

/**
 * 1. GET /api/legal-docs/kit/:clientId
 * Retorna o kit inicial completo preenchido (Procuração, Contrato, Hipossuficiência)
 */
legalDocsRouter.get('/api/legal-docs/kit/:clientId', requireAuth, (req, res) => {
  try {
    const { clientId } = req.params;
    const client = db.prepare(`SELECT * FROM clients WHERE id = ?`).get(clientId);

    if (!client) {
      return res.status(404).json({ error: 'Cliente não encontrado.' });
    }

    const procuracao = generateProcuracao(client);
    const contrato = generateContrato(client);
    const hipossuficiencia = generateHipossuficiencia(client);

    return res.json({
      success: true,
      advogado: LAWYER_INFO,
      client: {
        id: client.id,
        full_name: client.full_name,
        cpf: client.cpf,
        cnpj: client.cnpj,
        phone: client.phone,
        email: client.email
      },
      docs: {
        procuracao,
        contrato,
        hipossuficiencia
      }
    });
  } catch (err) {
    console.error('[LEGAL DOCS] Erro ao gerar kit inicial:', err);
    return res.status(500).json({ error: 'Erro ao gerar kit inicial: ' + err.message });
  }
});

/**
 * 2. GET /api/legal-docs/render/:clientId/:docType
 * Renderiza página timbrada pronta para imprimir ou Salvar como PDF
 */
legalDocsRouter.get('/api/legal-docs/render/:clientId/:docType', requireAuth, (req, res) => {
  try {
    const { clientId, docType } = req.params;
    const client = db.prepare(`SELECT * FROM clients WHERE id = ?`).get(clientId);

    if (!client) {
      return res.status(404).send('Cliente não encontrado.');
    }

    let docObj;
    if (docType === 'procuracao') docObj = generateProcuracao(client);
    else if (docType === 'contrato') docObj = generateContrato(client);
    else if (docType === 'hipossuficiencia') docObj = generateHipossuficiencia(client);
    else return res.status(400).send('Tipo de documento inválido.');

    const fullHTML = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <title>${docObj.title} • Jorge Alvim Advocacia</title>
  <style>
    @page {
      size: A4;
      margin: 20mm 15mm 20mm 15mm;
    }
    body {
      background-color: #f8fafc;
      color: #0f172a;
      margin: 0;
      padding: 24px;
      font-family: Georgia, serif;
    }
    .sheet {
      background: #ffffff;
      max-width: 210mm;
      min-height: 297mm;
      margin: 0 auto;
      padding: 30mm 22mm 25mm 22mm;
      box-sizing: border-box;
      box-shadow: 0 4px 20px rgba(0,0,0,0.08);
      border-radius: 4px;
    }
    .no-print-bar {
      max-width: 210mm;
      margin: 0 auto 16px auto;
      display: flex;
      justify-content: space-between;
      align-items: center;
      background: #0a192f;
      color: white;
      padding: 10px 18px;
      border-radius: 12px;
      font-family: system-ui, -apple-system, sans-serif;
      font-size: 13px;
    }
    .btn {
      background: #b8860b;
      color: white;
      border: none;
      padding: 8px 16px;
      border-radius: 8px;
      font-weight: bold;
      cursor: pointer;
      font-size: 12px;
    }
    .btn:hover {
      background: #996515;
    }
    @media print {
      body {
        background: transparent;
        padding: 0;
      }
      .no-print-bar {
        display: none !important;
      }
      .sheet {
        box-shadow: none;
        margin: 0;
        padding: 0;
        border-radius: 0;
      }
    }
  </style>
</head>
<body>
  <div class="no-print-bar">
    <div><strong>Jorge Alvim Advocacia</strong> • ${docObj.title}</div>
    <div>
      <button class="btn" onclick="window.print()">🖨️ Imprimir / Salvar em PDF</button>
    </div>
  </div>
  <div class="sheet">
    ${docObj.html}
  </div>
</body>
</html>`;

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.send(fullHTML);
  } catch (err) {
    console.error('[LEGAL DOCS] Erro ao renderizar timbrado:', err);
    return res.status(500).send('Erro ao renderizar documento.');
  }
});

/**
 * 3. POST /api/legal-docs/dispatch-kit
 * Cria solicitações de assinatura em lote no módulo esign e gera links para WhatsApp
 */
legalDocsRouter.post('/api/legal-docs/dispatch-kit', requireAuth, (req, res) => {
  try {
    const { clientId, docTypes = ['procuracao', 'contrato', 'hipossuficiencia'] } = req.body;
    const client = db.prepare(`SELECT * FROM clients WHERE id = ?`).get(clientId);

    if (!client) {
      return res.status(404).json({ error: 'Cliente não encontrado.' });
    }

    const host = req.get('host') || 'localhost:3000';
    const proto = req.headers['x-forwarded-proto'] || req.protocol || 'http';
    const baseUrl = `${proto}://${host}`;

    const createdRequests = [];

    for (const type of docTypes) {
      let doc;
      if (type === 'procuracao') doc = generateProcuracao(client);
      else if (type === 'contrato') doc = generateContrato(client);
      else if (type === 'hipossuficiencia') doc = generateHipossuficiencia(client);
      else continue;

      const reqId = `REQ-SIG-${Date.now()}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
      const token = crypto.randomBytes(24).toString('hex');
      const now = new Date().toISOString();
      const expiresAt = new Date(Date.now() + 7 * 86400000).toISOString();
      const docHash = crypto.createHash('sha256').update(doc.html, 'utf8').digest('hex');

      db.prepare(`
        INSERT INTO signature_requests (
          id, token, doc_type, doc_title, content_html, document_hash,
          client_id, signer_name, signer_email, signer_cpf,
          status, created_by, created_by_name, created_at, expires_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pendente', ?, ?, ?, ?)
      `).run(
        reqId,
        token,
        type,
        doc.title,
        doc.html,
        docHash,
        client.id,
        client.full_name,
        client.email || null,
        client.cpf || client.cnpj || null,
        req.user?.userId || 'ADMIN',
        req.user?.name || 'Dr. Jorge Alvim',
        now,
        expiresAt
      );

      const signUrl = `${baseUrl}/assinar/${token}`;
      createdRequests.push({
        id: reqId,
        token,
        doc_type: type,
        title: doc.title,
        sign_url: signUrl
      });
    }

    const cleanPhone = (client.phone || '').replace(/\D/g, '');
    const docNamesMap = {
      procuracao: 'Procuração Ad Judicia',
      contrato: 'Contrato de Honorários',
      hipossuficiencia: 'Declaração de Hipossuficiência'
    };
    const namesFormatted = docTypes.map(t => docNamesMap[t] || t).join(', ');

    let waText = `Olá, *${client.full_name}*!\n\n`;
    waText += `Aqui é do escritório *Jorge Alvim Advocacia*.\n\n`;
    waText += `Para darmos início imediato ao seu atendimento e processo, disponibilizamos seus documentos (${namesFormatted}) para assinatura eletrônica direta no celular:\n\n`;

    createdRequests.forEach((cr, idx) => {
      waText += `✍️ *${idx + 1}. Assinar ${docNamesMap[cr.doc_type] || cr.title}:*\n${cr.sign_url}\n\n`;
    });

    waText += `_A assinatura eletrônica tem plena validade jurídica nos termos da Lei Federal nº 14.063/2020 e MP 2.200-2/2001._\n`;
    waText += `_Dr. Jorge Alvim • OAB/MG 222.943_`;

    const countryPhone = cleanPhone.startsWith('55') ? cleanPhone : (cleanPhone ? `55${cleanPhone}` : '');
    const whatsappLink = countryPhone 
      ? `https://wa.me/${countryPhone}?text=${encodeURIComponent(waText)}` 
      : `https://wa.me/?text=${encodeURIComponent(waText)}`;

    logAudit(req, {
      event_type: 'CRIACAO',
      event_name: 'DISPARAR_KIT_ASSINATURA',
      module: 'LEGAL_DOCS',
      resource_id: clientId,
      description: `Kit inicial de assinatura gerado para ${client.full_name} (${createdRequests.length} documentos: ${namesFormatted}).`
    });

    return res.status(201).json({
      success: true,
      client_name: client.full_name,
      requests: createdRequests,
      whatsapp_link: whatsappLink,
      whatsapp_message: decodeURIComponent(waText.replace(/%0A/g, '\n')),
      message: 'Kit inicial gerado e pronto para assinatura no WhatsApp!'
    });
  } catch (err) {
    console.error('[LEGAL DOCS] Erro ao disparar kit:', err);
    return res.status(500).json({ error: 'Erro ao disparar kit para assinatura: ' + err.message });
  }
});
