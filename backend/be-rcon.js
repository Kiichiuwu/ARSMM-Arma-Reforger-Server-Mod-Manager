// be-rcon.js - Cliente BattlEye RCon (UDP), protocolo usado pelo RCON do Arma Reforger.
// Referência: BERConProtocol.txt (BattlEye). Pacote: 'B' 'E' + CRC32 (LE) + 0xFF + tipo + payload.
const dgram = require('dgram');
const net = require('net');
const { EventEmitter } = require('events');

const TYPE_LOGIN = 0x00;
const TYPE_COMMAND = 0x01;
const TYPE_MESSAGE = 0x02;

const KEEPALIVE_MS = 30000;      // o servidor desconecta clientes inativos após 45s
const CONNECTION_LOST_MS = 90000; // sem nenhum pacote do servidor por esse tempo = conexão perdida
const MESSAGE_DEDUPE_MS = 15000;  // reenvios da mesma mensagem do servidor dentro desse intervalo são ignorados

const CRC_TABLE = (() => {
    const table = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
        let c = n;
        for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
        table[n] = c >>> 0;
    }
    return table;
})();

function crc32(buf) {
    let crc = 0xFFFFFFFF;
    for (let i = 0; i < buf.length; i++) crc = CRC_TABLE[(crc ^ buf[i]) & 0xFF] ^ (crc >>> 8);
    return (crc ^ 0xFFFFFFFF) >>> 0;
}

function buildPacket(type, payload) {
    const body = Buffer.concat([Buffer.from([0xFF, type]), payload]);
    const header = Buffer.alloc(6);
    header.write('BE', 0, 'ascii');
    header.writeUInt32LE(crc32(body), 2);
    return Buffer.concat([header, body]);
}

// Retorna { type, payload } ou null se o pacote for inválido.
function parsePacket(msg) {
    if (msg.length < 8 || msg[0] !== 0x42 || msg[1] !== 0x45 || msg[6] !== 0xFF) return null;
    if (msg.readUInt32LE(2) !== crc32(msg.subarray(6))) return null;
    return { type: msg[7], payload: msg.subarray(8) };
}

class BERcon extends EventEmitter {
    constructor({ host, port, password, timeout = 5000 }) {
        super();
        this.host = host;
        this.port = port;
        this.password = password;
        this.timeout = timeout;
        this.socket = null;
        this.seq = 0;
        this.pending = new Map(); // seq -> { resolve, reject, timer, parts, count }
        this.loggedIn = false;
        this.ended = false;
        this.lastReceived = 0;
        this.recentMessages = new Map(); // seq -> horário em que a mensagem do servidor foi vista
        this.keepAliveTimer = null;
        this.abortConnect = null;
    }

    connect() {
        return new Promise((resolve, reject) => {
            const type = net.isIPv6(this.host) ? 'udp6' : 'udp4';
            const socket = dgram.createSocket(type);
            this.socket = socket;

            let settled = false;
            const finish = (err) => {
                if (settled) return;
                settled = true;
                this.abortConnect = null;
                clearTimeout(loginTimer);
                if (err) { this._teardown(); reject(err); } else resolve();
            };
            // end() durante o login cancela na hora, em vez de esperar o timeout.
            this.abortConnect = finish;
            const loginTimer = setTimeout(() => finish(new Error('Tempo esgotado aguardando resposta do servidor RCON.')), this.timeout);

            socket.on('error', (err) => {
                if (!settled) return finish(err);
                this.emit('error', err);
                this.end();
            });
            socket.on('message', (msg) => {
                // Um datagrama malformado nunca pode virar exceção não tratada no processo principal.
                try {
                    const packet = parsePacket(msg);
                    if (!packet) return;
                    this.lastReceived = Date.now();
                    if (packet.type === TYPE_LOGIN) {
                        if (settled) return; // resposta de login duplicada
                        if (packet.payload[0] === 0x01) {
                            this.loggedIn = true;
                            this._startKeepAlive();
                            finish();
                        } else {
                            finish(new Error('Senha do RCON incorreta.'));
                        }
                    } else if (packet.type === TYPE_COMMAND) {
                        this._handleCommandResponse(packet.payload);
                    } else if (packet.type === TYPE_MESSAGE) {
                        this._handleServerMessage(packet.payload);
                    }
                } catch (e) { /* pacote descartado */ }
            });

            // O callback também é chamado com erro (ex.: host que não resolve).
            socket.connect(this.port, this.host, (err) => {
                if (err) return finish(err);
                try {
                    socket.send(buildPacket(TYPE_LOGIN, Buffer.from(this.password, 'utf8')));
                } catch (e) {
                    finish(e);
                }
            });
        });
    }

