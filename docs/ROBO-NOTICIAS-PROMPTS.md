# Robô de notícias — motor de IA, prompts e máquina de estados

> Detalhamento do motor de redação do robô (base: plano do Antigravity + spec do Dr. Jorge).
> Ordens correspondentes em `docs/roadmap/ordens-robo-noticias-2026-10-12.json`.
> **O robô NUNCA publica sozinho.** A IA só gera rascunho em JSON; o sistema diagrama;
> o Dr. Jorge revisa e publica.

## Máquina de estados do post (banco)

Reaproveitar `blog_posts` (SQLite), acrescentando:
- `fase`: `1_triagem` | `2_pauta` | `3_redacao` | `4_publicado` (descarte = `descartada`).
- `source_url`, `raw_text` (texto bruto da origem), `ai_outline` (saída estruturada da IA),
  `social_snippets` (legendas de redes).
- Tabelas novas: **termos de busca** (ativa/desativa) e **fontes** (liga/desliga), editáveis pela página `/robo`.
- Atribuição obrigatória: sempre guardar e exibir **fonte + link de origem**. Dedupe por **hash** do conteúdo.

## Motor de IA — `src/modules/robot/robot.ai.js`

Um módulo que fala com a API do modelo (padrão do projeto: **Claude/Anthropic**, chave só no `.env`).
Quatro prompts especializados, **todos com saída em JSON estrito** (a diagramação é do sistema, a IA
nunca devolve HTML/CSS). Acima deles, um **prompt-mestre** com as diretrizes inVioláveis.

### Prompt-mestre (sistema)
IA de Redação e Inteligência Jurídica do escritório Jorge Alvim Advocacia (Juiz de Fora/MG),
especializado em Previdenciário (INSS), Militares e Servidores, Consumidor e Trabalhista.
Missão: transformar notícias/decisões (STF, STJ, TST, TJMG), diários oficiais e matérias
governamentais em conteúdo jornalístico-jurídico de autoridade e linguagem clara.

Diretrizes **inVioláveis**:
1. **Ética da OAB (Provimento 205/2021)** — estritamente informativo/educativo; **nunca** mercantilismo,
   "causa ganha", "ligue já", "garanta seu dinheiro", "processo fácil"; CTA sóbria e acolhedora
   (orientar a buscar os canais oficiais do escritório).
2. **Tradução do juridiquês** — explicar termos difíceis ("transitado em julgado" → "decisão final
   definitiva da Justiça"); escrever para o trabalhador, aposentado, pensionista e família.
3. **Contexto regional** — destacar quando envolver MG, Zona da Mata ou Juiz de Fora.
4. **Saída sempre em JSON estrito** (sem HTML/CSS soltos).

### Prompt 1 — Triagem de pauta
Entrada: `{{TEXTO_BRUTO_OU_RSS}}`, `{{NOME_DA_FONTE}}`, `{{LINK_DA_FONTE}}`.
Saída JSON: `relevancia_escritorio` (Alta|Media|Baixa), `area_juridica`
(Previdenciário|Militar|Trabalhista|Servidor Público|Consumidor|Geral), `fato_principal` (2–3 frases),
`impacto_cidadao`, `recomendacao_pauta` (Publicar como artigo informativo|Apenas monitorar|Descartar por irrelevância).

### Prompt 2 — Ângulos e títulos
Entrada: `{{FATO_PRINCIPAL}}`, `{{AREA_JURIDICA}}`.
Saída JSON: `opcoes_de_angulo` (3 opções: Direto ao Cidadão / Educativo passo a passo / Regional JF-MG,
cada uma com `titulo` ≤75 car., `subtitulo` ≤140 car., `foco`) + `palavras_chave_seo` (5 termos).

### Prompt 3 — Redação em blocos
Entrada: `{{TITULO_SELECIONADO}}`, `{{SUBTITULO_SELECIONADO}}`, `{{AREA_JURIDICA}}`, `{{TEXTO_BRUTO}}`.
Regras: parágrafos curtos (3–4 linhas), negrito só em conceitos-chave, linguagem acolhedora,
**nunca inventar leis/artigos/decisões** fora do texto de origem.
Saída JSON: `titulo`, `subtitulo`, `pontos_rapidos_leitura` (3), `introducao`, `desenvolvimento`
(seções com `subtitulo_secao` + `texto_secao`), `caixa_destaque_advogado` ("Dica Prática do Dr. Jorge Alvim"),
`cta_area` (chamada sóbria + rótulo do botão), `citacao_fonte_oficial` (`veiculo`, `link_oficial`).

### Prompt 4 — Derivação multi-formato (social)
Entrada: `{{TITULO}}`, `{{AREA_JURIDICA}}`, `{{PONTOS_RAPIDOS}}`, `{{URL_DO_POST_NO_SITE}}`.
Saída JSON: `whatsapp_lista_transmissao` (≤3 parágrafos, negrito `*palavra*`, emojis sóbrios, link),
`instagram_linkedin_legenda` (gancho + hashtags), `meta_descricao_google` (150–160 car.).

## Renderizador (sem código para o usuário)
Pega o JSON limpo da IA e monta a diagramação profissional no layout do blog (caixas de destaque,
fonte+link, botão WhatsApp) — o Dr. Jorge nunca mexe em HTML/CSS.

## Para virar uma "IA interna nossa" (e não só uma chamada a um modelo de fora)
O **modelo de linguagem** (Claude) é alugado; **a inteligência do produto é nossa**: os prompts
(nosso ativo, com a ética da OAB), o pipeline em 4 fases, o coletor, a workstation de revisão, o
renderizador e os dados. O que falta para ela ser, de verdade, a **IA do escritório**:
1. **Memória do escritório (RAG):** aprender com os artigos JÁ aprovados e com as correções que o
   Dr. Jorge faz na caixa de revisão, para escrever cada vez mais "no estilo da casa".
2. **Guardião anti-invenção:** validador que sinaliza lei/artigo/decisão citada que NÃO está no texto
   de origem (risco jurídico) — reforça a regra "nunca inventar".
3. **Camada de provedor + registro:** abstrair o modelo (trocar sem reescrever) e registrar cada
   chamada (prompt, tokens, custo, qualidade), com cache para cortar custo.
4. (Futuro, opcional) **Modelo próprio hospedado** (open-source no servidor) — remove a dependência
   externa, mas é caro/pesado e hoje não compensa para o volume de um escritório.
