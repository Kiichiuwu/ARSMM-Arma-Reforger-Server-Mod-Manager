const { test, after } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createProfileStore } = require('../backend/profiles');
const { createSettingsStore } = require('../backend/settings');
const { createWorkshop, parseWorkshopPage } = require('../backend/workshop');
const { createBattlemetrics } = require('../backend/battlemetrics');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'arsmm-test-'));
after(() => fs.rmSync(tmp, { recursive: true, force: true }));

const PROFILE = { meta: { name: 'Teste', bmId: '' }, armaConfig: { game: { name: 'Teste', mods: [] } } };

function workshopHtml(asset) {
    return `<html><script id="__NEXT_DATA__" type="application/json">${JSON.stringify({ props: { pageProps: { asset } } })}</script></html>`;
}

function fakeResponse(status, body) {
    return {
        status,
        ok: status >= 200 && status < 300,
        text: async () => (typeof body === 'string' ? body : JSON.stringify(body)),
        json: async () => (typeof body === 'string' ? JSON.parse(body) : body),
    };
}

// --- PERFIS ---

test('profilePath aceita só nomes simples .json', () => {
    const store = createProfileStore(path.join(tmp, 'p1'));
    assert.ok(store.profilePath('server_123.json'));
    for (const bad of ['../x.json', '..\\x.json', 'a/b.json', 'a\\b.json', 'x.txt', '', 'CON.json', 'nul.json', '.json', '%2E%2E%2Fx.json', null, 42]) {
        assert.strictEqual(store.profilePath(bad), null, `deveria rejeitar ${bad}`);
    }
});

test('path traversal é rejeitado em ler, salvar e excluir', async () => {
    const store = createProfileStore(path.join(tmp, 'p2', 'saves'));
    for (const name of ['../evil.json', '..\\evil.json', '..\\..\\evil.bat']) {
        await assert.rejects(store.save(name, PROFILE), { code: 'INVALID' });
        await assert.rejects(store.read(name), { code: 'INVALID' });
        await assert.rejects(store.remove(name), { code: 'INVALID' });
    }
    assert.ok(!fs.existsSync(path.join(tmp, 'p2', 'evil.json')));
});

test('ciclo completo de perfil: salvar, listar, ler, excluir', async () => {
    const store = createProfileStore(path.join(tmp, 'p3'));
    await store.save('server_1.json', PROFILE);
    assert.deepStrictEqual(await store.list(), [{ filename: 'server_1.json', name: 'Teste', bmId: '' }]);
    assert.deepStrictEqual(await store.read('server_1.json'), PROFILE);
    await store.remove('server_1.json');
    await assert.rejects(store.read('server_1.json'), { code: 'NOT_FOUND' });
    await assert.rejects(store.remove('server_1.json'), { code: 'NOT_FOUND' });
});

test('conteúdo inválido não é salvo', async () => {
    const store = createProfileStore(path.join(tmp, 'p4'));
    for (const body of [[], { meta: {} }, { armaConfig: {} }, 'texto', null]) {
        await assert.rejects(store.save('server_2.json', body), { code: 'INVALID' });
    }
    assert.deepStrictEqual(await store.list(), []);
});

test('perfil corrompido aparece marcado na lista e não abre', async () => {
    const store = createProfileStore(path.join(tmp, 'p5'));
    fs.writeFileSync(path.join(store.dir, 'quebrado.json'), '{ nao e json');
    assert.deepStrictEqual(await store.list(), [{ filename: 'quebrado.json', name: 'quebrado.json', corrupt: true }]);
    await assert.rejects(store.read('quebrado.json'), { code: 'CORRUPT' });
});

test('arquivo com nome fora do padrão aparece na lista e pode ser renomeado', async () => {
    const store = createProfileStore(path.join(tmp, 'p6'));
    fs.writeFileSync(path.join(store.dir, 'server_1 - Cópia.json'), JSON.stringify(PROFILE));
    fs.writeFileSync(path.join(store.dir, 'SERVER_1_-_COPIA.json'), JSON.stringify(PROFILE)); // nome que o reparo geraria (o Windows ignora maiúsculas)
    fs.writeFileSync(path.join(store.dir, 'notas.txt'), 'x');
    const list = await store.list();
    assert.deepStrictEqual(list.find(p => p.invalidName), { filename: 'server_1 - Cópia.json', name: 'server_1 - Cópia.json', invalidName: true });
    assert.strictEqual(list.length, 2);

    const renamed = await store.repairName('server_1 - Cópia.json');
    assert.strictEqual(renamed, 'server_1_-_Copia_2.json');
    assert.deepStrictEqual(await store.read(renamed), PROFILE);
    assert.ok(!fs.existsSync(path.join(store.dir, 'server_1 - Cópia.json')));

    await assert.rejects(store.repairName('../fora.json'), { code: 'INVALID' });
    await assert.rejects(store.repairName('nao-existe x.json'), { code: 'NOT_FOUND' });
    await assert.rejects(store.repairName('notas.txt'), { code: 'INVALID' });
});

