const { test } = require('node:test');
const assert = require('node:assert');
const sc = require('../shared/scenarios');

const KUNAR = {
    modId: '99cf50a0ac924ad7', name: '', workshopName: 'Conflict PvE - Kunar Province', status: 'ok',
    scenarios: [
        { id: '{F502397D68F3D1AC}Missions/Conflict_PvE_Kunar.conf', name: 'Conflict PvE - Kunar Province (RHS)', gameMode: 'Conflict PvE', playerCount: 64, description: 'Co-op na Kunar.', image: 'https://ar-gcp-cdn.bistudio.com/image/a.jpg' },
        { id: 'invalido.conf', name: 'x' },
    ],
};
const VDD = {
    modId: '6AA13E82D86C62BF', name: 'Meu nome para VDD', workshopName: 'Mongo PvE VDD Conflict',
    scenarios: [{ id: '{9BA7071BACE76386}Missions/VDD_2_PvE_Conflict.conf', name: 'PvE Vin Drin Dop', gameMode: '#AR-Scenario_GameMode_Campaign PVE', playerCount: 128, description: '#AR-Campaign_HQC_GamemodeDesc', image: 'http://inseguro/x.jpg' }],
};

test('catálogo do jogo base: IDs únicos e válidos, mapas e modos conhecidos, nomes nas duas línguas', () => {
    const ids = new Set();
    const modes = new Set(['conflict', 'conflict-hqc', 'gamemaster', 'combatops', 'captureandhold', 'singleplayer', 'test']);
    for (const e of sc.BASE_GAME) {
        assert.ok(sc.isValidScenarioId(e.id), e.id);
        assert.strictEqual(e.id, sc.normalizeScenarioId(e.id), `GUID em maiúsculas: ${e.id}`);
        assert.ok(!ids.has(e.id.toLowerCase()), `ID repetido: ${e.id}`);
        ids.add(e.id.toLowerCase());
        assert.ok(sc.MAPS.includes(e.map), e.map);
        assert.ok(modes.has(e.mode), e.mode);
        assert.ok(e.players === null || (Number.isInteger(e.players) && e.players > 0));
        assert.ok(e.name['pt-BR'] && e.name['en-US']);
    }
    assert.strictEqual(sc.BASE_GAME.length, 37);
    // Missões principais conferidas nos dados do jogo instalado.
    const byFile = (f) => sc.BASE_GAME.find(e => e.id.endsWith(`/${f}`));
    assert.strictEqual(byFile('23_Campaign.conf').id, '{ECC61978EDCC2B5A}Missions/23_Campaign.conf');
    assert.strictEqual(byFile('23_Campaign_Arland.conf').id, '{C41618FD18E9D714}Missions/23_Campaign_Arland.conf');
    assert.strictEqual(byFile('23_Campaign_Cain.conf').map, 'kolguyev');
    assert.strictEqual(byFile('23_Campaign_Montignac.conf').players, 48);
    // Os IDs que a versão anterior usava como padrão não existem no jogo.
    assert.ok(!byFile('23_Campaign_North.conf'));
    assert.ok(!byFile('17_Campaign_Arland.conf'));
});

test('isValidScenarioId, normalizeScenarioId, sameScenarioId e scenarioFileName', () => {
    assert.ok(sc.isValidScenarioId('{ECC61978EDCC2B5A}Missions/23_Campaign.conf'));
    assert.ok(sc.isValidScenarioId('{ecc61978edcc2b5a}Missions/CAH_Factory - FIA.conf'));
    for (const bad of ['', null, 42, 'Missions/23_Campaign.conf', '{ECC61978EDCC2B5}Missions/x.conf', '{ECC61978EDCC2B5A}Missions/x.ent', '{ECC61978EDCC2B5A}Missions/"x.conf', '{ECC61978EDCC2B5A}{X}.conf', 'x'.repeat(400) + '.conf']) {
        assert.strictEqual(sc.isValidScenarioId(bad), false, `deveria rejeitar ${bad}`);
    }
    assert.strictEqual(sc.normalizeScenarioId(' {ecc61978edcc2b5a}Missions/23_Campaign.conf '), '{ECC61978EDCC2B5A}Missions/23_Campaign.conf');
    assert.strictEqual(sc.normalizeScenarioId('lixo'), 'lixo');
    assert.ok(sc.sameScenarioId('{ecc61978edcc2b5a}missions/23_campaign.conf', '{ECC61978EDCC2B5A}Missions/23_Campaign.conf'));
    assert.ok(!sc.sameScenarioId('', ''));
    assert.ok(!sc.sameScenarioId('{ECC61978EDCC2B5A}Missions/23_Campaign.conf', '{ECC61978EDCC2B5B}Missions/23_Campaign.conf'));
    assert.strictEqual(sc.scenarioFileName('{83D06A42096F671C}Missions/MpTest/10_MpTest.conf'), '10_MpTest.conf');
});

