/**
 * RadioBox – AutoPlay | audio-output.js
 * Sélection de la carte son de sortie de l'automate.
 * Inspiré de la méthode CartWall (FONCTIONNE/app.js).
 * Fonctionne sur Chrome (via AudioContext.setSinkId) et Firefox (via selectAudioOutput).
 */

import { applyAudioOutput } from './player.js';

let selectedOutputDeviceId = localStorage.getItem('audioOutputDeviceId') || 'default';
let selectedOutputLabel    = localStorage.getItem('audioOutputLabel')    || '';

/* ── Enumerate outputs ─────────────────────────────────────── */

async function enumerateOutputs() {
    if (!navigator.mediaDevices?.enumerateDevices) return [];
    const all = await navigator.mediaDevices.enumerateDevices();
    return all.filter(d => d.kind === 'audiooutput');
}

/* ── Apply a device ────────────────────────────────────────── */

async function applyDevice(deviceId, label) {
    selectedOutputDeviceId = deviceId;
    selectedOutputLabel    = label || '';
    localStorage.setItem('audioOutputDeviceId', deviceId);
    localStorage.setItem('audioOutputLabel',    selectedOutputLabel);
    await applyAudioOutput(deviceId);
    updateBtnLabel();
}

/* ── Update button label ───────────────────────────────────── */

function updateBtnLabel() {
    const btn = document.getElementById('audioOutputBtn');
    if (!btn) return;
    const short = selectedOutputLabel
        ? selectedOutputLabel.replace(/\s*\(.*\)\s*$/, '').trim()
        : '';
    btn.textContent = short ? `🔊 ${short}` : '🔊 Carte son de sortie';
    btn.title = selectedOutputLabel || "Choisir la carte son de sortie de l'automate";
}

/* ── Populate panel ────────────────────────────────────────── */

async function populateAudioOutputPanel(panel, anchorBtn) {
    panel.innerHTML = '<div class="aop-msg">Détection des cartes son…</div>';

    const outputs = await enumerateOutputs();
    panel.innerHTML = '';

    // Classify
    const defaultDev = outputs.find(d => d.deviceId === 'default');
    const commDev    = outputs.find(d => d.deviceId === 'communications');
    const others       = outputs.filter(d => d.deviceId !== 'default' && d.deviceId !== 'communications');
    const hasUnlabelled = others.length === 0 || others.some(d => !d.label);

    // Build ordered list
    const list = [
        { deviceId: 'default', label: defaultDev?.label || 'Sortie par défaut du système' },
    ];
    let unnamed = 0;
    others.forEach(d => {
        unnamed++;
        list.push({ deviceId: d.deviceId, label: d.label || `Sortie audio ${unnamed}` });
    });
    if (commDev) list.push({ deviceId: 'communications', label: commDev.label || 'Sortie de communication' });

    list.forEach(dev => {
        const isActive = dev.deviceId === selectedOutputDeviceId;
        const item = document.createElement('div');
        item.className = 'aop-item' + (isActive ? ' aop-active' : '');
        item.title = dev.label;
        item.innerHTML = `<span class="aop-check">${isActive ? '✓' : ''}</span><span class="aop-label">${dev.label}</span>`;
        item.addEventListener('click', async () => {
            await applyDevice(dev.deviceId, dev.label);
            panel.remove();
        });
        panel.appendChild(item);
    });

    const sep = document.createElement('div');
    sep.className = 'aop-sep';
    panel.appendChild(sep);

    if (navigator.mediaDevices && typeof navigator.mediaDevices.selectAudioOutput === 'function') {
        // Firefox / navigateur avec selectAudioOutput natif
        const btnBrowse = document.createElement('div');
        btnBrowse.className = 'aop-item aop-unlock';
        btnBrowse.innerHTML = '<span class="aop-check">🔊</span><span class="aop-label">Parcourir les cartes son de sortie…</span>';
        btnBrowse.title = 'Ouvre le sélecteur natif du navigateur';
        btnBrowse.addEventListener('click', async e => {
            e.stopPropagation();
            try {
                const device = await navigator.mediaDevices.selectAudioOutput();
                await applyDevice(device.deviceId, device.label);
                panel.remove();
                openAudioOutputPanel(anchorBtn);
            } catch (_) { /* annulé */ }
        });
        panel.appendChild(btnBrowse);
    } else if (hasUnlabelled) {
        // Chrome : technique getUserMedia pour révéler les noms des périphériques
        // Affiché uniquement si les vrais labels ne sont pas encore disponibles.
        // Le stream est coupé immédiatement — le micro n'est pas utilisé pour la lecture
        const btnUnlock = document.createElement('div');
        btnUnlock.className = 'aop-item aop-unlock';
        btnUnlock.innerHTML = '<span class="aop-check">🔓</span><span class="aop-label">Autoriser pour voir les autres cartes son</span>';
        btnUnlock.title = 'Requiert une autorisation momentanée — le micro ne sera pas utilisé';
        btnUnlock.addEventListener('click', async e => {
            e.stopPropagation();
            try {
                const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
                stream.getTracks().forEach(t => t.stop());
                panel.remove();
                openAudioOutputPanel(anchorBtn); // ré-ouvre avec les vrais noms
            } catch (_) {
                const errNote = document.createElement('div');
                errNote.className = 'aop-msg';
                errNote.textContent = "⚠ Permission refusée — impossible d'afficher les vrais noms.";
                btnUnlock.replaceWith(errNote);
            }
        });
        panel.appendChild(btnUnlock);
    }
}

/* ── Open / close panel ────────────────────────────────────── */

async function openAudioOutputPanel(anchorBtn) {
    const existing = document.getElementById('audioOutputPanel');
    if (existing) { existing.remove(); return; }

    const panel = document.createElement('div');
    panel.id = 'audioOutputPanel';
    panel.className = 'audio-output-panel';
    document.body.appendChild(panel);

    // Positionnement sous le bouton, aligné à droite
    const rect = anchorBtn.getBoundingClientRect();
    panel.style.top   = (rect.bottom + 6) + 'px';
    panel.style.right = (window.innerWidth - rect.right) + 'px';

    await populateAudioOutputPanel(panel, anchorBtn);

    // Fermeture au clic extérieur
    setTimeout(() => {
        document.addEventListener('click', function outsideClick(e) {
            if (!panel.isConnected) { document.removeEventListener('click', outsideClick); return; }
            if (!panel.contains(e.target) && e.target !== anchorBtn) {
                panel.remove();
                document.removeEventListener('click', outsideClick);
            }
        });
    }, 0);
}

/* ── Init ──────────────────────────────────────────────────── */

export function initAudioOutput() {
    const btn = document.getElementById('audioOutputBtn');
    if (!btn) return;

    // Restaure le libellé sauvegardé
    updateBtnLabel();

    btn.addEventListener('click', e => {
        e.stopPropagation();
        openAudioOutputPanel(btn);
    });

    // Pré-applique le device sauvegardé (sera mémorisé si le contexte audio n'est pas encore créé)
    if (selectedOutputDeviceId && selectedOutputDeviceId !== 'default') {
        applyAudioOutput(selectedOutputDeviceId).catch(() => {});
    }
}
