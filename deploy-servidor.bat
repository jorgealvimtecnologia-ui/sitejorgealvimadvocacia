@echo off
REM ============================================================
REM   DEPLOY - Jorge Alvim Advocacia
REM   Da dois cliques neste arquivo para enviar as correcoes
REM   (server.js e painel.html) para o servidor em producao.
REM   Faz backup antes, envia os arquivos e reinicia o servico.
REM ============================================================
setlocal
cd /d "%~dp0"
set "KEY=%USERPROFILE%\.ssh\id_ed25519_161_97_71_14"
set "SRV=root@161.97.71.14"
set "REMOTE=/var/www/advocacia"

echo ============================================================
echo   DEPLOY - Jorge Alvim Advocacia
echo ============================================================
echo.
echo Pasta local: %~dp0
echo Servidor...: %SRV%  (%REMOTE%)
echo.

echo [1/3] Fazendo backup no servidor...
ssh -i "%KEY%" -o StrictHostKeyChecking=accept-new %SRV% "D=%REMOTE%/backups/predeploy-$(date +%%Y%%m%%d-%%H%%M); mkdir -p $D && cp %REMOTE%/server.js %REMOTE%/painel.html $D/ && echo    Backup criado em: $D"
if errorlevel 1 goto :erro
echo.

echo [2/3] Enviando server.js, painel.html e paginas publicas...
scp -i "%KEY%" -o StrictHostKeyChecking=accept-new server.js painel.html index.html blog.html cliente.html colaborador.html %SRV%:%REMOTE%/
if errorlevel 1 goto :erro
echo.

echo [3/3] Reiniciando o servico...
ssh -i "%KEY%" -o StrictHostKeyChecking=accept-new %SRV% "systemctl restart advocacia && sleep 2 && printf 'Status do servico: ' && systemctl is-active advocacia"
if errorlevel 1 goto :erro
echo.

echo ============================================================
echo   PRONTO! Se apareceu "active" acima, o deploy deu certo.
echo ============================================================
goto :fim

:erro
echo.
echo ------------------------------------------------------------
echo   OCORREU UM ERRO acima. Nada foi finalizado.
echo   Tire um print desta tela e envie para o assistente.
echo ------------------------------------------------------------

:fim
echo.
pause
