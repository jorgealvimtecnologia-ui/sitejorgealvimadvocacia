# Infra, deploy, rollback, staging e Cloudflare

O app roda no VPS Contabo (`161.97.71.14`) como serviço systemd `advocacia` em
`/var/www/advocacia`, atrás do nginx com HTTPS. **O deploy é por cópia de arquivos**
(não é git no servidor).

## Deploy de produção (com backup automático)

Dê dois cliques em **`deploy-servidor.bat`**. Ele agora:
1. Faz **backup completo** de tudo que envia (server.js, painel.html, as 4 páginas
   públicas, `src/` e `public/`) em `/var/www/advocacia/backups/predeploy-<data-hora>` e
   grava esse caminho em `backups/LAST`.
2. Envia os arquivos por `scp` (inclui `scripts/`).
3. Roda `scripts/deploy-remote.sh` no servidor: ajusta permissões, reinicia, e faz o
   **health check** — com **AUTO-ROLLBACK**.

## Auto-rollback (o pipeline se cura sozinho)

O `deploy-servidor.bat` (e o workflow de CI/CD) executam `scripts/deploy-remote.sh` no
servidor, que:
1. Ajusta permissões (`chown`/`chmod`), reinicia o serviço e checa `http://localhost:3000/health`.
2. Se voltar **200** → grava a versão implantada (data/hora + commit) em `backups/DEPLOYED`
   e termina OK.
3. Se **NÃO** voltar 200 → **restaura automaticamente** o último backup (`backups/LAST`),
   reinicia e recheca. Resultado: o site volta sozinho para a versão anterior que
   funcionava. A tela do `.bat` mostra "**REVERTIDO automaticamente**".
4. Se até o rollback falhar → avisa para rodar `reparar-servidor.bat` (falha grave).

Ou seja: um deploy quebrado **não derruba o site** — ele se desfaz sozinho. O banco de
dados (`leads.db`) nunca é tocado; só o código.

### Rollback manual (opcional)
Se quiser reverter um deploy que subiu OK mas você não quer mais, dê dois cliques em
**`reverter-deploy.bat`** (restaura `backups/LAST`, pede confirmação "SIM").

### Qual versão está no ar?
`cat /var/www/advocacia/backups/DEPLOYED` mostra data/hora + commit do que está rodando.

## Staging (homologação) — a configurar UMA vez

Ambiente separado para testar antes de publicar. O que provisionar no servidor:

1. **Pasta:** `mkdir -p /var/www/advocacia-staging` e copie um `.env` próprio lá
   (com `PORT=3001`, `NODE_ENV=production`, `ALLOWED_ORIGINS` do subdomínio de homolog).
2. **Serviço systemd** `advocacia-staging` igual ao de produção, mas apontando para
   essa pasta e porta 3001. `systemctl enable --now advocacia-staging`.
3. **Subdomínio** (ex.: `homolog.jorgealvimadvocacia.com.br`): registro A → 161.97.71.14
   + vhost nginx fazendo proxy para `127.0.0.1:3001` + `certbot` para o HTTPS.
   Dica: proteja com HTTP Basic Auth (não indexar; `robots.txt` com `Disallow: /`).

Depois disso, publique no staging com **`deploy-staging.bat`**. Valide e só então
rode `deploy-servidor.bat` para produção.

## CI/CD opcional (GitHub Actions com rollback)

`.github/workflows/deploy.yml` é um pipeline **disparado à mão** (aba Actions →
"Deploy (manual)" → escolher `staging`/`producao`). Ele roda os testes, faz backup
completo (rollback pelo `reverter-deploy.bat` continua valendo), envia e reinicia.

Para ativar, crie em **Settings → Secrets and variables → Actions**:

| Secret | Valor |
| --- | --- |
| `DEPLOY_SSH_KEY` | conteúdo da chave privada `id_ed25519_161_97_71_14` |
| `DEPLOY_HOST` | `161.97.71.14` |
| `DEPLOY_USER` | `root` |
| `DEPLOY_PATH` | `/var/www/advocacia` (ou `.../advocacia-staging`) |
| `DEPLOY_SERVICE` | `advocacia` (ou `advocacia-staging`) |

