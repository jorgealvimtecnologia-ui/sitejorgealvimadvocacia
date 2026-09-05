@echo off
REM ============================================================
REM   BACKUP EXTERNO (offsite) - Jorge Alvim Advocacia
REM   Da dois cliques: gera um backup atual no servidor e BAIXA
REM   para o seu PC (pasta backups-offsite). Regra 3-2-1.
REM ============================================================
setlocal
cd /d "%~dp0"
set "KEY=%USERPROFILE%\.ssh\id_ed25519_161_97_71_14"
set "SRV=root@161.97.71.14"
set "REMOTE=/var/www/advocacia"
if not exist "backups-offsite" mkdir "backups-offsite"

echo ============================================================
echo   Backup externo (baixando para o seu PC)
echo ============================================================
echo.
echo [1/2] Gerando backup atual no servidor (pode levar ~1-2 min)...
set "LATEST="
for /f "delims=" %%i in ('ssh -i "%KEY%" -o StrictHostKeyChecking=accept-new %SRV% "cd %REMOTE% && /bin/bash backup.sh >/dev/null 2>&1; ls -t backups/*.tar.gz 2>/dev/null ^| head -1"') do set "LATEST=%%i"

if "%LATEST%"=="" (
  echo.
  echo   Nenhum backup encontrado. Rode antes o configurar-backup-automatico.bat.
  pause
  exit /b 1
)

echo [2/2] Baixando %LATEST% para backups-offsite\ ...
scp -i "%KEY%" -o StrictHostKeyChecking=accept-new "%SRV%:%REMOTE%/%LATEST%" "backups-offsite\"
if errorlevel 1 goto :erro

echo.
echo ============================================================
echo   PRONTO! Copia de seguranca salva em:
echo   %~dp0backups-offsite
echo   (Guarde tambem em um pen-drive / nuvem para a regra 3-2-1.)
echo ============================================================
goto :fim

:erro
echo.
echo   OCORREU UM ERRO ao baixar. Tire um print e envie ao assistente.

:fim
echo.
pause
