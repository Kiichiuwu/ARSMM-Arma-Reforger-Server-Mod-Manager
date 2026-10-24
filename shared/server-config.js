// server-config.js - Completa os blocos "rcon" e "a2s" do config.json do servidor quando faltam ou estão
// inválidos, para o painel conseguir conectar no RCON e consultar o servidor (Monitor) sem configuração manual.
// Usado pela tela inicial (criar/importar), pelo painel (ao abrir um perfil) e pelos testes.
//
// Regras do servidor (wiki da Bohemia, "Arma Reforger:Server Config"): rcon.address e a2s.address são
// obrigatórios; a senha do RCON é obrigatória, sem espaços e com pelo menos 3 caracteres; sem ela o RCON não sobe.
(function (root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory();
    else root.ARSMM_SERVER_CONFIG = factory();
})(typeof self !== 'undefined' ? self : this, function () {
    const DEFAULT_A2S_PORT = 17777;
    const DEFAULT_RCON_PORT = 19999;
    const ANY_ADDRESS = '0.0.0.0';
    const IPV4_RE = /^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/;
    const PASSWORD_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';

    const isPlainObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

    // Só IPv4 escrito do jeito que o servidor entende: "45.146.81.00" (zero à esquerda) não serve.
    function isValidAddress(value) {
        return typeof value === 'string' && IPV4_RE.test(value.trim());
    }

    function isValidPort(value) {
        return Number.isInteger(value) && value >= 1 && value <= 65535;
    }

    function isValidRconPassword(value) {
        return typeof value === 'string' && value.length >= 3 && !/\s/.test(value);
    }

    function randomPassword(length = 16) {
        const bytes = globalThis.crypto.getRandomValues(new Uint8Array(length));
        return Array.from(bytes, b => PASSWORD_CHARS[b % PASSWORD_CHARS.length]).join('');
    }

    // Primeira porta a partir de `start` que ninguém do config usa (jogo, A2S, RCON).
    function freePort(start, used) {
        let port = start;
        while (used.has(port) && port < 65535) port++;
        return port;
    }

    // Devolve uma cópia do config com os blocos completos e a lista do que mudou. Nunca mexe no que já está
    // válido; só preenche o que falta e troca o que o servidor rejeitaria.
    //   options.rcon / options.a2s: false para não criar o bloco (ex.: o usuário removeu o RCON de propósito).
    //   options.rconPassword: senha a usar num RCON novo (ex.: a senha de admin), se for válida.
    //   options.generatePassword: gerador de senha (os testes passam um fixo).
    function ensureServerBlocks(armaConfig, options = {}) {
        const config = isPlainObject(armaConfig) ? structuredClone(armaConfig) : {};
        const { rcon: wantRcon = true, a2s: wantA2s = true, rconPassword, generatePassword = randomPassword } = options;
        const changes = [];
        const used = new Set([config.bindPort, config.publicPort].filter(isValidPort));
        if (isPlainObject(config.a2s) && isValidPort(config.a2s.port)) used.add(config.a2s.port);
        if (isPlainObject(config.rcon) && isValidPort(config.rcon.port)) used.add(config.rcon.port);

        const fixAddress = (block, name) => {
            if (isValidAddress(block.address)) {
                block.address = block.address.trim();
                return;
            }
            changes.push({ block: name, field: 'address', from: block.address ?? null, to: ANY_ADDRESS });
            block.address = ANY_ADDRESS;
        };
        const fixPort = (block, name, defaultPort) => {
            if (isValidPort(block.port)) return;
            const port = freePort(defaultPort, used);
            used.add(port);
            changes.push({ block: name, field: 'port', from: block.port ?? null, to: port });
            block.port = port;
        };

        if (wantA2s) {
            if (!isPlainObject(config.a2s)) {
                const port = freePort(DEFAULT_A2S_PORT, used);
                used.add(port);
                config.a2s = { address: ANY_ADDRESS, port };
                changes.push({ block: 'a2s', field: 'block', from: null, to: port });
            } else {
                fixAddress(config.a2s, 'a2s');
                fixPort(config.a2s, 'a2s', DEFAULT_A2S_PORT);
            }
        }

        if (wantRcon) {
            const newPassword = () => (isValidRconPassword(rconPassword) ? rconPassword : generatePassword());
            if (!isPlainObject(config.rcon)) {
                const port = freePort(DEFAULT_RCON_PORT, used);
                used.add(port);
                config.rcon = { address: ANY_ADDRESS, port, password: newPassword(), permission: 'admin' };
                changes.push({ block: 'rcon', field: 'block', from: null, to: port });
            } else {
                const rcon = config.rcon;
                fixAddress(rcon, 'rcon');
                fixPort(rcon, 'rcon', DEFAULT_RCON_PORT);
                if (!isValidRconPassword(rcon.password)) {
                    rcon.password = newPassword();
                    changes.push({ block: 'rcon', field: 'password', from: null, to: null }); // senha não vai para log
                }
                if (rcon.permission !== 'admin' && rcon.permission !== 'monitor') {
                    changes.push({ block: 'rcon', field: 'permission', from: rcon.permission ?? null, to: 'admin' });
                    rcon.permission = 'admin';
                }
            }
        }

        return { config, changes };
    }

    return {
        DEFAULT_A2S_PORT, DEFAULT_RCON_PORT, ANY_ADDRESS,
        isValidAddress, isValidPort, isValidRconPassword, randomPassword, ensureServerBlocks,
    };
});
