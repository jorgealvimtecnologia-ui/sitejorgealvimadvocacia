import http from 'http';

function request(options, data) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, res => {
      let raw = '';
      res.on('data', chunk => raw += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(raw) });
        } catch (e) {
          resolve({ status: res.statusCode, raw });
        }
      });
    });
    req.on('error', reject);
    if (data) req.write(typeof data === 'string' ? data : JSON.stringify(data));
    req.end();
  });
}

async function runMasterTestSuite() {
  console.log('====================================================');
  console.log('🧪 INICIANDO SUITE DE TESTES INTEGRADA DO SISTEMA');
  console.log('====================================================\n');

  let passedTests = 0;
  let totalTests = 0;

  function assert(condition, message) {
    totalTests++;
    if (condition) {
      console.log(`  ✅ [PASSOU] ${message}`);
      passedTests++;
    } else {
      console.error(`  ❌ [FALHOU] ${message}`);
    }
  }

  // 1. Teste de Autenticação Mestre
  console.log('1. [MÓDULO AUTH] Testando Login do Usuário Mestre...');
  const loginRes = await request({
    hostname: 'localhost',
    port: 3000,
    path: '/api/auth/login',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, { username: 'jorgealvimtecnologia', password: 'jorgealvim' });

  assert(loginRes.status === 200 && loginRes.data.success === true, 'Login Mestre (jorgealvimtecnologia / jorgealvim) retornou HTTP 200');
  const token = loginRes.data.token;
  assert(Boolean(token), 'Token JWT de sessão gerado com sucesso');

  const authHeaders = {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  };

  // 2. Teste /api/auth/me
  console.log('\n2. [MÓDULO AUTH] Testando Validação de Sessão (/api/auth/me)...');
  const meRes = await request({
    hostname: 'localhost',
    port: 3000,
    path: '/api/auth/me',
    method: 'GET',
    headers: authHeaders
  });
  assert(meRes.status === 200 && meRes.data.user.username === 'jorgealvimtecnologia', 'Sessão do operador identificada corretamente');

  // 3. Teste Módulo Foguetes: Estatísticas
  console.log('\n3. [MÓDULO FOGUETES] Testando Estatísticas e Destinatários...');
  const rocketStats = await request({
    hostname: 'localhost',
    port: 3000,
    path: '/api/rockets/stats',
    method: 'GET',
    headers: authHeaders
  });
  assert(rocketStats.status === 200 && rocketStats.data.success === true, 'KPIs de Foguetes retornaram com sucesso');

  const rocketRecipients = await request({
    hostname: 'localhost',
    port: 3000,
    path: '/api/rockets/recipients',
    method: 'GET',
    headers: authHeaders
  });
  assert(rocketRecipients.status === 200 && Array.isArray(rocketRecipients.data.recipients), 'Lista de destinatários de foguetes carregada');

  // 4. Teste Módulo Foguetes: Lançamento e Respostas Rápidas
  console.log('\n4. [MÓDULO FOGUETES] Testando Lançamento, Resposta "Ciente" e "Missão Cumprida"...');
  const rocketCreate = await request({
    hostname: 'localhost',
    port: 3000,
    path: '/api/rockets',
    method: 'POST',
    headers: authHeaders
  }, {
    recipient_id: 'all',
    recipient_name: 'Toda a Equipe',
    recipient_type: 'all',
    subject: 'Petição do Processo Silva',
    message: 'Favor conferir e protocolar no PJe até as 17h.',
    message_type: 'execucao',
    priority: 'urgente'
  });
  assert(rocketCreate.status === 201 && rocketCreate.data.rocket?.protocol_number, `Foguete criado com protocolo #${rocketCreate.data.rocket?.protocol_number}`);
  const rocketId = rocketCreate.data.rocket.id;

  const replyCiente = await request({
    hostname: 'localhost',
    port: 3000,
    path: `/api/rockets/${rocketId}/reply`,
    method: 'POST',
    headers: authHeaders
  }, { reply_type: 'ciente' });
  assert(replyCiente.status === 200 && replyCiente.data.rocket.status === 'ciente', 'Ação rápida "👁️ Ciente" atualizou o status para "ciente"');

  const replyDone = await request({
    hostname: 'localhost',
    port: 3000,
    path: `/api/rockets/${rocketId}/reply`,
    method: 'POST',
    headers: authHeaders
  }, { reply_type: 'missao_cumprida' });
  assert(replyDone.status === 200 && replyDone.data.rocket.status === 'missao_cumprida', 'Ação rápida "🎯 Missão Cumprida" atualizou o status');

  // 5. Teste Módulo Clientes
  console.log('\n5. [MÓDULO CLIENTES] Testando Listagem de Clientes...');
  const clientsRes = await request({
    hostname: 'localhost',
    port: 3000,
    path: '/api/clients',
    method: 'GET',
    headers: authHeaders
  });
  assert(clientsRes.status === 200 && Array.isArray(clientsRes.data.clients || clientsRes.data), 'Listagem de clientes ativa');

  // 6. Teste Módulo Processos Judiciais
  console.log('\n6. [MÓDULO PROCESSOS] Testando Listagem de Processos...');
  const lawsuitsRes = await request({
    hostname: 'localhost',
    port: 3000,
    path: '/api/lawsuits',
    method: 'GET',
    headers: authHeaders
  });
  assert(lawsuitsRes.status === 200, 'Endpoint de processos judiciais ativo');

  // 7. Teste Módulo Agenda / Calendário
  console.log('\n7. [MÓDULO AGENDA] Testando Resumo do Calendário...');
  const calRes = await request({
    hostname: 'localhost',
    port: 3000,
    path: '/api/calendar/summary',
    method: 'GET',
    headers: authHeaders
  });
  assert(calRes.status === 200, 'Resumo do calendário e prazos ativo');

  // 8. Teste Módulo RH / Pessoal
  console.log('\n8. [MÓDULO RH] Testando Listagem de Colaboradores...');
  const hrRes = await request({
    hostname: 'localhost',
    port: 3000,
    path: '/api/hr/employees',
    method: 'GET',
    headers: authHeaders
  });
  assert(hrRes.status === 200, 'Módulo de colaboradores e RH ativo');

  // 9. Teste Módulo Auditoria
  console.log('\n9. [MÓDULO AUDITORIA] Testando Trilha de Auditoria...');
  const auditRes = await request({
    hostname: 'localhost',
    port: 3000,
    path: '/api/admin/audit-logs',
    method: 'GET',
    headers: authHeaders
  });
  assert(auditRes.status === 200, 'Trilha de auditoria e compliance ativa');

  console.log('\n====================================================');
  console.log(`📊 RESULTADO FINAL: ${passedTests}/${totalTests} TESTES APROVADOS (${Math.round((passedTests/totalTests)*100)}%)`);
  console.log('====================================================\n');

  if (passedTests === totalTests) {
    console.log('🏆 SISTEMA 100% OPERACIONAL E HOMOLOGADO COM SUCESSO!');
  } else {
    process.exitCode = 1;
  }
}

runMasterTestSuite().catch(err => {
  console.error('Erro na execução dos testes:', err);
  process.exit(1);
});
