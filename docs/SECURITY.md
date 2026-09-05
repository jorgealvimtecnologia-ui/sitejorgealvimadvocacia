# Segurança — defesa em profundidade

Camadas independentes de proteção, de forma que a falha de uma não derrube o sistema.

## Autenticação e senhas

- **Hash PBKDF2-SHA512, 210k iterações** — senha nunca é gravada em texto puro
  (coluna `plain_password` é limpa no boot). Upgrade transparente de hashes legados
  no login (sem travar ninguém).
- **Política de senha: 4 a 12 caracteres** — fonte única da verdade em
  [`src/shared/password-policy.js`](../src/shared/password-policy.js), aplicada em
  **todos** os pontos: criação/edição de usuário, redefinição, portal do cliente
  (cadastro, troca e recuperação) e no script de reset do mestre. O front reforça
  com `minlength`/`maxlength` (UX); o backend é a autoridade.
- **Sem senhas universais** — removidas dos portais e da assinatura de ponto.

## Anti força-bruta (duas camadas)

1. **Rate-limit por IP** — 15 tentativas / 15 min por IP (`loginRateLimit`).
2. **Bloqueio progressivo por FALHAS** — conta falhas consecutivas por (IP + usuário)
   e impõe uma espera que **cresce**: 5–7 falhas → 30 s; 8–11 → 2 min; 12–19 → 15 min;
   20+ → 1 h. Um login bem-sucedido zera o contador. Resposta `429` com `Retry-After`.
   Cobertos por teste automatizado.

## Autorização (RBAC — na tela E no servidor)

- **Front** filtra o menu e bloqueia `openModule` conforme a matriz de permissões.
- **Backend** (defesa em profundidade): middleware por prefixo em `server.js` barra
  rotas por perfil mesmo via API direta (ex.: secretária → `/api/financial` = 403);
  o mestre faz bypass. Coberto por teste (`RBAC — perfil restrito`).

## Cabeçalhos e transporte

- HTTPS (Let's Encrypt), **HSTS**, **CSP**, **CORS** por origem (`ALLOWED_ORIGINS`).
- Diretório-raiz não é servido (não expõe `leads.db`/`server.js`); uploads sandbox.
- Proteção contra **path traversal** no Explorer (`expResolve` dentro de `EXPLORER_ROOT`).

## Dependências (OWASP A06)

- **`npm audit`** roda na CI (`npm run audit`, produção, nível high+) como sinal.
  Estado atual: **0 vulnerabilidades**.

## NÃO implementado (decisão do produto)

- **2FA/TOTP** — deliberadamente fora de escopo por ora.

## Checklist OWASP Top 10 (revisar a cada release)

| # | Risco | Como estamos |
| --- | --- | --- |
| A01 | Quebra de controle de acesso | RBAC na tela **e** no servidor; mestre = bypass. |
| A02 | Falhas criptográficas | PBKDF2-SHA512 210k; sem texto puro; HTTPS/HSTS. |
| A03 | Injeção | SQL via *prepared statements* (`db.prepare`) em todo o código. |
| A04 | Design inseguro | Validação centralizada de entrada + política de senha única. |
| A05 | Configuração incorreta | CSP/HSTS/CORS; raiz não servida; segredos no `.env`. |
| A06 | Componentes vulneráveis | `npm audit` na CI (high+). |
| A07 | Falhas de autenticação | Rate-limit + bloqueio progressivo; sem senhas universais. |
| A08 | Integridade de dados/software | Deploy com backup pré-deploy; migrations versionadas. |
| A09 | Falhas de log/monitoramento | Trilha de auditoria (`logAudit`) + `/health`. |
| A10 | SSRF | Sem fetch de URLs controladas pelo usuário nas rotas do painel. |
