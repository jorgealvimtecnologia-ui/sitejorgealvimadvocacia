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
 * Validação algorítmica matemática oficial de dígitos verificadores de CNPJ
 */
export function isValidCnpj(cnpj) {
  const clean = String(cnpj || '').replace(/\D/g, '');
  if (clean.length !== 14 || /^(\d)\1+$/.test(clean)) return false;
  let size = 12;
  let numbers = clean.substring(0, size);
  let digits = clean.substring(size);
  let sum = 0;
  let pos = size - 7;
  for (let i = size; i >= 1; i--) {
    sum += Number(numbers.charAt(size - i)) * pos--;
    if (pos < 2) pos = 9;
  }
  let result = sum % 11 < 2 ? 0 : 11 - (sum % 11);
  if (result !== Number(digits.charAt(0))) return false;
  size = 13;
  numbers = clean.substring(0, size);
  sum = 0;
  pos = size - 7;
  for (let i = size; i >= 1; i--) {
    sum += Number(numbers.charAt(size - i)) * pos--;
    if (pos < 2) pos = 9;
  }
  result = sum % 11 < 2 ? 0 : 11 - (sum % 11);
  return result === Number(digits.charAt(1));
}

function parseHtmlForData(html) {
  if (!html) return { emails: [], cnpjs: [], instagram: null, facebook: null, linkedin: null };

  const rawEmails = html.match(EMAIL_REGEX) || [];
  const validEmails = rawEmails.filter(em => {
    const lower = em.toLowerCase();
    if (lower.endsWith('.png') || lower.endsWith('.jpg') || lower.endsWith('.jpeg') || lower.endsWith('.webp')) return false;
    return !IGNORED_EMAILS.some(ign => lower.includes(ign));
  });

  const rawCnpjs = (html.match(CNPJ_REGEX) || []).filter(isValidCnpj);
  const igMatch = html.match(INSTAGRAM_REGEX);
  const fbMatch = html.match(FACEBOOK_REGEX);
  const liMatch = html.match(LINKEDIN_REGEX);

  return {
    emails: [...new Set(validEmails)],
    cnpjs: [...new Set(rawCnpjs)],
    instagram: igMatch ? `https://instagram.com/${igMatch[1]}` : null,
    facebook: fbMatch ? `https://facebook.com/${fbMatch[1]}` : null,
    linkedin: liMatch ? `https://linkedin.com/${liMatch[1]}` : null
  };
}

async function fetchPageHtml(url) {
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
      },
      signal: AbortSignal.timeout(4500),
      redirect: 'follow'
    });
    if (!res.ok) return null;
    return await res.text();
  } catch (_) {
    return null;
  }
}

/**
 * Lê uma página web e extrai e-mails, redes sociais e CNPJ (com varredura de subpáginas)
 */
async function scrapeUrlContent(targetUrl) {
  try {
    let baseUrl = targetUrl.trim();
    if (!baseUrl.startsWith('http://') && !baseUrl.startsWith('https://')) {
      baseUrl = `https://${baseUrl}`;
    }

    const html = await fetchPageHtml(baseUrl);
    const extracted = parseHtmlForData(html || '');

    // Se já encontrou CNPJ e E-mail logo na Home, não precisa vasculhar subpáginas
    if (extracted.cnpjs.length > 0 && extracted.emails.length > 0) {
      return extracted;
    }

    // Se tem site mas faltou e-mail ou CNPJ, varre subpáginas essenciais em paralelo
    if (html) {
      try {
        const parsedBase = new URL(baseUrl);
        const subPaths = ['/contato', '/sobre', '/politica-de-privacidade'];
        const subFetches = subPaths.map(async p => {
          try {
            const subUrl = new URL(p, parsedBase.origin).toString();
            const subHtml = await fetchPageHtml(subUrl);
            return subHtml ? parseHtmlForData(subHtml) : null;
          } catch (_) {
            return null;
          }
        });

        const subResults = await Promise.allSettled(subFetches);
        for (const res of subResults) {
          if (res.status === 'fulfilled' && res.value) {
            const subExtracted = res.value;
            if (subExtracted.emails.length) extracted.emails.push(...subExtracted.emails);
            if (subExtracted.cnpjs.length) extracted.cnpjs.push(...subExtracted.cnpjs);
            if (!extracted.instagram && subExtracted.instagram) extracted.instagram = subExtracted.instagram;
            if (!extracted.facebook && subExtracted.facebook) extracted.facebook = subExtracted.facebook;
            if (!extracted.linkedin && subExtracted.linkedin) extracted.linkedin = subExtracted.linkedin;
          }
        }
      } catch (_) {}
    }

    extracted.emails = [...new Set(extracted.emails)];
    extracted.cnpjs = [...new Set(extracted.cnpjs)];
    return extracted;
  } catch (_) {
    return null;
  }
}

