// settings.js - Configurações do app (por enquanto só o token do BattleMetrics).
const { BackendError, isPlainObject, writeFileAtomic, readJson } = require('./util');

function createSettingsStore(settingsFile) {
    async function read() {
        const settings = await readJson(settingsFile, {});
        return isPlainObject(settings) ? settings : {};
    }

    // O token nunca volta para a interface: ela só sabe se existe um.
    async function getPublic() {
        return { hasBattlemetricsToken: !!(await read()).battlemetricsToken };
    }

    async function update(changes) {
        if (!isPlainObject(changes)) throw new BackendError('INVALID', 'Configuração inválida.');
        const settings = await read();
        if (typeof changes.battlemetricsToken === 'string') {
            const token = changes.battlemetricsToken.trim();
            if (token) settings.battlemetricsToken = token; else delete settings.battlemetricsToken;
        }
        await writeFileAtomic(settingsFile, JSON.stringify(settings, null, 4));
        return { hasBattlemetricsToken: !!settings.battlemetricsToken };
    }

    return { read, getPublic, update };
}

module.exports = { createSettingsStore };
