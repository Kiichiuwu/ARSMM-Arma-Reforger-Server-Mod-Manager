const { test } = require('node:test');
const assert = require('node:assert');
const { findOrderIssues, sortByDependencies, moveItem } = require('../shared/load-order');

const mod = (id, ...deps) => ({ modId: id, dependencies: deps.map(d => ({ id: d, name: d })) });
const ids = (list) => list.map(m => m.modId);

test('findOrderIssues aponta só o mod que vem antes de uma dependência presente na lista', () => {
    const list = [mod('A', 'B', 'X'), mod('B'), mod('C', 'B'), mod('D', 'E'), mod('E')];
    const issues = findOrderIssues(list);
    assert.deepStrictEqual([...issues.entries()], [['A', ['B']], ['D', ['E']]]); // X não está na lista: ignorado
    assert.strictEqual(findOrderIssues([mod('B'), mod('A', 'B')]).size, 0);
    assert.strictEqual(findOrderIssues([mod('a', 'A')]).size, 0); // dependência de si mesmo (ID em minúsculas) não conta
});

test('sortByDependencies é estável: só move o necessário e preserva o resto da ordem', () => {
    const list = [mod('A', 'B'), mod('B'), mod('C'), mod('D', 'F'), mod('E'), mod('F')];
    const { order, cycles } = sortByDependencies(list);
    assert.deepStrictEqual(ids(order), ['B', 'A', 'C', 'F', 'D', 'E']);
    assert.deepStrictEqual(cycles, []);
    assert.strictEqual(findOrderIssues(order).size, 0);

    // Lista já correta não muda.
    const ok = [mod('B'), mod('A', 'B'), mod('C', 'A', 'B')];
    assert.deepStrictEqual(ids(sortByDependencies(ok).order), ['B', 'A', 'C']);
    assert.deepStrictEqual(sortByDependencies([]).order, []);
});

test('sortByDependencies resolve cadeias e dependências em minúsculas', () => {
    const list = [mod('A', 'b'), mod('B', 'c'), mod('C')];
    assert.deepStrictEqual(ids(sortByDependencies(list).order), ['C', 'B', 'A']);
});

test('dependência circular não trava e é reportada', () => {
    const list = [mod('A', 'B'), mod('B', 'C'), mod('C', 'A'), mod('D')];
    const { order, cycles } = sortByDependencies(list);
    assert.deepStrictEqual(ids(order), ['A', 'B', 'C', 'D']); // o ciclo mantém a ordem que tinha
    assert.strictEqual(cycles.length, 1);
    assert.deepStrictEqual(cycles[0], ['A', 'B', 'C', 'A']);

    // Ciclo no meio da lista: o resto continua sendo ordenado normalmente.
    const mixed = [mod('R', 'S'), mod('Q', 'P'), mod('P', 'Q'), mod('S'), mod('T', 'P')];
    const sorted = sortByDependencies(mixed);
    assert.deepStrictEqual(ids(sorted.order), ['S', 'R', 'Q', 'P', 'T']);
    assert.deepStrictEqual(sorted.cycles, [['Q', 'P', 'Q']]);

    // Dois ciclos que se cruzam terminam e são reportados uma vez cada.
    const tangled = sortByDependencies([mod('A', 'B', 'C'), mod('B', 'A'), mod('C', 'A')]);
    assert.deepStrictEqual(ids(tangled.order), ['A', 'B', 'C']);
    assert.strictEqual(tangled.cycles.length, 2);
    // Mod que depende de si mesmo não é ciclo.
    assert.deepStrictEqual(sortByDependencies([mod('A', 'A')]).cycles, []);
});

test('IDs duplicados não somem da lista ordenada', () => {
    const dup = [mod('A', 'B'), mod('B'), mod('A', 'B')];
    assert.deepStrictEqual(ids(sortByDependencies(dup).order), ['B', 'A', 'A']);
});

test('moveItem move entre índices reais e ignora índices inválidos', () => {
    assert.deepStrictEqual(moveItem([1, 2, 3, 4], 0, 2), [2, 3, 1, 4]);
    assert.deepStrictEqual(moveItem([1, 2, 3, 4], 3, 0), [4, 1, 2, 3]);
    assert.deepStrictEqual(moveItem([1, 2, 3], 1, 1), [1, 2, 3]);
    assert.deepStrictEqual(moveItem([1, 2, 3], -1, 1), [1, 2, 3]);
    assert.deepStrictEqual(moveItem([1, 2, 3], 1, 3), [1, 2, 3]);
    const original = [1, 2];
    moveItem(original, 0, 1);
    assert.deepStrictEqual(original, [1, 2]); // não altera a lista original
});
