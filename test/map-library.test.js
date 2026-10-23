const { test } = require('node:test');
const assert = require('node:assert');
const sc = require('../shared/scenarios');

// Cenário do pedido: dois mapas de mod (Gogland e Bakhmut), cada um com dependências, e um pacote
// de conteúdo (RHS) que os dois usam.
const GOG = 'A0A0A0A0A0A0A0A1', GOG_TERRAIN = 'A0A0A0A0A0A0A0A2';
const BAK = 'B0B0B0B0B0B0B0B1', BAK_TERRAIN = 'B0B0B0B0B0B0B0B2';
const RHS = 'C0C0C0C0C0C0C0C1', SAT = 'D0D0D0D0D0D0D0D1', USES_RHS = 'E0E0E0E0E0E0E0E1';
const dep = (id) => ({ id, name: id });
const mod = (modId, ...deps) => ({ modId, dependencies: deps.map(dep) });

const LIBRARY = [
    { modId: GOG, name: 'Gogland', mods: [{ modId: RHS, version: '1.0' }, { modId: GOG_TERRAIN }, { modId: GOG, version: '2.0' }], scenarios: [{ id: '{1111111111111111}Missions/Gog.conf', name: 'Gogland Conflict', playerCount: 64 }] },
    { modId: BAK, name: 'Bakhmut', mods: [{ modId: RHS }, { modId: BAK_TERRAIN }, { modId: BAK }], scenarios: [{ id: '{2222222222222222}Missions/Bak.conf', name: 'Bakhmut' }] },
];

test('normalizeMapLibrary: mapa sempre no conjunto (por último), shared só com mods do conjunto, sem repetidos', () => {
    const lib = sc.normalizeMapLibrary([
        { modId: GOG.toLowerCase(), name: 'Gogland', mods: [{ modId: GOG }, { modId: RHS }, { modId: 'ruim' }], shared: [RHS.toLowerCase(), SAT, GOG], scenarios: [{ id: 'ruim' }, { id: '{1111111111111111}Missions/Gog.conf', name: 'G', playerCount: 0 }] },
        { modId: GOG, name: 'repetido' },
        { modId: 'invalido' },
        null,
        { modId: BAK },
    ]);
    assert.strictEqual(lib.length, 2);
    assert.deepStrictEqual(lib[0].mods.map(m => m.modId), [RHS, GOG]);
    assert.deepStrictEqual(lib[0].shared, [RHS]); // SAT não está no conjunto; o próprio mapa nunca é "compartilhado"
    assert.deepStrictEqual(lib[0].scenarios, [{ id: '{1111111111111111}Missions/Gog.conf', name: 'G', gameMode: '', playerCount: null }]);
    assert.deepStrictEqual(lib[1].mods, [{ modId: BAK }]);
    assert.deepStrictEqual(sc.normalizeMapLibrary('lixo'), []);
});

test('upsertMapEntry substitui pelo modId, mantém o "manter sempre" do usuário e respeita o limite', () => {
    let lib = sc.upsertMapEntry([], { ...LIBRARY[0], shared: [RHS] });
    lib = sc.upsertMapEntry(lib, { modId: GOG, name: 'Gogland v3', mods: [{ modId: RHS }, { modId: GOG, version: '3.0' }] });
    assert.strictEqual(lib.length, 1);
    assert.strictEqual(lib[0].name, 'Gogland v3');
    assert.deepStrictEqual(lib[0].shared, [RHS]);
    lib = sc.upsertMapEntry(lib, { modId: GOG, mods: [{ modId: GOG }], shared: [] });
    assert.deepStrictEqual(lib[0].shared, []);
    assert.strictEqual(sc.upsertMapEntry(lib, { modId: 'ruim' }), null);
    let full = [];
    for (let i = 0; i < sc.MAX_LIBRARY; i++) full = sc.upsertMapEntry(full, { modId: i.toString(16).toUpperCase().padStart(16, '0') });
    assert.strictEqual(full.length, sc.MAX_LIBRARY);
    assert.strictEqual(sc.upsertMapEntry(full, { modId: GOG }), null);
    assert.strictEqual(sc.removeMapEntry(lib, GOG.toLowerCase()).length, 0);
    assert.strictEqual(sc.findMapEntry(LIBRARY, BAK.toLowerCase()).name, 'Bakhmut');
});