Sem os secrets, o workflow para no passo de verificação (não publica nada).

## Cloudflare (CDN + cache + WAF) — a ativar UMA vez

O **código já está preparado**: quando `TRUST_CLOUDFLARE=1` no `.env`, o servidor lê o
IP real do visitante em `CF-Connecting-IP` (auditoria/analytics/geolocalização corretos).
Sem essa variável, nada muda.

Passos na sua conta (feitos por você):
1. Criar conta Cloudflare Free → adicionar `jorgealvimadvocacia.com.br`.
2. Conferir os registros A `@` e `www` → `161.97.71.14` (nuvem **laranja**/proxied).
3. Trocar os nameservers no **registro.br** (de `a.auto.dns.br`/`b.auto.dns.br` para os
   dois da Cloudflare).
4. SSL/TLS em **Full (strict)** — a origem já tem Let's Encrypt válido. **Nunca** use
   "Flexible" (gera loop de redirecionamento).
5. **Always Use HTTPS** ON, **Brotli** ON.
6. No `.env` do servidor, adicionar `TRUST_CLOUDFLARE=1` e reiniciar o serviço.

Observações: a renovação do Let's Encrypt (HTTP-01) continua funcionando através da
Cloudflare; o plano Free limita upload a 100 MB (o app já usa 100 MB — no limite).

## Backup de dados (diário), segredos e recuperação

O backup de **dados** (banco, documentos) é separado do backup de **código** que o deploy faz.

- **Quando:** todo dia às 03:00, por cron (`scripts/setup-backup-cron.sh` configura; roda `backup.sh`).
- **Onde:** `backups/backup_jorgealvim_<data-hora>.tar.gz` + `.sha256` no servidor; fica 30 dias.
  Cópia externa (3-2-1): `puxar-backup-hd.sh` baixa o pacote mais recente para o HD externo.
- **Conteúdo:** `leads.db` (cópia a quente, **higienizada**), `storage/` (documentos de clientes e do
  escritório), certificados **públicos** de `nginx/ssl/` e `env-variaveis.txt` (só os **nomes** das
  variáveis do `.env`, sem valores, para saber o que reconfigurar) e `MANIFEST.sha256` (hash de cada arquivo, usado pelo
  teste de restauração).

### Segredos fora do backup

O pacote é levado a HD externo sem criptografia, então **nunca** leva segredos em texto puro:

| Segredo | O que o backup faz |
| --- | --- |
| `.env` (Asaas, SMTP, Meta, WhatsApp, reCAPTCHA…) | **Não copia.** Só grava os nomes em `env-variaveis.txt` |
| Chaves privadas TLS (`*key*`, `.pfx`, `.p12`) | **Não copia** (o certificado se reemite) |
| Chaves de API gravadas no banco (`system_settings`, `meta_api_settings`: `asaas_api_key`, `meta_system_user_token`…) | A **cópia** do banco sai com esses valores vazios (`scripts/backup-scrub-db.js`). O banco de produção não é alterado |
| Sessões de login e links temporários (`auth_sessions`, `magic_upload_tokens`) | Removidos da cópia |

O `backup.sh` aborta se algum arquivo `.env`/chave escapar para dentro do pacote, e apaga a pasta
temporária em qualquer saída. Coberto por `tests/backup-secrets.test.js`.

**Onde fica, então, o `.env` de produção?** Guarde uma cópia no seu **cofre de senhas** (ex.: Bitwarden,
1Password) ou num arquivo criptografado só seu, fora do servidor e do HD de backup. Sem essa cópia, uma
restauração a partir de um servidor novo exige recriar as chaves nos painéis de cada serviço.

**Depois de restaurar um backup:** (1) recolocar o `.env` a partir do cofre (use `env-variaveis.txt` como
checklist); (2) informar de novo as chaves de API no painel (Financeiro → Asaas; Meta Ads); (3) fazer login
de novo (as sessões antigas não existem mais).

### Limpar backups antigos (feitos antes desta proteção)

