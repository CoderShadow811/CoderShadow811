// inject.js — corre en el MUNDO DE LA PAGINA (world: MAIN).
// Parchea fetch, XMLHttpRequest y WebSocket para observar todo el trafico
// del juego, sin modificar su contenido. Solo lee y reenvia copias al panel
// mediante window.postMessage. No altera ninguna respuesta.

(function () {
  "use strict";

  const TAG = "__CASINO_AUDIT__";
  let seq = 0;

  function send(record) {
    record.__tag = TAG;
    record.n = ++seq;
    record.t = Date.now();
    try {
      window.postMessage(record, "*");
    } catch (e) {
      // Si el cuerpo no es serializable, mandamos una version en texto.
      window.postMessage(
        { __tag: TAG, n: record.n, t: record.t, kind: record.kind, dir: record.dir, url: record.url, body: "[no serializable]" },
        "*"
      );
    }
  }

  function clip(str, max) {
    if (typeof str !== "string") return str;
    return str.length > max ? str.slice(0, max) + " …[cortado " + (str.length - max) + " chars]" : str;
  }

  // ---------- fetch ----------
  const origFetch = window.fetch;
  if (origFetch) {
    window.fetch = function (input, init) {
      const url = typeof input === "string" ? input : (input && input.url) || String(input);
      const method = (init && init.method) || (input && input.method) || "GET";
      let reqBody = init && init.body;
      send({ kind: "http", dir: "out", method: method, url: url, body: clip(typeof reqBody === "string" ? reqBody : reqBody ? "[cuerpo no texto]" : "", 4000) });

      return origFetch.apply(this, arguments).then((res) => {
        const clone = res.clone();
        clone.text().then((txt) => {
          send({ kind: "http", dir: "in", status: res.status, url: url, body: clip(txt, 8000) });
        }).catch(() => {});
        return res;
      });
    };
  }

  // ---------- XMLHttpRequest ----------
  const XHR = window.XMLHttpRequest;
  if (XHR) {
    const open = XHR.prototype.open;
    const sendM = XHR.prototype.send;
    XHR.prototype.open = function (method, url) {
      this.__audit = { method: method, url: url };
      return open.apply(this, arguments);
    };
    XHR.prototype.send = function (body) {
      const info = this.__audit || {};
      send({ kind: "http", dir: "out", method: info.method, url: info.url, body: clip(typeof body === "string" ? body : body ? "[cuerpo no texto]" : "", 4000) });
      this.addEventListener("load", () => {
        let txt = "";
        try { txt = this.responseType === "" || this.responseType === "text" ? this.responseText : "[" + this.responseType + "]"; } catch (e) { txt = "[sin acceso]"; }
        send({ kind: "http", dir: "in", status: this.status, url: info.url, body: clip(txt, 8000) });
      });
      return sendM.apply(this, arguments);
    };
  }

  // ---------- WebSocket ----------
  const OrigWS = window.WebSocket;
  if (OrigWS) {
    function AuditWS(url, protocols) {
      const ws = protocols !== undefined ? new OrigWS(url, protocols) : new OrigWS(url);
      send({ kind: "ws", dir: "open", url: String(url), body: "" });

      const origSend = ws.send;
      ws.send = function (data) {
        send({ kind: "ws", dir: "out", url: String(url), body: clip(typeof data === "string" ? data : "[binario]", 8000) });
        return origSend.apply(this, arguments);
      };

      ws.addEventListener("message", (ev) => {
        send({ kind: "ws", dir: "in", url: String(url), body: clip(typeof ev.data === "string" ? ev.data : "[binario]", 8000) });
      });

      return ws;
    }
    AuditWS.prototype = OrigWS.prototype;
    AuditWS.CONNECTING = OrigWS.CONNECTING;
    AuditWS.OPEN = OrigWS.OPEN;
    AuditWS.CLOSING = OrigWS.CLOSING;
    AuditWS.CLOSED = OrigWS.CLOSED;
    window.WebSocket = AuditWS;
  }

  // Aviso de que la auditoria esta activa.
  send({ kind: "meta", dir: "info", url: location.href, body: "Auditoria activa en esta pagina." });
})();
