/**
 * SEED EM MASSA (só para testes de comportamento / volume).
 * Insere muitos registros fictícios no leads.db LOCAL, com id prefixo "BULK-"
 * para poder limpar depois:  node scripts/seed-bulk.js --clean
 * ⚠️ NÃO rode em produção.
 */
import { DatabaseSync } from 'node:sqlite';
import path from 'path';
import { fileURLToPath } from 'url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const db = new DatabaseSync(path.join(__dirname, '..', 'leads.db'));
const now = new Date().toISOString();
const clean = process.argv.includes('--clean');
const cols = (t) => { try { return db.prepare(`PRAGMA table_info(${t})`).all().map(c => c.name); } catch { return []; } };
const has = (t) => cols(t).length > 0;
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const rint = (a, b) => Math.floor(a + Math.random() * (b - a + 1));
const money = (a, b) => (rint(a, b) + Math.random()).toFixed(2);
const dateOff = (d) => new Date(Date.now() + d * 86400000).toISOString();
const ymd = (d) => new Date(Date.now() + d * 86400000).toISOString().slice(0, 10);
const cpf = () => `${rint(100,999)}.${rint(100,999)}.${rint(100,999)}-${rint(10,99)}`;
const cnpj = () => `${rint(10,99)}.${rint(100,999)}.${rint(100,999)}/0001-${rint(10,99)}`;
const fone = () => `(32) 9${rint(1000,9999)}-${rint(1000,9999)}`;

const NOMES = ['Ana','Bruno','Carla','Diego','Elaine','Fábio','Gabriela','Hugo','Isabela','João','Karina','Lucas','Marina','Nelson','Olívia','Paulo','Queila','Rafael','Sônia','Tiago','Úrsula','Vitor','Wesley','Ximena','Yuri','Zélia','Beatriz','Caio','Daniela','Eduardo'];
const SOBRE = ['Silva','Souza','Oliveira','Santos','Pereira','Costa','Almeida','Ferreira','Rodrigues','Gomes','Martins','Araújo','Barbosa','Ribeiro','Carvalho','Lima','Fonseca','Alvim','Medeiros','Vasconcelos'];
const AREAS = ['Direito Militar','Direito de Trânsito','Direito Civil','Direito de Família','Direito Trabalhista','Direito Previdenciário','Direito do Consumidor','Direito Bancário'];
const TRIBUNAIS = ['TJMG','TRF6','TRT3','STJ','STF','TJSP'];
const CIDADES = ['Juiz de Fora','Belo Horizonte','Barbacena','Ubá','Muriaé','São João del-Rei','Viçosa','Cataguases'];
const nome = () => `${pick(NOMES)} ${pick(SOBRE)} ${pick(SOBRE)}`;

let __err = 0;
function insert(table, obj) {
  const c = cols(table); const keys = Object.keys(obj).filter(k => c.includes(k));
  if (!keys.length) return false;
  const sql = `INSERT OR REPLACE INTO ${table} (${keys.join(',')}) VALUES (${keys.map(()=>'?').join(',')})`;
  try { db.prepare(sql).run(...keys.map(k => obj[k])); return true; }
  catch (e) { if (__err < 3) console.warn('  ⚠️ '+table+': '+e.message); __err++; return false; }
}
function cleanTable(t) { try { db.prepare(`DELETE FROM ${t} WHERE id LIKE 'BULK-%'`).run(); } catch {} try { if (cols(t).includes('notes')) db.prepare(`DELETE FROM ${t} WHERE notes LIKE '%[BULK-DEMO]%'`).run(); } catch {} }

const TABLES = ['clients','lawsuits','contract_installments','financial_transactions','calendar_events','hr_employees','court_publications','leads','nfse_invoices','kanban_cards'];
TABLES.forEach(cleanTable);
if (clean) { console.log('🧹 Registros BULK- removidos.'); process.exit(0); }

