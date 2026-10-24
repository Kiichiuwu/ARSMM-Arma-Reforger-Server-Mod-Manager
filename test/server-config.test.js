const { test } = require('node:test');
const assert = require('node:assert');
const sc = require('../shared/server-config');

const fixed = () => 'SenhaFixa123';

test('config sem rcon e sem a2s ganha os dois com os padrões', () => {
    const input = { bindPort: 2001, publicPort: 2001, game: { name: 'X' } };
    const { config, changes } = sc.ensureServerBlocks(input, { generatePassword: fixed });
    assert.deepStrictEqual(config.a2s, { address: '0.0.0.0', port: 17777 });
    assert.deepStrictEqual(config.rcon, { address: '0.0.0.0', port: 19999, password: 'SenhaFixa123', permission: 'admin' });
    assert.deepStrictEqual(changes.map(c => `${c.block}.${c.field}`), ['a2s.block', 'rcon.block']);
    assert.ok(!('a2s' in input) && !('rcon' in input), 'não mexe no objeto recebido');
    assert.strictEqual(config.game.name, 'X');
});

test('RCON novo usa a senha pedida (ex.: a de admin) só se ela for válida para o RCON', () => {
    assert.strictEqual(sc.ensureServerBlocks({}, { rconPassword: 'Admin123', generatePassword: fixed }).config.rcon.password, 'Admin123');
    for (const bad of ['', 'ab', 'tem espaço', null, 42]) {
        assert.strictEqual(sc.ensureServerBlocks({}, { rconPassword: bad, generatePassword: fixed }).config.rcon.password, 'SenhaFixa123', String(bad));
    }
    const generated = sc.ensureServerBlocks({}).config.rcon.password;
    assert.ok(sc.isValidRconPassword(generated) && generated.length === 16);
});

test('portas novas não batem com as do jogo nem entre si', () => {
    const { config } = sc.ensureServerBlocks({ bindPort: 17777, publicPort: 19999, rcon: { address: '0.0.0.0', port: 17778, password: 'abc', permission: 'admin' } }, { generatePassword: fixed });
    assert.strictEqual(config.a2s.port, 17779); // 17777 é do jogo e 17778 é do RCON
    assert.strictEqual(config.rcon.port, 17778);
    const both = sc.ensureServerBlocks({ bindPort: 19999 }, { generatePassword: fixed }).config;
    assert.deepStrictEqual([both.a2s.port, both.rcon.port], [17777, 20000]);
});

test('blocos válidos ficam como estão, inclusive campos extras', () => {
    const input = {
        a2s: { address: '0.0.0.0', port: 26909 },
        rcon: { address: '127.0.0.1', port: 19999, password: 'abc', permission: 'monitor', maxClients: 4, blacklist: ['#shutdown'] },
    };
    const { config, changes } = sc.ensureServerBlocks(input, { generatePassword: fixed });
    assert.deepStrictEqual(config, input);
    assert.deepStrictEqual(changes, []);
});

test('corrige o que o servidor rejeitaria: endereço com zero à esquerda, porta e senha inválidas, permissão', () => {
    const { config, changes } = sc.ensureServerBlocks({
        a2s: { port: 0 },
        rcon: { address: '45.146.81.00', port: 'x', password: 'com espaço', permission: 'root' },
    }, { generatePassword: fixed, rconPassword: 'Admin123' });
    assert.deepStrictEqual(config.a2s, { port: 17777, address: '0.0.0.0' });
    assert.deepStrictEqual(config.rcon, { address: '0.0.0.0', port: 19999, password: 'Admin123', permission: 'admin' });
    assert.deepStrictEqual(changes.map(c => `${c.block}.${c.field}`), ['a2s.address', 'a2s.port', 'rcon.address', 'rcon.port', 'rcon.password', 'rcon.permission']);
    assert.strictEqual(changes.find(c => c.field === 'password').to, null, 'a senha não aparece na lista de mudanças');
    assert.strictEqual(changes.find(c => c.block === 'rcon' && c.field === 'address').from, '45.146.81.00');
});

test('dá para não criar um dos blocos (RCON removido de propósito pelo usuário)', () => {
    const { config, changes } = sc.ensureServerBlocks({}, { rcon: false });
    assert.ok(!('rcon' in config));
    assert.deepStrictEqual(config.a2s, { address: '0.0.0.0', port: 17777 });
    assert.deepStrictEqual(changes.map(c => c.block), ['a2s']);
    // Com rcon: false, um bloco rcon que já existe também não é tocado.
    const kept = sc.ensureServerBlocks({ rcon: { address: 'lixo' } }, { rcon: false }).config;
    assert.deepStrictEqual(kept.rcon, { address: 'lixo' });
});

test('validações aceitam só IPv4 bem escrito e porta inteira 1..65535', () => {
    for (const ok of ['0.0.0.0', '127.0.0.1', '45.146.81.11', ' 10.0.0.5 ']) assert.ok(sc.isValidAddress(ok), ok);
    for (const bad of ['45.146.81.00', '256.1.1.1', '1.2.3', 'localhost', '', null, '::1']) assert.ok(!sc.isValidAddress(bad), String(bad));
    for (const ok of [1, 2001, 65535]) assert.ok(sc.isValidPort(ok));
    for (const bad of [0, 65536, '2001', 20.5, null]) assert.ok(!sc.isValidPort(bad), String(bad));
    assert.deepStrictEqual(sc.ensureServerBlocks(null, { generatePassword: fixed }).changes.length, 2);
});
