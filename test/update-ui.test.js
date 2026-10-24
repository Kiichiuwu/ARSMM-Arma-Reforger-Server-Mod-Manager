const { test } = require('node:test');
const assert = require('node:assert');
const ui = require('../shared/update-ui');

test('describe: aviso com botão só quando há o que fazer (atualizar ou reiniciar)', () => {
    const available = ui.describe({ state: 'available', latest: { behind: 3, subject: 'Corrige o monitor' } }, 'pt-BR');
    assert.strictEqual(available.banner.action, 'apply');
    assert.match(available.banner.text, /3 alteração\(ões\): Corrige o monitor/);
    assert.strictEqual(ui.describe({ state: 'available', latest: { version: '1.1.0' } }, 'en-US').banner.text, 'New ARSMM version available (v1.1.0)');
    const ready = ui.describe({ state: 'ready', needsInstall: true }, 'pt-BR');
    assert.deepStrictEqual([ready.banner.action, ready.banner.button], ['restart', 'REINICIAR AGORA']);
    assert.match(ready.banner.text, /dependências/);
    assert.strictEqual(ui.describe({ state: 'downloading', progress: 42 }, 'pt-BR').banner.action, null);
    for (const state of ['checking', 'up-to-date', 'error', 'unsupported', 'idle']) {
        assert.strictEqual(ui.describe({ state }, 'pt-BR').banner, null, state);
    }
});

test('describe: motivos de pausa e erro aparecem na linha de estado, nas duas línguas', () => {
    assert.match(ui.describe({ state: 'blocked', reason: 'branch', branch: 'feat/x' }, 'pt-BR').line, /branch "feat\/x"/);
    assert.match(ui.describe({ state: 'blocked', reason: 'dirty' }, 'en-US').line, /local changes/);
    assert.match(ui.describe({ state: 'blocked', reason: 'no-release' }, 'pt-BR').line, /Nenhuma versão publicada/);
    assert.strictEqual(ui.describe({ state: 'error', error: 'sem rede' }, 'pt-BR').line, 'Não deu para verificar: sem rede');
    assert.strictEqual(ui.describe({ state: 'up-to-date' }, 'xx').line, 'Você está na versão mais recente.', 'língua desconhecida cai no português');
});

test('versionText junta versão e commit curto', () => {
    assert.strictEqual(ui.versionText({ current: { version: '1.0.0', commit: 'abcdef1234567' } }), 'v1.0.0 · abcdef1');
    assert.strictEqual(ui.versionText({ current: { version: '1.1.0' } }), 'v1.1.0');
    assert.strictEqual(ui.versionText(null), '');
});

test('as duas línguas têm as mesmas chaves', () => {
    assert.deepStrictEqual(Object.keys(ui.STRINGS['en-US']).sort(), Object.keys(ui.STRINGS['pt-BR']).sort());
});
