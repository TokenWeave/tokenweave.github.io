(() => {
  "use strict";
  const api = "https://tokenweave-download.onrender.com";
  const form = document.getElementById("model-download-form");
  const button = document.getElementById("model-download");
  const hero = document.getElementById("hero-download");
  const checksum = document.getElementById("model-checksum");
  const key = document.getElementById("download-key");
  const status = document.getElementById("download-status");
  const detail = document.getElementById("download-detail");
  const timer = document.getElementById("wake-timer");
  const progress = document.getElementById("wake-progress");
  const estimateMs = 120000;
  const limitMs = 180000;
  const pauseMs = 5000;
  let phase = "initial";
  let generation = 0;
  let started = 0;
  let clock = null;
  let controller = null;
  let requestedKind = "model";
  function show(state, title, message) {
    phase = state;
    status.textContent = title;
    status.dataset.state = state;
    detail.textContent = message;
    button.disabled = state === "checking" || state === "waking";
    checksum.disabled = state !== "ready";
    button.textContent = state === "ready" ? "Download model" :
      state === "checking" ? "Checking service…" :
      state === "waking" ? "Waiting for service…" :
      state === "initial" ? "Download model — allow 1–2 min" : "Check again";
    hero.disabled = button.disabled;
    hero.textContent = button.textContent;
    form.setAttribute("aria-busy", String(button.disabled));
    timer.hidden = state !== "waking";
    progress.hidden = state !== "waking";
  }
  function tick() {
    const elapsed = Math.max(0, Date.now() - started);
    const left = Math.max(0, Math.ceil((estimateMs - elapsed) / 1000));
    timer.textContent = left > 0
      ? "Estimated wake-up time remaining: " + Math.floor(left / 60) + ":" + String(left % 60).padStart(2,"0")
      : "Estimated wake-up time exceeded. Still checking…";
    progress.value = Math.min(elapsed, estimateMs);
  }
  function stop() {
    if (clock !== null) clearInterval(clock);
    clock = null;
    if (controller) controller.abort();
    controller = null;
  }
  async function probe(timeout) {
    const current = new AbortController();
    controller = current;
    const deadline = setTimeout(() => current.abort(), timeout);
    try {
      const response = await fetch(api + "/healthz", {
        mode: "cors", credentials: "omit", cache: "no-store", signal: current.signal
      });
      if (!response.ok) return "unknown";
      const result = await response.json();
      if (result.service !== "tokenweave-download" || typeof result.ready !== "boolean") return "unknown";
      return result.ready ? "ready" : "unavailable";
    } catch {
      return "unknown";
    } finally {
      clearTimeout(deadline);
      if (controller === current) controller = null;
    }
  }
  function submit(kind) {
    // Native form POST streams the attachment without keeping the ZIP in browser JS memory.
    // The password is never put in a URL, local storage, or the health request.
    if (!key.value) {
      key.focus();
      key.reportValidity();
      return;
    }
    const input = document.getElementById("download-kind");
    input.value = kind;
    HTMLFormElement.prototype.submit.call(form);
  }
  async function check(kind) {
    const id = ++generation;
    requestedKind = kind;
    started = Date.now();
    let waited = false;
    show("checking", "CHECKING SERVICE", "Contacting the model API. If it is asleep, this request will wake it.");
    while (id === generation) {
      const remaining = limitMs - (Date.now() - started);
      if (remaining <= 0) break;
      const result = await probe(Math.min(12000, remaining));
      if (id !== generation) return;
      if (result === "ready") {
        stop();
        show("ready", "ONLINE · MODEL READY",
          waited ? "The service is ready. Enter your download key and click Download model." :
          "The model is ready. Enter your download key if needed.");
        if (!waited) submit(requestedKind);
        return;
      }
      if (result === "unavailable") {
        stop();
        show("unavailable", "ONLINE · MODEL NOT READY",
          "The service is active, but the model archive or download access is not configured. Try again later.");
        return;
      }
      if (!waited) {
        waited = true;
        show("waking", "WAITING FOR SERVICE",
          "Render may be waking up, deploying, or temporarily unreachable. We cannot distinguish these states from the public health endpoint. Checking automatically; no need to refresh.");
        tick();
        clock = setInterval(tick, 1000);
      }
      await new Promise(resolve => setTimeout(resolve, Math.min(pauseMs, Math.max(0,limitMs-(Date.now()-started)))));
    }
    if (id !== generation) return;
    stop();
    show("timeout", "SERVICE NOT RESPONDING",
      "No valid response after three minutes. Try again later. The timer is an estimate, not deployment progress.");
  }
  form.addEventListener("submit", event => {
    event.preventDefault();
    if (!button.disabled) check("model");
  });
  hero.addEventListener("click", () => {
    document.getElementById("download").scrollIntoView({block:"start"});
    if (!button.disabled) check("model");
  });
  button.addEventListener("click", () => {
    if (button.disabled) return;
    // Recheck on every download: the service may have gone idle since the last check.
    check("model");
  });
  checksum.addEventListener("click", () => {
    if (!checksum.disabled) check("checksum");
  });
  // User-initiated checks only: do not keep a free service awake in the background.
  window.addEventListener("pagehide", () => { generation++; stop(); });
  window.addEventListener("pageshow", event => {
    if (event.persisted) show("initial", "NOT CHECKED", "Click Download model to check the service.");
  });
  show("initial", "NOT CHECKED", "Click Download model to check the service. First access may take 1–2 minutes.");
})();