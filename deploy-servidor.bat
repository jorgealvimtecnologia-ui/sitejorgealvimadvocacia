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
ssh -i "%KEY%" -o StrictHostKeyChecking=accept-new %SRV% "D=%REMOTE%/backups/predeploy-$(date +%%Y%%m%%d-%%H%%M%%S); mkdir -p $D && cp -r %REMOTE%/server.js %REMOTE%/painel.html %REMOTE%/index.html %REMOTE%/blog.html %REMOTE%/cliente.html %REMOTE%/colaborador.html %REMOTE%/src $D/ 2>/dev/null; echo $D > %REMOTE%/backups/LAST && echo    Backup criado em: $D"
if errorlevel 1 goto :erro
echo.

echo [2/3] Enviando server.js, paginas publicas, src/ (modulos) e public/ (assets)...
scp -i "%KEY%" -o StrictHostKeyChecking=accept-new -r server.js painel.html index.html blog.html cliente.html colaborador.html src public %SRV%:%REMOTE%/
if errorlevel 1 goto :erro
echo.
echo    Conferindo modulos essenciais no servidor...
ssh -i "%KEY%" -o StrictHostKeyChecking=accept-new %SRV% "for f in modules/kanban/kanban.routes.js modules/blog/blog.routes.js shared/net.js shared/ids.js; do [ -f %REMOTE%/src/$f ] && echo \"   OK  src/$f\" || echo \"   FALTA src/$f  <-- ATENCAO\"; done"
echo.

echo [3/3] Ajustando permissoes, reiniciando e checando saude...
REM IMPORTANTE: o scp cria pastas novas como root/700; sem isto o www-data
REM nao consegue "entrar" nas pastas e o Node quebra com "module not found".
ssh -i "%KEY%" -o StrictHostKeyChecking=accept-new %SRV% "U=$(systemctl cat advocacia | sed -n 's/^User=//p'); U=${U:-www-data}; chown -R $U:$U %REMOTE%/src %REMOTE%/public 2>/dev/null; chmod -R a+rX %REMOTE%/src %REMOTE%/public; chmod a+r %REMOTE%/server.js %REMOTE%/*.html; systemctl restart advocacia && sleep 2 && printf 'Status do servico: ' && systemctl is-active advocacia && printf 'Health: ' && curl -s -o /dev/null -w '%%{http_code}\n' http://localhost:3000/health"
if errorlevel 1 goto :erro
echo.

echo ============================================================
echo   PRONTO! Se apareceu "active" acima, o deploy deu certo.
echo ============================================================
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
