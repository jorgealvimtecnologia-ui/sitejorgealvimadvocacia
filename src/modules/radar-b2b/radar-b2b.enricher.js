/**
 * Módulo Robô Enriquecedor B2B (Web Crawler & Consulta Receita Federal/Sócios)
 * Localiza e-mails, redes sociais, CNPJs e Sócios (QSA)
 */

import { db } from '../../config/db.js';

// Expressões regulares para captura de dados
const EMAIL_REGEX = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
const CNPJ_REGEX = /\b\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}\b/g;
const INSTAGRAM_REGEX = /https?:\/\/(?:www\.)?instagram\.com\/([a-zA-Z0-9_.]+)/i;
const FACEBOOK_REGEX = /https?:\/\/(?:www\.)?facebook\.com\/([a-zA-Z0-9_.-]+)/i;
const LINKEDIN_REGEX = /https?:\/\/(?:www\.)?linkedin\.com\/(?:company|in)\/([a-zA-Z0-9_.-]+)/i;

// E-mails descartáveis ou de imagem para ignorar
const IGNORED_EMAILS = [
  'wixpress.com', 'sentry.io', 'schema.org', 'domain.com', 'example.com',
  'bootstrap.com', 'wordpress.org', 'cloudflare.com', 'google.com'
];

/**
 * Normaliza e limpa string de CNPJ para 14 dígitos
 */
export function cleanDigits(str) {
  return String(str || '').replace(/\D/g, '');
}

/**
 * Consulta API da Receita Federal (BrasilAPI e Minha Receita como fallback)
 */
export async function fetchCnpjData(cnpj) {
  const digits = cleanDigits(cnpj);
  if (digits.length !== 14) return null;

  // 1ª Tentativa: BrasilAPI
  try {
    const res = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${digits}`, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
      signal: AbortSignal.timeout(5000)
    });
    if (res.ok) {
      const data = await res.json();
      const socios = (data.qsa || []).map(s => {
        const nome = s.nome_socio || s.nome_socio_razao_social || '';
        const qual = s.qualificacao_socio || s.qualificacao_responsavel || '';
        return qual ? `${nome} (${qual})` : nome;
      }).filter(Boolean);

      return {
        cnpj: data.cnpj || digits,
        razao_social: data.razao_social || data.nome_fantasia || '',
        socios: socios.join(', '),
        email: data.email || '',
        telefone: data.telefone || data.ddd_telefone_1 || '',
        cnae: data.cnae_fiscal_descricao || '',
        capital_social: data.capital_social ? Number(data.capital_social).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : '',
        situacao: data.descricao_situacao_cadastral || 'ATIVA'
      };
    }
  } catch (_) {}

  // 2ª Tentativa: Minha Receita (Fallback confiável)
  try {
    const res = await fetch(`https://minhareceita.org/${digits}`, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
      signal: AbortSignal.timeout(5000)
    });
    if (res.ok) {
      const data = await res.json();
      const socios = (data.qsa || []).map(s => s.nome_socio).filter(Boolean);
      return {
        cnpj: data.cnpj || digits,
        razao_social: data.razao_social || data.nome_fantasia || '',
        socios: socios.join(', '),
        email: data.email || '',
        telefone: data.ddd_telefone_1 || '',
        cnae: data.cnae_fiscal_descricao || '',
        capital_social: data.capital_social ? Number(data.capital_social).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : '',
        situacao: data.descricao_situacao_cadastral || 'ATIVA'
      };
    }
  } catch (_) {}

  return null;
}

/**
 * Lê uma página web e extrai e-mails, redes sociais e CNPJ
 */
async function scrapeUrlContent(targetUrl) {
  try {
    let url = targetUrl.trim();
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      url = `https://${url}`;
    }

    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
      },
      signal: AbortSignal.timeout(6000),
      redirect: 'follow'
    });

    if (!res.ok) return null;
    const html = await res.text();

    // Extrai e-mails
    const rawEmails = html.match(EMAIL_REGEX) || [];
    const validEmails = rawEmails.filter(em => {
      const lower = em.toLowerCase();
      if (lower.endsWith('.png') || lower.endsWith('.jpg') || lower.endsWith('.jpeg') || lower.endsWith('.webp')) return false;
      return !IGNORED_EMAILS.some(ign => lower.includes(ign));
    });

    // Extrai CNPJ
    const rawCnpjs = html.match(CNPJ_REGEX) || [];

    // Extrai Redes Sociais
    const igMatch = html.match(INSTAGRAM_REGEX);
    const fbMatch = html.match(FACEBOOK_REGEX);
    const liMatch = html.match(LINKEDIN_REGEX);

    return {
      emails: [...new Set(validEmails)],
      cnpjs: [...new Set(rawCnpjs)],
      instagram: igMatch ? `https://instagram.com/${igMatch[1]}` : null,
      facebook: fbMatch ? `https://facebook.com/${fbMatch[1]}` : null,
      linkedin: liMatch ? `https://linkedin.com/${liMatch[1]}` : null,
      htmlLength: html.length
    };
  } catch (_) {
    return null;
  }
}

