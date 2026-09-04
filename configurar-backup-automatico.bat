@echo off
REM ============================================================
REM   Configurar BACKUP AUTOMATICO diario no servidor (03:00)
REM   Da dois cliques. Instala o agendamento (cron) e faz um
REM   backup de teste para validar. So funciona da SUA maquina.
REM ============================================================
setlocal
cd /d "%~dp0"
set "KEY=%USERPROFILE%\.ssh\id_ed25519_161_97_71_14"
set "SRV=root@161.97.71.14"
set "REMOTE=/var/www/advocacia"

echo ============================================================
echo   Configurar backup automatico (diario 03:00)
echo ============================================================
echo.

echo [1/3] Enviando scripts de backup ao servidor...
scp -i "%KEY%" -o StrictHostKeyChecking=accept-new backup.sh %SRV%:%REMOTE%/backup.sh
if errorlevel 1 goto :erro
scp -i "%KEY%" -o StrictHostKeyChecking=accept-new scripts\setup-backup-cron.sh %SRV%:%REMOTE%/scripts/setup-backup-cron.sh
if errorlevel 1 goto :erro
echo.

echo [2/3] Instalando o agendamento (cron)...
ssh -i "%KEY%" -o StrictHostKeyChecking=accept-new %SRV% "cd %REMOTE% && bash scripts/setup-backup-cron.sh"
if errorlevel 1 goto :erro
echo.

echo [3/3] Rodando um backup de teste agora (pode levar um pouco)...
ssh -i "%KEY%" -o StrictHostKeyChecking=accept-new %SRV% "cd %REMOTE% && /bin/bash backup.sh && echo '' && echo Backups existentes: && ls -1t backups | head -5"
if errorlevel 1 goto :erro
echo.

echo ============================================================
echo   PRONTO! Backup automatico ativo (todo dia 03:00) e um
echo   backup de teste foi criado com sucesso.
echo ============================================================
goto :fim

:erro
echo.
echo ------------------------------------------------------------
echo   OCORREU UM ERRO acima. Tire um print e envie ao assistente.
echo ------------------------------------------------------------

:fim
echo.
pause