Pacotes antigos podem conter `.env.backup`, chaves TLS e um banco com chaves de API. Revise e limpe,
tanto no servidor quanto no HD externo (passe a pasta de cada um):

```
node scripts/backup-scrub-old.js backups             # só relata, não altera nada
node scripts/backup-scrub-old.js backups --aplicar   # regrava os pacotes sem os segredos
node scripts/backup-scrub-old.js /media/SEU_HD/Backups-JorgeAlvim --aplicar
```

Limpar o arquivo **não desfaz** uma exposição que já aconteceu: se alguma cópia antiga já saiu do seu
controle (HD perdido ou emprestado, enviado a terceiros), **gire as chaves** (Asaas, SMTP, Meta e as demais
do `.env`) em cada serviço.

### Teste de restauração, RPO e RTO

Backup que nunca foi restaurado é só uma esperança. Por isso o backup passa por um **teste de restauração**
(`scripts/backup-restore-test.js`, `npm run backup:verify`): ele pega o pacote mais recente, **restaura numa pasta
temporária isolada** (nunca toca o banco nem os arquivos de produção) e confere:

| Verificação | O que pega |
| --- | --- |
| Idade do backup (máx. 36 h) | o cron diário parou de rodar |
| Checksum SHA-256 do pacote | pacote corrompido ou adulterado |
| Extração | pacote ilegível |
| `PRAGMA integrity_check` do banco | banco corrompido (inclusive o que ainda abre) |
| Tabelas essenciais + pelo menos 1 usuário | backup "vazio" que não serviria para restaurar |
| Cada arquivo contra o `MANIFEST.sha256` | documento de cliente corrompido, trocado ou faltando |
| Sem segredos em texto puro | regressão da proteção do `.env` |

- **Quando:** todo **domingo às 04:30** (configurado por `scripts/setup-backup-cron.sh`). Semanal de propósito: se o
  backup diário parar, o aviso chega em até 7 dias, não em 30.
- **Se falhar:** e-mail ao titular (`--avisar`, precisa de SMTP) e linha em `backups/restore-test.log`. Backup que
  falha no teste **não é confiável**: corrija antes de depender dele.
- **Rodar à mão:** `npm run backup:verify` (ou informe um pacote: `node scripts/backup-restore-test.js caminho.tar.gz`).
  Passe `--json` para uma saída estruturada. O relatório mostra o **tempo da restauração**, que é o dado real para o RTO.
- Pacotes antigos (sem manifesto) passam com **aviso**; não são reprovados.

**Metas de recuperação** (propostas pelo desenho atual; **o Dr. Jorge precisa confirmar ou ajustar**):

| Meta | Valor proposto | Por quê |
| --- | --- | --- |
| **RPO** (quanto dado se aceita perder) | **até 24 h** | há um backup por dia, às 03:00: na pior hora do dia perde-se o que entrou desde as 03:00 |
| **RTO** (quanto tempo parado, no máximo) | **até 4 h** | tempo para pôr um servidor de pé, restaurar o pacote, recolocar o `.env` e conferir. É uma **meta ainda não medida de ponta a ponta**: o teste semanal mede só a restauração em área isolada; faça um exercício real (servidor reserva) para validar |

Se 24 h de perda for demais para o escritório, o caminho é copiar o banco com mais frequência (ex.: de hora em hora),
o que **ainda não está implementado**.

**Restaurar de verdade (servidor perdido ou dados corrompidos):**

1. Pegue o pacote mais recente: no servidor (`backups/`) ou no HD externo (`puxar-backup-hd.sh` guarda lá).
2. **Prove que ele serve antes de usar:** `node scripts/backup-restore-test.js caminho/do/pacote.tar.gz`.
3. Pare o serviço: `systemctl stop advocacia`.
4. Extraia: `tar -xzf pacote.tar.gz -C /tmp/` e copie `leads.db` e `storage/` para `/var/www/advocacia/`.
   Apague `leads.db-wal` e `leads.db-shm` antigos, se existirem.
