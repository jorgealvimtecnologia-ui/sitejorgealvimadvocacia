@echo off
REM ============================================================
REM  Sincronizacao local de intimacoes (DJEN) - Jorge Alvim Advocacia
REM  Roda no Brasil (este PC) e envia as intimacoes para producao.
REM  Agendado no Agendador de Tarefas do Windows (08h e 14h).
REM  Usa caminho curto 8.3 para evitar problemas com acentos no cmd.
REM  Log em: <projeto>\logs\sync-intimacoes.log
REM ============================================================
setlocal
set "PROJ=C:\Users\jorge\DOCUME~1\PROGRA~1\SISTEM~1\SITEJO~1"
cd /d "%PROJ%"
if not exist "%PROJ%\logs" mkdir "%PROJ%\logs"

echo. >> "%PROJ%\logs\sync-intimacoes.log"
echo ==== %date% %time% ==== >> "%PROJ%\logs\sync-intimacoes.log"
"C:\Program Files\nodejs\node.exe" "%PROJ%\scripts\sync-intimacoes-local.js" >> "%PROJ%\logs\sync-intimacoes.log" 2>&1
endlocal
