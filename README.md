# Arma Reforger Manager

Um gerenciador de servidor para Arma Reforger construído com Electron, Express e Socket.IO.

---

## PT-BR

### Visão geral

É um aplicativo Electron sem servidor local: a interface (`setup.html` e `index.html`) fala com o processo principal (`main.js`) só por IPC, através do `preload.js`, e não abre nenhuma porta de rede.
A lógica fica em `backend/`: perfis (`profiles.js`), configurações (`settings.js`), dados da Workshop (`workshop.js`), consulta direta ao servidor (`a2s.js`), BattleMetrics (`battlemetrics.js`) e RCON (`rcon.js` + `be-rcon.js`).
A tela inicial (`setup.html`) lista os perfis; o painel (`index.html`) edita o perfil escolhido.
Os perfis de servidor são salvos no diretório de dados do usuário do Windows (veja "Onde os arquivos são salvos").

<img width="1439" height="849" alt="image" src="https://github.com/user-attachments/assets/c4cb9f8f-2f98-427d-ade4-ebdce7f7fd07" />


### Funcionalidades

- Gerenciamento de perfis de servidor (`saves/*.json`)

<img width="658" height="327" alt="image" src="https://github.com/user-attachments/assets/d564b59d-0444-4cfb-b3f4-be7a782195cc" />

- Conexão via RCON (protocolo BattlEye RCon sobre UDP, o mesmo do servidor Arma Reforger)

<img width="1177" height="768" alt="image" src="https://github.com/user-attachments/assets/09f5682c-302e-4486-b57e-bb050307abcb" />

- Monitor do servidor sem depender de terceiros: status, jogadores, cenário, versão e ping consultados direto no servidor pelo protocolo A2S (Steam Query, porta do bloco `a2s` do config, padrão 17777/UDP). Os nomes dos jogadores vêm do RCON (`#players`), porque o A2S do Reforger não os informa. Rank e país continuam disponíveis pelo BattleMetrics, que exige um token de API (assinatura).

<img width="1348" height="817" alt="image" src="https://github.com/user-attachments/assets/acfb714d-88c3-4a89-a87d-6d0f3944455c" />

- Scraper de informações de mods da Workshop do Reforger

<img width="980" height="814" alt="image" src="https://github.com/user-attachments/assets/e963bb34-6fff-4439-8df2-e9435334e2a5" />

- Interface de criação/importação de servidor

<img width="350" height="153" alt="image" src="https://github.com/user-attachments/assets/3589a494-4dde-4cb4-98a5-a4b9db0b8f29" />
<img width="600" height="357" alt="image" src="https://github.com/user-attachments/assets/782c8125-359d-460f-b57e-980ae7eb2170" />


### Captura de Dados de Mods

O software utiliza web scraping para capturar informações de mods do marketplace da Bohemia Interactive (site oficial do Arma Reforger). Isso é feito porque a empresa não fornece uma API oficial para busca e consulta de mods, forçando desenvolvedores a recorrer a métodos menos eficientes e mais propensos a falhas.

Os dados capturados incluem nomes, descrições, IDs e outras metadatas dos mods disponíveis na Workshop. Esses dados são utilizados para permitir que os usuários pesquisem, visualizem e adicionem mods aos seus perfis de servidor diretamente na interface do aplicativo, facilitando a configuração de servidores personalizados.

Infelizmente, a ausência de uma API dedicada torna o processo mais frágil, já que mudanças no layout do site podem quebrar a funcionalidade. Esperamos que a Bohemia Interactive considere implementar uma API oficial em futuras atualizações.

Para reduzir essa fragilidade, o app lê os dados estruturados que a própria página publica (`<script id="__NEXT_DATA__">`) em vez de procurar texto no HTML, consulta no máximo 4 mods ao mesmo tempo e guarda os resultados em cache (`mod-cache.json`) por 6 horas.

### Requisitos

- Node.js 22.12 ou superior (exigido pelo Electron 44)
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

O `start.bat` verifica se `node_modules` existe, instala as dependências quando necessário, baixa o Electron na primeira vez (com o progresso visível) e inicia o aplicativo.

Isso iniciará o Electron que, por sua vez, carrega o backend local e abre a interface em uma janela.

### Compilação / Build

Para gerar o instalador do Windows, use:

```powershell
npm run dist
```

O pacote será criado na pasta `dist/`.

> Observação: o Windows Defender/SmartScreen pode bloquear o instalador em builds não assinados. Rode como administrador ou adicione exceção se necessário.

### Testes

```powershell
npm test
```

### Onde os arquivos são salvos

