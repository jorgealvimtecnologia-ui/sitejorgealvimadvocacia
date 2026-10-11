#!/usr/bin/env node
/**
 * Criptografia dos documentos em repouso (AUD-12) — ferramenta de linha de comando.
 *
 *   node scripts/docs-encrypt-all.js gerar-chave        mostra uma chave NOVA (32 bytes, base64) para você guardar
 *   node scripts/docs-encrypt-all.js status             quantos arquivos estão em texto puro e quantos cifrados
 *   node scripts/docs-encrypt-all.js cifrar             SIMULA: lista o que seria cifrado (não altera nada)
 *   node scripts/docs-encrypt-all.js cifrar --aplicar   cifra os arquivos em texto puro (confere cada um antes de trocar)
 *   node scripts/docs-encrypt-all.js verificar          decifra TUDO em memória e confere as etiquetas (não altera nada)
 *   node scripts/docs-encrypt-all.js decifrar --aplicar volta tudo ao texto puro (emergência / troca de chave)
 *
 * A chave vem de DOC_ENC_KEY (cofre do servidor). Colocar a chave no cofre:
 *   node scripts/docs-encrypt-all.js gerar-chave   (anote no gerenciador de senhas) e depois
 *   node scripts/env-vault.js set DOC_ENC_KEY       (cole a chave; ela vai direto ao cofre)
 * PERDER A CHAVE = PERDER OS DOCUMENTOS CIFRADOS. Guarde uma cópia no Bitwarden ANTES de cifrar.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import '../src/config/load-env.js';
import { getDocKey, generateDocKey, isEncryptedFile, encryptFileInPlace, decryptFileInPlace, createDecryptReadStream } from '../src/shared/file-vault.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIRS = ['storage/clients', 'storage/office_drive'].map((d) => path.join(ROOT, d));

export function listFiles(dirs = DIRS) {
  const out = [];
  const walk = (d) => {
    if (!fs.existsSync(d)) return;
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.isFile() && !/\.(enc|dec)-tmp$/.test(e.name)) out.push(p);
    }
  };
  dirs.forEach(walk);
  return out;
}

function drain(stream) {
  return new Promise((resolve, reject) => {
    stream.on('data', () => {});
    stream.on('end', resolve);
    stream.on('error', reject);
  });
}

async function main() {
  const [cmd, ...rest] = process.argv.slice(2);
  const aplicar = rest.includes('--aplicar');

  if (cmd === 'gerar-chave') {
    console.log('\nChave NOVA (guarde no gerenciador de senhas; não envie por e-mail, chat nem documento):\n');
    console.log(`  ${generateDocKey()}\n`);
    console.log('Depois: node scripts/env-vault.js set DOC_ENC_KEY   (cole a chave quando pedir)\n');
    return 0;
  }

  const files = listFiles();
  const enc = files.filter((f) => isEncryptedFile(f));
  const plain = files.filter((f) => !isEncryptedFile(f));

  if (!cmd || cmd === 'status') {
    console.log(`\nDocumentos: ${files.length} arquivo(s) — ${enc.length} cifrado(s), ${plain.length} em texto puro.`);
    console.log(`Chave DOC_ENC_KEY no cofre: ${getDocKey() ? 'SIM (novos envios já saem cifrados)' : 'NÃO (recurso desligado)'}\n`);
    return 0;
  }

  let key = null;
  try { key = getDocKey(); } catch (e) { console.error(`✗ ${e.message}`); return 1; }
  if (!key) { console.error('✗ DOC_ENC_KEY não está configurada. Veja o cabeçalho deste script (gerar-chave e env-vault set).'); return 1; }

  if (cmd === 'verificar') {
    let bad = 0;
    for (const f of enc) {
      try { await drain(createDecryptReadStream(f, key)); } catch { bad++; console.error(`✗ falhou: ${path.relative(ROOT, f)}`); }
    }
    console.log(`\nVerificação: ${enc.length - bad}/${enc.length} cifrado(s) íntegros e legíveis com a chave atual.\n`);
    return bad ? 1 : 0;
  }

  if (cmd === 'cifrar') {
    if (!aplicar) {
      console.log(`\nSIMULAÇÃO: ${plain.length} arquivo(s) seriam cifrados (${enc.length} já cifrados). Nada foi alterado.`);
      console.log('Para valer: node scripts/docs-encrypt-all.js cifrar --aplicar   (faça um backup antes: bash backup.sh)\n');
      return 0;
    }
    let ok = 0, falhas = 0;
    for (const f of plain) {
      try { await encryptFileInPlace(f, key); ok++; } catch (e) { falhas++; console.error(`✗ ${path.relative(ROOT, f)}: ${e.message}`); }
    }
    console.log(`\nCifrados: ${ok}. Falhas: ${falhas} (os originais das falhas continuam intactos).\n`);
    return falhas ? 1 : 0;
  }

  if (cmd === 'decifrar') {
    if (!aplicar) { console.log(`\nSIMULAÇÃO: ${enc.length} arquivo(s) voltariam ao texto puro. Use --aplicar para valer.\n`); return 0; }
    let ok = 0, falhas = 0;
    for (const f of enc) {
      try { await decryptFileInPlace(f, key); ok++; } catch (e) { falhas++; console.error(`✗ ${path.relative(ROOT, f)}: ${e.message}`); }
    }
    console.log(`\nDecifrados: ${ok}. Falhas: ${falhas}.\n`);
    return falhas ? 1 : 0;
  }

  console.error('Comando desconhecido. Use: gerar-chave | status | cifrar [--aplicar] | verificar | decifrar [--aplicar]');
  return 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exit(await main());
}
