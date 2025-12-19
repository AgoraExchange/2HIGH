(() => {
  "use strict";

  const $ = (s) => document.querySelector(s);

  // ---------- State / Storage ----------
  const KEY = "2high:redesign:v1";

  const defaults = {
    total: 60,
    remaining: 60,
    running: false,
    startedAt: 0,
    elapsedBeforePause: 0,

    muted: false,
    voice: true,
    haptics: true,

    manageMode: false,

    presets: [
      { id: "p1", name: "Standard", sec: 60, tool: "Glass Dab Rig", wax: "Badder" },
      { id: "p2", name: "Flavor Mode", sec: 75, tool: "Glass Dab Rig", wax: "Rosin" },
      { id: "p3", name: "Quick Rip", sec: 30, tool: "Lookah Seahorse Plus", wax: "Distillate" },
      { id: "p4", name: "Cloud Gremlin", sec: 95, tool: "Glass Dab Rig", wax: "Sugar Diamonds" },
    ],
    activePresetId: "p1",

    dabCount: 0,
    dabLog: [], // {ts, presetName, tool, wax, sec}

    toolCounts: {},
    waxCounts: {},
    timerCounts: {},
  };

  function load() {
    try {
      const raw = JSON.parse(localStorage.getItem(KEY) || "{}");
      return {
        ...defaults,
        ...raw,
        presets: Array.isArray(raw.presets) && raw.presets.length ? raw.presets : defaults.presets,
        dabLog: Array.isArray(raw.dabLog) ? raw.dabLog : [],
        toolCounts: raw.toolCounts && typeof raw.toolCounts === "object" ? raw.toolCounts : {},
        waxCounts: raw.waxCounts && typeof raw.waxCounts === "object" ? raw.waxCounts : {},
        timerCounts: raw.timerCounts && typeof raw.timerCounts === "object" ? raw.timerCounts : {},
      };
    } catch {
      return structuredClone(defaults);
    }
  }

  const state = load();

  function save() {
    const out = {
      total: state.total,
      remaining: state.remaining,
      running: state.running,
      startedAt: state.startedAt,
      elapsedBeforePause: state.elapsedBeforePause,

      muted: state.muted,
      voice: state.voice,
      haptics: state.haptics,

      manageMode: state.manageMode,

      presets: state.presets,
      activePresetId: state.activePresetId,

      dabCount: state.dabCount,
      dabLog: state.dabLog.slice(0, 500),

      toolCounts: state.toolCounts,
      waxCounts: state.waxCounts,
      timerCounts: state.timerCounts,
    };
    localStorage.setItem(KEY, JSON.stringify(out));
  }

  // ---------- Helpers ----------
  const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
  const pad2 = (n) => String(n).padStart(2, "0");
  const fmt = (sec) => {
    sec = Math.max(0, Math.round(sec));
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${pad2(m)}:${pad2(s)}`;
  };
  const fmtShort = (sec) => {
    sec = Math.max(0, Math.round(sec));
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return m ? `${m}:${pad2(s)}` : `${s}s`;
  };
  const escapeHtml = (str) =>
    String(str).replace(/[&<>"']/g, (m) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;",
    }[m]));

  const isToday = (ts) => {
    const d = new Date(ts);
    const n = new Date();
    return d.getFullYear() === n.getFullYear() &&
      d.getMonth() === n.getMonth() &&
      d.getDate() === n.getDate();
  };

  const formatDate = (ts) => new Date(ts).toLocaleDateString(undefined, { month: "short", day: "2-digit" });
  const formatTime = (ts) => new Date(ts).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });

  const bump = (map, key) => { map[key] = (map[key] || 0) + 1; };

  function getPreset() {
    return state.presets.find(p => p.id === state.activePresetId) || state.presets[0];
  }

  // ---------- UI ----------
  const timeEl = $("#time");
  const statusText = $("#statusText");

  const activePresetLabel = $("#activePresetLabel");
  const activeToolLabel = $("#activeToolLabel");
  const activeWaxLabel = $("#activeWaxLabel");

  const dabCountEl = $("#dabCount");
  const todayCountEl = $("#todayCount");
  const soundStateEl = $("#soundState");

  const ring = $("#ring");
  const heatBox = $("#heatState");
  const heatValue = $("#heatValue");

  const presetRail = $("#presetRail");
  const manageBtn = $("#manageBtn");
  const manageHint = $("#manageHint");

  const waxFact = $("#waxFact");
  const toolFact = $("#toolFact");

  // Dock buttons
  const startBtn = $("#startBtn");
  const pauseBtn = $("#pauseBtn");
  const resetBtn = $("#resetBtn");
  const muteBtn = $("#muteBtn");
  const muteIcon = $("#muteIcon");

  // Modals
  const presetModal = $("#presetModal");
  const addPresetBtn = $("#addPresetBtn");
  const closePreset = $("#closePreset");
  const cancelPreset = $("#cancelPreset");
  const savePresetBtn = $("#savePreset");
  const deletePresetBtn = $("#deletePreset");

  const presetTitle = $("#presetTitle");
  const pName = $("#pName");
  const pMin = $("#pMin");
  const pSec = $("#pSec");
  const pTool = $("#pTool");
  const pWax = $("#pWax");

  const infoModal = $("#infoModal");
  const infoBtn = $("#infoBtn");
  const dabChip = $("#dabChip");
  const closeInfo = $("#closeInfo");

  const statTotal = $("#statTotal");
  const statTool = $("#statTool");
  const statWax = $("#statWax");
  const statTimer = $("#statTimer");

  const voiceToggle = $("#voiceToggle");
  const hapticsToggle = $("#hapticsToggle");
  const voiceState = $("#voiceState");
  const hapticsState = $("#hapticsState");
  const clearAllBtn = $("#clearAll");

  const logList = $("#logList");

  // Toasts
  const toasts = $("#toasts");
  function toast(msg) {
    const t = document.createElement("div");
    t.className = "toast";
    t.textContent = msg;
    toasts.appendChild(t);
    setTimeout(() => t.remove(), 2200);
  }

  // ---------- Ring progress ----------
  const R = 62;
  const C = 2 * Math.PI * R;
  ring.setAttribute("fill", "none");
  ring.setAttribute("stroke-width", "12");
  ring.setAttribute("stroke-linecap", "round");
  ring.setAttribute("stroke-dasharray", String(C));
  ring.setAttribute("stroke-dashoffset", "0");

  function setRing(remaining, total) {
    const p = total <= 0 ? 1 : 1 - remaining / total;
    ring.style.strokeDashoffset = String(p * C);
  }

  // ---------- Heat labels ----------
  function setHeatLabel() {
  // progress goes from 0 → 1 as timer runs
  const progress = state.total
    ? 1 - (state.remaining / state.total)
    : 0;

  heatBox.classList.remove("hot", "warm", "cool");

  // idle state (not started yet)
  if (!state.running && state.remaining === state.total) {
    heatBox.classList.add("cool");
    heatValue.textContent = "cool";
    return;
  }

  // 🔥 HEAT INCREASES as we approach 0
  if (progress < 0.35) {
    heatBox.classList.add("cool");
    heatValue.textContent = "cool";
  } else if (progress < 0.75) {
    heatBox.classList.add("warm");
    heatValue.textContent = "warm";
  } else {
    heatBox.classList.add("hot");
    heatValue.textContent = "hot";
  }
}

  // ---------- Audio ----------
  let audioCtx = null;
  function ensureAudio() {
    if (audioCtx) return true;
    try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); return true; }
    catch { return false; }
  }
  async function resumeAudio() {
    if (!audioCtx) return;
    try { if (audioCtx.state === "suspended") await audioCtx.resume(); } catch {}
  }

    async function chime() {
    if (state.muted) return;
    if (!ensureAudio()) return;
    await resumeAudio();

    const c = audioCtx;

    // Your 4-note "reward" phrase
    const notes = [523.25, 659.25, 784.0, 988.0]; // C E G B

    const makeBurst = (startAt, speed = 1) => {
        const master = c.createGain();
        master.gain.value = 0.26;
        master.connect(c.destination);

        // original spacing 0.12s per note → faster means smaller spacing
        const step = 0.12 / speed;

        notes.forEach((f, i) => {
        const t = startAt + i * step;

        const o = c.createOscillator();
        const g = c.createGain();

        o.type = "triangle";
        o.frequency.setValueAtTime(f, t);

        // Slightly tighter envelope when sped up so it stays punchy
        const atk = 0.02 / speed;
        const rel = 0.16 / speed;

        g.gain.setValueAtTime(0.001, t);
        g.gain.exponentialRampToValueAtTime(0.55, t + atk);
        g.gain.exponentialRampToValueAtTime(0.001, t + rel);

        o.connect(g);
        g.connect(master);

        o.start(t);
        o.stop(t + rel + 0.02);
        });

        // total length of this burst (roughly)
        return (step * (notes.length - 1)) + (0.20 / speed);
    };

    const now = c.currentTime;

    // Phase 1: 2 bursts at normal speed
    const gap1 = 0.18;
    let t = now;
    for (let i = 0; i < 2; i++) {
        const dur = makeBurst(t, 1);
        t += dur + gap1;
    }

    // Phase 2: 4 bursts at 2x speed (slot-machine ramp)
    const gap2 = 0.10; // tighter for that rapid "reward" feel
    for (let i = 0; i < 4; i++) {
        const dur = makeBurst(t, 2);
        t += dur + gap2;
    }
    }



  const VOICE_LINES = [
    "Okay. Now rip it.",
    "Terp time.",
    "Hydrate first.",
    "Proceed. Respectfully.",
    "Low temp, big flavor."
  ];

  function speak() {
    if (!state.voice) return;
    if (!("speechSynthesis" in window)) return;
    const u = new SpeechSynthesisUtterance(VOICE_LINES[Math.floor(Math.random() * VOICE_LINES.length)]);
    u.lang = "en-US";
    u.rate = 1.02;
    u.pitch = 0.95;
    try { window.speechSynthesis.cancel(); window.speechSynthesis.speak(u); } catch {}
  }

  // ---------- Timer engine (clean, no double listeners) ----------
  let raf = 0;

  function computeRemaining() {
    if (!state.running) return state.remaining;
    const elapsed = (Date.now() - state.startedAt) / 1000 + state.elapsedBeforePause;
    const rem = Math.max(0, state.total - elapsed);
    return rem;
  }

  function tick() {
    if (!state.running) return;
    state.remaining = computeRemaining();

    if (state.remaining <= 0) {
      state.remaining = 0;
      finish();
      return;
    }

    render();
    raf = requestAnimationFrame(tick);
  }

  function start() {
    if (state.running) return;

    // if finished, reset to full first
    if (state.remaining <= 0) {
      state.remaining = state.total;
      state.elapsedBeforePause = 0;
    }

    state.running = true;
    state.startedAt = Date.now();

    statusText.textContent = "running";
    pauseBtn.disabled = false;
    resetBtn.disabled = false;
    startBtn.textContent = "Start";

    if (state.haptics && "vibrate" in navigator) navigator.vibrate(20);

    raf = requestAnimationFrame(tick);
    save();
    render();
  }

  function pause() {
    if (!state.running) return;

    // accumulate elapsed
    const elapsedThisRun = (Date.now() - state.startedAt) / 1000;
    state.elapsedBeforePause += elapsedThisRun;

    state.running = false;
    cancelAnimationFrame(raf);

    statusText.textContent = "paused";
    save();
    render();

    if (state.haptics && "vibrate" in navigator) navigator.vibrate([10, 40, 10]);
  }

  function reset() {
    // reset/cancel never counts
    state.running = false;
    cancelAnimationFrame(raf);

    state.remaining = state.total;
    state.elapsedBeforePause = 0;

    statusText.textContent = "ready";
    pauseBtn.disabled = true;
    resetBtn.disabled = true;

    save();
    render();
  }

  function finish() {
    // successful completion counts as a dab
    state.running = false;
    cancelAnimationFrame(raf);

    statusText.textContent = "done";
    pauseBtn.disabled = true;

    const p = getPreset();
    const ts = Date.now();

    state.dabCount += 1;
    state.dabLog.unshift({ ts, presetName: p.name, tool: p.tool, wax: p.wax, sec: state.total });
    state.dabLog = state.dabLog.slice(0, 500);

    bump(state.toolCounts, p.tool);
    bump(state.waxCounts, p.wax);
    bump(state.timerCounts, fmt(state.total));

    chime();
    speak();
    if (state.haptics && "vibrate" in navigator) navigator.vibrate([50, 60, 50, 120]);

    save();
    render();
    renderInfo();
    toast("+1 dab logged ✅");
  }

  // ---------- Presets ----------
  let editingId = null;

  function applyPreset(p) {
    // don’t let preset swaps while running cause weird counts — require pause/reset first
    if (state.running) {
      toast("Pause first to swap preset.");
      return;
    }

    state.activePresetId = p.id;
    state.total = clamp(p.sec | 0, 1, 59 * 60 + 59);
    state.remaining = state.total;
    state.elapsedBeforePause = 0;

    save();
    render();
    renderPresets();
  }

  function openPresetModal(id = null) {
    editingId = id;
    const p = id ? state.presets.find(x => x.id === id) : null;

    if (p) {
      presetTitle.textContent = "Edit preset";
      pName.value = p.name;
      pMin.value = Math.floor(p.sec / 60);
      pSec.value = p.sec % 60;
      pTool.value = p.tool;
      pWax.value = p.wax;
      deletePresetBtn.hidden = false;
    } else {
      presetTitle.textContent = "New preset";
      pName.value = "";
      pMin.value = 1;
      pSec.value = 0;
      pTool.value = "Glass Dab Rig";
      pWax.value = "Live Resin";
      deletePresetBtn.hidden = true;
    }

    presetModal.classList.add("open");
    presetModal.setAttribute("aria-hidden", "false");
  }

  function closePresetModal() {
    presetModal.classList.remove("open");
    presetModal.setAttribute("aria-hidden", "true");
    editingId = null;
  }

  function savePreset() {
    const name = (pName.value || "").trim() || "Custom";
    const mm = clamp(parseInt(pMin.value || "0", 10) || 0, 0, 59);
    const ss = clamp(parseInt(pSec.value || "0", 10) || 0, 0, 59);
    const sec = clamp(mm * 60 + ss, 1, 59 * 60 + 59);

    const tool = pTool.value;
    const wax = pWax.value;

    if (editingId) {
      const i = state.presets.findIndex(x => x.id === editingId);
      if (i >= 0) state.presets[i] = { ...state.presets[i], name, sec, tool, wax };
      toast("Preset updated");
    } else {
      const id = `p_${Date.now()}`;
      state.presets.unshift({ id, name, sec, tool, wax });
      state.presets = state.presets.slice(0, 40);
      state.activePresetId = id;
      toast("Preset saved");
    }

    save();
    closePresetModal();
    renderPresets();
    render();
  }

  function deletePreset() {
    if (!editingId) return;
    if (state.presets.length <= 1) {
      toast("Keep at least one preset.");
      return;
    }

    const idx = state.presets.findIndex(x => x.id === editingId);
    if (idx < 0) return;

    const wasActive = state.presets[idx].id === state.activePresetId;
    state.presets.splice(idx, 1);

    if (wasActive) state.activePresetId = state.presets[0].id;

    save();
    closePresetModal();
    renderPresets();
    render();
    toast("Preset deleted");
  }

  function renderPresets() {
    presetRail.innerHTML = "";

    state.presets.forEach((p) => {
      const card = document.createElement("div");
      card.className = "presetCard glass";
      if (p.id === state.activePresetId) card.classList.add("active");
      if (state.manageMode) card.classList.add("manage");

      card.innerHTML = `
        <div class="pGlow" aria-hidden="true"></div>
        <div class="pTitle">${escapeHtml(p.name)}</div>
        <div class="pMeta">${escapeHtml(p.tool)} • ${escapeHtml(p.wax)}</div>
        <div class="pTime">${fmtShort(p.sec)}</div>
      `;

      card.addEventListener("click", () => {
        if (state.manageMode) openPresetModal(p.id);
        else applyPreset(p);
      });

      presetRail.appendChild(card);
    });
  }

  // ---------- Facts ----------
  const WAX = [
    "Live resin keeps more terps—cooler timers usually taste cleaner.",
    "Rosin is sensitive. Moderate heat windows hit the sweet spot.",
    "Badder melts smooth: gentle airflow helps it vaporize evenly.",
    "Shatter can scorch fast—waiting longer saves flavor.",
    "Sugar diamonds can need a little extra melt time. Patience pays."
  ];
  const TOOL = [
    "Glass rigs reward steady draws—let the heat do the work.",
    "Carb caps increase efficiency and help keep temps stable.",
    "Don’t thermal shock glass: hot banger + cold surface = sad glass.",
    "Clean hardware = better flavor. Reclaim builds resistance fast.",
    "Cold-starts: load first, low heat, slow draw—terps stay happy."
  ];

  function shuffleFacts() {
    waxFact.textContent = WAX[Math.floor(Math.random() * WAX.length)];
    toolFact.textContent = TOOL[Math.floor(Math.random() * TOOL.length)];
  }

  // ---------- Info modal ----------
  function topPick(map) {
    const entries = Object.entries(map || {});
    if (!entries.length) return "—";
    entries.sort((a,b) => b[1] - a[1]);
    return `${entries[0][0]} (${entries[0][1]})`;
  }

  function renderInfo() {
    statTotal.textContent = String(state.dabCount);
    statTool.textContent = topPick(state.toolCounts);
    statWax.textContent = topPick(state.waxCounts);
    statTimer.textContent = topPick(state.timerCounts);

    voiceToggle.setAttribute("aria-pressed", String(state.voice));
    hapticsToggle.setAttribute("aria-pressed", String(state.haptics));
    voiceState.textContent = state.voice ? "On" : "Off";
    hapticsState.textContent = state.haptics ? "On" : "Off";

    logList.innerHTML = "";
    const list = state.dabLog.slice(0, 120);

    if (!list.length) {
      const empty = document.createElement("div");
      empty.className = "logRow";
      empty.innerHTML = `
        <div>
          <div class="l1">No logs yet.</div>
          <div class="l2">Timer hits 0 → it shows up here.</div>
        </div>
        <div class="r1">—</div>
      `;
      logList.appendChild(empty);
      return;
    }

    list.forEach((e) => {
      const row = document.createElement("div");
      row.className = "logRow";
      row.innerHTML = `
        <div style="min-width:0">
          <div class="l1">${escapeHtml(e.presetName)} • ${fmtShort(e.sec)}</div>
          <div class="l2">${escapeHtml(e.tool)} • ${escapeHtml(e.wax)}</div>
        </div>
        <div>
          <div class="r1">${escapeHtml(formatTime(e.ts))}</div>
          <div class="r2">${escapeHtml(formatDate(e.ts))}</div>
        </div>
      `;
      logList.appendChild(row);
    });
  }

  function openInfo() {
    renderInfo();
    infoModal.classList.add("open");
    infoModal.setAttribute("aria-hidden", "false");
  }
  function closeInfoModal() {
    infoModal.classList.remove("open");
    infoModal.setAttribute("aria-hidden", "true");
  }

  // ---------- Render ----------
  function todayCount() {
    return state.dabLog.filter(e => isToday(e.ts)).length;
  }

  function render() {
    // compute remaining for display even when running
    const rem = state.running ? computeRemaining() : state.remaining;
    const display = fmt(rem);

    timeEl.textContent = display;
    setRing(rem, state.total);

    const p = getPreset();
    activePresetLabel.textContent = p.name;
    activeToolLabel.textContent = p.tool;
    activeWaxLabel.textContent = p.wax;

    dabCountEl.textContent = String(state.dabCount);
    todayCountEl.textContent = String(todayCount());

    soundStateEl.textContent = state.muted ? "Off" : "On";

    // buttons
    pauseBtn.disabled = !state.running && state.elapsedBeforePause === 0 && state.remaining === state.total;
    resetBtn.disabled = state.running ? false : !(state.remaining !== state.total || state.elapsedBeforePause !== 0);

    // heat vibe
    state.remaining = rem;
    setHeatLabel();

    // mute icon
    muteBtn.setAttribute("aria-pressed", String(state.muted));
    muteIcon.innerHTML = state.muted
      ? `<path fill="currentColor" d="M5 9v6h4l5 5V4L9 9H5zm9.59 3 2.12 2.12-1.41 1.41L13.17 13l-2.12 2.12-1.41-1.41L11.76 12 9.64 9.88l1.41-1.41L13.17 10l2.12-2.12 1.41 1.41L14 11.59z"/>`
      : `<path fill="currentColor" d="M5 9v6h4l5 5V4L9 9H5z"/>`;
  }

  // ---------- Fog canvas (smooth + lightweight) ----------
  const fog = $("#fog");
  const ctx = fog.getContext("2d", { alpha: true });

  const blobs = [];
  function resizeFog() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    fog.width = Math.floor(window.innerWidth * dpr);
    fog.height = Math.floor(window.innerHeight * dpr);
    fog.style.width = "100%";
    fog.style.height = "100%";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function initFog() {
    blobs.length = 0;
    const count = 9;
    for (let i = 0; i < count; i++) {
      blobs.push({
        x: Math.random() * window.innerWidth,
        y: Math.random() * window.innerHeight,
        r: 120 + Math.random() * 220,
        vx: (-0.25 + Math.random() * 0.5),
        vy: (-0.18 + Math.random() * 0.36),
        a: 0.06 + Math.random() * 0.08
      });
    }
  }

  function fogFrame() {
    const w = window.innerWidth;
    const h = window.innerHeight;

    ctx.clearRect(0, 0, w, h);

    for (const b of blobs) {
      b.x += b.vx;
      b.y += b.vy;

      if (b.x < -200) b.x = w + 200;
      if (b.x > w + 200) b.x = -200;
      if (b.y < -200) b.y = h + 200;
      if (b.y > h + 200) b.y = -200;

      const g = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, b.r);
      g.addColorStop(0, `rgba(87,255,154,${b.a})`);
      g.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
      ctx.fill();
    }

    requestAnimationFrame(fogFrame);
  }

  // ---------- Events ----------
  $("#shuffleFacts").addEventListener("click", () => {
    shuffleFacts();
    toast("New intel loaded");
  });

  manageBtn.addEventListener("click", () => {
    state.manageMode = !state.manageMode;
    manageBtn.textContent = state.manageMode ? "Done" : "Manage";
    manageHint.hidden = !state.manageMode;
    save();
    renderPresets();
  });

  addPresetBtn.addEventListener("click", () => openPresetModal(null));
  closePreset.addEventListener("click", closePresetModal);
  cancelPreset.addEventListener("click", closePresetModal);
  savePresetBtn.addEventListener("click", savePreset);
  deletePresetBtn.addEventListener("click", deletePreset);

  // click outside close
  presetModal.addEventListener("click", (e) => { if (e.target === presetModal) closePresetModal(); });
  infoModal.addEventListener("click", (e) => { if (e.target === infoModal) closeInfoModal(); });

  infoBtn.addEventListener("click", openInfo);
  dabChip.addEventListener("click", openInfo);
  closeInfo.addEventListener("click", closeInfoModal);

  voiceToggle.addEventListener("click", () => {
    state.voice = !state.voice;
    save();
    renderInfo();
    toast(state.voice ? "Voice on" : "Voice off");
  });

  hapticsToggle.addEventListener("click", () => {
    state.haptics = !state.haptics;
    save();
    renderInfo();
    toast(state.haptics ? "Haptics on" : "Haptics off");
  });

clearAllBtn.addEventListener("click", () => {
  // iOS-friendly confirm (simple + reliable)
  const ok = window.confirm(
    "Clear ALL history?\n\nThis deletes:\n• Dab log entries\n• Total dabs\n• Tool/Wax/Timer stats\n\nThis can’t be undone."
  );

  if (!ok) {
    toast("Cancelled");
    return;
  }

  state.dabLog = [];
  state.dabCount = 0;
  state.toolCounts = {};
  state.waxCounts = {};
  state.timerCounts = {};

  save();
  render();
  renderInfo();
  toast("History cleared ✅");
});


  startBtn.addEventListener("click", async () => {
    // iOS needs gesture to unlock audio
    ensureAudio();
    await resumeAudio();
    start();
  });

  pauseBtn.addEventListener("click", () => {
    if (state.running) pause();
    else {
      // resume from pause state if partially elapsed
      if (state.elapsedBeforePause > 0 || state.remaining !== state.total) start();
    }
  });

  resetBtn.addEventListener("click", reset);

  muteBtn.addEventListener("click", async () => {
    state.muted = !state.muted;
    save();
    render();
    if (!state.muted) {
      ensureAudio();
      await resumeAudio();
      toast("Sound on");
    } else toast("Muted");
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      closePresetModal();
      closeInfoModal();
    }
  });

  // ---------- Init ----------
  function applyActivePresetOnLoad() {
    const p = getPreset();
    state.total = clamp(p.sec | 0, 1, 59 * 60 + 59);
    state.remaining = state.total;
    state.elapsedBeforePause = 0;
  }

  function renderAll() {
    renderPresets();
    shuffleFacts();
    render();
  }

  applyActivePresetOnLoad();
  renderAll();

  // Fog init
  resizeFog();
  initFog();
  requestAnimationFrame(fogFrame);
  window.addEventListener("resize", () => {
    resizeFog();
    initFog();
  });

})();