test('resolveText troca chaves conhecidas, deixa as desconhecidas legíveis e pode descartá-las', () => {
    assert.strictEqual(sc.resolveText('#AR-Scenario_GameMode_Campaign PVE', 'pt-BR'), 'Campanha PVE');
    assert.strictEqual(sc.resolveText('#AR-Scenario_GameMode_Campaign PVE', 'en-US'), 'Campaign PVE');
    assert.strictEqual(sc.resolveText('#AR-Algo_Desconhecido', 'pt-BR'), 'Algo Desconhecido');
    assert.strictEqual(sc.resolveText('#AR-Campaign_HQC_GamemodeDesc', 'pt-BR', { dropUnknown: true }), '');
    assert.strictEqual(sc.resolveText('Texto normal', 'pt-BR', { dropUnknown: true }), 'Texto normal');
    assert.strictEqual(sc.resolveText(null, 'pt-BR'), '');
});

test('buildScenarioIndex junta jogo base e mods, descarta inválidos e respeita nome do usuário', () => {
    const index = sc.buildScenarioIndex([KUNAR, VDD], 'pt-BR');
    assert.strictEqual(index.length, 37 + 2);
    const kunar = sc.findScenario(index, '{f502397d68f3d1ac}Missions/Conflict_PvE_Kunar.conf');
    assert.deepStrictEqual(kunar.source, { type: 'mod', modId: '99CF50A0AC924AD7', modName: 'Conflict PvE - Kunar Province' });
    assert.strictEqual(kunar.group, 'mod:99CF50A0AC924AD7');
    assert.strictEqual(kunar.players, 64);
    assert.strictEqual(kunar.image, 'https://ar-gcp-cdn.bistudio.com/image/a.jpg');
    const vdd = sc.findScenario(index, '{9BA7071BACE76386}Missions/VDD_2_PvE_Conflict.conf');
    assert.strictEqual(vdd.source.modName, 'Meu nome para VDD');
    assert.strictEqual(vdd.modeLabel, 'Campanha PVE');
    assert.strictEqual(vdd.description, ''); // chave de tradução desconhecida não vira descrição
    assert.strictEqual(vdd.image, ''); // só https
    const everon = sc.findScenario(index, '{ECC61978EDCC2B5A}Missions/23_Campaign.conf');
    assert.deepStrictEqual([everon.name, everon.group, everon.source.type], ['Conflict - Everon', 'everon', 'game']);
    assert.strictEqual(sc.findScenario(index, ''), null);
    assert.strictEqual(sc.findScenario(index, '{0000000000000000}Missions/Nada.conf'), null);
    assert.strictEqual(sc.buildScenarioIndex(null, 'en-US').length, 37);
    assert.strictEqual(sc.buildScenarioIndex([], 'en-US')[0].name, 'Conflict - Everon');
});

test('missão de mod com o mesmo ID de uma do jogo base substitui a do jogo base', () => {
    const override = { modId: 'AAAAAAAAAAAAAAAA', workshopName: 'Override', scenarios: [{ id: '{ecc61978edcc2b5a}Missions/23_Campaign.conf', name: 'Everon modificado' }] };
    const index = sc.buildScenarioIndex([override, override], 'pt-BR');
    const matches = index.filter(s => sc.sameScenarioId(s.id, '{ECC61978EDCC2B5A}Missions/23_Campaign.conf'));
    assert.strictEqual(matches.length, 1);
    assert.strictEqual(matches[0].source.type, 'mod');
    assert.strictEqual(index.length, 37);
});

test('searchScenarios: várias palavras, sem acento, por mapa, arquivo, modo e mod', () => {
    const index = sc.buildScenarioIndex([KUNAR], 'pt-BR');
    const names = (term) => sc.searchScenarios(index, term).map(s => s.name);
    assert.deepStrictEqual(names('kunar'), ['Conflict PvE - Kunar Province (RHS)']);
    assert.ok(names('fabrica almara').includes('Capture & Hold - Fábrica Almara'));
    assert.deepStrictEqual(names('kolguyev game master'), ['Game Master - Kolguyev']);
    assert.deepStrictEqual(names('CombatOpsCain.conf'), ['Combat Ops - Kolguyev']);
    assert.strictEqual(names('').length, index.length);
    assert.deepStrictEqual(names('nada-disso-existe'), []);
});

