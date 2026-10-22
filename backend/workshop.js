// workshop.js - Dados dos mods da Workshop do Arma Reforger (nome, versão, tamanho, imagem, dependências,
// versão do jogo). A página do mod é um app Next.js: os dados vêm estruturados no <script id="__NEXT_DATA__">.
const fs = require('fs');
const { BackendError, isPlainObject, writeFileAtomic } = require('./util');

const MOD_ID_RE = /^[0-9A-F]{16}$/;
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const NOT_FOUND_TTL_MS = 30 * 60 * 1000;
// Sobe quando os campos guardados mudam: um cache de outro esquema é descartado inteiro.
const CACHE_SCHEMA_VERSION = 2;
// A página do mod só lista as últimas 10 versões; as mais antigas vêm do /changelog (30 por página).
const MAX_CHANGELOG_PAGES = 20;
const MOD_VERSION_RE = /^[0-9A-Za-z._+-]{1,40}$/;
const MAX_CONCURRENT_REQUESTS = 4;
const REQUEST_TIMEOUT_MS = 10000;
const BROWSER_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';

function pickThumbnail(previews) {
    const preview = Array.isArray(previews) ? previews[0] : null;
    if (!preview) return '';
    const thumbs = (preview.thumbnails && preview.thumbnails['image/jpeg']) || [];
    // Menor miniatura com pelo menos 280px (cards da grade), senão a maior disponível.
    const sorted = thumbs.filter(t => t && t.url).sort((a, b) => (a.width || 0) - (b.width || 0));
    const fit = sorted.find(t => (t.width || 0) >= 280) || sorted[sorted.length - 1];
    return (fit && fit.url) || preview.url || '';
}

function readNextData(html) {
    const match = html.match(/<script id="__NEXT_DATA__" type="application\/json"[^>]*>([\s\S]*?)<\/script>/);
    if (!match) throw new Error('Formato da página da Workshop não reconhecido.');
    return JSON.parse(match[1])?.props?.pageProps || {};
}

function versionPair(v) {
    return { version: String(v?.version || ''), gameVersion: String(v?.gameVersion || '') };
}

// asset.gameVersion é a versão do jogo da versão atual do mod. Não usar asset.dependencyTree.gameVersion:
// nos mods testados vinha sempre o mesmo valor antigo, sem relação com o mod.
function parseWorkshopPage(html, modId) {
    const asset = readNextData(html).asset;
    if (!asset || String(asset.id).toUpperCase() !== modId) throw new Error('Mod não encontrado na Workshop.');
    return {
        id: modId,
        name: String(asset.name || ''),
        version: String(asset.currentVersionNumber || ''),
        sizeBytes: Number(asset.currentVersionSize) || 0,
        image: pickThumbnail(asset.previews),
        dependencies: (Array.isArray(asset.dependencies) ? asset.dependencies : [])
            .map(d => ({ id: String(d?.asset?.id || '').toUpperCase(), name: String(d?.asset?.name || '') }))
            .filter(d => MOD_ID_RE.test(d.id) && d.id !== modId),
        gameVersion: String(asset.gameVersion || ''),
        versions: (Array.isArray(asset.versions) ? asset.versions : []).map(versionPair).filter(v => v.version),
        obsolete: asset.obsolete === true,
        fetchedAt: Date.now(),
    };
}

// /workshop/{ID}/changelog: pageProps.changelogs = { count, rows: [{ version, gameVersion, createdAt, changelog }] }.
function parseChangelogPage(html, modId) {
    const props = readNextData(html);
    if (props.asset && String(props.asset.id).toUpperCase() !== modId) throw new Error('Mod não encontrado na Workshop.');
    const changelogs = props.changelogs;
    if (!changelogs || !Array.isArray(changelogs.rows)) throw new Error('Formato do changelog da Workshop não reconhecido.');
    return {
        count: Number(changelogs.count) || 0,
        rows: changelogs.rows.map(versionPair).filter(v => v.version),
    };
}

