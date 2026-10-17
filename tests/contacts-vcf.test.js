/**
 * Testes Automatizados para Parser de Arquivos de Celular .VCF (vCard)
 */
import { test, describe } from 'node:test';
import assert from 'node:assert';

// Extrai a lógica pura do parser VCF implementada no frontend
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

function parseVcfContent(text, fileName = 'contacts.vcf') {
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
        contacts.push({
          name: current.name || (mainPhone ? `Contato ${mainPhone}` : 'Sem Nome'),
          phone: formatPhone(mainPhone),
          email: current.emails[0] || '',
          organization: current.org || '',
          notes: [current.notes, extraPhones ? `Outros fones: ${extraPhones}` : ''].filter(Boolean).join(' | '),
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
    }
  }

  return contacts;
}

describe('Suíte de Testes: Parser de Arquivos .VCF (vCard)', () => {

  test('1. Deve extrair contatos no formato vCard 3.0 padrão do Android', () => {
    const vcf = `
BEGIN:VCARD
VERSION:3.0
FN:Carlos Eduardo Ferreira
N:Ferreira;Carlos;Eduardo;;
TEL;TYPE=CELL:(32) 99876-5432
TEL;TYPE=HOME:(32) 3211-1234
EMAIL;TYPE=INTERNET:carlos.ferreira@email.com
ORG:Advocacia Ferreira
NOTE:Cliente indicado por Dr. Jorge
END:VCARD
    `;

    const result = parseVcfContent(vcf, 'backup_android.vcf');
    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0].name, 'Carlos Eduardo Ferreira');
    assert.strictEqual(result[0].phone, '(32) 99876-5432');
    assert.strictEqual(result[0].email, 'carlos.ferreira@email.com');
    assert.strictEqual(result[0].organization, 'Advocacia Ferreira');
    assert.ok(result[0].notes.includes('Cliente indicado por Dr. Jorge'));
    assert.ok(result[0].notes.includes('Outros fones: (32) 3211-1234'));
  });

  test('2. Deve decodificar acentuação Quoted-Printable (vCard 2.1 antigo)', () => {
    const vcf = `
BEGIN:VCARD
VERSION:2.1
N;CHARSET=UTF-8;ENCODING=QUOTED-PRINTABLE:Silveira;Jo=C3=A3o;;;
FN;CHARSET=UTF-8;ENCODING=QUOTED-PRINTABLE:Jo=C3=A3o da Silveira
TEL;CELL:+5532988112233
EMAIL;PREF:joao.silveira@teste.com
END:VCARD
    `;

    const result = parseVcfContent(vcf, 'contatos_antigos.vcf');
    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0].name, 'João da Silveira');
    assert.strictEqual(result[0].phone, '(32) 98811-2233');
    assert.strictEqual(result[0].email, 'joao.silveira@teste.com');
  });

  test('3. Deve ler múltiplos contatos contidos no mesmo arquivo .vcf', () => {
    const vcf = `
BEGIN:VCARD
VERSION:3.0
FN:Maria Aparecida
TEL;TYPE=CELL:32991234567
END:VCARD
BEGIN:VCARD
VERSION:3.0
FN:Roberto Carlos
TEL;TYPE=CELL:32987654321
END:VCARD
BEGIN:VCARD
VERSION:3.0
FN:Juliana Mendes
TEL;TYPE=CELL:32999887766
EMAIL:juliana@mendes.com.br
END:VCARD
    `;

    const result = parseVcfContent(vcf, 'todos_contatos.vcf');
    assert.strictEqual(result.length, 3);
    assert.strictEqual(result[0].name, 'Maria Aparecida');
    assert.strictEqual(result[0].phone, '(32) 99123-4567');
    assert.strictEqual(result[1].name, 'Roberto Carlos');
    assert.strictEqual(result[1].phone, '(32) 98765-4321');
    assert.strictEqual(result[2].name, 'Juliana Mendes');
    assert.strictEqual(result[2].email, 'juliana@mendes.com.br');
  });

});
