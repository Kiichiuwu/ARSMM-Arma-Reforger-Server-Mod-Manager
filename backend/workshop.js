// workshop.js - Dados dos mods da Workshop do Arma Reforger (nome, versão, tamanho, imagem, dependências).
// A página do mod é um app Next.js: os dados vêm estruturados no <script id="__NEXT_DATA__">.
const fs = require('fs');
const { BackendError, writeFileAtomic } = require('./util');

const MOD_ID_RE = /^[0-9A-F]{16}$/;
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const NOT_FOUND_TTL_MS = 30 * 60 * 1000;
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

function parseWorkshopPage(html, modId) {
    const match = html.match(/<script id="__NEXT_DATA__" type="application\/json"[^>]*>([\s\S]*?)<\/script>/);
    if (!match) throw new Error('Formato da página da Workshop não reconhecido.');
    const asset = JSON.parse(match[1])?.props?.pageProps?.asset;
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
        fetchedAt: Date.now(),
    };
}

function createWorkshop({ cacheFile, fetchImpl = globalThis.fetch, log = () => {} }) {
    const cache = loadCache();
    const inflight = new Map();
    const waiting = [];
    let active = 0;
    let saveTimer = null;

    function loadCache() {
        try {
            return new Map(Object.entries(JSON.parse(fs.readFileSync(cacheFile, 'utf8'))));
        } catch (e) {
            return new Map();
        }
    }

    function saveCache() {
        clearTimeout(saveTimer);
        saveTimer = null;
        return writeFileAtomic(cacheFile, JSON.stringify(Object.fromEntries(cache))).catch(e => {
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

    function download(modId) {
        return withSlot(async () => {
            const res = await fetchImpl(`https://reforger.armaplatform.com/workshop/${modId}`, {
                headers: { 'User-Agent': BROWSER_UA },
                signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
            });
            if (res.status === 404) throw new BackendError('NOT_FOUND', 'Mod não encontrado na Workshop.');
            if (!res.ok) throw new Error(`A Workshop respondeu ${res.status}.`);
            return parseWorkshopPage(await res.text(), modId);
        });
    }

    async function getMod(id, { refresh = false } = {}) {
        const modId = String(id).toUpperCase();
        if (!MOD_ID_RE.test(modId)) throw new BackendError('INVALID', 'ID de mod inválido.');

        const cached = cache.get(modId);
        const ttl = cached?.notFound ? NOT_FOUND_TTL_MS : CACHE_TTL_MS;
        if (cached && !refresh && Date.now() - cached.fetchedAt < ttl) {
            if (cached.notFound) throw new BackendError('NOT_FOUND', 'Mod não encontrado na Workshop.');
            return cached;
        }

        try {
            if (!inflight.has(modId)) inflight.set(modId, download(modId).finally(() => inflight.delete(modId)));
            const data = await inflight.get(modId);
            cache.set(modId, data);
            scheduleSave();
            return data;
        } catch (e) {
            if (e.code === 'NOT_FOUND') {
                // Mod removido ou privado: lembra por um tempo para não consultar de novo a cada abertura.
                cache.set(modId, { notFound: true, fetchedAt: Date.now() });
                scheduleSave();
                throw e;
            }
            log('error', `[WORKSHOP] Mod ${modId}: ${e.message}`);
            // Se a Workshop falhar, devolve o último dado conhecido (mesmo expirado).
            if (cached && !cached.notFound) return { ...cached, stale: true };
            throw new BackendError('UPSTREAM', 'Falha ao consultar a Workshop.');
        }
    }

    return { getMod, flush: saveCache };
}

module.exports = { createWorkshop, parseWorkshopPage };