/**
 * Tenta descobrir o CNPJ através de busca orgânica pública (DuckDuckGo HTML prioritário + fallbacks)
 */
async function discoverCnpjByName(name, city, state) {
  if (!name) return null;
  const cleanName = String(name).replace(/[\/\\#,+()$~%.'":*?<>{}]/g, ' ').replace(/\s+/g, ' ').trim();
  const query = `${cleanName} CNPJ ${city || ''} ${state || ''}`.trim();

  // 1ª Tentativa: DuckDuckGo HTML (rápido, sem bloqueio de snippets e com CNPJ explícito)
  try {
    const res = await fetch(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.8'
      },
      signal: AbortSignal.timeout(3500)
    });
    if (res.ok) {
      const text = await res.text();
      const cnpjs = (text.match(CNPJ_REGEX) || []).filter(isValidCnpj);
      if (cnpjs.length > 0) {
        return cnpjs[0];
      }
    }
  } catch (_) {}

  // 2ª Tentativa: Yahoo e Bing como fallbacks
  const fallbackUrls = [
    `https://search.yahoo.com/search?p=${encodeURIComponent(query)}`,
    `https://www.bing.com/search?q=${encodeURIComponent(query)}`
  ];

  for (const sUrl of fallbackUrls) {
    try {
      const res = await fetch(sUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
          'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.8'
        },
        signal: AbortSignal.timeout(3000)
      });
      if (res.ok) {
        const text = await res.text();
        const cnpjs = (text.match(CNPJ_REGEX) || []).filter(isValidCnpj);
        if (cnpjs.length > 0) {
          return cnpjs[0];
        }
      }
    } catch (_) {}
  }
  return null;
}

/**
 * Enriquece um prospect individualmente com rastreamento detalhado de alterações
 */
export async function enrichSingleProspect(prospectId) {
  const prospect = db.prepare(`SELECT * FROM radar_b2b_prospects WHERE id = ?`).get(prospectId);
  if (!prospect) {
    throw new Error('Prospect não encontrado.');
  }

  // Registra o estado anterior para identificar o que realmente mudou
  const prevCnpj = prospect.cnpj || '';
  const prevSocios = prospect.socios || '';
  const prevEmail = prospect.email || '';
  const prevRazaoSocial = prospect.razao_social || '';
  const prevInstagram = prospect.instagram || '';
  const prevFacebook = prospect.facebook || '';
  const prevLinkedin = prospect.linkedin || '';
  const prevCapital = prospect.capital_social || '';
  const prevCnae = prospect.cnae || '';

  let foundEmail = prevEmail;
  let foundCnpj = prevCnpj;
  let foundInstagram = prevInstagram;
  let foundFacebook = prevFacebook;
  let foundLinkedin = prevLinkedin;
  let foundSocios = prevSocios;
  let foundRazaoSocial = prevRazaoSocial;
  let foundCapitalSocial = prevCapital;
  let foundCnae = prevCnae;

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

  // PASSO 2: Se ainda não achou CNPJ, busca pelo Nome + Cidade em fontes orgânicas (DuckDuckGo/Search)
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

  // Identifica exatamente o que foi adicionado de novo
  const novosCampos = [];
  if (!prevCnpj && foundCnpj) novosCampos.push('CNPJ');
  if (!prevSocios && foundSocios) novosCampos.push('Sócios (QSA)');
  if (!prevEmail && foundEmail) novosCampos.push('E-mail');
  if (!prevRazaoSocial && foundRazaoSocial) novosCampos.push('Razão Social');
  if (!prevInstagram && foundInstagram) novosCampos.push('Instagram');
  if (!prevFacebook && foundFacebook) novosCampos.push('Facebook');
  if (!prevLinkedin && foundLinkedin) novosCampos.push('LinkedIn');
  if (!prevCapital && foundCapitalSocial) novosCampos.push('Capital Social');
  if (!prevCnae && foundCnae) novosCampos.push('CNAE');

  let statusType = 'sem_dados_publicos';
  if (novosCampos.length > 0) {
    statusType = 'novos_dados';
  } else if (foundCnpj || foundSocios || foundEmail) {
    statusType = 'dados_confirmados';
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
    cnae: foundCnae,
    status_type: statusType,
    novosCampos,
    hasNewData: novosCampos.length > 0,
    alreadyHadData: !!(prevCnpj || prevSocios || prevEmail),
    enriched_at: now
  };
}
