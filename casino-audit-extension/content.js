// content.js — corre en el mundo aislado de la extension.
// Escucha las copias de trafico que manda inject.js, las analiza y dibuja
// un panel flotante en la pagina con el registro y el veredicto.

(function () {
  "use strict";

  const TAG = "__CASINO_AUDIT__";

  // Campos que NO deberian venir en una respuesta del servidor antes de que
  // tu decidas (iniciar ronda, dar un paso). Si aparecen, es una fuga.
  // Editable desde el panel.
  const DEFAULT_KEYWORDS = [
    "trap", "traps", "trampa", "trampas",
    "crash", "crashpoint", "crash_point", "bustat", "multiplier_final",
    "bomb", "bombs", "mine", "mines", "mina", "minas",
    "safe", "safes", "seguro", "seguros",
    "result", "resultado", "outcome", "winningtile", "winning_tile",
    "position", "positions", "posicion", "posiciones",
    "answer", "solution", "solucion", "nextsafe", "next_safe",
    "serverseed", "server_seed", "seed_server", "secret", "nonce_result"
  ];

  let keywords = DEFAULT_KEYWORDS.slice();
  let paused = false;
  const records = [];

  // --- almacenamiento de la lista de palabras ---
  try {
    chrome.storage &&
      chrome.storage.local.get(["auditKeywords"], (r) => {
        if (r && Array.isArray(r.auditKeywords) && r.auditKeywords.length) {
          keywords = r.auditKeywords;
          renderKeywords();
        }
      });
  } catch (e) {}

  function saveKeywords() {
    try { chrome.storage && chrome.storage.local.set({ auditKeywords: keywords }); } catch (e) {}
  }

  // --- deteccion ---
  function findLeaks(body) {
    if (!body || typeof body !== "string") return [];
    const low = body.toLowerCase();
    const hits = [];
    for (const kw of keywords) {
      if (low.includes(kw.toLowerCase())) hits.push(kw);
    }
    return hits;
  }

  function analyze(rec) {
    rec.leaks = [];
    // Solo nos interesan las respuestas que llegan DEL servidor.
    const incoming = rec.dir === "in";
    if (incoming) rec.leaks = findLeaks(rec.body);
    return rec;
  }

  // --- UI ---
  let panel, logEl, verdictEl, kwInput, kwList, counterEl;

  function build() {
    panel = document.createElement("div");
    panel.id = "casino-audit-panel";
    panel.innerHTML = `
      <div id="ca-head">
        <span id="ca-title">🛡️ Auditoria local</span>
        <span id="ca-counter">0</span>
        <button id="ca-pause" title="Pausar/Reanudar">⏸</button>
        <button id="ca-clear" title="Limpiar registro">🗑</button>
        <button id="ca-min" title="Minimizar">—</button>
      </div>
      <div id="ca-verdict">Esperando trafico…</div>
      <div id="ca-kwbar">
        <input id="ca-kw-input" placeholder="añadir campo sospechoso…" />
        <button id="ca-kw-add">+</button>
        <div id="ca-kw-list"></div>
      </div>
      <div id="ca-log"></div>
    `;
    (document.body || document.documentElement).appendChild(panel);

    logEl = panel.querySelector("#ca-log");
    verdictEl = panel.querySelector("#ca-verdict");
    kwInput = panel.querySelector("#ca-kw-input");
    kwList = panel.querySelector("#ca-kw-list");
    counterEl = panel.querySelector("#ca-counter");

    panel.querySelector("#ca-pause").onclick = (e) => {
      paused = !paused;
      e.target.textContent = paused ? "▶" : "⏸";
    };
    panel.querySelector("#ca-clear").onclick = () => {
      records.length = 0;
      logEl.innerHTML = "";
      updateVerdict();
    };
    panel.querySelector("#ca-min").onclick = () => panel.classList.toggle("ca-collapsed");
    panel.querySelector("#ca-kw-add").onclick = addKeyword;
    kwInput.onkeydown = (e) => { if (e.key === "Enter") addKeyword(); };

    renderKeywords();
    makeDraggable(panel, panel.querySelector("#ca-head"));
  }

  function addKeyword() {
    const v = kwInput.value.trim();
    if (v && !keywords.includes(v)) {
      keywords.push(v);
      saveKeywords();
      renderKeywords();
    }
    kwInput.value = "";
  }

  function renderKeywords() {
    if (!kwList) return;
    kwList.innerHTML = "";
    keywords.forEach((kw, i) => {
      const chip = document.createElement("span");
      chip.className = "ca-chip";
      chip.textContent = kw;
      const x = document.createElement("b");
      x.textContent = "×";
      x.onclick = () => { keywords.splice(i, 1); saveKeywords(); renderKeywords(); };
      chip.appendChild(x);
      kwList.appendChild(chip);
    });
  }

  function esc(s) {
    return String(s).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
  }

  function addRow(rec) {
    const row = document.createElement("div");
    row.className = "ca-row ca-" + rec.dir + (rec.leaks && rec.leaks.length ? " ca-leak" : "");
    const arrow = rec.dir === "in" ? "⬇ servidor→tu" : rec.dir === "out" ? "⬆ tu→servidor" : rec.dir;
    const kind = rec.kind === "ws" ? "WS" : rec.kind === "http" ? "HTTP" : rec.kind.toUpperCase();
    let head = `<span class="ca-k">${kind}</span><span class="ca-d">${arrow}</span>`;
    if (rec.status) head += `<span class="ca-s">${rec.status}</span>`;
    if (rec.method) head += `<span class="ca-m">${rec.method}</span>`;
    if (rec.url) head += `<span class="ca-u">${esc(shortUrl(rec.url))}</span>`;
    let warn = "";
    if (rec.leaks && rec.leaks.length) {
      warn = `<div class="ca-warn">⚠️ Posible FUGA: campos [${rec.leaks.map(esc).join(", ")}] en una respuesta del servidor.</div>`;
    }
    row.innerHTML = `<div class="ca-rowhead">${head}</div>${warn}<pre class="ca-body">${esc(rec.body || "")}</pre>`;
    logEl.appendChild(row);
    logEl.scrollTop = logEl.scrollHeight;
  }

  function shortUrl(u) {
    try { const x = new URL(u, location.href); return x.pathname + x.search; } catch (e) { return u; }
  }

  function updateVerdict() {
    const leaks = records.filter((r) => r.leaks && r.leaks.length);
    counterEl.textContent = records.length;
    if (!records.length) {
      verdictEl.className = "";
      verdictEl.textContent = "Esperando trafico…";
      return;
    }
    if (leaks.length) {
      verdictEl.className = "ca-bad";
      verdictEl.textContent = `⚠️ ${leaks.length} respuesta(s) del servidor contienen datos del resultado. Revisa las filas en rojo: tu servidor podria estar filtrando la solucion al cliente.`;
    } else {
      verdictEl.className = "ca-ok";
      verdictEl.textContent = `✅ ${records.length} mensajes revisados. Ninguna respuesta del servidor filtro campos del resultado. (Sigue jugando rondas completas para cubrir todos los casos.)`;
    }
  }

  function makeDraggable(el, handle) {
    let sx, sy, ox, oy, drag = false;
    handle.style.cursor = "move";
    handle.addEventListener("mousedown", (e) => {
      if (e.target.tagName === "BUTTON") return;
      drag = true; sx = e.clientX; sy = e.clientY;
      const r = el.getBoundingClientRect(); ox = r.left; oy = r.top;
      e.preventDefault();
    });
    window.addEventListener("mousemove", (e) => {
      if (!drag) return;
      el.style.left = ox + (e.clientX - sx) + "px";
      el.style.top = oy + (e.clientY - sy) + "px";
      el.style.right = "auto";
    });
    window.addEventListener("mouseup", () => { drag = false; });
  }

  // --- recepcion de mensajes de inject.js ---
  window.addEventListener("message", (ev) => {
    const d = ev.data;
    if (!d || d.__tag !== TAG) return;
    if (paused) return;
    analyze(d);
    records.push(d);
    if (!panel) return;
    addRow(d);
    updateVerdict();
  });

  function init() {
    if (document.body || document.documentElement) build();
    else requestAnimationFrame(init);
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
    // document_start: el body puede no existir aun, reintenta.
    init();
  } else {
    init();
  }
})();