test('salvamentos simultâneos do mesmo perfil nunca deixam o arquivo corrompido', async () => {
    const store = createProfileStore(path.join(tmp, 'p7'));
    const big = (tag, n) => ({ meta: { name: tag }, armaConfig: { game: { name: tag, mods: Array.from({ length: n }, (_, i) => ({ modId: String(i).padStart(16, '0'), name: tag })) } } });
    for (let i = 0; i < 30; i++) {
        await Promise.all([store.save('c.json', big('A', 400)), store.save('c.json', big('B', 300))]);
        assert.strictEqual((await store.read('c.json')).meta.name, 'B'); // a última gravação vence inteira
    }
    assert.deepStrictEqual(fs.readdirSync(store.dir).filter(f => f.endsWith('.tmp')), []);
});

// --- CONFIGURAÇÕES ---

test('token do BattleMetrics é salvo, nunca devolvido à interface, e removido com texto vazio', async () => {
    const settings = createSettingsStore(path.join(tmp, 'settings.json'));
    assert.deepStrictEqual(await settings.getPublic(), { hasBattlemetricsToken: false });
    assert.deepStrictEqual(await settings.update({ battlemetricsToken: '  abc  ' }), { hasBattlemetricsToken: true });
    assert.strictEqual((await settings.read()).battlemetricsToken, 'abc');
    assert.deepStrictEqual(await settings.getPublic(), { hasBattlemetricsToken: true });
    await settings.update({ battlemetricsToken: '' });
    assert.deepStrictEqual(await settings.getPublic(), { hasBattlemetricsToken: false });
    await assert.rejects(settings.update('x'), { code: 'INVALID' });
});

// --- WORKSHOP ---

const ASSET = {
    id: '5965550F24A0C152',
    name: 'Where Am I <b>',
    currentVersionNumber: '1.2.0',
    currentVersionSize: 201671,
    previews: [{
        url: 'https://ar-gcp-cdn.bistudio.com/image/full.jpg',
        thumbnails: { 'image/jpeg': [
            { url: 'https://ar-gcp-cdn.bistudio.com/image/1152.jpg', width: 1152 },
            { url: 'https://ar-gcp-cdn.bistudio.com/image/288.jpg', width: 288 },
            { url: 'https://ar-gcp-cdn.bistudio.com/image/576.jpg', width: 576 },
        ] },
    }],
    dependencies: [
        { version: '0.16.5236', asset: { id: '1337c0de5dabbeef', name: 'RHS - Content Pack 01' } },
        { version: '1.0.0', asset: { id: 'invalido', name: 'x' } },
    ],
};

test('parseWorkshopPage lê o __NEXT_DATA__', () => {
    const data = parseWorkshopPage(workshopHtml(ASSET), '5965550F24A0C152');
    assert.strictEqual(data.name, 'Where Am I <b>');
    assert.strictEqual(data.version, '1.2.0');
    assert.strictEqual(data.sizeBytes, 201671);
    assert.strictEqual(data.image, 'https://ar-gcp-cdn.bistudio.com/image/288.jpg');
    assert.deepStrictEqual(data.dependencies, [{ id: '1337C0DE5DABBEEF', name: 'RHS - Content Pack 01' }]);
    assert.throws(() => parseWorkshopPage(workshopHtml(ASSET), 'AAAAAAAAAAAAAAAA'), /não encontrado/);
    assert.throws(() => parseWorkshopPage('<html></html>', '5965550F24A0C152'), /não reconhecido/);
});

test('getMod valida o ID antes de qualquer acesso à rede', async () => {
    let calls = 0;
    const workshop = createWorkshop({ cacheFile: path.join(tmp, 'c0.json'), fetchImpl: async () => { calls++; return fakeResponse(200, ''); } });
    for (const bad of ['nao-e-id', '../../admin', '5965550F24A0C15', '5965550F24A0C152/x']) {
        await assert.rejects(workshop.getMod(bad), { code: 'INVALID' });
    }
    assert.strictEqual(calls, 0);
});