    send(command) {
        if (!this.loggedIn || this.ended) return Promise.reject(new Error('RCON não conectado.'));
        const seq = this.seq;
        // O número de sequência tem 1 byte: com 256 comandos sem resposta ele daria a volta e misturaria respostas.
        if (this.pending.has(seq)) return Promise.reject(new Error('Muitos comandos aguardando resposta.'));
        this.seq = (this.seq + 1) & 0xFF;
        return new Promise((resolve, reject) => {
            const entry = { resolve, reject, timer: null, parts: null, count: 0 };
            entry.timer = setTimeout(() => {
                if (this.pending.get(seq) === entry) this.pending.delete(seq);
                reject(new Error('Tempo esgotado aguardando resposta do comando.'));
            }, this.timeout);
            const timer = entry.timer;
            this.pending.set(seq, entry);
            const payload = Buffer.concat([Buffer.from([seq]), Buffer.from(command, 'utf8')]);
            try {
                this.socket.send(buildPacket(TYPE_COMMAND, payload));
            } catch (e) {
                clearTimeout(timer);
                this.pending.delete(seq);
                reject(e);
            }
        });
    }

    end() {
        if (this.ended) return;
        this.ended = true;
        if (this.abortConnect) this.abortConnect(new Error('Conexão cancelada.'));
        this._teardown();
        this.emit('end');
    }

    _teardown() {
        this.loggedIn = false;
        clearInterval(this.keepAliveTimer);
        this.keepAliveTimer = null;
        for (const p of this.pending.values()) {
            clearTimeout(p.timer);
            p.reject(new Error('Conexão RCON encerrada.'));
        }
        this.pending.clear();
        if (this.socket) {
            try { this.socket.close(); } catch (e) { /* já fechado */ }
            this.socket = null;
        }
    }

    _startKeepAlive() {
        clearInterval(this.keepAliveTimer);
        this.keepAliveTimer = setInterval(() => {
            if (this.ended) {
                clearInterval(this.keepAliveTimer);
                return;
            }
            if (Date.now() - this.lastReceived > CONNECTION_LOST_MS) {
                this.emit('error', new Error('Servidor RCON parou de responder.'));
                this.end();
                return;
            }
            // Comando vazio mantém a sessão viva; a resposta é ignorada.
            this.send('').catch(() => {});
        }, KEEPALIVE_MS);
    }

    _handleCommandResponse(payload) {
        if (payload.length < 1) return;
        const seq = payload[0];
        const pending = this.pending.get(seq);
        if (!pending) return;
        let data = payload.subarray(1);

        // Resposta dividida em vários pacotes: 0x00 | total | índice. Partes incoerentes são descartadas.
        if (data.length >= 3 && data[0] === 0x00) {
            const total = data[1];
            const index = data[2];
            if (total === 0 || index >= total) return;
            if (!pending.parts) pending.parts = new Array(total).fill(null);
            else if (pending.parts.length !== total) return;
            if (pending.parts[index] !== null) return;
            pending.parts[index] = Buffer.from(data.subarray(3));
            pending.count++;
            if (pending.count < pending.parts.length) return;
            data = Buffer.concat(pending.parts);
        }

        clearTimeout(pending.timer);
        this.pending.delete(seq);
        pending.resolve(data.toString('utf8'));
    }

    _handleServerMessage(payload) {
        if (payload.length < 1) return;
        const seq = payload[0];
        // O servidor reenvia a mensagem até receber a confirmação; confirma sempre, exibe só uma vez.
        try {
            if (this.socket) this.socket.send(buildPacket(TYPE_MESSAGE, Buffer.from([seq])));
        } catch (e) { /* socket fechando */ }
        const now = Date.now();
        for (const [oldSeq, seenAt] of this.recentMessages) {
            if (now - seenAt > MESSAGE_DEDUPE_MS) this.recentMessages.delete(oldSeq);
        }
        if (this.recentMessages.has(seq)) return;
        this.recentMessages.set(seq, now);
        this.emit('message', payload.subarray(1).toString('utf8'));
    }
}

module.exports = { BERcon, crc32, buildPacket, parsePacket };
