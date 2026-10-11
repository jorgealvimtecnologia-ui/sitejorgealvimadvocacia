# Alertas de prazo por WhatsApp e e-mail — somente para advogados

Os prazos que o sistema já vigia (agenda, publicações dos tribunais e requerimentos administrativos) agora também
geram aviso **por WhatsApp e e-mail**, de forma escalonada, com **confirmação de ciência** e registro de tudo.
Antes, o aviso só aparecia dentro do painel: se ninguém o abrisse, o prazo passava em silêncio.

## Quem recebe (a regra)

**Só advogado.** Recebe aviso externo apenas o integrante do escritório (cadastro de **Escritórios → integrantes**) que seja:

1. **ativo**;
2. com função **"Advogado Sócio"** ou **"Advogado Associado"**; **e**
3. com o **número da OAB preenchido**.

Nunca recebem: estagiário (a inscrição de estagiário não é de advogado), secretária, recepcionista, administrativo,
motorista, e **"Empresário / Sócio" que não esteja cadastrado como Advogado**.

> **Por que não usar o perfil de acesso?** O perfil "advogado" do controle de acesso é o valor **padrão** da coluna e o
> destino de qualquer funcionário cujo cargo não bata com outra palavra-chave: um "Auxiliar administrativo" pode estar
> marcado como `advogado` lá. Por isso a regra usa o cadastro de integrantes, com OAB. Além disso há uma **trava final**
> no envio que recusa qualquer destinatário que não tenha passado por essa verificação.

Se o prazo indica como responsável alguém que **não é advogado** (ou ninguém), o aviso vai ao **titular** (advogado) e a
mais ninguém. A tela mostra, em "Não recebem alertas externos", cada integrante excluído e o motivo.

## Escalonamento

| Quando | Quem é avisado |
| --- | --- |
| 7 dias antes | responsável |
| 3 dias antes | responsável |
| 1 dia antes | responsável; **se ninguém confirmou ciência**, também o **substituto** e o **titular** |
| No dia | responsável (mesmo após a ciência, pois o prazo ainda não foi cumprido); sem ciência, também substituto e titular |
| 1, 2 e 3 dias depois de vencido | igual ao "no dia" |

- **Só entre 07h e 21h** (Brasília). Fora disso, espera a próxima hora válida.
- Cada etapa avisa **uma vez** por pessoa e canal (não repete a cada varredura). O sistema confere de hora em hora.
- O aviso **não leva nome de cliente** (sigilo): só o tipo do prazo, o número do processo e a data fatal.
- A ciência de **qualquer** advogado envolvido (responsável, substituto ou titular) interrompe o escalonamento.

## Confirmar ciência

- **Pelo link do próprio aviso** (WhatsApp/e-mail): abre uma página com o prazo e um botão. O link só **mostra** a página; quem
  confirma é o botão (assim o pré-visualizador de links do WhatsApp/e-mail não confirma sozinho). O link vale até ~14 dias
  após a data fatal e é individual (assinado).
- **Pelo painel**: botão "confirmar ciência" na notificação do prazo. Só advogado cadastrado confirma (o mestre confirma como titular).
- Fica registrado **quem confirmou, quando e por qual meio** (painel/link), e aparece em "Ver registro".

## Falhas

Cada envio é registrado. Se falhar, o sistema **tenta de novo** na varredura seguinte (até 3 vezes). Esgotadas as tentativas — ou se o
advogado não tem WhatsApp/e-mail válidos — aparece uma **notificação crítica no painel** ("Não consegui avisar … sobre um
prazo"). Se não houver **titular** definido, outra notificação crítica avisa.

## Como configurar (uma vez, pelo painel)

1. **Escritórios**: confira que cada advogado está cadastrado com função de Advogado, **OAB** e **telefone/WhatsApp** e e-mail.
2. **Alertas & Notificações** (só o mestre vê o quadro no topo):
   - marque **um advogado como Titular** (o Dr. Jorge, por exemplo);
   - para cada advogado, escolha o **substituto** e se recebe por WhatsApp, e-mail ou ambos;
   - use **Simular envio** para ver o que seria enviado sem enviar nada, e **Ver registro** para acompanhar.
3. **No servidor** (`.env`/cofre; ver `docs/INFRA.md`):
   - WhatsApp: `WHATSAPP_GATEWAY_URL` e `WHATSAPP_API_KEY` (o quadro avisa se estiver faltando);
   - E-mail: `SMTP_HOST`, `SMTP_USER`, `SMTP_PASS`;
   - `SITE_URL` (padrão `https://jorgealvimadvocacia.com.br`), usado no link de ciência.

## Para quem desenvolve

- Código: `src/modules/deadline-alerts/` (`deadline-alerts.service.js` = regras puras e testáveis; `deadline-alerts.routes.js` = rotas e
  agendador). Painel: `public/js/tabs/tab-deadline-alerts.js`.
- API (só o mestre, exceto a ciência): `GET /api/deadline-alerts/config`, `PUT /api/deadline-alerts/prefs/:memberId`,
  `GET /api/deadline-alerts/log`, `POST /api/deadline-alerts/run` (`{"dry_run":true}`), `POST /api/deadline-alerts/ack` (operador logado,
  só advogado), `GET|POST /ciencia/:token` (pública, o link é a credencial).
- Tabelas: `deadline_alert_prefs`, `deadline_alert_log`, `deadline_acks`. O segredo do link é gerado e guardado em
  `system_settings` (`deadline_ack_secret`) ou vem de `DEADLINE_ACK_SECRET`.
- Desligar: `DEADLINE_ALERTS_DISABLED=1`. Testes: `tests/deadline-alerts.test.js` e `tests/deadline-alerts-routes.test.js`.
