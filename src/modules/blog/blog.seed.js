/**
 * ==============================================================================
 * SEEDER MODULAR DO BLOG JURÍDICO (JORGE ALVIM ADVOCACIA - OAB/MG 222.943)
 * ==============================================================================
 * Módulo desacoplado para inicialização e atualização idempotente de artigos
 * do Blog Jurídico para SEO e autoridade em Juiz de Fora e Minas Gerais.
 */

// 1. Quatro artigos informativos jurídicos iniciais para SEO
const INITIAL_ARTICLES = [
  {
    slug: 'como-funciona-defesa-cnh-juiz-de-fora',
    title: 'Como Funciona o Processo de Defesa contra Suspensão e Cassação de CNH em Juiz de Fora e MG',
    summary: 'Entenda os prazos legais, instâncias recursais (JARI e CETRAN/MG) e como garantir o efeito suspensivo para continuar dirigindo enquanto seu recurso é julgado.',
    category: 'Direito de Trânsito & CNH',
    cover_image: 'https://images.unsplash.com/photo-1449965408869-eaa3f722e40d?auto=format&fit=crop&w=1200&q=80',
    tags: 'CNH, Suspensão de CNH, Recurso de Multa, Trânsito, Juiz de Fora, CETRAN, DETRAN-MG, Bafômetro',
    content: `
<h2>Entendendo a Notificação de Suspensão do Direito de Dirigir</h2>
<p>Receber uma notificação de instauração de processo administrativo para suspensão da Carteira Nacional de Habilitação (CNH) gera muitas dúvidas e apreensão para condutores e motoristas profissionais em Juiz de Fora e em todo o estado de Minas Gerais. O primeiro ponto fundamental a saber é que <strong>a suspensão nunca é automática</strong>: todo condutor tem direito constitucional à ampla defesa e ao contraditório.</p>

<h3>Quais são as principais causas de Suspensão de CNH?</h3>
<ul>
  <li><strong>Por pontos acumulados no período de 12 meses:</strong> 20 pontos (se houver 2 ou mais infrações gravíssimas), 30 pontos (se houver 1 infração gravíssima) ou 40 pontos (se não houver nenhuma infração gravíssima ou para motoristas com EAR na CNH);</li>
  <li><strong>Por infrações autossuspensivas (mandatórias):</strong> Como a recusa ao teste do etilômetro (bafômetro - Art. 165-A do CTB), dirigir sob influência de álcool, transitar em velocidade superior a 50% da máxima permitida, pilotar motocicleta sem capacete, entre outras.</li>
</ul>

<h3>As 3 Fases de Defesa e Recurso Administrativo</h3>
<ol>
  <li><strong>Defesa Prévia:</strong> Apresentada logo após a primeira notificação perante o órgão autuador ou DETRAN-MG, focando em vícios formais do auto de infração, erros de preenchimento, aferição metrológica de radares e tempestividade;</li>
  <li><strong>Recurso à JARI (Junta Administrativa de Recursos de Infrações):</strong> Caso a defesa prévia não seja acolhida, interpõe-se recurso de 1ª instância administrativa onde se discute o mérito legal e a legalidade da penalidade;</li>
  <li><strong>Recurso ao CETRAN/MG (Conselho Estadual de Trânsito de Minas Gerais):</strong> 2ª e última instância administrativa estadual, avaliando decisões colegiadas e precedentes normativos.</li>
</ol>

<blockquote>
  <p><strong>Dica Jurídica Importante:</strong> Enquanto o processo administrativo de suspensão estiver em fase de recurso, o motorista tem garantido o <em>efeito suspensivo</em> e pode continuar dirigindo legalmente sem bloqueio no prontuário até o julgamento final definitivo.</p>
</blockquote>

<h3>Quando recorrer à via Judicial?</h3>
<p>Se as instâncias administrativas mantiverem arbitrariedades ou irregularidades formais no processo (como falta de notificação válida por edital, decadência de prazos ou cerceamento de defesa), é perfeitamente cabível ajuizar uma <strong>Ação Anulatória de Ato Administrativo com Pedido de Liminar</strong> perante a Vara da Fazenda Pública da Comarca de Juiz de Fora, garantindo o restabelecimento imediato do direito de dirigir.</p>
    `
  },
  {
    slug: 'direitos-consumidor-voos-transportes-indenizacao',
    title: 'Direitos do Consumidor em Transportes: Indenizações por Voo Cancelado, Atrasos e Bagagem Extraviada',
    summary: 'Conheça seus direitos conforme o Código de Defesa do Consumidor e a Resolução 400 da ANAC para voos no Aeroporto da Zona da Mata (IZA), Rio e conexões.',
    category: 'Direito do Consumidor',
    cover_image: 'https://images.unsplash.com/photo-1436491865332-7a61a109cc05?auto=format&fit=crop&w=1200&q=80',
    tags: 'Direito do Consumidor, Voo Cancelado, Extravio de Bagagem, Companhia Aérea, Indenização, Dano Moral, Zona da Mata',
    content: `
<h2>Problemas em Viagens Aéreas e Terrestres: O que a Lei Garante?</h2>
<p>O atraso excessivo ou cancelamento inesperado de voos, perda de conexões internacionais e o extravio temporário ou definitivo de bagagens são problemas frequentes enfrentados por passageiros na região de Juiz de Fora, especialmente em voos com conexão no Aeroporto Regional da Zona da Mata (IZA), Galeão e Santos Dumont. O Código de Defesa do Consumidor (CDC) e as normas da ANAC protegem o passageiro e preveem reparações financeiras significativas.</p>

<h3>Direito à Assistência Material Obrigatória da Companhia Aérea:</h3>
<ul>
  <li><strong>A partir de 1 hora de atraso:</strong> Acesso gratuito a meios de comunicação (internet, ligações telefônicas);</li>
  <li><strong>A partir de 2 horas de atraso:</strong> Fornecimento de alimentação adequada (voucher para refeição, lanche e bebidas);</li>
  <li><strong>A partir de 4 horas de atraso ou cancelamento:</strong> Acomodação em hotel, traslado de ida e volta, ou reacomodação imediata no primeiro voo disponível (inclusive de outra companhia aérea) ou reembolso integral imediato da passagem.</li>
</ul>

<h3>Quando cabe Indenização por Danos Morais e Materiais?</h3>
<p>Quando o atraso ultrapassa 4 horas ou decorre em perda de compromissos profissionais relevantes, casamentos, viagens de férias planejadas, noites de sono perdidas no saguão do aeroporto ou quando a bagagem é extraviada contendo pertences de uso pessoal, a jurisprudência dos Tribunais de Justiça de Minas Gerais (TJMG) e do Rio de Janeiro reconhece o direito à <strong>indenização por danos morais</strong> (geralmente fixada entre R$ 5.000,00 e R$ 15.000,00 por passageiro), além do ressarcimento de todos os gastos comprovados (danos materiais).</p>

<blockquote>
  <p><strong>Documentos Essenciais para Guardar:</strong> Cartão de embarque, fotos do painel do aeroporto indicando o atraso/cancelamento, declaração de contingência fornecida pela companhia aérea, protocolos de atendimento, RIB (Relatório de Irregularidade de Bagagem) e notas fiscais de gastos adicionais com transporte e hospedagem.</p>
</blockquote>
    `
  },
  {
    slug: 'juros-abusivos-financiamento-revisao-contrato',
    title: 'Ação Revisional de Financiamento de Veículos e Empréstimos: Como Identificar Juros Abusivos',
    summary: 'Descubra como saber se o banco cobrou juros acima da taxa média de mercado do Banco Central e como recalcular as parcelas para restituir valores indevidos.',
    category: 'Direito Civil & Bancário',
    cover_image: 'https://images.unsplash.com/photo-1554224155-8d04cb21cd6c?auto=format&fit=crop&w=1200&q=80',
    tags: 'Revisão de Contrato, Juros Abusivos, Financiamento de Veículo, Empréstimo, Banco Central, CDC, Juiz de Fora',
    content: `
<h2>O que é a Ação Revisional de Contrato Bancário?</h2>
<p>Muitos consumidores em Juiz de Fora contratam financiamentos para aquisição de veículos, crédito pessoal ou empréstimos consignados sem perceber que as taxas de juros remuneratórios e encargos embutidos nas parcelas superam drasticamente os limites legais e a taxa média apurada pelo Banco Central do Brasil (BACEN) para o mesmo período e modalidade de operação.</p>

<h3>Principais Abusividades Encontradas em Contratos Bancários:</h3>
<ul>
  <li><strong>Juros Remuneratórios Acima da Taxa Média do BACEN:</strong> Cobrança de taxas exorbitantes que desequilibram a relação contratual;</li>
  <li><strong>Venda Casada de Seguros (Seguro Prestamista):</strong> Inclusão compulsória de seguros sem que o consumidor tenha tido a opção de contratar ou escolher a seguradora (prática vedada pelo Art. 39, I do CDC);</li>
  <li><strong>Tarifas Ilegítimas:</strong> Cobrança indevida de Taxa de Emissão de Carnê (TEC), Taxa de Abertura de Crédito (TAC), Tarifa de Avaliação do Bem e Serviços de Terceiros sem comprovação de prestação efetiva;</li>
  <li><strong>Capitalização Diária de Juros sem Previsão Contratual Expressa.</strong></li>
</ul>

<h3>Como é feito o Recálculo e o que se pode Recuperar?</h3>
<p>Por meio de uma perícia contábil preliminar, confronta-se o contrato assinado com as tabelas históricas do Banco Central. Havendo abusividade, ajuíza-se a Ação Revisional requerendo a redução do valor da parcela mensal e a <strong>repetição de indébito (devolução dos valores pagos a mais em dobro ou abatimento do saldo devedor)</strong>, trazendo grande alívio financeiro para o contratante.</p>
    `
  },
  {
    slug: 'divorcio-pensao-guarda-juiz-de-fora',
    title: 'Divórcio, Pensão Alimentícia e Guarda de Filhos em Juiz de Fora: Guia Prático',
    summary: 'Entenda como funciona o divórcio consensual e litigioso, fixação de pensão alimentícia e guarda compartilhada de filhos perante as Varas de Família de Juiz de Fora.',
    category: 'Direito de Família',
    cover_image: 'https://images.unsplash.com/photo-1511895426328-dc8714191300?auto=format&fit=crop&w=1200&q=80',
    tags: 'Divórcio, Pensão Alimentícia, Guarda Compartilhada, Direito de Família, Juiz de Fora, União Estável, Partilha de Bens',
    content: `
<h2>Como Funciona o Divórcio em Cartório e Judicial em Juiz de Fora?</h2>
<p>O processo de dissolução conjugal pode ocorrer pela via extrajudicial (em Cartório de Notas) de forma rápida quando há consenso e não há filhos menores ou incapazes, ou pela via judicial (perante as Varas de Família da Comarca de Juiz de Fora no Fórum Benjamin Colucci) quando envolve menores ou litígio.</p>

<h3>Principais Temas no Direito de Família:</h3>
<ul>
  <li><strong>Divórcio Consensual e Litigioso:</strong> Dissolução do casamento com partilha justa de bens adquiridos durante a união;</li>
  <li><strong>Pensão Alimentícia:</strong> Fixação, revisão e execução de alimentos com base no binômio necessidade do alimentando e possibilidade do alimentante;</li>
  <li><strong>Guarda Compartilhada e Convivência:</strong> Definição da residência principal dos filhos e plano equilibrado de convivência familiar priorizando o melhor interesse da criança;</li>
  <li><strong>Reconhecimento e Dissolução de União Estável:</strong> Proteção patrimonial e formalização jurídica dos direitos dos conviventes.</li>
</ul>

<h3>Documentos Comuns Necessários:</h3>
<ol>
  <li>Certidão de casamento atualizada ou certidão de nascimento dos filhos;</li>
  <li>Documentos comprobatórios dos bens a serem partilhados (imóveis, veículos, contas bancárias);</li>
  <li>Comprovantes de rendimentos e despesas para fixação de pensão alimentícia;</li>
  <li>Documentos pessoais (RG, CPF e comprovante de residência atualizado).</li>
</ol>
    `
  }
];

