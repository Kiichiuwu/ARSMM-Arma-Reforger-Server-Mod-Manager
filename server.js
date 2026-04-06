// server.js - VERSÃO UNIFICADA: MULTI-PERFIS + RCON REAL + MOD SCRAPER
const express = require('express');
const cors = require('cors');
const axios = require('axios');
const path = require('path');
const fs = require('fs');
const http = require('http');
const { Server } = require('socket.io');
const { Rcon } = require('rcon-client');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

const PORT = 3000;
const SAVES_DIR = process.env.SAVES_DIR || path.join(__dirname, 'saves');

// Garante que a pasta saves existe
if (!fs.existsSync(SAVES_DIR)) fs.mkdirSync(SAVES_DIR, { recursive: true });

app.use(cors());
app.use(express.json());

// CONFIGURAÇÃO ESTÁTICA: { index: false } evita que o Express carregue o index.html automaticamente
app.use(express.static(__dirname, { index: false })); 
app.use(express.static(path.join(__dirname, 'public'), { index: false }));

// --- INTERCEPTADOR DE LOGS (Terminal do App) ---
const originalLog = console.log;
const originalErr = console.error;
function broadcastLog(type, args) {
    const msg = args.map(a => (typeof a === 'object' ? JSON.stringify(a) : String(a))).join(' ');
    if(type === 'log') originalLog.apply(console, args); else originalErr.apply(console, args);
    io.emit('server-log', { type, msg, time: new Date().toLocaleTimeString() });
}
console.log = function(...args) { broadcastLog('log', args); };
console.error = function(...args) { broadcastLog('error', args); };

// --- ROTAS DE NAVEGAÇÃO (Prevenção de Loop) ---

app.get('/', (req, res) => {
    const setupPath = path.join(__dirname, 'setup.html');
    if (fs.existsSync(setupPath)) {
        res.sendFile(setupPath);
    } else {
        res.send(`<div style="color:white;background:#222;padding:20px;font-family:sans-serif;">
            <h1 style="color:#ef5350">setup.html não encontrado!</h1>
            <p>Verifique se o arquivo setup.html está na pasta raiz.</p>
        </div>`);
    }
});

