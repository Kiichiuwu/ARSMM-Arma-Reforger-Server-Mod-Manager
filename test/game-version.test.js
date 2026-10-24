const { test } = require('node:test');
const assert = require('node:assert');
const { parseMajorMinor, majorMinor, compareGameVersion, gameVersionForModVersion, compareModVersion } = require('../shared/game-version');

test('parseMajorMinor lê só major.minor e tolera prefixo "v" e lixo no fim', () => {
    assert.deepStrictEqual(parseMajorMinor('1.8.0.13'), [1, 8]);
    assert.deepStrictEqual(parseMajorMinor('v1.7.0.54 '), [1, 7]);
    assert.deepStrictEqual(parseMajorMinor('1.10'), [1, 10]);
    assert.strictEqual(majorMinor('1.8.0.13'), '1.8');
    for (const bad of ['', null, undefined, '1', 'abc', '1.x.3']) {
        assert.strictEqual(parseMajorMinor(bad), null, `deveria rejeitar ${bad}`);
        assert.strictEqual(majorMinor(bad), '');
    }
});

test('compareGameVersion compara só major.minor', () => {
    assert.strictEqual(compareGameVersion('1.8.0.13', '1.8.0.41'), 'same');
    assert.strictEqual(compareGameVersion('1.8.1.5', '1.8.0.13'), 'same');
    assert.strictEqual(compareGameVersion('1.9.0.1', '1.8.0.13'), 'newer');
    assert.strictEqual(compareGameVersion('2.0.0.1', '1.8.0.13'), 'newer');
    assert.strictEqual(compareGameVersion('1.7.0.54', '1.8.0.13'), 'older');
    assert.strictEqual(compareGameVersion('1.10.0.1', '1.8.0.13'), 'newer'); // 10 > 8, não comparação de texto
    assert.strictEqual(compareGameVersion('', '1.8.0.13'), 'unknown');
    assert.strictEqual(compareGameVersion('1.8.0.13', ''), 'unknown');
    assert.strictEqual(compareGameVersion(undefined, undefined), 'unknown');
});

test('gameVersionForModVersion usa a mais recente no auto update e a fixada quando listada', () => {
    const data = {
        version: '1.7.1', gameVersion: '1.7.0.54',
        versions: [{ version: '1.7.1', gameVersion: '1.7.0.54' }, { version: '1.6.5', gameVersion: '1.6.0.119' }],
    };
    assert.deepStrictEqual(gameVersionForModVersion(data, ''), { gameVersion: '1.7.0.54', listed: true });
    assert.deepStrictEqual(gameVersionForModVersion(data, '1.7.1'), { gameVersion: '1.7.0.54', listed: true });
    assert.deepStrictEqual(gameVersionForModVersion(data, '1.6.5'), { gameVersion: '1.6.0.119', listed: true });
    // Versão antiga, fora das 10 últimas: precisa do changelog.
    assert.deepStrictEqual(gameVersionForModVersion(data, '1.2.1'), { gameVersion: '', listed: false });
    assert.deepStrictEqual(gameVersionForModVersion({ version: '1.0.0' }, '1.0.0'), { gameVersion: '', listed: true });
    assert.deepStrictEqual(gameVersionForModVersion(null, ''), { gameVersion: '', listed: true });
});

test('compareModVersion ordena número por número e recusa o que não é numérico', () => {
    assert.strictEqual(compareModVersion('1.0.4', '1.0.3'), 1);
    assert.strictEqual(compareModVersion('1.0.3', '1.0.4'), -1); // cache velho: "mais recente" atrás da fixada
    assert.strictEqual(compareModVersion('1.0.10', '1.0.9'), 1); // 10 > 9, não comparação de texto
    assert.strictEqual(compareModVersion('0.16.5237', '0.16.5236'), 1);
    assert.strictEqual(compareModVersion('1.1', '1.1.0'), 0);
    assert.strictEqual(compareModVersion('v2.0.17', '2.0.17'), 0);
    assert.strictEqual(compareModVersion('1.2.0', '1.10.0'), -1);
    for (const bad of ['', null, undefined, '1.0.0-beta', 'abc', '1..2']) {
        assert.strictEqual(compareModVersion(bad, '1.0.0'), null, `deveria recusar ${bad}`);
        assert.strictEqual(compareModVersion('1.0.0', bad), null);
    }
});
