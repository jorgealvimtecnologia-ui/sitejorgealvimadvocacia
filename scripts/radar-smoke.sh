#!/usr/bin/env bash
# ============================================================================
# TESTE DE FUMAÇA DO RADAR (Escavador) — confirma, ao vivo, a rota de DETALHE do
# processo (V2) e os nomes dos campos, para "completar o máximo de dados".
# É só LEITURA: consulta o saldo (grátis) e detalha UM processo (custa poucos
# créditos). NÃO cria monitoramento nem gasta assinatura mensal.
#
# USO (no servidor):
#   ESCAVADOR_API_TOKEN="<seu token>" bash scripts/radar-smoke.sh "5009999-11.2026.8.13.0145"
#
# Cole a saída aqui no chat que eu confiro os nomes dos campos e ajusto num ponto só.
# ============================================================================
set -euo pipefail
: "${ESCAVADOR_API_TOKEN:?defina ESCAVADOR_API_TOKEN=\"<seu token>\" antes de rodar}"
CNJ="${1:?uso: ESCAVADOR_API_TOKEN=... bash scripts/radar-smoke.sh \"<CNJ com máscara>\"}"

BASE="https://api.escavador.com/api/v1"
V2="https://api.escavador.com/api/v2"
H_AUTH="Authorization: Bearer ${ESCAVADOR_API_TOKEN}"
H_ACCEPT="Accept: application/json"

echo "== 1) Saldo (grátis) =="
curl -sS -H "$H_AUTH" -H "$H_ACCEPT" "$BASE/quantidade-creditos"; echo; echo

echo "== 2) Detalhe do processo (V2) — confirma a rota e os campos (capa + envolvidos) =="
echo "   GET $V2/processos/numero_cnj/$CNJ"
curl -sS -H "$H_AUTH" -H "$H_ACCEPT" "$V2/processos/numero_cnj/$CNJ"; echo
