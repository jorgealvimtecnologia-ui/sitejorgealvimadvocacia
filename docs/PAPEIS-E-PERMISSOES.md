# Papéis e permissões por FUNÇÃO — situação atual e PROPOSTA

> **Estado: PROPOSTA para aprovação do Dr. Jorge. Nada disto está aplicado ao sistema.**
> A matriz da seção 3 é um ponto de partida meu, a partir dos perfis que já existem. Os pontos marcados com ❓ dependem de decisão do escritório.

## 1. Como funciona hoje (verificado no código)

| Pergunta | Resposta |
| --- | --- |
| A permissão é conferida por função ou por pessoa? | **Por pessoa.** Cada operador tem uma linha própria em `access_permissions` com as suas chaves (`tab_leads`, `tab_clients`…). O servidor consulta **essa linha** (`rbac.js` → `operatorHasTab`). O interruptor da tela `Usuários & Senhas` liga/desliga **uma aba de uma pessoa**. |
| E o "perfil" (Sócio Titular, Advogado, Secretária…)? | É só um **modelo de partida** (`ROLE_TEMPLATES`): ao criar/sincronizar a pessoa, copia as chaves do modelo. Depois cada pessoa pode ser alterada individualmente e **deixa de seguir a função**. |
| Quem recebe qual perfil? | Decidido por **texto**, não por função cadastrada: o nome ou login contendo `mariana` ou `gabriela` vira **"dono de escritório"** (acesso total: financeiro, RH, usuários, configurações); trechos do login (`adm`, `adv`, `secretaria`…) e palavras do cargo no RH definem os demais. O mestre é reconhecido pelo login `jorgealvimtecnologia`. Qualquer funcionário do RH cujo cargo não bata com nenhuma palavra cai em **`advogado`** (é o valor padrão da coluna). |
| O escopo de dados (`data_scope`: tudo / só os seus / escritório / próprio) funciona? | **Não.** O valor é gravado, mas **nenhum trecho do servidor o aplica**. Um advogado com a aba "Processos" vê **todos** os processos, não só os dele. |
| E as pastas de arquivos? | Só **dois portões**: `/storage/office_drive` exige a aba "Drive"; `/storage/clients` exige a aba "Clientes" (e o cliente só abre a própria pasta). Não há acesso por pasta nem por função além disso. |
| Quantas funções existem? | **8 modelos:** mestre, dono de escritório, advogado, estagiário, secretária, gerente administrativo-financeiro, motorista, cliente. |

| E o login com Google? | Cria a **mesma sessão** do login por senha e passa pelo **mesmo RBAC**: o Google só prova quem é a pessoa; as abas vêm da permissão dela. Não existe atalho para "todas as abas" (testes em `tests/google-rbac.test.js`). **Exceção encontrada e corrigida:** um token de teste era aceito em produção e dava acesso de mestre (ver `docs/SECURITY.md`). Quando as funções forem implantadas, o Google passa a segui-las automaticamente, pois usa o mesmo usuário. |

**Consequência prática:** dar o mesmo cargo a duas pessoas não garante o mesmo acesso; trocar o nome de uma pessoa pode mudar o que ela vê; e a regra "só vê o que é seu" ainda não existe no servidor.

## 2. Como deve ser (a sua regra): por função

1. Cada pessoa tem **exatamente uma função**, escolhida pelo mestre.
2. A permissão **vem da função**. Mudou a função, mudou o acesso, automaticamente.
3. **Sem nome próprio nem texto de login no código** para decidir acesso.
4. Exceção individual só pelo mestre, **registrada na auditoria** e visível como exceção (não como "função diferente").
5. O escopo de dados é **aplicado no servidor** (advogado de escritório só vê os próprios processos; cliente só os seus).

## 3. As 17 funções (sua lista + Cliente) e a matriz proposta

Funções: 1 Mestre · 2 Advogado proprietário de escritório · 3 Advogado sócio · 4 Advogado de escritório · 5 Estagiário · 6 Secretaria ·
7 Chefe de RH · 8 Chefe do setor financeiro · 9 Chefe de comunicação social e marketing · 10 Chefe de sistema de informação ·
11 Motorista · 12 Serviços gerais · 13 Motoboy · 14 Auxiliar de RH · 15 Auxiliar do setor financeiro · 16 Auxiliar de sistema de informação · 17 Cliente

Legenda: ● acesso · ◐ acesso restrito/somente leitura ❓ · ○ sem acesso. Colunas = abas existentes hoje.

