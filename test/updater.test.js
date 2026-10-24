const { test } = require('node:test');
const assert = require('node:assert');
const { createUpdater, installAndRelaunchCommand, REPO_URL } = require('../backend/updater');

const OLD = 'a'.repeat(40), NEW = 'b'.repeat(40);

// Git falso: responde cada comando a partir do estado do cenário e registra as chamadas.
function fakeGit(over = {}) {
    const s = { head: OLD, remote: NEW, branch: 'main', dirty: '', ancestor: true, changed: 'index.html\nbackend/a2s.js', behind: 3, failFetch: false, ...over };
    const calls = [];
    const runGit = async (args) => {
        calls.push(args.join(' '));
        const [cmd] = args;
        if (cmd === '--version') return 'git version 2.52.0';
        if (cmd === 'rev-parse' && args[1] === 'HEAD') return `${s.head}\n`;
        if (cmd === 'rev-parse' && args[1] === '--abbrev-ref') return `${s.branch}\n`;
        if (cmd === 'rev-parse' && args[1] === 'FETCH_HEAD') return `${s.remote}\n`;
        if (cmd === 'fetch') { if (s.failFetch) throw new Error('Could not resolve host: github.com'); return ''; }
        if (cmd === 'log') return 'Corrige o monitor\n2026-10-24T10:00:00-03:00\n';
        if (cmd === 'rev-list') return `${s.behind}\n`;
        if (cmd === 'merge-base') { if (!s.ancestor) throw new Error('exit 1'); return ''; }
        if (cmd === 'status') return s.dirty;
        if (cmd === 'merge') { s.head = s.remote; return ''; }
        if (cmd === 'diff') return s.changed;
        throw new Error(`comando inesperado: ${args.join(' ')}`);
    };
    return { runGit, calls, s };
}

async function gitUpdater(over) {
    const git = fakeGit(over);
    const updater = createUpdater({ appDir: 'C:/ARSMM', isPackaged: false, version: '1.0.0', runGit: git.runGit, hasGitDir: true });
    await updater.init();
    return { updater, git };
}

test('cópia git atrás da main: encontra a versão nova, avança e pede reinício simples', async () => {
    const { updater, git } = await gitUpdater();
    assert.strictEqual(updater.mode, 'git');
    assert.strictEqual(updater.getStatus().current.commit, OLD);
    const st = await updater.check();
    assert.strictEqual(st.state, 'available');
    assert.deepStrictEqual([st.latest.commit, st.latest.behind, st.latest.subject], [NEW, 3, 'Corrige o monitor']);
    assert.ok(git.calls.includes(`fetch --quiet ${REPO_URL} main`), 'busca direto do GitHub, não do origin local');
    const done = await updater.apply();
    assert.strictEqual(done.state, 'ready');
    assert.strictEqual(done.current.commit, NEW);
    assert.ok(git.calls.includes(`merge --ff-only ${NEW}`));
    assert.deepStrictEqual(updater.restartPlan(), { type: 'relaunch', appDir: 'C:/ARSMM' });
    // Depois de aplicado, verificar de novo não desfaz o "pronto para reiniciar".
    assert.strictEqual((await updater.check()).state, 'ready');
});

test('mudou package.json ou package-lock: instala dependências no reinício', async () => {
    const { updater } = await gitUpdater({ changed: 'index.html\npackage-lock.json\n' });
    await updater.check();
    const done = await updater.apply();
    assert.strictEqual(done.needsInstall, true);
    assert.strictEqual(updater.restartPlan().type, 'install-and-relaunch');
});

test('já na última versão: nada a fazer', async () => {
    const { updater, git } = await gitUpdater({ remote: OLD });
    assert.strictEqual((await updater.check()).state, 'up-to-date');
    assert.strictEqual((await updater.apply()).state, 'up-to-date');
    assert.ok(!git.calls.some(c => c.startsWith('merge ')));
    assert.strictEqual(updater.restartPlan(), null);
});

