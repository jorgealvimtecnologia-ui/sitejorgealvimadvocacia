@echo off
REM ============================================================
REM   ATIVAR CLOUDFLARE - Jorge Alvim Advocacia
REM   Adiciona TRUST_CLOUDFLARE=1 no .env do servidor e reinicia.
REM ============================================================
setlocal
cd /d "%~dp0"
set "KEY=%USERPROFILE%\.ssh\id_ed25519_161_97_71_14"
set "SRV=root@161.97.71.14"
set "REMOTE=/var/www/advocacia"

echo ============================================================
echo   ATIVAR SUPORTE A CLOUDFLARE NO SERVIDOR
echo ============================================================
echo Servidor...: %SRV% (%REMOTE%)
echo.

echo [1/3] Verificando e atualizando .env no servidor...
ssh -i "%KEY%" -o StrictHostKeyChecking=accept-new %SRV% "if grep -q '^TRUST_CLOUDFLARE=' %REMOTE%/.env 2>/dev/null; then sed -i 's/^TRUST_CLOUDFLARE=.*/TRUST_CLOUDFLARE=1/' %REMOTE%/.env; else echo 'TRUST_CLOUDFLARE=1' >> %REMOTE%/.env; fi; echo '   .env atualizado:'; grep 'TRUST_CLOUDFLARE' %REMOTE%/.env"
if errorlevel 1 goto :erro
echo.

echo [2/3] Reiniciando servico advocacia...
ssh -i "%KEY%" -o StrictHostKeyChecking=accept-new %SRV% "systemctl restart advocacia && sleep 2"
if errorlevel 1 goto :erro
echo.

echo [3/3] Checando status e saude (health check)...
ssh -i "%KEY%" -o StrictHostKeyChecking=accept-new %SRV% "printf 'Status : ' && systemctl is-active advocacia && printf 'Health : ' && curl -s -o /dev/null -w '%%{http_code}\n' http://localhost:3000/health"
if errorlevel 1 goto :erro
echo.

echo ============================================================
echo   SUCESSO! O servidor agora reconhece o IP real dos clientes
echo   via Cloudflare (CF-Connecting-IP) para auditoria e LGPD.
echo ============================================================
goto :fim

:erro
echo.
echo ------------------------------------------------------------
echo   ERRO ao conectar ou configurar o servidor.
echo   Verifique se a chave SSH esta em %KEY%
echo ------------------------------------------------------------

:fim
echo.
pause
