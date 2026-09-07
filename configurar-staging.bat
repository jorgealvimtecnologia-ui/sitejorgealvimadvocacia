@echo off
REM ============================================================
REM   CONFIGURAR AMBIENTE DE HOMOLOGACAO (STAGING) NO SERVIDOR
REM   Cria /var/www/advocacia-staging, servico systemd na porta 3001
REM   e vhost nginx para homolog.jorgealvimadvocacia.com.br
REM ============================================================
setlocal
cd /d "%~dp0"
set "KEY=%USERPROFILE%\.ssh\id_ed25519_161_97_71_14"
set "SRV=root@161.97.71.14"

echo ============================================================
echo   CONFIGURACAO DO AMBIENTE DE HOMOLOGACAO (STAGING)
echo ============================================================
echo Servidor: %SRV%
echo.

echo Enviando e executando configurador no servidor...
scp -i "%KEY%" -o StrictHostKeyChecking=accept-new configurar-staging.sh %SRV%:/tmp/configurar-staging.sh
if errorlevel 1 goto :erro

ssh -i "%KEY%" -o StrictHostKeyChecking=accept-new %SRV% "sed -i 's/\r$//' /tmp/configurar-staging.sh && bash /tmp/configurar-staging.sh && rm -f /tmp/configurar-staging.sh"
if errorlevel 1 goto :erro

echo.
echo ============================================================
echo   STAGING CONFIGURADO COM SUCESSO!
echo ============================================================
goto :fim

:erro
echo.
echo ------------------------------------------------------------
echo   ERRO ao configurar o staging. Verifique a conexao e chave.
echo ------------------------------------------------------------

:fim
echo.
pause