test('dependencyChain: dependências antes, em cadeia, sem repetir e sem travar em ciclo', () => {
    const mods = [mod(GOG, GOG_TERRAIN, RHS), mod(GOG_TERRAIN, RHS), { modId: RHS, name: 'RHS', dependencies: [] }];
    assert.deepStrictEqual(sc.dependencyChain(GOG, mods).map(m => m.modId), [RHS, GOG_TERRAIN, GOG]);
    assert.strictEqual(sc.dependencyChain(GOG, mods)[0].name, 'RHS');
    // Dependência sem dados entra sem as dela; ciclo não trava.
    assert.deepStrictEqual(sc.dependencyChain(BAK, [mod(BAK, BAK_TERRAIN)]).map(m => m.modId), [BAK_TERRAIN, BAK]);
    assert.deepStrictEqual(sc.dependencyChain(GOG, [mod(GOG, BAK), mod(BAK, GOG)]).map(m => m.modId), [BAK, GOG]);
    assert.deepStrictEqual(sc.dependencyChain('ruim', []), []);
});

test('trocar Gogland por Bakhmut tira o Gogland e o terreno dele, mantém o RHS que os dois usam', () => {
    const list = [mod(SAT), mod(RHS), mod(GOG_TERRAIN, RHS), mod(GOG, GOG_TERRAIN, RHS)];
    const plan = sc.planMapSwitch({ mods: list, library: LIBRARY, targetId: BAK });
    assert.deepStrictEqual(plan.remove, [GOG_TERRAIN, GOG]);
    assert.deepStrictEqual(plan.add.map(m => m.modId), [BAK_TERRAIN, BAK]);
    // E o caminho de volta traz o Gogland com a versão que estava salva.
    const after = [mod(SAT), mod(RHS), mod(BAK_TERRAIN, RHS), mod(BAK, BAK_TERRAIN, RHS)];
    const back = sc.planMapSwitch({ mods: after, library: LIBRARY, targetId: GOG });
    assert.deepStrictEqual(back.remove, [BAK_TERRAIN, BAK]);
    assert.deepStrictEqual(back.add, [{ modId: GOG_TERRAIN }, { modId: GOG, version: '2.0' }]);
});

test('missão do jogo base tira os mods de todos os mapas da biblioteca; mods fora da biblioteca ficam', () => {
    const list = [mod(SAT), mod(RHS), mod(GOG_TERRAIN, RHS), mod(GOG, GOG_TERRAIN), mod(BAK_TERRAIN, RHS), mod(BAK, BAK_TERRAIN)];
    const plan = sc.planMapSwitch({ mods: list, library: LIBRARY, targetId: null });
    assert.deepStrictEqual(plan.remove, [RHS, GOG_TERRAIN, GOG, BAK_TERRAIN, BAK]);
    assert.deepStrictEqual(plan.add, []);
});

test('mod de que um mod que fica depende não sai, e "manter sempre" também não', () => {
    const list = [mod(SAT), mod(USES_RHS, RHS), mod(RHS), mod(GOG_TERRAIN, RHS), mod(GOG, GOG_TERRAIN)];
    assert.deepStrictEqual(sc.planMapSwitch({ mods: list, library: LIBRARY, targetId: null }).remove, [GOG_TERRAIN, GOG]);
    const withShared = LIBRARY.map(e => (e.modId === GOG ? { ...e, shared: [RHS] } : e));
    const plain = [mod(SAT), mod(RHS), mod(GOG_TERRAIN, RHS), mod(GOG, GOG_TERRAIN)];
    assert.deepStrictEqual(sc.planMapSwitch({ mods: plain, library: withShared, targetId: null }).remove, [GOG_TERRAIN, GOG]);
    // A proteção é em cadeia: um mod que fica protege a dependência, que protege a dela.
    const chainList = [mod(USES_RHS, GOG_TERRAIN), mod(GOG_TERRAIN, RHS), mod(RHS), mod(GOG, GOG_TERRAIN)];
    assert.deepStrictEqual(sc.planMapSwitch({ mods: chainList, library: LIBRARY, targetId: null }).remove, [GOG]);
});

test('mapa novo que ainda não está na biblioteca: só o próprio mapa conta como alvo', () => {
    const list = [mod(GOG_TERRAIN), mod(GOG, GOG_TERRAIN)];
    const plan = sc.planMapSwitch({ mods: list, library: LIBRARY, targetId: 'F0F0F0F0F0F0F0F1' });
    assert.deepStrictEqual(plan.remove, [GOG_TERRAIN, GOG]);
    assert.deepStrictEqual(plan.add, []);
    // Biblioteca vazia: nada sai.
    assert.deepStrictEqual(sc.planMapSwitch({ mods: list, library: [], targetId: null }), { remove: [], add: [] });
});
