// load-order.js - Ordem de carregamento dos mods (usado pela interface e pelos testes).
// A regra "o array game.mods é a ordem de carga e a dependência vem antes" vem de guias de
// hospedagem, não da documentação da Bohemia: a interface trata como recomendação.
(function (root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory();
    else root.ARSMM_LOAD_ORDER = factory();
})(typeof self !== 'undefined' ? self : this, function () {
    function normalizeId(id) { return String(id || '').toUpperCase(); }
    function depIds(mod) { return (Array.isArray(mod.dependencies) ? mod.dependencies : []).map(d => normalizeId(d && d.id)); }

    // Mods que aparecem antes de alguma dependência: Map(modId -> [ids das dependências que vêm depois]).
    function findOrderIssues(mods) {
        const position = new Map();
        mods.forEach((mod, i) => { if (!position.has(normalizeId(mod.modId))) position.set(normalizeId(mod.modId), i); });
        const issues = new Map();
        mods.forEach((mod, i) => {
            const id = normalizeId(mod.modId);
            const late = depIds(mod).filter(dep => dep !== id && position.has(dep) && position.get(dep) > i);
            if (late.length) issues.set(id, late);
        });
        return issues;
    }

    // Ordenação topológica estável: percorre a lista na ordem atual e, antes de colocar cada mod, coloca as
    // dependências dele que ainda não entraram (na ordem em que já estavam). Quem já está certo não se move.
    // Dependência circular não trava: o ciclo é devolvido em `cycles` e as ligações do ciclo são ignoradas,
    // então os mods dele mantêm a ordem relativa que tinham.
    function sortByDependencies(mods) {
        const byId = new Map();
        for (const mod of mods) if (!byId.has(normalizeId(mod.modId))) byId.set(normalizeId(mod.modId), mod);
        const ignored = new Set(); // ligações "mod>dependência" que fazem parte de um ciclo
        const cycles = [];

        function attempt() {
            const placed = new Set();
            const visiting = [];
            const order = [];
            const found = [];
            function visit(mod) {
                if (placed.has(mod)) return;
                const id = normalizeId(mod.modId);
                const cycleStart = visiting.indexOf(id);
                if (cycleStart >= 0) { found.push(visiting.slice(cycleStart).concat(id)); return; }
                visiting.push(id);
                for (const dep of depIds(mod)) {
                    const depMod = byId.get(dep);
                    if (depMod && depMod !== mod && !ignored.has(`${id}>${dep}`)) visit(depMod);
                }
                visiting.pop();
                placed.add(mod);
                order.push(mod);
            }
            for (const mod of mods) visit(mod);
            return { order, found };
        }

        // Cada rodada ignora as ligações dos ciclos achados; cada ciclo remove ao menos uma ligação, então termina.
        for (;;) {
            const { order, found } = attempt();
            if (!found.length) return { order, cycles };
            for (const cycle of found) {
                const key = cycle.slice(0, -1).slice().sort().join(',');
                if (!cycles.some(c => c.slice(0, -1).slice().sort().join(',') === key)) cycles.push(cycle);
                for (let i = 0; i + 1 < cycle.length; i++) ignored.add(`${cycle[i]}>${cycle[i + 1]}`);
            }
        }
    }

    // Move o item de `from` para `to` (índices reais da lista) e devolve a nova lista.
    function moveItem(list, from, to) {
        const out = list.slice();
        if (from < 0 || from >= out.length || to < 0 || to >= out.length || from === to) return out;
        const [item] = out.splice(from, 1);
        out.splice(to, 0, item);
        return out;
    }

    return { findOrderIssues, sortByDependencies, moveItem };
});