// 2. Artigo sobre FATD e RDE (Direito Militar)
const FATD_ARTICLE = {
  slug: 'rde-e-o-fatd-apuracao-transgressoes-justificacao-recurso',
  title: 'RDE e o FATD: Como Funciona a Apuração de Transgressões, as Causas de Justificação e o Direito ao Recurso',
  summary: 'A manutenção da hierarquia e da disciplina é a pedra angular das Forças Armadas. Entenda como funciona a apuração disciplinar militar pelo RDE (Decreto 4.346/02), o preenchimento do FATD, as causas de justificação do Art. 18 e o direito ao recurso.',
  category: 'Direito Militar',
  cover_image: '/img/blog/rde-fatd-militar.jpg',
  tags: 'Direito Militar, Exército Brasileiro, RDE, FATD, Transgressão Disciplinar, Recurso Disciplinar',
  content: `
<p class="lead text-lg font-medium text-slate-700 leading-relaxed">
  A manutenção da <strong>hierarquia</strong> e da <strong>disciplina</strong> é a pedra angular das Forças Armadas brasileiras. No âmbito do Exército Brasileiro, essas diretrizes são juridicamente regulamentadas pelo <strong>Decreto nº 4.346/2002</strong>, conhecido como o <strong>Regulamento Disciplinar do Exército (RDE / R-4)</strong>.
</p>

<p>
  Para comandantes, assessores jurídicos e militares em geral, entender como funciona a apuração de uma falta e como preencher corretamente o principal instrumento desse processo — o <strong>FATD (Formulário de Apuração de Transgressão Disciplinar)</strong> — é fundamental para garantir a legalidade do ato. Mas o conhecimento não deve parar na aplicação da sanção: é indispensável dominar as <strong>causas de justificação (Art. 18)</strong> e as vias de recurso administrativo para quando o direito de defesa precisar ser restabelecido com rigor técnico.
</p>

<figure class="my-6">
  <img src="/img/blog/rde-fatd-militar.jpg" alt="Infográfico ilustrativo sobre Transgressão Disciplinar, FATD e Direitos do Militar" class="w-full rounded-xl shadow-md border border-slate-200">
  <figcaption class="text-xs text-slate-500 text-center mt-2">Orientações essenciais para o correto preenchimento do FATD e preservação das garantias defensivas.</figcaption>
</figure>

<h2>1. O que é a Transgressão Disciplinar?</h2>
<p>
  De acordo com o RDE, a transgressão disciplinar é qualquer violação dos deveres e das obrigações militares que não chegue a constituir crime militar ou comum. Elas são classificadas conforme a gravidade em:
</p>
<ul>
  <li><strong>Leves</strong></li>
  <li><strong>Médias</strong></li>
  <li><strong>Graves</strong></li>
</ul>
<p>
  As punições disciplinares são aplicadas em uma escala crescente de severidade: <em>Advertência, Impedimento disciplinar, Repreensão, Detenção, Prisão disciplinar</em> e, em casos extremos, <em>Licenciamento ou Exclusão a bem da disciplina</em>.
</p>

<h2>2. O Processo de Apuração e o Papel do FATD</h2>
<div class="bg-blue-50 border-l-4 border-blue-600 p-4 my-4 rounded-r-lg">
  <p class="font-semibold text-blue-950 m-0">O FATD não é a punição em si!</p>
  <p class="text-sm text-blue-900 mt-1 m-0">Ele é o documento formal que instaura o rito administrativo investigatório, assegurando o contraditório e a ampla defesa constitucional (Art. 5º, LV da CF/88).</p>
</div>
<p>
  Sua finalidade, prevista no Anexo IV do RDE, é padronizar e registrar a apuração do fato. Quando uma suposta falta é reportada por meio de uma <strong>Parte de Transgressão</strong>, a autoridade competente emite o FATD para que o militar possa se manifestar e defender por escrito antes de qualquer tomada de decisão.
</p>
<p>
  <strong>Prazo Regulamentar:</strong> O acusado possui o prazo de <strong>3 (três) dias úteis</strong> para apresentar suas justificativas, arrolar testemunhas, requerer perícias ou pedir para ser ouvido presencialmente.
</p>

<h2>3. O Coração da Defesa: As Causas de Justificação (Art. 18)</h2>
<p>
  O momento em que o militar preenche o campo de <em>"Razões de Defesa"</em> no FATD é crucial. É aqui que devem ser invocadas com precisão as causas de justificação. Se a conduta se enquadrar em qualquer um dos incisos do <strong>Artigo 18 do RDE</strong>, <strong>não haverá punição disciplinar</strong>:
</p>
<ul>
  <li><strong>I - Prática de ação meritória ou no interesse do serviço, da ordem ou da segurança pública:</strong> Quando o ato, embora formalmente previsto como falta, foi praticado para atingir um bem maior ou cumprir uma missão urgente de segurança.</li>
  <li><strong>II - Em legítima defesa, própria ou de outrem:</strong> Quando o militar usa moderadamente dos meios necessários para repelir injusta agressão, atual ou iminente.</li>
  <li><strong>III - Em motivo de força maior ou caso fortuito, plenamente comprovado:</strong> Eventos imprevisíveis ou inevitáveis (como desastres naturais, acidentes graves ou panes mecânicas intransponíveis que impeçam o cumprimento de horário).</li>
  <li><strong>IV - Por imperiosa necessidade de culpar subordinado para evitar mal maior ou preservar a disciplina:</strong> Situações extremas de comando em que a intervenção imediata se faz estritamente necessária.</li>
  <li><strong>V - Em decorrência de cumprimento de ordem superior:</strong> Se o militar agiu estritamente cumprindo ordens diretas de seu superior hierárquico (desde que a ordem não fosse manifestamente criminosa).</li>
</ul>

<div class="bg-amber-50 border-l-4 border-amber-500 p-4 my-4 rounded-r-lg">
  <p class="font-semibold text-amber-950 m-0">⚠️ Atenção Probatória:</p>
  <p class="text-sm text-amber-900 mt-1 m-0">Não basta apenas alegar uma dessas causas. O militar deve, no próprio FATD, indicar as provas (testemunhas, documentos, fotos, laudos médicos ou perícias) que comprovem a existência da justificativa.</p>
</div>

<h2>4. O Direito ao Recurso Disciplinar: Inconformidade com a Punição</h2>
<p>
  Se, mesmo após a apresentação da defesa no FATD, a autoridade julgar a conduta como transgressão e aplicar uma sanção disciplinar, o processo não se encerra de forma definitiva. O RDE garante ao militar o direito de recorrer da decisão através de instrumentos específicos previstos a partir do Artigo 51:
</p>

<h3>A. Pedido de Reconsideração de Ato</h3>
<p>
  Antes de subir para instâncias superiores, o militar deve se dirigir à <strong>própria autoridade que aplicou a punição</strong>. O objetivo é fazer com que o próprio Comandante reavalie sua decisão diante de novos argumentos, provas técnicas ou reconsideração fática.
</p>
<p>
  <strong>Prazo:</strong> Deve ser interposto no prazo de <strong>5 (cinco) dias úteis</strong>, contados a partir do dia imediato ao que o militar tomar ciência oficial da publicação da punição em Boletim Interno (BI).
</p>

<h3>B. Recurso Disciplinar propriamente dito</h3>
<p>
  Caso o Pedido de Reconsideração de Ato seja total ou parcialmente negado, o militar pode então interpor o <strong>Recurso Disciplinar</strong>. Este recurso é encaminhado diretamente à autoridade imediatamente superior àquela que aplicou a punição (ex.: Comandante de Brigada, Comandante Militar de Área).
</p>
<p>
  <strong>Prazo:</strong> Também deve ser apresentado no prazo de <strong>5 (cinco) dias úteis</strong>, contados a partir da ciência oficial da denegação da reconsideração.
</p>

<div class="bg-slate-50 border-l-4 border-slate-600 p-4 my-4 rounded-r-lg">
  <p class="font-semibold text-slate-800 m-0">⚖️ Efeito Suspensivo vs. Efeito Devolutivo:</p>
  <p class="text-sm text-slate-600 mt-1 m-0">Como regra geral no âmbito militar, os recursos disciplinares possuem apenas efeito devolutivo — isto é, o cumprimento da punição não é automaticamente suspenso enquanto o recurso é julgado, a menos que a autoridade conceda o efeito suspensivo de forma excepcional.</p>
</div>

<h2>5. Conclusão: O Impacto Direto na Carreira Militar</h2>
<p>
  Subestimar o FATD ou abrir mão dos prazos de recurso é um erro crítico. Se a apuração resultar em punição definitiva publicada em Boletim Interno, o registro afetará diretamente a <strong>classificação de comportamento militar da praça</strong> (que varia de Mau a Excepcional), prejudicando:
</p>
<ul>
  <li>Promoções por merecimento ou antiguidade;</li>
  <li>Inscrições em cursos de formação, especialização ou aperfeiçoamento;</li>
  <li>Estabilidade e prorrogação de engajamento/reengajamento de militares temporários;</li>
  <li>Seleções para missões institucionais e comissões especiais.</li>
</ul>
<p>
  Portanto, a correta instrução do processo e o uso estratégico dos recursos legais protegem tanto a Administração Militar — mantendo seus atos estritamente imunes a nulidades judiciais — quanto o direito do militar a um julgamento justo, técnico e proporcional.
</p>
  `
};

