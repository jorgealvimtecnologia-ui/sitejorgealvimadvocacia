#!/usr/bin/env node
/**
 * ==============================================================================
 * ADMINISTRAÇÃO DO COFRE DO .env (segredos criptografados em repouso)
 * ==============================================================================
 *   node scripts/env-vault.js status  [--dir=.]
 *   node scripts/env-vault.js gen-key [--arquivo=/etc/advocacia/env.key] [--mostrar]
 *   node scripts/env-vault.js migrate [--dir=.] [--gerar-chave]
 *   node scripts/env-vault.js set NOME [valor] [--dir=.]   (sem valor, lê da entrada padrão)
 *   node scripts/env-vault.js decrypt [--dir=.]            (imprime o conteúdo; cuidado com o terminal)
 *
 * Como funciona: os SEGREDOS (chaves de API, senhas, tokens) ficam em .env.enc,
 * criptografados. O .env em texto puro guarda só configuração pública. A chave do
 * cofre fica FORA do projeto (padrão /etc/advocacia/env.key, permissão 600) — nunca
 * no repositório, nunca em backup, nunca por e-mail. Guarde uma cópia da chave no seu
 * cofre de senhas: sem ela o .env.enc não abre.
 *
 * Toda alteração feita aqui dispara o e-mail ao titular (cofre criptografado +
 * relatório só com nomes), o mesmo do vigia do servidor (src/shared/env-watch.js).
 * ==============================================================================
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  DEFAULT_KEY_FILE,
  PLAIN_FILE,
  VAULT_FILE,
  decryptEnv,
  encryptEnv,
  isSecretName,
  loadEnvironment,
  parseEnvText,
  readVaultKey,
  serializeEnv,
} from '../src/shared/env-vault.js';

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC_HEADER =
  '# Somente configuração NÃO secreta. Os segredos ficam criptografados em .env.enc\n# (administre com: node scripts/env-vault.js).\n';

/**
 * Rodando como root (migração no servidor), os arquivos gerados ficariam de root e o SERVIÇO (www-data) não
 * conseguiria ler o .env, o .env.enc nem a chave: o site cairia em ciclo de reinício (EACCES). Por isso o dono
 * é copiado de uma pasta do projeto que o serviço usa (src/). Fora do root não faz nada.
 */
export function chownLike(file, refPath, { getuid = process.getuid?.bind(process), fsImpl = fs } = {}) {
  try {
    if (typeof getuid !== 'function' || getuid() !== 0) return false;
    const ref = fsImpl.statSync(refPath);
    fsImpl.chownSync(file, ref.uid, ref.gid);
    return true;
  } catch {
    return false; // sem pasta de referência (ex.: teste) ou sistema sem chown
  }
}

function writeAtomic(file, content) {
  const tmp = `${file}.novo`;
  fs.writeFileSync(tmp, content, { mode: 0o600 });
  fs.renameSync(tmp, file);
  try {
    fs.chmodSync(file, 0o600);
  } catch {
    /* sistemas sem chmod */
  }
  chownLike(file, path.join(ROOT_DIR, 'src'));
}

/** Igualdade por nome e valor (o parseEnv do Node não preserva a ordem das chaves). */
const sameVars = (a, b) => {
  const ka = Object.keys(a);
  return ka.length === Object.keys(b).length && ka.every((k) => k in b && a[k] === b[k]);
};

const readVars = (file) => (fs.existsSync(file) ? parseEnvText(fs.readFileSync(file, 'utf8')) : {});

/** Chave do cofre; erro claro se não existir. */
function requireKey(env) {
  const key = readVaultKey({ env });
  if (!key) {
    throw new Error(
      `Chave do cofre não encontrada. Gere com: node scripts/env-vault.js gen-key  (ou defina ENV_VAULT_KEY / ENV_VAULT_KEY_FILE).`
    );
  }
  return key;
}

/** Cria o arquivo da chave (48 bytes aleatórios, permissão 600). Nunca sobrescreve. */
export function genKey({ file = process.env.ENV_VAULT_KEY_FILE || DEFAULT_KEY_FILE } = {}) {
  if (fs.existsSync(file))
    throw new Error(`Já existe uma chave em ${file}. Não vou sobrescrever (isso tornaria o .env.enc ilegível).`);
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  const key = crypto.randomBytes(48).toString('base64');
  fs.writeFileSync(file, `${key}\n`, { flag: 'wx', mode: 0o600 });
  try {
    fs.chmodSync(file, 0o600);
  } catch {
    /* sistemas sem chmod */
  }
  chownLike(file, path.join(ROOT_DIR, 'src'));
  chownLike(path.dirname(file), path.join(ROOT_DIR, 'src'));
  return { file, key };
}

