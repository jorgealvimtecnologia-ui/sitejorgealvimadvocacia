# Parecer Técnico & Auditoria de Arquitetura Cloud
**Atuação:** Arquiteto de Soluções Cloud Sênior & Especialista em Engenharia de Software  
**Objeto:** Sistema de Gestão Jurídica e Portal do Cliente (*Jorge Alvim Advocacia*)  
**Parâmetros de Entrada:** Servidor VPS Contabo (Alemanha/Europa), SQLite em modo WAL, Node.js Dockerizado, Base em fase de construção/testes, Exclusão manual de dados LGPD sem expurgo automático.

---

## 1. Scorecard de Maturidade Arquitetural

| Pilar Computacional | Estado Real no Código | Nível de Risco | Veredito do Arquiteto |
| :--- | :--- | :---: | :--- |
| **1. Persistência & CRUD** | SQLite WAL com 41 índices em arquivo local `leads.db`. | 🟡 **Médio** | Ultra-rápido (<5ms), mas vulnerável sem réplica externa. |
| **2. Rede Internacional** | VPS Contabo em Frankfurt (RTT ~250ms p/ o Brasil). | 🔴 **Crítico** | Exige Cloudflare Edge p/ cache de estáticos no Brasil. |
| **3. Segredos & Auth** | Variáveis `.env` + JWT tokens com fallback estático. | 🟡 **Médio** | Blindar segredos de produção e rotatividade de chaves. |
| **4. LGPD vs Estatuto OAB** | `DELETE` físico no Portal do Cliente sem trava processual. | 🔴 **Crítico** | Substituir por Soft Delete e trava ética do Art. 16, I. |
| **5. Retenção de Arquivos** | Storage local acumulativo sem expurgo automático. | 🟡 **Médio** | Criar job cron de saneamento de anexos temporários. |

---

## 2. Persistência & Operações CRUD (SQLite WAL em Produção)

* **SQLite em Modo WAL (Write-Ahead Logging):** Para a escala de até 50.000 clientes e 100.000 andamentos, o SQLite com WAL é tecnicamente superior a um banco de dados gerenciado remoto, pois opera in-memory/NVMe sem tráfego TCP, atingindo leituras em microssegundos com consumo de memória inferior a 50 MB de RAM.
* **O Perigo do Hard Delete no Ramo Jurídico:** O código executa `DELETE FROM clients WHERE id = ?`. No direito, se um cliente excluir sua conta possuindo processos judiciais ativos, causa-se quebra de integridade referencial ou perda de acervo probatório. A solução mandatória é **Soft Delete** (`status = 'inativo_lgpd'` e `deleted_at TIMESTAMP`) com trava legal.

---

## 3. Infraestrutura Contabo (Alemanha) & Latência Transatlântica

* **Diagnóstico de Latência:** Servidores em Frankfurt possuem RTT de 220ms a 320ms para o Brasil. Em redes móveis 4G/5G, múltiplos round-trips para carregar arquivos CSS, JS e imagens degradam a experiência do usuário se não houver camada de borda.
* **Solução Enterprise Custo Zero (Cloudflare Edge):** Inserir o proxy reverso da Cloudflare na frente do VPS Contabo. Os arquivos estáticos passam a ser servidos dos data centers de São Paulo e Rio de Janeiro (<15ms). A Contabo processa unicamente as chamadas JSON de API (`/api/*`).
* **Disaster Recovery Plan (DRP 3-2-1):** O script `backup.sh` gera snapshots íntegros via `VACUUM INTO` e compacta o storage. Contudo, manter backups no mesmo disco da Contabo é ponto único de falha. Exige-se exportação criptografada para Google Drive ou AWS S3.

---

## 4. Integrações Críticas: Gateways de Cobrança e Tribunais

* **Idempotência de Pagamentos (Evitar Duplicidade de Cobrança):** Gateways (Asaas, Mercado Pago, etc.) reenviam Webhooks se houver atraso na resposta de `200 OK`. O sistema deve registrar uma tabela `processed_webhooks(event_id, processed_at)` garantindo que nenhuma baixa contratual seja duplicada.
* **Circuit Breaker em APIs Governamentais (DataJud/PJe):** Websockets e APIs de Tribunais sofrem indisponibilidades e bloqueios por rate limit. O sistema deve implementar tentativas com backoff exponencial e Circuit Breaker, evitando travamento do event loop do Node.js.

---

## 5. Segurança, Trava Ética OAB e Ciclo de Vida de Dados

* **Harmonização Art. 18 vs Art. 16, I da LGPD:** O direito de exclusão do titular cede perante a obrigação legal e regulatória do controlador (Art. 16, I). Advogados respondem pelos prazos prescricionais de 5 anos (CDC/Código Civil) e deveres éticos do Estatuto da OAB.
* **Regra de Bloqueio no Portal:** Se o cliente solicitar exclusão tendo processos ativos, o sistema rejeita automaticamente com aviso formal da LGPD e orienta a revogação formal de mandato junto ao patrono da causa.
* **Expurgo Automatizado de Documentos:** Criação de rotina diária no Node (cron job) para limpar da pasta `/storage/temp/` fotos e arquivos descartados ou abandonados há mais de 7 dias.

---

## 6. Matriz de Risco & Esforço Técnico

| Componente | Vulnerabilidade Diagnosticada | Severidade | Esforço Estimado | Ação de Engenharia Recomendada |
| :--- | :--- | :---: | :---: | :--- |
| **Exclusão de Conta** | `DELETE` direto apaga processos e histórico judicial | 🔴 **Alta** | 2 horas | Soft Delete + Trava OAB de processo ativo. |
| **Rede VPS Contabo** | Latência de 300ms perceptível em redes 4G brasileiras | 🔴 **Alta** | 2 horas | Ativar Cloudflare CDN/Proxy gratuito. |
| **Backup Off-site** | Snapshots ficam apenas no mesmo disco local | 🔴 **Alta** | 3 horas | Upload automático p/ Google Drive ou S3. |
| **Webhooks Pagamento** | Ausência de tabela de idempotência em retentativas | 🟡 **Média** | 4 horas | Filtro por `transaction_id` único. |
| **Storage Temporário** | Acúmulo de fotos e rascunhos não finalizados | 🟢 **Baixa** | 2 horas | Cron job diário de expurgo > 7 dias. |

---

## 7. Roadmap Executivo de Implementação em 3 Fases

### Fase 1: Blindagem de Dados e Rede (48 Horas)
1. Implementação de Soft Delete com trava do Art. 16, I da LGPD.
2. Ativação de Cloudflare Edge no Brasil para aceleração de rota e cache.
3. Backup externo automatizado (DRP 3-2-1).

### Fase 2: Confiabilidade de Integrações (7 Dias)
1. Tabela e filtro de idempotência em webhooks de pagamento (PIX/Boleto).
2. Circuit Breaker e retries com backoff em APIs judiciais (DataJud/PJe).
3. Auditoria rigorosa de segredos `.env`.

### Fase 3: Governança de Storage & Expurgo (15 Dias)
1. Cron job diário de expurgo de arquivos e fotos temporárias > 7 dias.
2. Rotina de anonimização periódica para clientes sem processos há mais de 5 anos.
3. Central de monitoramento de integridade e alertas.

---

### Parecer Final do Arquiteto
> A arquitetura **Node.js + SQLite WAL na Contabo** é altamente viável, rápida e de baixo custo. As 3 melhorias prioritárias da **Fase 1** garantem nível de segurança Enterprise e conformidade jurídica plena sem qualquer necessidade de contratação de provedores caros.
