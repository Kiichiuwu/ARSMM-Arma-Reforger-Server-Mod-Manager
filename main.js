const { app, BrowserWindow, ipcMain, dialog, clipboard, shell, session } = require('electron');
const path = require('path');
const fs = require('fs');
const { fileURLToPath } = require('url');
const { BackendError } = require('./backend/util');
const { createProfileStore } = require('./backend/profiles');
const { createSettingsStore } = require('./backend/settings');
const { createWorkshop } = require('./backend/workshop');
const { createBattlemetrics } = require('./backend/battlemetrics');
const { createRconManager } = require('./backend/rcon');
const { createLogger } = require('./backend/logger');
const a2s = require('./backend/a2s');

// Duas instâncias abertas sobrescreveriam as edições uma da outra.
if (!app.requestSingleInstanceLock()) {
    app.quit();
    return;
}

const CLOSE_TIMEOUT_MS = 5000;
const MAX_RECENT_LOGS = 200; // por fluxo (main, backend, ui, errors)
const REPEAT_LOG_MS = 5 * 60 * 1000; // a mesma mensagem repetida nesse intervalo não vai de novo ao terminal
const PAGES = ['setup.html', 'index.html'].map(page => path.join(__dirname, page));
const WINDOW_EVENTS = new Set(['server-log', 'rcon-status', 'rcon-log']);

let mainWindow = null;
let isQuitting = false;
let closeTimer = null;

// --- LOG (terminal da aba "Outros": fluxos Principal, Backend e Erros) ---
const logger = createLogger({ limit: MAX_RECENT_LOGS, emit: (entry) => sendToWindow('server-log', entry) });
const log = logger.scoped('sistema', 'main');
const ipcLog = logger.scoped('ipc', 'backend', { dedupeMs: REPEAT_LOG_MS });
const uiLog = logger.scoped('console', 'ui', { dedupeMs: REPEAT_LOG_MS });
const a2sLog = logger.scoped('a2s', 'backend', { dedupeMs: REPEAT_LOG_MS });

function errorText(err) {
    if (err instanceof Error) return err.stack || err.message;
    try { return typeof err === 'string' ? err : JSON.stringify(err); } catch (e) { return String(err); }
}

// Exceções sem tratamento no processo principal: registra e segue (o app continua aberto, como antes).
process.on('uncaughtException', (err) => log('error', `Exceção não tratada: ${errorText(err)}`));
process.on('unhandledRejection', (reason) => log('error', `Promise rejeitada sem tratamento: ${errorText(reason)}`));

function sendToWindow(channel, payload) {
    if (!WINDOW_EVENTS.has(channel) || !mainWindow || mainWindow.isDestroyed()) return;
    mainWindow.webContents.send(channel, payload);
}

// --- BACKEND ---
const dataDir = app.getPath('userData');
const profiles = createProfileStore(path.join(dataDir, 'saves'));
const settings = createSettingsStore(path.join(dataDir, 'settings.json'));
const workshop = createWorkshop({ cacheFile: path.join(dataDir, 'mod-cache.json'), log: logger.scoped('workshop') });
const battlemetrics = createBattlemetrics({ getToken: async () => (await settings.read()).battlemetricsToken, log: logger.scoped('battlemetrics') });
const rcon = createRconManager({ log: logger.scoped('rcon') });

// --- SEGURANÇA: só as páginas do próprio app falam com o backend ---
function samePath(a, b) {
    return process.platform === 'win32' ? a.toLowerCase() === b.toLowerCase() : a === b;
}

function isAppPage(url) {
    try {
        const parsed = new URL(url);
        if (parsed.protocol !== 'file:') return false;
        const filePath = path.resolve(fileURLToPath(parsed));
        return PAGES.some(page => samePath(page, filePath));
    } catch (e) {
        return false;
    }
}

function isExternalHttps(url) {
    try { return new URL(url).protocol === 'https:'; } catch (e) { return false; }
}

function isTrustedSender(event) {
    return !!mainWindow && event.sender === mainWindow.webContents
        && event.senderFrame === mainWindow.webContents.mainFrame
        && isAppPage(event.senderFrame.url);
}

// Respostas sempre no formato { ok, data } ou { ok: false, code, error } (erros com campos extras não atravessam o contextBridge).
function handle(channel, fn) {
    ipcMain.handle(channel, async (event, ...args) => {
        if (!isTrustedSender(event)) return { ok: false, code: 'FORBIDDEN', error: 'Origem não permitida.' };
        try {
            return { ok: true, data: await fn(event, ...args) };
        } catch (e) {
            if (e instanceof BackendError) {
                // Erro esperado (mod não encontrado, servidor sem resposta, token ausente...): aviso, não erro.
                if (!e.logged) ipcLog('warn', `[${channel}] ${e.code}: ${e.message}`);
                return { ok: false, code: e.code, error: e.message };
            }
            log('error', `[${channel}] ${errorText(e)}`);
            return { ok: false, code: 'ERROR', error: `Erro interno: ${e.message}` };
        }
    });
}

