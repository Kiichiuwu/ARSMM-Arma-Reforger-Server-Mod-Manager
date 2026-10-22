// game-version.js - Comparação entre a versão do jogo exigida por um mod e a versão do servidor.
// Só major.minor contam (1.8.0.13 e 1.8.0.41 são "a mesma" 1.8). Usado pela interface e pelos testes.
(function (root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory();
    else root.ARSMM_GAME_VERSION = factory();
})(typeof self !== 'undefined' ? self : this, function () {
    function parseMajorMinor(version) {
        const match = String(version || '').trim().match(/^v?(\d+)\.(\d+)/i);
        return match ? [Number(match[1]), Number(match[2])] : null;
    }

    function majorMinor(version) {
        const parsed = parseMajorMinor(version);
        return parsed ? `${parsed[0]}.${parsed[1]}` : '';
    }

    // 'newer': o mod pede um jogo mais novo que o servidor; 'older': mod parado numa versão anterior;
    // 'same': mesma major.minor; 'unknown': falta algum dado.
    function compareGameVersion(modGameVersion, serverGameVersion) {
        const mod = parseMajorMinor(modGameVersion);
        const server = parseMajorMinor(serverGameVersion);
        if (!mod || !server) return 'unknown';
        if (mod[0] !== server[0]) return mod[0] > server[0] ? 'newer' : 'older';
        if (mod[1] !== server[1]) return mod[1] > server[1] ? 'newer' : 'older';
        return 'same';
    }

    // Versão do jogo da versão do mod que o servidor vai usar: a mais recente (auto update ou sem versão fixa)
    // ou a fixada, se estiver entre as versões que a página do mod lista. `listed: false` = precisa do changelog.
    function gameVersionForModVersion(data, pinnedVersion) {
        const latest = String((data && data.version) || '');
        const latestGame = String((data && data.gameVersion) || '');
        if (!pinnedVersion || pinnedVersion === latest) return { gameVersion: latestGame, listed: true };
        const versions = Array.isArray(data && data.versions) ? data.versions : [];
        const found = versions.find(v => v && v.version === pinnedVersion);
        return found ? { gameVersion: String(found.gameVersion || ''), listed: true } : { gameVersion: '', listed: false };
    }

    return { parseMajorMinor, majorMinor, compareGameVersion, gameVersionForModVersion };
});
