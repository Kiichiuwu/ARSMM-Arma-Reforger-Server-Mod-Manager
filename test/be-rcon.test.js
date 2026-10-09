const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const dgram = require('dgram');
const { BERcon, crc32, buildPacket, parsePacket } = require('../backend/be-rcon');
const { createRconManager } = require('../backend/rcon');

const PASSWORD = 'segredo123';

// Servidor BattlEye RCon falso, suficiente para exercitar o cliente.
function createFakeServer() {
    const socket = dgram.createSocket('udp4');
    const state = { acks: [], commands: [], client: null, ignoreCommands: false };
    const send = (type, payload) => socket.send(buildPacket(type, payload), state.client.port, state.client.address);

    socket.on('message', (msg, rinfo) => {
        const packet = parsePacket(msg);
        if (!packet) return;
        state.client = rinfo;
        if (packet.type === 0x00) {
            send(0x00, Buffer.from([packet.payload.toString() === PASSWORD ? 0x01 : 0x00]));
        } else if (packet.type === 0x01) {
            const seq = packet.payload[0];
            const command = packet.payload.subarray(1).toString();
            state.commands.push(command);
            if (state.ignoreCommands) return;
            if (command === 'players') {
                // Resposta em 3 partes, chegando fora de ordem.
                const parts = ['Players on server:\n', '0 Fulano\n', '1 Ciclano'];
                for (const index of [2, 0, 1]) {
                    send(0x01, Buffer.concat([Buffer.from([seq, 0x00, parts.length, index]), Buffer.from(parts[index])]));
                }
            } else {
                send(0x01, Buffer.concat([Buffer.from([seq]), Buffer.from(`ok:${command}`)]));
            }
        } else if (packet.type === 0x02) {
            state.acks.push(packet.payload[0]);
        }
    });

    return new Promise(resolve => socket.bind(0, '127.0.0.1', () => resolve({
        socket, state, port: socket.address().port,
        pushMessage: (seq, text) => send(0x02, Buffer.concat([Buffer.from([seq]), Buffer.from(text)])),
    })));
}

let fake;
let client;
beforeEach(async () => { fake = await createFakeServer(); });
afterEach(() => {
    if (client) client.end();
    client = null;
    fake.socket.close();
});

test('crc32 bate com o valor de referência', () => {
    assert.strictEqual(crc32(Buffer.from('The quick brown fox jumps over the lazy dog')), 0x414FA339);
});

test('pacote com CRC errado é descartado', () => {
    const packet = buildPacket(0x01, Buffer.from([0, 0x41]));
    assert.ok(parsePacket(packet));
    packet[2] ^= 0xFF;
    assert.strictEqual(parsePacket(packet), null);
});

test('login com senha correta e comando simples', async () => {
    client = new BERcon({ host: '127.0.0.1', port: fake.port, password: PASSWORD, timeout: 1000 });
    await client.connect();
    assert.strictEqual(await client.send('#status'), 'ok:#status');
});

test('senha errada rejeita a conexão', async () => {
    client = new BERcon({ host: '127.0.0.1', port: fake.port, password: 'errada', timeout: 1000 });
    await assert.rejects(client.connect(), /Senha do RCON incorreta/);
});

test('resposta em vários pacotes é remontada na ordem', async () => {
    client = new BERcon({ host: '127.0.0.1', port: fake.port, password: PASSWORD, timeout: 1000 });
    await client.connect();
    assert.strictEqual(await client.send('players'), 'Players on server:\n0 Fulano\n1 Ciclano');
});

test('mensagem do servidor é confirmada e emitida uma única vez', async () => {
    client = new BERcon({ host: '127.0.0.1', port: fake.port, password: PASSWORD, timeout: 1000 });
    await client.connect();
    const received = [];
    client.on('message', msg => received.push(msg));
    fake.pushMessage(7, 'Jogador conectou');
    fake.pushMessage(7, 'Jogador conectou'); // reenvio (ack perdido)
    await new Promise(resolve => setTimeout(resolve, 100));
    assert.deepStrictEqual(received, ['Jogador conectou']);
    assert.deepStrictEqual(fake.state.acks, [7, 7]);
});

test('comando sem resposta expira', async () => {
    client = new BERcon({ host: '127.0.0.1', port: fake.port, password: PASSWORD, timeout: 200 });
    await client.connect();
    fake.state.ignoreCommands = true;
    await assert.rejects(client.send('#status'), /Tempo esgotado/);
});

test('host que não resolve rejeita a conexão sem derrubar o processo', async () => {
    client = new BERcon({ host: 'host-que-nao-existe.invalid', port: 19999, password: PASSWORD, timeout: 3000 });
    await assert.rejects(client.connect());
    client = new BERcon({ host: '<img src=x>', port: 19999, password: PASSWORD, timeout: 3000 });
    await assert.rejects(client.connect());
});