- Rodando pelo Electron (`npm start`): `%APPDATA%\compilador\saves`
- Build empacotado: `%APPDATA%\Arma Reforger Manager\saves`

Na mesma pasta-mãe ficam `settings.json` (token do BattleMetrics) e `mod-cache.json` (cache da Workshop).

### Problemas comuns

- Se o PowerShell bloquear o `npm`, habilite scripts locais:

```powershell
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
```

- Se o RCON não conectar:
  - Verifique host, porta e senha.
  - Confirme que o servidor Arma Reforger está com RCON habilitado.
  - A porta do RCON é UDP: libere-a no firewall do servidor.

---

## EN

### Overview

It is an Electron app with no local server: the UI (`setup.html` and `index.html`) talks to the main process (`main.js`) only over IPC, through `preload.js`, and no network port is opened.
The logic lives in `backend/`: profiles (`profiles.js`), settings (`settings.js`), Workshop data (`workshop.js`), direct server query (`a2s.js`), BattleMetrics (`battlemetrics.js`) and RCON (`rcon.js` + `be-rcon.js`).
The start screen (`setup.html`) lists the profiles; the panel (`index.html`) edits the selected one.
Server profiles are saved in the user's Windows data directory (see "Where files are saved").

### Features

- Server profile management (`saves/*.json`)

<img width="656" height="333" alt="image" src="https://github.com/user-attachments/assets/cf57c729-68d8-4d30-9849-d220fa27e33e" />

- RCON connection (BattlEye RCon protocol over UDP, the same one the Arma Reforger server uses)

<img width="1177" height="768" alt="image" src="https://github.com/user-attachments/assets/09f5682c-302e-4486-b57e-bb050307abcb" />

- Server monitor with no third party: status, players, scenario, version and ping queried straight from the server over A2S (Steam Query, the port of the config's `a2s` block, 17777/UDP by default). Player names come from RCON (`#players`), because Reforger's A2S does not report them. Rank and country are still available from BattleMetrics, which requires an API token (subscription).

<img width="1348" height="817" alt="image" src="https://github.com/user-attachments/assets/acfb714d-88c3-4a89-a87d-6d0f3944455c" />

- Reforger Workshop mod scraping

<img width="980" height="814" alt="image" src="https://github.com/user-attachments/assets/e963bb34-6fff-4439-8df2-e9435334e2a5" />

- Create/import server configuration

<img width="349" height="151" alt="image" src="https://github.com/user-attachments/assets/0e387004-9d03-4aa5-8c78-2082effc1682" />
<img width="593" height="364" alt="image" src="https://github.com/user-attachments/assets/c0f28042-72e7-40a7-aecf-0f4c102545bf" />



### Mod Data Capture

The software uses web scraping to capture mod information from Bohemia Interactive's marketplace (the official Arma Reforger website). This is necessary because the company does not provide an official API for searching and querying mods, forcing developers to use less efficient and more error-prone methods.

The captured data includes mod names, descriptions, IDs, and other metadata from available Workshop mods. This data is used to allow users to search, view, and add mods to their server profiles directly in the app's interface, making it easier to configure custom servers.

Unfortunately, the lack of a dedicated API makes the process more fragile, as changes to the website's layout can break functionality. We hope Bohemia Interactive will consider implementing an official API in future updates.

To reduce that fragility, the app reads the structured data the page itself publishes (`<script id="__NEXT_DATA__">`) instead of searching the HTML text, queries at most 4 mods at a time and caches the results (`mod-cache.json`) for 6 hours.

### Requirements

- Node.js 22.12 or newer (required by Electron 44)
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

The `start.bat` checks for `node_modules`, installs dependencies if needed, downloads Electron on the first run (with visible progress) and starts the app.

This will launch Electron, which starts the backend and opens the UI in a window.

### Build / Packaging

To generate the Windows installer, run:

```powershell
npm run dist
```

The package will be created under `dist/`.

> Note: Windows Defender / SmartScreen may block unsigned installer builds. Run as administrator or add an exception if necessary.

### Tests

```powershell
npm test
```

### Where files are saved

- Running through Electron (`npm start`): `%APPDATA%\compilador\saves`
- Packaged app: `%APPDATA%\Arma Reforger Manager\saves`

The same parent folder holds `settings.json` (BattleMetrics token) and `mod-cache.json` (Workshop cache).

### Common issues

- If PowerShell blocks `npm`, allow local script execution:

```powershell
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
```

- If RCON fails to connect:
  - Check host, port and password.
  - Verify that the Arma Reforger server has RCON enabled.
  - The RCON port is UDP: open it in the server's firewall.