/**
 * Tenta descobrir o CNPJ através de busca orgânica pública (DuckDuckGo HTML)
 */
async function discoverCnpjByName(name, city, state) {
  try {
    const q = encodeURIComponent(`"${name}" CNPJ "${city}" ${state || ''}`);
    const res = await fetch(`https://html.duckduckgo.com/html/?q=${q}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      },
      signal: AbortSignal.timeout(5000)
    });
    if (!res.ok) return null;
    const text = await res.text();
    const cnpjs = text.match(CNPJ_REGEX);
    if (cnpjs && cnpjs.length > 0) {
      return cnpjs[0];
    }
  } catch (_) {}
  return null;
}

/**
 * Enriquece um prospect individualmente
 */
export async function enrichSingleProspect(prospectId) {
  const prospect = db.prepare(`SELECT * FROM radar_b2b_prospects WHERE id = ?`).get(prospectId);
  if (!prospect) {
    throw new Error('Prospect não encontrado.');
  }

  const updates = {};
  let foundEmail = prospect.email || '';
  let foundCnpj = prospect.cnpj || '';
  let foundInstagram = prospect.instagram || '';
  let foundFacebook = prospect.facebook || '';
  let foundLinkedin = prospect.linkedin || '';
  let foundSocios = prospect.socios || '';
  let foundRazaoSocial = prospect.razao_social || '';
  let foundCapitalSocial = prospect.capital_social || '';
  let foundCnae = prospect.cnae || '';

  // PASSO 1: Se tem site, faz o web crawl no rodapé e páginas de contato
  if (prospect.website) {
    const siteData = await scrapeUrlContent(prospect.website);
    if (siteData) {
      if (!foundEmail && siteData.emails.length > 0) {
        foundEmail = siteData.emails[0];
      }
      if (!foundCnpj && siteData.cnpjs.length > 0) {
        foundCnpj = siteData.cnpjs[0];
      }
      if (!foundInstagram && siteData.instagram) {
        foundInstagram = siteData.instagram;
      }
      if (!foundFacebook && siteData.facebook) {
        foundFacebook = siteData.facebook;
      }
      if (!foundLinkedin && siteData.linkedin) {
        foundLinkedin = siteData.linkedin;
      }
    }
  }

  // PASSO 2: Se ainda não achou CNPJ, busca pelo Nome + Cidade
  if (!foundCnpj && prospect.name) {
    const discovered = await discoverCnpjByName(prospect.name, prospect.city || '', prospect.state || '');
    if (discovered) {
      foundCnpj = discovered;
    }
  }

  // PASSO 3: Se temos CNPJ, consulta a Receita Federal para sócios, razão social e e-mail
  if (foundCnpj) {
    const receita = await fetchCnpjData(foundCnpj);
    if (receita) {
      if (!foundSocios && receita.socios) foundSocios = receita.socios;
      if (!foundRazaoSocial && receita.razao_social) foundRazaoSocial = receita.razao_social;
      if (!foundEmail && receita.email) foundEmail = receita.email.toLowerCase();
      if (!foundCapitalSocial && receita.capital_social) foundCapitalSocial = receita.capital_social;
      if (!foundCnae && receita.cnae) foundCnae = receita.cnae;
      if (receita.cnpj) foundCnpj = receita.cnpj;
    }
  }

  const now = new Date().toISOString();
  db.prepare(`
    UPDATE radar_b2b_prospects 
    SET email = ?, cnpj = ?, razao_social = ?, socios = ?, 
        instagram = ?, facebook = ?, linkedin = ?, capital_social = ?, 
        cnae = ?, enriched_at = ?, updated_at = ?
    WHERE id = ?
  `).run(
    foundEmail || null,
    foundCnpj || null,
    foundRazaoSocial || null,
    foundSocios || null,
    foundInstagram || null,
    foundFacebook || null,
    foundLinkedin || null,
    foundCapitalSocial || null,
    foundCnae || null,
    now,
    now,
    prospectId
  );

  return {
    id: prospectId,
    name: prospect.name,
    email: foundEmail,
    cnpj: foundCnpj,
    socios: foundSocios,
    razao_social: foundRazaoSocial,
    instagram: foundInstagram,
    capital_social: foundCapitalSocial,
    cnae: foundCnae
  };
}
