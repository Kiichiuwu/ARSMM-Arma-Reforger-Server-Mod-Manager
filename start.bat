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

echo Iniciando o aplicativo...
powershell -NoProfile -ExecutionPolicy Bypass -Command "Start-Process 'cmd.exe' -ArgumentList '/c npm start' -WorkingDirectory '%CD%' -WindowStyle Hidden"
exit /b 0
