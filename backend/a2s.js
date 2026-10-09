// a2s.js - Consulta Steam Query (A2S_INFO) direto no servidor: status sem depender do BattleMetrics.
// O Arma Reforger responde na porta do bloco "a2s" do config (padrão 17777/UDP).
// A lista de jogadores (A2S_PLAYER) não é usada: o Reforger devolve todos como "player", sem nome.
const dgram = require('dgram');
const net = require('net');
const { BackendError } = require('./util');

const HEADER = Buffer.from([0xFF, 0xFF, 0xFF, 0xFF]);
const INFO_REQUEST = Buffer.concat([HEADER, Buffer.from('TSource Engine Query\0', 'latin1')]);
const TYPE_CHALLENGE = 0x41;
const TYPE_INFO = 0x49;

function createReader(buf, offset) {
    let o = offset;
    const need = (n) => { if (o + n > buf.length) throw new Error('Resposta A2S truncada.'); };
    return {
        byte() { need(1); return buf[o++]; },
        short() { need(2); const v = buf.readUInt16LE(o); o += 2; return v; },
        string() {
            const end = buf.indexOf(0, o);
            if (end < 0) throw new Error('Resposta A2S truncada.');
            const s = buf.toString('utf8', o, end);
            o = end + 1;
            return s;
        },
    };
}

// buf começa no byte de tipo (0x49), logo depois dos 4 bytes 0xFF.
function parseInfo(buf) {
    const r = createReader(buf, 1);
    r.byte(); // versão do protocolo
    const info = { name: r.string(), map: r.string() };
    r.string(); // pasta
    info.game = r.string();
    r.short(); // app id
    info.players = r.byte();
    info.maxPlayers = r.byte();
    info.bots = r.byte();
    r.byte(); // tipo de servidor
    r.byte(); // sistema operacional
    info.password = r.byte() === 1;
    r.byte(); // VAC
    info.version = r.string();
    return info;
}

function queryInfo(host, port, { timeout = 3000 } = {}) {
    host = typeof host === 'string' ? host.trim() : '';
    port = Number.parseInt(port, 10);
    if (!host || host.length > 255 || !Number.isInteger(port) || port < 1 || port > 65535) {
        return Promise.reject(new BackendError('INVALID', 'Endereço ou porta A2S inválidos.'));
    }

    return new Promise((resolve, reject) => {
        const socket = dgram.createSocket(net.isIPv6(host) ? 'udp6' : 'udp4');
        let finished = false;
        let sentAt = 0;
        let challenges = 0;

        const finish = (err, value) => {
            if (finished) return;
            finished = true;
            clearTimeout(timer);
            try { socket.close(); } catch (e) { /* já fechado */ }
            if (err) reject(err); else resolve(value);
        };
        const send = (payload) => {
            sentAt = Date.now();
            socket.send(payload, (err) => { if (err) finish(new BackendError('UNREACHABLE', err.message)); });
        };
        const timer = setTimeout(() => finish(new BackendError('UNREACHABLE',
            `O servidor não respondeu à consulta A2S em ${host}:${port}. Confira o bloco "a2s" do config e se a porta UDP está liberada no firewall.`)), timeout);

        socket.on('error', (err) => finish(new BackendError('UNREACHABLE', err.message)));
        socket.on('message', (msg) => {
            try {
                if (msg.length < 5 || msg.readInt32LE(0) !== -1) return; // respostas em vários pacotes não são esperadas para INFO
                const type = msg[4];
                if (type === TYPE_CHALLENGE && msg.length >= 9 && challenges++ < 2) {
                    send(Buffer.concat([INFO_REQUEST, msg.subarray(5, 9)]));
                } else if (type === TYPE_INFO) {
                    finish(null, { ...parseInfo(msg.subarray(4)), ping: Date.now() - sentAt });
                }
            } catch (e) {
                finish(new BackendError('UPSTREAM', e.message));
            }
        });

        socket.connect(port, host, (err) => {
            if (err) return finish(new BackendError('UNREACHABLE', err.message));
            send(INFO_REQUEST);
        });
    });
}

module.exports = { queryInfo, parseInfo };