let n = 0;
// 45 clientes
const clientIds = [];
for (let i = 0; i < 45; i++) {
  const id = `BULK-CLI-${String(i+1).padStart(3,'0')}`; clientIds.push(id);
  const pj = Math.random() < 0.25; const cv = +money(2000, 40000); const paid = +money(0, cv);
  if (insert('clients', { id, client_type: pj?'PJ':'PF', full_name: pj?`${pick(SOBRE)} & ${pick(SOBRE)} Ltda`:nome(), cpf: pj?'':cpf(), cnpj: pj?cnpj():'', email: `demo${i}@exemplo.com`, phone: fone(), city: pick(CIDADES), state:'MG', contract_value: cv, installments_count: rint(1,12), installment_value: (cv/rint(1,12)).toFixed(2), amount_paid: paid, balance_due: Math.max(0,cv-paid), contract_status: pick(['Ativo','Ativo','Concluído','Suspenso']), created_at: dateOff(-rint(1,400)), updated_at: now })) n++;
}
// 35 processos
for (let i = 0; i < 35; i++) {
  const id = `BULK-LAW-${String(i+1).padStart(3,'0')}`;
  insert('lawsuits', { id, client_id: pick(clientIds), cnj_number: `${rint(1000000,9999999)}-${rint(10,99)}.2026.8.13.${rint(1000,9999)}`, tribunal: pick(TRIBUNAIS), instance: pick(['1º Grau','2º Grau']), action_type: pick(AREAS), subject: 'Ação '+pick(AREAS), status: pick(['Ativo','Ativo','Suspenso','Arquivado']), distribution_date: ymd(-rint(1,600)), created_at: dateOff(-rint(1,300)), updated_at: now }) && n++;
}
// 70 parcelas
for (let i = 0; i < 70; i++) {
  const paid = Math.random()<0.5;
  insert('contract_installments', { client_id: pick(clientIds), installment_number: rint(1,12), total_installments: 12, amount: +money(200,3000), due_date: ymd(rint(-90,120)), paid_date: paid?ymd(-rint(1,60)):'', status: paid?'Pago':'Pendente', notes:'[BULK-DEMO]', created_at: now, updated_at: now }) && n++;
}
// 60 lançamentos financeiros
for (let i = 0; i < 60; i++) {
  const id = `BULK-FIN-${String(i+1).padStart(3,'0')}`; const ent = Math.random()<0.6;
  insert('financial_transactions', { id, type: ent?'Entrada':'Saída', category: ent?'Honorários':pick(['Aluguel','Material','Impostos','Salários']), description: (ent?'Honorários ':'Despesa ')+pick(AREAS), amount: +money(150,8000), due_date: ymd(rint(-60,90)), payment_date: Math.random()<0.5?ymd(-rint(1,40)):'', status: pick(['Pago','Pendente','Pago']), client_id: pick(clientIds), created_at: now, updated_at: now }) && n++;
}
// 40 eventos de agenda
for (let i = 0; i < 40; i++) {
  const id = `BULK-EVT-${String(i+1).padStart(3,'0')}`; const t = pick(['audiencia','prazo','reuniao','diligencia']);
  insert('calendar_events', { id, title: (t==='audiencia'?'Audiência ':t==='prazo'?'Prazo fatal ':'Compromisso ')+pick(AREAS), description:'Evento de demonstração', event_type: t, start_datetime: dateOff(rint(-20,40)), end_datetime: dateOff(rint(-20,40)), status: pick(['agendado','concluido','agendado']), created_at: now, updated_at: now }) && n++;
}
// 20 colaboradores
for (let i = 0; i < 20; i++) {
  const id = `BULK-EMP-${String(i+1).padStart(3,'0')}`;
  insert('hr_employees', { id, name: nome(), cpf: cpf(), position: pick(['Advogado(a)','Estagiário(a)','Secretária','Auxiliar','Financeiro','Motorista']), department: pick(['Jurídico','Administrativo','Financeiro']), base_salary: +money(1500,12000), contract_type: pick(['CLT','ESTAGIO','ASSOCIADO']), admission_date: ymd(-rint(30,1200)), status: pick(['ativo','ativo','ativo','desligado']), created_at: now, updated_at: now }) && n++;
}
// 50 intimações
for (let i = 0; i < 50; i++) {
  const id = `BULK-PUB-${String(i+1).padStart(3,'0')}`;
  insert('court_publications', { id, comunicacao_id: rint(700000000,799999999), numero_processo: `${rint(1000000,9999999)}-${rint(10,99)}.2026.8.13.${rint(1000,9999)}`, sigla_tribunal: pick(TRIBUNAIS), tipo_comunicacao: pick(['Intimação','Citação','Despacho','Sentença']), data_disponibilizacao: ymd(-rint(1,60)), texto: 'Intimação de demonstração referente a '+pick(AREAS)+'.', advogado_oab:'222943', advogado_nome:'Dr. Jorge Alvim', status: pick(['nao_lido','lido','nao_lido']), created_at: now, updated_at: now }) && n++;
}
// 40 leads
for (let i = 0; i < 40; i++) {
  const id = `BULK-LEAD-${String(i+1).padStart(3,'0')}`;
  insert('leads', { id, name: nome(), phone: fone(), area: pick(AREAS), message: 'Gostaria de uma orientação sobre '+pick(AREAS)+'.', status: pick(['novo','em_contato','convertido','novo']), created_at: dateOff(-rint(0,90)) }) && n++;
}
// 18 cartões kanban
if (has('kanban_cards')) for (let i = 0; i < 18; i++) {
  const id = `BULK-KAN-${String(i+1).padStart(3,'0')}`;
  insert('kanban_cards', { id, title: pick(['Protocolar','Elaborar','Revisar','Responder','Analisar'])+' '+pick(AREAS), column_key: pick(['todo','doing','waiting','done']), priority: pick(['normal','importante','urgente','critico']), w_what:'Tarefa de demonstração', w_who:'Dr. Jorge', deadline: ymd(rint(1,30)), order_index: i, created_at: now, updated_at: now }) && n++;
}
// 12 NFS-e
for (let i = 0; i < 12; i++) {
  const v=+money(200,5000);
  insert('nfse_invoices', { client_id: pick(clientIds), invoice_type: pick(['NFSE_ASAAS','RECIBO_OAB_RPS']), invoice_number: 'BK'+rint(1000,9999), status: pick(['Emitida','Pendente','Emitida']), value: v, net_value: +(v*0.95).toFixed(2), issue_date: ymd(-rint(1,90)), notes:'[BULK-DEMO]', created_at: now, updated_at: now }) && n++;
}

db.close();
console.log(`✅ Seed em massa concluído: ${n} registros fictícios inseridos (prefixo BULK-).`);
console.log('   Para limpar depois:  node scripts/seed-bulk.js --clean');
