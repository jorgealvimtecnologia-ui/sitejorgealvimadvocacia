import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.join(__dirname, '..');

console.log('\n================================================================');
console.log('🎭 AUDITORIA DE PRODUÇÃO PLAYWRIGHT (CHECKLIST DE PÁGINAS)');
console.log('   Jorge Alvim Advocacia & Tecnologia - QA Automation');
console.log('================================================================\n');

const testArgs = ['playwright', 'test', 'e2e/production-checklist.spec.js', '--reporter=list'];

const proc = spawn('npx', testArgs, {
  cwd: projectRoot,
  stdio: 'inherit',
  env: { ...process.env, CI: '1' }
});

proc.on('close', (code) => {
  if (code === 0) {
    console.log('\n================================================================');
    console.log('✨ [SUCESSO] Todas as páginas passaram no Checklist de Produção!');
    console.log('   - Resposta HTTP 200 confirmada em todas as rotas');
    console.log('   - 0 erros de JavaScript no Console');
    console.log('   - 0 requisições de rede falhas');
    console.log('   - Responsividade Mobile e Meta Tags validadas');
    console.log('================================================================\n');
  } else {
    console.error(`\n⚠️ O checklist finalizou com código de saída: ${code}`);
  }
  process.exit(code);
});
