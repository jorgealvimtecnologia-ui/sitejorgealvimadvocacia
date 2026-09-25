@echo off
REM ============================================================
REM   Ativar / atualizar o Meta Pixel no site (producao)
REM   Da dois cliques, cole o ID do Pixel e pronto.
REM   Grava META_PIXEL_ID no .env do servidor e reinicia o servico.
REM ============================================================
setlocal
set "KEY=%USERPROFILE%\.ssh\id_ed25519_161_97_71_14"
set "SRV=root@161.97.71.14"

echo ============================================================
echo   Ativar Meta Pixel no site (producao)
echo ============================================================
echo.
echo O ID do Pixel eh um numero (ex.: 1234567890). Ele fica no
echo Gerenciador de Eventos do Meta Business.
echo.
set /p PIXEL="Cole aqui o ID do Meta Pixel e tecle Enter: "
if "%PIXEL%"=="" (
  echo.
  echo Nenhum ID informado. Nada foi alterado.
  pause
  exit /b 1
)
echo.
echo Gravando META_PIXEL_ID=%PIXEL% no servidor e reiniciando...
echo.
ssh -i "%KEY%" -o StrictHostKeyChecking=accept-new %SRV% "F=/var/www/advocacia/.env; touch $F; if grep -q '^META_PIXEL_ID=' $F; then sed -i 's|^META_PIXEL_ID=.*|META_PIXEL_ID=%PIXEL%|' $F; else echo 'META_PIXEL_ID=%PIXEL%' >> $F; fi; systemctl restart advocacia && sleep 2 && printf 'Status do servico: ' && systemctl is-active advocacia && printf 'Linha no .env: ' && grep '^META_PIXEL_ID=' $F"
if errorlevel 1 goto :erro
echo.
echo ============================================================
echo   PRONTO! Se apareceu "active" e a linha META_PIXEL_ID acima,
echo   o Pixel esta ativo. Avise o assistente para conferir o site.
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