// 3. Artigo sobre Golpes Digitais 2026 (Pix, WhatsApp, Redes, Senhas, Banco)
const GOLPES_DIGITAIS_ARTICLE = {
  slug: 'golpes-digitais-como-reconhecer-interromper-e-recuperar-dinheiro',
  title: 'Golpes Digitais em 2026: Como Reconhecer, Interromper e Recuperar seu Dinheiro',
  summary: 'Link falso, Pix, QR code, WhatsApp clonado, pedidos de transferência, perfis de rede social, roubo de senhas, falsos empréstimos. Os golpes mudam de roupa, mas a lógica é sempre a mesma — e, na maioria dos casos, existe um caminho para reagir e reaver o valor.',
  category: 'Direito Civil & Bancário',
  cover_image: '/img/blog/capa-golpes-digitais.png',
  tags: 'Golpes Digitais, Golpe do Pix, WhatsApp Clonado, MED Pix, Fraude Bancária, Súmula 479 STJ, Recuperação de Dinheiro, Juiz de Fora',
  content: `
<p class="lead text-lg font-medium text-slate-700 leading-relaxed">
  Link falso, Pix, QR code, WhatsApp clonado, pedidos de transferência, perfis de rede social, roubo de senhas, falsos empréstimos. Os golpes mudam de roupa, mas a lógica é sempre a mesma — e, na maioria dos casos, existe um caminho para reagir e reaver o valor.
</p>

<p>
  O Brasil registrou dezenas de bilhões de tentativas de golpe digital no último ano, e uma pesquisa Datafolha/Fórum Brasileiro de Segurança Pública estimou que golpes financeiros pela internet ou celular atingiram cerca de <strong>26 milhões de pessoas em 12 meses</strong>. A boa notícia: quem age rápido e guarda as provas certas tem hoje ferramentas fortes de recuperação — do <strong>MED do Pix</strong> à responsabilização do banco na Justiça. Este guia mostra como reconhecer cada golpe, como interromper na hora e o passo a passo para recuperar o dinheiro.
</p>

<!-- RESUMO VISUAL -->
<div class="my-8 p-6 rounded-3xl bg-slate-900 text-white shadow-xl border border-slate-800">
  <div class="flex items-center space-x-2 text-gold-400 text-xs font-bold uppercase tracking-wider mb-2">
    <span>📌</span>
    <span>Resumo visual — salve ou compartilhe</span>
  </div>
  <h3 class="font-serif text-xl sm:text-2xl font-bold text-white mb-4">Como reconhecer e interromper na hora</h3>
  
  <div class="overflow-x-auto">
    <table class="w-full text-left text-xs sm:text-sm text-slate-200 border-collapse">
      <thead>
        <tr class="border-b border-slate-700 text-gold-400">
          <th class="py-2.5 px-3 font-bold">Tipo de golpe</th>
          <th class="py-2.5 px-3 font-bold">Como começa</th>
          <th class="py-2.5 px-3 font-bold">Como reconhecer</th>
          <th class="py-2.5 px-3 font-bold">Como interromper</th>
        </tr>
      </thead>
      <tbody class="divide-y divide-slate-800">
        <tr>
          <td class="py-3 px-3 font-bold text-white whitespace-nowrap">Phishing / links falsos</td>
          <td class="py-3 px-3">E-mail, SMS ou WhatsApp com link: “conta bloqueada”, prêmio, entrega, multa.</td>
          <td class="py-3 px-3">Remetente estranho, URL com erros, urgência, pede login ou senha.</td>
          <td class="py-3 px-3">Não clique. Acesse digitando o site oficial. Se digitou a senha, troque na hora.</td>
        </tr>
        <tr>
          <td class="py-3 px-3 font-bold text-white whitespace-nowrap">Golpe do Pix / QR code</td>
          <td class="py-3 px-3">Comprovante falso ou Pix agendado; QR trocado por outro na cobrança.</td>
          <td class="py-3 px-3">Nome ou valor do recebedor não confere; valor não aparece no extrato.</td>
          <td class="py-3 px-3">Confira nome/CNPJ e valor antes de confirmar. Só entregue após ver o crédito.</td>
        </tr>
        <tr>
          <td class="py-3 px-3 font-bold text-white whitespace-nowrap">WhatsApp clonado / falso parente</td>
          <td class="py-3 px-3">Pedem o código de 6 dígitos do SMS; assumem sua conta e pedem dinheiro aos contatos.</td>
          <td class="py-3 px-3">Alguém pedindo seu código; parentes recebendo pedido de Pix “seu”.</td>
          <td class="py-3 px-3">Nunca informe o código. Ative a verificação em duas etapas e avise os contatos.</td>
        </tr>
        <tr>
          <td class="py-3 px-3 font-bold text-white whitespace-nowrap">Falsa central do banco (acesso remoto)</td>
          <td class="py-3 px-3">Ligam sobre “transação suspeita” e pedem para instalar um app ou confirmar senha.</td>
          <td class="py-3 px-3">Ligação que você não pediu, pressa, pedido de senha/código ou app.</td>
          <td class="py-3 px-3">Desligue e ligue ao número do verso do cartão. Banco não pede senha nem app.</td>
        </tr>
        <tr>
          <td class="py-3 px-3 font-bold text-white whitespace-nowrap">Falso perfil / redes sociais</td>
          <td class="py-3 px-3">Clonam sua foto e nome (ou invadem a conta) e pedem Pix a amigos.</td>
          <td class="py-3 px-3">Perfil novo com sua foto, linguagem diferente, pedidos de dinheiro.</td>
          <td class="py-3 px-3">Avise os contatos, denuncie o perfil, recupere a conta e ative a verificação em duas etapas.</td>
        </tr>
        <tr>
          <td class="py-3 px-3 font-bold text-white whitespace-nowrap">Roubo de senhas / dados</td>
          <td class="py-3 px-3">Sites falsos e redes de Wi-Fi públicas capturam login e senha.</td>
          <td class="py-3 px-3">Endereço diferente do oficial, falta de cadeado (HTTPS), pedido de dados sensíveis.</td>
          <td class="py-3 px-3">Saia, troque a senha, ative a autenticação em duas etapas e monitore a conta.</td>
        </tr>
      </tbody>
    </table>
  </div>
</div>

<!-- SE VOCÊ CAIU: RECUPERE O DINHEIRO (CARDS) -->
<div class="my-8 p-6 sm:p-8 rounded-3xl bg-gradient-to-br from-amber-50 via-warm-50 to-gold-50/50 border-2 border-amber-300 shadow-md">
  <div class="text-center max-w-xl mx-auto mb-6">
    <span class="text-xs font-bold text-amber-900 uppercase tracking-widest bg-amber-200/80 px-3.5 py-1 rounded-full border border-amber-300">Ação Imediata</span>
    <h3 class="font-serif text-2xl sm:text-3xl font-extrabold text-navy-950 mt-2.5">Se você caiu: recupere o dinheiro</h3>
    <p class="text-xs sm:text-sm text-slate-600 mt-1">A reação é a mesma em qualquer golpe — e velocidade é tudo.</p>
  </div>

  <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
    <div class="bg-white p-4 sm:p-5 rounded-2xl border border-amber-200/80 shadow-xs flex flex-col justify-between">
      <div>
        <div class="flex items-center justify-between mb-3">
          <span class="w-8 h-8 rounded-xl bg-gold-600 text-white font-extrabold text-sm flex items-center justify-center shadow-xs">1</span>
          <span class="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200">até 80 dias</span>
        </div>
        <h4 class="font-bold text-sm text-navy-950 mb-1.5">Banco · MED do Pix</h4>
        <p class="text-xs text-slate-600 leading-relaxed">Conteste pelo app (fraude/MED) e guarde as provas com o ID da transação.</p>
      </div>
    </div>

    <div class="bg-white p-4 sm:p-5 rounded-2xl border border-amber-200/80 shadow-xs flex flex-col justify-between">
      <div>
        <div class="flex items-center justify-between mb-3">
          <span class="w-8 h-8 rounded-xl bg-gold-600 text-white font-extrabold text-sm flex items-center justify-center shadow-xs">2</span>
          <span class="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 border border-blue-200">o quanto antes</span>
        </div>
        <h4 class="font-bold text-sm text-navy-950 mb-1.5">Boletim de Ocorrência</h4>
        <p class="text-xs text-slate-600 leading-relaxed">Delegacia Virtual. Estelionato (art. 171 CP + Lei 14.155/2021).</p>
      </div>
    </div>

    <div class="bg-white p-4 sm:p-5 rounded-2xl border border-amber-200/80 shadow-xs flex flex-col justify-between">
      <div>
        <div class="flex items-center justify-between mb-3">
          <span class="w-8 h-8 rounded-xl bg-gold-600 text-white font-extrabold text-sm flex items-center justify-center shadow-xs">3</span>
          <span class="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-900 border border-amber-200">com protocolo</span>
        </div>
        <h4 class="font-bold text-sm text-navy-950 mb-1.5">Órgãos oficiais</h4>
        <p class="text-xs text-slate-600 leading-relaxed">Banco Central, Consumidor.gov.br e Procon se o banco não resolver.</p>
      </div>
    </div>

    <div class="bg-white p-4 sm:p-5 rounded-2xl border border-amber-200/80 shadow-xs flex flex-col justify-between">
      <div>
        <div class="flex items-center justify-between mb-3">
          <span class="w-8 h-8 rounded-xl bg-gold-600 text-white font-extrabold text-sm flex items-center justify-center shadow-xs">4</span>
          <span class="text-[10px] font-bold px-2 py-0.5 rounded-full bg-purple-100 text-purple-800 border border-purple-200">Súmula 479 STJ</span>
        </div>
        <h4 class="font-bold text-sm text-navy-950 mb-1.5">Justiça</h4>
        <p class="text-xs text-slate-600 leading-relaxed">Ação de ressarcimento (danos materiais e morais no JEC ou Vara Cível).</p>
      </div>
    </div>
  </div>

  <div class="mt-4 p-3.5 rounded-2xl bg-amber-100/90 border border-amber-300 text-amber-950 text-xs font-semibold flex items-center space-x-2.5">
    <span class="text-lg shrink-0">⚠️</span>
    <span><strong>Fique alerta:</strong> NUNCA informe senhas, códigos de SMS ou dados por mensagem. Desconfie de urgência e de promessas boas demais.</span>
  </div>
</div>

<h2>1. A lógica por trás de (quase) todos os golpes</h2>
<p>
  Por mais variados que pareçam, os golpes digitais exploram sempre os mesmos gatilhos: <strong>urgência</strong> (“sua conta será bloqueada agora”), <strong>autoridade</strong> (“aqui é a central do seu banco”), <strong>oportunidade</strong> (“você ganhou”, “oferta imperdível”) e <strong>confiança</strong> (alguém se passa por um conhecido, pela sua operadora ou pelo seu advogado).
</p>
<p>
  A isso se dá o nome de <strong>engenharia social</strong>: em vez de invadir sistemas, o golpista convence você a clicar, informar um código ou transferir. Reconhecer o gatilho é metade da defesa.
</p>

<h2>2. Os principais golpes: como começam, como reconhecer, como interromper</h2>
<div class="overflow-x-auto my-6">
  <table class="w-full text-left text-xs sm:text-sm border border-slate-200 rounded-xl overflow-hidden shadow-xs">
    <thead class="bg-slate-100 text-navy-950 border-b border-slate-200">
      <tr>
        <th class="p-3 font-bold">Golpe</th>
        <th class="p-3 font-bold">Como começa</th>
        <th class="p-3 font-bold">Como reconhecer</th>
        <th class="p-3 font-bold">Como interromper na hora</th>
      </tr>
    </thead>
    <tbody class="divide-y divide-slate-100">
      <tr>
        <td class="p-3 font-bold text-navy-950 whitespace-nowrap">Link falso (phishing por SMS, e-mail, WhatsApp)</td>
        <td class="p-3">Mensagem com link: “atualize o cadastro”, “conta bloqueada”, prêmio, entrega dos Correios, multa, Receita.</td>
        <td class="p-3">Remetente estranho, endereço (URL) com erros ou domínio esquisito, urgência, pede login, senha ou código.</td>
        <td class="p-3">Não clique e não informe dados. Acesse o serviço digitando o endereço oficial. Se já digitou a senha, troque-a imediatamente.</td>
      </tr>
      <tr class="bg-slate-50/50">
        <td class="p-3 font-bold text-navy-950 whitespace-nowrap">Falso comprovante / Pix agendado</td>
        <td class="p-3">O “comprador” paga com comprovante adulterado ou um Pix agendado que depois cancela, e leva o produto.</td>
        <td class="p-3">Comprovante enviado só por imagem, pressa para retirar, valor que não aparece no seu extrato.</td>
        <td class="p-3">Só entregue o produto depois de confirmar o crédito no seu extrato/app — nunca pelo comprovante que te mostraram.</td>
      </tr>
      <tr>
        <td class="p-3 font-bold text-navy-950 whitespace-nowrap">QR code adulterado</td>
        <td class="p-3">QR trocado (adesivo colado por cima) ou enviado numa cobrança falsa; ao ler, o Pix vai para o golpista.</td>
        <td class="p-3">Nome do recebedor não confere, valor diferente do combinado, QR colado por cima de outro.</td>
        <td class="p-3">Antes de confirmar, cheque sempre o nome/CNPJ do recebedor e o valor. Desconfie de QR em locais públicos.</td>
      </tr>
      <tr class="bg-slate-50/50">
        <td class="p-3 font-bold text-navy-950 whitespace-nowrap">WhatsApp clonado (código de 6 dígitos)</td>
        <td class="p-3">Golpista se passa por empresa/operadora e pede o código de 6 dígitos do SMS; assume seu WhatsApp e pede dinheiro aos seus contatos.</td>
        <td class="p-3">Alguém pedindo o código de verificação; parentes avisando que receberam pedido de dinheiro “seu”.</td>
        <td class="p-3">Nunca informe o código a ninguém. Ative a verificação em duas etapas. Se perdeu a conta, recupere e avise os contatos.</td>
      </tr>
      <tr>
        <td class="p-3 font-bold text-navy-950 whitespace-nowrap">Perfil clonado / conta invadida em rede social</td>
        <td class="p-3">Clonam sua foto e nome (ou invadem a conta) e pedem Pix a amigos e seguidores.</td>
        <td class="p-3">Perfil novo com sua foto, pedidos de dinheiro em seu nome, login que “caiu” sozinho.</td>
        <td class="p-3">Avise seus contatos publicamente, denuncie o perfil à plataforma, recupere a conta e ative a verificação em duas etapas.</td>
      </tr>
      <tr class="bg-slate-50/50">
        <td class="p-3 font-bold text-navy-950 whitespace-nowrap">Falsa central / falso funcionário do banco (acesso remoto)</td>
        <td class="p-3">Ligam alegando “transação suspeita” e pedem para instalar um app de acesso remoto ou confirmar senha e dados.</td>
        <td class="p-3">Ligação que você não pediu, pressa, pedido de senha/código ou para instalar aplicativo.</td>
        <td class="p-3">Desligue e ligue você mesmo para o número do verso do cartão. Banco não pede senha nem manda instalar app.</td>
      </tr>
      <tr>
        <td class="p-3 font-bold text-navy-950 whitespace-nowrap">Falso emprego / falsa venda (marketplace)</td>
        <td class="p-3">Vaga com salário alto e “taxa” adiantada; ou produto barato demais em site/perfil falso.</td>
        <td class="p-3">Cobrança de taxa antecipada, conta recém-criada, preço fora da realidade, pagamento só por Pix.</td>
        <td class="p-3">Não pague taxa para conseguir emprego. Compre de perfis verificados e prefira meios de pagamento com proteção.</td>
      </tr>
      <tr class="bg-slate-50/50">
        <td class="p-3 font-bold text-navy-950 whitespace-nowrap">Falso empréstimo / falso investimento</td>
        <td class="p-3">Oferta de crédito fácil com “taxa de liberação” antecipada via Pix, ou investimento com “lucro garantido”.</td>
        <td class="p-3">Exigem pagamento adiantado para liberar o crédito, prometem retorno garantido, pressionam por decisão rápida.</td>
        <td class="p-3">Instituição séria não cobra para liberar empréstimo. Confira o registro da empresa no Banco Central e não pague adiantado.</td>
      </tr>
      <tr>
        <td class="p-3 font-bold text-navy-950 whitespace-nowrap">Falso advogado / falso precatório</td>
        <td class="p-3">Alguém se passa por advogado (usando nome e número de OAB reais) e diz que você tem valores a receber, cobrando “taxa de liberação” via Pix.</td>
        <td class="p-3">Contato inesperado, cobrança de taxa para “liberar” valores, urgência.</td>
        <td class="p-3">Confirme direto com o advogado ou o tribunal. Valores judiciais não exigem pagamento antecipado a um particular.</td>
      </tr>
    </tbody>
  </table>
</div>

<div class="bg-amber-50 border-l-4 border-amber-500 p-4 my-6 rounded-r-2xl">
  <p class="font-bold text-amber-950 m-0">💡 Regra de bolso que atravessa todos eles:</p>
  <p class="text-sm text-amber-900 mt-1 m-0">Banco, central e empresa séria nunca pedem senha, código de verificação ou instalação de app por telefone/mensagem, nem cobram taxa adiantada para liberar dinheiro.</p>
</div>

<h2>3. Se você caiu: o passo a passo (vale para todos)</h2>
<p>
  A reação é praticamente a mesma em qualquer golpe. O que muda é a velocidade: quanto antes você agir, maior a chance de bloquear o dinheiro antes que ele suma.
</p>

<ol class="space-y-4 my-4">
  <li class="pl-2">
    <strong class="text-navy-950 font-bold block mb-1">1. Interrompa na hora</strong>
    Bloqueie cartão e conta pelo app, troque as senhas (banco, e-mail, redes sociais e conta gov.br) e ative a verificação em duas etapas. Se instalou algum app por orientação de um “atendente”, desconecte o aparelho da internet e procure suporte confiável. Avise seus contatos se sua conta foi usada em seu nome.
  </li>
  <li class="pl-2">
    <strong class="text-navy-950 font-bold block mb-1">2. Guarde as provas antes que sumam</strong>
    Preserve os arquivos originais (não só prints): a conversa, o comprovante com o ID da transação (E2E) do Pix, o número/chave do recebedor, o link ou o QR, e-mails e telas. Gere o hash dos arquivos e, no que puder desaparecer (conversa de WhatsApp, página, perfil), considere uma ata notarial. É o que dá força à sua reclamação e a uma futura ação. <em>(Veja nossos modelos de documentos para download abaixo).</em>
  </li>
  <li class="pl-2">
    <strong class="text-navy-950 font-bold block mb-1">3. Acione o banco e o MED do Pix</strong>
    Abra a contestação pelo app do seu banco (procure “contestação”, “fraude” ou “MED”). O <strong>MED — Mecanismo Especial de Devolução</strong> permite bloquear e devolver valores em caso de fraude: desde 1º de setembro de 2026, o prazo para contestar é de <strong>até 80 dias</strong> da transferência; o banco tem até 7 dias para analisar e, confirmada a fraude, devolve em até 96 horas. Com o <strong>MED 2.0</strong> (obrigatório desde fevereiro de 2026), o sistema rastreia o dinheiro por várias contas em cadeia, aumentando a chance de recuperação. O MED não cobre arrependimento de compra, erro de digitação ou desacordo comercial sem indício de fraude.
  </li>
  <li class="pl-2">
    <strong class="text-navy-950 font-bold block mb-1">4. Registre o Boletim de Ocorrência</strong>
    Faça o B.O. na Delegacia Virtual do seu estado (ou presencialmente). O crime é estelionato (art. 171 do Código Penal), na modalidade de <strong>fraude eletrônica trazida pela Lei 14.155/2021</strong>, que agravou as penas — e que permite processar o caso no domicílio da vítima. O B.O. é peça importante para o banco, para o Banco Central e para a Justiça.
  </li>
  <li class="pl-2">
    <strong class="text-navy-950 font-bold block mb-1">5. Leve às providências oficiais</strong>
    Se o banco não resolver, registre reclamação no <strong>Banco Central (RDR — Registro de Demandas dos Cidadãos)</strong>, no <strong>Consumidor.gov.br</strong> (plataforma pública e monitorada de resolução com a empresa) e/ou no <strong>Procon</strong>. Guarde todos os protocolos.
  </li>
  <li class="pl-2">
    <strong class="text-navy-950 font-bold block mb-1">6. Recupere na Justiça</strong>
    Negada a devolução, cabe ação de ressarcimento (danos materiais e, muitas vezes, morais). Casos de menor valor podem correr no Juizado Especial Cível (até 20 salários mínimos sem advogado; acima disso, com advogado). O ponto central é a prova organizada — veja abaixo quando o banco é obrigado a devolver.
  </li>
</ol>

<h2>4. Onde recorrer, para quê e prazos</h2>
<div class="overflow-x-auto my-6">
  <table class="w-full text-left text-xs sm:text-sm border border-slate-200 rounded-xl overflow-hidden shadow-xs">
    <thead class="bg-slate-100 text-navy-950 border-b border-slate-200">
      <tr>
        <th class="p-3 font-bold">Canal</th>
        <th class="p-3 font-bold">Para quê</th>
        <th class="p-3 font-bold">Prazo / quando</th>
        <th class="p-3 font-bold">Como acessar</th>
      </tr>
    </thead>
    <tbody class="divide-y divide-slate-100">
      <tr>
        <td class="p-3 font-bold text-navy-950 whitespace-nowrap">Seu banco / MED do Pix</td>
        <td class="p-3">Bloquear e tentar devolver o valor</td>
        <td class="p-3">Até 80 dias da transferência; análise em 7 dias; devolução em 96h</td>
        <td class="p-3">App do banco → contestação / fraude / MED</td>
      </tr>
      <tr class="bg-slate-50/50">
        <td class="p-3 font-bold text-navy-950 whitespace-nowrap">Delegacia / B.O.</td>
        <td class="p-3">Registrar o crime (estelionato)</td>
        <td class="p-3">O quanto antes</td>
        <td class="p-3">Delegacia Virtual do seu estado ou delegacia presencial</td>
      </tr>
      <tr>
        <td class="p-3 font-bold text-navy-950 whitespace-nowrap">Banco Central</td>
        <td class="p-3">Reclamar da conduta da instituição</td>
        <td class="p-3">Depois de tentar resolver com o banco</td>
        <td class="p-3">Site do BC → “Registre sua reclamação” (RDR)</td>
      </tr>
      <tr class="bg-slate-50/50">
        <td class="p-3 font-bold text-navy-950 whitespace-nowrap">Consumidor.gov.br</td>
        <td class="p-3">Resolução direta com a empresa (monitorada)</td>
        <td class="p-3">A qualquer momento</td>
        <td class="p-3">Cadastro no portal consumidor.gov.br</td>
      </tr>
      <tr>
        <td class="p-3 font-bold text-navy-950 whitespace-nowrap">Procon</td>
        <td class="p-3">Defesa do consumidor / mediação</td>
        <td class="p-3">A qualquer momento</td>
        <td class="p-3">Procon do município ou do estado</td>
      </tr>
      <tr class="bg-slate-50/50">
        <td class="p-3 font-bold text-navy-950 whitespace-nowrap">Justiça (JEC)</td>
        <td class="p-3">Ressarcimento: danos materiais e morais</td>
        <td class="p-3">Prescrição de 5 anos (CDC)</td>
        <td class="p-3">Juizado Especial Cível; com advogado acima de 20 salários</td>
      </tr>
    </tbody>
  </table>
</div>

<h2>5. Quando o banco é obrigado a devolver</h2>
<p>
  A responsabilidade das instituições financeiras é objetiva: pela <strong>Súmula 479 do STJ</strong> e pelo <strong>art. 14 do CDC</strong>, elas respondem pelos danos causados por fraudes de terceiros (o chamado fortuito interno) — independentemente de culpa, salvo culpa exclusiva da vítima.
</p>
<p>
  A aplicação é mais direta quando há falha de segurança concreta: conta de destino (“laranja”) aberta sem checagem, ausência de bloqueio diante de transações atípicas (vários Pix de alto valor em sequência, fora do perfil do cliente) ou demora em bloquear a conta após o aviso. Nesses cenários, a devolução tende a ser reconhecida.
</p>
<p>
  Nos golpes de engenharia social, em que a própria vítima é induzida a transferir, os tribunais já divergiram — mas <strong>decisões recentes da 3ª Turma do STJ (2025)</strong> firmaram entendimento favorável ao consumidor: afastaram a tese de culpa concorrente quando a vítima é enganada por falso preposto, falsa central ou aplicativo fraudulento, e estenderam expressamente a Súmula 479 às instituições de pagamento e fintechs (Nubank, PicPay, Mercado Pago e afins).
</p>
<p>
  Ainda assim, o segredo do caso é demonstrar a falha de segurança — não basta narrar o golpe. Por isso a prova é decisiva, e vale confirmar o precedente mais recente antes de ajuizar.
</p>

<div class="bg-rose-50 border-l-4 border-rose-500 p-4 my-6 rounded-r-2xl">
  <p class="font-bold text-rose-950 m-0">🚨 Atenção Crítica:</p>
  <p class="text-sm text-rose-900 mt-1 m-0">Ninguém do banco, da Justiça ou de um escritório de advocacia vai pedir que você pague uma “taxa” por Pix para liberar um ressarcimento ou um valor a receber. Esse é, ele próprio, um golpe recorrente.</p>
</div>

<h2>6. Prevenção — o checklist de 1 minuto</h2>
<ul class="space-y-2.5 my-4">
  <li class="flex items-start space-x-2">
    <span class="text-emerald-600 font-bold shrink-0">✓</span>
    <span>Ativei a verificação em duas etapas no WhatsApp, no e-mail, no banco e nas redes?</span>
  </li>
  <li class="flex items-start space-x-2">
    <span class="text-emerald-600 font-bold shrink-0">✓</span>
    <span>Confiro sempre o nome e o valor do recebedor antes de confirmar qualquer Pix/QR?</span>
  </li>
  <li class="flex items-start space-x-2">
    <span class="text-emerald-600 font-bold shrink-0">✓</span>
    <span>Nunca informo senha nem código de 6 dígitos a quem me liga ou manda mensagem?</span>
  </li>
  <li class="flex items-start space-x-2">
    <span class="text-emerald-600 font-bold shrink-0">✓</span>
    <span>Só entrego produto/serviço depois de ver o dinheiro no meu extrato?</span>
  </li>
  <li class="flex items-start space-x-2">
    <span class="text-emerald-600 font-bold shrink-0">✓</span>
    <span>Desconfio de urgência, prêmios, ofertas boas demais e taxas adiantadas?</span>
  </li>
  <li class="flex items-start space-x-2">
    <span class="text-emerald-600 font-bold shrink-0">✓</span>
    <span>Acesso bancos e serviços digitando o endereço, sem clicar em links de mensagens?</span>
  </li>
  <li class="flex items-start space-x-2">
    <span class="text-emerald-600 font-bold shrink-0">✓</span>
    <span>Mantenho apps e sistema atualizados, instalando só de lojas oficiais?</span>
  </li>
</ul>

<!-- MODELOS PARA DOWNLOAD -->
<div class="my-8 p-6 sm:p-8 rounded-3xl bg-slate-50 border border-slate-200 shadow-sm">
  <div class="flex items-center space-x-3 mb-3">
    <span class="text-2xl">📥</span>
    <div>
      <h3 class="font-serif text-xl sm:text-2xl font-bold text-navy-950">Modelos Práticos para Download</h3>
      <p class="text-xs text-slate-500">Documentos jurídicos editáveis (.docx) prontos para preencher e utilizar imediatamente:</p>
    </div>
  </div>

  <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
    <div class="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs flex flex-col justify-between hover:border-gold-400 transition-colors">
      <div class="space-y-1.5 mb-3">
        <span class="px-2 py-0.5 rounded text-[10px] font-black uppercase bg-blue-100 text-blue-900">Word .docx</span>
        <h4 class="font-bold text-xs sm:text-sm text-navy-950">Roteiro de Reação e Preservação de Provas</h4>
        <p class="text-[11px] text-slate-500 leading-relaxed">Formulário para registrar a linha do tempo, valores, dados do golpista e provas coletadas para o B.O. e ação.</p>
      </div>
      <a href="/img/blog/roteiro-golpe-digital.docx" download class="w-full text-center py-2 px-3 rounded-xl bg-slate-100 hover:bg-gold-500 hover:text-navy-950 font-bold text-xs text-slate-700 transition-colors">
        Baixar Roteiro (.docx) ⬇
      </a>
    </div>

    <div class="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs flex flex-col justify-between hover:border-gold-400 transition-colors">
      <div class="space-y-1.5 mb-3">
        <span class="px-2 py-0.5 rounded text-[10px] font-black uppercase bg-emerald-100 text-emerald-900">Word .docx</span>
        <h4 class="font-bold text-xs sm:text-sm text-navy-950">Notificação ao Banco — MED do Pix</h4>
        <p class="text-[11px] text-slate-500 leading-relaxed">Modelo formal de notificação e contestação ao banco com pedido de devolução pelo MED e registro de protocolo.</p>
      </div>
      <a href="/img/blog/notificacao-banco-med-pix.docx" download class="w-full text-center py-2 px-3 rounded-xl bg-slate-100 hover:bg-gold-500 hover:text-navy-950 font-bold text-xs text-slate-700 transition-colors">
        Baixar Notificação (.docx) ⬇
      </a>
    </div>

    <div class="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs flex flex-col justify-between hover:border-gold-400 transition-colors">
      <div class="space-y-1.5 mb-3">
        <span class="px-2 py-0.5 rounded text-[10px] font-black uppercase bg-amber-100 text-amber-900">Word .docx</span>
        <h4 class="font-bold text-xs sm:text-sm text-navy-950">Requerimento de Ata Notarial</h4>
        <p class="text-[11px] text-slate-500 leading-relaxed">Requerimento pronto para solicitar ao Cartório de Notas a lavratura de ata notarial de conversas e sites.</p>
      </div>
      <a href="/img/blog/requerimento-ata-notarial.docx" download class="w-full text-center py-2 px-3 rounded-xl bg-slate-100 hover:bg-gold-500 hover:text-navy-950 font-bold text-xs text-slate-700 transition-colors">
        Baixar Requerimento (.docx) ⬇
      </a>
    </div>

    <div class="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs flex flex-col justify-between hover:border-gold-400 transition-colors">
      <div class="space-y-1.5 mb-3">
        <span class="px-2 py-0.5 rounded text-[10px] font-black uppercase bg-purple-100 text-purple-900">Word .docx</span>
        <h4 class="font-bold text-xs sm:text-sm text-navy-950">Termo de Cadeia de Custódia Digital</h4>
        <p class="text-[11px] text-slate-500 leading-relaxed">Termo para registro de hashes criptográficos (SHA-256) e comprovação da integridade de evidências digitais.</p>
      </div>
      <a href="/img/blog/termo-cadeia-de-custodia.docx" download class="w-full text-center py-2 px-3 rounded-xl bg-slate-100 hover:bg-gold-500 hover:text-navy-950 font-bold text-xs text-slate-700 transition-colors">
        Baixar Termo (.docx) ⬇
      </a>
    </div>
  </div>
</div>

<h2>7. Como o escritório pode ajudar</h2>
<p>
  Se você foi vítima, reúna tudo o que puder (comprovantes, conversas, protocolos, B.O.) e procure orientação o quanto antes — os prazos de recuperação correm. Podemos avaliar o caso, organizar a prova, cobrar o banco pelos canais oficiais e, se necessário, ajuizar a ação de ressarcimento por danos materiais e morais.
</p>
<p class="text-xs text-slate-500 italic mt-4">
  Este conteúdo tem finalidade informativa e não substitui a análise de um advogado para o caso concreto.
</p>
<div class="mt-4 p-4 rounded-2xl bg-slate-100 border border-slate-200 text-xs text-slate-700">
  <strong>Jorge Alvim Advocacia</strong> — Rua Henrique Dias, 259, Loja 5, Benfica, Juiz de Fora/MG · (32) 99815-3429 · jorgealvimadvocacia@gmail.com
</div>
`
};