test('partes incoerentes de resposta são descartadas sem exceção', async () => {
    client = new BERcon({ host: '127.0.0.1', port: fake.port, password: PASSWORD, timeout: 300 });
    await client.connect();
    fake.state.ignoreCommands = true;
    const pending = client.send('x');
    const seq = 0;
    const send = (bytes) => fake.socket.send(buildPacket(0x01, Buffer.from(bytes)), fake.state.client.port, fake.state.client.address);
    send([seq, 0x00, 3, 0, 0x41]); // total 3
    send([seq, 0x00, 1, 1, 0x42]); // total diferente: ignorado
    send([seq, 0x00, 0, 0]);       // total 0: ignorado
    send([seq, 0x00, 3, 7, 0x43]); // índice fora do total: ignorado
    await assert.rejects(pending, /Tempo esgotado/);
});

test('login duplicado não cria um segundo keepalive', async () => {
    client = new BERcon({ host: '127.0.0.1', port: fake.port, password: PASSWORD, timeout: 1000 });
    await client.connect();
    const timer = client.keepAliveTimer;
    fake.socket.send(buildPacket(0x00, Buffer.from([0x01])), fake.state.client.port, fake.state.client.address);
    await new Promise(resolve => setTimeout(resolve, 50));
    assert.strictEqual(client.keepAliveTimer, timer);
});

test('end() durante o login cancela a conexão na hora', async () => {
    const silent = dgram.createSocket('udp4');
    await new Promise(resolve => silent.bind(0, '127.0.0.1', resolve));
    client = new BERcon({ host: '127.0.0.1', port: silent.address().port, password: PASSWORD, timeout: 5000 });
    const started = Date.now();
    const connecting = client.connect();
    setTimeout(() => client.end(), 20);
    await assert.rejects(connecting, /cancelada/);
    assert.ok(Date.now() - started < 1000);
    silent.close();
});

test('256 comandos pendentes: o 257º é recusado em vez de misturar respostas', async () => {
    client = new BERcon({ host: '127.0.0.1', port: fake.port, password: PASSWORD, timeout: 500 });
    await client.connect();
    fake.state.ignoreCommands = true;
    const all = Array.from({ length: 256 }, () => client.send('x').catch(() => {}));
    await assert.rejects(client.send('y'), /Muitos comandos/);
    await Promise.all(all);
});

test('reenvio de mensagem antiga depois de uma nova não aparece duas vezes', async () => {
    client = new BERcon({ host: '127.0.0.1', port: fake.port, password: PASSWORD, timeout: 1000 });
    await client.connect();
    const received = [];
    client.on('message', msg => received.push(msg));
    fake.pushMessage(7, 'A');
    fake.pushMessage(8, 'B');
    fake.pushMessage(7, 'A');
    await new Promise(resolve => setTimeout(resolve, 100));
    assert.deepStrictEqual(received, ['A', 'B']);
});

test('servidor que não responde ao login expira', async () => {
    const silent = dgram.createSocket('udp4');
    await new Promise(resolve => silent.bind(0, '127.0.0.1', resolve));
    client = new BERcon({ host: '127.0.0.1', port: silent.address().port, password: PASSWORD, timeout: 200 });
    await assert.rejects(client.connect(), /Tempo esgotado/);
    silent.close();
});

// --- Gerenciador de sessões (uma por janela) ---

test('gerenciador: conecta, envia comando e avisa a queda só de sessão estabelecida', async () => {
    const events = [];
    const manager = createRconManager({ timeout: 1000 });
    const emit = (channel, payload) => events.push([channel, payload]);
    assert.deepStrictEqual(await manager.connect(1, { host: '127.0.0.1', port: fake.port, password: PASSWORD }, emit), { connected: true });
    assert.strictEqual(await manager.send(1, '#status'), 'ok:#status');
    manager.disconnect(1);
    assert.deepStrictEqual(events, [['rcon-status', { connected: false }]]);
    await assert.rejects(manager.send(1, '#status'), { code: 'RCON' });
});

test('gerenciador: clique duplo em conectar não gera erro falso', async () => {
    const events = [];
    const manager = createRconManager({ timeout: 2000 });
    const emit = (channel, payload) => events.push([channel, payload]);
    const silent = dgram.createSocket('udp4');
    await new Promise(resolve => silent.bind(0, '127.0.0.1', resolve));
    const first = manager.connect(1, { host: '127.0.0.1', port: silent.address().port, password: PASSWORD }, emit);
    const second = manager.connect(1, { host: '127.0.0.1', port: fake.port, password: PASSWORD }, emit);
    assert.deepStrictEqual(await first, { connected: false, superseded: true });
    assert.deepStrictEqual(await second, { connected: true });
    assert.deepStrictEqual(events, []);
    manager.disconnectAll();
    silent.close();
});

test('gerenciador: dados inválidos e senha errada viram erro com código', async () => {
    const manager = createRconManager({ timeout: 1000 });
    await assert.rejects(manager.connect(1, { host: '', port: 1, password: 'x' }, () => {}), { code: 'INVALID' });
    await assert.rejects(manager.connect(1, { host: '127.0.0.1', port: 70000, password: 'x' }, () => {}), { code: 'INVALID' });
    await assert.rejects(manager.connect(1, { host: '127.0.0.1', port: fake.port, password: 'errada' }, () => {}), { code: 'RCON', message: /Senha/ });
});
