@echo off
REM ============================================================
REM   REPARO DO SERVIDOR - Jorge Alvim Advocacia
REM   O app caiu por falta da pasta src/ completa (modulos).
REM   Este script mostra o estado atual, reenvia src/ e public/
REM   completos, reinicia o servico e confere a saude.
REM ============================================================
setlocal
cd /d "%~dp0"
set "KEY=%USERPROFILE%\.ssh\id_ed25519_161_97_71_14"
set "SRV=root@161.97.71.14"
set "REMOTE=/var/www/advocacia"

echo ============================================================
echo   REPARO - Jorge Alvim Advocacia
echo ============================================================
echo.

echo [1/4] Estado atual do src/ no servidor (antes):
ssh -i "%KEY%" -o StrictHostKeyChecking=accept-new %SRV% "echo '  modules:'; ls %REMOTE%/src/modules 2>/dev/null || echo '   (sem src/modules)'; echo '  kanban.routes.js:'; ls -la %REMOTE%/src/modules/kanban/kanban.routes.js 2>/dev/null || echo '   NAO EXISTE'"
echo.

echo [2/4] Reenviando server.js, paginas, src/ e public/ (completos)...
scp -i "%KEY%" -o StrictHostKeyChecking=accept-new -r server.js painel.html index.html blog.html cliente.html colaborador.html src public %SRV%:%REMOTE%/
if errorlevel 1 goto :erro
echo.

echo [3/4] Conferindo que os modulos chegaram:
ssh -i "%KEY%" -o StrictHostKeyChecking=accept-new %SRV% "echo '  modules:'; ls %REMOTE%/src/modules; echo '  arquivos-chave:'; for f in modules/kanban/kanban.routes.js modules/blog/blog.routes.js shared/net.js shared/ids.js shared/password-policy.js db/migrate.js; do if [ -f %REMOTE%/src/$f ]; then echo \"   OK  src/$f\"; else echo \"   FALTA src/$f\"; fi; done"
echo.

echo [4/4] Corrigindo PERMISSOES (dono + leitura/travessia) e reiniciando...
ssh -i "%KEY%" -o StrictHostKeyChecking=accept-new %SRV% "U=$(systemctl cat advocacia | sed -n 's/^User=//p'); U=${U:-www-data}; echo \"   Servico roda como: $U\"; chown -R $U:$U %REMOTE%/src %REMOTE%/public 2>/dev/null; chmod -R a+rX %REMOTE%/src %REMOTE%/public; chmod a+r %REMOTE%/server.js %REMOTE%/*.html; echo '   Permissoes ajustadas.'; systemctl restart advocacia && sleep 2 && printf 'Status: ' && systemctl is-active advocacia && printf 'Health: ' && curl -s -o /dev/null -w '%%{http_code}\n' http://localhost:3000/health"
if errorlevel 1 goto :erro
echo.

echo ============================================================
echo   Se apareceu "active" e "Health: 200" acima, o site VOLTOU.
echo ============================================================
goto :fim

:erro
echo.
echo ------------------------------------------------------------
echo   OCORREU UM ERRO. Tire um print desta tela e me envie.
echo ------------------------------------------------------------

:fim
echo.
pause
