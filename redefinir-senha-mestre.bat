@echo off
REM ============================================================
REM   RECUPERACAO DE EMERGENCIA - Senha do usuario MESTRE
REM   Da dois cliques, digite a nova senha e pronto.
REM   So funciona da SUA maquina, com a SUA chave SSH.
REM   (Evite usar aspas simples ' na senha.)
REM ============================================================
setlocal
cd /d "%~dp0"
set "KEY=%USERPROFILE%\.ssh\id_ed25519_161_97_71_14"
set "SRV=root@161.97.71.14"
set "REMOTE=/var/www/advocacia"

echo ============================================================
echo   Redefinir senha do usuario MESTRE (jorgealvimtecnologia)
echo ============================================================
echo.
set /p NP="Digite a NOVA senha do mestre (min. 4 caracteres): "
if "%NP%"=="" (
  echo Nenhuma senha informada. Nada foi alterado.
  pause
  exit /b 1
)
echo.
echo [1/2] Enviando o script de recuperacao ao servidor...
scp -i "%KEY%" -o StrictHostKeyChecking=accept-new scripts\reset-master-pass.js %SRV%:%REMOTE%/scripts/reset-master-pass.js
if errorlevel 1 goto :erro
echo.
echo [2/2] Aplicando a nova senha e reiniciando...
ssh -i "%KEY%" -o StrictHostKeyChecking=accept-new %SRV% "cd %REMOTE% && NEWPASS='%NP%' node scripts/reset-master-pass.js && systemctl restart advocacia && printf 'Status do servico: ' && systemctl is-active advocacia"
if errorlevel 1 goto :erro
echo.
echo ============================================================
echo   PRONTO! Entre no painel com a nova senha:
echo   Usuario: jorgealvimtecnologia
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
