# Roadmap Executivo: Modificações Implementadas Hoje & Próximas Etapas
**Jorge Alvim Advocacia & Legaltech**  
**Advogado Responsável:** Dr. Jorge Eduardo da Silva Alvim • OAB/MG 222.943  
**Data:** 06 de Setembro de 2026 • Juiz de Fora - MG  
**Conformidade:** Provimento 205/2021 da OAB e LGPD (Lei 13.709/2018)

---

## 1. Modificações Implementadas Hoje (100% Concluídas & Testadas)

| Item | Módulo / Aba | O que foi Implementado | Benefício / Impacto Prático | Status |
| :--- | :--- | :--- | :--- | :---: |
| **1. Hero Modernizado** | Site Principal (`index.html`) | Novos botões de ação rápida `⚡ Consulta Express` e `👤 Área do Cliente`. Card de destaque executivo: *"Já é nosso cliente? Acompanhe o andamento do seu caso em tempo real"*. | Melhora a conversão de novos visitantes e direciona clientes antigos imediatamente para o autoatendimento. | ✅ **Concluído** |
| **2. Consulta Express (3 Campos)** | Seção Contato (`index.html`) | Formulário enxuto (Nome, WhatsApp, Área de Interesse e Resumo da Dúvida) integrado à API local `POST /api/leads`. | Gera protocolo automático (`#JA-2026-XXXX`) e encaminha a mensagem pré-formatada no WhatsApp do advogado. | ✅ **Concluído** |
| **3. Balão Cordial WhatsApp** | Botão Flutuante (`index.html`) | Balão de boas-vindas com indicador pulsante online (*"Dr. Jorge Alvim Online - Dúvidas sobre seu processo? Fale conosco"*). | Atendimento cordial e acolhedor, com botão de fechar acessível, sem mercantilização (Prov. 205/2021 OAB). | ✅ **Concluído** |
| **4. Meus Documentos & Fotos** | Portal do Cliente (`cliente.html`) | Nova aba dedicada com contador dinâmico e caixa para upload de fotos de documentos direto do celular (câmera/galeria) ou desktop. | O cliente não precisa ir ao escritório levar xerox; anexa fotos de RG, CPF e comprovantes direto do smartphone. | ✅ **Concluído** |
| **5. Esteira Sem Juridiquês** | Portal do Cliente (`cliente.html`) | Accordion didático em 5 etapas explicando a jornada do processo judicial de forma simples e transparente. | Diminui drasticamente as ligações repetitivas de *"como está meu processo?"*. | ✅ **Concluído** |
| **6. Notificações WhatsApp com Autorização do Advogado** | Painel de Processos (`painel.html` + Backend) | Botão `📲 WhatsApp` em cada andamento judicial. O advogado abre a modal, revisa a mensagem sem juridiquês e clica em `✅ Autorizar & Disparar`. | Zero mensagens enviadas sem o consentimento do advogado. Registro com data/hora em auditoria (`whatsapp_notified_at`). | ✅ **Concluído** |
| **7. Disparo do Kit Inicial (Procuração, Contrato e Hipossuficiência)** | Módulo de Documentos (`legal-docs` + `assinar.html`) | Geração com 1 clique de Procuração Ad Judicia (art. 105 CPC), Contrato de Honorários e Declaração de Hipossuficiência (art. 98 CPC). | Envia links individuais no WhatsApp do cliente para assinar com o dedo na tela com plena validade jurídica. | ✅ **Concluído** |
| **8. Suíte de Testes Automatizados** | Qualidade & Segurança (`tests/api.test.js`) | Testes cobrindo endpoints de autenticação, leads, documentos, prazos e notificações de andamento. | **80 testes passando com 100% de aprovação** (`npm test`). Estabilidade garantida no contêiner Docker local. | ✅ **Concluído** |

---

## 2. O que Falta Fazer (Roadmap de Próximas Modificações)

### Detalhamento das Próximas Fases:

| Prioridade | Funcionalidade | Descrição Técnica & Operacional | Esforço Estimado |
| :---: | :--- | :--- | :---: |
| **Fase 1 (Mais Imediata)** | **Confirmação Automática de Assinatura & Arquivamento** | Assim que o cliente assina no celular em `assinar.html`, o sistema marca `✓ Assinado` no Painel, arquiva a via com hash SHA-256 e avisa o advogado em tempo real. | **1 a 2 dias** |
| **Fase 2** | **Seleção Individual de Documentos no Kit Inicial** | Permitir ao Dr. Jorge escolher na modal se deseja disparar os 3 documentos juntos ou apenas um deles (ex: só Procuração, ou apenas Contrato para PJ). | **1 dia** |
| **Fase 3** | **FAQ Inteligente (Perguntas Frequentes) no Site** | Seção interativa em `index.html` respondendo dúvidas comuns de Juiz de Fora (prazo de ação trabalhista, documentos para aposentadoria, honorários no êxito). Melhora o SEO no Google. | **1 a 2 dias** |
| **Fase 4** | **Calculadoras Jurídicas Interativas (Ímã de Leads)** | Simulador rescisório e de contribuição previdenciária onde o visitante calcula sua estimativa e clica para enviar o relatório ao Dr. Jorge no WhatsApp. | **3 a 4 dias** |
| **Fase 5** | **Recibo de Prestação de Contas de Alvarás / RPV** | Lançamento do valor bruto do alvará levantado, desconto automático dos honorários e emissão com 1 clique do Recibo de Prestação de Contas com valor por extenso. | **2 dias** |

---

## 3. Conformidade Rigorosa com a OAB e a LGPD

- **Provimento 205/2021 da OAB:** O marketing jurídico implementado é exclusivamente informativo e educativo, preservando a sobriedade e moderação da profissão, sem promessa de resultado nem mercantilização.
- **LGPD (Lei 13.709/2018):** Todos os dados coletados (Leads, Clientes e Documentos) são protegidos por sigilo advocatício, com tokens de expiração temporária e controle de acesso baseado em papéis (RBAC).
