// rcon.js - Uma sessão RCON (BattlEye) por janela.
const { BERcon } = require('./be-rcon');
const { BackendError } = require('./util');

// O Reforger responde ao "#players" sem a lista e manda logo em seguida, como mensagem do servidor,
// "[LOG] Players on server: ..." com uma linha por jogador. Espera essa mensagem por até LIST_WAIT_MS e,
// depois dela, junta linhas de jogador que cheguem separadas até LIST_QUIET_MS sem mensagem nova.
const LIST_HEADER_RE = /players on server/i;
const LIST_WAIT_MS = 2000;
const LIST_QUIET_MS = 300;
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

function createRconManager({ log = () => {}, timeout = 5000, listWaitMs = LIST_WAIT_MS, listQuietMs = LIST_QUIET_MS } = {}) {
    const sessions = new Map(); // ownerId -> BERcon

    function disconnect(ownerId) {
        const session = sessions.get(ownerId);
        if (!session) return;
        sessions.delete(ownerId);
        session.end();
    }

    // emit(canal, dados) avisa a janela dona da sessão: mensagens do servidor e quedas de conexão.
    async function connect(ownerId, config, emit) {
        disconnect(ownerId);
        const host = typeof config?.host === 'string' ? config.host.trim() : '';
        const port = Number.parseInt(config?.port, 10);
        const password = typeof config?.password === 'string' ? config.password : '';
        if (!host || host.length > 255 || !Number.isInteger(port) || port < 1 || port > 65535 || !password) {
            throw new BackendError('INVALID', 'Host, porta ou senha inválidos.');
        }

        log('log', `[RCON] Conectando em ${host}:${port}...`);
        const rcon = new BERcon({ host, port, password, timeout });
        sessions.set(ownerId, rcon);
        // Só uma sessão já estabelecida avisa a janela; o resultado da tentativa volta pelo retorno de connect().
        let established = false;
        let reportedError = false;
        // Mensagens da consulta automática de jogadores (Monitor, a cada 15 s) não poluem o terminal do RCON.
        rcon.on('message', (msg) => { if (!(rcon.playersQueries > 0 && isPlayersListNoise(msg))) emit('rcon-log', msg); });
        rcon.on('error', (err) => {
            log('error', `[RCON] Erro: ${err.message}`);
            if (!established) return;
            reportedError = true;
            emit('rcon-status', { connected: false, error: err.message });
        });
        rcon.on('end', () => {
            if (sessions.get(ownerId) === rcon) sessions.delete(ownerId);
            if (established && !reportedError) emit('rcon-status', { connected: false });
        });

        try {
            await rcon.connect();
        } catch (e) {
            // Tentativa substituída por outra (ex.: clique duplo): não é erro, a interface ignora.
            if (sessions.get(ownerId) !== rcon) return { connected: false, superseded: true };
            sessions.delete(ownerId);
            log('error', `[RCON] Falha na conexão: ${e.message}`);
            const err = new BackendError('RCON', e.message);
            err.logged = true;
            throw err;
        }
        if (sessions.get(ownerId) !== rcon) return { connected: false, superseded: true };
        established = true;
        log('log', '[RCON] Conexão estabelecida.');
        return { connected: true };
    }

    async function send(ownerId, command) {
        const rcon = sessions.get(ownerId);
        if (!rcon) throw new BackendError('RCON', 'Não conectado.');
        if (typeof command !== 'string' || !command.trim() || command.length > 2000) throw new BackendError('INVALID', 'Comando inválido.');
        try {
            return await rcon.send(command);
        } catch (e) {
            throw new BackendError('RCON', e.message);
        }
    }

    // Lista de jogadores com nome (o A2S do Reforger não informa nomes). Vale a lista que vier na resposta do
    // comando ou, como no Reforger, a que chega logo depois como mensagem do servidor.
    async function players(ownerId) {
        const rcon = sessions.get(ownerId);
        if (!rcon) throw new BackendError('RCON', 'Não conectado.');
        const messages = [];
        let lastAt = 0;
        const onMessage = (msg) => {
            const text = String(msg);
            // Antes do cabeçalho, ignora o resto (chat, "Processing Command"); depois, só linhas de jogador.
            if (!messages.length ? !LIST_HEADER_RE.test(text) : !PLAYER_LINE_RE.test(stripLog(text.split(/\r?\n/)[0]))) return;
            messages.push(text);
            lastAt = Date.now();
        };
        rcon.on('message', onMessage);
        rcon.playersQueries = (rcon.playersQueries || 0) + 1;
        try {
            const reply = await send(ownerId, '#players');
            if (!LIST_HEADER_RE.test(reply) && !parsePlayersResponse(reply).players.length) {
                const deadline = Date.now() + listWaitMs;
                while (Date.now() < deadline && !(messages.length && Date.now() - lastAt >= listQuietMs)) await sleep(25);
            }
            const raw = [reply, ...messages].filter(Boolean).join('\n');
            return { ...parsePlayersResponse(raw), raw };
        } finally {
            rcon.playersQueries--;
            rcon.off('message', onMessage);
        }
    }

    function disconnectAll() {
        for (const ownerId of [...sessions.keys()]) disconnect(ownerId);
    }

    return { connect, send, players, disconnect, disconnectAll };
}

// O formato da resposta de "#players" não é documentado: reconhece linhas com número da sessão,
// UID opcional e nome; o que não reconhecer volta como texto puro para a interface mostrar.
const UID = '[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}|[0-9a-fA-F]{32}';
const PLAYER_LINE_RE = new RegExp(`^#?(\\d+)\\s*[;:|,.)-]?\\s*(?:(${UID})\\s*[;:|,-]?\\s*)?(.+)$`);

// Linhas de log do Reforger vêm com "[LOG] " na frente.
function stripLog(line) {
    return String(line).trim().replace(/^\[LOG\]\s*/i, '');
}

// Cabeçalho da lista, eco do "#players" ou linha de jogador: o que a consulta automática gera.
function isPlayersListNoise(msg) {
    const first = stripLog(String(msg).split(/\r?\n/)[0]);
    return /^(players on server|processing command:\s*#players)\b/i.test(first) || PLAYER_LINE_RE.test(first);
}

function parsePlayersResponse(text) {
    const players = [];
    const unparsed = [];
    for (const raw of String(text).split(/\r?\n/)) {
        const line = stripLog(raw);
        if (!line) continue;
        // Cabeçalho da lista e eco do comando não são jogadores nem precisam aparecer como texto solto.
        if (/^(players on server|processing command)\b/i.test(line)) continue;
        const match = line.match(PLAYER_LINE_RE);
        // "25 players ..." é um resumo, não um jogador.
        if (match && !/^players?\b/i.test(match[3])) players.push({ id: match[1], uid: match[2] || '', name: match[3].trim() });
        else unparsed.push(line);
    }
    return { players, unparsed };
}

module.exports = { createRconManager, parsePlayersResponse };
