// profiles.js - Perfis de servidor salvos como JSON em uma única pasta.
const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const { BackendError, isPlainObject, writeFileAtomic } = require('./util');

// Só nomes simples terminados em .json, sempre dentro da pasta de saves.
const PROFILE_NAME_RE = /^[A-Za-z0-9_-]{1,64}\.json$/;
const WINDOWS_RESERVED_RE = /^(con|prn|aux|nul|com\d|lpt\d)\./i;

function createProfileStore(savesDir) {
    const dir = path.resolve(savesDir);
    fs.mkdirSync(dir, { recursive: true });

    function profilePath(filename) {
        if (typeof filename !== 'string' || !PROFILE_NAME_RE.test(filename) || WINDOWS_RESERVED_RE.test(filename)) return null;
        const filePath = path.join(dir, filename);
        return path.dirname(filePath) === dir ? filePath : null;
    }

    function requirePath(filename) {
        const filePath = profilePath(filename);
        if (!filePath) throw new BackendError('INVALID', 'Nome de perfil inválido.');
        return filePath;
    }

    async function list() {
        const entries = await fsp.readdir(dir, { withFileTypes: true });
        const files = entries.filter(e => e.isFile() && e.name.toLowerCase().endsWith('.json')).map(e => e.name);
        return Promise.all(files.map(async (filename) => {
            // Cópias feitas no Explorer ("server - Cópia.json") não passam na validação: aparecem para serem renomeadas.
            if (!profilePath(filename)) return { filename, name: filename, invalidName: true };
            try {
                const content = JSON.parse(await fsp.readFile(path.join(dir, filename), 'utf8'));
                return { filename, name: content.meta?.name || filename, bmId: content.meta?.bmId || '' };
            } catch (e) {
                return { filename, name: filename, corrupt: true };
            }
        }));
    }

    async function read(filename) {
        const filePath = requirePath(filename);
        let text;
        try {
            text = await fsp.readFile(filePath, 'utf8');
        } catch (e) {
            if (e.code === 'ENOENT') throw new BackendError('NOT_FOUND', 'Perfil não encontrado.');
            throw e;
        }
        try {
            return JSON.parse(text);
        } catch (e) {
            throw new BackendError('CORRUPT', 'Perfil corrompido ou ilegível.');
        }
    }

    async function save(filename, profile) {
        const filePath = requirePath(filename);
        if (!isPlainObject(profile) || !isPlainObject(profile.meta) || !isPlainObject(profile.armaConfig)) {
            throw new BackendError('INVALID', 'Perfil inválido: esperado { meta, armaConfig }.');
        }
        await writeFileAtomic(filePath, JSON.stringify(profile, null, 4));
    }

    async function remove(filename) {
        const filePath = requirePath(filename);
        try {
            await fsp.unlink(filePath);
        } catch (e) {
            if (e.code === 'ENOENT') throw new BackendError('NOT_FOUND', 'Perfil não encontrado.');
            throw e;
        }
    }

    // Renomeia um .json da pasta de saves com nome fora do padrão para um nome válido e livre.
    async function repairName(filename) {
        if (typeof filename !== 'string' || filename !== path.basename(filename) || !filename.toLowerCase().endsWith('.json')) {
            throw new BackendError('INVALID', 'Nome de arquivo inválido.');
        }
        const entries = await fsp.readdir(dir);
        if (!entries.includes(filename)) throw new BackendError('NOT_FOUND', 'Perfil não encontrado.');
        if (profilePath(filename)) return filename;

        const taken = new Set(entries.map(e => e.toLowerCase())); // o Windows não diferencia maiúsculas
        let base = filename.slice(0, -5).normalize('NFD').replace(/[̀-ͯ]/g, '')
            .replace(/[^A-Za-z0-9_-]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 50) || 'server';
        if (WINDOWS_RESERVED_RE.test(`${base}.`)) base = `server_${base}`;
        let candidate = `${base}.json`;
        for (let i = 2; taken.has(candidate.toLowerCase()) || !profilePath(candidate); i++) candidate = `${base}_${i}.json`;
        await fsp.rename(path.join(dir, filename), path.join(dir, candidate));
        return candidate;
    }

    return { dir, profilePath, list, read, save, remove, repairName };
}

module.exports = { createProfileStore };