/** Situação do ambiente: só nomes, nunca valores. */
export function status({ dir = ROOT_DIR, env = process.env } = {}) {
  const plain = readVars(path.join(dir, PLAIN_FILE));
  const out = {
    plainSecrets: Object.keys(plain).filter((k) => isSecretName(k) && String(plain[k]).trim() !== ''),
    plainPublic: Object.keys(plain).filter((k) => !isSecretName(k)),
    vault: false,
    vaultNames: [],
    keyOk: false,
    error: null,
  };
  const vaultFile = path.join(dir, VAULT_FILE);
  if (fs.existsSync(vaultFile)) {
    out.vault = true;
    try {
      const key = readVaultKey({ env });
      out.keyOk = !!key;
      if (key) out.vaultNames = Object.keys(parseEnvText(decryptEnv(fs.readFileSync(vaultFile, 'utf8'), key)));
    } catch (e) {
      out.error = e.message;
    }
  }
  return out;
}

/**
 * Move os segredos do .env para o cofre. Seguro: grava o cofre, confere que abre e
 * que o ambiente efetivo é IDÊNTICO ao de antes, e só então reescreve o .env.
 */
export function migrate({ dir = ROOT_DIR, env = process.env, key } = {}) {
  const plainFile = path.join(dir, PLAIN_FILE);
  const vaultFile = path.join(dir, VAULT_FILE);
  if (!fs.existsSync(plainFile)) throw new Error(`Não há ${PLAIN_FILE} em ${dir}.`);
  const passphrase = key ?? requireKey(env);

  const plain = readVars(plainFile);
  const vault = fs.existsSync(vaultFile)
    ? parseEnvText(decryptEnv(fs.readFileSync(vaultFile, 'utf8'), passphrase))
    : {};
  const plainSecretNames = Object.keys(plain).filter((k) => isSecretName(k));
  const publicVars = Object.fromEntries(Object.entries(plain).filter(([k]) => !isSecretName(k)));

  // Valor efetivo hoje: cofre prevalece sobre o texto puro (mesma regra do carregador).
  const mergedSecrets = { ...Object.fromEntries(plainSecretNames.map((k) => [k, plain[k]])), ...vault };
  const before = {
    ...publicVars,
    ...vault,
    ...Object.fromEntries(plainSecretNames.filter((k) => !(k in vault)).map((k) => [k, plain[k]])),
  };

  const encrypted = encryptEnv(serializeEnv(mergedSecrets), passphrase);
  if (!sameVars(parseEnvText(decryptEnv(encrypted, passphrase)), mergedSecrets)) {
    throw new Error('A conferência do cofre falhou (ida e volta diferente). Nada foi alterado.');
  }
  const newPlain = PUBLIC_HEADER + serializeEnv(publicVars);

  writeAtomic(vaultFile, encrypted);
  writeAtomic(plainFile, newPlain);

  // Conferência final: o ambiente que o servidor vai carregar é igual ao de antes.
  const after = {};
  loadEnvironment({ dir, env: after, key: passphrase });
  const diff = Object.keys({ ...before, ...after }).filter((k) => before[k] !== after[k]);
  if (diff.length) throw new Error(`Conferência final divergiu em: ${diff.join(', ')}. Verifique o .env e o .env.enc.`);
  return { moved: Object.keys(mergedSecrets).sort(), kept: Object.keys(publicVars).sort() };
}

/** Define/atualiza uma variável: segredo vai para o cofre, o resto para o .env. */
export function setVar(name, value, { dir = ROOT_DIR, env = process.env, key } = {}) {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(String(name))) throw new Error(`Nome de variável inválido: ${name}`);
  const secret = isSecretName(name);
  if (secret) {
    const passphrase = key ?? requireKey(env);
    const vaultFile = path.join(dir, VAULT_FILE);
    const vault = fs.existsSync(vaultFile)
      ? parseEnvText(decryptEnv(fs.readFileSync(vaultFile, 'utf8'), passphrase))
      : {};
    vault[name] = String(value);
    writeAtomic(vaultFile, encryptEnv(serializeEnv(vault), passphrase));
    // Se havia uma cópia em texto puro no .env, remove (segredo não fica exposto).
    const plainFile = path.join(dir, PLAIN_FILE);
    const plain = readVars(plainFile);
    if (name in plain) {
      delete plain[name];
      writeAtomic(plainFile, PUBLIC_HEADER + serializeEnv(plain));
    }
  } else {
    const plainFile = path.join(dir, PLAIN_FILE);
    const plain = readVars(plainFile);
    plain[name] = String(value);
    writeAtomic(plainFile, serializeEnv(plain));
  }
  return { secret };
}