5. Recoloque o código (`deploy-servidor.bat`) e o `.env`/`.env.enc` (do cofre de senhas; use `env-variaveis.txt`
   como checklist) e a chave do cofre em `/etc/advocacia/env.key`.
6. `systemctl start advocacia`, confira `http://localhost:3000/health` e faça login.
7. Informe de novo as chaves de API no painel (Asaas, Meta): a cópia do banco no backup vem sem elas, de propósito.
8. Registre o dia, o pacote usado e quanto tempo levou: é o seu RTO real.

## `.env` criptografado no servidor (cofre) e o guardião do `.env`

**Regra:** o `.env` com segredos **nunca** fica em texto puro no GitHub, na imagem Docker nem no Contabo.
Os segredos (chaves de API, senhas, tokens) ficam **criptografados** em `.env.enc` (AES-256-GCM); o
`.env` guarda só configuração pública (porta, IDs, origens CORS). O servidor abre o cofre ao iniciar,
em memória. Quem decide o que é segredo é o nome da variável (`*KEY*`, `*TOKEN*`, `*SECRET*`, `*PASS*`,
`*SENHA*`...; `RECAPTCHA_SITE_KEY` e `*_KEY_SHA256` são públicas).

| Peça | Onde fica | Observação |
| --- | --- | --- |
| `.env` (só configuração pública) | `/var/www/advocacia/.env`, permissão 600 | pode ter IDs/portas |
| `.env.enc` (segredos criptografados) | `/var/www/advocacia/.env.enc`, permissão 600 | seguro para anexar a e-mail |
| **Chave do cofre** | `/etc/advocacia/env.key`, permissão 600, **fora do projeto** | nunca em backup, repositório ou e-mail |
| Cópia da chave | **seu cofre de senhas** (Bitwarden, 1Password...) | sem ela o `.env.enc` não abre |

### Migrar o servidor (uma vez)

O guardião do deploy **recusa** publicar enquanto o `.env` do servidor tiver segredos em texto puro. Para o
primeiro deploy, libere **uma vez** e migre logo em seguida:

```
# 1) no servidor: libera UM deploy (o arquivo é apagado sozinho depois de usado)
ssh root@161.97.71.14 "touch /var/www/advocacia/.deploy-permite-env-texto-puro"

# 2) faça o deploy normal (deploy-servidor.bat). Ele avisa que foi liberado e pede a migração.

# 3) no servidor: cria a chave fora do projeto e move os segredos para o cofre
ssh root@161.97.71.14
cd /var/www/advocacia
node scripts/env-vault.js migrate --gerar-chave      # confere ida e volta antes de tocar no .env
cat /etc/advocacia/env.key                           # COPIE para o cofre de senhas agora
systemctl restart advocacia
node scripts/env-vault.js status                     # deve dizer: segredos em texto puro: nenhum ✓
```

A partir daí, o deploy passa sem liberação. Para trocar/definir um segredo: `node scripts/env-vault.js set ASAAS_API_KEY`
(sem o valor na linha de comando: ele lê da entrada, para não ficar no histórico do shell).
Os scripts `ativar-google-analytics`, `ativar-google-login` etc. só gravam IDs **públicos** no `.env`, o que continua permitido.

### Aviso por e-mail a cada alteração

Toda alteração do `.env`/`.env.enc` (variável adicionada, removida, alterada ou arquivo regravado), por qualquer meio
(script, ssh, editor), gera um e-mail a `jorgealvimtecnologia@gmail.com` com:

- **relatório** (`env-alteracao-<data>.txt`): servidor, versão no ar, e os **nomes** das variáveis adicionadas/removidas/alteradas.
  **Nunca valores.**
- **cópia criptografada** do cofre (`env-cofre-<data>.enc`): só abre com a chave, que **não** vai no e-mail.

O servidor confere ao iniciar e de hora em hora; se o e-mail falhar, a alteração fica pendente e é reenviada. O primeiro envio é a
"linha de base". Requer SMTP configurado (`SMTP_HOST/SMTP_USER/SMTP_PASS`). Trocar o destinatário: `ENV_CHANGE_NOTIFY_TO`.
Histórico local (só nomes): `.env.historico.log`.

