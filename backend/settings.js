// settings.js - Configurações do app: token do BattleMetrics e atualização automática do ARSMM.
const { BackendError, isPlainObject, writeFileAtomic, readJson } = require('./util');

function createSettingsStore(settingsFile) {
    async function read() {
        const settings = await readJson(settingsFile, {});
        return isPlainObject(settings) ? settings : {};
    }

    // O token nunca volta para a interface: ela só sabe se existe um.
    async function getPublic() {
        return publicView(await read());
    }

    // Atualização automática vem ligada: só fica desligada se o usuário desligar.
    function publicView(settings) {
        return { hasBattlemetricsToken: !!settings.battlemetricsToken, autoUpdate: settings.autoUpdate !== false };
    }

    async function update(changes) {
        if (!isPlainObject(changes)) throw new BackendError('INVALID', 'Configuração inválida.');
        const settings = await read();
        if (typeof changes.battlemetricsToken === 'string') {
            const token = changes.battlemetricsToken.trim();
            if (token) settings.battlemetricsToken = token; else delete settings.battlemetricsToken;
        }
        if (typeof changes.autoUpdate === 'boolean') settings.autoUpdate = changes.autoUpdate;
        await writeFileAtomic(settingsFile, JSON.stringify(settings, null, 4));
        return publicView(settings);
    }

    return { read, getPublic, update };
}

module.exports = { createSettingsStore };