app.get('/panel', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// --- API DE PERFIS (Multi-Saves) ---

app.get('/api/profiles', (req, res) => {
    try {
        const files = fs.readdirSync(SAVES_DIR).filter(f => f.endsWith('.json'));
        const profiles = files.map(f => {
            try {
                const content = JSON.parse(fs.readFileSync(path.join(SAVES_DIR, f), 'utf8'));
                return { filename: f, name: content.meta?.name || f, bmId: content.meta?.bmId };
            } catch(e) { return null; }
        }).filter(x => x);
        res.json(profiles);
    } catch (e) { res.json([]); }
});

app.post('/api/profiles/:filename', (req, res) => {
    try {
        const filePath = path.join(SAVES_DIR, req.params.filename);
        fs.writeFileSync(filePath, JSON.stringify(req.body, null, 4));
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/profiles/:filename', (req, res) => {
    try {
        const filePath = path.join(SAVES_DIR, req.params.filename);
        if (fs.existsSync(filePath)) {
            res.json(JSON.parse(fs.readFileSync(filePath, 'utf8')));
        } else {
            res.status(404).json({ error: "Perfil não encontrado" });
        }
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// --- SISTEMA RCON REAL ---
let rconInstance = null;

io.on('connection', (socket) => {
    socket.on('rcon-connect', async (config) => {
        if (rconInstance) try { await rconInstance.end(); } catch(e){}
        console.log(`[RCON] Tentando conectar em ${config.host}:${config.port} com senha fornecida...`);
        try {
            rconInstance = new Rcon({
                host: config.host,
                port: parseInt(config.port),
                password: config.password,
                timeout: 5000
            });
            rconInstance.on('error', (err) => {
                console.error(`[RCON] Erro de conexão: ${err.message}`);
                socket.emit('rcon-status', { connected: false, error: err.message });
            });
            rconInstance.on('end', () => { 
                console.log('[RCON] Conexão encerrada.');
                socket.emit('rcon-status', { connected: false }); 
                rconInstance = null; 
            });
            
            await rconInstance.connect();
            console.log('[RCON] Conexão estabelecida com sucesso.');
            socket.emit('rcon-status', { connected: true });
            socket.emit('rcon-log', "Conexão RCON estabelecida.");
        } catch (e) {
            console.error(`[RCON] Falha na conexão: ${e.message}`);
            socket.emit('rcon-status', { connected: false, error: e.message });
        }
    });

    socket.on('rcon-send', async (cmd) => {
        if (!rconInstance) return socket.emit('rcon-log', "Erro: Não conectado.");
        try {
            const response = await rconInstance.send(cmd);
            socket.emit('rcon-response', response);
        } catch (e) {
            socket.emit('rcon-log', `Erro: ${e.message}`);
        }
    });

    socket.on('rcon-disconnect', async () => {
        if (rconInstance) { await rconInstance.end(); rconInstance = null; }
    });
});

// --- HELPER PARA TAMANHO DE MODS ---
function parseSizeString(amount, unit) {
    const val = parseFloat(amount); const u = unit.toUpperCase().trim();
    if (u === 'GB') return val * 1024 * 1024 * 1024;
    if (u === 'MB') return val * 1024 * 1024;
    if (u === 'KB') return val * 1024; return val;
}

// --- APIS EXTERNAS (Battlemetrics e Workshop Scraper) ---

// No server.js, substitua o app.get('/api/battlemetrics/:id'...) por isso:

app.get('/api/battlemetrics/:id', async (req, res) => {
    try {
        console.log(`[BATTLEMETRICS] Buscando dados para servidor ID: ${req.params.id}`);
        // Timeout aumentado para 8s e User-Agent para não ser bloqueado
        const bmRes = await axios.get(`https://api.battlemetrics.com/servers/${req.params.id}?include=player`, { 
            timeout: 8000,
            headers: { 'User-Agent': 'BRS-Manager/1.0' }
        });
        console.log(`[BATTLEMETRICS] Dados recebidos para ID ${req.params.id}`);
        res.json(bmRes.data);
    } catch (e) {
        // Mostra o erro real no terminal do VS Code
        const status = e.response?.status || 500;
        const msg = e.response?.data?.errors?.[0]?.detail || e.message;
        console.error(`[BM ERRO] Falha ao buscar ID ${req.params.id}: ${msg}`);
        
        res.status(status).json({ error: msg }); 
    }
});

app.get('/api/mod/:id', async (req, res) => {
    const modId = req.params.id;
    const headers = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/121.0.0.0 Safari/537.36' };
    let modData = { name: "Desconhecido", version: "0.0.0", sizeBytes: 0, image: "", dependencies: [] };
    
    try {
        console.log(`[WORKSHOP] Buscando dados do Mod: ${modId}`);
        const htmlRes = await axios.get(`https://reforger.armaplatform.com/workshop/${modId}`, { headers, timeout: 8000 });
        const html = htmlRes.data;

        // Imagem
        const imgMatch = html.match(/<img[^>]+src="(https:\/\/ar-gcp-cdn\.bistudio\.com\/image\/[^"]+)"/i);
        if (imgMatch) modData.image = imgMatch[1];

        // Nome
        const nameMatch = html.match(/<h1[^>]*>(.*?)<\/h1>/i);
        if (nameMatch) modData.name = nameMatch[1].trim();

        // Dependências
        const depSectionMatch = html.match(/Dependencies<\/h2>.*?<\/section>/s);
        if (depSectionMatch) {
            const depRegex = /\/workshop\/([A-Fa-f0-9]{16})-([^"]+)/g;
            let match;
            while ((match = depRegex.exec(depSectionMatch[0])) !== null) {
                if (match[1].toUpperCase() !== modId.toUpperCase()) {
                    modData.dependencies.push({ id: match[1], name: match[2].replace(/-/g, ' ') });
                }
            }
        }

        // Versão e Tamanho
        let cleanText = html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
        const vMatch = cleanText.match(/(?<!Game\s)Version\s+([\d\.]+)/i); 
        if (vMatch) modData.version = vMatch[1];
        
        const sMatch = cleanText.match(/Version size\s+([\d\.]+)\s+(GB|MB|KB|B)/i); 
        if (sMatch) modData.sizeBytes = parseSizeString(sMatch[1], sMatch[2]);

    } catch (e) {
        console.error(`[WORKSHOP ERRO] Mod ${modId}: ${e.message}`);
    }
    res.json(modData);
});

server.listen(PORT, () => {
    console.log(`[SISTEMA] Servidor rodando em http://localhost:${PORT}`);
    console.log(`[SISTEMA] Pasta de saves: ${SAVES_DIR}`);
});