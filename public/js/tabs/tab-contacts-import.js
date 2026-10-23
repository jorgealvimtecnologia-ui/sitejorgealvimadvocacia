/**
 * ============================================================================
 * SUBMÓDULO: INTEGRAÇÃO & IMPORTAÇÃO DE CONTATOS (GMAIL, CELULAR, CSV E EXCEL)
 * Jorge Alvim Advocacia — OAB/MG 222.943
 * ============================================================================
 */
(function (window) {
  'use strict';

  let _parsedContacts = [];
  let _existingPhones = new Set();
  let _existingEmails = new Set();
  let _googleTokenClient = null;

  // Carrega scripts sob demanda (lazy load)
  function loadVendorScript(src) {
    return new Promise((resolve, reject) => {
      const existing = document.querySelector(`script[src="${src}"]`);
      if (existing) {
        if (existing.dataset.loaded === 'true' || window.Papa || window.XLSX) return resolve();
        existing.addEventListener('load', () => resolve());
        existing.addEventListener('error', () => reject(new Error('Erro ao carregar ' + src)));
        return;
      }
      const s = document.createElement('script');
      s.src = src;
      s.async = true;
      s.onload = () => { s.dataset.loaded = 'true'; resolve(); };
      s.onerror = () => reject(new Error('Falha ao carregar ' + src));
      document.head.appendChild(s);
    });
  }

  async function ensureParsers() {
    const promises = [];
    if (!window.Papa) promises.push(loadVendorScript('/js/vendor/papaparse.min.js'));
    if (!window.XLSX) promises.push(loadVendorScript('/js/vendor/xlsx.full.min.js'));
    await Promise.all(promises);
  }

  // Abre o modal de integração
  window.openContactsImportModal = function () {
    const modal = document.getElementById('modal-contacts-import');
    if (!modal) return;
    modal.classList.remove('hidden');
    modal.classList.add('flex');
    resetImportState();
    ensureParsers().catch(err => console.warn('[CONTATOS] Aviso ao carregar parsers:', err));
  };

  // Fecha o modal
  window.closeContactsImportModal = function () {
    const modal = document.getElementById('modal-contacts-import');
    if (!modal) return;
    modal.classList.add('hidden');
    modal.classList.remove('flex');
  };

  function resetImportState() {
    _parsedContacts = [];
    _existingPhones.clear();
    _existingEmails.clear();
    const fileInput = document.getElementById('contacts-file-input');
    if (fileInput) fileInput.value = '';
    const statusDiv = document.getElementById('contacts-import-status');
    if (statusDiv) statusDiv.innerHTML = '';
    const previewContainer = document.getElementById('contacts-preview-container');
    if (previewContainer) previewContainer.classList.add('hidden');
    const importBtn = document.getElementById('btn-confirm-import-contacts');
    if (importBtn) {
      importBtn.disabled = true;
      importBtn.classList.add('opacity-50', 'cursor-not-allowed');
      importBtn.textContent = 'Cadastrar Contatos Selecionados';
    }
    const filterInput = document.getElementById('contacts-search-preview');
    if (filterInput) filterInput.value = '';
  }

  // Normaliza telefone para exibição
  function formatPhone(raw) {
    if (!raw) return '';
    const digits = String(raw).replace(/\D/g, '');
    if (!digits) return raw;
    if (digits.startsWith('55') && (digits.length === 12 || digits.length === 13)) {
      return formatPhone(digits.slice(2));
    }
    if (digits.length === 11) {
      return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
    }
    if (digits.length === 10) {
      return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
    }
    return raw.trim();
  }

  const PJ_PATTERNS = [
    /\b(ltda|eireli|s[\.\/\s]?a|me|epp|s\/s)\b/i,
    /\b(auto\s*pe[cç]as?|posto|supermercado|farm[aá]cia|drogaria|oficina|restaurante|pizzaria|padaria|hotel|pousada|lanchonete|buffet)\b/i,
    /\b(cl[ií]nica|hospital|laborat[oó]rio|advocacia|advogados|contabilidade|assessoria|consultoria|est[uú]dio|pet\s*shop|veterin[aá]ria)\b/i,
    /\b(distribuidora|com[eé]rcio|ind[uú]stria|servi[cç]os|transportes|log[ií]stica|engenharia|construtora|incorporadora|imobili[aá]ria|corretora)\b/i,
    /\b([oó]tica|gr[aá]fica|papelaria|vidra[cç]aria|marmoraria|serralheria|metal[uú]rgica|madeireira|m[oó]veis|ve[ií]culos|concession[aá]ria|lava\s*(jato|r[aá]pido))\b/i,
    /\b(associa[cç][aã]o|instituto|funda[cç][aã]o|cooperativa|coop|sindicato|igreja|prefeitura|c[aâ]mara|secretaria|tribunal|cart[oó]rio|banco|seguros)\b/i,
    /\b(academia|escola|col[eé]gio|faculdade|universidade|tecnologia|sistemas|inform[aá]tica)\b/i
  ];

  function detectClientType(name, org, notes) {
    const target = `${name || ''} ${org || ''} ${notes || ''}`.toLowerCase();
    for (const pat of PJ_PATTERNS) {
      if (pat.test(target)) return 'PJ';
    }
    return 'PF';
  }

  const DEFAULT_CLIENT_ID = '285571475823-69gr5k4lft10ghf14skvsg06fv1pqkt4.apps.googleusercontent.com';
  let _clientId = DEFAULT_CLIENT_ID;

  // Busca o client_id em segundo plano sem travar o clique do usuário
  try {
    fetch('/api/contacts/google-config', { headers: (typeof getAuthHeaders === 'function' ? getAuthHeaders() : {}) })
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d && d.clientId) _clientId = d.clientId; })
      .catch(() => {});
  } catch (_) {}

  // ============================================================================
  // MÉTODO 1: GOOGLE PEOPLE API (GMAIL & CELULAR ANDROID)
  // ============================================================================
  window.connectGoogleContacts = function () {
    const statusDiv = document.getElementById('contacts-import-status');
    statusDiv.innerHTML = '<div class="p-3 bg-amber-50 border border-amber-200 rounded-xl text-amber-900 text-xs font-semibold flex items-center gap-2"><span class="animate-spin text-base">⏳</span> Conectando com a Conta Google (aguardando autorização no popup)...</div>';

    if (!window.google || !window.google.accounts || !window.google.accounts.oauth2) {
      statusDiv.innerHTML = '<div class="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-800 text-xs font-semibold">❌ Biblioteca Google Identity Services não carregada no navegador. Recarregue a página.</div>';
      return;
    }

    try {
      // Inicialização direta preservando o clique síncrono do usuário (User Gesture)
      _googleTokenClient = window.google.accounts.oauth2.initTokenClient({
        client_id: _clientId,
        scope: 'https://www.googleapis.com/auth/contacts.readonly',
        callback: async (tokenResponse) => {
          if (tokenResponse && tokenResponse.error) {
            statusDiv.innerHTML = `<div class="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-800 text-xs font-semibold">❌ Autorização Google: ${tokenResponse.error}</div>`;
            return;
          }
          if (tokenResponse && tokenResponse.access_token) {
            await fetchPeopleContacts(tokenResponse.access_token);
          }
        },
        error_callback: (err) => {
          // Ignora fechamento se a resposta já estiver a caminho
          if (err && err.type !== 'popup_closed') {
            statusDiv.innerHTML = `<div class="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-800 text-xs font-semibold">❌ Falha no Google: ${err.message || err.type}</div>`;
          }
        }
      });

      // Disparo com 'select_account' para permitir escolher ou trocar de conta Google (ex: jorgealvim10@gmail.com)
      _googleTokenClient.requestAccessToken({ prompt: 'select_account' });
    } catch (err) {
      statusDiv.innerHTML = `<div class="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-800 text-xs font-semibold">❌ Erro ao iniciar conexão Google: ${err.message}</div>`;
    }
  };

  // Puxa os contatos paginados da Google People API
  async function fetchPeopleContacts(accessToken) {
    const statusDiv = document.getElementById('contacts-import-status');
    statusDiv.innerHTML = '<div class="p-3 bg-blue-50 border border-blue-200 rounded-xl text-blue-900 text-xs font-semibold flex items-center gap-2"><span class="animate-spin text-base">🔄</span> Puxando lista de contatos e telefones do Gmail...</div>';

    try {
      let connections = [];
      let nextPageToken = '';
      let page = 1;

      do {
        const url = new URL('https://people.googleapis.com/v1/people/me/connections');
        url.searchParams.set('personFields', 'names,phoneNumbers,emailAddresses,addresses,organizations,biographies');
        url.searchParams.set('pageSize', '1000');
        if (nextPageToken) url.searchParams.set('pageToken', nextPageToken);

        const res = await fetch(url.toString(), {
          headers: { Authorization: `Bearer ${accessToken}` }
        });

        if (!res.ok) {
          const errBody = await res.json().catch(() => null);
          const detailedMsg = errBody && errBody.error && errBody.error.message ? errBody.error.message : res.statusText;
          if (res.status === 403) {
            throw new Error(`A <b>Google People API</b> ainda não está ativada no seu projeto Google Cloud. <br/><a href="https://console.cloud.google.com/apis/library/people.googleapis.com" target="_blank" class="underline font-bold text-amber-800">👉 Clique aqui para Ativar a Google People API no Google Cloud (1 clique)</a> e tente novamente.`);
          }
          throw new Error(`Google API retornou erro ${res.status}: ${detailedMsg}`);
        }

        const data = await res.json();
        if (data.connections && data.connections.length) {
          connections = connections.concat(data.connections);
        }
        nextPageToken = data.nextPageToken || '';
        page++;
      } while (nextPageToken && page <= 10);

      if (!connections.length) {
        statusDiv.innerHTML = '<div class="p-3 bg-amber-50 border border-amber-200 rounded-xl text-amber-900 text-xs font-semibold">ℹ️ Nenhum contato encontrado nesta conta Google.</div>';
        return;
      }

      // Mapear contatos da People API
      const parsed = [];
      connections.forEach(c => {
        const name = (c.names && c.names[0] && (c.names[0].displayName || c.names[0].givenName)) || '';
        const phones = (c.phoneNumbers || []).map(p => p.value).filter(Boolean);
        const emails = (c.emailAddresses || []).map(e => e.value).filter(Boolean);
        const addresses = (c.addresses || []).map(a => a.formattedValue).filter(Boolean);
        const org = (c.organizations && c.organizations[0] && c.organizations[0].name) || '';
        const notes = (c.biographies && c.biographies[0] && c.biographies[0].value) || '';

        // Se tiver mais de um telefone, cria uma linha por contato com o telefone principal, mantendo outros em notas
        const mainPhone = phones[0] || '';
        const extraPhones = phones.slice(1).join(', ');

        if (name || mainPhone) {
          const cName = name || `Contato ${mainPhone}`;
          parsed.push({
            name: cName,
            phone: formatPhone(mainPhone),
            email: emails[0] || '',
            organization: org,
            city: extractCityFromAddress(addresses[0] || ''),
            notes: [notes, extraPhones ? `Outros fones: ${extraPhones}` : ''].filter(Boolean).join(' | '),
            client_type: detectClientType(cName, org, notes),
            source: 'Google Contacts (Gmail)',
            selected: true
          });
        }
      });

      statusDiv.innerHTML = `<div class="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-900 text-xs font-semibold">✅ <b>${parsed.length}</b> contatos recuperados do Google Contacts com sucesso!</div>`;
      await processParsedContacts(parsed, 'Google Contacts (Gmail)');
    } catch (err) {
      statusDiv.innerHTML = `<div class="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-800 text-xs font-semibold">❌ Falha ao ler contatos do Google: ${err.message}</div>`;
    }
  }

  function extractCityFromAddress(addr) {
    if (!addr) return 'Juiz de Fora';
    if (addr.toLowerCase().includes('juiz de fora')) return 'Juiz de Fora';
    const parts = addr.split('-');
    if (parts.length > 1) {
      const cityCandidate = parts[parts.length - 2].trim();
      if (cityCandidate) return cityCandidate.replace(/[^a-zA-Záàâãéèêíïóôõöúçñ\s]/gi, '').trim();
    }
    return '';
  }

  // ============================================================================
  // MÉTODO 2: ARQUIVOS CSV, XLS E XLSX (ARRASTAR & SOLTAR OU SELEÇÃO)
  // ============================================================================
  window.handleContactsFileSelect = async function (e) {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    await parseContactsFile(file);
  };

  window.handleContactsFileDrop = async function (e) {
    e.preventDefault();
    e.stopPropagation();
    const zone = document.getElementById('contacts-dropzone');
    if (zone) zone.classList.remove('border-amber-500', 'bg-amber-50/50');

    const dt = e.dataTransfer;
    const file = dt && dt.files && dt.files[0];
    if (file) await parseContactsFile(file);
  };

  window.handleContactsDragOver = function (e) {
    e.preventDefault();
    e.stopPropagation();
    const zone = document.getElementById('contacts-dropzone');
    if (zone) zone.classList.add('border-amber-500', 'bg-amber-50/50');
  };

  window.handleContactsDragLeave = function (e) {
    e.preventDefault();
    e.stopPropagation();
    const zone = document.getElementById('contacts-dropzone');
    if (zone) zone.classList.remove('border-amber-500', 'bg-amber-50/50');
  };

  // Decodifica Quoted-Printable (usado em vCards de celulares Android / iPhone)
  function decodeQuotedPrintable(str) {
    if (!str || !str.includes('=')) return str;
    try {
      const bytes = [];
      for (let i = 0; i < str.length; i++) {
        if (str[i] === '=' && i + 2 < str.length && /[0-9A-Fa-f]{2}/.test(str.substr(i + 1, 2))) {
          bytes.push(parseInt(str.substr(i + 1, 2), 16));
          i += 2;
        } else {
          bytes.push(str.charCodeAt(i));
        }
      }
      return new TextDecoder('utf-8').decode(new Uint8Array(bytes));
    } catch (_) {
      return str.replace(/=([A-Fa-f0-9]{2})/g, (m, hex) => String.fromCharCode(parseInt(hex, 16)));
    }
  }

  // Parser nativo de arquivo de celular vCard (.vcf)
  function parseVcfContent(text, fileName) {
    if (!text) return [];
    const unfolded = text.replace(/\r\n[ \t]|\r[ \t]|\n[ \t]/g, '');
    const lines = unfolded.split(/\r\n|\r|\n/);

    const contacts = [];
    let current = null;

    for (let i = 0; i < lines.length; i++) {
      const rawLine = lines[i].trim();
      if (!rawLine) continue;

      if (rawLine.toUpperCase() === 'BEGIN:VCARD') {
        current = { name: '', phones: [], emails: [], org: '', notes: '', address: '' };
        continue;
      }

      if (rawLine.toUpperCase() === 'END:VCARD') {
        if (current && (current.name || current.phones.length > 0 || current.emails.length > 0)) {
          const mainPhone = current.phones[0] || '';
          const extraPhones = current.phones.slice(1).join(', ');
          const cName = current.name || (mainPhone ? `Contato ${mainPhone}` : 'Sem Nome');
          contacts.push({
            name: cName,
            phone: formatPhone(mainPhone),
            email: current.emails[0] || '',
            organization: current.org || '',
            city: extractCityFromAddress(current.address || ''),
            notes: [current.notes, extraPhones ? `Outros fones: ${extraPhones}` : ''].filter(Boolean).join(' | '),
            client_type: detectClientType(cName, current.org, current.notes),
            source: `Arquivo VCF (${fileName})`,
            selected: true
          });
        }
        current = null;
        continue;
      }

      if (!current) continue;

      const colonIdx = rawLine.indexOf(':');
      if (colonIdx === -1) continue;

      const rawProp = rawLine.slice(0, colonIdx).toUpperCase();
      let val = rawLine.slice(colonIdx + 1).trim();

      if (rawProp.includes('ENCODING=QUOTED-PRINTABLE') || rawProp.includes('QUOTED-PRINTABLE')) {
        val = decodeQuotedPrintable(val);
      }

      if (rawProp === 'FN' || rawProp.startsWith('FN;') || rawProp.startsWith('FN:')) {
        current.name = val;
      } else if (rawProp === 'N' || rawProp.startsWith('N;') || rawProp.startsWith('N:')) {
        if (!current.name) {
          const parts = val.split(';').map(p => p.trim()).filter(Boolean);
          if (parts.length >= 2) {
            current.name = `${parts[1]} ${parts[0]}`.trim();
          } else if (parts.length === 1) {
            current.name = parts[0];
          }
        }
      } else if (rawProp === 'TEL' || rawProp.startsWith('TEL;') || rawProp.startsWith('TEL:')) {
        const cleanedPhone = val.replace(/[^\d+()\s-]/g, '').trim();
        if (cleanedPhone && !current.phones.includes(cleanedPhone)) {
          current.phones.push(cleanedPhone);
        }
      } else if (rawProp === 'EMAIL' || rawProp.startsWith('EMAIL;') || rawProp.startsWith('EMAIL:')) {
        if (val && !current.emails.includes(val)) {
          current.emails.push(val);
        }
      } else if (rawProp === 'ORG' || rawProp.startsWith('ORG;') || rawProp.startsWith('ORG:')) {
        current.org = val.split(';')[0].trim();
      } else if (rawProp === 'NOTE' || rawProp.startsWith('NOTE;') || rawProp.startsWith('NOTE:')) {
        current.notes = val.replace(/\\n/gi, ' ');
      } else if (rawProp === 'ADR' || rawProp.startsWith('ADR;') || rawProp.startsWith('ADR:')) {
        current.address = val.replace(/;/g, ' ').trim();
      }
    }

    return contacts;
  }

  async function parseContactsFile(file) {
    await ensureParsers();
    const statusDiv = document.getElementById('contacts-import-status');
    statusDiv.innerHTML = `<div class="p-3 bg-blue-50 border border-blue-200 rounded-xl text-blue-900 text-xs font-semibold flex items-center gap-2"><span class="animate-spin text-base">⏳</span> Analisando arquivo <b>${file.name}</b>...</div>`;

    const fileName = file.name.toLowerCase();
    const isVcf = fileName.endsWith('.vcf');
    const isExcel = fileName.endsWith('.xlsx') || fileName.endsWith('.xls');

    if (isVcf) {
      const reader = new FileReader();
      reader.onload = async function (ev) {
        try {
          const text = ev.target.result;
          const parsed = parseVcfContent(text, file.name);

          if (!parsed || parsed.length === 0) {
            statusDiv.innerHTML = '<div class="p-3 bg-amber-50 border border-amber-200 rounded-xl text-amber-900 text-xs font-semibold">⚠️ Nenhum contato válido encontrado no arquivo .vcf.</div>';
            return;
          }

          statusDiv.innerHTML = `<div class="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-900 text-xs font-semibold">✅ <b>${parsed.length}</b> contatos lidos do arquivo VCF de celular com sucesso!</div>`;
          await processParsedContacts(parsed, `Arquivo VCF (${file.name})`);
        } catch (err) {
          statusDiv.innerHTML = `<div class="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-800 text-xs font-semibold">❌ Erro ao ler arquivo VCF: ${err.message}</div>`;
        }
      };
      reader.readAsText(file, 'UTF-8');
    } else if (isExcel) {
      const reader = new FileReader();
      reader.onload = async function (ev) {
        try {
          const data = new Uint8Array(ev.target.result);
          const workbook = window.XLSX.read(data, { type: 'array' });
          const firstSheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[firstSheetName];
          const jsonRows = window.XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });

          if (!jsonRows || jsonRows.length < 2) {
            statusDiv.innerHTML = '<div class="p-3 bg-amber-50 border border-amber-200 rounded-xl text-amber-900 text-xs font-semibold">⚠️ A planilha precisa ter ao menos uma linha de cabeçalho e dados.</div>';
            return;
          }

          const parsed = mapRowsToContacts(jsonRows, file.name);
          statusDiv.innerHTML = `<div class="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-900 text-xs font-semibold">✅ <b>${parsed.length}</b> contatos lidos da planilha Excel com sucesso!</div>`;
          await processParsedContacts(parsed, `Planilha Excel (${file.name})`);
        } catch (err) {
          statusDiv.innerHTML = `<div class="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-800 text-xs font-semibold">❌ Erro ao ler planilha Excel: ${err.message}</div>`;
        }
      };
      reader.readAsArrayBuffer(file);
    } else {
      // CSV
      const reader = new FileReader();
      reader.onload = async function (ev) {
        try {
          const text = ev.target.result;
          const papaRes = window.Papa.parse(text, { skipEmptyLines: true });
          const rows = papaRes.data;

          if (!rows || rows.length < 2) {
            statusDiv.innerHTML = '<div class="p-3 bg-amber-50 border border-amber-200 rounded-xl text-amber-900 text-xs font-semibold">⚠️ O arquivo CSV precisa conter cabeçalho e linhas de dados.</div>';
            return;
          }

          const parsed = mapRowsToContacts(rows, file.name);
          statusDiv.innerHTML = `<div class="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-900 text-xs font-semibold">✅ <b>${parsed.length}</b> contatos lidos do arquivo CSV com sucesso!</div>`;
          await processParsedContacts(parsed, `Arquivo CSV (${file.name})`);
        } catch (err) {
          statusDiv.innerHTML = `<div class="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-800 text-xs font-semibold">❌ Erro ao ler arquivo CSV: ${err.message}</div>`;
        }
      };
      reader.readAsText(file, 'UTF-8');
    }
  }

  // Mapeador de colunas inteligente
  function mapRowsToContacts(matrix, sourceName) {
    const rawHeaders = matrix[0].map(h => String(h || '').trim().toLowerCase());
    
    // Procura colunas típicas
    let firstNameIdx = -1, middleNameIdx = -1, lastNameIdx = -1;
    let nameIdx = -1, phoneIdx = -1, emailIdx = -1, cityIdx = -1, orgIdx = -1, notesIdx = -1;

    rawHeaders.forEach((h, idx) => {
      // Nome composto do Google
      if (firstNameIdx === -1 && (h === 'first name' || h === 'primeiro nome')) firstNameIdx = idx;
      if (middleNameIdx === -1 && (h === 'middle name' || h === 'nome do meio')) middleNameIdx = idx;
      if (lastNameIdx === -1 && (h === 'last name' || h === 'sobrenome' || h === 'ultimo nome')) lastNameIdx = idx;

      // Nome completo único
      if (nameIdx === -1 && (h === 'name' || h === 'nome' || h === 'given name' || h === 'full name' || h === 'nome completo' || h === 'razao social')) {
        nameIdx = idx;
      }

      // Telefone / Celular (evita colunas de tipo/label)
      if (phoneIdx === -1 && !h.includes('type') && !h.includes('label') && !h.includes('rotulo')) {
        if (h.includes('phone') || h.includes('mobile') || h.includes('telefone') || h.includes('celular') || h.includes('fone') || h.includes('whatsapp') || h === 'tel') {
          phoneIdx = idx;
        }
      }

      // E-mail (procura especificamente colunas de valor e evita label/type)
      if (emailIdx === -1) {
        if (h.includes('e-mail 1 - value') || h.includes('email 1 - value') || h === 'email' || h === 'e-mail' || (h.includes('email') && !h.includes('label') && !h.includes('type') && !h.includes('rotulo'))) {
          emailIdx = idx;
        }
      }

      // Cidade
      if (cityIdx === -1 && (h.includes('address 1 - formatted') || h.includes('cidade') || h.includes('municipio') || h.includes('city'))) {
        cityIdx = idx;
      }
      // Organização / Empresa
      if (orgIdx === -1 && !h.includes('type') && (h.includes('organization') || h.includes('empresa') || h.includes('tipo') || h.includes('cargo'))) {
        orgIdx = idx;
      }
      // Notas / Observações
      if (notesIdx === -1 && (h.includes('notes') || h.includes('observação') || h.includes('obs') || h.includes('detalhes'))) {
        notesIdx = idx;
      }
    });

    // Fallback de detecção de email se ainda não achou: verifica se alguma coluna tem arroba '@' nas primeiras linhas
    if (emailIdx === -1) {
      for (let c = 0; c < matrix[0].length; c++) {
        let hasAt = 0;
        for (let r = 1; r < Math.min(matrix.length, 10); r++) {
          if (String(matrix[r][c] || '').includes('@')) hasAt++;
        }
        if (hasAt >= 2) {
          emailIdx = c;
          break;
        }
      }
    }

    const contacts = [];
    for (let i = 1; i < matrix.length; i++) {
      const row = matrix[i];
      if (!row || !row.length) continue;

      let name = '';
      if (firstNameIdx !== -1) {
        const parts = [
          row[firstNameIdx],
          middleNameIdx !== -1 ? row[middleNameIdx] : '',
          lastNameIdx !== -1 ? row[lastNameIdx] : ''
        ].map(p => String(p || '').trim()).filter(Boolean);
        name = parts.join(' ').trim();
      }
      if (!name && nameIdx !== -1) {
        name = String(row[nameIdx] || '').trim();
      }

      // Telefone seguro (valida se tem ao menos 6 dígitos numéricos)
      let phone = '';
      if (phoneIdx !== -1) {
        const rawPhone = String(row[phoneIdx] || '').trim();
        const digits = rawPhone.replace(/\D/g, '');
        if (digits.length >= 6) {
          phone = formatPhone(rawPhone);
        }
      }

      // E-mail limpo e validado
      let email = '';
      if (emailIdx !== -1) {
        const rawEmail = String(row[emailIdx] || '').replace(/['"]/g, '').trim().toLowerCase();
        if (rawEmail.includes('@') && rawEmail.includes('.')) {
          email = rawEmail;
        }
      }

      const city = cityIdx !== -1 ? String(row[cityIdx] || '').trim() : '';
      const org = orgIdx !== -1 ? String(row[orgIdx] || '').trim() : '';
      const notes = notesIdx !== -1 ? String(row[notesIdx] || '').trim() : '';

      if (name || phone || email) {
        const cName = name || (phone ? `Contato ${phone}` : (email ? email.split('@')[0] : 'Contato'));
        contacts.push({
          name: cName,
          phone: phone,
          email: email,
          city: city,
          organization: org,
          notes: notes,
          client_type: detectClientType(cName, org, notes),
          source: sourceName,
          selected: true
        });
      }
    }

    return contacts;
  }

  // Processa e verifica duplicidade no banco
  async function processParsedContacts(contacts, sourceTag) {
    _parsedContacts = contacts;
    _existingPhones.clear();
    _existingEmails.clear();

    const phones = contacts.map(c => c.phone).filter(Boolean);
    const emails = contacts.map(c => c.email).filter(Boolean);

    try {
      const res = await fetch('/api/contacts/check-duplicates', {
        method: 'POST',
        headers: Object.assign({ 'Content-Type': 'application/json' }, getAuthHeaders()),
        body: JSON.stringify({ phones, emails })
      });
      if (res.ok) {
        const data = await res.json();
        (data.existingPhones || []).forEach(p => _existingPhones.add(p));
        (data.existingEmails || []).forEach(e => _existingEmails.add(e.toLowerCase()));
      }
    } catch (err) {
      console.warn('[CONTATOS] Não foi possível verificar duplicatas antecipadas:', err);
    }

    renderContactsPreview();
  }

  // Renderiza pré-visualização e tabela
  function renderContactsPreview() {
    const container = document.getElementById('contacts-preview-container');
    if (!container) return;
    container.classList.remove('hidden');

    const total = _parsedContacts.length;
    const withPhone = _parsedContacts.filter(c => c.phone).length;
    const pfCount = _parsedContacts.filter(c => c.client_type === 'PF').length;
    const pjCount = _parsedContacts.filter(c => c.client_type === 'PJ').length;
    const duplicates = _parsedContacts.filter(c => isContactDuplicate(c)).length;
    const selected = _parsedContacts.filter(c => c.selected).length;

    document.getElementById('stat-preview-total').textContent = total;
    document.getElementById('stat-preview-phones').textContent = withPhone;
    const elPf = document.getElementById('stat-preview-pf');
    if (elPf) elPf.textContent = pfCount;
    const elPj = document.getElementById('stat-preview-pj');
    if (elPj) elPj.textContent = pjCount;
    document.getElementById('stat-preview-duplicates').textContent = duplicates;
    document.getElementById('stat-preview-selected').textContent = selected;

    const importBtn = document.getElementById('btn-confirm-import-contacts');
    if (importBtn) {
      if (selected > 0) {
        importBtn.disabled = false;
        importBtn.classList.remove('opacity-50', 'cursor-not-allowed');
        importBtn.textContent = `Cadastrar ${selected} Contato(s) Selecionado(s)`;
      } else {
        importBtn.disabled = true;
        importBtn.classList.add('opacity-50', 'cursor-not-allowed');
        importBtn.textContent = 'Selecione ao menos 1 contato';
      }
    }

    renderPreviewTable();
  }

  function isContactDuplicate(c) {
    if (c.phone && _existingPhones.has(c.phone)) return true;
    if (c.email && _existingEmails.has(c.email.toLowerCase())) return true;
    return false;
  }

  function renderPreviewTable() {
    const tbody = document.getElementById('contacts-preview-tbody');
    if (!tbody) return;

    const query = (document.getElementById('contacts-search-preview')?.value || '').toLowerCase().trim();

    const filtered = _parsedContacts.filter((c, idx) => {
      c._originalIdx = idx;
      if (!query) return true;
      return (c.name && c.name.toLowerCase().includes(query)) ||
             (c.phone && c.phone.includes(query)) ||
             (c.email && c.email.toLowerCase().includes(query)) ||
             (c.organization && c.organization.toLowerCase().includes(query));
    });

    if (filtered.length === 0) {
      tbody.innerHTML = `<tr><td colspan="5" class="p-6 text-center text-slate-400 text-xs font-semibold">Nenhum contato coincide com a busca.</td></tr>`;
      return;
    }

    // Limita exibição visual a 300 itens na tabela para manter o DOM ágil
    const displayList = filtered.slice(0, 300);

    tbody.innerHTML = displayList.map(c => {
      const isDup = isContactDuplicate(c);
      const isMobile = c.phone && c.phone.replace(/\D/g, '').length === 11;

      return `
        <tr class="hover:bg-slate-50 border-b border-slate-100 text-xs ${isDup ? 'bg-amber-50/40' : ''}">
          <td class="p-2.5 text-center">
            <input type="checkbox" ${c.selected ? 'checked' : ''} onchange="toggleSelectContact(${c._originalIdx}, this.checked)" class="rounded text-amber-600 focus:ring-amber-500 cursor-pointer" />
          </td>
          <td class="p-2.5 font-bold text-slate-800">
            <div class="flex items-center gap-1.5 flex-wrap">
              <span>${escapeHtml(c.name)}</span>
              ${c.client_type === 'PJ'
                ? `<span class="px-1.5 py-0.5 rounded bg-purple-100 text-purple-900 font-bold text-[9px] border border-purple-300">🏢 PJ</span>`
                : `<span class="px-1.5 py-0.5 rounded bg-blue-100 text-blue-900 font-bold text-[9px] border border-blue-200">👤 PF</span>`
              }
            </div>
            ${c.organization ? `<div class="text-[10px] font-normal text-slate-500">${escapeHtml(c.organization)}</div>` : ''}
          </td>
          <td class="p-2.5 font-mono text-slate-700">
            ${c.phone ? `
              <span class="inline-flex items-center gap-1 font-semibold ${isMobile ? 'text-emerald-700' : 'text-slate-700'}">
                ${isMobile ? '📱' : '📞'} ${escapeHtml(c.phone)}
              </span>
            ` : '<span class="text-slate-400 italic">Sem telefone</span>'}
          </td>
          <td class="p-2.5 text-slate-600 truncate max-w-[180px]">
            ${c.email ? escapeHtml(c.email) : '<span class="text-slate-400">—</span>'}
          </td>
          <td class="p-2.5">
            ${isDup 
              ? `<span class="px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 font-bold text-[10px] border border-amber-200">⚠️ Já Cadastrado</span>` 
              : `<span class="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-bold text-[10px]">✨ Novo</span>`}
          </td>
        </tr>
      `;
    }).join('');
  }

  window.toggleSelectContact = function (idx, checked) {
    if (_parsedContacts[idx]) {
      _parsedContacts[idx].selected = checked;
      renderContactsPreview();
    }
  };

  window.toggleSelectAllContacts = function (checked) {
    const query = (document.getElementById('contacts-search-preview')?.value || '').toLowerCase().trim();
    _parsedContacts.forEach(c => {
      if (!query || (c.name && c.name.toLowerCase().includes(query)) || (c.phone && c.phone.includes(query))) {
        c.selected = checked;
      }
    });
    renderContactsPreview();
  };

  window.filterContactsPreview = function () {
    renderPreviewTable();
  };

  // ============================================================================
  // CONFIRMAÇÃO & CADASTRO EM LOTE
  // ============================================================================
  window.submitContactsImport = async function () {
    const selected = _parsedContacts.filter(c => c.selected);
    if (!selected.length) {
      alert('Selecione ao menos um contato para cadastrar.');
      return;
    }

    const target = document.getElementById('contacts-target-destination')?.value || 'clients';
    const skipDuplicates = document.getElementById('contacts-skip-duplicates')?.checked ?? true;
    const sourceTag = document.getElementById('contacts-source-label')?.value || 'Importação de Contatos';

    const btn = document.getElementById('btn-confirm-import-contacts');
    btn.disabled = true;
    btn.textContent = 'Cadastrando no banco de dados...';

    const statusDiv = document.getElementById('contacts-import-status');
    statusDiv.innerHTML = '<div class="p-3 bg-blue-50 border border-blue-200 rounded-xl text-blue-900 text-xs font-semibold flex items-center gap-2"><span class="animate-spin text-base">⏳</span> Salvando contatos no sistema...</div>';

    try {
      const res = await fetch('/api/contacts/import-batch', {
        method: 'POST',
        headers: Object.assign({ 'Content-Type': 'application/json' }, getAuthHeaders()),
        body: JSON.stringify({
          target,
          contacts: selected,
          skipDuplicates,
          sourceTag
        })
      });

      const data = await res.json();
      if (res.ok && data.success) {
        statusDiv.innerHTML = `
          <div class="p-4 bg-emerald-50 border border-emerald-300 rounded-2xl text-emerald-900 text-xs space-y-1 shadow-sm">
            <div class="font-bold text-sm text-emerald-800">🎉 Importação Concluída com Sucesso!</div>
            <div>✅ <b>${data.imported}</b> contato(s) cadastrado(s) em <b>${data.target === 'leads' ? 'Leads / Atendimentos' : 'Clientes & Contratos'}</b>.</div>
            ${data.skipped ? `<div>ℹ️ <b>${data.skipped}</b> contato(s) ignorados (duplicados ou sem dados).</div>` : ''}
          </div>
        `;

        if (typeof wmToast === 'function') {
          wmToast(`Sucesso! ${data.imported} contatos importados.`);
        }

        // Atualiza a listagem correspondente no painel
        if (target === 'clients' && typeof loadClients === 'function') loadClients();
        if (target === 'leads' && typeof loadLeads === 'function') loadLeads();

        setTimeout(() => {
          window.closeContactsImportModal();
        }, 2000);
      } else {
        throw new Error(data.error || 'Falha ao salvar contatos.');
      }
    } catch (err) {
      statusDiv.innerHTML = `<div class="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-800 text-xs font-semibold">❌ Erro ao cadastrar contatos: ${err.message}</div>`;
      btn.disabled = false;
      btn.textContent = `Cadastrar ${selected.length} Contato(s) Selecionado(s)`;
    }
  };

  // Download do modelo CSV
  window.downloadContactsModelCsv = function () {
    const csv = 'Nome;Telefone;Email;Cidade;Empresa;Observações\nJoão da Silva;(32) 99999-1111;joao@exemplo.com;Juiz de Fora;Silva & Filhos;Contato pessoal\nMaria Oliveira;(32) 98888-2222;maria@exemplo.com;Juiz de Fora;Comércio Local;Indicação\n';
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'modelo-contatos-escritorio.csv';
    a.click();
    URL.revokeObjectURL(a.href);
  };

  function escapeHtml(str) {
    if (!str) return '';
    return String(str).replace(/[&<>"']/g, m => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[m]);
  }

})(window);
