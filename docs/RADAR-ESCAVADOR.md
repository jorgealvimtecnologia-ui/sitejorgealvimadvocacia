# Radar Judicial via Escavador Business

O Radar Judicial volta a receber **intimações e publicações reais** usando a API do
**Escavador Business** como fonte. Diferente da ComunicaAPI/DJEN (que bloqueia acesso de
fora do Brasil), a API do Escavador **funciona do servidor na França** — por isso **não é
preciso** comprar servidor no Brasil nem configurar proxy.

> Só dados reais. Sem a chave configurada, o Radar por Escavador fica **indisponível** e
> diz isso com clareza (nunca inventa processo ou andamento).

---

## Como funciona (em uma frase)

1. O mestre cadastra um **monitoramento** (o mais barato e completo: a **OAB** do escritório).
2. Quando sai uma intimação, o **Escavador avisa nosso servidor** (callback/webhook).
3. A publicação entra na **mesma tela de sempre** (Intimações), já vinculada ao processo,
   com alerta ao advogado e o prazo pronto para ser lançado na agenda.

## Preços (referência do Escavador, out/2026)

- **Por termo** (OAB, nome, CPF/CNPJ): **R$ 2,20/mês** por termo. Monitorar a **OAB** já
  captura todas as intimações em nome do advogado.
- **Por processo (CNJ)**: diário R$ 1,76/mês · semanal R$ 0,32/mês · mensal R$ 0,08/mês.

Créditos são **pré-pagos** (recarga no painel do Escavador). Cada chamada informa o custo
no cabeçalho `Creditos-Utilizados`.

---

## Ligar em produção (dia do deploy)

1. **Criar a conta e o token** em <https://api.escavador.com/tokens> (o token aparece **uma só vez**).
2. **Guardar a chave no cofre** (nunca em texto puro, nunca no GitHub):
   ```bash
   node scripts/env-vault.js set ESCAVADOR_API_TOKEN
   node scripts/env-vault.js set ESCAVADOR_CALLBACK_TOKEN   # invente um texto aleatório e longo
   ```
3. **Cadastrar o endereço de callback** no painel do Escavador
   (<https://api.escavador.com/callbacks>):
   ```
   https://jorgealvimadvocacia.com.br/api/webhooks/escavador
   ```
   e informar, como token de validação, o **mesmo** valor de `ESCAVADOR_CALLBACK_TOKEN`.
4. **Reiniciar o sistema** para carregar o cofre.
5. **Conferir**: no painel, aba Radar, `GET /api/radar/status?refresh=1` deve mostrar
   `configurado: true` e o saldo.
6. **Criar o monitoramento da OAB** (a rede que pega tudo):
   ```bash
   curl -X POST https://jorgealvimadvocacia.com.br/api/radar/monitoramentos \
        -H "Authorization: Bearer <SEU_TOKEN_DE_PAINEL>" \
        -H "Content-Type: application/json" \
        -d '{"tipo":"diario","termo":"222943"}'
   ```
   (ou pela própria tela do Radar, quando o botão estiver ligado).

### Teste de fumaça (importante)

Como a documentação detalhada da V1 não pôde ser lida durante o desenvolvimento (a rede de
build bloqueia o domínio do Escavador), os **caminhos e nomes de campo** da API ficam
reunidos em **um único lugar**: o objeto `WIRE` em [`src/shared/escavador.js`](../src/shared/escavador.js).
No primeiro teste com o token real, confira:

- a rota de **saldo** e de **monitoramentos**;
- os nomes dos campos da publicação no **callback** (número do processo, tribunal, data, texto);
- o campo de **tribunais/origens** ao criar o monitoramento de diário.

Qualquer ajuste é feito só no `WIRE` — o resto do sistema (gravação, dedupe, alerta,
agenda) não muda. Os extratores já são **tolerantes** a variações comuns de nome.

---

## Segurança

- O token é **server-to-server**: nunca vai para o site/navegador, nunca para o GitHub.
  Fica **criptografado** no cofre (`.env.enc`); a chave do cofre fica fora do projeto.
- O **webhook** só aceita chamadas com o `ESCAVADOR_CALLBACK_TOKEN` correto (senão, 401).
- Toda ação do painel (criar/remover monitoramento, buscar) é registrada na **auditoria**.
- Em caso de suspeita de vazamento, **revogue o token** no painel do Escavador e gere outro
  (`node scripts/env-vault.js set ESCAVADOR_API_TOKEN`).

## Rotas criadas

| Rota | Para quê |
|---|---|
| `GET /api/radar/status` | Provedor configurado?, saldo (`?refresh=1`), último callback |
| `GET /api/radar/monitoramentos` | Lista os monitoramentos na conta do Escavador |
| `POST /api/radar/monitoramentos` | Cria monitoramento (diário por termo ou processo por CNJ) |
| `POST /api/radar/monitorar-processos-ativos` | Monitora de uma vez, por CNJ (semanal), todos os processos ativos que JÁ estão no sistema |
| `POST /api/radar/importar-processos` | ADICIONA ao sistema os processos encontrados na busca (por OAB, ou uma lista) — traz os antigos; dedupe por CNJ |
| `DELETE /api/radar/monitoramentos/:id` | Remove um monitoramento |
| `POST /api/radar/buscar` | Busca sob demanda (OAB, nome, CPF/CNPJ, CNJ) — consome créditos |
| `POST /api/webhooks/escavador` | **Público**, validado por token: recebe os avisos do Escavador |

Tudo sob a permissão da aba **Radar** (`tab_radar`), exceto o webhook público.

## Privacidade: o cliente nunca é avisado automaticamente

Quando chega uma intimação/andamento, o sistema cria **apenas um alerta interno para o advogado**
(na tela de Intimações do painel). **Nada** é enviado ao cliente — nem WhatsApp, nem e-mail. É o
advogado quem decide o que (e se) repassa. Essa regra está no código do webhook e da ingestão.

## Controle de gasto (saldo)

Tudo sai da mesma carteira pré-paga do Escavador. O sistema:

- **soma o custo** de cada chamada (cabeçalho `Creditos-Utilizados`) e mostra o total no status;
- guarda o **saldo** a cada verificação periódica (`GET /api/radar/status?refresh=1`);
- **avisa o mestre** quando o saldo fica abaixo do mínimo (padrão R$ 30; ajuste com
  `ESCAVADOR_SALDO_MINIMO_CENTAVOS`), para recarregar antes de interromper o monitoramento.

## Painel

Na aba **Radar** há um cartão "Radar automático (Escavador)" com: o **saldo** no topo, e os botões
**Monitorar minha OAB**, **Monitorar este processo** (com a frequência) e **Cadastrar todos os
processos ativos**. O cartão avisa, em destaque, que nada é enviado ao cliente automaticamente.
