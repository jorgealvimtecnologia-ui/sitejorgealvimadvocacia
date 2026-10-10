# Design system (AUD-18)

Objetivo: o sistema inteiro com **a mesma cara, a mesma lógica e os mesmos dados**, mais fácil de manter e mais agradável de usar.

## O que existe

| Peça | Onde | Para quê |
| --- | --- | --- |
| **Tokens** | `public/css/tokens.css` | Fonte única de cores, tipografia, espaços, raios, sombras. Modo claro e escuro. |
| **Componentes** | `public/css/components.css` | Botão, campo, cartão, tabela, janela, selo, selo de prazo, aviso, linha do tempo, chip (`.ds-*`). Só usam tokens. |
| **Lógica** | `public/js/core/ds.js` (`window.DS`) | A cor do selo de prazo sai da urgência (hoje/vencido, 1–3, 4–7, mais de 7 dias): uma regra só, para todas as telas. |
| **Catálogo** | `/design-system` | Exemplo vivo de cada componente, paleta com os valores reais e alternância claro/escuro. |
| **Auditoria** | `docs/DESIGN-AUDIT.md` (`node scripts/design-audit.js --escrever`) | Mede o que as páginas usam hoje: paletas, cores soltas, variações de botão. |

## O que a auditoria encontrou (resumo)

- 3 versões diferentes do azul-marinho da marca entre `index`, `painel` e as demais páginas, e 2 versões do dourado.
- Mais de 80 cores avulsas e 22 combinações de degradê em botões: cada tela inventou o seu.
- O dourado `#B8860B` (usado em textos) **não passa no contraste** sobre branco (3,3:1). Para texto o sistema usa `--ds-accent-text` (5:1).

## Regras

1. **Tela nova usa `var(--ds-*)` e as classes `.ds-*`.** Nenhum hexadecimal novo fora de `tokens.css`.
2. **Contraste mínimo 4,5:1** (WCAG AA) em todo par texto/fundo, nos dois modos. O teste `tests/design-system.test.js` reprova se algum par falhar.
3. **Alvo de toque de 44 px** e **foco visível** em tudo que se clica.
4. **Cor com significado vem de um lugar só** (ex.: `DS.deadlineTone`). Nada de cada tela decidir "vermelho" do seu jeito.
5. Todo componente novo entra no catálogo (o teste reprova componente sem exemplo).

## Modo escuro: avaliação

- **Pronto:** tokens claros e escuros (automático pela preferência do aparelho, ou forçado com `data-theme="dark"`), todos com contraste conferido. O catálogo já alterna.
- **Não ligado nas telas atuais, de propósito:** o painel e o site foram escritos com classes do Tailwind e cores literais (milhares de pontos). Ligar o escuro neles agora geraria telas com texto ilegível (a mesma armadilha que evitamos no `agendar.html`, que fixa `data-theme="light"`).
- **Caminho seguro:** migrar tela a tela para os componentes `.ds-*` (começando pelas novas telas e pelo portal do cliente) e só então liberar o escuro naquela tela. Nada é ligado sem teste visual.

## Migração gradual (sugestão de ordem)

1. Telas novas (já nascem em `.ds-*`): agendamento online, indicadores do dono.
2. Portal do cliente (`cliente.html`): cartões, linha do tempo, avisos e botões.
3. Painel: modais e tabelas, uma aba por vez.
4. Unificar a paleta do Tailwind de cada página com os tokens (um valor de azul-marinho e um de dourado).
