const { test } = require('node:test');
const assert = require('node:assert');
const dgram = require('dgram');
const { queryInfo, parseInfo } = require('../backend/a2s');
const { parsePlayersResponse } = require('../backend/rcon');

// Resposta A2S_INFO no formato que o Arma Reforger devolve (capturada de um servidor público).
function infoResponse({ name, map, players, maxPlayers, password }) {
    const str = (s) => Buffer.concat([Buffer.from(s, 'utf8'), Buffer.from([0])]);
    return Buffer.concat([
        Buffer.from([0xFF, 0xFF, 0xFF, 0xFF, 0x49, 0x00]),
        str(name), str(map), str(''), str('Arma Reforger'),
        Buffer.from([0x00, 0x00, players, maxPlayers, 0x00, 0x64, 0x77, password ? 1 : 0, 0x00]),
        str('1.8.0.13'),
        Buffer.from('a14571000000000000000000', 'hex'),
    ]);
}

// Servidor A2S falso: exige o desafio (0x41) antes de responder, como os servidores reais.
function fakeA2sServer(info) {
    const socket = dgram.createSocket('udp4');
    const challenge = Buffer.from([0x12, 0x34, 0x56, 0x78]);
    socket.on('message', (msg, rinfo) => {
        if (msg[4] !== 0x54) return;
        const reply = msg.length >= 29 && msg.subarray(msg.length - 4).equals(challenge)
            ? infoResponse(info)
            : Buffer.concat([Buffer.from([0xFF, 0xFF, 0xFF, 0xFF, 0x41]), challenge]);
        socket.send(reply, rinfo.port, rinfo.address);
    });
    return new Promise(resolve => socket.bind(0, '127.0.0.1', () => resolve(socket)));
}

test('A2S: responde ao desafio e lê nome, cenário, jogadores, versão e senha', async () => {
    const server = await fakeA2sServer({ name: '[BR] Türk Topluluğu | Teste', map: 'Everon', players: 37, maxPlayers: 128, password: true });
    try {
        const info = await queryInfo('127.0.0.1', server.address().port);
        assert.strictEqual(info.name, '[BR] Türk Topluluğu | Teste');
        assert.strictEqual(info.map, 'Everon');
        assert.strictEqual(info.game, 'Arma Reforger');
        assert.strictEqual(info.players, 37);
        assert.strictEqual(info.maxPlayers, 128);
        assert.strictEqual(info.password, true);
        assert.strictEqual(info.version, '1.8.0.13');
        assert.ok(info.ping >= 0);
    } finally {
        server.close();
    }
});

test('A2S: servidor que não responde vira UNREACHABLE', async () => {
    const silent = dgram.createSocket('udp4');
    await new Promise(resolve => silent.bind(0, '127.0.0.1', resolve));
    try {
        await assert.rejects(queryInfo('127.0.0.1', silent.address().port, { timeout: 300 }), { code: 'UNREACHABLE' });
    } finally {
        silent.close();
    }
});

test('A2S: endereço e porta inválidos são recusados antes de enviar', async () => {
    await assert.rejects(queryInfo('', 17777), { code: 'INVALID' });
    await assert.rejects(queryInfo('127.0.0.1', 0), { code: 'INVALID' });
    await assert.rejects(queryInfo('127.0.0.1', 70000), { code: 'INVALID' });
    await assert.rejects(queryInfo('host-que-nao-existe.invalid', 17777, { timeout: 3000 }), { code: 'UNREACHABLE' });
});

test('A2S: resposta truncada gera erro em vez de exceção', () => {
    const full = infoResponse({ name: 'X', map: 'Y', players: 1, maxPlayers: 2, password: false });
    assert.throws(() => parseInfo(full.subarray(4, 12)), /truncada/);
});

test('#players: reconhece número, UID e nome em formatos comuns e guarda o resto', () => {
    const text = [
        'Players on server:',
        '0 ; 2a5f7c9e-1b2d-4c3e-8f9a-0b1c2d3e4f5a ; Fulano da Silva',
        '1: 3b6e8d0f-2c3e-4d4f-9a0b-1c2d3e4f5a6b Ciclano',
        '2 Beltrano [BR]',
        '(3 players in total)',
        '3 players listed',
    ].join('\n');
    const { players, unparsed } = parsePlayersResponse(text);
    assert.deepStrictEqual(players, [
        { id: '0', uid: '2a5f7c9e-1b2d-4c3e-8f9a-0b1c2d3e4f5a', name: 'Fulano da Silva' },
        { id: '1', uid: '3b6e8d0f-2c3e-4d4f-9a0b-1c2d3e4f5a6b', name: 'Ciclano' },
        { id: '2', uid: '', name: 'Beltrano [BR]' },
    ]);
    assert.deepStrictEqual(unparsed, ['Players on server:', '(3 players in total)', '3 players listed']);
});