> O `.env` em texto puro **nunca** é enviado por e-mail: enviar segredos por e-mail os expõe (caixa de entrada, backups do
> provedor, encaminhamentos), que é exatamente o que o guardião proíbe.

### Conferir a exposição

```
npm run check:env                                         # repositório (também roda no npm test e na CI)
node scripts/check-env-exposure.js --servidor=/var/www/advocacia          # no servidor (o deploy já roda isto)
node scripts/check-env-exposure.js --servidor=/var/www/advocacia --backups # inclui pacotes de backup antigos
node scripts/check-env-exposure.js --url=https://jorgealvimadvocacia.com.br # bate no site ao vivo (/.env, /.git/config, /leads.db...)
```

A CI confere o site ao vivo todo dia (`.github/workflows/env-exposure.yml`); se algo ficar acessível, a execução falha e o GitHub avisa.

### nginx do servidor Contabo

O `nginx/default.conf` do repositório já bloqueia arquivos ocultos. O nginx que roda **no Contabo** não está no repositório:
confirme que o `server` HTTPS dele tem este bloco (e rode a checagem `--url` acima para provar):

```
location ~ /\.(?!well-known) {
    deny all;
    return 404;
}
```

### Ordem de precedência ao carregar

variável já definida no processo (ex.: `Environment=` do systemd) → cofre `.env.enc` → `.env`.
Se existe `.env.enc` e a chave não abre o cofre, o servidor **não inicia** (rodar com configuração incompleta é pior).

### Migração do .env como root: o serviço precisa ser o DONO

Rodar `node scripts/env-vault.js migrate` como `root` deixava `.env`, `.env.enc` e `/etc/advocacia/env.key` de root com permissão 600: o serviço (www-data) não os lia (`EACCES`) e o site caía em ciclo de reinício (ocorreu em 03/10/2026). Agora o script copia o dono da pasta `src/` (usuário do serviço) e o guardião do servidor confere (e, no deploy, corrige) o dono desses três arquivos. Correção manual, se acontecer:

```bash
U=$(systemctl cat advocacia | sed -n 's/^User=//p'); U=${U:-www-data}
chown "$U:$U" /var/www/advocacia/.env /var/www/advocacia/.env.enc
chown -R "$U:$U" /etc/advocacia && chmod 700 /etc/advocacia && chmod 600 /etc/advocacia/env.key
systemctl restart advocacia
```

### A chave do cofre vazou (apareceu em chat, captura de tela, e-mail…)? Troque-a

```bash
cd /var/www/advocacia
node scripts/env-vault.js rotate-key
chown www-data:www-data /var/www/advocacia/.env.enc /etc/advocacia/env.key   # só se rodou como root numa versão sem o chown automático
systemctl restart advocacia && sleep 5 && curl -s http://localhost:3000/health; echo
```
O comando reencripta o `.env.enc` com uma chave nova, confere que o ambiente fica idêntico e que a chave antiga deixa de abrir, e guarda a chave e o cofre antigos em `/etc/advocacia/env.key.anterior` e `env.key.cofre.anterior` para desfazer. Com o site no ar: `shred -u /etc/advocacia/env.key.anterior /etc/advocacia/env.key.cofre.anterior`, guarde a chave NOVA no gerenciador de senhas e, se a chave antiga viajou junto com cópias do cofre (e-mails de aviso, backups), gire também os segredos que estão nele (ex.: nova senha de app do SMTP).

## Observabilidade (AUD-08)

- **Logs em JSON:** cada requisição gera uma linha (`ts`, `level`, `id`, `method`, `path`, `status`, `ms`, `user`). Nunca entram corpo, cabeçalhos, cookies, tokens nem a query string. O mesmo `id` volta no cabeçalho `X-Request-Id` e no campo `request_id` de erros 500: com ele se acha a linha exata no log.
  Ler no servidor: `journalctl -u advocacia -o cat | grep '"level":"error"'` (ou `docker logs`, conforme a instalação).
