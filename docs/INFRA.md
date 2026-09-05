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
