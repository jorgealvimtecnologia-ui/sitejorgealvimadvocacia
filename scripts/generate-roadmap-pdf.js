import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

const htmlContent = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <title>Roadmap Executivo Integrado - Jorge Alvim Advocacia & LegalTech</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800;900&display=swap');
    
    @page {
      size: A4;
      margin: 10mm 12mm 12mm 12mm;
    }

    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }

    body {
      font-family: 'Plus Jakarta Sans', system-ui, -apple-system, sans-serif;
      color: #1e293b;
      background-color: #ffffff;
      font-size: 8.5pt;
      line-height: 1.35;
    }

    .page {
      position: relative;
      width: 100%;
      height: auto;
      page-break-after: always;
      padding-bottom: 20px;
    }
    .page:last-child {
      page-break-after: avoid;
    }

    /* Top Bar / Header */
    .header-container {
      border-bottom: 2px solid #0f172a;
      padding-bottom: 8px;
      margin-bottom: 10px;
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
    }

    .main-title {
      font-size: 15pt;
      font-weight: 900;
      color: #0a192f;
      letter-spacing: -0.5px;
      text-transform: uppercase;
    }

    .subtitle {
      font-size: 8.5pt;
      font-weight: 800;
      color: #b45309;
      letter-spacing: 0.5px;
      margin-top: 1px;
    }

    .meta-box {
      text-align: right;
      font-size: 7.5pt;
      color: #475569;
      line-height: 1.3;
    }
    .meta-box strong {
      color: #0f172a;
    }
    .badge-date {
      display: inline-block;
      background-color: #fef3c7;
      color: #92400e;
      padding: 2px 6px;
      border-radius: 4px;
      font-weight: 800;
      border: 1px solid #fde68a;
      margin-bottom: 2px;
    }

    /* KPI Grid */
    .kpi-grid {
      display: grid;
      grid-template-columns: repeat(7, 1fr);
      gap: 5px;
      margin-bottom: 12px;
    }

    .kpi-card {
      background: #0a192f;
      color: #ffffff;
      border-radius: 6px;
      padding: 6px 4px;
      text-align: center;
      box-shadow: 0 1px 2px rgba(0,0,0,0.05);
    }
    .kpi-card.gold {
      background: #b45309;
    }
    .kpi-card.green {
      background: #047857;
    }

    .kpi-val {
      font-size: 11pt;
      font-weight: 900;
      line-height: 1.1;
      color: #ffffff;
    }
    .kpi-lbl {
      font-size: 5.5pt;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.3px;
      margin-top: 2px;
      opacity: 0.9;
    }

    /* Section Headers */
    .section-title-box {
      background: #f1f5f9;
      border-left: 4px solid #0a192f;
      padding: 4px 8px;
      margin-bottom: 8px;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .section-title {
      font-size: 9.5pt;
      font-weight: 900;
      color: #0a192f;
      text-transform: uppercase;
      letter-spacing: 0.2px;
    }
    .section-status {
      font-size: 6.5pt;
      font-weight: 800;
      background: #dcfce7;
      color: #166534;
      padding: 2px 6px;
      border-radius: 4px;
      border: 1px solid #bbf7d0;
      text-transform: uppercase;
    }
    .section-status.planned {
      background: #fef9c3;
      color: #854d0e;
      border-color: #fef08a;
    }

    /* Feature Grid (Page 1) */
    .features-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 7px;
      margin-bottom: 8px;
    }

    .feature-card {
      border: 1px solid #cbd5e1;
      border-radius: 6px;
      padding: 7px 9px;
      background: #ffffff;
    }

    .card-header {
      display: flex;
      align-items: center;
      gap: 5px;
      margin-bottom: 4px;
      border-bottom: 1px solid #f1f5f9;
      padding-bottom: 3px;
    }
    .card-icon {
      font-size: 11pt;
    }
    .card-title {
      font-size: 8.5pt;
      font-weight: 800;
      color: #0f172a;
    }

    .card-subtitle {
      font-size: 7pt;
      color: #64748b;
      margin-bottom: 5px;
      font-weight: 500;
    }

    .card-list {
      list-style: none;
    }
    .card-list li {
      position: relative;
      padding-left: 10px;
      font-size: 7.2pt;
      margin-bottom: 3px;
      color: #334155;
      line-height: 1.25;
    }
    .card-list li::before {
      content: "•";
      position: absolute;
      left: 0;
      color: #b45309;
      font-weight: 900;
      font-size: 9pt;
      line-height: 0.9;
    }
    .card-list li strong {
      color: #0f172a;
      font-weight: 700;
    }

    /* Footer */
    .footer-container {
      border-top: 1px solid #cbd5e1;
      padding-top: 5px;
      display: flex;
      justify-content: space-between;
      font-size: 6.8pt;
      color: #64748b;
      margin-top: 10px;
    }

    /* Table Styles (Page 2) */
    .roadmap-table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 10px;
      font-size: 7.2pt;
    }
    .roadmap-table th {
      background-color: #0a192f;
      color: #ffffff;
      padding: 5px 6px;
      text-align: left;
      font-weight: 800;
      text-transform: uppercase;
      font-size: 6.5pt;
      letter-spacing: 0.4px;
      border: 1px solid #0a192f;
    }
    .roadmap-table td {
      padding: 4.5px 6px;
      border: 1px solid #e2e8f0;
      vertical-align: middle;
      line-height: 1.25;
    }
    .roadmap-table tr:nth-child(even) td {
      background-color: #f8fafc;
    }
    .horizon-badge {
      display: inline-block;
      font-weight: 800;
      font-size: 6.2pt;
      padding: 1.5px 4px;
      border-radius: 3px;
      white-space: nowrap;
    }
    .h-q4 { background: #e0f2fe; color: #0369a1; border: 1px solid #bae6fd; }
    .h-q1 { background: #fef3c7; color: #92400e; border: 1px solid #fde68a; }
    .h-q2 { background: #f3e8ff; color: #7e22ce; border: 1px solid #e9d5ff; }

    .impact-badge {
      font-weight: 700;
      color: #0f172a;
      display: flex;
      align-items: center;
      gap: 3px;
    }

    /* Flow Diagram Box */
    .flow-strip {
      background: #f8fafc;
      border: 1px solid #cbd5e1;
      border-radius: 6px;
      padding: 6px 8px;
      margin-bottom: 10px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 3px;
    }
    .flow-step {
      background: #ffffff;
      border: 1px solid #cbd5e1;
      border-radius: 4px;
      padding: 3px 5px;
      text-align: center;
      font-size: 6.2pt;
      font-weight: 700;
      color: #0f172a;
      flex: 1;
    }
    .flow-step.active {
      border-color: #b45309;
      background: #fffbeb;
      color: #92400e;
    }
    .flow-arrow {
      font-size: 7pt;
      color: #94a3b8;
      font-weight: 900;
    }

    /* Assurance Box (Page 2) */
    .assurance-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 8px;
    }
    .assurance-card {
      border: 1px solid #cbd5e1;
      border-radius: 6px;
      padding: 7px 9px;
      background: #f8fafc;
    }
    .assurance-title {
      font-size: 7.8pt;
      font-weight: 800;
      color: #0f172a;
      display: flex;
      align-items: center;
      gap: 5px;
      margin-bottom: 4px;
    }
  </style>
</head>
<body>

  <!-- ==================== PÁGINA 1 ==================== -->
  <div class="page">
    <div class="header-container">
      <div>
        <div class="main-title">JORGE ALVIM ADVOCACIA & LEGALTECH</div>
        <div class="subtitle">ROADMAP EXECUTIVO DE FUNCIONALIDADES & EVOLUÇÃO TECNOLÓGICA</div>
      </div>
      <div class="meta-box">
        <div class="badge-date">📅 Data Oficial: 11 de Setembro de 2026</div>
        <div>OAB/MG 222.943 • CNPJ: 58.204.305/0001-00</div>
        <div><strong>Documento Estratégico para Avaliação de Aquisição / Investimento</strong></div>
      </div>
    </div>

    <!-- 7 KPIs -->
    <div class="kpi-grid">
      <div class="kpi-card">
        <div class="kpi-val">33</div>
        <div class="kpi-lbl">Módulos Backend Desacoplados</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-val">17</div>
        <div class="kpi-lbl">Submódulos de Gestão (Abas)</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-val">43</div>
        <div class="kpi-lbl">Índices de Performance (SQLite)</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-val">133</div>
        <div class="kpi-lbl">Testes Unitários Aprovados</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-val">14 / 14</div>
        <div class="kpi-lbl">Testes E2E Playwright Aprovados</div>
      </div>
      <div class="kpi-card gold">
        <div class="kpi-val">90 / 100</div>
        <div class="kpi-lbl">Auditoria de Fluxo (Nível Ouro)</div>
      </div>
      <div class="kpi-card green">
        <div class="kpi-val">100%</div>
        <div class="kpi-lbl">Compliance OAB & LGPD</div>
      </div>
    </div>

    <!-- Seção 1 -->
    <div class="section-title-box">
      <div class="section-title">1. FUNCIONALIDADES EM PRODUÇÃO (100% ENTREGUES & OPERACIONAIS)</div>
      <div class="section-status">STATUS: CONCLUÍDO & HOMOLOGADO</div>
    </div>

    <!-- 8 Cards -->
    <div class="features-grid">
      
      <!-- Card 1 -->
      <div class="feature-card">
        <div class="card-header">
          <span class="card-icon">🌐</span>
          <span class="card-title">Site Institucional & Captação (SEO Local)</span>
        </div>
        <div class="card-subtitle">Interface pública responsiva para autoridade e atração ética.</div>
        <ul class="card-list">
          <li><strong>6 Boxes Dinâmicos:</strong> Editáveis pelo painel administrativo em tempo real.</li>
          <li><strong>Blog Jurídico & Hub:</strong> Artigos categorizados para atração orgânica no Google.</li>
          <li><strong>FAQ Schema.org:</strong> Semântica local em JF/MG e assistentes de IA generativa.</li>
          <li><strong>Simulador Trabalhista CLT:</strong> Envio direto de leads qualificados para o WhatsApp.</li>
        </ul>
      </div>

      <!-- Card 2 -->
      <div class="feature-card">
        <div class="card-header">
          <span class="card-icon">👤</span>
          <span class="card-title">Portal do Cliente (Transparência Cidadã)</span>
        </div>
        <div class="card-subtitle">Ambiente exclusivo para o constituinte acompanhar sua demanda.</div>
        <ul class="card-list">
          <li><strong>Login Unificado:</strong> E-mail/senha ou Google Sign-In seguro.</li>
          <li><strong>Linha do Tempo Processual:</strong> Fases em linguagem cidadã sem "juridiquês".</li>
          <li><strong>Magic Link no Celular:</strong> Upload de fotos de RG e contas sem senha.</li>
          <li><strong>Download de Peças & LGPD:</strong> Acesso a contratos e canal do Art. 18.</li>
        </ul>
      </div>

      <!-- Card 3 -->
      <div class="feature-card">
        <div class="card-header">
          <span class="card-icon">👔</span>
          <span class="card-title">Portal do Colaborador & Pessoal</span>
        </div>
        <div class="card-subtitle">Gestão de frequência e transparência trabalhista interna.</div>
        <ul class="card-list">
          <li><strong>Ponto Eletrônico Digital:</strong> Registro de entradas e saídas com IP e carimbo.</li>
          <li><strong>Espelho de Ponto Mensal:</strong> Consulta instantânea do saldo de horas trabalhadas.</li>
          <li><strong>Auth Google Colaborador:</strong> Acesso restrito a e-mails cadastrados no RH.</li>
          <li><strong>Segurança Trabalhista:</strong> Conformidade com portarias MTE e controle de jornada.</li>
        </ul>
      </div>

      <!-- Card 4 -->
      <div class="feature-card">
        <div class="card-header">
          <span class="card-icon">⚖️</span>
          <span class="card-title">ERP & CRM Jurídico Operacional (Desktop)</span>
        </div>
        <div class="card-subtitle">Sistema multi-tarefa com janelas flutuantes estilo desktop.</div>
        <ul class="card-list">
          <li><strong>Radar Judicial & DataJud:</strong> Consulta unificada (TJMG, TRF6, TRT3) via crawler.</li>
          <li><strong>ComunicaAPI / DJEN:</strong> Sincronização automática de intimações da OAB.</li>
          <li><strong>Scanner de Prazos Fatais:</strong> Alertas preditivos para evitar preclusão.</li>
          <li><strong>Kit Inicial com Chancela:</strong> Procuração, Declaração e Contratos em 1 clique.</li>
        </ul>
      </div>

      <!-- Card 5 -->
      <div class="feature-card">
        <div class="card-header">
          <span class="card-icon">✍️</span>
          <span class="card-title">Assinatura Eletrônica Avançada (E-Sign)</span>
        </div>
        <div class="card-subtitle">Validade jurídica plena sob a MP 2.200-2/2001 e Lei 14.063/2020.</div>
        <ul class="card-list">
          <li><strong>Assinatura na Tela:</strong> Captura biométrica de traço ou nome digitado no celular.</li>
          <li><strong>Trilha Probatória Imutável:</strong> IP, user-agent, geolocalização e hash SHA-256.</li>
          <li><strong>Auto-Arquivamento:</strong> Cópia chancelada salva automaticamente no cofre do cliente.</li>
        </ul>
      </div>

      <!-- Card 6 -->
      <div class="feature-card">
        <div class="card-header">
          <span class="card-icon">💰</span>
          <span class="card-title">Financeiro, NFS-e & Gateway Asaas</span>
        </div>
        <div class="card-subtitle">Gestão de tesouraria, recebimentos e prestação de contas.</div>
        <ul class="card-list">
          <li><strong>Carnês & Cobranças:</strong> Pix dinâmico, boletos e cartão integrados ao Asaas.</li>
          <li><strong>Emissão de NFS-e:</strong> Faturamento e recibos de honorários integrados.</li>
          <li><strong>Quitação de Alvarás:</strong> Prestação de contas timbrada oficial para repasses.</li>
        </ul>
      </div>

      <!-- Card 7 -->
      <div class="feature-card">
        <div class="card-header">
          <span class="card-icon">🛡️</span>
          <span class="card-title">Compliance OAB & Meta Ads</span>
        </div>
        <div class="card-subtitle">Blindagem ética conforme Provimento 205/2021 do CFOAB.</div>
        <ul class="card-list">
          <li><strong>Validador Automático:</strong> Trava infrações de publicidade no Facebook/Instagram.</li>
          <li><strong>Identificação Rigorosa:</strong> OAB/MG 222.943 presente em todas as saídas públicas.</li>
        </ul>
      </div>

      <!-- Card 8 -->
      <div class="feature-card">
        <div class="card-header">
          <span class="card-icon">🔍</span>
          <span class="card-title">Auditor Nativo de Fluxo Forense (audit:flow)</span>
        </div>
        <div class="card-subtitle">Diagnóstico em 3 segundos da integridade ponta a ponta.</div>
        <ul class="card-list">
          <li><strong>Varredura Executiva:</strong> Mede conversão, processos sem andamento e alvarás.</li>
          <li><strong>Padrão Internacional:</strong> Certificação contínua Nível Ouro (90/100 pontos).</li>
        </ul>
      </div>

    </div>

    <!-- Footer Page 1 -->
    <div class="footer-container">
      <div>Jorge Alvim Advocacia & LegalTech • Relatório Oficial de Roadmap • OAB/MG 222.943</div>
      <div>Página 1 de 2</div>
    </div>
  </div>

  <!-- ==================== PÁGINA 2 ==================== -->
  <div class="page">
    <div class="header-container">
      <div>
        <div class="main-title">PLANO DE EVOLUÇÃO & PRÓXIMAS IMPLEMENTAÇÕES</div>
        <div class="subtitle">METAS ESTRATÉGICAS PARA ESCALA, AUTOMAÇÃO FORENSE E COMERCIALIZAÇÃO (SAAS)</div>
      </div>
      <div class="meta-box">
        <div class="badge-date">📅 Data Oficial: 11/09/2026</div>
        <div>Horizontes de Entrega: Curto, Médio e Longo Prazo</div>
      </div>
    </div>

    <!-- Esteira de Fluxo 26 Pontos -->
    <div class="flow-strip">
      <div class="flow-step active">1. Captação & Lead</div>
      <div class="flow-arrow">➔</div>
      <div class="flow-step active">2. Triagem / OCR</div>
      <div class="flow-arrow">➔</div>
      <div class="flow-step active">3. Consulta & Proposta</div>
      <div class="flow-arrow">➔</div>
      <div class="flow-step active">4. Contrato E-Sign</div>
      <div class="flow-arrow">➔</div>
      <div class="flow-step active">5. Distribuição Ação</div>
      <div class="flow-arrow">➔</div>
      <div class="flow-step active">6. Andamento & WhatsApp</div>
      <div class="flow-arrow">➔</div>
      <div class="flow-step active">7. Alvará & Quitação</div>
    </div>

    <!-- Seção 2 -->
    <div class="section-title-box">
      <div class="section-title">2. BACKLOG ESTRATÉGICO INTEGRADO (PADRÃO INTERNACIONAL)</div>
      <div class="section-status planned">STATUS: PLANEJADO / EM DESENVOLVIMENTO</div>
    </div>

    <table class="roadmap-table">
      <thead>
        <tr>
          <th style="width: 18%;">MÓDULO / RECURSO</th>
          <th style="width: 13%;">HORIZONTE</th>
          <th style="width: 47%;">DESCRIÇÃO FUNCIONAL & VALOR AGREGADO AO NEGÓCIO</th>
          <th style="width: 22%;">IMPACTO COMERCIAL</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td><strong>WhatsApp Business Cloud API</strong></td>
          <td><span class="horizon-badge h-q4">Q4 / 2026 (Curto)</span></td>
          <td>Disparo automático no WhatsApp a cada movimentação processual ou audiência.</td>
          <td><div class="impact-badge">⭐ Retenção e -75% ligações na recepção.</div></td>
        </tr>
        <tr>
          <td><strong>PWA Mobile Notifications</strong></td>
          <td><span class="horizon-badge h-q4">Q4 / 2026 (Curto)</span></td>
          <td>Transforma Portal do Cliente e Colaborador em app instalável em iOS e Android.</td>
          <td><div class="impact-badge">⭐ Experiência nativa sem taxas de loja.</div></td>
        </tr>
        <tr>
          <td><strong>DMS Matter-Centric & Peças em Andamentos</strong></td>
          <td><span class="horizon-badge h-q4">Q4 / 2026 (Curto)</span></td>
          <td>Estrutura pastas por processo (iManage) e anexa PDFs direto na linha de cada andamento.</td>
          <td><div class="impact-badge">⭐ Fim de arquivos soltos; auditoria total.</div></td>
        </tr>
        <tr>
          <td><strong>Leitor OCR Automático (Zero Digitação)</strong></td>
          <td><span class="horizon-badge h-q4">Q4 / 2026 (Curto)</span></td>
          <td>Extração de dados de RG/CNH via OCR (Tesseract), preenchendo fichas automaticamente.</td>
          <td><div class="impact-badge">⭐ Entrada do cliente em menos de 5 min.</div></td>
        </tr>
        <tr>
          <td><strong>Minutas com RAG Local & IA</strong></td>
          <td><span class="horizon-badge h-q4">Q4 / 2026 (Curto)</span></td>
          <td>Peças geradas por IA calibrada com o acervo procedente do Dr. Jorge Alvim e análise de DJEN.</td>
          <td><div class="impact-badge">⭐ Aumento de 80% na produtividade jurídica.</div></td>
        </tr>
        <tr>
          <td><strong>Esteira Sequencial de Atendimento</strong></td>
          <td><span class="horizon-badge h-q4">Q4 / 2026 (Curto)</span></td>
          <td>Pipeline visual (Lead ➔ Consulta ➔ Contrato ➔ Ação) com controle de exceção manual.</td>
          <td><div class="impact-badge">⭐ Visão cristalina da jornada do cliente.</div></td>
        </tr>
        <tr>
          <td><strong>Conciliação via Open Finance</strong></td>
          <td><span class="horizon-badge h-q1">Q1 / 2027 (Médio)</span></td>
          <td>Leitura automática de extratos com baixa instantânea de honorários recebidos.</td>
          <td><div class="impact-badge">⭐ Zero erro na tesouraria de caixa.</div></td>
        </tr>
        <tr>
          <td><strong>Controle de Depósitos & Alvarás</strong></td>
          <td><span class="horizon-badge h-q1">Q1 / 2027 (Médio)</span></td>
          <td>Acompanhamento de contas judiciais, correção (IPCA-E/SELIC) e alerta de RPV/Alvará.</td>
          <td><div class="impact-badge">⭐ Controle fino de receitas expressivas.</div></td>
        </tr>
        <tr>
          <td><strong>Calculadora Previdenciária CNIS</strong></td>
          <td><span class="horizon-badge h-q1">Q1 / 2027 (Médio)</span></td>
          <td>Importador de PDF CNIS (Meu INSS) para contagem de tempo e regras EC 103/2019.</td>
          <td><div class="impact-badge">⭐ Atração imediata de causas de INSS.</div></td>
        </tr>
        <tr>
          <td><strong>Quality Gates & Travas (Actionstep)</strong></td>
          <td><span class="horizon-badge h-q1">Q1 / 2027 (Médio)</span></td>
          <td>Travas de segurança: bloqueia mudança de fase sem procuração ou guia de custas.</td>
          <td><div class="impact-badge">⭐ Erro zero em controladoria forense.</div></td>
        </tr>
        <tr>
          <td><strong>Planilhas Dinâmicas & BI Forense</strong></td>
          <td><span class="horizon-badge h-q1">Q1 / 2027 (Médio)</span></td>
          <td>Tabela dinâmica (Tabulator) cruzando dia, vara, tribunal, advogado e rentabilidade.</td>
          <td><div class="impact-badge">⭐ Inteligência estatística e decisão de êxito.</div></td>
        </tr>
        <tr>
          <td><strong>Biometria Facial (Liveness Detection)</strong></td>
          <td><span class="horizon-badge h-q2">Q2 / 2027 (Escala)</span></td>
          <td>Prova de vida com selfie ativa no E-Sign para blindagem total de contratos de grande porte.</td>
          <td><div class="impact-badge">🚀 Blindagem jurídica inquestionável.</div></td>
        </tr>
        <tr>
          <td><strong>Arquitetura Multi-Tenant (SaaS B2B)</strong></td>
          <td><span class="horizon-badge h-q2">Q2 / 2027 (Escala)</span></td>
          <td>Isolamento por tenant_id, permitindo revender o software por assinatura para outras bancas.</td>
          <td><div class="impact-badge">🚀 Monetização recorrente exponencial (ARR).</div></td>
        </tr>
      </tbody>
    </table>

    <!-- Seção 3: Blindagem Arquitetural -->
    <div class="section-title-box">
      <div class="section-title">3. BLINDAGEM ARQUITETURAL & SUSTENTABILIDADE DO CÓDIGO</div>
      <div class="section-status">GARANTIA TÉCNICA PARA INVESTIDOR</div>
    </div>

    <div class="assurance-grid">
      <div class="assurance-card">
        <div class="assurance-title">🔒 Guardião da Arquitetura & Código Modular</div>
        <ul class="card-list">
          <li><strong>Teto de server.js:</strong> 2.972 / 3.200 linhas (sem monólitos).</li>
          <li><strong>Teto de painel-1-app.js:</strong> 1.403 / 1.800 linhas (Core Shell).</li>
          <li><strong>33 submódulos desacoplados</strong> em src/modules/ e 17 abas em public/js/tabs/.</li>
          <li><strong>Veto absoluto a 2FA/TOTP:</strong> Autenticação via PBKDF2/SHA-512.</li>
        </ul>
      </div>

      <div class="assurance-card">
        <div class="assurance-title">⚡ Desempenho, Testes & Economia de Servidor</div>
        <ul class="card-list">
          <li><strong>133 Testes Unitários + 14 E2E:</strong> CI/CD verde sem travamentos.</li>
          <li><strong>SQLite Nativo com WAL:</strong> Respostas de API ultrarrápidas (4 a 15ms).</li>
          <li><strong>Custo de Infraestrutura:</strong> R$ 40/mês em VPS Linux (Zero royalties perpétuos).</li>
          <li><strong>Propriedade Intelectual:</strong> 100% proprietário, pronto para comercialização.</li>
        </ul>
      </div>
    </div>

    <!-- Footer Page 2 -->
    <div class="footer-container">
      <div>Jorge Alvim Advocacia & LegalTech • Relatório Oficial de Roadmap • OAB/MG 222.943</div>
      <div>Página 2 de 2</div>
    </div>
  </div>

</body>
</html>
`;

async function generatePDF() {
  console.log('🚀 Iniciando renderizador Playwright Chromium...');
  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();
  await page.setContent(htmlContent, { waitUntil: 'networkidle' });

  const outputPaths = [
    path.join(ROOT_DIR, 'ROADMAP_EXECUTIVO_JORGE_ALVIM_2026.pdf'),
    path.join(ROOT_DIR, 'public', 'ROADMAP_EXECUTIVO_JORGE_ALVIM_2026.pdf'),
    path.join(ROOT_DIR, 'dist', 'ROADMAP_EXECUTIVO_JORGE_ALVIM_2026.pdf')
  ];

  const primaryPath = outputPaths[0];

  console.log(`📄 Gerando PDF de alta fidelidade: ${primaryPath}...`);
  await page.pdf({
    path: primaryPath,
    format: 'A4',
    printBackground: true,
    margin: {
      top: '10mm',
      bottom: '10mm',
      left: '12mm',
      right: '12mm'
    }
  });

  await browser.close();

  // Copiar para dist e public se existirem
  for (let i = 1; i < outputPaths.length; i++) {
    const dest = outputPaths[i];
    try {
      const dir = path.dirname(dest);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.copyFileSync(primaryPath, dest);
      console.log(` ✅ Cópia gerada em: ${dest}`);
    } catch (e) {
      console.warn(`Aviso ao copiar para ${dest}:`, e.message);
    }
  }

  console.log(`\n🎉 SUCESSO: PDF do Roadmap Executivo gerado com perfeição em:`);
  console.log(`   👉 ${primaryPath} (${(fs.statSync(primaryPath).size / 1024).toFixed(1)} KB)`);
}

generatePDF().catch(err => {
  console.error('❌ Erro ao gerar PDF:', err);
  process.exit(1);
});
