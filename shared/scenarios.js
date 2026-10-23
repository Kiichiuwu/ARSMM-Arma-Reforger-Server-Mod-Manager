// scenarios.js - Mapas e missões (cenários): catálogo do jogo base, missões dos mods, busca, histórico e
// predefinições (missão + lista de mods). Usado pela interface e pelos testes.
//
// O catálogo do jogo base foi extraído dos dados do Arma Reforger instalado (addons/data, outubro de 2026):
// GUID e caminho do resourceDatabase.rdb, jogadores do cabeçalho de cada Missions/*.conf, terreno seguindo a
// cadeia de SubScene do mundo da missão até Eden.ent (Everon), Arland.ent ou Cain.ent (Kolguyev), e nomes das
// tabelas de tradução do próprio jogo. Variantes com o mesmo nome oficial ganham o sufixo do nome do arquivo.
(function (root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory();
    else root.ARSMM_SCENARIOS = factory();
})(typeof self !== 'undefined' ? self : this, function () {
    const SCENARIO_ID_RE = /^\{[0-9A-Fa-f]{16}\}[^"\\\r\n{}]+\.conf$/;
    const MAX_RECENT = 6;
    const MAX_PRESETS = 30;
    const MAX_PRESET_NAME = 60;
    const MAX_PRESET_MODS = 500;
    const MAX_LIBRARY = 50;
    const MAX_LIBRARY_SCENARIOS = 50;
    const MOD_ID_RE = /^[0-9A-F]{16}$/;

    // map = terreno onde a missão roda. group = aba do seletor: o terreno, ou "other" para missões de um
    // jogador e de teste (ficam separadas para não poluir as listas de servidor).
    const MAPS = ['everon', 'arland', 'kolguyev', 'other'];
    const GROUPS = ['everon', 'arland', 'kolguyev', 'other'];

    const MAP_LABELS = {
        everon: { 'pt-BR': 'Everon', 'en-US': 'Everon' },
        arland: { 'pt-BR': 'Arland', 'en-US': 'Arland' },
        kolguyev: { 'pt-BR': 'Kolguyev', 'en-US': 'Kolguyev' },
        other: { 'pt-BR': 'Mundo de teste', 'en-US': 'Test world' },
    };
    const GROUP_LABELS = { ...MAP_LABELS, other: { 'pt-BR': 'Um jogador e testes', 'en-US': 'Singleplayer and tests' } };
    const MODE_LABELS = {
        conflict: { 'pt-BR': 'Conflict', 'en-US': 'Conflict' },
        'conflict-hqc': { 'pt-BR': 'Conflict: Comandante do QG', 'en-US': 'Conflict: HQ Commander' },
        gamemaster: { 'pt-BR': 'Game Master', 'en-US': 'Game Master' },
        combatops: { 'pt-BR': 'Combat Ops', 'en-US': 'Combat Ops' },
        captureandhold: { 'pt-BR': 'Capture & Hold', 'en-US': 'Capture & Hold' },
        singleplayer: { 'pt-BR': 'Um jogador', 'en-US': 'Singleplayer' },
        test: { 'pt-BR': 'Teste', 'en-US': 'Test' },
    };

    const BASE_GAME = [
        // Everon
        { id: '{ECC61978EDCC2B5A}Missions/23_Campaign.conf', map: 'everon', mode: 'conflict', players: 64, name: { 'pt-BR': 'Conflict - Everon', 'en-US': 'Conflict - Everon' } },
        { id: '{C700DB41F0C546E1}Missions/23_Campaign_NorthCentral.conf', map: 'everon', mode: 'conflict', players: 64, name: { 'pt-BR': 'Conflict - Norte de Everon', 'en-US': 'Conflict - Northern Everon' } },
        { id: '{28802845ADA64D52}Missions/23_Campaign_SWCoast.conf', map: 'everon', mode: 'conflict', players: 64, name: { 'pt-BR': 'Conflict - Sul de Everon', 'en-US': 'Conflict - Southern Everon' } },
        { id: '{94992A3D7CE4FF8A}Missions/23_Campaign_Western.conf', map: 'everon', mode: 'conflict', players: 48, name: { 'pt-BR': 'Conflict - Oeste de Everon', 'en-US': 'Conflict - Western Everon' } },
        { id: '{FDE33AFE2ED7875B}Missions/23_Campaign_Montignac.conf', map: 'everon', mode: 'conflict', players: 48, name: { 'pt-BR': 'Conflict - Montignac', 'en-US': 'Conflict - Montignac' } },
        { id: '{98D1DA94DD085044}Missions/ConflictWithoutAIs.conf', map: 'everon', mode: 'conflict', players: 64, name: { 'pt-BR': 'Conflict (sem IA)', 'en-US': 'Conflict (without AI)' } },
        { id: '{8C8EDD6FAE093FFF}Missions/Conflict_East.conf', map: 'everon', mode: 'conflict', players: 40, name: { 'pt-BR': 'Conflict (Leste)', 'en-US': 'Conflict (East)' } },
        { id: '{23FD7E11B1EEED40}Missions/Conflict_West.conf', map: 'everon', mode: 'conflict', players: 40, name: { 'pt-BR': 'Conflict (Oeste)', 'en-US': 'Conflict (West)' } },
        { id: '{0220741028718E7F}Missions/23_Campaign_HQC_Everon.conf', map: 'everon', mode: 'conflict-hqc', players: 64, name: { 'pt-BR': 'Conflict: Comandante do QG - Everon', 'en-US': 'Conflict: HQ Commander - Everon' } },
        { id: '{59AD59368755F41A}Missions/21_GM_Eden.conf', map: 'everon', mode: 'gamemaster', players: 64, name: { 'pt-BR': 'Game Master - Everon', 'en-US': 'Game Master - Everon' } },
        { id: '{DFAC5FABD11F2390}Missions/26_CombatOpsEveron.conf', map: 'everon', mode: 'combatops', players: 8, name: { 'pt-BR': 'Combat Ops - Everon', 'en-US': 'Combat Ops - Everon' } },
        // Arland
        { id: '{C41618FD18E9D714}Missions/23_Campaign_Arland.conf', map: 'arland', mode: 'conflict', players: 64, name: { 'pt-BR': 'Conflict - Arland', 'en-US': 'Conflict - Arland' } },
        { id: '{68D1240A11492545}Missions/23_Campaign_HQC_Arland.conf', map: 'arland', mode: 'conflict-hqc', players: 64, name: { 'pt-BR': 'Conflict: Comandante do QG - Arland', 'en-US': 'Conflict: HQ Commander - Arland' } },
        { id: '{2BBBE828037C6F4B}Missions/22_GM_Arland.conf', map: 'arland', mode: 'gamemaster', players: 64, name: { 'pt-BR': 'Game Master - Arland', 'en-US': 'Game Master - Arland' } },
        { id: '{DAA03C6E6099D50F}Missions/24_CombatOps.conf', map: 'arland', mode: 'combatops', players: 6, name: { 'pt-BR': 'Combat Ops - Arland', 'en-US': 'Combat Ops - Arland' } },
        // Kolguyev (Cain nos arquivos do jogo)
        { id: '{9C6054B42A044DEC}Missions/23_Campaign_Cain.conf', map: 'kolguyev', mode: 'conflict', players: 64, name: { 'pt-BR': 'Conflict - Kolguyev', 'en-US': 'Conflict - Kolguyev' } },
        { id: '{BB5345C22DD2B655}Missions/23_Campaign_HQC_Cain.conf', map: 'kolguyev', mode: 'conflict-hqc', players: 64, name: { 'pt-BR': 'Conflict: Comandante do QG - Kolguyev', 'en-US': 'Conflict: HQ Commander - Kolguyev' } },
        { id: '{F45C6C15D31252E6}Missions/27_GM_Cain.conf', map: 'kolguyev', mode: 'gamemaster', players: 64, name: { 'pt-BR': 'Game Master - Kolguyev', 'en-US': 'Game Master - Kolguyev' } },
        { id: '{CB347F2F10065C9C}Missions/CombatOpsCain.conf', map: 'kolguyev', mode: 'combatops', players: 12, name: { 'pt-BR': 'Combat Ops - Kolguyev', 'en-US': 'Combat Ops - Kolguyev' } },
        // Capture & Hold: cada mundo é subcena de CAH_BaseWorld.ent, que é subcena de Eden.ent (Everon)
        { id: '{3F2E005F43DBD2F8}Missions/CAH_Briars_Coast.conf', map: 'everon', mode: 'captureandhold', players: 64, name: { 'pt-BR': 'Capture & Hold - Os Espinheiros', 'en-US': 'Capture & Hold - Briars' } },
        { id: '{F1A1BEA67132113E}Missions/CAH_Castle.conf', map: 'everon', mode: 'captureandhold', players: 24, name: { 'pt-BR': 'Capture & Hold - Castelo de Montfort', 'en-US': 'Capture & Hold - Montfort Castle' } },
        { id: '{589945FB9FA7B97D}Missions/CAH_Concrete_Plant.conf', map: 'everon', mode: 'captureandhold', players: 24, name: { 'pt-BR': 'Capture & Hold - Usina de Concreto', 'en-US': 'Capture & Hold - Concrete Plant' } },
        { id: '{9405201CBD22A30C}Missions/CAH_Factory.conf', map: 'everon', mode: 'captureandhold', players: 24, name: { 'pt-BR': 'Capture & Hold - Fábrica Almara', 'en-US': 'Capture & Hold - Almara Factory' } },
        { id: '{465564323DED44EC}Missions/CAH_Factory - FIA.conf', map: 'everon', mode: 'captureandhold', players: 24, name: { 'pt-BR': 'Capture & Hold - Fábrica Almara (FIA)', 'en-US': 'Capture & Hold - Almara Factory (FIA)' } },
        { id: '{1CD06B409C6FAE56}Missions/CAH_Forest.conf', map: 'everon', mode: 'captureandhold', players: 32, name: { 'pt-BR': 'Capture & Hold - Bosque de Simon', 'en-US': "Capture & Hold - Simon's Wood" } },
        { id: '{654ADBC0BBB7DFBF}Missions/CAH_Forest - FIA.conf', map: 'everon', mode: 'captureandhold', players: 32, name: { 'pt-BR': 'Capture & Hold - Bosque de Simon (FIA)', 'en-US': "Capture & Hold - Simon's Wood (FIA)" } },
        { id: '{7C491B1FCC0FF0E1}Missions/CAH_LeMoule.conf', map: 'everon', mode: 'captureandhold', players: 32, name: { 'pt-BR': 'Capture & Hold - Le Moule', 'en-US': 'Capture & Hold - Le Moule' } },
        { id: '{6EA2E454519E5869}Missions/CAH_Military_Base.conf', map: 'everon', mode: 'captureandhold', players: 32, name: { 'pt-BR': 'Capture & Hold - Campo Blake', 'en-US': 'Capture & Hold - Camp Blake' } },
        { id: '{2B4183DF23E88249}Missions/CAH_Morton.conf', map: 'everon', mode: 'captureandhold', players: 24, name: { 'pt-BR': 'Capture & Hold - Morton', 'en-US': 'Capture & Hold - Morton' } },
        // Um jogador e testes (feitos para jogar sozinho; o arquivo não informa limite de jogadores).
        // Ômega 01-05 rodam em Kolguyev (via SharedMilitaryPresence.ent); Eliminação e Suporte aéreo, em Everon.
        { id: '{10B8582BAD9F7040}Missions/Scenario01_Intro.conf', map: 'kolguyev', mode: 'singleplayer', players: null, name: { 'pt-BR': 'Ômega 01: além das colinas e bem distante', 'en-US': 'Omega 01: Over The Hills And Far Away' } },
        { id: '{1D76AF6DC4DF0577}Missions/Scenario02_Steal.conf', map: 'kolguyev', mode: 'singleplayer', players: null, name: { 'pt-BR': 'Ômega 02: checagem de rádio', 'en-US': 'Omega 02: Radio Check' } },
        { id: '{D1647575BCEA5A05}Missions/Scenario03_Villa.conf', map: 'kolguyev', mode: 'singleplayer', players: null, name: { 'pt-BR': 'Ômega 03: luz no escuro', 'en-US': 'Omega 03: Light In The Dark' } },
        { id: '{6D224A109B973DD8}Missions/Scenario04_Sabotage.conf', map: 'kolguyev', mode: 'singleplayer', players: null, name: { 'pt-BR': 'Ômega 04: silêncio vermelho', 'en-US': 'Omega 04: Red Silence' } },
        { id: '{FA2AB0181129CB16}Missions/Scenario05_Hill.conf', map: 'kolguyev', mode: 'singleplayer', players: null, name: { 'pt-BR': 'Ômega 05: suspense', 'en-US': 'Omega 05: Cliffhanger' } },
        { id: '{C47A1A6245A13B26}Missions/SP01_ReginaV2.conf', map: 'everon', mode: 'singleplayer', players: null, name: { 'pt-BR': 'Eliminação', 'en-US': 'Elimination' } },
        { id: '{0648CDB32D6B02B3}Missions/SP02_AirSupport.conf', map: 'everon', mode: 'singleplayer', players: null, name: { 'pt-BR': 'Suporte aéreo', 'en-US': 'Air Support' } },
        { id: '{83D06A42096F671C}Missions/MpTest/10_MpTest.conf', map: 'other', mode: 'test', players: 4, name: { 'pt-BR': 'Multiplayer Test', 'en-US': 'Multiplayer Test' } },
    ];

    // Chaves de tradução do jogo que aparecem no "gameMode"/"name" dos cenários publicados na Workshop.
    // Valores tirados das tabelas de tradução do jogo (localization.*.conf).
    const KNOWN_KEYS = {
        '#AR-Scenario_GameMode_Campaign': { 'pt-BR': 'Campanha', 'en-US': 'Campaign' },
        '#AR-Scenario_GameMode_GameMaster': { 'pt-BR': 'Game Master', 'en-US': 'Game Master' },
        '#AR-Scenario_GameMode_DeathMatch': { 'pt-BR': 'Deathmatch', 'en-US': 'Deathmatch' },
        '#AR-ServerBrowser_ServerScenario': { 'pt-BR': 'Cenário', 'en-US': 'Scenario' },
        '#AR-CombatScenario_Name': { 'pt-BR': 'Combat Ops', 'en-US': 'Combat Ops' },
        '#AR-Campaign_GamemodeName': { 'pt-BR': 'Conflict', 'en-US': 'Conflict' },
    };

    function langOf(lang) { return lang === 'en-US' ? 'en-US' : 'pt-BR'; }

    function isValidScenarioId(id) { return typeof id === 'string' && id.length <= 300 && SCENARIO_ID_RE.test(id.trim()); }

    function normalizeScenarioId(id) {
        const text = String(id || '').trim();
        if (!SCENARIO_ID_RE.test(text)) return text;
        return '{' + text.slice(1, 17).toUpperCase() + '}' + text.slice(18);
    }

    // O GUID identifica o recurso; o caminho é comparado sem diferenciar maiúsculas (o Windows também não).
    function sameScenarioId(a, b) {
        return normalizeScenarioId(a).toLowerCase() === normalizeScenarioId(b).toLowerCase() && !!String(a || '').trim();
    }

    function scenarioFileName(id) {
        const text = String(id || '');
        const path = text.replace(/^\{[0-9A-Fa-f]{16}\}/, '');
        return path.split('/').pop() || text;
    }

    // Troca chaves "#AR-..." conhecidas pelo texto; as desconhecidas viram texto legível ("#AR-Foo_Bar" → "Foo Bar").
    // dropUnknown: para descrições, uma chave desconhecida sozinha não diz nada e é descartada.
    function resolveText(text, lang, { dropUnknown = false } = {}) {
        const value = String(text == null ? '' : text).trim();
        if (!value) return '';
        if (dropUnknown && /^#AR-[\w-]+$/.test(value) && !KNOWN_KEYS[value]) return '';
        return value.replace(/#AR-[\w-]+/g, (key) => {
            if (KNOWN_KEYS[key]) return KNOWN_KEYS[key][langOf(lang)];
            return key.slice(4).replace(/_/g, ' ');
        }).trim();
    }

    function mapLabel(map, lang) { return MAP_LABELS[map] ? MAP_LABELS[map][langOf(lang)] : ''; }
    function groupLabel(group, lang) { return GROUP_LABELS[group] ? GROUP_LABELS[group][langOf(lang)] : ''; }
    function modeLabel(mode, lang) { return MODE_LABELS[mode] ? MODE_LABELS[mode][langOf(lang)] : ''; }

    function baseGameEntry(entry, lang) {
        return {
            id: entry.id, name: entry.name[langOf(lang)], file: scenarioFileName(entry.id),
            map: entry.map, group: entry.mode === 'singleplayer' || entry.mode === 'test' ? 'other' : entry.map,
            mode: entry.mode, modeLabel: modeLabel(entry.mode, lang), players: entry.players,
            description: '', image: '', source: { type: 'game' },
        };
    }

    // Missões de um mod com dados da Workshop (campo scenarios do backend).
    function modScenarioEntries(mod, lang) {
        const list = Array.isArray(mod && mod.scenarios) ? mod.scenarios : [];
        const modName = String((mod && (mod.name || mod.workshopName)) || '') || String((mod && mod.modId) || '');
        return list.filter(s => s && isValidScenarioId(s.id)).map(s => ({
            id: normalizeScenarioId(s.id),
            name: resolveText(s.name, lang) || scenarioFileName(s.id),
            file: scenarioFileName(s.id),
            map: '', group: `mod:${String(mod.modId).toUpperCase()}`,
            mode: 'mod', modeLabel: resolveText(s.gameMode, lang),
            players: Number.isInteger(s.playerCount) && s.playerCount > 0 ? s.playerCount : null,
            description: resolveText(s.description, lang, { dropUnknown: true }),
            image: typeof s.image === 'string' && s.image.startsWith('https://') ? s.image : '',
            source: { type: 'mod', modId: String(mod.modId).toUpperCase(), modName },
        }));
    }

    // Índice de tudo que dá para escolher: jogo base + missões dos mods informados. Uma missão de mod com o
    // mesmo ID de uma do jogo base (mod que substitui a missão) aparece só como a do mod.
    function buildScenarioIndex(mods, lang) {
        const fromMods = [];
        for (const mod of Array.isArray(mods) ? mods : []) fromMods.push(...modScenarioEntries(mod, lang));
        const modIds = new Set(fromMods.map(s => s.id.toLowerCase()));
        const base = BASE_GAME.filter(e => !modIds.has(e.id.toLowerCase())).map(e => baseGameEntry(e, lang));
        const seen = new Set();
        return [...base, ...fromMods].filter(s => {
            const key = s.id.toLowerCase();
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        });
    }

    function findScenario(index, id) {
        if (!String(id || '').trim()) return null;
        return (index || []).find(s => sameScenarioId(s.id, id)) || null;
    }

    function foldText(text) {
        return String(text || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
    }

    // Busca por nome, arquivo, ID, mapa, modo ou nome do mod; todas as palavras precisam aparecer.
    // Mapa e modo entram nas duas línguas, como aparecem na tela.
    function both(table, key) { return table[key] ? [table[key]['pt-BR'], table[key]['en-US']] : []; }
    function searchScenarios(index, term) {
        const words = foldText(term).split(/\s+/).filter(Boolean);
        if (!words.length) return (index || []).slice();
        return (index || []).filter(s => {
            const hay = foldText([s.name, s.file, s.id, s.modeLabel, s.mode, s.source && s.source.modName,
                ...both(MAP_LABELS, s.map), ...both(GROUP_LABELS, s.group), ...both(MODE_LABELS, s.mode)].join(' '));
            return words.every(w => hay.includes(w));
        });
    }

    // Histórico de missões usadas: mais recente primeiro, sem repetir, no máximo MAX_RECENT.
    function normalizeRecent(list) {
        const out = [];
        for (const item of Array.isArray(list) ? list : []) {
            if (!item || typeof item !== 'object' || !isValidScenarioId(item.id)) continue;
            if (out.some(o => sameScenarioId(o.id, item.id))) continue;
            const entry = { id: normalizeScenarioId(item.id), name: String(item.name || '').slice(0, 120) };
            if (/^[0-9A-Fa-f]{16}$/.test(String(item.modId || ''))) {
                entry.modId = String(item.modId).toUpperCase();
                entry.modName = String(item.modName || '').slice(0, 120);
            }
            out.push(entry);
            if (out.length >= MAX_RECENT) break;
        }
        return out;
    }

    // Ao repetir uma missão, o que a nova entrada não informa (nome, mod) vem da anterior: assim o atalho
    // continua sabendo de qual mod a missão é, mesmo quando ela é usada por ID manual ou por predefinição.
    function pushRecent(list, scenario) {
        const items = Array.isArray(list) ? list : [];
        const previous = scenario ? items.find(i => i && sameScenarioId(i.id, scenario.id)) : null;
        const merged = previous && scenario ? {
            ...scenario,
            name: scenario.name || previous.name,
            modId: scenario.modId || previous.modId,
            modName: scenario.modId ? scenario.modName : (scenario.modName || previous.modName),
        } : scenario;
        return normalizeRecent([merged, ...items.filter(i => !(i && scenario && sameScenarioId(i.id, scenario.id)))]);
    }

    // Predefinições: nome + missão + mods (no formato do config: { modId, name?, version? }).
    function normalizePresetMods(mods) {
        const out = [];
        const seen = new Set();
        for (const raw of Array.isArray(mods) ? mods : []) {
            if (!raw || typeof raw !== 'object') continue;
            const modId = String(raw.modId || '').toUpperCase();
            if (!/^[0-9A-F]{16}$/.test(modId) || seen.has(modId)) continue;
            seen.add(modId);
            const mod = { ...raw, modId };
            if (typeof mod.name !== 'string') delete mod.name;
            if (typeof mod.version !== 'string' || !mod.version) delete mod.version;
            out.push(mod);
            if (out.length >= MAX_PRESET_MODS) break;
        }
        return out;
    }

    function normalizePresetName(name) { return String(name || '').replace(/\s+/g, ' ').trim().slice(0, MAX_PRESET_NAME); }

    function normalizePresets(list) {
        const out = [];
        for (const raw of Array.isArray(list) ? list : []) {
            if (!raw || typeof raw !== 'object') continue;
            const name = normalizePresetName(raw.name);
            if (!name || !isValidScenarioId(raw.scenarioId)) continue;
            if (out.some(p => p.name.toLowerCase() === name.toLowerCase())) continue;
            out.push({
                name,
                scenarioId: normalizeScenarioId(raw.scenarioId),
                scenarioName: String(raw.scenarioName || '').slice(0, 120),
                mods: normalizePresetMods(raw.mods),
            });
            if (out.length >= MAX_PRESETS) break;
        }
        return out;
    }

    // Salva (ou substitui, pelo nome sem diferenciar maiúsculas) e devolve a nova lista. null se não couber.
    function upsertPreset(list, preset) {
        const clean = normalizePresets([preset])[0];
        if (!clean) return null;
        const current = normalizePresets(list);
        const i = current.findIndex(p => p.name.toLowerCase() === clean.name.toLowerCase());
        if (i >= 0) { current[i] = clean; return current; }
        if (current.length >= MAX_PRESETS) return null;
        return [...current, clean];
    }

    function removePreset(list, name) {
        const key = normalizePresetName(name).toLowerCase();
        return normalizePresets(list).filter(p => p.name.toLowerCase() !== key);
    }

    // O que muda na lista de mods ao aplicar uma predefinição.
    function diffPresetMods(currentMods, presetMods) {
        const id = m => String((m && m.modId) || '').toUpperCase();
        const current = new Map((currentMods || []).map(m => [id(m), m]));
        const target = new Map(normalizePresetMods(presetMods).map(m => [m.modId, m]));
        const added = [...target.keys()].filter(k => !current.has(k));
        const removed = [...current.keys()].filter(k => k && !target.has(k));
        const changed = [...target.keys()].filter(k => current.has(k) && String(current.get(k).version || '') !== String(target.get(k).version || ''));
        return { added, removed, changed };
    }

    // --- Biblioteca de mapas ---
    // Cada entrada é um mod que publica missões (o "mapa"), as missões dele e os mods que vão junto com ele
    // (ele mesmo e as dependências, em ordem de carga). shared = mods que também servem a outras coisas
    // (ex.: um pacote de conteúdo) e por isso nunca saem da lista quando o mapa é trocado.
    function normalizeLibraryScenarios(list) {
        const out = [];
        for (const raw of Array.isArray(list) ? list : []) {
            if (!raw || typeof raw !== 'object' || !isValidScenarioId(raw.id)) continue;
            const id = normalizeScenarioId(raw.id);
            if (out.some(o => sameScenarioId(o.id, id))) continue;
            out.push({
                id,
                name: String(raw.name || '').slice(0, 200),
                gameMode: String(raw.gameMode || '').slice(0, 100),
                playerCount: Number.isInteger(raw.playerCount) && raw.playerCount > 0 ? raw.playerCount : null,
            });
            if (out.length >= MAX_LIBRARY_SCENARIOS) break;
        }
        return out;
    }

    function normalizeMapLibrary(list) {
        const out = [];
        for (const raw of Array.isArray(list) ? list : []) {
            if (!raw || typeof raw !== 'object') continue;
            const modId = String(raw.modId || '').toUpperCase();
            if (!MOD_ID_RE.test(modId) || out.some(e => e.modId === modId)) continue;
            let mods = normalizePresetMods(raw.mods);
            // O próprio mapa sempre faz parte do conjunto, e por último (depois das dependências).
            const root = mods.find(m => m.modId === modId) || { modId };
            mods = [...mods.filter(m => m.modId !== modId), root];
            const ids = new Set(mods.map(m => m.modId));
            const shared = [...new Set((Array.isArray(raw.shared) ? raw.shared : []).map(x => String(x || '').toUpperCase()))]
                .filter(id => ids.has(id) && id !== modId);
            out.push({ modId, name: String(raw.name || '').slice(0, 120), mods, shared, scenarios: normalizeLibraryScenarios(raw.scenarios) });
            if (out.length >= MAX_LIBRARY) break;
        }
        return out;
    }

    function findMapEntry(library, modId) {
        const id = String(modId || '').toUpperCase();
        return (Array.isArray(library) ? library : []).find(e => e && String(e.modId).toUpperCase() === id) || null;
    }

    // Salva ou atualiza pelo modId. Sem `shared` na entrada nova, mantém o que o usuário marcou antes.
    // null se a biblioteca está cheia.
    function upsertMapEntry(library, entry) {
        const current = normalizeMapLibrary(library);
        const previous = entry ? findMapEntry(current, entry.modId) : null;
        const clean = normalizeMapLibrary([{ ...entry, shared: entry && Array.isArray(entry.shared) ? entry.shared : (previous ? previous.shared : []) }])[0];
        if (!clean) return null;
        const i = current.findIndex(e => e.modId === clean.modId);
        if (i >= 0) { current[i] = clean; return current; }
        if (current.length >= MAX_LIBRARY) return null;
        return [...current, clean];
    }

    function removeMapEntry(library, modId) {
        const id = String(modId || '').toUpperCase();
        return normalizeMapLibrary(library).filter(e => e.modId !== id);
    }

    // O mod e tudo de que ele depende, direta ou indiretamente, com as dependências antes (ordem de carga).
    // mods: o que se sabe de cada mod ({ modId, name, dependencies: [{ id, name }] }). Dependência sem dados
    // entra sem as dependências dela. Ciclos não travam.
    function dependencyChain(rootId, mods) {
        const byId = new Map((Array.isArray(mods) ? mods : []).map(m => [String(m.modId).toUpperCase(), m]));
        const out = [];
        const seen = new Set();
        function visit(id, name) {
            id = String(id || '').toUpperCase();
            if (!MOD_ID_RE.test(id) || seen.has(id)) return;
            seen.add(id);
            const mod = byId.get(id);
            for (const dep of (mod && Array.isArray(mod.dependencies) ? mod.dependencies : [])) visit(dep && dep.id, dep && dep.name);
            out.push({ modId: id, name: String((mod && mod.name) || name || '') });
        }
        visit(rootId, '');
        return out;
    }

    // Plano para usar uma missão do mapa targetId (null = jogo base): quais mods saem e quais entram.
    // Só saem mods que pertencem a algum mapa da biblioteca, que o mapa novo não usa, que ninguém marcou como
    // "manter sempre" e de que nenhum mod que fica na lista depende. Mods fora da biblioteca nunca são tocados.
    function planMapSwitch({ mods, library, targetId }) {
        const list = Array.isArray(mods) ? mods : [];
        const lib = normalizeMapLibrary(library);
        const present = new Map(list.map(m => [String(m.modId).toUpperCase(), m]));
        const target = targetId ? findMapEntry(lib, targetId) : null;
        const targetIds = new Set(target ? target.mods.map(m => m.modId) : (targetId ? [String(targetId).toUpperCase()] : []));
        const shared = new Set(lib.flatMap(e => e.shared));
        const remove = new Set();
        for (const entry of lib) {
            for (const m of entry.mods) {
                if (present.has(m.modId) && !targetIds.has(m.modId) && !shared.has(m.modId)) remove.add(m.modId);
            }
        }
        const depsOf = (m) => (Array.isArray(m.dependencies) ? m.dependencies : []).map(d => String((d && d.id) || '').toUpperCase());
        for (let changed = true; changed;) {
            changed = false;
            for (const id of [...remove]) {
                const neededBy = list.some(m => !remove.has(String(m.modId).toUpperCase()) && depsOf(m).includes(id));
                if (neededBy) { remove.delete(id); changed = true; }
            }
        }
        const add = target ? target.mods.filter(m => !present.has(m.modId)) : [];
        return {
            remove: list.map(m => String(m.modId).toUpperCase()).filter(id => remove.has(id)),
            add,
        };
    }

    return {
        normalizeMapLibrary, findMapEntry, upsertMapEntry, removeMapEntry, dependencyChain, planMapSwitch, MAX_LIBRARY,
        BASE_GAME, MAPS, GROUPS, MAX_RECENT, MAX_PRESETS, mapLabel, groupLabel, modeLabel,
        isValidScenarioId, normalizeScenarioId, sameScenarioId, scenarioFileName, resolveText,
        modScenarioEntries, buildScenarioIndex, findScenario, searchScenarios,
        normalizeRecent, pushRecent,
        normalizePresets, upsertPreset, removePreset, diffPresetMods,
    };
});
