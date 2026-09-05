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

echo [1/3] Fazendo backup COMPLETO no servidor (para rollback)...
ssh -i "%KEY%" -o StrictHostKeyChecking=accept-new %SRV% "D=%REMOTE%/backups/predeploy-$(date +%%Y%%m%%d-%%H%%M%%S); mkdir -p $D && cp -r %REMOTE%/server.js %REMOTE%/painel.html %REMOTE%/index.html %REMOTE%/blog.html %REMOTE%/cliente.html %REMOTE%/colaborador.html %REMOTE%/src %REMOTE%/public $D/ 2>/dev/null; echo $D > %REMOTE%/backups/LAST && echo    Backup criado em: $D"
if errorlevel 1 goto :erro
echo.

echo [2/3] Enviando server.js, paginas publicas, src/ (modulos), public/ (assets) e scripts/...
scp -i "%KEY%" -o StrictHostKeyChecking=accept-new -r server.js painel.html index.html blog.html cliente.html colaborador.html src public scripts %SRV%:%REMOTE%/
if errorlevel 1 goto :erro
echo.

echo [3/3] Ajustando permissoes, reiniciando e checando saude (com AUTO-ROLLBACK)...
REM Captura o commit atual para registrar a versao implantada.
set "SHA=manual"
for /f %%i in ('git rev-parse --short HEAD 2^>nul') do set "SHA=%%i"
REM deploy-remote.sh (no servidor): perms -> restart -> health; se falhar, REVERTE
REM automaticamente para o ultimo backup. Codigos: 0=OK, 1=revertido, 2/3=falha grave.
ssh -i "%KEY%" -o StrictHostKeyChecking=accept-new %SRV% "sed -i 's/\r$//' %REMOTE%/scripts/deploy-remote.sh 2>/dev/null; bash %REMOTE%/scripts/deploy-remote.sh %REMOTE% advocacia 3000 %SHA%"
if errorlevel 2 goto :grave
if errorlevel 1 goto :revertido
echo.

echo ============================================================
echo   PRONTO! Deploy no ar (Health 200). Versao: %SHA%
echo ============================================================
goto :fim

:revertido
echo.
echo ------------------------------------------------------------
echo   ATENCAO: o deploy falhou no health check e foi REVERTIDO
echo   automaticamente. O SITE ESTA NO AR na versao ANTERIOR.
echo   Corrija o codigo e rode o deploy novamente. (Nada quebrado.)
echo ------------------------------------------------------------
goto :fim

:grave
echo.
echo ------------------------------------------------------------
echo   FALHA GRAVE: deploy E rollback falharam. O site pode estar
echo   fora. Rode reparar-servidor.bat e me envie o print acima.
echo ------------------------------------------------------------
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
