// preload.js - Única ponte entre a interface e o processo principal (contextIsolation + sandbox).
// As chamadas devolvem { ok, data } ou { ok: false, code, error }; a página desembrulha com api().
const { contextBridge, ipcRenderer } = require('electron');

const EVENTS = new Set(['server-log', 'rcon-status', 'rcon-log']);
let closingHandler = null;

// O main pede para fechar: a página salva (se registrou um handler) e confirma.
ipcRenderer.on('app-closing', async () => {
    if (!closingHandler) {
        ipcRenderer.send('save-complete');
        return;
    }
    try {
        await closingHandler();
        ipcRenderer.send('save-complete');
    } catch (e) {
        ipcRenderer.send('save-failed', String((e && e.message) || e));
    }
});

const invoke = (channel) => (...args) => ipcRenderer.invoke(channel, ...args);

contextBridge.exposeInMainWorld('arsmm', {
    profiles: {
        list: invoke('profiles:list'),
        read: invoke('profiles:read'),
        save: invoke('profiles:save'),
        remove: invoke('profiles:delete'),
        repairName: invoke('profiles:repair-name'),
    },
    settings: {
        get: invoke('settings:get'),
        update: invoke('settings:update'),
    },
    workshop: { getMod: invoke('workshop:mod') },
    battlemetrics: { getServer: invoke('battlemetrics:server') },
    monitor: { query: invoke('monitor:query') },
    rcon: {
        connect: invoke('rcon:connect'),
        send: invoke('rcon:send'),
        players: invoke('rcon:players'),
        disconnect: invoke('rcon:disconnect'),
    },
    logs: { recent: invoke('logs:recent') },
    saveTextFile: (filename, content) => ipcRenderer.invoke('dialog:save-text', { filename: String(filename), content: String(content) }),
    copyText: (text) => ipcRenderer.invoke('clipboard:write', String(text)),
    on: (channel, callback) => {
        if (!EVENTS.has(channel) || typeof callback !== 'function') return;
        ipcRenderer.on(channel, (event, payload) => callback(payload));
    },
    onAppClosing: (handler) => { closingHandler = typeof handler === 'function' ? handler : null; },
});
