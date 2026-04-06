# Arma Reforger Manager

Um gerenciador de servidor para Arma Reforger construído com Electron, Express e Socket.IO.

---

## PT-BR

### Visão geral

Este projeto inicia um backend local em `server.js` e carrega a interface dentro de uma janela Electron.
A interface principal é servida em `http://localhost:3000` e o servidor de configuração inicial usa `setup.html` quando disponível.
Os perfis de servidor são salvos na pasta `saves/` ou, quando empacotado, no diretório de dados do usuário do Windows.

### Funcionalidades

- Gerenciamento de perfis de servidor (`saves/*.json`)
- Conexão via RCON usando `rcon-client`
- Consulta de dados do BattleMetrics
- Scraper de informações de mods da Workshop do Reforger
- Interface de criação/importação de servidor

### Captura de Dados de Mods

O software utiliza web scraping para capturar informações de mods do marketplace da Bohemia Interactive (site oficial do Arma Reforger). Isso é feito porque a empresa não fornece uma API oficial para busca e consulta de mods, forçando desenvolvedores a recorrer a métodos menos eficientes e mais propensos a falhas.

Os dados capturados incluem nomes, descrições, IDs e outras metadatas dos mods disponíveis na Workshop. Esses dados são utilizados para permitir que os usuários pesquisem, visualizem e adicionem mods aos seus perfis de servidor diretamente na interface do aplicativo, facilitando a configuração de servidores personalizados.

Infelizmente, a ausência de uma API dedicada torna o processo mais frágil, já que mudanças no layout do site podem quebrar a funcionalidade. Esperamos que a Bohemia Interactive considere implementar uma API oficial em futuras atualizações.

### Requisitos

- Node.js instalado
- npm instalado
- Windows (recomendado para empacotamento com Electron)

### Instalação

1. Abra o terminal na pasta do projeto.
2. Execute:

```powershell
npm install
```

### Execução em modo de desenvolvimento

Execute:

```powershell
npm start
```

Ou use o atalho automático:

```powershell
start.bat
```

O `start.bat` verifica se `node_modules` existe, instala as dependências quando necessário e inicia o aplicativo Electron.

Isso iniciará o Electron que, por sua vez, carrega o backend local e abre a interface em uma janela.

### Compilação / Build

Para gerar o instalador do Windows, use:

```powershell
npm run dist
```

O pacote será criado na pasta `dist/`.

> Observação: o Windows Defender/SmartScreen pode bloquear o instalador em builds não assinados. Rode como administrador ou adicione exceção se necessário.

### Onde os arquivos são salvos

- Em desenvolvimento: `saves/`
- Em build empacotado: `app.getPath('userData')/saves`

### Problemas comuns

- Se o PowerShell bloquear o `npm`, habilite scripts locais:

```powershell
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
```

- Se o RCON não conectar:
  - Verifique host, porta e senha.
  - Confirme que o servidor Arma Reforger está com RCON habilitado.

---

## EN

### Overview

This project starts a local backend in `server.js` and loads the UI inside an Electron window.
The main interface is served at `http://localhost:3000`, and the initial setup page uses `setup.html` when present.
Server profiles are saved in the `saves/` folder, or in the user's data directory when packaged.

### Features

- Server profile management (`saves/*.json`)
- RCON connection using `rcon-client`
- BattleMetrics data fetch
- Reforger Workshop mod scraping
- Create/import server configuration

### Mod Data Capture

The software uses web scraping to capture mod information from Bohemia Interactive's marketplace (the official Arma Reforger website). This is necessary because the company does not provide an official API for searching and querying mods, forcing developers to use less efficient and more error-prone methods.

The captured data includes mod names, descriptions, IDs, and other metadata from available Workshop mods. This data is used to allow users to search, view, and add mods to their server profiles directly in the app's interface, making it easier to configure custom servers.

Unfortunately, the lack of a dedicated API makes the process more fragile, as changes to the website's layout can break functionality. We hope Bohemia Interactive will consider implementing an official API in future updates.

### Requirements

- Node.js installed
- npm installed
- Windows recommended for Electron packaging

### Installation

1. Open a terminal in the project folder.
2. Run:

```powershell
npm install
```

### Run in development mode

Run:

```powershell
npm start
```

Or use the automatic launcher:

```powershell
start.bat
```

The `start.bat` checks for `node_modules`, installs dependencies if needed, and starts the Electron app.

This will launch Electron, which starts the backend and opens the UI in a window.

### Build / Packaging

To generate the Windows installer, run:

```powershell
npm run dist
```

The package will be created under `dist/`.

> Note: Windows Defender / SmartScreen may block unsigned installer builds. Run as administrator or add an exception if necessary.

### Where files are saved

- During development: `saves/`
- Packaged app: `app.getPath('userData')/saves`

### Common issues

- If PowerShell blocks `npm`, allow local script execution:

```powershell
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
```

- If RCON fails to connect:
  - Check host, port and password.
  - Verify that the Arma Reforger server has RCON enabled.
