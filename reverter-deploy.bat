@echo off
REM ============================================================
REM   REVERTER DEPLOY (ROLLBACK) - Jorge Alvim Advocacia
REM   Restaura o ULTIMO backup pre-deploy no servidor e
REM   reinicia o servico. Use se um deploy deu problema.
REM   (O deploy-servidor.bat grava o caminho do backup em
REM    backups/LAST antes de cada envio.)
REM ============================================================
setlocal
cd /d "%~dp0"
set "KEY=%USERPROFILE%\.ssh\id_ed25519_161_97_71_14"
set "SRV=root@161.97.71.14"
set "REMOTE=/var/www/advocacia"

echo ============================================================
echo   ROLLBACK - Jorge Alvim Advocacia
echo ============================================================
echo.
echo Isto vai DESFAZER o ultimo deploy, restaurando os arquivos
echo do backup mais recente. O banco de dados NAO e alterado.
echo.
set /p CONFIR?="Digite SIM para confirmar o rollback: "
if /I not "%CONFIR%"=="SIM" (
  echo Cancelado. Nada foi alterado.
  goto :fim
)
echo.

echo [1/2] Restaurando arquivos do ultimo backup...
ssh -i "%KEY%" -o StrictHostKeyChecking=accept-new %SRV% "D=$(cat %REMOTE%/backups/LAST 2>/dev/null); if [ -z \"$D\" ] || [ ! -d \"$D\" ]; then echo '   ERRO: nenhum backup encontrado em backups/LAST'; exit 1; fi; echo \"   Restaurando de: $D\"; cp -r $D/server.js $D/painel.html $D/index.html $D/blog.html $D/cliente.html $D/colaborador.html $D/src %REMOTE%/ 2>/dev/null; echo '   Arquivos restaurados.'"
if errorlevel 1 goto :erro
echo.

echo [2/2] Reiniciando o servico...
ssh -i "%KEY%" -o StrictHostKeyChecking=accept-new %SRV% "systemctl restart advocacia && sleep 2 && printf 'Status do servico: ' && systemctl is-active advocacia"
if errorlevel 1 goto :erro
echo.

echo ============================================================
echo   ROLLBACK CONCLUIDO! Se apareceu "active" acima, deu certo.
echo ============================================================
goto :fim

:erro
echo.
echo ------------------------------------------------------------
echo   OCORREU UM ERRO. Tire um print e envie para o assistente.
echo ------------------------------------------------------------

:fim
echo.
pause
