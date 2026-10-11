# Guia: presença no Google e Cloudflare (AUD-24)

Passo a passo para o Dr. Jorge. São **ações externas** (feitas em sites do Google e da Cloudflare); o sistema já está preparado para todas elas. Faça na ordem e marque o que concluir. Nada aqui mexe no código.

---

## 1. Perfil da Empresa no Google (Google Meu Negócio)

Aparecer no Google Maps e na busca local ("advogado em Juiz de Fora") é a captação mais barata que existe.

1. Acesse **google.com/business** e entre com uma das contas mestras.
2. Crie/reivindique o perfil **"Jorge Alvim Advocacia"**:
   - Categoria principal: **Advogado** (adicione também "Escritório de advocacia").
   - Endereço, telefone e **site: https://jorgealvimadvocacia.com.br**.
   - Horário de atendimento.
3. **Verifique** o perfil (o Google envia um código por telefone, vídeo ou carta). Sem verificar, o perfil não aparece.
4. Capriche no conteúdo: **fotos** (fachada, sala de reunião, você), áreas de atuação, descrição.
5. **Avaliações (dentro das regras da OAB):** você pode *convidar* clientes satisfeitos a avaliar, mas **não pode** prometer resultado, captar clientela de forma mercantil nem pagar por avaliação. Peça de forma sóbria, por exemplo ao encerrar um atendimento: "se nosso trabalho ajudou, uma avaliação no Google nos ajuda muito". Responda às avaliações com discrição, **sem** revelar que a pessoa é cliente nem detalhes do caso (sigilo profissional).

> Provimento CFOAB 205/2021: publicidade da advocacia é informativa, não mercantil. Na dúvida sobre uma frase, prefira o tom sóbrio.

---

## 2. Google Search Console (saber como o site aparece na busca)

1. Acesse **search.google.com/search-console** e adicione a propriedade **https://jorgealvimadvocacia.com.br**.
2. Método de verificação mais simples aqui: **tag HTML**. O Google mostra algo como
   `<meta name="google-site-verification" content="XXXXXXXX" />` — copie **só o valor** (o `content`).
3. No servidor, coloque esse valor no cofre e reinicie (do seu notebook):
   ```
   ssh root@161.97.71.14 "cd /var/www/advocacia && node scripts/env-vault.js set GSC_VERIFICATION"
   ssh root@161.97.71.14 "systemctl restart advocacia"
   ```
   (O sistema injeta a tag sozinho no `index.html` quando essa variável existe.)
4. Volte ao Search Console e clique em **Verificar**.
5. Em **Sitemaps**, envie **`sitemap.xml`** (o site já gera em `https://jorgealvimadvocacia.com.br/sitemap.xml`).

---

## 3. Google Analytics 4 (quantas visitas, de onde vêm)

1. Acesse **analytics.google.com**, crie uma propriedade GA4 para o site e copie o **ID de medição** (formato `G-XXXXXXX`).
2. No servidor (do notebook):
   ```
   ssh root@161.97.71.14 "cd /var/www/advocacia && node scripts/env-vault.js set GA_MEASUREMENT_ID"
   ssh root@161.97.71.14 "systemctl restart advocacia"
   ```
3. Abra o site e confira em **Analytics → Tempo real** se a sua visita aparece.
4. (Opcional) Google Ads: a variável `GOOGLE_ADS_ID` (formato `AW-XXXX`) liga o acompanhamento de conversão do mesmo jeito.

> O site já tem **banner de cookies/consentimento (LGPD)**: o Analytics só roda depois que o visitante aceita.

---

## 4. Cloudflare (deixa o site mais rápido e protegido) — grátis

1. Crie conta em **cloudflare.com** (plano Free) e adicione **jorgealvimadvocacia.com.br**.
2. A Cloudflare importa os registros DNS. Confirme que **`@` e `www` apontam para `161.97.71.14`** com a nuvem **laranja** (proxied).
3. No **registro.br**, troque os *nameservers* para os dois que a Cloudflare indicar (sai dos `a.auto.dns.br` / `b.auto.dns.br`). A troca leva de minutos a algumas horas.
4. Na Cloudflare: **SSL/TLS = Full (strict)** (a origem já tem certificado Let's Encrypt válido). **Nunca** use "Flexible".
5. Ligue **Always Use HTTPS** e **Brotli**.
6. No servidor, avise o sistema que está atrás da Cloudflare (para registrar o IP real do visitante):
   ```
   ssh root@161.97.71.14 "cd /var/www/advocacia && node scripts/env-vault.js set TRUST_CLOUDFLARE"
   ```
   (valor: `1`), e reinicie o serviço.

> O plano Free limita upload a 100 MB por arquivo — o sistema já respeita esse teto.

---

## Conferir se deu certo (a qualquer momento)

Do seu notebook, na pasta do projeto:

```
node scripts/producao-checklist.js --url=https://jorgealvimadvocacia.com.br
```

Mostra se o site está no ar, o certificado válido e (no servidor) o backup em dia. A verificação roda **sozinha toda segunda às 05:00** e te avisa por e-mail se achar problema grave (depois de rodar `scripts/setup-backup-cron.sh` no servidor).

Para conferir que nenhum arquivo oculto (como `.env`) está exposto no site ao vivo:
```
node scripts/check-env-exposure.js --url=https://jorgealvimadvocacia.com.br
```
