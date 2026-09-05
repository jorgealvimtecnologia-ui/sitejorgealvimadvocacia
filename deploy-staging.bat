@echo off
REM ============================================================
REM   DEPLOY para HOMOLOGACAO (STAGING) - Jorge Alvim Advocacia
REM   Envia os arquivos para um ambiente SEPARADO de teste,
REM   sem tocar em producao. Use para validar antes de publicar.
REM
REM   PRE-REQUISITOS no servidor (configurar UMA vez - veja
REM   docs/INFRA.md): pasta /var/www/advocacia-staging, servico
REM   systemd "advocacia-staging" numa PORTA diferente (ex.: 3001)
REM   com seu proprio .env e leads.db, e um subdominio
REM   (ex.: homolog.jorgealvimadvocacia.com.br) no nginx.
REM ============================================================
setlocal
cd /d "%~dp0"
set "KEY=%USERPROFILE%\.ssh\id_ed25519_161_97_71_14"
set "SRV=root@161.97.71.14"
set "REMOTE=/var/www/advocacia-staging"
set "SERVICE=advocacia-staging"

echo ============================================================
echo   DEPLOY STAGING (HOMOLOGACAO) - Jorge Alvim Advocacia
echo ============================================================
echo.
echo Pasta local: %~dp0
echo Servidor...: %SRV%  (%REMOTE%)  servico: %SERVICE%
echo.

echo [1/3] Backup no staging...
ssh -i "%KEY%" -o StrictHostKeyChecking=accept-new %SRV% "D=%REMOTE%/backups/predeploy-$(date +%%Y%%m%%d-%%H%%M%%S); mkdir -p $D && cp -r %REMOTE%/server.js %REMOTE%/painel.html %REMOTE%/index.html %REMOTE%/blog.html %REMOTE%/cliente.html %REMOTE%/colaborador.html %REMOTE%/src $D/ 2>/dev/null; echo $D > %REMOTE%/backups/LAST && echo    Backup: $D"
if errorlevel 1 goto :erro
echo.

echo [2/3] Enviando arquivos para o staging...
scp -i "%KEY%" -o StrictHostKeyChecking=accept-new -r server.js painel.html index.html blog.html cliente.html colaborador.html src %SRV%:%REMOTE%/
if errorlevel 1 goto :erro
echo.

echo [3/3] Reiniciando o servico de staging...
ssh -i "%KEY%" -o StrictHostKeyChecking=accept-new %SRV% "systemctl restart %SERVICE% && sleep 2 && printf 'Status do staging: ' && systemctl is-active %SERVICE%"
if errorlevel 1 goto :erro
echo.

echo ============================================================
echo   PRONTO! Valide em homolog.jorgealvimadvocacia.com.br
echo   Se estiver OK, rode o deploy-servidor.bat (producao).
echo ============================================================
goto :fim

:erro
echo.
echo ------------------------------------------------------------
echo   ERRO. Confirme se o ambiente de staging ja foi criado
echo   (docs/INFRA.md). Tire um print e envie para o assistente.
echo ------------------------------------------------------------

:fim
echo.
pause
