@echo off
REM ============================================================
REM   DEPLOY para HOMOLOGACAO (STAGING) - Jorge Alvim Advocacia
REM   Envia os arquivos para um ambiente SEPARADO de teste,
REM   sem tocar em producao. Use para validar antes de publicar.
REM ============================================================
setlocal
cd /d "%~dp0"
set "KEY=%USERPROFILE%\.ssh\id_ed25519_161_97_71_14"
set "SRV=root@161.97.71.14"
set "REMOTE=/var/www/advocacia-staging"
set "SERVICE=advocacia-staging"
set "PORT=3001"

echo ============================================================
echo   DEPLOY STAGING (HOMOLOGACAO) - Jorge Alvim Advocacia
echo ============================================================
echo.
echo Pasta local: %~dp0
echo Servidor...: %SRV%  (%REMOTE%)  servico: %SERVICE%
echo.

echo [1/3] Backup no staging (para rollback)...
ssh -i "%KEY%" -o StrictHostKeyChecking=accept-new %SRV% "D=%REMOTE%/backups/predeploy-$(date +%%Y%%m%%d-%%H%%M%%S); mkdir -p $D && cp -r %REMOTE%/server.js %REMOTE%/*.html %REMOTE%/src %REMOTE%/public $D/ 2>/dev/null; echo $D > %REMOTE%/backups/LAST && echo    Backup: $D"
if errorlevel 1 goto :erro
echo.

echo [2/3] Enviando server.js, paginas (*.html), src/, public/ e scripts/...
scp -i "%KEY%" -o StrictHostKeyChecking=accept-new -r server.js *.html src public scripts %SRV%:%REMOTE%/
if errorlevel 1 goto :erro
echo.

echo [3/3] Ajustando permissoes, reiniciando e checando saude (com AUTO-ROLLBACK)...
set "SHA=manual"
for /f %%i in ('git rev-parse --short HEAD 2^>nul') do set "SHA=%%i"
ssh -i "%KEY%" -o StrictHostKeyChecking=accept-new %SRV% "sed -i 's/\r$//' %REMOTE%/scripts/deploy-remote.sh 2>/dev/null; bash %REMOTE%/scripts/deploy-remote.sh %REMOTE% %SERVICE% %PORT% %SHA%"
if errorlevel 2 goto :grave
if errorlevel 1 goto :revertido
echo.

echo ============================================================
echo   PRONTO! Valide em https://homolog.jorgealvimadvocacia.com.br
echo   Se estiver OK, rode o deploy-servidor.bat (producao).
echo ============================================================
goto :fim

:revertido
echo.
echo ------------------------------------------------------------
echo   ATENCAO: o deploy falhou no health check e foi REVERTIDO
echo   automaticamente. O STAGING continua na versao anterior.
echo ------------------------------------------------------------
goto :fim

:grave
echo.
echo ------------------------------------------------------------
echo   FALHA GRAVE: verifique os logs do servico no servidor.
echo ------------------------------------------------------------
goto :fim

:erro
echo.
echo ------------------------------------------------------------
echo   ERRO. Confirme se o ambiente de staging ja foi criado
echo   (rode configurar-staging.bat primeiro).
echo ------------------------------------------------------------

:fim
echo.
pause
