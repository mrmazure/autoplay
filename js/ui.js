import { Queue as e } from "./queue.js";
import { Player as t, fadeOut as a } from "./player.js";
import { Waveform } from "./waveform.js";

const $ = e => document.getElementById(e),
    queue = $("queue"),
    hint = $("drop-hint"),
    nowT = $("now-title"),
    upNext = $("next-track-name"),
    hist = $("history-list"),
    // bar = $("progress-bar"),
    progress = $("progress"),
    waveformCanvas = $("waveform"),
    meta = $("time-meta"),
    clock = $("clock"),
    fmt = e => `${String(Math.floor(e / 60)).padStart(2, "0")}:${String(Math.floor(e % 60)).padStart(2, "0")}`;

let currentWaveform = null;

export const UI = {
    renderQueue() {
        queue.innerHTML = "", e.all().forEach(((n, r) => {
            const o = document.createElement("li");
            o.className = "queue-item", o.draggable = !0, o.innerHTML = `
        <span class="file-name">${n.name}</span>
        <span class="duration">${n._dur ? fmt(n._dur) : "--:--"}</span>
        <button class="delete-btn">🗑</button>
      `;
            const i = document.createElement("button");
            i.className = "play-item-btn", i.title = "Jouer immédiatement", i.textContent = "▶", i.onclick = n => {
                n.stopPropagation();
                const o = e.all(),
                    i = o.splice(r, 1)[0];
                e.set([i, ...o]);
                const u = t.getCurrent();
                u && !u.paused && a(u), t.playNext(), UI.renderQueue()
            };
            const u = o.querySelector(".delete-btn");
            u.textContent = "❌", u.title = "Supprimer de la playlist", u.style.color = "red", u.onclick = t => {
                t.stopPropagation(), e.remove(r), UI.renderQueue()
            }, o.insertBefore(i, u), o.addEventListener("dragstart", (() => o.classList.add("dragging"))), o.addEventListener("dragend", (() => o.classList.remove("dragging"))), queue.append(o)
        })), hint.style.display = e.all().length ? "none" : "flex", upNext.textContent = (e.peek()?.name || "–")
    },
    async updateCurrent(e, n) {
        nowT.textContent = e.name, meta.dataset.total = n;
        const r = (new Date).toLocaleTimeString("fr-FR", {
            hour: "2-digit",
            minute: "2-digit"
        });
        hist.insertAdjacentHTML("afterbegin", `<li>${r} – ${e.name}</li>`);

        // Generate Waveform
        currentWaveform = null;
        // Draw placeholder
        drawWaveform(0);

        if (e && (e instanceof File || e instanceof Blob)) {
            try {
                currentWaveform = await Waveform.generate(e, 800);
            } catch (err) {
                console.warn("Waveform gen failed", err);
            }
        }
    },
    clearCurrent() {
        nowT.textContent = "–", /* bar.style.width = "0%", */ meta.textContent = "", currentWaveform = null, drawWaveform(0)
    },
    tick() {
        const e = t.getCurrent();
        if (!e || e.paused) {
            // bar.style.width = "0%";
            if (!window.autoNext) UI.clearCurrent();
        } else if (e.duration) {
            const t = e.duration - e.currentTime;
            // bar.style.width = e.currentTime / e.duration * 100 + "%";
            meta.textContent = `Durée : ${fmt(meta.dataset.total || e.duration)} | Restant : ${fmt(t)}`;

            drawWaveform(e.currentTime / e.duration);
        }
        clock.textContent = (new Date).toLocaleTimeString("fr-FR", {
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit"
        }), requestAnimationFrame(UI.tick)
    }
};

function drawWaveform(progressPct) {
    if (!waveformCanvas) return;
    const ctx = waveformCanvas.getContext("2d");
    const w = waveformCanvas.width = waveformCanvas.offsetWidth;
    const h = waveformCanvas.height = waveformCanvas.offsetHeight;

    ctx.clearRect(0, 0, w, h);

    if (!currentWaveform) {
        // Draw loading or empty line
        ctx.fillStyle = "#333";
        ctx.fillRect(0, h / 2 - 1, w, 2);
        return;
    }

    const barW = w / currentWaveform.length;
    const center = h / 2;

    // Draw Background (Unplayed)
    ctx.fillStyle = "rgba(255, 255, 255, 0.2)"; // Muted color
    for (let i = 0; i < currentWaveform.length; i++) {
        const val = currentWaveform[i];
        const barH = Math.max(2, val * h * 0.8);
        ctx.fillRect(i * barW, center - barH / 2, barW, barH);
    }

    // Draw Progress (Played) - using simple overlay or clipping
    // Clipping method
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, w * progressPct, h);
    ctx.clip();

    ctx.fillStyle = "#6366f1"; // Accent color
    for (let i = 0; i < currentWaveform.length; i++) {
        const val = currentWaveform[i];
        const barH = Math.max(2, val * h * 0.8);
        ctx.fillRect(i * barW, center - barH / 2, barW, barH);
    }
    ctx.restore();
}

progress.addEventListener("click", (e => {
    const n = t.getCurrent();
    if (!n.duration) return;
    const {
        left: r,
        width: a
    } = progress.getBoundingClientRect();
    n.currentTime = (e.clientX - r) / a * n.duration
})), queue.addEventListener("dragover", (e => {
    e.preventDefault();
    const t = queue.querySelector(".dragging");
    if (!t) return;
    const n = [...queue.querySelectorAll(".queue-item:not(.dragging)")].find((t => e.clientY < t.getBoundingClientRect().top + t.offsetHeight / 2));
    n ? queue.insertBefore(t, n) : queue.append(t)
})), queue.addEventListener("drop", (t => {
    t.preventDefault();
    const n = [...queue.querySelectorAll(".queue-item")].map((e => e.querySelector(".file-name").textContent));
    e.set(n.map((t => e.all().find((e => e.name === t))))), UI.renderQueue()
}));