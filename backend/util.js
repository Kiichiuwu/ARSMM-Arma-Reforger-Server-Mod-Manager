// util.js - Erros com código (repassados à interface) e escrita atômica de arquivos.
const crypto = require('crypto');
const fsp = require('fs/promises');

// Erro "esperado": a mensagem é mostrada ao usuário e o código permite reagir (ex.: NEEDS_TOKEN).
class BackendError extends Error {
    constructor(code, message) {
        super(message);
        this.code = code;
    }
}

function isPlainObject(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}

// Grava num temporário único e renomeia: um travamento no meio nunca deixa o arquivo pela metade.
// Gravações no mesmo arquivo entram em fila, então a última sempre vence inteira.
const writeQueues = new Map();
function writeFileAtomic(filePath, content) {
    const previous = writeQueues.get(filePath) || Promise.resolve();
    const run = previous.catch(() => {}).then(async () => {
        const tmp = `${filePath}.${process.pid}.${crypto.randomUUID()}.tmp`;
        try {
            await fsp.writeFile(tmp, content, 'utf8');
            await fsp.rename(tmp, filePath);
        } catch (e) {
            await fsp.unlink(tmp).catch(() => {});
            throw e;
        }
    });
    writeQueues.set(filePath, run);
    run.finally(() => { if (writeQueues.get(filePath) === run) writeQueues.delete(filePath); }).catch(() => {});
    return run;
}

async function readJson(filePath, fallback) {
    try {
        return JSON.parse(await fsp.readFile(filePath, 'utf8'));
    } catch (e) {
        return fallback;
    }
}

module.exports = { BackendError, isPlainObject, writeFileAtomic, readJson };
