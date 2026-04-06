const { app, BrowserWindow, ipcMain, dialog } = require('electron'); 
const path = require('path');
const fs = require('fs'); 

// --- SOLUÇÃO PARA O ERRO ASAR ---
const isPackaged = app.isPackaged;
process.env.ROOT_PATH = isPackaged 
    ? path.join(path.dirname(app.getPath('exe')), 'resources', 'app.asar.unpacked')
    : __dirname;
process.env.SAVES_DIR = path.join(app.getPath('userData'), 'saves');

// Inicia o Backend
require(path.join(__dirname, 'server.js')); 

let mainWindow;
let isQuitting = false; // Controle de fechamento

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1280, height: 800,
        minWidth: 900, minHeight: 600,
        backgroundColor: '#121212',
        frame: true,
        autoHideMenuBar: true,
        // icon: path.join(process.env.ROOT_PATH, 'public/favicon.ico'),
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false
        }
    });

    setTimeout(() => {
        mainWindow.loadURL('http://localhost:3000').catch(err => {
            console.error("Falha ao carregar URL:", err);
            mainWindow.reload();
        });
    }, 1500);

    // --- INTERCEPTA O FECHAMENTO DA JANELA ---
    mainWindow.on('close', (e) => {
        if (!isQuitting) {
            e.preventDefault(); // Cancela o fechamento imediato
            // Manda o front-end salvar as configurações
            mainWindow.webContents.send('app-closing');
        }
    });
}

// --- O FRONTEND CONFIRMA QUE SALVOU ---
ipcMain.on('save-complete', () => {
    isQuitting = true;
    app.quit(); // Agora fecha de verdade
});

// --- SISTEMA DE SALVAR ARQUIVO (Nativo) ---
ipcMain.handle('save-txt-dialog', async (event, { filename, content }) => {
    const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
        title: 'Salvar Configuração do Servidor',
        defaultPath: filename,
        filters: [{ name: 'Arquivo JSON', extensions: ['json', 'txt'] }]
    });

    if (canceled || !filePath) return { success: false };

    try {
        fs.writeFileSync(filePath, content, 'utf-8');
        return { success: true };
    } catch (e) {
        return { success: false, error: e.message };
    }
});

app.whenReady().then(() => {
    createWindow();
    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});