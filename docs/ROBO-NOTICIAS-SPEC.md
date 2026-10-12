# Robô de notícias, caixa de revisão e engajamento — especificação

> Especificação fornecida pelo Dr. Jorge (12/10/2026) para o robô de notícias do blog.
> As ordens correspondentes estão em `docs/roadmap/ordens-robo-noticias-2026-10-12.json`.
> **Regra do próprio pedido:** antes de implementar, explorar o código, apresentar o
> plano e esperar o OK do Dr. Jorge. O robô **nunca publica sozinho**.

## Contexto

Sistema **próprio** (não WordPress), Node + Tailwind, VPS Contabo. Já existe blog com
painel em `/painel` (título, resumo, categoria/área, imagem de capa, tags de SEO,
conteúdo HTML). Posts guardados no banco do próprio site (SQLite). Reaproveitar o modelo
de post e a lógica de salvar que já existem — **não** criar um segundo sistema nem outro banco.

## Três blocos

- **A) Página de controle do robô** (`/robo`, protegida pelo login do painel):
  termos de busca (CRUD + ativar/desativar), fontes (liga/desliga), fila de coleta
  (o que foi coletado e o status), botão "coletar agora" + agendamento automático,
  indicador de "última coleta: quando / quantos itens". Termos e fontes ficam no **banco**,
  editáveis pela página, não fixos no código.
- **B) Caixa de revisão** (`/revisar`, protegida): lista os itens `pendente` que o robô
  rascunhou (título, resumo, tags, HTML, categoria, **fonte + link de origem**). Para cada
  um: editar, publicar, descartar e, se possível, regerar (outra versão da IA). "Publicar"
  só muda o status para `publicada`. **Nada entra no ar sem passar por aqui.**
- **C) Engajamento do público** nas notícias publicadas: curtir (com contador) e comentar
  (nome simples, estilo Amazon). **Comentários sempre moderados** no painel antes de
  aparecer (pendente/aprovado/removido), com antispam. Guardar por comentário: autor, texto,
  data, status. Aba no painel para moderar.

## Fluxo

termos → robô coleta conforme os termos → rascunhos caem na caixa de revisão → o Dr. Jorge
revisa/edita → publica → o público curte e comenta. **O robô nunca publica sozinho.**

## Fontes — começar por UMA e ir somando

Protótipo com **Agência Brasil (EBC)** (Creative Commons, tem RSS). Validar o fluxo inteiro
ponta a ponta. Depois acrescentar, uma de cada vez: Imprensa Nacional (Diário Oficial),
STF/STJ/TST, gov.br e INSS, Governo de Minas, TJMG, Prefeitura de Juiz de Fora. Cada fonte é
um **adaptador isolado** (preferir RSS; raspagem só sem feed).

## Regras inegociáveis

- O robô **nunca publica sozinho** — tudo passa pela caixa de revisão.
- **Só fontes públicas/oficiais** cadastradas; sempre salvar e exibir **fonte + link de origem**.
- Item sem republicação integral → **modo curadoria**: resumo curto próprio + link (nunca
  copiar texto de portal privado).
- **Dedupe** por hash/identificador para não repetir a mesma notícia.
- **Comentários do público sempre moderados** antes de aparecer.

## Preferências técnicas

- Mesma linguagem (Node), mesmo banco, reaproveitando o modelo de post existente.
- Campo `status` no post: `pendente` | `publicada` | `descartada` (os atuais continuam `publicada`).
- Dependências mínimas (parser de RSS leve). Agendamento via `node-cron`, intervalo
  configurável (ex.: a cada 3 h). Chave da API da Anthropic por `.env`, nunca no código.

## Entregar em etapas testáveis (ordem)

1. campo `status` + caixa `/revisar` com um post de teste;
2. página do robô: termos + fontes + fila de coleta;
3. coletor da Agência Brasil gravando itens como `pendente` conforme os termos;
4. redator com IA preenchendo os rascunhos;
5. página pública de notícias filtrando por `publicada`;
6. curtidas nas notícias;
7. comentários + moderação;
8. demais fontes, uma a uma.
