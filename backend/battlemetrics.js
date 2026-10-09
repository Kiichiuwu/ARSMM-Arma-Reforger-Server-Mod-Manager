// battlemetrics.js - Dados públicos do servidor no BattleMetrics (exige token de API).
const { BackendError } = require('./util');

const REQUEST_TIMEOUT_MS = 8000;

function createBattlemetrics({ getToken, fetchImpl = globalThis.fetch, log = () => {} }) {
    async function getServer(id) {
        id = String(id);
        if (!/^\d{1,12}$/.test(id)) throw new BackendError('INVALID', 'O ID do BattleMetrics deve ser numérico.');

        const token = await getToken();
        const headers = { 'User-Agent': 'ARSMM/1.0', Accept: 'application/json' };
        if (token) headers.Authorization = `Bearer ${token}`;

        let res;
        try {
            res = await fetchImpl(`https://api.battlemetrics.com/servers/${id}?include=player`, {
                headers,
                signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
            });
        } catch (e) {
            log('error', `[BATTLEMETRICS] Falha ao buscar ID ${id}: ${e.message}`);
            throw new BackendError('UPSTREAM', 'Não foi possível contatar o BattleMetrics.');
        }

        const body = await res.json().catch(() => ({}));
        if (res.ok) return body;

        if (res.status === 401 || res.status === 403) {
            throw token
                ? new BackendError('TOKEN_REJECTED', 'O BattleMetrics recusou o token configurado.')
                : new BackendError('NEEDS_TOKEN', 'O BattleMetrics exige um token de API. Configure-o na aba Monitor.');
        }
        if (res.status === 404) throw new BackendError('NOT_FOUND', 'Servidor não encontrado no BattleMetrics.');
        const detail = body?.errors?.[0]?.detail || `O BattleMetrics respondeu ${res.status}.`;
        log('error', `[BATTLEMETRICS] Falha ao buscar ID ${id}: ${detail}`);
        throw new BackendError('UPSTREAM', detail);
    }

    return { getServer };
}

module.exports = { createBattlemetrics };