- **`/health`** (público, sem segredos): `status` = `ok` | `degraded` | `fail`; confere o **banco**, o **espaço em disco**, as **tarefas automáticas** (`varredura_prazos`, `alertas_prazo_externos`, `sincronizacao_tribunais`) e conta os erros da última hora. Responde **503** se o banco não responde, para o monitor externo detectar.
- **Vigia interno** (a cada 10 min): se uma tarefa automática parar, o disco ficar abaixo de 15% livre ou o banco falhar, cria uma notificação para o mestre no painel (uma por problema por dia). Para vigiar o **certificado HTTPS**, defina a variável `CERT_CHECK_HOST` com o domínio do site (só o nome do domínio, sem segredo); avisa quando faltar 15 dias ou menos.
- **Site fora do ar:** o vigia interno não consegue avisar quando o próprio servidor cai. Configure um monitor **externo** gratuito (por exemplo UptimeRobot ou similar) apontando para `https://<dominio>/health`, com aviso por e-mail ao titular; o monitor deve tratar resposta diferente de 200 como falha.
- **Erros:** os 100 últimos ficam em memória (contagem em `/health`) e todos vão ao log em JSON com `id`, caminho e começo da pilha. Um serviço de rastreio externo (Sentry ou similar) é um passo opcional futuro.

## Documentos e backups cifrados (AUD-12)

Duas proteções independentes. **Nenhuma** deixa de funcionar sozinha: sem as chaves configuradas, o sistema segue como antes.

### 1) Backup externo cifrado (chave pública / privada)

- **Como funciona:** o servidor guarda só a chave **pública** (`/etc/advocacia/backup-public.pem`). Todo dia, depois do backup, `backup.sh` gera o pacote
  `.tar.gz.enc` (AES-256-GCM, com a chave do pacote trancada pela chave pública RSA-4096). **Só a chave privada abre.** Se o servidor for invadido, os
  backups continuam fechados. A chave privada fica com o Dr. Jorge (Bitwarden + cópia impressa), **nunca** no servidor, no GitHub ou em e-mail.
- **Configurar (uma vez), no notebook, na pasta do projeto:**
  1. `node scripts/backup-cifrar.js gerar-chaves ~/chaves-backup` — cria `backup-public.pem` e `BACKUP-PRIVADA-NAO-COLOCAR-NO-SERVIDOR.pem`.
  2. Guarde o conteúdo da **privada** no gerenciador de senhas e imprima uma cópia. Depois mova o arquivo para um pendrive/HD fora do notebook.
  3. Envie só a pública ao servidor: `scp ~/chaves-backup/backup-public.pem root@161.97.71.14:/etc/advocacia/backup-public.pem`
  4. Teste: `ssh root@161.97.71.14 "cd /var/www/advocacia && bash backup.sh"` — deve aparecer "Cifrando o pacote para a cópia externa".
- **Verificar uma cópia (no notebook, com a privada):** `node scripts/backup-cifrar.js verificar backups-offsite/ARQUIVO.tar.gz.enc --priv=CAMINHO/BACKUP-PRIVADA-NAO-COLOCAR-NO-SERVIDOR.pem`
  (confere o SHA-256 e abre o pacote inteiro). Para restaurar: o mesmo comando com `decifrar` (gera o `.tar.gz`).
- **Trazer para o notebook:** `./baixar-backup.sh` agora baixa a versão **cifrada** (`.enc`) quando ela existe.
- **Envio automático para fora (opcional, quando você escolher o destino):** instale o `rclone`, configure o destino (ex.: Google Drive) e grave o nome dele numa linha em
  `/etc/advocacia/backup-remote.conf` (ex.: `gdrive:Backups-JorgeAlvim`). O `backup.sh` envia o `.enc` sozinho; só sai o arquivo **já cifrado**.
- **Teste semanal:** o teste de restauração (domingo 04:30) agora também confere que a cópia cifrada existe, tem o cabeçalho certo e bate com o SHA-256 registrado.
  Se a chave pública estiver configurada e a cópia faltar, o teste **reprova** e avisa por e-mail.

### 2) Documentos cifrados no disco (clientes e drive do escritório)

