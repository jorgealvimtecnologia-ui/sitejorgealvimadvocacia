@echo off
REM ============================================================
REM   DIAGNOSTICO DO SERVIDOR - Jorge Alvim Advocacia
REM   Mostra o status do servico e os ultimos erros do app.
REM   Use quando o site cair (502) para descobrir a causa.
REM ============================================================
setlocal
cd /d "%~dp0"
set "KEY=%USERPROFILE%\.ssh\id_ed25519_161_97_71_14"
set "SRV=root@161.97.71.14"

echo ============================================================
echo   DIAGNOSTICO - Jorge Alvim Advocacia
echo ============================================================
echo.
echo [1] Status do servico:
ssh -i "%KEY%" -o StrictHostKeyChecking=accept-new %SRV% "systemctl is-active advocacia; systemctl status advocacia --no-pager -n 5 2>/dev/null | tail -n 6"
echo.
echo [2] Ultimos 40 registros do app (onde aparece o erro de crash):
ssh -i "%KEY%" -o StrictHostKeyChecking=accept-new %SRV% "journalctl -u advocacia --no-pager -n 40"
echo.
echo ------------------------------------------------------------
echo   COPIE TODO O TEXTO ACIMA e envie para o assistente.
echo ------------------------------------------------------------
pause
