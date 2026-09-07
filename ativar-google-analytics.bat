@echo off
REM ============================================================
REM   ATIVAR GOOGLE ANALYTICS 4 (GA4) NO SERVIDOR
REM   Adiciona GA_MEASUREMENT_ID=G-H4K6S068SW no .env de producao e staging.
REM ============================================================
setlocal
cd /d "%~dp0"
set "KEY=%USERPROFILE%\.ssh\id_ed25519_161_97_71_14"
set "SRV=root@161.97.71.14"
set "REMOTE_PROD=/var/www/advocacia"
set "REMOTE_STAGING=/var/www/advocacia-staging"
set "GA_ID=G-H4K6S068SW"

echo ============================================================
echo   ATIVAR GOOGLE ANALYTICS 4 NO SERVIDOR
echo ============================================================
echo Servidor...: %SRV%
echo ID GA4.....: %GA_ID%
echo.

echo [1/3] Atualizando .env em Producao...
ssh -i "%KEY%" -o StrictHostKeyChecking=accept-new %SRV% "if grep -q '^GA_MEASUREMENT_ID=' %REMOTE_PROD%/.env 2>/dev/null; then sed -i 's/^GA_MEASUREMENT_ID=.*/GA_MEASUREMENT_ID=%GA_ID%/' %REMOTE_PROD%/.env; else echo 'GA_MEASUREMENT_ID=%GA_ID%' >> %REMOTE_PROD%/.env; fi; grep 'GA_MEASUREMENT_ID' %REMOTE_PROD%/.env"
if errorlevel 1 goto :erro
echo.

echo [2/3] Atualizando .env em Staging...
ssh -i "%KEY%" -o StrictHostKeyChecking=accept-new %SRV% "if [ -f %REMOTE_STAGING%/.env ]; then if grep -q '^GA_MEASUREMENT_ID=' %REMOTE_STAGING%/.env 2>/dev/null; then sed -i 's/^GA_MEASUREMENT_ID=.*/GA_MEASUREMENT_ID=%GA_ID%/' %REMOTE_STAGING%/.env; else echo 'GA_MEASUREMENT_ID=%GA_ID%' >> %REMOTE_STAGING%/.env; fi; grep 'GA_MEASUREMENT_ID' %REMOTE_STAGING%/.env; fi"
echo.

echo [3/3] Reiniciando servicos...
ssh -i "%KEY%" -o StrictHostKeyChecking=accept-new %SRV% "systemctl restart advocacia && (systemctl restart advocacia-staging 2>/dev/null || true) && sleep 2"

echo Conferindo se a tag esta ativa no HTML:
ssh -i "%KEY%" -o StrictHostKeyChecking=accept-new %SRV% "curl -s http://localhost:3000/ | grep -q '%GA_ID%' && echo   Tag Google Analytics injetada com sucesso! || echo   AVISO: Verifique o HTML"

echo.
echo ============================================================
echo   SUCESSO! Google Analytics 4 ativo em https://jorgealvimadvocacia.com.br
echo ============================================================
goto :fim

:erro
echo.
echo ------------------------------------------------------------
echo   ERRO ao atualizar o servidor. Verifique a conexao e chave SSH.
echo ------------------------------------------------------------

:fim
echo.
pause