function createWorkshop({ cacheFile, fetchImpl = globalThis.fetch, log = () => {} }) {
    const cache = loadCache();
    const inflight = new Map();
    const waiting = [];
    let active = 0;
    let saveTimer = null;

    // { schemaVersion, mods: { ID: dados }, changelogs: { ID: { versions: { versão: versãoDoJogo }, missing: { versão: quando } } } }
    // O formato antigo (mods direto na raiz, sem gameVersion) é descartado.
    function loadCache() {
        try {
            const file = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
            if (!isPlainObject(file) || file.schemaVersion !== CACHE_SCHEMA_VERSION) return { mods: new Map(), changelogs: new Map() };
            return {
                mods: new Map(Object.entries(isPlainObject(file.mods) ? file.mods : {})),
                changelogs: new Map(Object.entries(isPlainObject(file.changelogs) ? file.changelogs : {})),
            };
        } catch (e) {
            return { mods: new Map(), changelogs: new Map() };
        }
    }

    function saveCache() {
        clearTimeout(saveTimer);
        saveTimer = null;
        const file = { schemaVersion: CACHE_SCHEMA_VERSION, mods: Object.fromEntries(cache.mods), changelogs: Object.fromEntries(cache.changelogs) };
        return writeFileAtomic(cacheFile, JSON.stringify(file)).catch(e => {
            log('error', `[WORKSHOP] Falha ao salvar cache: ${e.message}`);
        });
    }

    function scheduleSave() {
        if (!saveTimer) saveTimer = setTimeout(saveCache, 2000);
    }

    // No máximo MAX_CONCURRENT_REQUESTS downloads ao mesmo tempo.
    async function withSlot(fn) {
        if (active >= MAX_CONCURRENT_REQUESTS) await new Promise(resolve => waiting.push(resolve));
        active++;
        try {
            return await fn();
        } finally {
            active--;
            const next = waiting.shift();
            if (next) next();
        }
    }

    function fetchPage(url) {
        return withSlot(async () => {
            const res = await fetchImpl(url, {
                headers: { 'User-Agent': BROWSER_UA },
                signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
            });
            if (res.status === 404) throw new BackendError('NOT_FOUND', 'Mod não encontrado na Workshop.');
            if (!res.ok) throw new Error(`A Workshop respondeu ${res.status}.`);
            return res.text();
        });
    }

    async function download(modId) {
        return parseWorkshopPage(await fetchPage(`https://reforger.armaplatform.com/workshop/${modId}`), modId);
    }

    async function getMod(id, { refresh = false } = {}) {
        const modId = String(id).toUpperCase();
        if (!MOD_ID_RE.test(modId)) throw new BackendError('INVALID', 'ID de mod inválido.');

        const cached = cache.mods.get(modId);
        const ttl = cached?.notFound ? NOT_FOUND_TTL_MS : CACHE_TTL_MS;
        if (cached && !refresh && Date.now() - cached.fetchedAt < ttl) {
            if (cached.notFound) throw new BackendError('NOT_FOUND', 'Mod não encontrado na Workshop.');
            return cached;
        }

        try {
            if (!inflight.has(modId)) inflight.set(modId, download(modId).finally(() => inflight.delete(modId)));
            const data = await inflight.get(modId);
            cache.mods.set(modId, data);
            scheduleSave();
            return data;
        } catch (e) {
            if (e.code === 'NOT_FOUND') {
                // Mod removido ou privado: lembra por um tempo para não consultar de novo a cada abertura.
                cache.mods.set(modId, { notFound: true, fetchedAt: Date.now() });
                scheduleSave();
                throw e;
            }
            log('error', `[WORKSHOP] Mod ${modId}: ${e.message}`);
            // Se a Workshop falhar, devolve o último dado conhecido (mesmo expirado).
            if (cached && !cached.notFound) return { ...cached, stale: true };
            throw new BackendError('UPSTREAM', 'Falha ao consultar a Workshop.');
        }
    }

    function changelogEntry(modId) {
        let entry = cache.changelogs.get(modId);
        if (!isPlainObject(entry) || !isPlainObject(entry.versions) || !isPlainObject(entry.missing)) {
            entry = { versions: {}, missing: {} };
            cache.changelogs.set(modId, entry);
        }
        return entry;
    }

    // Percorre o /changelog página por página até achar a versão (ou acabar). Tudo que vier fica no cache:
    // a versão do jogo de uma versão já publicada não muda.
    async function scanChangelog(modId, version) {
        const entry = changelogEntry(modId);
        let seen = 0;
        for (let page = 1; page <= MAX_CHANGELOG_PAGES; page++) {
            const html = await fetchPage(`https://reforger.armaplatform.com/workshop/${modId}/changelog?page=${page}`);
            const { count, rows } = parseChangelogPage(html, modId);
            for (const row of rows) entry.versions[row.version] = row.gameVersion;
            seen += rows.length;
            if (Object.hasOwn(entry.versions, version) || !rows.length || seen >= count) break;
        }
        if (Object.hasOwn(entry.versions, version)) delete entry.missing[version];
        else entry.missing[version] = Date.now();
        scheduleSave();
    }

    // Versão do jogo de uma versão específica do mod. Usa a página do mod (10 últimas versões) e só
    // consulta o /changelog quando a versão é mais antiga. gameVersion vazio = a Workshop não informa.
    async function getGameVersion(id, version) {
        const modId = String(id).toUpperCase();
        version = String(version ?? '');
        if (!MOD_ID_RE.test(modId)) throw new BackendError('INVALID', 'ID de mod inválido.');
        if (!MOD_VERSION_RE.test(version)) throw new BackendError('INVALID', 'Versão de mod inválida.');

        const mod = await getMod(modId);
        if (mod.version === version) return { version, gameVersion: mod.gameVersion || '', source: 'page' };
        const listed = (mod.versions || []).find(v => v.version === version);
        if (listed) return { version, gameVersion: listed.gameVersion, source: 'page' };

        const entry = changelogEntry(modId);
        const missingAt = entry.missing[version];
        if (!Object.hasOwn(entry.versions, version) && !(missingAt && Date.now() - missingAt < NOT_FOUND_TTL_MS)) {
            const key = `changelog:${modId}:${version}`;
            try {
                if (!inflight.has(key)) inflight.set(key, scanChangelog(modId, version).finally(() => inflight.delete(key)));
                await inflight.get(key);
            } catch (e) {
                if (e.code === 'NOT_FOUND') throw e;
                log('error', `[WORKSHOP] Changelog do mod ${modId}: ${e.message}`);
                throw new BackendError('UPSTREAM', 'Falha ao consultar o changelog da Workshop.');
            }
        }
        if (Object.hasOwn(entry.versions, version)) return { version, gameVersion: entry.versions[version], source: 'changelog' };
        log('warn', `[WORKSHOP] Versão ${version} do mod ${modId} não aparece no changelog.`);
        return { version, gameVersion: '', source: 'missing' };
    }

    return { getMod, getGameVersion, flush: saveCache };
}

module.exports = { createWorkshop, parseWorkshopPage, parseChangelogPage, CACHE_SCHEMA_VERSION };
