import { Queue } from "./queue.js";

const FADE_MS = 1000;
const STEP_MS = 50;
const SIL_RMS = 0.06;
const SIL_FRM = 10;
const players = [document.getElementById("player1"), document.getElementById("player2")];
let active = 0;
let masterVol = 1;
let ctx = null;
let masterGain = null;
let masterAnalyser = null;
const sourceNodes = new Map(); // Store MediaElementSources to avoid re-creation errors

function getCtx() {
    if (!ctx) {
        ctx = new (window.AudioContext || window.webkitAudioContext)();
        masterGain = ctx.createGain();
        masterAnalyser = ctx.createAnalyser();
        masterAnalyser.fftSize = 256;
        masterGain.connect(masterAnalyser);
        masterAnalyser.connect(ctx.destination);

        // Connect players to master
        players.forEach(p => connectPlayer(p));

        // Start visualizer
        requestAnimationFrame(drawVisualizer);
    }
    return ctx;
}

function connectPlayer(audioEl) {
    const context = getCtx();
    if (!sourceNodes.has(audioEl)) {
        const source = context.createMediaElementSource(audioEl);
        source.connect(masterGain);
        sourceNodes.set(audioEl, source);
    }
}

export const setMasterVolume = (vol) => {
    masterVol = vol;
    if (masterGain) {
        masterGain.gain.setTargetAtTime(vol, getCtx().currentTime, 0.1);
    } else {
        players.forEach(p => p.volume = vol);
    }
};

export const fadeOut = (player) => new Promise((resolve) => {
    if (player.__fading) return resolve();
    player.__fading = true;
    const step = player.volume / 20;
    const interval = setInterval(() => {
        player.volume = Math.max(0, player.volume - step);
        if (player.volume === 0) {
            clearInterval(interval);
            player.pause();
            player.currentTime = 0;
            player.__fading = false;
            // Restore volume for next time (assuming masterVol logic is handled by GainNode or reset here)
            player.volume = 1;
            resolve();
        }
    }, 50);
});

function observeSilence(player) {
    // Reverted to RMS based detection (Step 70 logic)
    const context = getCtx();
    let silenceAnalyser = player.__silenceAnalyser;
    if (!silenceAnalyser) {
        silenceAnalyser = context.createAnalyser();
        silenceAnalyser.fftSize = 1024;
        const source = sourceNodes.get(player);
        source.connect(silenceAnalyser);
        player.__silenceAnalyser = silenceAnalyser;
    }

    const dataArray = new Uint8Array(silenceAnalyser.fftSize);
    let silenceFrames = 0;
    let triggered = false;

    const check = () => {
        if (triggered || player.paused) return;

        if (player.duration && player.currentTime < 0.7 * player.duration) {
            requestAnimationFrame(check);
            return;
        }

        const remaining = player.duration - player.currentTime;

        // End of file check (0.3s trigger)
        if (remaining < 0.3 && window.autoNext) {
            triggered = true;
            if (players[active] === player) playNext(false);
            fadeOut(player);
            return;
        }

        // Silence check
        silenceAnalyser.getByteTimeDomainData(dataArray);
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) {
            const v = (dataArray[i] - 128) / 128;
            sum += v * v;
        }
        const rms = Math.sqrt(sum / dataArray.length);

        if (rms < SIL_RMS) {
            silenceFrames++;
        } else {
            silenceFrames = 0;
        }

        if (silenceFrames >= SIL_FRM && window.autoNext) {
            triggered = true;
            if (players[active] === player) playNext(false);
            fadeOut(player);
            return;
        }

        requestAnimationFrame(check);
    };
    requestAnimationFrame(check);
}

function playNext(manual = false) {
    const current = players[active];
    if (manual && !current.paused) {
        fadeOut(current);
    }

    const nextFile = Queue.next();
    if (!nextFile) {
        document.dispatchEvent(new CustomEvent("trackclear"));
        return null; // Stop
    }

    const nextPlayer = players[1 - active];
    nextPlayer.src = URL.createObjectURL(nextFile);
    nextPlayer.volume = 1;
    nextPlayer.load();

    getCtx().resume().catch(() => { });

    nextPlayer.onloadedmetadata = () => {
        document.dispatchEvent(new CustomEvent("trackchange", {
            detail: {
                file: nextFile,
                duration: nextPlayer.duration
            }
        }));
    };

    nextPlayer.play().catch(console.warn);
    active = 1 - active;

    observeSilence(nextPlayer);
    return nextFile;
}

// Visualizer Loop
function drawVisualizer() {
    const canvas = document.getElementById("visualizer");
    if (!canvas || !masterAnalyser) {
        requestAnimationFrame(drawVisualizer);
        return;
    }

    const canvasCtx = canvas.getContext("2d");
    const width = canvas.offsetWidth;
    const height = canvas.offsetHeight;

    if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
    }

    const bufferLength = masterAnalyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    masterAnalyser.getByteFrequencyData(dataArray);

    canvasCtx.clearRect(0, 0, width, height);

    const barWidth = (width / bufferLength) * 2;
    let barHeight;
    let x = 0;

    for (let i = 0; i < bufferLength; i++) {
        barHeight = (dataArray[i] / 255) * height; // Scale to height
        canvasCtx.fillStyle = `rgba(99, 102, 241, ${dataArray[i] / 255})`;
        canvasCtx.fillRect(x, height - barHeight, barWidth, barHeight);
        x += barWidth + 1;
    }

    requestAnimationFrame(drawVisualizer);
}


players.forEach(p => {
    p.addEventListener("ended", () => {
        // Only trigger next if this is the ACTIVE player ending naturally.
        // If it's a previous player fading out, ignore.
        if (p === players[active]) {
            if (window.autoNext) {
                playNext(false);
            } else {
                document.dispatchEvent(new CustomEvent("trackclear"));
            }
        }
    });
});

export const Player = {
    getCurrent: () => players[active],
    playNext: playNext
};