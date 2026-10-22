// logger.js - Terminal ao vivo dividido em fluxos: main (processo principal), backend (módulos), ui (interface)
// e errors (todo level 'error', de qualquer origem). Cada fluxo guarda as últimas `limit` entradas.
const { BackendError } = require('./util');

const STREAMS = ['main', 'backend', 'ui', 'errors'];
const SOURCES = new Set(['main', 'backend', 'ui']);
const LEVELS = { error: 'error', err: 'error', warn: 'warn', warning: 'warn', log: 'info', info: 'info', debug: 'info', verbose: 'info' };
const MAX_MESSAGE_LENGTH = 2000;

function createLogger({
    limit = 200,
    emit = () => {},
    console: output = console,
    now = () => new Date().toLocaleTimeString(),
    clock = () => Date.now(),
} = {}) {
    const buffers = Object.fromEntries(STREAMS.map(stream => [stream, []]));
    let seq = 0;

    function push(stream, entry) {
        const buffer = buffers[stream];
        buffer.push(entry);
        if (buffer.length > limit) buffer.splice(0, buffer.length - limit);
    }

    // seq cresce sempre: a interface usa para juntar fluxos na ordem em que as entradas aconteceram.
    function log({ source, module, level, msg }) {
        const entry = {
            seq: ++seq,
            source: SOURCES.has(source) ? source : 'backend',
            module: String(module || '').slice(0, 40),
            level: LEVELS[String(level || '').toLowerCase()] || 'info',
            msg: String(msg).slice(0, MAX_MESSAGE_LENGTH),
            time: now(),
        };
        if (output) (entry.level === 'error' ? output.error : output.log)(`[${entry.source}:${entry.module}] ${entry.msg}`);
        push(entry.source, entry);
        if (entry.level === 'error') push('errors', entry);
        try { emit(entry); } catch (e) { /* a janela pode ter fechado no meio */ }
        return entry;
    }

    // log já marcado com origem e módulo, no formato (type, msg) que os módulos do backend já usam.
    // dedupeMs > 0: a mesma mensagem (mesmo nível) repetida dentro do intervalo é ignorada
    // (ex.: o Monitor consulta a cada 15 s um servidor desligado).
    function scoped(module, source = 'backend', { dedupeMs = 0 } = {}) {
        const lastSeen = new Map();
        return (type, msg) => {
            if (dedupeMs > 0) {
                const key = `${type}|${msg}`;
                const at = clock();
                const previous = lastSeen.get(key);
                if (previous !== undefined && at - previous < dedupeMs) return null;
                lastSeen.set(key, at);
                if (lastSeen.size > 500) lastSeen.delete(lastSeen.keys().next().value);
            }
            return log({ source, module, level: type, msg });
        };
    }

    function recent(stream = 'main') {
        if (!STREAMS.includes(stream)) throw new BackendError('INVALID', 'Fluxo de log inválido.');
        return buffers[stream].slice();
    }

    return { log, scoped, recent, streams: STREAMS.slice() };
}

module.exports = { createLogger, STREAMS };