handle('profiles:list', () => profiles.list());
handle('profiles:read', (e, filename) => profiles.read(filename));
handle('profiles:save', (e, filename, profile) => profiles.save(filename, profile));
handle('profiles:delete', (e, filename) => profiles.remove(filename));
handle('profiles:repair-name', (e, filename) => profiles.repairName(filename));
handle('settings:get', () => settings.getPublic());
handle('settings:update', (e, changes) => settings.update(changes));
handle('workshop:mod', (e, id, options) => workshop.getMod(id, { refresh: !!(options && options.refresh) }));
handle('workshop:game-version', (e, id, version) => workshop.getGameVersion(id, version));
handle('battlemetrics:server', (e, id) => battlemetrics.getServer(id));
handle('rcon:connect', (e, config) => rcon.connect(e.sender.id, config, sendToWindow));
handle('rcon:send', (e, command) => rcon.send(e.sender.id, command));
handle('rcon:players', (e) => rcon.players(e.sender.id));
handle('monitor:query', (e, target) => a2s.queryInfo(target && target.host, target && target.port, { log: a2sLog }));
handle('rcon:disconnect', (e) => rcon.disconnect(e.sender.id));
handle('logs:recent', (e, stream) => logger.recent(stream === undefined ? 'main' : stream));

handle('dialog:save-text', async (e, request) => {
    const filename = path.basename(String((request && request.filename) || 'config.json'));
    const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
        title: 'Salvar Configuração do Servidor',
        defaultPath: filename,
        filters: [{ name: 'Arquivo JSON', extensions: ['json', 'txt'] }],
    });
    if (canceled || !filePath) return { saved: false };
    await fs.promises.writeFile(filePath, String(request.content), 'utf-8');
    return { saved: true };
});

handle('clipboard:write', (e, text) => { clipboard.writeText(String(text)); });

// --- JANELA ---
function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1280, height: 800,
        minWidth: 900, minHeight: 600,
        backgroundColor: '#121212',
        frame: true,
        autoHideMenuBar: true,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: true,
        },
    });
    const contents = mainWindow.webContents;

    // Links externos (Workshop, BattleMetrics) abrem no navegador padrão, nunca dentro do app.
    contents.setWindowOpenHandler(({ url }) => {
        if (isExternalHttps(url)) shell.openExternal(url);
        return { action: 'deny' };
    });
    contents.on('will-navigate', (e, url) => {
        if (isAppPage(url)) return;
        e.preventDefault();
        if (isExternalHttps(url)) shell.openExternal(url);
    });
    // Sair do painel encerra a sessão RCON daquela página.
    contents.on('did-navigate', () => rcon.disconnect(contents.id));
    contents.on('render-process-gone', (e, details) => {
        log('error', `A interface caiu (${details && details.reason}, código ${details && details.exitCode}).`);
        rcon.disconnect(contents.id);
    });

    // Avisos e erros da interface (inclusive exceções sem tratamento, que o Chromium manda ao console).
    // Electron 44: o listener recebe um único objeto { level: 'info'|'warning'|'error'|'debug', message,
    // lineNumber, sourceId, frame }; a forma antiga (event, level numérico, message, line, sourceId) é obsoleta.
    contents.on('console-message', (details) => {
        if (!details || (details.level !== 'warning' && details.level !== 'error')) return;
        const source = details.sourceId ? ` (${path.basename(String(details.sourceId).split(/[?#]/)[0])}:${details.lineNumber})` : '';
        uiLog(details.level === 'error' ? 'error' : 'warn', `${details.message}${source}`);
    });
    contents.on('preload-error', (e, preloadPath, error) => log('error', `Erro no preload: ${errorText(error)}`));

    mainWindow.loadFile('setup.html');

    // Antes de fechar, pede para a interface salvar o perfil. Se ela não responder, fecha mesmo assim.
    mainWindow.on('close', (e) => {
        if (isQuitting) return;
        e.preventDefault();
        if (closeTimer) return;
        contents.send('app-closing');
        closeTimer = setTimeout(quitNow, CLOSE_TIMEOUT_MS);
    });

    mainWindow.on('closed', () => { mainWindow = null; });
}

function quitNow() {
    clearTimeout(closeTimer);
    closeTimer = null;
    isQuitting = true;
    app.quit();
}

ipcMain.on('save-complete', (event) => {
    if (isTrustedSender(event)) quitNow();
});

// O salvamento falhou: pergunta antes de descartar as alterações.
ipcMain.on('save-failed', async (event, message) => {
    if (!isTrustedSender(event)) return;
    clearTimeout(closeTimer);
    const { response } = await dialog.showMessageBox(mainWindow, {
        type: 'warning',
        buttons: ['Fechar sem salvar', 'Cancelar'],
        defaultId: 1,
        cancelId: 1,
        title: 'Falha ao salvar',
        message: 'Não foi possível salvar o perfil antes de fechar.',
        detail: String(message || ''),
    });
    if (response === 0) quitNow(); else closeTimer = null;
});

app.on('second-instance', () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
});

app.on('will-quit', () => {
    rcon.disconnectAll();
    workshop.flush();
});

app.whenReady().then(() => {
    // A interface não precisa de câmera, microfone, notificações etc.
    session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => callback(false));
    log('log', `Pasta de saves: ${profiles.dir}`);
    createWindow();
    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});