function seedInitialArticles(db) {
  const postCount = db.prepare('SELECT COUNT(*) as count FROM blog_posts').get().count;
  if (postCount === 0) {
    const now = new Date().toISOString();
    const insertStmt = db.prepare(`
      INSERT INTO blog_posts (
        slug, title, summary, category, content, cover_image, tags,
        author_name, author_oab, views_count, is_published, published_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 1, ?, ?, ?)
    `);

    for (const art of INITIAL_ARTICLES) {
      insertStmt.run(
        art.slug,
        art.title,
        art.summary,
        art.category,
        art.content.trim(),
        art.cover_image,
        art.tags,
        'Dr. Jorge Eduardo da Silva Alvim',
        'OAB/MG 222.943',
        now,
        now,
        now
      );
    }
    console.log('📰 [BLOG] 4 artigos informativos jurídicos iniciais semeados com sucesso para SEO!');
  }
}

function migrateOldArticles(db) {
  const oldPost = db.prepare('SELECT id FROM blog_posts WHERE slug = ?').get('inventario-extrajudicial-cartorio-juiz-de-fora');
  if (oldPost) {
    db.prepare(`
      UPDATE blog_posts SET 
        slug = 'divorcio-pensao-guarda-juiz-de-fora',
        title = 'Divórcio, Pensão Alimentícia e Guarda de Filhos em Juiz de Fora: Guia Prático',
        summary = 'Entenda como funciona o divórcio consensual e litigioso, fixação de pensão alimentícia e guarda compartilhada de filhos perante as Varas de Família de Juiz de Fora.',
        category = 'Direito de Família',
        tags = 'Divórcio, Pensão Alimentícia, Guarda Compartilhada, Direito de Família, Juiz de Fora, União Estável, Partilha de Bens'
      WHERE id = ?
    `).run(oldPost.id);
  }
}

