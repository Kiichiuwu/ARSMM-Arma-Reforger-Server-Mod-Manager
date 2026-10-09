@echo off
cd /d "%~dp0"

if not exist "node_modules" (
    echo Dependencias nao encontradas. Instalando...
    npm install
    if errorlevel 1 (
        echo.
        echo Falha ao instalar dependencias. Verifique os erros acima.
        pause
        exit /b 1
    )
)

rem O Electron baixa o executavel na primeira execucao; faz isso aqui, com a janela visivel.
if not exist "node_modules\electron\dist\electron.exe" (
    echo Baixando o Electron (so na primeira vez^)...
    node node_modules\electron\install.js
    if errorlevel 1 (
        echo.
        echo Falha ao baixar o Electron. Verifique sua conexao e tente de novo.
        pause
        exit /b 1
    )
)

echo Iniciando o aplicativo...
start "" "node_modules\electron\dist\electron.exe" .
exit /b 0