test('não atualiza com alteração local, em outra branch ou com commits que não estão no GitHub', async () => {
    for (const [over, reason] of [[{ dirty: ' M index.html\n' }, 'dirty'], [{ branch: 'feat/x' }, 'branch'], [{ ancestor: false }, 'diverged']]) {
        const { updater, git } = await gitUpdater(over);
        const st = await updater.check();
        assert.deepStrictEqual([st.state, st.reason], ['blocked', reason], reason);
        assert.strictEqual((await updater.apply()).state, 'blocked');
        assert.ok(!git.calls.some(c => c.startsWith('merge ')), `não pode avançar com ${reason}`);
    }
});

test('sem internet: estado de erro, sem mexer nos arquivos', async () => {
    const { updater, git } = await gitUpdater({ failFetch: true });
    const st = await updater.check();
    assert.strictEqual(st.state, 'error');
    assert.match(st.error, /resolve host/);
    assert.ok(!git.calls.some(c => c.startsWith('merge ')));
});

test('duas verificações ao mesmo tempo viram uma só', async () => {
    const { updater, git } = await gitUpdater();
    await Promise.all([updater.check(), updater.check()]);
    assert.strictEqual(git.calls.filter(c => c.startsWith('fetch')).length, 1);
});

test('sem git (ou sem a pasta .git) e fora do instalador: sem atualização', async () => {
    const noGit = createUpdater({ isPackaged: false, version: '1.0.0', hasGitDir: true, runGit: async () => { throw new Error('git não encontrado'); } });
    await noGit.init();
    assert.strictEqual(noGit.mode, 'none');
    assert.strictEqual((await noGit.check()).state, 'unsupported');
    const noDir = createUpdater({ isPackaged: false, version: '1.0.0', hasGitDir: false, runGit: async () => '' });
    await noDir.init();
    assert.strictEqual(noDir.mode, 'none');
});

test('instalado (release): usa o electron-updater, baixa e instala ao reiniciar', async () => {
    const events = {};
    const auto = {
        on: (name, fn) => { events[name] = fn; },
        checkForUpdates: async () => ({ isUpdateAvailable: true, updateInfo: { version: '1.1.0', releaseDate: '2026-10-25' } }),
        downloadUpdate: async () => { events['download-progress']({ percent: 50 }); return []; },
    };
    const updater = createUpdater({ isPackaged: true, version: '1.0.0', autoUpdater: auto });
    await updater.init();
    assert.strictEqual(updater.mode, 'release');
    assert.strictEqual(auto.autoDownload, false, 'só baixa quando a regra mandar');
    const st = await updater.check();
    assert.deepStrictEqual([st.state, st.latest.version], ['available', '1.1.0']);
    const seen = [];
    updater.onChange(s => seen.push(s.state));
    assert.strictEqual((await updater.apply()).state, 'ready');
    assert.ok(seen.includes('downloading'));
    assert.deepStrictEqual(updater.restartPlan(), { type: 'quit-and-install' });
});

test('instalado sem nenhuma Release publicada: aviso, não erro', async () => {
    const auto = { on: () => {}, checkForUpdates: async () => { throw new Error('HttpError: 404 Not Found'); } };
    const updater = createUpdater({ isPackaged: true, version: '1.0.0', autoUpdater: auto });
    await updater.init();
    const st = await updater.check();
    assert.deepStrictEqual([st.state, st.reason], ['blocked', 'no-release']);
    const older = createUpdater({ isPackaged: true, version: '1.2.0', autoUpdater: { on: () => {}, checkForUpdates: async () => ({ updateInfo: { version: '1.1.0' } }) } });
    await older.init();
    assert.strictEqual((await older.check()).state, 'up-to-date');
});

test('comando de reinício com instalação espera o app fechar, roda npm install e abre de novo', () => {
    const cmd = installAndRelaunchCommand('C:\\ARSMM\\node_modules\\electron\\dist\\electron.exe', ['.']);
    assert.match(cmd, /^ping -n 4 127\.0\.0\.1 >nul & npm install --no-audit --no-fund & start "" "C:\\ARSMM\\node_modules\\electron\\dist\\electron\.exe" "\."$/);
});
