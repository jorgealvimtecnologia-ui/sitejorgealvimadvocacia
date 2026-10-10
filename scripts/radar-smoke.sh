#!/usr/bin/env bash
# ============================================================================
# TESTE DE FUMAÇA DO RADAR (Escavador) — confirma, ao vivo, a rota de DETALHE do
# processo (V2) e os nomes dos campos, para "completar o máximo de dados".
# É só LEITURA: consulta o saldo (grátis) e detalha UM processo (custa poucos
# créditos). NÃO cria monitoramento nem gasta assinatura mensal.
#
# ONDE RODAR: no SERVIDOR (Contabo), dentro da pasta do projeto (/var/www/advocacia),
# pelo mesmo terminal/SSH onde você roda o deploy. NÃO é no navegador nem no site.
#
# USO (no servidor) — o token é lido do cofre automaticamente:
#   cd /var/www/advocacia
#   bash scripts/radar-smoke.sh "5015787-60.2024.8.13.0145"
#
# Se preferir informar o token na mão (ou rodar fora do servidor):
#   ESCAVADOR_API_TOKEN="<seu token>" bash scripts/radar-smoke.sh "<CNJ>"
#
# Cole a saída aqui no chat que eu confiro os nomes dos campos e ajusto num ponto só.
# ============================================================================
set -euo pipefail
CNJ="${1:?uso: bash scripts/radar-smoke.sh \"<CNJ com máscara>\" (rode no servidor, em /var/www/advocacia)}"

# Sem token no ambiente? Tenta ler do cofre (.env.enc) sem imprimir nenhum outro segredo.
if [ -z "${ESCAVADOR_API_TOKEN:-}" ]; then
  ESCAVADOR_API_TOKEN="$(node scripts/env-vault.js decrypt 2>/dev/null | grep -E '^ESCAVADOR_API_TOKEN=' | head -1 | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//' -e "s/^'//" -e "s/'$//")" || true
fi
if [ -z "${ESCAVADOR_API_TOKEN:-}" ]; then
  echo "✖ Não achei o token. Rode no servidor (em /var/www/advocacia) ou informe assim:" >&2
  echo "    ESCAVADOR_API_TOKEN=\"<seu token>\" bash scripts/radar-smoke.sh \"$CNJ\"" >&2
  exit 1
fi

BASE="https://api.escavador.com/api/v1"
V2="https://api.escavador.com/api/v2"
H_AUTH="Authorization: Bearer ${ESCAVADOR_API_TOKEN}"
H_ACCEPT="Accept: application/json"

echo "== 1) Saldo (grátis) =="
curl -sS -H "$H_AUTH" -H "$H_ACCEPT" "$BASE/quantidade-creditos"; echo; echo

echo "== 2) Detalhe do processo (V2) — confirma a rota e os campos (capa + envolvidos) =="
echo "   GET $V2/processos/numero_cnj/$CNJ"
curl -sS -H "$H_AUTH" -H "$H_ACCEPT" "$V2/processos/numero_cnj/$CNJ"; echo
