# Infra, deploy, rollback, staging e Cloudflare

O app roda no VPS Contabo (`161.97.71.14`) como serviço systemd `advocacia` em
`/var/www/advocacia`, atrás do nginx com HTTPS. **O deploy é por cópia de arquivos**
(não é git no servidor).

## Deploy de produção (com backup automático)

Dê dois cliques em **`deploy-servidor.bat`**. Ele agora:
1. Faz **backup completo** de tudo que envia (server.js, painel.html, as 4 páginas
   públicas e `src/`) em `/var/www/advocacia/backups/predeploy-<data-hora>` e grava
   esse caminho em `backups/LAST`.
2. Envia os arquivos por `scp`.
3. Reinicia o serviço e mostra o status (`active` = ok).

## Rollback (desfazer um deploy)

Deu problema depois de publicar? Dê dois cliques em **`reverter-deploy.bat`**.
Ele lê `backups/LAST`, restaura aquele backup por cima dos arquivos atuais e reinicia
o serviço. **O banco de dados (`leads.db`) não é tocado** — só o código. Confirmação
"SIM" é exigida antes de agir.

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