| Aba | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 | 15 | 16 | 17 |
| --- | :-: | :-: | :-: | :-: | :-: | :-: | :-: | :-: | :-: | :-: | :-: | :-: | :-: | :-: | :-: | :-: | :-: |
| Leads (captação) | ● | ● | ● | ○ | ○ | ● | ○ | ○ | ● | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ |
| Clientes | ● | ● | ● | ● | ○ | ● | ○ | ◐ | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ |
| Processos | ● | ● | ● | ● | ● | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ |
| Radar / Publicações | ● | ● | ● | ● | ● | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ |
| Escritórios | ● | ● | ● | ◐ | ○ | ○ | ◐ | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ |
| Drive | ● | ● | ● | ● | ● | ◐ | ◐ | ◐ | ◐ | ○ | ○ | ○ | ○ | ◐ | ◐ | ○ | ○ |
| Agenda | ● | ● | ● | ● | ● | ● | ● | ● | ● | ● | ● | ○ | ● | ● | ● | ● | ○ |
| RH / Folha | ● | ● | ○ | ○ | ○ | ○ | ● | ○ | ○ | ○ | ○ | ○ | ○ | ◐ | ○ | ○ | ○ |
| Financeiro | ● | ● | ❓ | ○ | ○ | ○ | ○ | ● | ○ | ○ | ○ | ○ | ○ | ○ | ◐ | ○ | ○ |
| Marketing / Blog / Meta Ads ❓ | ● | ● | ○ | ○ | ○ | ○ | ○ | ○ | ● | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ |
| Usuários e Senhas | ● | ● | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ● | ○ | ○ | ○ | ○ | ○ | ◐ | ○ |
| Configurações / Manutenção | ● | ● | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ● | ○ | ○ | ○ | ○ | ○ | ◐ | ○ |
| Portal do colaborador | ● | ● | ● | ● | ● | ● | ● | ● | ● | ● | ● | ● | ● | ● | ● | ● | ○ |
| Portal do cliente | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ● |
| **Escopo dos dados** | tudo | tudo | escritório | só os seus | só os seus | escritório | RH | financeiro | marketing | sistema (**sem dados de clientes**) | só a agenda dele | — | só a agenda dele | RH | financeiro | sistema | só o próprio |

### Pontos de atenção

- **Chefe e auxiliar de sistema de informação (10 e 16): sem acesso a dados de clientes, processos e financeiro.** Quem administra o sistema não precisa (nem deve, pelo **sigilo profissional**) ler os processos. É uma decisão de arquitetura importante.
- **Alertas de prazo por WhatsApp/e-mail (AUD-04):** hoje "advogado" é definido pelo cadastro de integrantes com **OAB**. Com as funções criadas, **as três funções de advogado (2, 3 e 4)** passam a ser a definição, ainda exigindo a OAB. Estagiário, secretaria e demais nunca recebem.
- **Cliente (17)** já existe como perfil; passa a ser a 17ª função, só com o portal do cliente e **somente a própria pasta**.

## 4. Decisões que preciso do Dr. Jorge ❓

1. A matriz acima está de acordo? Em especial: **sócio** vê o financeiro? **Chefe de marketing** acessa Meta Ads/blog (hoje esses recursos ficam em "Configurações")?
2. **Advogado de escritório** e **estagiário** devem ver **só os seus processos** (como a matriz propõe) ou todos?
3. **Chefe de RH** vê a folha de pagamento completa e a de todos os funcionários?
4. Existem pessoas que hoje têm acesso **além** da função delas e que devem continuar (exceção registrada)?
5. As funções **Mariana** e **Gabriela** (hoje por nome) são qual das funções 2, 3 ou 4?

## 5. Como seria implementado (depois de aprovado)

1. Nova coluna `funcao` obrigatória em cada operador, com as 17 funções; migração mapeia cada pessoa atual para uma função **proposta, que o mestre confirma uma a uma**.
2. A matriz vira **dados** (uma tabela função × aba), editável só pelo mestre. O servidor consulta a função da pessoa, e não as chaves individuais; exceções ficam numa tabela à parte, com autor e data.
3. Remoção das regras por nome (`mariana`, `gabriela`) e por trecho de login.
4. Escopo de dados aplicado nas consultas (ex.: processos filtrados pelo advogado responsável).
5. Testes por função na API e nas pastas de arquivos, e a tela `Usuários & Senhas` mostrando função + exceções.