test('histórico: mais recente primeiro, sem repetir, com limite e só IDs válidos', () => {
    let recent = [];
    for (let i = 0; i < 10; i++) recent = sc.pushRecent(recent, { id: `{${String(i).padStart(16, '0')}}Missions/M${i}.conf`, name: `M${i}` });
    assert.strictEqual(recent.length, sc.MAX_RECENT);
    assert.strictEqual(recent[0].name, 'M9');
    recent = sc.pushRecent(recent, { id: '{0000000000000005}missions/m5.conf', name: 'M5 de novo' });
    assert.strictEqual(recent[0].name, 'M5 de novo');
    assert.strictEqual(recent.filter(r => /M5/i.test(r.name)).length, 1);
    const withMod = sc.pushRecent([], { id: '{F502397D68F3D1AC}Missions/Conflict_PvE_Kunar.conf', name: 'Kunar', modId: '99cf50a0ac924ad7', modName: 'Kunar PvE' });
    assert.deepStrictEqual(withMod[0], { id: '{F502397D68F3D1AC}Missions/Conflict_PvE_Kunar.conf', name: 'Kunar', modId: '99CF50A0AC924AD7', modName: 'Kunar PvE' });
    assert.deepStrictEqual(sc.normalizeRecent([null, 'x', { id: 'ruim' }, { id: '{ECC61978EDCC2B5A}Missions/23_Campaign.conf', modId: 'naoehex' }]),
        [{ id: '{ECC61978EDCC2B5A}Missions/23_Campaign.conf', name: '' }]);
    assert.deepStrictEqual(sc.normalizeRecent('lixo'), []);
});

test('predefinições: normaliza, substitui pelo nome, respeita limite e remove', () => {
    const mods = [{ modId: '99cf50a0ac924ad7', name: 'Kunar', version: '1.0.0', extra: 1 }, { modId: '99CF50A0AC924AD7' }, { modId: 'ruim' }, { modId: '5AAAC70D754245DD', version: '' }];
    let presets = sc.upsertPreset([], { name: '  Kunar   com RHS ', scenarioId: '{f502397d68f3d1ac}Missions/Conflict_PvE_Kunar.conf', scenarioName: 'Kunar', mods });
    assert.deepStrictEqual(presets, [{
        name: 'Kunar com RHS', scenarioId: '{F502397D68F3D1AC}Missions/Conflict_PvE_Kunar.conf', scenarioName: 'Kunar',
        mods: [{ modId: '99CF50A0AC924AD7', name: 'Kunar', version: '1.0.0', extra: 1 }, { modId: '5AAAC70D754245DD' }],
    }]);
    presets = sc.upsertPreset(presets, { name: 'KUNAR COM RHS', scenarioId: '{ECC61978EDCC2B5A}Missions/23_Campaign.conf', mods: [] });
    assert.strictEqual(presets.length, 1);
    assert.strictEqual(presets[0].scenarioId, '{ECC61978EDCC2B5A}Missions/23_Campaign.conf');
    assert.strictEqual(sc.upsertPreset(presets, { name: '', scenarioId: '{ECC61978EDCC2B5A}Missions/23_Campaign.conf' }), null);
    assert.strictEqual(sc.upsertPreset(presets, { name: 'x', scenarioId: 'invalido' }), null);

    let many = [];
    for (let i = 0; i < sc.MAX_PRESETS; i++) many = sc.upsertPreset(many, { name: `P${i}`, scenarioId: '{ECC61978EDCC2B5A}Missions/23_Campaign.conf', mods: [] });
    assert.strictEqual(many.length, sc.MAX_PRESETS);
    assert.strictEqual(sc.upsertPreset(many, { name: 'mais uma', scenarioId: '{ECC61978EDCC2B5A}Missions/23_Campaign.conf' }), null);
    assert.strictEqual(sc.upsertPreset(many, { name: 'p0', scenarioId: '{C41618FD18E9D714}Missions/23_Campaign_Arland.conf' }).length, sc.MAX_PRESETS);

    assert.deepStrictEqual(sc.removePreset(presets, ' kunar com rhs '), []);
    assert.deepStrictEqual(sc.normalizePresets([{ name: 'a', scenarioId: '{ECC61978EDCC2B5A}Missions/23_Campaign.conf' }, { name: 'A', scenarioId: '{ECC61978EDCC2B5A}Missions/23_Campaign.conf' }]).length, 1);
    assert.deepStrictEqual(sc.normalizePresets(null), []);
    assert.strictEqual(sc.normalizePresets([{ name: 'x'.repeat(200), scenarioId: '{ECC61978EDCC2B5A}Missions/23_Campaign.conf' }])[0].name.length, 60);
});

test('diffPresetMods conta adicionados, removidos e versões diferentes', () => {
    const current = [{ modId: 'AAAAAAAAAAAAAAAA', version: '1.0' }, { modId: 'bbbbbbbbbbbbbbbb' }, { modId: 'CCCCCCCCCCCCCCCC', version: '2.0' }];
    const preset = [{ modId: 'AAAAAAAAAAAAAAAA', version: '1.1' }, { modId: 'BBBBBBBBBBBBBBBB' }, { modId: 'DDDDDDDDDDDDDDDD' }];
    assert.deepStrictEqual(sc.diffPresetMods(current, preset), { added: ['DDDDDDDDDDDDDDDD'], removed: ['CCCCCCCCCCCCCCCC'], changed: ['AAAAAAAAAAAAAAAA'] });
    assert.deepStrictEqual(sc.diffPresetMods([], []), { added: [], removed: [], changed: [] });
});