/** Avisa o titular por e-mail (melhor esforço; o servidor também detecta na próxima varredura). */
async function notify(dir, origem) {
  loadEnvironment({ dir }); // deixa o SMTP disponível ANTES de importar o e-mail
  const { checkEnvChange } = await import('../src/shared/env-watch.js');
  const r = await checkEnvChange({ dir, origem });
  const msg = {
    notificado: 'E-mail enviado ao titular com o cofre criptografado e o relatório.',
    baseline: 'E-mail de linha de base enviado ao titular.',
    'falha-envio':
      'E-mail NÃO enviado (SMTP não configurado ou falhou). O servidor tentará de novo na próxima varredura.',
    'sem-alteracao': 'Nenhuma alteração a notificar.',
    erro: `Não foi possível preparar o aviso: ${r.reason}`,
  }[r.status];
  console.log(`✉️  ${msg}`);
}

async function main() {
  const args = process.argv.slice(2);
  const flags = Object.fromEntries(
    args
      .filter((a) => a.startsWith('--'))
      .map((a) => {
        const [k, ...v] = a.slice(2).split('=');
        return [k, v.length ? v.join('=') : true];
      })
  );
  const pos = args.filter((a) => !a.startsWith('--'));
  const dir = path.resolve(flags.dir || ROOT_DIR);
  const cmd = pos[0];

  if (cmd === 'status') {
    const s = status({ dir });
    console.log(
      `\nCofre (.env.enc): ${s.vault ? `ATIVO (${s.vaultNames.length} variável(is))` : 'não ativo'}${s.vault && !s.keyOk ? ' — chave NÃO encontrada' : ''}`
    );
    if (s.error) console.log(`⚠ ${s.error}`);
    console.log(`Segredos em TEXTO PURO no .env: ${s.plainSecrets.length ? s.plainSecrets.join(', ') : 'nenhum ✓'}`);
    console.log(`Configuração pública no .env: ${s.plainPublic.length} variável(is)`);
    if (s.plainSecrets.length) console.log('\n➜ Migre para o cofre: node scripts/env-vault.js migrate --gerar-chave');
    process.exit(s.plainSecrets.length || s.error ? 1 : 0);
  }

  if (cmd === 'gen-key') {
    const { file, key } = genKey({ file: flags.arquivo || undefined });
    console.log(`\n✅ Chave do cofre criada em ${file} (permissão 600).`);
    if (flags.mostrar) console.log(`\nCHAVE (guarde no cofre de senhas e apague este terminal):\n${key}\n`);
    console.log('IMPORTANTE: guarde uma cópia desta chave no seu cofre de senhas. Sem ela o .env.enc não abre,');
    console.log(
      'e nem o servidor nem o e-mail de alteração conseguem recuperá-la. Rode com --mostrar para exibi-la uma vez.\n'
    );
    return;
  }

  if (cmd === 'migrate') {
    if (flags['gerar-chave'] && !readVaultKey({ env: process.env })) {
      const { file } = genKey({});
      console.log(
        `✅ Chave do cofre criada em ${file}. GUARDE UMA CÓPIA no seu cofre de senhas agora (como root: cat ${file}); sem ela o .env.enc não abre.`
      );
    }
    const r = migrate({ dir });
    console.log(
      `\n✅ Migração concluída.\n   Segredos agora criptografados em ${VAULT_FILE}: ${r.moved.join(', ') || '(nenhum)'}\n   Configuração pública mantida no ${PLAIN_FILE}: ${r.kept.join(', ') || '(nenhuma)'}`
    );
    console.log('\n➜ Reinicie o serviço para aplicar:  systemctl restart advocacia\n');
    await notify(dir, 'migração');
    return;
  }

  if (cmd === 'set') {
    const name = pos[1];
    let value = pos[2];
    if (!name) throw new Error('Uso: node scripts/env-vault.js set NOME [valor]');
    if (value === undefined) value = fs.readFileSync(0, 'utf8').replace(/\r?\n$/, '');
    const r = setVar(name, value, { dir });
    console.log(
      `✅ ${name} gravado ${r.secret ? `no cofre ${VAULT_FILE} (criptografado)` : `no ${PLAIN_FILE}`}. Reinicie o serviço para aplicar.`
    );
    await notify(dir, 'edição manual');
    return;
  }

  if (cmd === 'decrypt') {
    const key = requireKey(process.env);
    process.stdout.write(decryptEnv(fs.readFileSync(path.join(dir, VAULT_FILE), 'utf8'), key));
    return;
  }

  console.log('Uso: node scripts/env-vault.js <status|gen-key|migrate|set|decrypt> [opções]  (veja o topo do arquivo)');
  process.exit(cmd ? 1 : 0);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((e) => {
    console.error(`✖ ${e.message}`);
    process.exit(1);
  });
}