test('getMod usa cache, agrupa pedidos simultâneos e aceita ID minúsculo', async () => {
    let calls = 0;
    const workshop = createWorkshop({
        cacheFile: path.join(tmp, 'c1.json'),
        fetchImpl: async (url) => { calls++; assert.match(url, /5965550F24A0C152$/); return fakeResponse(200, workshopHtml(ASSET)); },
    });
    const [a, b] = await Promise.all([workshop.getMod('5965550f24a0c152'), workshop.getMod('5965550F24A0C152')]);
    assert.strictEqual(a.version, '1.2.0');
    assert.deepStrictEqual(a, b);
    await workshop.getMod('5965550F24A0C152');
    assert.strictEqual(calls, 1);
    await workshop.getMod('5965550F24A0C152', { refresh: true });
    assert.strictEqual(calls, 2);
    await workshop.flush();
    assert.ok(JSON.parse(fs.readFileSync(path.join(tmp, 'c1.json'), 'utf8'))['5965550F24A0C152']);
});

test('mod removido (404) fica em cache negativo', async () => {
    let calls = 0;
    const workshop = createWorkshop({ cacheFile: path.join(tmp, 'c2.json'), fetchImpl: async () => { calls++; return fakeResponse(404, 'nope'); } });
    await assert.rejects(workshop.getMod('66FD3091BEEFE9F0'), { code: 'NOT_FOUND' });
    await assert.rejects(workshop.getMod('66FD3091BEEFE9F0'), { code: 'NOT_FOUND' });
    assert.strictEqual(calls, 1);
});

test('falha da Workshop devolve o último dado conhecido; sem cache vira UPSTREAM', async () => {
    let fail = false;
    const workshop = createWorkshop({
        cacheFile: path.join(tmp, 'c3.json'),
        fetchImpl: async () => { if (fail) throw new Error('rede caiu'); return fakeResponse(200, workshopHtml(ASSET)); },
    });
    await workshop.getMod('5965550F24A0C152');
    fail = true;
    const stale = await workshop.getMod('5965550F24A0C152', { refresh: true });
    assert.strictEqual(stale.stale, true);
    assert.strictEqual(stale.version, '1.2.0');
    await assert.rejects(workshop.getMod('1337C0DE5DABBEEF'), { code: 'UPSTREAM' });
});

test('no máximo 4 downloads ao mesmo tempo', async () => {
    let active = 0;
    let peak = 0;
    const workshop = createWorkshop({
        cacheFile: path.join(tmp, 'c4.json'),
        fetchImpl: async (url) => {
            active++;
            peak = Math.max(peak, active);
            await new Promise(r => setTimeout(r, 20));
            active--;
            const id = url.slice(-16);
            return fakeResponse(200, workshopHtml({ ...ASSET, id }));
        },
    });
    const ids = Array.from({ length: 12 }, (_, i) => '10000000000000' + i.toString(16).toUpperCase().padStart(2, '0'));
    await Promise.all(ids.map(id => workshop.getMod(id)));
    assert.strictEqual(peak, 4);
});

// --- BATTLEMETRICS ---

test('BattleMetrics: valida ID, envia token e traduz 401/403', async () => {
    let lastHeaders = null;
    let status = 403;
    const fetchImpl = async (url, options) => { lastHeaders = options.headers; return fakeResponse(status, { errors: [{ detail: 'x' }] }); };

    let token = '';
    const bm = createBattlemetrics({ getToken: async () => token, fetchImpl });
    await assert.rejects(bm.getServer('abc'), { code: 'INVALID' });
    await assert.rejects(bm.getServer('123'), { code: 'NEEDS_TOKEN' });
    assert.strictEqual(lastHeaders.Authorization, undefined);

    token = 'segredo';
    await assert.rejects(bm.getServer('123'), { code: 'TOKEN_REJECTED' });
    assert.strictEqual(lastHeaders.Authorization, 'Bearer segredo');

    status = 200;
    assert.deepStrictEqual(await bm.getServer('123'), { errors: [{ detail: 'x' }] });
    status = 404;
    await assert.rejects(bm.getServer('123'), { code: 'NOT_FOUND' });
});