function seedFatdArticle(db) {
  const fatdPost = db.prepare('SELECT id FROM blog_posts WHERE slug = ?').get(FATD_ARTICLE.slug);
  if (!fatdPost) {
    const now = new Date().toISOString();
    db.prepare(`
      INSERT INTO blog_posts (
        slug, title, summary, category, content, cover_image, tags,
        author_name, author_oab, views_count, is_published, published_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 1, ?, ?, ?)
    `).run(
      FATD_ARTICLE.slug,
      FATD_ARTICLE.title,
      FATD_ARTICLE.summary,
      FATD_ARTICLE.category,
      FATD_ARTICLE.content.trim(),
      FATD_ARTICLE.cover_image,
      FATD_ARTICLE.tags,
      'Dr. Jorge Eduardo da Silva Alvim',
      'OAB/MG 222.943',
      now,
      now,
      now
    );
    console.log('📰 [BLOG] Artigo de Direito Militar (FATD / RDE) semeado com sucesso!');
  }
}

function seedGolpesDigitaisArticle(db) {
  const existing = db.prepare('SELECT id FROM blog_posts WHERE slug = ?').get(GOLPES_DIGITAIS_ARTICLE.slug);
  const now = new Date().toISOString();

  if (!existing) {
    db.prepare(`
      INSERT INTO blog_posts (
        slug, title, summary, category, content, cover_image, tags,
        author_name, author_oab, views_count, is_published, published_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 1, ?, ?, ?)
    `).run(
      GOLPES_DIGITAIS_ARTICLE.slug,
      GOLPES_DIGITAIS_ARTICLE.title,
      GOLPES_DIGITAIS_ARTICLE.summary,
      GOLPES_DIGITAIS_ARTICLE.category,
      GOLPES_DIGITAIS_ARTICLE.content.trim(),
      GOLPES_DIGITAIS_ARTICLE.cover_image,
      GOLPES_DIGITAIS_ARTICLE.tags,
      'Dr. Jorge Eduardo da Silva Alvim',
      'OAB/MG 222.943',
      now,
      now,
      now
    );
    console.log('📰 [BLOG] Artigo de Golpes Digitais 2026 semeado com sucesso!');
  } else {
    db.prepare(`
      UPDATE blog_posts SET
        title = ?,
        summary = ?,
        category = ?,
        content = ?,
        cover_image = ?,
        tags = ?,
        updated_at = ?
      WHERE id = ?
    `).run(
      GOLPES_DIGITAIS_ARTICLE.title,
      GOLPES_DIGITAIS_ARTICLE.summary,
      GOLPES_DIGITAIS_ARTICLE.category,
      GOLPES_DIGITAIS_ARTICLE.content.trim(),
      GOLPES_DIGITAIS_ARTICLE.cover_image,
      GOLPES_DIGITAIS_ARTICLE.tags,
      now,
      existing.id
    );
    console.log('📰 [BLOG] Artigo de Golpes Digitais 2026 atualizado com sucesso!');
  }
}

export function seedBlogArticles(db) {
  seedInitialArticles(db);
  migrateOldArticles(db);
  seedFatdArticle(db);
  seedGolpesDigitaisArticle(db);
}
