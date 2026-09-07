#!/usr/bin/env bash
# ==============================================================================
#   Sincronização de Backup Externo - Jorge Alvim Advocacia & Consultoria Jurídica
#   Baixa snapshots íntegros (Banco + Documentos) do servidor para o HD Externo
# ==============================================================================
set -euo pipefail

KEY="${KEY:-$HOME/.ssh/id_ed25519}"
if [ ! -f "$KEY" ] && [ -f "$HOME/.ssh/id_ed25519_161_97_71_14" ]; then
  KEY="$HOME/.ssh/id_ed25519_161_97_71_14"
fi
SRV="${SRV:-root@161.97.71.14}"
REMOTE_DIR="${REMOTE_DIR:-/var/www/advocacia}"

SSH_OPTS=(-o StrictHostKeyChecking=accept-new)
if [ -f "$KEY" ]; then
  SSH_OPTS+=(-i "$KEY")
fi

echo "================================================================="
echo "🛡️  BACKUP EXTERNO (DRP 3-2-1) - JORGE ALVIM ADVOCACIA"
echo "================================================================="
echo "📅 Data/Hora local: $(date +'%d/%m/%Y %H:%M:%S')"
echo "🌐 Servidor Remoto: $SRV"
echo

# 1. Identificar o HD Externo ou destino
DESTINO=""

if [ "${1:-}" != "" ]; then
  DESTINO="$1"
elif [ -n "${HD_DESTINO:-}" ]; then
  DESTINO="$HD_DESTINO"
else
  # Busca inteligente por pontos de montagem externos típicos no Linux/Ubuntu (com permissão de escrita)
  DETECTADOS=()
  for p in /media/"$USER"/* /run/media/"$USER"/* /media/* /mnt/*; do
    if [ -d "$p" ] && [ -w "$p" ] && [ "$p" != "/media/$USER/*" ] && [ "$p" != "/run/media/$USER/*" ] && [ "$p" != "/media/*" ] && [ "$p" != "/mnt/*" ]; then
      if [ "$p" != "/media" ] && [ "$p" != "/mnt" ]; then
        DETECTADOS+=("$p")
      fi
    fi
  done

  if [ ${#DETECTADOS[@]} -gt 0 ]; then
    DESTINO="${DETECTADOS[0]}/Backups-JorgeAlvim"
    echo "💾 HD Externo gravável detectado em: ${DETECTADOS[0]}"
  else
    # Fallback seguro: pasta de backups no computador do usuário
    DESTINO="$HOME/Backups-JorgeAlvim"
    echo "ℹ️  Nenhum HD Externo USB gravável montado no momento."
    echo "📁 Salvando na pasta de segurança local do seu computador: $DESTINO"
    echo "💡 Dica: Quando plugar o seu HD Externo, o script detectará automaticamente ou você pode passar a pasta:"
    echo "   ./puxar-backup-hd.sh /media/$USER/NOME_DO_SEU_HD"
    echo
  fi
fi

mkdir -p "$DESTINO"

# 2. Executar snapshot a quente no servidor para garantir dados em tempo real
echo "⏳ [1/4] Gerando snapshot íntegro e a quente no servidor de Produção..."
ssh "${SSH_OPTS[@]}" "$SRV" "cd $REMOTE_DIR && bash backup.sh >/dev/null"
echo "   ✓ Snapshot gerado com sucesso no servidor!"

# 3. Descobrir o nome do arquivo mais recente gerado no servidor
ULTIMO_BACKUP=$(ssh "${SSH_OPTS[@]}" "$SRV" "ls -t $REMOTE_DIR/backups/backup_jorgealvim_*.tar.gz 2>/dev/null | head -n 1")

if [ -z "$ULTIMO_BACKUP" ]; then
  echo "❌ Erro: Nenhum arquivo de backup encontrado no servidor em $REMOTE_DIR/backups/"
  exit 1
fi

ARQUIVO_NOME=$(basename "$ULTIMO_BACKUP")
echo "📦 [2/4] Arquivo identificado: $ARQUIVO_NOME"

# 4. Baixar para o HD Externo via scp com compressão
echo "⬇️  [3/4] Baixando pacote para o HD Externo ($DESTINO)..."
scp "${SSH_OPTS[@]}" "$SRV:$REMOTE_DIR/backups/${ARQUIVO_NOME}*" "$DESTINO/"

# 5. Validação de Integridade Criptográfica (SHA-256)
echo "🔒 [4/4] Validando integridade criptográfica SHA-256..."
cd "$DESTINO"
if [ -f "${ARQUIVO_NOME}.sha256" ]; then
  if sha256sum -c "${ARQUIVO_NOME}.sha256" --status; then
    echo "   ✅ Checksum SHA-256 VALIDADO: O arquivo está 100% íntegro e idêntico ao servidor!"
  else
    echo "   ⚠️  Atenção: Falha na validação do hash SHA-256! O download pode estar corrompido."
  fi
else
  sha256sum "$ARQUIVO_NOME" > "${ARQUIVO_NOME}.sha256"
  echo "   ✓ Checksum SHA-256 gerado localmente: $(cat "${ARQUIVO_NOME}.sha256")"
fi

TAMANHO=$(du -h "$DESTINO/$ARQUIVO_NOME" | cut -f1)
TOTAL_COPIAS=$(ls -1 "$DESTINO"/backup_jorgealvim_*.tar.gz 2>/dev/null | wc -l)
ESPACO_LIVRE=$(df -h "$DESTINO" | awk 'NR==2 {print $4}')

echo
echo "================================================================="
echo "🎉 BACKUP EXTERNO CONCLUÍDO COM SUCESSO!"
echo "================================================================="
echo "📍 Destino.......: $DESTINO/$ARQUIVO_NOME"
echo "📊 Tamanho.......: $TAMANHO"
echo "🗃️  Total no HD..: $TOTAL_COPIAS cópia(s) guardada(s)"
echo "💾 Espaço Livre..: $ESPACO_LIVRE disponível no dispositivo"
echo "================================================================="
