/* JSON Studio — all parsing happens locally with JSON.parse. */
(function () {
  "use strict";
  var $ = S3.$, $$ = S3.$$;
  var input = $("#input"), out = $("#out"), tree = $("#tree"), status = $("#status"), stats = $("#stats");
  var state = { indent: S3.store("json.indent") || "2", view: "text", data: undefined, text: "" };

  function seg(el, value, onPick) {
    $$("button", el).forEach(function (b) {
      b.setAttribute("aria-pressed", String(b.dataset.v === value));
      b.addEventListener("click", function () {
        $$("button", el).forEach(function (x) { x.setAttribute("aria-pressed", String(x === b)); });
        onPick(b.dataset.v);
      });
    });
  }

  function sortDeep(v) {
    if (Array.isArray(v)) return v.map(sortDeep);
    if (v && typeof v === "object") {
      var o = {};
      Object.keys(v).sort().forEach(function (k) { o[k] = sortDeep(v[k]); });
      return o;
    }
    return v;
  }

  // Error position across engines: "at position 42", "(line 3 column 5)", "at line 3 column 5".
  function locate(msg, text) {
    var m = /line (\d+) column (\d+)/i.exec(msg);
    if (m) return { line: +m[1], col: +m[2] };
    m = /position (\d+)/i.exec(msg);
    if (!m) return null;
    var pos = +m[1], before = text.slice(0, pos).split("\n");
    return { line: before.length, col: before[before.length - 1].length + 1 };
  }

  function parse(text) {
    try { return { ok: true, data: JSON.parse(text) }; }
    catch (e) { return { ok: false, error: e.message, at: locate(e.message, text) }; }
  }

  function measure(v) {
    var keys = 0, depth = 0, nodes = 0;
    (function walk(x, d) {
      nodes++; if (d > depth) depth = d;
      if (x && typeof x === "object") {
        var ks = Object.keys(x); if (!Array.isArray(x)) keys += ks.length;
        ks.forEach(function (k) { walk(x[k], d + 1); });
      }
    })(v, 0);
    return { keys: keys, depth: depth, nodes: nodes };
  }

  function stat(label, value) { return '<div class="stat"><b>' + S3.esc(value) + "</b><span>" + S3.esc(label) + "</span></div>"; }

  function render(mode) {
    var text = input.value;
    stats.innerHTML = "";
    if (!text.trim()) {
      status.className = "chip"; status.textContent = "Waiting for JSON";
      out.textContent = ""; tree.innerHTML = ""; state.data = undefined; return;
    }
    var r = parse(text);
    if (!r.ok) {
      status.className = "chip bad";
      status.textContent = r.at ? "Error at line " + r.at.line + ", col " + r.at.col : "Invalid JSON";
      var lines = text.split("\n"), html = S3.esc(r.error) + "\n\n";
      if (r.at) {
        var from = Math.max(0, r.at.line - 4), to = Math.min(lines.length, r.at.line + 2);
        for (var i = from; i < to; i++) {
          var ln = (i + 1 + "").padStart(4) + " │ " + S3.esc(lines[i]);
          html += i + 1 === r.at.line ? '<span class="err-line">' + ln + "\n" + " ".repeat(6 + r.at.col) + "^</span>" : ln + "\n";
        }
      }
      out.innerHTML = html; tree.innerHTML = ""; state.data = undefined;
      return;
    }
    var data = $("#sortkeys").checked ? sortDeep(r.data) : r.data;
    var ind = state.indent === "tab" ? "\t" : +state.indent;
    state.data = data;
    state.text = mode === "minify" ? JSON.stringify(data) : JSON.stringify(data, null, ind);
    out.textContent = state.text;
    status.className = "chip ok"; status.textContent = "Valid JSON";
    var m = measure(data);
    stats.innerHTML = stat("size", S3.fmtBytes(new Blob([state.text]).size)) + stat("keys", m.keys.toLocaleString()) +
      stat("depth", m.depth) + stat("values", m.nodes.toLocaleString());
    if (state.view === "tree") drawTree();
    if (mode) S3.done();
  }

  // ---------- tree (children render lazily on expand, so huge files stay fast) ----------
  function pathJoin(path, key, isArr) {
    return isArr ? path + "[" + key + "]" : /^[A-Za-z_$][\w$]*$/.test(key) ? path + "." + key : path + "[" + JSON.stringify(key) + "]";
  }
  function leaf(v) {
    if (v === null) return '<span class="z">null</span>';
    if (typeof v === "string") return '<span class="s">' + S3.esc(JSON.stringify(v)) + "</span>";
    if (typeof v === "number") return '<span class="n">' + v + "</span>";
    if (typeof v === "boolean") return '<span class="b">' + v + "</span>";
    return "";
  }
  function node(key, v, path, isArrItem, open) {
    var li = document.createElement("li");
    var label = key === null ? "" : '<span class="k" data-path="' + S3.esc(path) + '" title="Copy path">' + S3.esc(isArrItem ? key : JSON.stringify(key)) + "</span>: ";
    if (v && typeof v === "object") {
      var isArr = Array.isArray(v), n = Object.keys(v).length;
      li.innerHTML = '<span class="tog">' + (open ? "▾" : "▸") + "</span>" + label +
        '<span class="meta">' + (isArr ? "[ " + n + " items ]" : "{ " + n + " keys }") + "</span>";
      li._v = v; li._path = path; li._open = false;
      if (open) expand(li);
    } else {
      li.innerHTML = '<span class="tog"></span>' + label + leaf(v);
    }
    return li;
  }
  function expand(li) {
    var v = li._v, isArr = Array.isArray(v), ul = document.createElement("ul");
    Object.keys(v).forEach(function (k) { ul.appendChild(node(k, v[k], pathJoin(li._path, k, isArr), isArr, false)); });
    li.appendChild(ul); li._open = true; li.firstChild.textContent = "▾";
  }
  function drawTree() {
    tree.innerHTML = "";
    if (state.data === undefined) return;
    var ul = document.createElement("ul");
    ul.appendChild(node(null, state.data, "$", false, true));
    tree.appendChild(ul);
  }
  tree.addEventListener("click", function (e) {
    var k = e.target.closest(".k");
    if (k) { S3.copy(k.dataset.path, "Path copied"); return; }
    var tog = e.target.closest(".tog"), li = tog && tog.parentNode;
    if (!li || !li._v) return;
    if (li._open) { li.removeChild(li.lastChild); li._open = false; tog.textContent = "▸"; } else expand(li);
  });

  // ---------- wiring ----------
  seg($("#indent"), state.indent, function (v) { state.indent = v; S3.store("json.indent", v); render("format"); });
  seg($("#view"), "text", function (v) { state.view = v; out.hidden = v !== "text"; tree.hidden = v !== "tree"; if (v === "tree") drawTree(); });
  input.addEventListener("input", S3.debounce(function () { render(); }, 250));
  $("#sortkeys").addEventListener("change", function () { render("format"); });
  $("#format").addEventListener("click", function () { render("format"); if (state.data !== undefined) input.value = state.text; });
  $("#minify").addEventListener("click", function () { render("minify"); if (state.data !== undefined) input.value = state.text; });
  $("#clear").addEventListener("click", function () { input.value = ""; render(); input.focus(); });
  $("#sample").addEventListener("click", function () {
    input.value = JSON.stringify({ name: "S3eidat Tools", free: true, tools: 100, tags: ["private", "fast", "open source"], owner: { country: "Jordan", since: 2026 }, ads: null });
    render("format");
  });
  $("#open input").addEventListener("change", function (e) {
    var f = e.target.files[0]; if (!f) return;
    S3.readFile(f, "text").then(function (t) { input.value = t; render("format"); });
    e.target.value = "";
  });
  input.addEventListener("dragover", function (e) { e.preventDefault(); });
  input.addEventListener("drop", function (e) {
    var f = e.dataTransfer.files[0]; if (!f) return;
    e.preventDefault(); S3.readFile(f, "text").then(function (t) { input.value = t; render("format"); });
  });
  $("#copy").addEventListener("click", function () { if (state.data !== undefined) S3.copy(state.text); else S3.toast("Nothing valid to copy yet", "error"); });
  $("#save").addEventListener("click", function () { if (state.data !== undefined) S3.download(state.text, "data.json", "application/json"); });

  window.S3_DEMO = function () { $("#sample").click(); $("#view button[data-v=tree]").click(); };

  // Self-test run by scripts/smoke.py
  window.S3_SELFTEST = function () {
    var a = locate("Unexpected token } in JSON at position 9", '{"a":1,\n}');
    var b = locate("JSON.parse: expected ',' at line 3 column 5 of the JSON data", "");
    var s = JSON.stringify(sortDeep({ b: 1, a: { d: 1, c: 2 } }));
    var m = measure({ a: [1, 2, { b: 3 }] });
    return a.line === 2 && a.col === 2 && b.line === 3 && b.col === 5 && s === '{"a":{"c":2,"d":1},"b":1}' && m.depth === 3 && m.keys === 2;
  };
})();
