// update-ui.js - Parte visual da atualização do ARSMM, igual na tela inicial e no painel: a chave "Atualização
// automática", a versão atual, o estado da última verificação e o aviso com o botão para atualizar ou reiniciar.
// describe() é pura (usada pelos testes); mount() liga os elementos da página ao backend pelo preload.
(function (root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory();
    else root.ARSMM_UPDATE_UI = factory();
})(typeof self !== 'undefined' ? self : this, function () {
    const STRINGS = {
        'pt-BR': {
            label: 'Atualização automática',
            check: 'Verificar agora',
            checking: 'Procurando atualização...',
            upToDate: 'Você está na versão mais recente.',
            available: 'Nova versão do ARSMM disponível',
            changes: '{n} alteração(ões)',
            downloading: 'Baixando a atualização...',
            ready: 'ARSMM atualizado. Reinicie para usar a versão nova.',
            readyInstall: 'ARSMM atualizado. Ao reiniciar, as dependências novas são instaladas (abre uma janela do npm).',
            update: 'ATUALIZAR',
            restart: 'REINICIAR AGORA',
            error: 'Não deu para verificar: ',
            dirty: 'Atualização pausada: há alterações locais nos arquivos do ARSMM.',
            branch: 'Atualização pausada: a cópia está na branch "{branch}", não na main.',
            diverged: 'Atualização pausada: a cópia tem commits que não estão no GitHub.',
            noRelease: 'Nenhuma versão publicada no GitHub ainda.',
            unsupported: 'Esta cópia não se atualiza sozinha (sem git e fora do instalador).',
            last: 'última verificação',
        },
        'en-US': {
            label: 'Automatic updates',
            check: 'Check now',
            checking: 'Checking for updates...',
            upToDate: 'You are on the latest version.',
            available: 'New ARSMM version available',
            changes: '{n} change(s)',
            downloading: 'Downloading the update...',
            ready: 'ARSMM updated. Restart to use the new version.',
            readyInstall: 'ARSMM updated. Restarting installs the new dependencies (an npm window opens).',
            update: 'UPDATE',
            restart: 'RESTART NOW',
            error: 'Could not check: ',
            dirty: 'Updates paused: there are local changes in the ARSMM files.',
            branch: 'Updates paused: this copy is on branch "{branch}", not main.',
            diverged: 'Updates paused: this copy has commits that are not on GitHub.',
            noRelease: 'No version published on GitHub yet.',
            unsupported: 'This copy does not update itself (no git and not installed).',
            last: 'last check',
        },
    };

    function strings(lang) {
        return STRINGS[lang] || STRINGS['pt-BR'];
    }

    function versionText(status) {
        const current = (status && status.current) || {};
        const version = current.version ? `v${current.version}` : '';
        const commit = current.commit ? String(current.commit).slice(0, 7) : '';
        return [version, commit].filter(Boolean).join(' · ');
    }

    // Texto da linha de estado e do aviso (banner) para um status do backend.
    function describe(status, lang) {
        const s = strings(lang);
        const st = (status && status.state) || 'idle';
        const latest = (status && status.latest) || {};
        const what = latest.version ? `v${latest.version}`
            : [latest.behind ? s.changes.replace('{n}', latest.behind) : '', latest.subject || ''].filter(Boolean).join(': ');
        switch (st) {
            case 'checking': return { line: s.checking, banner: null };
            case 'up-to-date': return { line: s.upToDate, banner: null };
            case 'available': {
                const text = what ? `${s.available} (${what})` : s.available;
                return { line: text, banner: { text, action: 'apply', button: s.update } };
            }
            case 'downloading': {
                const text = status.progress ? `${s.downloading} ${status.progress}%` : s.downloading;
                return { line: text, banner: { text, action: null } };
            }
            case 'ready': {
                const text = status.needsInstall ? s.readyInstall : s.ready;
                return { line: text, banner: { text, action: 'restart', button: s.restart } };
            }
            case 'blocked': {
                const map = { dirty: s.dirty, branch: s.branch.replace('{branch}', status.branch || '?'), diverged: s.diverged, 'no-release': s.noRelease };
                return { line: map[status.reason] || '', banner: null };
            }
            case 'error': return { line: s.error + (status.error || ''), banner: null };
            case 'unsupported': return { line: s.unsupported, banner: null };
            default: return { line: '', banner: null };
        }
    }

    // ids esperados na página: chkAutoUpdate, autoUpdateLabel, updateVersion, updateStatus, btnCheckUpdate,
    // updateBanner, updateBannerText, updateBannerBtn. Os que faltarem são ignorados.
    function mount({ bridge, api, getLang, document: doc = document }) {
        const $ = (id) => doc.getElementById(id);
        let status = null;
        let busy = false;

        function render() {
            const s = strings(getLang());
            if ($('autoUpdateLabel')) $('autoUpdateLabel').textContent = s.label;
            if ($('btnCheckUpdate')) {
                $('btnCheckUpdate').textContent = s.check;
                $('btnCheckUpdate').disabled = busy || !status || status.mode === 'none';
            }
            if (!status) return;
            if ($('updateVersion')) $('updateVersion').textContent = versionText(status);
            const view = describe(status, getLang());
            if ($('updateStatus')) $('updateStatus').textContent = view.line;
            const banner = $('updateBanner');
            if (!banner) return;
            banner.style.display = view.banner ? 'flex' : 'none';
            if (!view.banner) return;
            $('updateBannerText').textContent = view.banner.text;
            const btn = $('updateBannerBtn');
            btn.style.display = view.banner.action ? '' : 'none';
            btn.textContent = view.banner.button || '';
            btn.disabled = busy;
            btn.onclick = () => run(view.banner.action === 'restart' ? bridge.updater.restart : bridge.updater.apply);
        }

        async function run(call) {
            if (busy) return;
            busy = true;
            render();
            try {
                const result = await api(call());
                if (result && result.state) status = result;
            } catch (e) {
                status = { ...(status || {}), state: 'error', error: e.message };
            } finally {
                busy = false;
                render();
            }
        }

        async function start() {
            bridge.on('app-update', (next) => { status = next; render(); });
            try {
                const [current, settings] = await Promise.all([api(bridge.updater.status()), api(bridge.settings.get())]);
                status = current;
                if ($('chkAutoUpdate')) $('chkAutoUpdate').checked = settings.autoUpdate !== false;
            } catch (e) {
                status = { state: 'error', error: e.message };
            }
            if ($('chkAutoUpdate')) {
                $('chkAutoUpdate').onchange = async () => {
                    const on = $('chkAutoUpdate').checked;
                    try {
                        await api(bridge.settings.update({ autoUpdate: on }));
                        if (on) run(bridge.updater.check); // ligou: já procura (e aplica, se houver)
                    } catch (e) {
                        $('chkAutoUpdate').checked = !on;
                    }
                };
            }
            if ($('btnCheckUpdate')) $('btnCheckUpdate').onclick = () => run(bridge.updater.check);
            render();
        }

        start();
        return { render };
    }

    return { STRINGS, describe, versionText, mount };
});
