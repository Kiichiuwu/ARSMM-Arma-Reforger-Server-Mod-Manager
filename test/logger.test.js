const { test } = require('node:test');
const assert = require('node:assert');
const { createLogger, STREAMS } = require('../backend/logger');

const silent = { log() {}, error() {} };
const make = (options = {}) => createLogger({ console: silent, now: () => '12:00:00', ...options });

test('cada entrada tem origem, módulo, nível, mensagem e hora, e vai para o fluxo da origem', () => {
    const emitted = [];
    const logger = make({ emit: e => emitted.push(e) });
    const entry = logger.log({ source: 'main', module: 'sistema', level: 'log', msg: 'olá' });
    assert.deepStrictEqual(entry, { seq: 1, source: 'main', module: 'sistema', level: 'info', msg: 'olá', time: '12:00:00' });
    assert.deepStrictEqual(logger.recent('main'), [entry]);
    assert.deepStrictEqual(logger.recent('backend'), []);
    assert.deepStrictEqual(logger.recent('errors'), []);
    assert.deepStrictEqual(emitted, [entry]);
    assert.deepStrictEqual(STREAMS, ['main', 'backend', 'ui', 'errors']);
    assert.deepStrictEqual(logger.streams, STREAMS);
});

test('o fluxo "errors" reúne todo level error de todas as origens, e só eles', () => {
    const logger = make();
    logger.log({ source: 'main', module: 'sistema', level: 'error', msg: 'e1' });
    logger.log({ source: 'backend', module: 'workshop', level: 'warn', msg: 'w1' });
    logger.log({ source: 'backend', module: 'rcon', level: 'error', msg: 'e2' });
    logger.log({ source: 'ui', module: 'console', level: 'error', msg: 'e3' });
    logger.log({ source: 'ui', module: 'console', level: 'info', msg: 'i1' });
    assert.deepStrictEqual(logger.recent('errors').map(e => e.msg), ['e1', 'e2', 'e3']);
    assert.deepStrictEqual(logger.recent('backend').map(e => `${e.level}:${e.msg}`), ['warn:w1', 'error:e2']);
    assert.deepStrictEqual(logger.recent('ui').map(e => e.msg), ['e3', 'i1']);
    assert.deepStrictEqual(logger.recent('main').map(e => e.msg), ['e1']);
});

test('scoped() mantém a assinatura (type, msg) dos módulos e traduz os tipos', () => {
    const logger = make();
    const log = logger.scoped('workshop');
    log('log', 'baixando');
    log('error', 'falhou');
    log('warn', 'cuidado');
    log('qualquer', 'x');
    assert.deepStrictEqual(logger.recent('backend').map(e => [e.source, e.module, e.level]),
        [['backend', 'workshop', 'info'], ['backend', 'workshop', 'error'], ['backend', 'workshop', 'warn'], ['backend', 'workshop', 'info']]);
    const mainLog = logger.scoped('sistema', 'main');
    mainLog('log', 'pronto');
    assert.deepStrictEqual(logger.recent('main').map(e => [e.source, e.module]), [['main', 'sistema']]);
});

test('cada fluxo respeita o limite, e o limite do fluxo de erros é independente', () => {
    const logger = make({ limit: 3 });
    for (let i = 1; i <= 5; i++) logger.log({ source: 'backend', module: 'm', level: 'error', msg: String(i) });
    for (let i = 6; i <= 7; i++) logger.log({ source: 'backend', module: 'm', level: 'info', msg: String(i) });
    assert.deepStrictEqual(logger.recent('backend').map(e => e.msg), ['5', '6', '7']);
    assert.deepStrictEqual(logger.recent('errors').map(e => e.msg), ['3', '4', '5']);
});

test('recent() devolve cópia, rejeita fluxo inválido e usa "main" por padrão', () => {
    const logger = make();
    logger.log({ source: 'main', module: 'm', level: 'info', msg: 'a' });
    const copy = logger.recent('main');
    copy.push('lixo');
    assert.strictEqual(logger.recent('main').length, 1);
    assert.strictEqual(logger.recent().length, 1);
    for (const bad of ['tudo', '', null, '__proto__', 'constructor']) {
        assert.throws(() => logger.recent(bad), { code: 'INVALID' });
    }
});

test('origem desconhecida vira backend, mensagem é texto limitado e objeto não quebra', () => {
    const logger = make();
    const entry = logger.log({ source: 'hacker', module: 'x'.repeat(100), level: 'ERROR', msg: 'y'.repeat(5000) });
    assert.strictEqual(entry.source, 'backend');
    assert.strictEqual(entry.module.length, 40);
    assert.strictEqual(entry.level, 'error');
    assert.strictEqual(entry.msg.length, 2000);
    assert.strictEqual(logger.log({ source: 'ui', module: 'console', level: 'info', msg: { a: 1 } }).msg, '[object Object]');
    assert.strictEqual(logger.log({ source: 'ui', module: 'console', level: undefined, msg: undefined }).level, 'info');
});

test('seq cresce entre fluxos, para a interface juntar na ordem certa', () => {
    const logger = make();
    logger.log({ source: 'main', module: 'a', level: 'info', msg: '1' });
    logger.log({ source: 'ui', module: 'b', level: 'info', msg: '2' });
    logger.log({ source: 'main', module: 'a', level: 'info', msg: '3' });
    const merged = [...logger.recent('main'), ...logger.recent('ui')].sort((a, b) => a.seq - b.seq).map(e => e.msg);
    assert.deepStrictEqual(merged, ['1', '2', '3']);
});

test('scoped com dedupeMs ignora a mesma mensagem repetida dentro do intervalo', () => {
    let now = 0;
    const logger = make({ clock: () => now });
    const log = logger.scoped('a2s', 'backend', { dedupeMs: 60000 });
    assert.ok(log('warn', 'sem resposta'));
    now = 15000;
    assert.strictEqual(log('warn', 'sem resposta'), null);
    assert.ok(log('error', 'sem resposta')); // outro nível conta como outra mensagem
    assert.ok(log('warn', 'outra coisa'));
    now = 61000;
    assert.ok(log('warn', 'sem resposta'));
    assert.strictEqual(logger.recent('backend').length, 4);
});

test('erro no emit (janela fechada) não derruba o logger', () => {
    const logger = make({ emit: () => { throw new Error('janela destruída'); } });
    assert.doesNotThrow(() => logger.log({ source: 'main', module: 'm', level: 'error', msg: 'x' }));
    assert.strictEqual(logger.recent('errors').length, 1);
});
