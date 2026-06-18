(() => {
  if (window.__NETPRO__) {
    window.__NETPRO__.toggle();
    return;
  }

  const D = document;
  const W = window;

  const ST = {
    logs: [],
    selectedId: null,
    recording: true,
    filter: "all",
    query: "",
    seq: 0,
  };

  const BASE_CSS =
    "all:initial;box-sizing:border-box;font-family:Arial,sans-serif;color:#e9eef5;";

  function escapeHTML(value) {
    return String(value ?? "").replace(/[&<>"']/g, (char) => {
      return {
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      }[char];
    });
  }

  function truncateText(value, max = 60000) {
    const text = String(value ?? "");
    if (text.length <= max) return text;
    return text.slice(0, max) + "\n...[TRUNCATED " + (text.length - max) + " chars]";
  }

  function prettyJSON(value) {
    try {
      return JSON.stringify(JSON.parse(value), null, 2);
    } catch {
      return value ?? "";
    }
  }

  function maskSensitive(value) {
    return String(value ?? "")
      .replace(
        /(authorization\s*[:=]\s*["']?)(bearer\s+)?[^\s"'&,}]+/gi,
        "$1$2***MASKED***"
      )
      .replace(/(cookie\s*[:=]\s*["']?)[^\n]+/gi, "$1***MASKED***")
      .replace(
        /((access_|refresh_)?token\s*[:=]\s*["']?)[^\s"'&,}]+/gi,
        "$1***MASKED***"
      )
      .replace(/(password\s*[:=]\s*["']?)[^\s"'&,}]+/gi, "$1***MASKED***");
  }

  function bodyToText(body) {
    try {
      if (!body) return "";

      if (typeof body === "string") return body;

      if (body instanceof URLSearchParams) {
        return body.toString();
      }

      if (body instanceof FormData) {
        const arr = [];
        body.forEach((value, key) => {
          if (value instanceof File) {
            arr.push(key + "=[File:" + value.name + "]");
          } else {
            arr.push(key + "=" + value);
          }
        });
        return arr.join("&");
      }

      if (body instanceof Blob) {
        return "[Blob " + body.type + " " + body.size + " bytes]";
      }

      if (body instanceof ArrayBuffer) {
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
    return Object.keys(headers || {})
      .map((key) => key + ": " + headers[key])
      .join("\n");
  }

  function parseXHRHeaders(rawHeaders) {
    const output = {};

    String(rawHeaders || "")
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

  function copyText(text) {
    try {
      navigator.clipboard.writeText(text);
      showToast("Copied");
    } catch {
      console.log(text);
      showToast("Copy gagal, lihat console");
    }
  }

  function showToast(text) {
    let toast = D.getElementById("__np_toast");

    if (!toast) {
      toast = D.createElement("div");
      toast.id = "__np_toast";
      toast.style.cssText =
        BASE_CSS +
        "position:fixed;left:50%;bottom:78px;transform:translateX(-50%);z-index:2147483647;background:#111;border:1px solid #555;border-radius:999px;padding:8px 14px;font-size:12px;";
      D.body.appendChild(toast);
    }

    toast.textContent = text;
    toast.style.display = "block";

    setTimeout(() => {
      toast.style.display = "none";
    }, 1200);
  }

  function createElement(tag, css, html) {
    const element = D.createElement(tag);
    element.style.cssText = BASE_CSS + css;

    if (html != null) {
      element.innerHTML = html;
    }

    return element;
  }

  const button = createElement(
    "button",
    "position:fixed;right:10px;bottom:12px;z-index:2147483647;width:50px;height:50px;border-radius:999px;border:1px solid #6b7280;background:#111827;color:#fff;font:700 13px Arial;box-shadow:0 8px 24px #0008;",
    "NET"
  );

  const panel = createElement(
    "div",
    "display:none;position:fixed;left:4px;right:4px;bottom:68px;height:72vh;z-index:2147483646;background:#0b1220;border:1px solid #334155;border-radius:12px;box-shadow:0 10px 35px #000a;overflow:hidden;"
  );

  panel.innerHTML = `
    <div style="display:flex;gap:6px;align-items:center;padding:7px;border-bottom:1px solid #263244;background:#111827">
      <b style="flex:1;color:#fff;font:700 13px Arial">Network Pro</b>
      <button id="np_rec">REC</button>
      <button id="np_all">All</button>
      <button id="np_fx">Fetch</button>
      <button id="np_xhr">XHR</button>
      <button id="np_err">Err</button>
      <button id="np_clear">Clear</button>
      <button id="np_close">×</button>
    </div>

    <div style="display:flex;gap:6px;padding:6px;border-bottom:1px solid #263244">
      <input id="np_q" placeholder="filter url/status/method" style="flex:1;background:#020617;color:#e5e7eb;border:1px solid #334155;border-radius:8px;padding:8px;font:12px Arial">
    </div>

    <div id="np_body" style="display:grid;grid-template-columns:44% 56%;height:calc(72vh - 92px)">
      <div id="np_list" style="overflow:auto;border-right:1px solid #263244"></div>
      <div id="np_detail" style="overflow:auto"></div>
    </div>
  `;

  D.documentElement.appendChild(button);
  D.documentElement.appendChild(panel);

  function updateButtonStyle() {
    ["all", "fx", "xhr", "err"].forEach((name) => {
      const btn = D.getElementById("np_" + name);
      if (!btn) return;

      btn.style.background = ST.filter === name ? "#2563eb" : "#1f2937";
      btn.style.color = "#fff";
      btn.style.border = "1px solid #475569";
      btn.style.borderRadius = "6px";
      btn.style.padding = "5px 7px";
      btn.style.font = "12px Arial";
    });

    const rec = D.getElementById("np_rec");
    if (rec) {
      rec.style.background = ST.recording ? "#dc2626" : "#374151";
      rec.style.color = "#fff";
      rec.style.border = "1px solid #475569";
      rec.style.borderRadius = "6px";
      rec.style.padding = "5px 7px";
      rec.style.font = "12px Arial";
    }
  }

  function createListItem(log) {
    const isOK =
      String(log.status).startsWith("2") || String(log.status).startsWith("3");

    return `
      <div data-id="${log.id}" style="padding:8px;border-bottom:1px solid #1f2a3a;${ST.selectedId === log.id ? "background:#1d4ed8" : "background:#0b1220"}">
        <div style="display:flex;gap:5px">
          <b style="color:${isOK ? "#86efac" : "#fca5a5"}">${escapeHTML(log.status)}</b>
          <span>${escapeHTML(log.method)}</span>
          <span style="margin-left:auto;color:#94a3b8">${escapeHTML(log.ms)}ms</span>
        </div>
        <div style="word-break:break-all;color:#93c5fd;font-size:11px">${escapeHTML(log.url)}</div>
        <div style="color:#94a3b8;font-size:11px">${escapeHTML(log.type)} • ${escapeHTML(log.time)} • ${escapeHTML(log.size)}b</div>
      </div>
    `;
  }

  function isMatch(log) {
    const query = ST.query.toLowerCase();
    const filter = ST.filter;

    if (filter === "fx" && log.type !== "fetch") return false;
    if (filter === "xhr" && log.type !== "xhr") return false;

    if (
      filter === "err" &&
      !(
        String(log.status).startsWith("4") ||
        String(log.status).startsWith("5") ||
        String(log.status) === "ERR"
      )
    ) {
      return false;
    }

    if (!query) return true;

    return (
      log.url +
      " " +
      log.method +
      " " +
      log.status +
      " " +
      log.type
    )
      .toLowerCase()
      .includes(query);
  }

  function render() {
    updateButtonStyle();

    const list = D.getElementById("np_list");
    const detail = D.getElementById("np_detail");

    if (!list || !detail) return;

    const filteredLogs = ST.logs.filter(isMatch).slice().reverse();

    list.innerHTML =
      filteredLogs.map(createListItem).join("") ||
      '<div style="padding:10px;color:#94a3b8">Belum ada request. Klik fitur web setelah REC aktif.</div>';

    list.querySelectorAll("[data-id]").forEach((node) => {
      node.onclick = () => {
        ST.selectedId = Number(node.dataset.id);
        render();
      };
    });

    const selectedLog =
      ST.logs.find((item) => item.id === ST.selectedId) || filteredLogs[0];

    if (selectedLog) {
      ST.selectedId = selectedLog.id;
      detail.innerHTML = createDetail(selectedLog);
    } else {
      detail.innerHTML =
        '<div style="padding:12px;color:#94a3b8">Pilih request untuk lihat Headers / Payload / Response.</div>';
    }
  }

  function createCurl(log) {
    let curl = `curl -X ${log.method} '${log.url}'`;

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
    const raw = JSON.stringify(log, null, 2);
    const general = `URL: ${log.url}
Method: ${log.method}
Status: ${log.status}
Type: ${log.type}
Duration: ${log.ms}ms
Time: ${log.time}
Size: ${log.size} bytes`;

    return `
      <div style="padding:9px">
        <div style="display:flex;gap:6px;flex-wrap:wrap">
          <button id="np_cp_raw">Copy Raw</button>
          <button id="np_cp_res">Copy Response</button>
          <button id="np_cp_pay">Copy Payload</button>
          <button id="np_cp_curl">Copy cURL</button>
        </div>

        <h3 style="font:700 14px Arial;color:#fff;margin:10px 0 6px">General</h3>
        <pre>${escapeHTML(maskSensitive(general))}</pre>

        <details open>
          <summary>Request Headers</summary>
          <pre>${escapeHTML(maskSensitive(headersToString(log.reqHeaders) || "(empty/cannot read)"))}</pre>
        </details>

        <details open>
          <summary>Response Headers</summary>
          <pre>${escapeHTML(maskSensitive(headersToString(log.resHeaders) || "(empty/cannot read)"))}</pre>
        </details>

        <details open>
          <summary>Payload / Request Body</summary>
          <pre>${escapeHTML(maskSensitive(log.payload || "(empty)"))}</pre>
        </details>

        <details open>
          <summary>Response</summary>
          <pre>${escapeHTML(maskSensitive(prettyJSON(log.response || "")))}</pre>
        </details>

        <details>
          <summary>Raw JSON</summary>
          <pre>${escapeHTML(maskSensitive(raw))}</pre>
        </details>
      </div>
    `;
  }

  panel.addEventListener("click", (event) => {
    const log = ST.logs.find((item) => item.id === ST.selectedId);
    if (!log) return;

    if (event.target.id === "np_cp_raw") {
      copyText(maskSensitive(JSON.stringify(log, null, 2)));
    }

    if (event.target.id === "np_cp_res") {
      copyText(maskSensitive(log.response || ""));
    }

    if (event.target.id === "np_cp_pay") {
      copyText(maskSensitive(log.payload || ""));
    }

    if (event.target.id === "np_cp_curl") {
      copyText(maskSensitive(createCurl(log)));
    }
  });

  D.getElementById("np_rec").onclick = () => {
    ST.recording = !ST.recording;
    render();
  };

  D.getElementById("np_clear").onclick = () => {
    ST.logs = [];
    ST.selectedId = null;
    render();
  };

  D.getElementById("np_close").onclick = () => {
    panel.style.display = "none";
  };

  D.getElementById("np_q").oninput = (event) => {
    ST.query = event.target.value;
    render();
  };

  D.getElementById("np_all").onclick = () => {
    ST.filter = "all";
    render();
  };

  D.getElementById("np_fx").onclick = () => {
    ST.filter = "fx";
    render();
  };

  D.getElementById("np_xhr").onclick = () => {
    ST.filter = "xhr";
    render();
  };

  D.getElementById("np_err").onclick = () => {
    ST.filter = "err";
    render();
  };

  button.onclick = () => {
    panel.style.display = panel.style.display === "none" ? "block" : "none";
    render();
  };

  function addLog(log) {
    if (!ST.recording) return;

    log.id = ++ST.seq;
    log.time = new Date().toLocaleTimeString();
    log.size = String(log.response || "").length;

    ST.logs.push(log);
    W.__API_LOGS__ = ST.logs;
    ST.selectedId = log.id;

    console.groupCollapsed(
      "🌐 " + log.type + " " + log.method + " " + log.status + " " + log.url
    );
    console.log(log);
    console.groupEnd();

    render();
  }

  const originalFetch = W.fetch;

  if (originalFetch && !originalFetch.__netpro_hooked) {
    W.fetch = async function (input, init = {}) {
      const startedAt = performance.now();

      let url = "";
      let method = "GET";
      let payload = "";
      let reqHeaders = {};

      try {
        if (input instanceof Request) {
          url = input.url;
          method = input.method;
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

        if (init && init.body) {
          payload = bodyToText(init.body);
        }
      } catch {}

      try {
        const response = await originalFetch.apply(this, arguments);

        let responseText = "";

        try {
          responseText = truncateText(await response.clone().text());
        } catch (error) {
          responseText = "[unreadable response: " + error.message + "]";
        }

        addLog({
          type: "fetch",
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

    W.fetch.__netpro_hooked = true;
  }

  const originalOpen = XMLHttpRequest.prototype.open;
  const originalSend = XMLHttpRequest.prototype.send;
  const originalSetRequestHeader = XMLHttpRequest.prototype.setRequestHeader;

  if (!XMLHttpRequest.prototype.__netpro_hooked) {
    XMLHttpRequest.prototype.open = function (method, url) {
      this.__np_method = method;
      this.__np_url = url;
      this.__np_headers = {};

      return originalOpen.apply(this, arguments);
    };

    XMLHttpRequest.prototype.setRequestHeader = function (key, value) {
      this.__np_headers = this.__np_headers || {};
      this.__np_headers[key] = value;

      return originalSetRequestHeader.apply(this, arguments);
    };

    XMLHttpRequest.prototype.send = function (body) {
      const xhr = this;
      const startedAt = performance.now();
      const payload = bodyToText(body);

      xhr.addEventListener("loadend", () => {
        let responseText = "";

        try {
          responseText = truncateText(xhr.responseText);
        } catch {
          responseText = "[unreadable xhr response]";
        }

        addLog({
          type: "xhr",
          url: xhr.__np_url,
          method: xhr.__np_method,
          status: xhr.status,
          ms: Math.round(performance.now() - startedAt),
          reqHeaders: xhr.__np_headers || {},
          resHeaders: parseXHRHeaders(xhr.getAllResponseHeaders()),
          payload,
          response: responseText,
        });
      });

      return originalSend.apply(this, arguments);
    };

    XMLHttpRequest.prototype.__netpro_hooked = true;
  }

  W.__NETPRO__ = {
    toggle: () => button.click(),
    open: () => {
      panel.style.display = "block";
      render();
    },
    close: () => {
      panel.style.display = "none";
    },
    state: ST,
  };

  panel.style.display = "block";
  render();
  showToast("Network Pro aktif");
})();
