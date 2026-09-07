@echo off
REM ============================================================
REM   ATIVAR LOGIN COM O GOOGLE NO SERVIDOR
REM   Adiciona GOOGLE_CLIENT_ID no .env de producao e staging.
REM ============================================================
setlocal
cd /d "%~dp0"
set "KEY=%USERPROFILE%\.ssh\id_ed25519_161_97_71_14"
set "SRV=root@161.97.71.14"
set "REMOTE_PROD=/var/www/advocacia"
set "REMOTE_STAGING=/var/www/advocacia-staging"
set "CLIENT_ID=285571475823-69gr5k4lft10ghf14skvsg06fv1pqkt4.apps.googleusercontent.com"

echo ============================================================
echo   ATIVAR LOGIN COM O GOOGLE NO SERVIDOR
echo ============================================================
echo Servidor...: %SRV%
echo Client ID..: %CLIENT_ID%
echo.

echo [1/3] Atualizando .env em Producao...
ssh -i "%KEY%" -o StrictHostKeyChecking=accept-new %SRV% "if grep -q '^GOOGLE_CLIENT_ID=' %REMOTE_PROD%/.env 2>/dev/null; then sed -i 's/^GOOGLE_CLIENT_ID=.*/GOOGLE_CLIENT_ID=%CLIENT_ID%/' %REMOTE_PROD%/.env; else echo 'GOOGLE_CLIENT_ID=%CLIENT_ID%' >> %REMOTE_PROD%/.env; fi; grep 'GOOGLE_CLIENT_ID' %REMOTE_PROD%/.env"
if errorlevel 1 goto :erro
echo.

echo [2/3] Atualizando .env em Staging...
ssh -i "%KEY%" -o StrictHostKeyChecking=accept-new %SRV% "if [ -f %REMOTE_STAGING%/.env ]; then if grep -q '^GOOGLE_CLIENT_ID=' %REMOTE_STAGING%/.env 2>/dev/null; then sed -i 's/^GOOGLE_CLIENT_ID=.*/GOOGLE_CLIENT_ID=%CLIENT_ID%/' %REMOTE_STAGING%/.env; else echo 'GOOGLE_CLIENT_ID=%CLIENT_ID%' >> %REMOTE_STAGING%/.env; fi; grep 'GOOGLE_CLIENT_ID' %REMOTE_STAGING%/.env; fi"
echo.

echo [3/3] Reiniciando servicos...
ssh -i "%KEY%" -o StrictHostKeyChecking=accept-new %SRV% "systemctl restart advocacia && (systemctl restart advocacia-staging 2>/dev/null || true) && sleep 2"

echo Conferindo se a API responde ativa:
ssh -i "%KEY%" -o StrictHostKeyChecking=accept-new %SRV% "curl -s http://localhost:3000/api/auth/google-config"
echo.

echo ============================================================
echo   SUCESSO! Login com Google ATIVO no Painel e Portal do Cliente!
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
