// updater.js - Atualização do ARSMM pela última versão do GitHub (Kiichiuwu/ARSMM-Arma-Reforger-Server-Mod-Manager).
// Dois modos, escolhidos pelo jeito como o app está rodando:
//  - git: o app roda de uma cópia git (start.bat ou npm start). Busca a branch main do GitHub e, se a cópia local
//    só estiver atrás (fast-forward), avança. Não mexe em nada se houver alteração local em arquivo versionado,
//    se a cópia estiver em outra branch ou se tiver commits que não estão no GitHub. Se package.json ou
//    package-lock.json mudaram, as dependências são instaladas no reinício: com o app aberto, o Windows trava os
//    arquivos do Electron em node_modules.
//  - release: app instalado pelo instalador (electron-builder). Usa o electron-updater com as Releases do GitHub
//    (latest.yml publicado junto com o instalador), que confere o arquivo baixado antes de instalar.
const path = require('path');
const { compareModVersion } = require('../shared/game-version');

const REPO = 'Kiichiuwu/ARSMM-Arma-Reforger-Server-Mod-Manager';
const BRANCH = 'main';
const REPO_URL = `https://github.com/${REPO}.git`;
const DEP_FILES = new Set(['package.json', 'package-lock.json']);

// runGit(args) -> Promise<stdout> (rejeita se o git sair com erro); autoUpdater: o do electron-updater.
function createUpdater({ appDir, isPackaged, version, runGit, autoUpdater, hasGitDir, log = () => {} }) {
    const listeners = new Set();
    let mode = 'none';
    let busy = null;
    let status = { mode, state: 'idle', current: { version: String(version || '') } };

    function set(changes) {
        status = { ...status, ...changes, mode };
        for (const fn of listeners) {
            try { fn(getStatus()); } catch (e) { /* um ouvinte com erro não para os outros */ }
        }
        return getStatus();
    }

    function getStatus() {
        return JSON.parse(JSON.stringify(status));
    }

    // Uma operação por vez: duas verificações ao mesmo tempo (automática + botão) viram a mesma.
    function exclusive(fn) {
        if (!busy) busy = fn().finally(() => { busy = null; });
        return busy;
    }

    async function init() {
        if (isPackaged) {
            mode = autoUpdater ? 'release' : 'none';
        } else if (hasGitDir && runGit) {
            mode = await runGit(['--version']).then(() => 'git', () => 'none');
        }
        if (mode === 'release') {
            autoUpdater.autoDownload = false;
            autoUpdater.autoInstallOnAppQuit = false;
            autoUpdater.on('download-progress', (p) => set({ state: 'downloading', progress: Math.round((p && p.percent) || 0) }));
        }
        if (mode === 'git') {
            const commit = (await runGit(['rev-parse', 'HEAD']).catch(() => '')).trim();
            set({ current: { version: String(version || ''), commit } });
        } else {
            set({});
        }
        return getStatus();
    }

    // --- git ---
    async function checkGit() {
        const head = (await runGit(['rev-parse', 'HEAD'])).trim();
        const branch = (await runGit(['rev-parse', '--abbrev-ref', 'HEAD'])).trim();
        await runGit(['fetch', '--quiet', REPO_URL, BRANCH]);
        const remote = (await runGit(['rev-parse', 'FETCH_HEAD'])).trim();
        const current = { version: String(version || ''), commit: head };
        if (remote === head) return set({ state: 'up-to-date', current, latest: { commit: remote, behind: 0 }, reason: '', error: '' });

        const [subject = '', date = ''] = (await runGit(['log', '-1', '--format=%s%n%cI', remote])).split('\n');
        const behind = Number((await runGit(['rev-list', '--count', `${head}..${remote}`])).trim()) || 0;
        const latest = { commit: remote, subject: subject.trim(), date: date.trim(), behind };
        const isAncestor = await runGit(['merge-base', '--is-ancestor', head, remote]).then(() => true, () => false);
        let reason = '';
        if (!isAncestor) reason = 'diverged';
        else if (branch !== BRANCH) reason = 'branch';
        else if ((await runGit(['status', '--porcelain', '--untracked-files=no'])).trim()) reason = 'dirty';
        return set({ state: reason ? 'blocked' : 'available', current, latest, reason, branch, error: '' });
    }

    async function applyGit() {
        const { current, latest } = status;
        await runGit(['merge', '--ff-only', latest.commit]);
        const changed = (await runGit(['diff', '--name-only', current.commit, latest.commit])).split('\n').map(f => f.trim()).filter(Boolean);
        const needsInstall = changed.some(f => DEP_FILES.has(f));
        log('info', `ARSMM atualizado de ${current.commit.slice(0, 7)} para ${latest.commit.slice(0, 7)} (${latest.behind} commit(s))${needsInstall ? '; dependências serão instaladas no reinício' : ''}.`);
        return set({ state: 'ready', needsInstall, updatedFrom: current.commit, current: { ...current, commit: latest.commit } });
    }

    // --- release (electron-updater) ---
    async function checkRelease() {
        let result;
        try {
            result = await autoUpdater.checkForUpdates();
        } catch (e) {
            // Sem nenhuma Release publicada o GitHub responde 404: não é erro de quem usa o app.
            if (/404|no published versions|unable to find latest version/i.test(String(e && e.message))) {
                return set({ state: 'blocked', reason: 'no-release', error: '' });
            }
            throw e;
        }
        const info = (result && result.updateInfo) || {};
        const newer = result && typeof result.isUpdateAvailable === 'boolean'
            ? result.isUpdateAvailable
            : compareModVersion(info.version, version) === 1;
        const latest = { version: String(info.version || ''), date: String(info.releaseDate || '') };
        return set({ state: newer ? 'available' : 'up-to-date', latest, reason: '', error: '' });
    }

    async function applyRelease() {
        set({ state: 'downloading', progress: 0 });
        await autoUpdater.downloadUpdate();
        log('info', `Versão ${status.latest.version} do ARSMM baixada; instala ao reiniciar.`);
        return set({ state: 'ready', progress: 100 });
    }

    function check() {
        return exclusive(async () => {
            if (mode === 'none') return set({ state: 'unsupported' });
            if (status.state === 'ready') return getStatus(); // já atualizado, falta reiniciar
            set({ state: 'checking', error: '' });
            try {
                const result = mode === 'git' ? await checkGit() : await checkRelease();
                set({ checkedAt: new Date().toISOString() });
                return result;
            } catch (e) {
                log('warn', `Verificação de atualização falhou: ${e.message}`);
                return set({ state: 'error', error: e.message, checkedAt: new Date().toISOString() });
            }
        });
    }

    function apply() {
        return exclusive(async () => {
            if (status.state !== 'available') return getStatus();
            try {
                return mode === 'git' ? await applyGit() : await applyRelease();
            } catch (e) {
                log('error', `Atualização falhou: ${e.message}`);
                return set({ state: 'error', error: e.message });
            }
        });
    }

    // Como reiniciar depois de aplicar: o main executa (precisa fechar a janela salvando o perfil antes).
    function restartPlan() {
        if (status.state !== 'ready') return null;
        if (mode === 'release') return { type: 'quit-and-install' };
        return { type: status.needsInstall ? 'install-and-relaunch' : 'relaunch', appDir };
    }

    function onChange(fn) {
        listeners.add(fn);
        return () => listeners.delete(fn);
    }

    return { init, check, apply, getStatus, restartPlan, onChange, get mode() { return mode; } };
}

// Linha de comando (Windows) que espera o app fechar, instala as dependências e abre o app de novo.
function installAndRelaunchCommand(execPath, args) {
    const quote = (s) => `"${String(s).replace(/"/g, '')}"`;
    return `ping -n 4 127.0.0.1 >nul & npm install --no-audit --no-fund & start "" ${[execPath, ...args].map(quote).join(' ')}`;
}

module.exports = { createUpdater, installAndRelaunchCommand, REPO, BRANCH, REPO_URL };
