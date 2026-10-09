// rcon.js - Uma sessão RCON (BattlEye) por janela.
const { BERcon } = require('./be-rcon');
const { BackendError } = require('./util');

function createRconManager({ log = () => {}, timeout = 5000 } = {}) {
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
        rcon.on('message', (msg) => emit('rcon-log', msg));
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
            throw new BackendError('RCON', e.message);
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

    // Lista de jogadores com nome (o A2S do Reforger não informa nomes).
    async function players(ownerId) {
        const raw = await send(ownerId, '#players');
        return { ...parsePlayersResponse(raw), raw };
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

function parsePlayersResponse(text) {
    const players = [];
    const unparsed = [];
    for (const raw of String(text).split(/\r?\n/)) {
        const line = raw.trim();
        if (!line) continue;
        const match = line.match(PLAYER_LINE_RE);
        // "25 players ..." é um resumo, não um jogador.
        if (match && !/^players?\b/i.test(match[3])) players.push({ id: match[1], uid: match[2] || '', name: match[3].trim() });
        else unparsed.push(line);
    }
    return { players, unparsed };
}

module.exports = { createRconManager, parsePlayersResponse };