- **O que é:** cada arquivo em `storage/clients` e `storage/office_drive` é gravado **embaralhado** (AES-256-GCM). Quem copiar a pasta do servidor não lê nada.
  O sistema decifra na hora de mostrar/baixar ao usuário autorizado, sem mudar nada na tela. Arquivos antigos (ainda em texto puro) continuam abrindo.
- **A chave** (`DOC_ENC_KEY`) mora no cofre do servidor (`.env.enc`). **Perder a chave = perder os documentos cifrados.** Guarde uma cópia no gerenciador de senhas **antes** de cifrar.
- **Ligar (no servidor, ou do notebook com `ssh root@161.97.71.14 "cd /var/www/advocacia && COMANDO"`):**
  1. `node scripts/docs-encrypt-all.js gerar-chave` — mostra uma chave nova. **Anote no Bitwarden.**
  2. `node scripts/env-vault.js set DOC_ENC_KEY` — cole a chave (vai direto ao cofre; o titular recebe o aviso por e-mail).
  3. Reinicie o serviço: `systemctl restart advocacia` (novos envios já saem cifrados).
  4. Faça um backup: `bash backup.sh`.
  5. `node scripts/docs-encrypt-all.js cifrar` — **simulação**: lista o que seria cifrado, sem alterar nada.
  6. `node scripts/docs-encrypt-all.js cifrar --aplicar` — cifra os antigos. Cada arquivo é conferido (decifra e compara o SHA-256) antes de trocar; se algo falhar, o original fica intacto.
  7. `node scripts/docs-encrypt-all.js verificar` — decifra tudo em memória e confere as etiquetas.
- **Emergência:** `node scripts/docs-encrypt-all.js decifrar --aplicar` devolve tudo ao texto puro (precisa da chave).
- **Se a chave sumir do servidor:** documentos cifrados dão erro claro (503), e nunca são entregues embaralhados. Recoloque a chave com `env-vault.js set DOC_ENC_KEY`.
- **Segurança extra desta mudança:** uploads de HTML/SVG/scripts passaram a ser **recusados** nos envios de documentos (antes só um código sem uso bloqueava) e arquivos guardados
  que o navegador poderia executar são entregues em "sandbox".

## Acessibilidade e desempenho (AUD-19)

Verificações automáticas, rodando na CI (Checklist de Produção) e à mão:

- **Acessibilidade (axe-core / WCAG 2.x A e AA):** `npm run test:a11y` — zero violações nas páginas públicas (contraste, nomes de botões/campos, idioma, estrutura, zoom). Navegação por teclado com foco visível coberta no mesmo arquivo (`e2e/a11y.spec.js`).
- **Orçamento de peso por página:** `npm run check:perf` — mede o que o visitante baixa do nosso servidor (HTML + CSS/JS locais, gzip) e reprova se passar do orçamento de `docs/perf-budget.json`. O orçamento é a medição atual + 5%: a página pode emagrecer, não engordar. Terceiros (Google Fonts, Chart.js) ficam fora. Para regravar após uma mudança consciente: `node scripts/perf-budget.js --atualizar`.
- **Lighthouse:** `npm run test:lighthouse:ci` — sobe o servidor num banco temporário e reprova se alguma nota ficar abaixo das metas (`metas_lighthouse` em `docs/perf-budget.json`: desempenho 85, acessibilidade 95, boas práticas 90, SEO 90). Painel e catálogo são `noindex`, então ficam fora da meta de SEO. Hoje: Home/agendar/cliente/colaborador/blog ≥ 98 de desempenho e ≥ 97 de acessibilidade.
- **Imagens modernas:** quem aceita recebe `.webp`/`.avif` na mesma URL (`src/middleware/modern-images.js`); os outros recebem o original. A capa do blog caiu de 616 KB para 34 KB; a imagem do artigo, de 212 KB para 90 KB.
- **Correções de contraste do Tailwind antigo:** concentradas em `public/css/a11y-fixes.css` (ponte provisória, some conforme as telas migram para `.ds-*`). O zoom no celular foi reabilitado (removido `user-scalable=no`).
