@echo off
REM ============================================================
REM   REPARO DE PERMISSOES - Jorge Alvim Advocacia
REM   O app cai porque as pastas NOVAS de src/ (kanban, blog,
REM   shared, db) vieram por scp como root sem permissao de
REM   leitura/travessia para o usuario do servico. Isto compara
REM   as permissoes, corrige (leitura p/ todos + travessia nas
REM   pastas) e reinicia.
REM ============================================================
setlocal
cd /d "%~dp0"
set "KEY=%USERPROFILE%\.ssh\id_ed25519_161_97_71_14"
set "SRV=root@161.97.71.14"
set "REMOTE=/var/www/advocacia"

echo ============================================================
echo   REPARO DE PERMISSOES - Jorge Alvim Advocacia
echo ============================================================
echo.

echo [1/4] Usuario do servico e comparacao de permissoes (antes):
ssh -i "%KEY%" -o StrictHostKeyChecking=accept-new %SRV% "echo -n '  Servico roda como: '; systemctl cat advocacia | grep -i '^User=' || echo 'root (sem User=)'; echo '  --- pastas (modulo ANTIGO x NOVOS) ---'; ls -ld %REMOTE%/src %REMOTE%/src/modules/rockets %REMOTE%/src/modules/kanban %REMOTE%/src/modules/blog %REMOTE%/src/shared %REMOTE%/src/db 2>/dev/null; echo '  --- travessia ate o kanban ---'; namei -l %REMOTE%/src/modules/kanban/kanban.routes.js 2>/dev/null"
echo.

echo [2/4] Corrigindo dono e permissoes (leitura p/ todos + travessia nas pastas)...
ssh -i "%KEY%" -o StrictHostKeyChecking=accept-new %SRV% "U=$(systemctl cat advocacia | sed -n 's/^User=//p'); U=${U:-www-data}; echo \"   Aplicando dono $U e a+rX em src/ e public/\"; chown -R $U:$U %REMOTE%/src %REMOTE%/public 2>/dev/null; chmod -R a+rX %REMOTE%/src %REMOTE%/public; chmod a+r %REMOTE%/server.js %REMOTE%/*.html; echo '   OK'"
if errorlevel 1 goto :erro
echo.

echo [3/4] Confirmando travessia apos o conserto:
ssh -i "%KEY%" -o StrictHostKeyChecking=accept-new %SRV% "namei -l %REMOTE%/src/modules/kanban/kanban.routes.js 2>/dev/null | tail -n 5"
echo.

echo [4/4] Reiniciando o servico...
ssh -i "%KEY%" -o StrictHostKeyChecking=accept-new %SRV% "systemctl restart advocacia && sleep 2 && printf 'Status: ' && systemctl is-active advocacia && printf 'Health: ' && curl -s -o /dev/null -w '%%{http_code}\n' http://localhost:3000/health"
if errorlevel 1 goto :erro
echo.

echo ============================================================
echo   Se apareceu "active" e "Health: 200", o SITE VOLTOU.
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
