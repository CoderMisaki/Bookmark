(() => {
  if (window.__NETPRO_V3__) {
    window.__NETPRO_V3__.toggle();
    return;
  }

  const TOP = window;
  const D = document;

  const state = {
    logs: [],
    frames: [],
    selectedId: null,
    recording: true,
    filter: "all",
    query: "",
    seq: 0,
    resourcesImported: false,
  };

  const VERSION = "Network Pro V3";

  function now() {
    return new Date().toLocaleTimeString();
  }

  function escapeHTML(value) {
    return String(value ?? "").replace(/[&<>"']/g, (ch) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    }[ch]));
  }

  function truncate(value, max = 70000) {
    const text = String(value ?? "");
    if (text.length <= max) return text;
    return text.slice(0, max) + "\n...[TRUNCATED " + (text.length - max) + " chars]";
  }

  function pretty(value) {
    try {
      return JSON.stringify(JSON.parse(value), null, 2);
    } catch {
      return value ?? "";
    }
  }

  function mask(value) {
    return String(value ?? "")
      .replace(/(authorization\s*[:=]\s*["']?)(bearer\s+)?[^\s"'&,}]+/gi, "$1$2***MASKED***")
      .replace(/(cookie\s*[:=]\s*["']?)[^\n]+/gi, "$1***MASKED***")
      .replace(/((access_|refresh_)?token\s*[:=]\s*["']?)[^\s"'&,}]+/gi, "$1***MASKED***")
      .replace(/(password\s*[:=]\s*["']?)[^\s"'&,}]+/gi, "$1***MASKED***")
      .replace(/(query_id\s*[:=]\s*["']?)[^\s"'&,}]+/gi, "$1***MASKED***")
      .replace(/(hash\s*[:=]\s*["']?)[a-f0-9]{20,}/gi, "$1***MASKED***");
  }

  function safeConstructor(win, name) {
    try {
      return win[name];
    } catch {
      return null;
    }
  }

  function bodyToText(body, win = window) {
    try {
      if (!body) return "";

      const URLSearchParamsCtor = safeConstructor(win, "URLSearchParams") || URLSearchParams;
      const FormDataCtor = safeConstructor(win, "FormData") || FormData;
      const FileCtor = safeConstructor(win, "File") || File;
      const BlobCtor = safeConstructor(win, "Blob") || Blob;
      const ArrayBufferCtor = safeConstructor(win, "ArrayBuffer") || ArrayBuffer;

      if (typeof body === "string") return body;
      if (body instanceof URLSearchParamsCtor) return body.toString();

      if (body instanceof FormDataCtor) {
        const arr = [];
        body.forEach((value, key) => {
          arr.push(key + "=" + (value instanceof FileCtor ? "[File:" + value.name + "]" : value));
        });
        return arr.join("&");
      }

      if (body instanceof BlobCtor) {
        return "[Blob " + body.type + " " + body.size + " bytes]";
      }

      if (body instanceof ArrayBufferCtor) {
        return "[ArrayBuffer " + body.byteLength + " bytes]";
      }

      return JSON.stringify(body);
    } catch {
      return "[unreadable body]";
    }
  }

  function headersToObject(headers) {
    const output = {};
    try {
      if (!headers) return output;

      if (headers.forEach) {
        headers.forEach((value, key) => {
          output[key] = value;
        });
      } else if (Array.isArray(headers)) {
        headers.forEach((item) => {
          output[item[0]] = item[1];
        });
      } else {
        Object.keys(headers).forEach((key) => {
          output[key] = headers[key];
        });
      }
    } catch {}
    return output;
  }

  function headersToString(headers) {
    const keys = Object.keys(headers || {});
    if (!keys.length) return "(empty/cannot read)";
    return keys.map((key) => key + ": " + headers[key]).join("\n");
  }

  function parseXHRHeaders(raw) {
    const output = {};
    String(raw || "")
      .trim()
      .split(/[\r\n]+/)
      .forEach((line) => {
        const index = line.indexOf(":");
        if (index > 0) {
          output[line.slice(0, index).trim()] = line.slice(index + 1).trim();
        }
      });
    return output;
  }

  function toast(text) {
    let el = D.getElementById("npToast");
    if (!el) {
      el = D.createElement("div");
      el.id = "npToast";
      el.className = "np-toast";
      D.documentElement.appendChild(el);
    }
    el.textContent = text;
    el.style.display = "block";
    setTimeout(() => {
      el.style.display = "none";
    }, 1400);
  }

  function copyText(text) {
    try {
      navigator.clipboard.writeText(text);
      toast("Copied");
    } catch {
      console.log(text);
      toast("Copy gagal, cek console");
    }
  }

  function injectStyle() {
    D.getElementById("npStyle")?.remove();

    const style = D.createElement("style");
    style.id = "npStyle";
    style.textContent = `
      #npFloat, #npPanel, #npPanel *, #npToast {
        box-sizing: border-box !important;
        font-family: Arial, sans-serif !important;
      }

      #npFloat {
        position: fixed !important;
        right: 12px !important;
        bottom: 14px !important;
        z-index: 2147483647 !important;
        width: 58px !important;
        height: 58px !important;
        border-radius: 999px !important;
        border: 1px solid #475569 !important;
        background: #0f172a !important;
        color: #ffffff !important;
        font-size: 13px !important;
        font-weight: 900 !important;
        box-shadow: 0 10px 28px rgba(0,0,0,.45) !important;
      }

      #npPanel {
        position: fixed !important;
        left: 8px !important;
        right: 8px !important;
        bottom: 82px !important;
        height: 74vh !important;
        z-index: 2147483646 !important;
        display: none;
        overflow: hidden !important;
        border-radius: 14px !important;
        border: 1px solid #334155 !important;
        background: #020617 !important;
        color: #e5e7eb !important;
        box-shadow: 0 14px 40px rgba(0,0,0,.55) !important;
      }

      .np-top {
        display: flex !important;
        align-items: center !important;
        gap: 8px !important;
        padding: 8px !important;
        border-bottom: 1px solid #1e293b !important;
        background: #0f172a !important;
        overflow-x: auto !important;
        white-space: nowrap !important;
      }

      .np-title {
        min-width: 92px !important;
        font-size: 12px !important;
        font-weight: 900 !important;
        color: #fff !important;
        line-height: 1.15 !important;
      }

      .np-btn {
        border: 1px solid #475569 !important;
        border-radius: 9px !important;
        padding: 7px 10px !important;
        background: #1e293b !important;
        color: #e5e7eb !important;
        font-size: 12px !important;
        font-weight: 800 !important;
      }

      .np-btn.active {
        background: #2563eb !important;
        color: #fff !important;
      }

      .np-btn.rec {
        background: #dc2626 !important;
        color: #fff !important;
      }

      .np-search {
        padding: 8px !important;
        border-bottom: 1px solid #1e293b !important;
        background: #020617 !important;
      }

      #npQuery {
        width: 100% !important;
        border: 1px solid #334155 !important;
        border-radius: 10px !important;
        padding: 10px !important;
        background: #020617 !important;
        color: #e5e7eb !important;
        font-size: 13px !important;
        outline: none !important;
      }

      #npBody {
        height: calc(74vh - 103px) !important;
        display: grid !important;
        grid-template-rows: 43% 57% !important;
      }

      #npList {
        overflow: auto !important;
        border-bottom: 1px solid #1e293b !important;
        background: #020617 !important;
      }

      #npDetail {
        overflow: auto !important;
        background: #020617 !important;
      }

      .np-item {
        padding: 9px !important;
        border-bottom: 1px solid #1e293b !important;
        background: #020617 !important;
        color: #e5e7eb !important;
      }

      .np-item.selected {
        background: #1d4ed8 !important;
      }

      .np-item-main {
        display: flex !important;
        gap: 8px !important;
        align-items: center !important;
        font-size: 12px !important;
      }

      .np-url {
        margin-top: 4px !important;
        word-break: break-all !important;
        color: #93c5fd !important;
        font-size: 11px !important;
        line-height: 1.35 !important;
      }

      .np-meta {
        margin-top: 4px !important;
        color: #94a3b8 !important;
        font-size: 11px !important;
      }

      .np-empty {
        padding: 14px !important;
        color: #94a3b8 !important;
        font-size: 13px !important;
        line-height: 1.45 !important;
      }

      .np-detail-wrap {
        padding: 10px !important;
        color: #e5e7eb !important;
        font-size: 12px !important;
      }

      .np-copy-row {
        display: flex !important;
        gap: 6px !important;
        flex-wrap: wrap !important;
        margin-bottom: 10px !important;
      }

      .np-detail-wrap h3 {
        margin: 10px 0 6px !important;
        color: #fff !important;
        font-size: 14px !important;
      }

      .np-detail-wrap pre {
        margin: 6px 0 10px !important;
        padding: 9px !important;
        white-space: pre-wrap !important;
        word-break: break-word !important;
        overflow: auto !important;
        border: 1px solid #1e293b !important;
        border-radius: 10px !important;
        background: #0f172a !important;
        color: #e5e7eb !important;
        font-size: 11px !important;
        line-height: 1.4 !important;
      }

      .np-detail-wrap details {
        margin: 8px 0 !important;
        border: 1px solid #1e293b !important;
        border-radius: 10px !important;
        background: #020617 !important;
        overflow: hidden !important;
      }

      .np-detail-wrap summary {
        padding: 9px !important;
        background: #0f172a !important;
        color: #fff !important;
        font-weight: 800 !important;
      }

      .np-toast {
        position: fixed !important;
        left: 50% !important;
        bottom: 88px !important;
        transform: translateX(-50%) !important;
        z-index: 2147483647 !important;
        display: none;
        border: 1px solid #475569 !important;
        border-radius: 999px !important;
        padding: 8px 14px !important;
        background: #111827 !important;
        color: #fff !important;
        font-size: 12px !important;
      }

      @media (min-width: 760px) {
        #npBody {
          grid-template-columns: 42% 58% !important;
          grid-template-rows: none !important;
        }

        #npList {
          border-bottom: none !important;
          border-right: 1px solid #1e293b !important;
        }
      }
    `;

    D.documentElement.appendChild(style);
  }

  function createUI() {
    injectStyle();

    D.getElementById("npFloat")?.remove();
    D.getElementById("npPanel")?.remove();

    const button = D.createElement("button");
    button.id = "npFloat";
    button.textContent = "NET";
    D.documentElement.appendChild(button);

    const panel = D.createElement("div");
    panel.id = "npPanel";
    panel.innerHTML = `
      <div class="np-top">
        <div class="np-title">Network<br>Pro V3</div>
        <button class="np-btn rec" id="npRec">REC</button>
        <button class="np-btn active" id="npAll">All</button>
        <button class="np-btn" id="npFetch">Fetch</button>
        <button class="np-btn" id="npXHR">XHR</button>
        <button class="np-btn" id="npWS">WS</button>
        <button class="np-btn" id="npFrames">Frames</button>
        <button class="np-btn" id="npResources">Resources</button>
        <button class="np-btn" id="npErr">Err</button>
        <button class="np-btn" id="npClear">Clear</button>
        <button class="np-btn" id="npClose">×</button>
      </div>

      <div class="np-search">
        <input id="npQuery" placeholder="filter url/status/method/type/frame">
      </div>

      <div id="npBody">
        <div id="npList"></div>
        <div id="npDetail"></div>
      </div>
    `;

    D.documentElement.appendChild(panel);

    button.onclick = () => {
      panel.style.display = panel.style.display === "none" || !panel.style.display ? "block" : "none";
      render();
    };

    D.getElementById("npClose").onclick = () => {
      panel.style.display = "none";
    };

    D.getElementById("npRec").onclick = () => {
      state.recording = !state.recording;
      render();
    };

    D.getElementById("npClear").onclick = () => {
      state.logs = [];
      state.selectedId = null;
      state.resourcesImported = false;
      render();
    };

    D.getElementById("npQuery").oninput = (event) => {
      state.query = event.target.value;
      render();
    };

    D.getElementById("npAll").onclick = () => setFilter("all");
    D.getElementById("npFetch").onclick = () => setFilter("fetch");
    D.getElementById("npXHR").onclick = () => setFilter("xhr");
    D.getElementById("npWS").onclick = () => setFilter("websocket");
    D.getElementById("npErr").onclick = () => setFilter("err");

    D.getElementById("npResources").onclick = () => {
      importPerformanceEntries(TOP, "top");
      setFilter("resource");
    };

    D.getElementById("npFrames").onclick = () => {
      scanFrames();
      setFilter("frame");
    };

    panel.addEventListener("click", (event) => {
      const log = state.logs.find((item) => item.id === state.selectedId);
      if (!log) return;

      if (event.target.id === "npCopyURL") copyText(log.url || "");
      if (event.target.id === "npOpenURL") {
        try {
          TOP.open(log.url, "_blank");
        } catch {
          toast("Gagal open URL");
        }
      }
      if (event.target.id === "npCopyRaw") copyText(mask(JSON.stringify(log, null, 2)));
      if (event.target.id === "npCopyResponse") copyText(mask(log.response || ""));
      if (event.target.id === "npCopyPayload") copyText(mask(log.payload || ""));
      if (event.target.id === "npCopyCurl") copyText(mask(createCurl(log)));
    });

    panel.style.display = "block";

    return { button, panel };
  }

  function setFilter(filter) {
    state.filter = filter;
    render();
  }

  function updateButtons() {
    const map = {
      all: "npAll",
      fetch: "npFetch",
      xhr: "npXHR",
      websocket: "npWS",
      frame: "npFrames",
      resource: "npResources",
      err: "npErr",
    };

    Object.keys(map).forEach((key) => {
      const el = D.getElementById(map[key]);
      if (!el) return;
      el.classList.toggle("active", state.filter === key);
    });

    const rec = D.getElementById("npRec");
    if (rec) rec.classList.toggle("rec", state.recording);
  }

  function statusOK(status) {
    const s = String(status);
    return s.startsWith("2") || s.startsWith("3") || s === "loaded" || s === "open" || s === "accessible";
  }

  function matchLog(log) {
    if (state.filter === "fetch" && log.type !== "fetch") return false;
    if (state.filter === "xhr" && log.type !== "xhr") return false;
    if (state.filter === "websocket" && log.type !== "websocket") return false;
    if (state.filter === "frame" && log.type !== "frame") return false;
    if (state.filter === "resource" && log.type !== "resource" && log.type !== "navigation") return false;

    if (state.filter === "err") {
      const s = String(log.status);
      if (!(s.startsWith("4") || s.startsWith("5") || s === "ERR" || s === "error" || s === "cross-origin")) return false;
    }

    const q = state.query.toLowerCase().trim();
    if (!q) return true;

    return [
      log.context,
      log.url,
      log.method,
      log.status,
      log.type,
      log.initiatorType,
    ].join(" ").toLowerCase().includes(q);
  }

  function render() {
    updateButtons();

    const list = D.getElementById("npList");
    const detail = D.getElementById("npDetail");
    if (!list || !detail) return;

    const logs = state.logs.filter(matchLog).slice().reverse();

    if (!logs.length) {
      list.innerHTML = `
        <div class="np-empty">
          Belum ada request untuk filter ini.<br><br>
          Tips Telegram:<br>
          1. Tekan <b>Frames</b> untuk cari URL Mini App.<br>
          2. Kalau frame cross-origin, copy/open URL-nya langsung di Chrome.<br>
          3. Jalankan NET lagi di URL asli Mini App.<br>
          4. Baru klik fitur claim/login/task.
        </div>
      `;
    } else {
      list.innerHTML = logs.map((log) => {
        const selected = log.id === state.selectedId ? " selected" : "";
        const ok = statusOK(log.status);
        const statusColor = ok ? "#86efac" : "#fca5a5";

        return `
          <div class="np-item${selected}" data-id="${log.id}">
            <div class="np-item-main">
              <b style="color:${statusColor}">${escapeHTML(log.status)}</b>
              <span>${escapeHTML(log.method || "-")}</span>
              <span style="margin-left:auto;color:#94a3b8">${escapeHTML(log.ms ?? 0)}ms</span>
            </div>
            <div class="np-url">${escapeHTML(log.url || "(no url)")}</div>
            <div class="np-meta">
              ${escapeHTML(log.type)}
              ${log.context ? " • " + escapeHTML(log.context) : ""}
              ${log.initiatorType ? " • " + escapeHTML(log.initiatorType) : ""}
              • ${escapeHTML(log.time)}
              • ${escapeHTML(log.size ?? 0)}b
            </div>
          </div>
        `;
      }).join("");
    }

    list.querySelectorAll("[data-id]").forEach((node) => {
      node.onclick = () => {
        state.selectedId = Number(node.dataset.id);
        render();
      };
    });

    const selected = state.logs.find((item) => item.id === state.selectedId) || logs[0];

    if (!selected) {
      detail.innerHTML = `
        <div class="np-empty">
          Pilih request/frame/resource untuk lihat detail.<br><br>
          Untuk bot Python, cari tipe <b>fetch</b>, <b>xhr</b>, atau <b>websocket</b>. Resource biasa tidak cukup.
        </div>
      `;
      return;
    }

    state.selectedId = selected.id;
    detail.innerHTML = createDetail(selected);
  }

  function createCurl(log) {
    if (log.type !== "fetch" && log.type !== "xhr") {
      return "# cURL hanya tersedia untuk fetch/xhr";
    }

    let curl = `curl -X ${log.method || "GET"} '${log.url}'`;

    Object.keys(log.reqHeaders || {}).forEach((key) => {
      const value = String(log.reqHeaders[key]).replace(/'/g, "'\\''");
      curl += ` \\\n  -H '${key}: ${value}'`;
    });

    if (log.payload) {
      curl += ` \\\n  --data '${String(log.payload).replace(/'/g, "'\\''")}'`;
    }

    return curl;
  }

  function createDetail(log) {
    const general = `Version: ${VERSION}
Context: ${log.context || "-"}
URL: ${log.url || "-"}
Method: ${log.method || "-"}
Status: ${log.status}
Type: ${log.type}
Initiator: ${log.initiatorType || "-"}
Duration: ${log.ms ?? 0}ms
Time: ${log.time}
Size: ${log.size ?? 0} bytes`;

    return `
      <div class="np-detail-wrap">
        <div class="np-copy-row">
          <button class="np-btn" id="npCopyURL">Copy URL</button>
          <button class="np-btn" id="npOpenURL">Open URL</button>
          <button class="np-btn" id="npCopyRaw">Copy Raw</button>
          <button class="np-btn" id="npCopyResponse">Copy Response</button>
          <button class="np-btn" id="npCopyPayload">Copy Payload</button>
          <button class="np-btn" id="npCopyCurl">Copy cURL</button>
        </div>

        <h3>General</h3>
        <pre>${escapeHTML(mask(general))}</pre>

        <details open>
          <summary>Request Headers</summary>
          <pre>${escapeHTML(mask(headersToString(log.reqHeaders)))}</pre>
        </details>

        <details open>
          <summary>Response Headers</summary>
          <pre>${escapeHTML(mask(headersToString(log.resHeaders)))}</pre>
        </details>

        <details open>
          <summary>Payload / Request Body</summary>
          <pre>${escapeHTML(mask(log.payload || "(empty/cannot read)"))}</pre>
        </details>

        <details open>
          <summary>Response / Notes</summary>
          <pre>${escapeHTML(mask(pretty(log.response || "(empty/cannot read)")))}</pre>
        </details>

        <details>
          <summary>Raw JSON</summary>
          <pre>${escapeHTML(mask(JSON.stringify(log, null, 2)))}</pre>
        </details>
      </div>
    `;
  }

  function addLog(log) {
    if (!state.recording && !["resource", "navigation", "frame"].includes(log.type)) return;

    log.id = ++state.seq;
    log.time = now();
    log.size = log.size ?? String(log.response || "").length;

    state.logs.push(log);
    TOP.__API_LOGS__ = state.logs;
    state.selectedId = log.id;

    try {
      console.groupCollapsed("🌐 " + log.type + " " + (log.method || "-") + " " + log.status + " " + (log.url || ""));
      console.log(log);
      console.groupEnd();
    } catch {}

    render();
  }

  function importPerformanceEntries(win = TOP, context = "top") {
    try {
      const perf = win.performance;
      if (!perf) return;

      const nav = perf.getEntriesByType("navigation")[0];

      if (nav) {
        addLog({
          type: "navigation",
          context,
          initiatorType: "document",
          url: win.location.href,
          method: "GET",
          status: "loaded",
          ms: Math.round(nav.duration || 0),
          reqHeaders: {},
          resHeaders: {},
          payload: "",
          response: "Navigation entry only. Header/body tidak tersedia karena request terjadi sebelum Network Pro aktif.",
          size: Math.round(nav.transferSize || nav.encodedBodySize || 0),
        });
      }

      perf.getEntriesByType("resource").forEach((entry) => {
        addLog({
          type: "resource",
          context,
          initiatorType: entry.initiatorType || "resource",
          url: entry.name,
          method: "GET",
          status: "loaded",
          ms: Math.round(entry.duration || 0),
          reqHeaders: {},
          resHeaders: {},
          payload: "",
          response: "Performance resource entry only. Header/body tidak tersedia.",
          size: Math.round(entry.transferSize || entry.encodedBodySize || 0),
        });
      });

      toast("Resources imported");
    } catch (error) {
      console.error(error);
      toast("Gagal import resources");
    }
  }

  function hookWindow(win, context = "top") {
    try {
      if (!win || win.__NETPRO_V3_HOOKED__) return;
      win.__NETPRO_V3_HOOKED__ = true;
    } catch {
      return;
    }

    hookFetch(win, context);
    hookXHR(win, context);
    hookBeacon(win, context);
    hookWebSocket(win, context);
  }

  function hookFetch(win, context) {
    try {
      const originalFetch = win.fetch;
      const RequestCtor = safeConstructor(win, "Request");

      if (!originalFetch || originalFetch.__netproV3Hooked) return;

      win.fetch = async function (input, init = {}) {
        const startedAt = performance.now();

        let url = "";
        let method = "GET";
        let payload = "";
        let reqHeaders = {};

        try {
          if (RequestCtor && input instanceof RequestCtor) {
            url = input.url;
            method = input.method || "GET";
            reqHeaders = headersToObject(input.headers);
          } else {
            url = String(input);
          }

          if (init && init.method) method = init.method;

          if (init && init.headers) {
            reqHeaders = {
              ...reqHeaders,
              ...headersToObject(init.headers),
            };
          }

          if (init && init.body) payload = bodyToText(init.body, win);
        } catch {}

        try {
          const response = await originalFetch.apply(this, arguments);

          let responseText = "";

          try {
            responseText = truncate(await response.clone().text());
          } catch (error) {
            responseText = "[unreadable response: " + error.message + "]";
          }

          addLog({
            type: "fetch",
            context,
            initiatorType: "fetch",
            url,
            method,
            status: response.status,
            ms: Math.round(performance.now() - startedAt),
            reqHeaders,
            resHeaders: headersToObject(response.headers),
            payload,
            response: responseText,
          });

          return response;
        } catch (error) {
          addLog({
            type: "fetch",
            context,
            initiatorType: "fetch",
            url,
            method,
            status: "ERR",
            ms: Math.round(performance.now() - startedAt),
            reqHeaders,
            resHeaders: {},
            payload,
            response: String(error),
          });

          throw error;
        }
      };

      win.fetch.__netproV3Hooked = true;
    } catch {}
  }

  function hookXHR(win, context) {
    try {
      const XHR = win.XMLHttpRequest;
      if (!XHR || XHR.prototype.__netproV3Hooked) return;

      const originalOpen = XHR.prototype.open;
      const originalSend = XHR.prototype.send;
      const originalSetRequestHeader = XHR.prototype.setRequestHeader;

      XHR.prototype.open = function (method, url) {
        this.__npMethod = method;
        this.__npUrl = url;
        this.__npHeaders = {};
        return originalOpen.apply(this, arguments);
      };

      XHR.prototype.setRequestHeader = function (key, value) {
        this.__npHeaders = this.__npHeaders || {};
        this.__npHeaders[key] = value;
        return originalSetRequestHeader.apply(this, arguments);
      };

      XHR.prototype.send = function (body) {
        const xhr = this;
        const startedAt = performance.now();
        const payload = bodyToText(body, win);

        xhr.addEventListener("loadend", () => {
          let responseText = "";

          try {
            responseText = truncate(xhr.responseText);
          } catch {
            responseText = "[unreadable xhr response]";
          }

          addLog({
            type: "xhr",
            context,
            initiatorType: "xhr",
            url: xhr.__npUrl,
            method: xhr.__npMethod,
            status: xhr.status,
            ms: Math.round(performance.now() - startedAt),
            reqHeaders: xhr.__npHeaders || {},
            resHeaders: parseXHRHeaders(xhr.getAllResponseHeaders()),
            payload,
            response: responseText,
          });
        });

        return originalSend.apply(this, arguments);
      };

      XHR.prototype.__netproV3Hooked = true;
    } catch {}
  }

  function hookBeacon(win, context) {
    try {
      if (!win.navigator || !win.navigator.sendBeacon || win.navigator.sendBeacon.__netproV3Hooked) return;

      const originalBeacon = win.navigator.sendBeacon.bind(win.navigator);

      win.navigator.sendBeacon = function (url, data) {
        const payload = bodyToText(data, win);
        const ok = originalBeacon(url, data);

        addLog({
          type: "fetch",
          context,
          initiatorType: "sendBeacon",
          url: String(url),
          method: "BEACON",
          status: ok ? "queued" : "failed",
          ms: 0,
          reqHeaders: {},
          resHeaders: {},
          payload,
          response: "sendBeacon tidak mengekspos response body.",
        });

        return ok;
      };

      win.navigator.sendBeacon.__netproV3Hooked = true;
    } catch {}
  }

  function hookWebSocket(win, context) {
    try {
      if (!win.WebSocket || win.WebSocket.__netproV3Hooked) return;

      const NativeWebSocket = win.WebSocket;

      function WrappedWebSocket(url, protocols) {
        const ws = protocols ? new NativeWebSocket(url, protocols) : new NativeWebSocket(url);
        const startedAt = performance.now();

        addLog({
          type: "websocket",
          context,
          initiatorType: "websocket",
          url: String(url),
          method: "WS",
          status: "connecting",
          ms: 0,
          reqHeaders: {},
          resHeaders: {},
          payload: "",
          response: "WebSocket created.",
        });

        ws.addEventListener("open", () => {
          addLog({
            type: "websocket",
            context,
            initiatorType: "websocket",
            url: String(url),
            method: "WS",
            status: "open",
            ms: Math.round(performance.now() - startedAt),
            reqHeaders: {},
            resHeaders: {},
            payload: "",
            response: "WebSocket opened.",
          });
        });

        ws.addEventListener("message", (event) => {
          addLog({
            type: "websocket",
            context,
            initiatorType: "websocket",
            url: String(url),
            method: "WS",
            status: "message",
            ms: 0,
            reqHeaders: {},
            resHeaders: {},
            payload: "",
            response: truncate(typeof event.data === "string" ? event.data : "[binary websocket message]"),
          });
        });

        ws.addEventListener("close", () => {
          addLog({
            type: "websocket",
            context,
            initiatorType: "websocket",
            url: String(url),
            method: "WS",
            status: "closed",
            ms: 0,
            reqHeaders: {},
            resHeaders: {},
            payload: "",
            response: "WebSocket closed.",
          });
        });

        const nativeSend = ws.send;
        ws.send = function (data) {
          addLog({
            type: "websocket",
            context,
            initiatorType: "websocket",
            url: String(url),
            method: "WS SEND",
            status: "sent",
            ms: 0,
            reqHeaders: {},
            resHeaders: {},
            payload: bodyToText(data, win),
            response: "",
          });

          return nativeSend.apply(ws, arguments);
        };

        return ws;
      }

      WrappedWebSocket.prototype = NativeWebSocket.prototype;
      WrappedWebSocket.CONNECTING = NativeWebSocket.CONNECTING;
      WrappedWebSocket.OPEN = NativeWebSocket.OPEN;
      WrappedWebSocket.CLOSING = NativeWebSocket.CLOSING;
      WrappedWebSocket.CLOSED = NativeWebSocket.CLOSED;

      win.WebSocket = WrappedWebSocket;
      win.WebSocket.__netproV3Hooked = true;
    } catch {}
  }

  function scanFrames() {
    state.logs = state.logs.filter((log) => log.type !== "frame");
    state.frames = [];

    const frames = [...D.querySelectorAll("iframe, webview")];

    if (!frames.length) {
      addLog({
        type: "frame",
        context: "top",
        initiatorType: "frame-scan",
        url: location.href,
        method: "SCAN",
        status: "none",
        ms: 0,
        reqHeaders: {},
        resHeaders: {},
        payload: "",
        response: "Tidak ada iframe/webview yang terlihat dari halaman ini.",
      });
      return;
    }

    frames.forEach((frame, index) => {
      let src = frame.src || frame.getAttribute("src") || "";
      let accessible = false;
      let realLocation = "";
      let note = "";

      try {
        if (frame.contentWindow) {
          realLocation = frame.contentWindow.location.href;
          accessible = true;
          hookWindow(frame.contentWindow, "frame#" + index);
          try {
            importPerformanceEntries(frame.contentWindow, "frame#" + index);
          } catch {}
          note = "Frame bisa diakses. Hook fetch/xhr/ws sudah dipasang ke frame ini.";
        }
      } catch (error) {
        accessible = false;
        note =
          "Frame cross-origin/sandbox. Browser tidak mengizinkan script top page masuk ke frame ini. Copy/Open URL frame lalu jalankan NET langsung di URL tersebut.";
      }

      const url = realLocation || src || "(no src)";

      state.frames.push({
        index,
        tag: frame.tagName,
        url,
        accessible,
      });

      addLog({
        type: "frame",
        context: "top",
        initiatorType: "frame-scan",
        url,
        method: "FRAME",
        status: accessible ? "accessible" : "cross-origin",
        ms: 0,
        reqHeaders: {},
        resHeaders: {},
        payload: "",
        response:
          "Index: " + index +
          "\nTag: " + frame.tagName +
          "\nAccessible: " + accessible +
          "\nURL: " + url +
          "\n\n" + note,
      });
    });

    toast("Frames scanned");
  }

  const ui = createUI();

  hookWindow(TOP, "top");
  importPerformanceEntries(TOP, "top");
  scanFrames();

  TOP.__NETPRO_V3__ = {
    toggle: () => ui.button.click(),
    open: () => {
      ui.panel.style.display = "block";
      render();
    },
    close: () => {
      ui.panel.style.display = "none";
    },
    scanFrames,
    importResources: () => importPerformanceEntries(TOP, "top"),
    state,
    version: VERSION,
  };

  render();
  toast("Network Pro V3 aktif");
})();
