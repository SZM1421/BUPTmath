/* 工科数学分析（上）· 真题数据库 —— 前端逻辑 */
const DB = window.DB;
const QMAP = {}, KPMAP = {}, SECMAP = {}, CHMAP = {};
DB.questions.forEach(q => QMAP[q.id] = q);
DB.kps.forEach(k => KPMAP[k.id] = k);
DB.sections.forEach(s => SECMAP[s.id] = s);
DB.chapters.forEach(c => CHMAP[c.id] = c);

const TYPE_NAME = { choice: "选择", fill: "填空", big: "解答" };
const TYPE_ORDER = { choice: 0, fill: 1, big: 2 };

/* 全库唯一编号：选择 → 填空 → 解答，三位数，与册子上的“编号”一致 */
const QCODE = {};
[...DB.questions]
  .sort((a, b) => (TYPE_ORDER[a.type] - TYPE_ORDER[b.type]) || (a.no - b.no))
  .forEach((q, i) => { QCODE[q.id] = String(i + 1).padStart(3, "0"); });

let state = { node: "ch1", showAns: false, simOf: null, simSel: new Set(), simIds: [], pick: new Set(), pickNode: null, search: "", view: "tree", typeFilter: "", srcFilter: "" };

/* ---------- 收藏（本地保存） ---------- */
let FAV = [];
try { FAV = JSON.parse(localStorage.getItem("tb_fav") || "[]"); } catch (e) { FAV = []; }
if (!Array.isArray(FAV)) FAV = [];
const isFav = id => FAV.some(f => f.id === id);
function saveFav() {
  try { localStorage.setItem("tb_fav", JSON.stringify(FAV)); } catch (e) {}
  const n = $("#favCount");
  if (n) n.textContent = FAV.length;
}
function setStar(b, on) {
  b.classList.toggle("on", on);
  b.textContent = on ? "★" : "☆";
  b.title = on ? "取消收藏" : "添加收藏";
  b.setAttribute("aria-pressed", on ? "true" : "false");
}
function toggleFav(id) {
  const i = FAV.findIndex(f => f.id === id);
  if (i >= 0) FAV.splice(i, 1); else FAV.unshift({ id, t: Date.now() });
  saveFav();
  document.querySelectorAll(`[data-fav="${id}"]`).forEach(b => setStar(b, isFav(id)));
  if (state.view === "fav") render();
}

/* ---------- 工具 ---------- */
/* 题干模糊匹配：去掉公式命令与符号，空格分隔的多个词须全部命中 */
function normStem(t) {
  return String(t || "")
    .replace(/&(?:lt|gt|amp|nbsp|quot);/g, " ")
    .replace(/\\([a-zA-Z]+)/g, "$1")
    .replace(/[{}$^_&\\]/g, " ")
    .replace(/[()\[\]|<>]/g, " ")
    .replace(/\s+/g, "")
    .toLowerCase();
}
function fuzzyHit(stem, kw) {
  const s = normStem(stem);
  const parts = String(kw || "").trim().split(/[\s,，、]+/).map(normStem).filter(Boolean);
  return parts.length > 0 && parts.every(x => s.includes(x));
}
const CODE2ID = {};
Object.keys(QCODE).forEach(id => { CODE2ID[QCODE[id]] = id; });
const SRCS = [...new Set(DB.questions.map(q => q.src))].sort((a, b) => srcRank(b) - srcRank(a));
const esc = s => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const $ = sel => document.querySelector(sel);
/* 教材正文入口：按知识点生成带页码定位的 PDF 链接 */
function bkLink(kpid, extra) {
  const b = window.bookPage ? window.bookPage(kpid) : null;
  if (!b) return "";
  const B = window.BOOK;
  return `<a class="bk ${extra || ""}" href="${window.bookHref(kpid)}" target="_blank" rel="noopener" `
       + `title="${esc(B.title)} P${b.printed}（PDF 第 ${b.physical} 页）">`
       + `点击查看教材P${b.printed}</a>`;
}
function math(el) {
  if (!el) return;
  renderMathInElement(el, {
    delimiters: [{ left: "$$", right: "$$", display: true }, { left: "$", right: "$", display: false }],
    throwOnError: false, ignoredTags: ["script", "noscript", "style", "textarea", "pre", "code"]
  });
}
function hit(q, node) {
  const list = q.kps;
  if (node.startsWith("ch")) {
    const n = node.slice(2);
    return list.some(k => k.split(".")[0] === n);
  }
  if (node.split(".").length === 2) return list.some(k => k.startsWith(node + "."));
  return list.includes(node);
}
function primaryHit(q, node) {
  if (node.startsWith("ch")) return q.primary.split(".")[0] === node.slice(2);
  if (node.split(".").length === 2) return q.primary.startsWith(node + ".");
  return q.primary === node;
}
/* 试卷时间：学年起始 + 期末晚于期中 */
function srcRank(src) {
  const m = /^(\d{2})/.exec(src || "");
  const y = m ? 2000 + Number(m[1]) : 0;
  return y * 2 + (/期末/.test(src || "") ? 1 : 0);
}
function cmpQT(a, b) {
  return (TYPE_ORDER[a.type] - TYPE_ORDER[b.type]) ||
    (srcRank(b.src) - srcRank(a.src)) ||
    (a.no - b.no);
}
function qsOf(node) {
  let arr = DB.questions.filter(q => hit(q, node));
  if (state.srcFilter) arr = arr.filter(q => q.src === state.srcFilter);
  const f = state.typeFilter;
  return (f ? arr.filter(q => q.type === f) : arr).sort(cmpQT);
}
function kpsOf(node) {
  if (node.startsWith("ch")) {
    const n = node.slice(2);
    return DB.kps.filter(k => k.id.split(".")[0] === n);
  }
  if (node.split(".").length === 2) return DB.kps.filter(k => k.sec === node);
  return DB.kps.filter(k => k.id === node);
}
function countByType(arr) {
  const c = { choice: 0, fill: 0, big: 0 };
  arr.forEach(q => c[q.type]++);
  return c;
}

/* ---------- 左侧树 ---------- */
function buildTree() {
  const t = $("#tree");
  t.innerHTML = DB.chapters.map(ch => {
    const secs = DB.sections.filter(s => s.ch === ch.id).map(s => {
      const kps = DB.kps.filter(k => k.sec === s.id).map(k => `
        <li class="kp ${k.count ? "" : "zero"}" data-node="${k.id}">
          <span class="no">${k.id}</span><span>${esc(k.name)}</span>
          <span class="cnt" title="该知识点相关真题 ${k.count} 道">${k.count}</span>
        </li>`).join("");
      return `<li class="sec">
        <div class="sec-hd" data-node="${s.id}"><span class="car" data-car>▶</span>
          <span>${s.no} ${esc(s.name)}</span>
          <span class="cnt" title="本节相关真题 ${s.count} 道">${s.count}</span></div>
        <ul>${kps}</ul></li>`;
    }).join("");
    return `<div class="ch" data-ch="${ch.id}">
      <div class="ch-hd" data-node="${ch.id}"><span class="car" data-car>▶</span>
        <span>${ch.no} ${esc(ch.name)}</span>
        <span class="cnt" title="本章相关真题 ${ch.count} 道">${ch.count}</span></div>
      <ul>${secs}</ul></div>`;
  }).join("");

  // 箭头：未选中的节点 → 选中并展开；已选中的节点 → 收起/展开
  t.querySelectorAll("[data-car]").forEach(c => {
    c.addEventListener("click", e => {
      e.stopPropagation();
      const hd = c.parentElement;
      const box = c.closest("li.sec") || c.closest("div.ch");
      const id = hd.dataset.node;
      if (state.node === id) { box.classList.toggle("open"); return; }
      location.hash = id;
    });
  });
  // 标题：切换内容
  t.querySelectorAll("[data-node]").forEach(el => {
    el.addEventListener("click", e => {
      e.stopPropagation();
      location.hash = el.dataset.node;
    });
  });
}

function gotoQ(id) {
  const q = QMAP[id];
  if (!q) return;
  const node = q.primary;
  const reveal = () => {
    const el = document.getElementById("q-" + id);
    if (!el) return;
    el.scrollIntoView({ block: "center" });
    el.classList.add("flash");
    setTimeout(() => el.classList.remove("flash"), 1600);
  };
  if (state.node !== node) {
    state.node = node;
    if (location.hash.slice(1) !== node) location.hash = node; else render();
    setTimeout(reveal, 160);
  } else {
    render();
    setTimeout(reveal, 120);
  }
}

function openAncestors(el) {
  let p = el.parentElement;
  while (p && p !== document.querySelector(".tree")) {
    if (p.tagName === "LI" || p.classList.contains("ch")) p.classList.add("open");
    p = p.parentElement;
  }
}
function syncTree() {
  document.querySelectorAll(".tree .active").forEach(e => e.classList.remove("active"));
  if (state.view === "fav") {
    document.querySelectorAll(".tree .ch, .tree li.sec").forEach(e => e.classList.remove("open"));
    return;
  }
  // 没选中的分支一律收起，只保留当前路径
  document.querySelectorAll(".tree .ch, .tree li.sec").forEach(e => e.classList.remove("open"));
  const el = document.querySelector(`.tree [data-node="${state.node}"]`);
  if (el) {
    el.classList.add("active");
    openAncestors(el);
    return;
  }
  if (state.node.startsWith("ch")) {
    const hd = document.querySelector(`.tree [data-ch="${state.node}"] > .ch-hd`);
    if (hd) { hd.parentElement.classList.add("open"); hd.classList.add("active"); }
    return;
  }
  const sec = [...document.querySelectorAll(".tree .sec-hd")]
    .find(h => h.textContent.trim().startsWith(state.node + " "));
  if (sec) { sec.parentElement.classList.add("open"); sec.classList.add("active"); openAncestors(sec); }
}

/* ---------- 题目卡片 ---------- */
function qcard(q, idx, opts = {}) {
  const kp = KPMAP[q.primary] || { name: q.primary };
  const o = q.opts || [];
  const longOpt = o.some(x => x.length > 24);
  const optHTML = o.length
    ? `<div class="opts ${longOpt ? "one" : ""}">${o.map((x, i) =>
        `<div>${"ABCD"[i]}．${esc(x)}</div>`).join("")}</div>` : "";
  const blankFill = (q.type === "fill" && !/\\blank/.test(q.stem)) ? "" : "";
  // 解法全部列出：原解在前，其余解法依次附在后面
  const altEntries = (q.alts ? Object.entries(q.alts) : []).filter(([, v]) => v && v !== q.sol);
  altEntries.sort((a, b) => a[0].localeCompare(b[0]));
  if (opts.solKp) altEntries.sort((a, b) => (b[0] === opts.solKp) - (a[0] === opts.solKp));
  const solBlocks =
    `<div class="sol"><span class="k">解析</span>${esc(q.sol)}</div>` +
    altEntries.map(([k, v]) =>
      `<div class="sol alt"><button type="button" class="k kl" data-kp="${k}">另解·${esc((KPMAP[k] || {}).name || k)}</button>${esc(v)}</div>`).join("");
  const ansHTML = `
    <div class="ansbox">
      <div class="ansline"><span class="k">答案</span><b>${esc(q.ans || "—")}</b></div>
      ${solBlocks}
    </div>`;
  const open = !!opts.open;
  return `<article class="qcard ${open ? "open" : ""}" id="q-${q.id}">
    <div class="qhd">
      <label class="qpick" title="勾选后可打印"><input type="checkbox" data-pick="${q.id}"${state.pick.has(q.id) ? " checked" : ""}></label>
      <span class="qno" title="编号">${QCODE[q.id] || idx}</span>
      <button type="button" class="star ${isFav(q.id) ? "on" : ""}" data-fav="${q.id}"
        title="${isFav(q.id) ? "取消收藏" : "添加收藏"}" aria-pressed="${isFav(q.id)}">${isFav(q.id) ? "★" : "☆"}</button>
      <span class="qtype ${q.type}">${TYPE_NAME[q.type]}</span>
      <span class="qsrc">〔${esc(q.src)}〕</span>
      ${(q.same || []).map(id => `<span class="chip same" data-goto="${id}" title="同一道题，另见 ${esc((QMAP[id] || {}).src || "")}">同题 ${QCODE[id] || ""}</span>`).join("")}
      ${[q.primary, ...q.cross].map(k =>
        `<span class="chip" data-kp="${k}" title="查看该小节">${k} ${esc((KPMAP[k] || {}).name || "")}</span>`).join("")}
      ${q.methods.map(k => `<span class="chip m" data-kp="${k}" title="该解法">法 ${esc((KPMAP[k] || {}).name || "")}</span>`).join("")}
      <div class="qact">
        <button class="btn mini ansbtn ${open ? "on" : ""}" data-ansbtn>${open ? "收起" : "答案"}</button>
        ${opts.noSim ? "" : `<button class="btn mini" data-sim="${q.id}">找相似</button>`}
      </div>
    </div>
    <div class="stem">${esc(q.stem).replace(/\\blank/g, '<span class="blank"></span>')}${(q.type === "fill" && !/\\blank/.test(q.stem)) ? '<span class="blank"></span>' : ""}${q.pts ? `<span class="qsrc">（${esc(q.pts)}）</span>` : ""}</div>
    ${optHTML}${ansHTML}
  </article>`;
}

/* ---------- 知识点卡片 ---------- */
function kpcard(k, showBody) {
  return `<div class="kpcard ${showBody ? "open" : ""}" data-kpcard="${k.id}">
    <div class="kh">
      <span class="kno">§${k.id}</span>
      <a class="kname" href="#${k.id}" title="查看该知识点页">${esc(k.name)}</a>
      <span class="knum" title="相关真题 ${k.count} 道">${k.count} 题</span>
    </div>
    <div class="kfoot">
      <button class="btn mini" data-kpexpand="${k.id}">${showBody ? "收起精讲" : "展开精讲"}</button>
      ${bkLink(k.id)}
    </div>
    <div class="kpbody">${k.html || '<div class="emptynote">本知识点暂无精讲正文</div>'}</div>
  </div>`;
}

/* ---------- 主视图 ---------- */
function kpNav(node) {
  if (node.split(".").length !== 3) return "";
  const i = DB.kps.findIndex(k => k.id === node);
  if (i < 0) return "";
  const prev = DB.kps[i - 1], next = DB.kps[i + 1];
  if (!prev && !next) return "";
  return `<div class="kpnav">
    ${prev ? `<button type="button" class="kpnb" data-node="${prev.id}">← §${prev.id} ${esc(prev.name)}</button>` : "<span></span>"}
    ${next ? `<button type="button" class="kpnb" data-node="${next.id}">§${next.id} ${esc(next.name)} →</button>` : "<span></span>"}
  </div>`;
}

function render() {
  if (state.node !== state.pickNode) { state.pick.clear(); state.pickNode = state.node; }
  syncTree();
  const main = $("#main");
  if (state.view === "fav") return renderFav(main);
  if (state.search) return renderSearch(main);

  const node = state.node;
  const qs = qsOf(node);
  const kps = kpsOf(node);
  const c = countByType(qs);
  let crumb = "", title = "", sub = "", desc = "";

  if (node.startsWith("ch")) {
    const ch = CHMAP[node];
    title = `${ch.no}　${ch.name}`;
    crumb = ch.no;
    desc = ch.desc;
  } else if (node.split(".").length === 2) {
    const s = SECMAP[node], ch = CHMAP[s.ch];
    title = `${s.no}　${s.name}`;
    crumb = `${ch.no} ${ch.name}`;
  } else {
    const k = KPMAP[node], s = SECMAP[k.sec], ch = CHMAP[s.ch];
    title = `§${k.id}　${k.name}`;
    crumb = `${ch.no} ${ch.name} / ${s.no} ${s.name}`;
  }
  const times = qs.reduce((n, q) => n + (q.kps.filter(k =>
    node.startsWith("ch") ? k.split(".")[0] === node.slice(2)
      : (node.split(".").length === 2 ? k.startsWith(node + ".") : k === node)).length), 0);
  sub = `共 <b>${qs.length}</b> 题${times !== qs.length ? `（题次 ${times}）` : ""}`
      + `　选择 ${c.choice}　填空 ${c.fill}　解答 ${c.big}　·　${kps.length} 个知识点`;

  let html = `<div class="crumb">${esc(crumb)}</div>
    <h1 class="title">${title}</h1>
    <div class="subline">${sub}</div>
    ${desc ? `<div class="subline" style="margin-top:6px;color:var(--ink2)">${esc(desc)}</div>` : ""}
    <div class="bar">
      <div class="tfilter">
        ${[["", "全部"], ["choice", "选择"], ["fill", "填空"], ["big", "解答"]].map(([v, t]) =>
          `<button type="button" class="tf ${state.typeFilter === v ? "on" : ""}" data-tf="${v}">${t}</button>`).join("")}
      </div>
      <select class="srcfilter" data-srcf title="按试卷筛选">
        <option value="">全部试卷</option>
        ${SRCS.map(v => `<option value="${esc(v)}" ${state.srcFilter === v ? "selected" : ""}>${esc(v)}</option>`).join("")}
      </select>
      <button class="btn" data-anstoggle>${state.showAns ? "隐藏答案" : "显示答案"}</button>
      <div class="pbar" data-scope="main">
        <span class="pn">已选 <b data-pcount>0</b> 道</span>
        <button class="btn mini" data-pall>全选</button>
        <button class="btn mini" data-pmode="paper">打印习题册</button>
        <button class="btn mini" data-pmode="ans">打印答案册</button>
        <button class="btn mini" data-pmode="both">全部打印</button>
      </div>
    </div>`;

  // 知识点汇总
  if (kps.length) {
    html += `<div class="sechd"><h2>知识点汇总</h2><span class="n">${kps.length} 个知识点</span></div>`;
    if (node.startsWith("ch")) {
      DB.sections.filter(s => s.ch === node).forEach(s => {
        const sk = kps.filter(k => k.sec === s.id);
        html += `<div class="sechd" style="margin-top:18px;border-color:var(--gold)">
          <h2 style="font-size:13.5px">${s.no} ${esc(s.name)}</h2><span class="n">${sk.length} 个知识点 · ${s.count} 题</span></div>
          <div class="kpgrid">${sk.map(k => kpcard(k, false)).join("")}</div>`;
      });
    } else {
      html += `<div class="kpgrid ${kps.length === 1 ? "one" : ""}">${kps.map(k => kpcard(k, node.split(".").length === 3)).join("")}</div>`;
    }
  }

  // 题目
  html += `<div class="sechd"><h2>真题</h2><span class="n">${qs.length} 题</span></div>`;
  html += qs.length
    ? `<div class="qlist">${qs.map((q, i) => qcard(q, i + 1,
        { open: state.showAns, solKp: node.split(".").length === 3 ? node : null })).join("")}</div>`
    : `<div class="emptynote">暂无真题</div>`;
  html += kpNav(node);

  main.innerHTML = html;
  bindMain();
  math(main);
}

function exportFav() {
  const day = new Date().toISOString().slice(0, 10);
  const items = FAV.filter(f => QMAP[f.id]);
  const data = {
    app: "工科数学分析·真题数据库", version: "2.4.1", exported: day,
    codes: items.map(f => QCODE[f.id] || f.id),
    items: items.map(f => ({ id: f.id, code: QCODE[f.id] || "", t: f.t }))
  };
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url; a.download = `收藏题目_${day}.json`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function importFav(file) {
  const r = new FileReader();
  r.onload = () => {
    const raw = String(r.result || "").trim();
    let ids = [];
    try {
      const j = JSON.parse(raw);
      if (Array.isArray(j)) ids = j.map(x => typeof x === "string" ? x : (x && (x.id || x.code)));
      else if (j && Array.isArray(j.codes)) ids = j.codes;
      else if (j && Array.isArray(j.items)) ids = j.items.map(x => x && (x.id || x.code));
    } catch (e) {
      ids = raw.split(/[\s,，、;；]+/).filter(Boolean);
    }
    const now = Date.now();
    ids.forEach((x, i) => {
      const key = String(x || "").trim();
      if (!key) return;
      const id = QMAP[key] ? key : (CODE2ID[key] || CODE2ID[key.padStart(3, "0")] || null);
      if (!id || !QMAP[id]) return;
      const k = FAV.findIndex(f => f.id === id);
      if (k >= 0) FAV.splice(k, 1);
      FAV.unshift({ id, t: now - i });
    });
    saveFav(); render();
  };
  r.readAsText(file, "utf-8");
}

function renderFav(main) {
  const ids = FAV.map(f => f.id).filter(id => QMAP[id]);
  const qs = ids.map(id => QMAP[id]);
  const c = countByType(qs);
  let html = `<div class="crumb">收藏</div>
    <h1 class="title">收藏题目</h1>
    <div class="subline">共 <b>${qs.length}</b> 题　选择 ${c.choice}　填空 ${c.fill}　解答 ${c.big}</div>
    <div class="bar">
      <div class="pbar" data-scope="main">
        <span class="pn">已选 <b data-pcount>0</b> 道</span>
        <button class="btn mini" data-pall>全选</button>
        <button class="btn mini" data-pmode="paper">打印习题册</button>
        <button class="btn mini" data-pmode="ans">打印答案册</button>
        <button class="btn mini" data-pmode="both">全部打印</button>
      </div>
      ${qs.length ? `<button class="btn" id="favClear">清空收藏</button>` : ""}
    </div>`;
  html += qs.length
    ? `<div class="qlist">${qs.map((q, i) => qcard(q, i + 1, { open: state.showAns })).join("")}</div>`
    : `<div class="emptynote">暂无收藏题目</div>`;
  main.innerHTML = html;
  bindMain();
  math(main);
  const fc = $("#favClear");
  if (fc) fc.addEventListener("click", () => {
    if (confirm("清空全部收藏？")) { FAV = []; saveFav(); render(); }
  });
}

function renderSearch(main) {
  const kw = state.search.trim();
  const hit = DB.questions.filter(q => fuzzyHit(q.stem, kw)).sort(cmpQT);
  main.innerHTML = `<div class="crumb">搜索题干</div><h1 class="title">「${esc(kw)}」</h1>
    <div class="subline">命中 <b>${hit.length}</b> 题</div>
    <div class="bar"><button class="btn" id="clearSearch">返回章节视图</button></div>
    ${hit.length ? `<div class="qlist">${hit.map((q, i) => qcard(q, i + 1, { open: state.showAns })).join("")}</div>`
      : `<div class="emptynote">没有匹配的题目</div>`}`;
  bindMain(); math(main);
  $("#clearSearch").addEventListener("click", () => {
    state.search = ""; const se = $("#search"); if (se) se.value = ""; render();
  });
}

function currentIds() {
  if (state.view === "fav") return FAV.map(f => f.id).filter(id => QMAP[id]);
  return qsOf(state.node).map(q => q.id);
}

function bindMain() {
  const main = $("#main");
  updatePicks();
  main.querySelectorAll("[data-fav]").forEach(b => b.addEventListener("click", () => toggleFav(b.dataset.fav)));
  main.querySelectorAll("[data-tf]").forEach(b => b.addEventListener("click", () => {
    state.typeFilter = b.dataset.tf;
    render();
  }));
  const sf = main.querySelector("[data-srcf]");
  if (sf) sf.addEventListener("change", () => { state.srcFilter = sf.value; render(); });
  main.querySelectorAll("[data-anstoggle]").forEach(b => b.addEventListener("click", () => {
    state.showAns = !state.showAns;
    render();
  }));
  main.querySelectorAll("[data-sim]").forEach(b => b.addEventListener("click", () => openSim(b.dataset.sim)));
  main.querySelectorAll("[data-goto]").forEach(b => b.addEventListener("click", () => gotoQ(b.dataset.goto)));
  main.querySelectorAll("[data-ansbtn]").forEach(b => b.addEventListener("click", () => {
    const card = b.closest(".qcard");
    const on = card.classList.toggle("open");
    b.classList.toggle("on", on);
    b.textContent = on ? "收起" : "答案";
    math(card.querySelector(".ansbox"));
  }));
  main.querySelectorAll("[data-node]").forEach(b => b.addEventListener("click", () => { location.hash = b.dataset.node; }));
  main.querySelectorAll("[data-kp]").forEach(b => b.addEventListener("click", () => { location.hash = b.dataset.kp; }));
  main.querySelectorAll("[data-kpexpand]").forEach(b => b.addEventListener("click", () => {
    const card = b.closest(".kpcard");
    card.classList.toggle("open");
    b.textContent = card.classList.contains("open") ? "收起精讲" : "展开精讲";
    math(card.querySelector(".kpbody"));
  }));
  main.querySelectorAll("[data-dl]").forEach(b => b.addEventListener("click", () => download(b.dataset.dl, currentIds())));
}

/* ---------- 相似题 ---------- */
function stemNorm(t) {
  return t.replace(/\\[a-zA-Z]+/g, " ").replace(/[{}$&_^\[\]()|\\]/g, " ").replace(/\s+/g, "");
}
function grams(t) {
  const m = {};
  for (let i = 0; i < t.length - 1; i++) {
    const g = t.slice(i, i + 2);
    m[g] = (m[g] || 0) + 1;
  }
  return m;
}
const SIG = {};
DB.questions.forEach(q => SIG[q.id] = grams(stemNorm(q.stem)));
function cosSim(a, b) {
  if (!a || !b) return 0;
  let num = 0, da = 0, db = 0;
  for (const k in a) { da += a[k] * a[k]; if (b[k]) num += a[k] * b[k]; }
  for (const k in b) db += b[k] * b[k];
  return da && db ? num / Math.sqrt(da * db) : 0;
}
function jac(a, b) {
  const A = new Set(a), B = new Set(b);
  let inter = 0;
  A.forEach(x => { if (B.has(x)) inter++; });
  const uni = new Set([...A, ...B]).size;
  return uni ? inter / uni : 0;
}
function simByMulti(qid, kps) {
  const q = QMAP[qid];
  if (!kps.length) return [];
  return DB.questions
    .filter(x => x.id !== qid && kps.every(k => (x.kps || []).includes(k)))
    .map(x => {
      const sc = 2.4 * jac(x.kps, q.kps) + 1.6 * cosSim(SIG[x.id], SIG[qid])
        + (x.type === q.type ? 0.3 : 0);
      return { x, sc };
    })
    .sort((a, b) => b.sc - a.sc)
    .map(o => o.x);
}

function openSim(qid, anchor) {
  const q = QMAP[qid];
  const valid = [q.primary, ...q.cross, ...q.methods].filter((v, i, a) => a.indexOf(v) === i);
  const init = (anchor || "").split(",").map(s => s.trim()).filter(k => valid.includes(k));
  state.pick.clear();
  state.simOf = qid;
  state.simSel = new Set(init.length ? init : [q.primary]);
  $("#drawer").classList.add("open");
  $("#mask").classList.add("on");
  renderSim();
}

function renderSim() {
  const qid = state.simOf;
  const q = QMAP[qid];
  if (!q) return;
  const sel = [...state.simSel];
  const sims = simByMulti(qid, sel);
  state.simIds = sims.map(x => x.id);

  const nameOf = k => (KPMAP[k] || {}).name || "";
  const kpAnchors = [q.primary, ...q.cross].filter((v, i, a) => a.indexOf(v) === i);
  const mAnchors = q.methods.filter(k => !kpAnchors.includes(k));
  const chip = (k, cls) => `<button class="segbtn ${cls} ${state.simSel.has(k) ? "on" : ""}"
      data-anchor="${k}" title="${esc(nameOf(k))}">${cls === "m" ? "法 " : ""}${k} ${esc(nameOf(k))}</button>`;
  const segHTML = kpAnchors.map(k => chip(k, "")).join("") + mAnchors.map(k => chip(k, "m")).join("");

  $("#dTitle").textContent = "相似题";
  $("#dSub").textContent = `原题：${TYPE_NAME[q.type]}（${q.src}）　·　已选 ${sel.length} 个标签　·　共 ${sims.length} 道`;

  const first = sel[0];
  const head = `<div class="simhead">
      <div class="txt"><b>已选标签：</b>${sel.length ? sel.map(k => "§" + k + " " + esc(nameOf(k))).join(" ＋ ") : "（未选）"}</div>
      <div class="seg">${segHTML}</div>
    </div>`;

  const origCard = `<div class="simorig"><div class="simlab">原题（可勾选一起打印）</div>${qcard(q, 0, { open: true, noSim: true })}</div>`;

  const pbar = `<div class="pbar" data-scope="sim">
        <span class="pn">已选 <b data-pcount>0</b> 道</span>
        <button class="btn mini" data-pall>全选</button>
        <button class="btn mini" data-pmode="paper">打印习题册</button>
        <button class="btn mini" data-pmode="ans">打印答案册</button>
        <button class="btn mini" data-pmode="both">全部打印</button>
      </div>`;

  const body = pbar + origCard + head + (sims.length
    ? `<div class="simlist">${sims.map((x, i) => qcard(x, i + 1, { solKp: null, open: state.showAns, noSim: true })).join("")}</div>`
    : `<div class="emptynote">${sel.length ? "没有同时含有这些标签的其它真题。" : "请选择至少一个标签。"}</div>`);

  $("#dBody").innerHTML = body;
  updatePicks();
  math($("#dBody"));

  $("#dBody").querySelectorAll("[data-anchor]").forEach(b =>
    b.addEventListener("click", () => {
      const k = b.dataset.anchor;
      if (state.simSel.has(k)) state.simSel.delete(k); else state.simSel.add(k);
      renderSim();
    }));
  $("#dBody").querySelectorAll("[data-sim]").forEach(b =>
    b.addEventListener("click", () => openSim(b.dataset.sim)));
  $("#dBody").querySelectorAll("[data-goto]").forEach(b =>
    b.addEventListener("click", () => { closeDrawer(); gotoQ(b.dataset.goto); }));
  $("#dBody").querySelectorAll("[data-ansbtn]").forEach(b => b.addEventListener("click", () => {
    const card = b.closest(".qcard");
    const on = card.classList.toggle("open");
    b.classList.toggle("on", on);
    b.textContent = on ? "收起" : "答案";
    math(card.querySelector(".ansbox"));
  }));
  $("#dBody").querySelectorAll("[data-kp]").forEach(b => b.addEventListener("click", () => {
    closeDrawer(); location.hash = b.dataset.kp;
  }));
  $("#dBody").querySelectorAll("[data-dl2]").forEach(b => b.addEventListener("click",
    () => download(b.dataset.dl2, state.simIds, `${first ? "§" + first + " " + ((KPMAP[first] || {}).name || "") : "原题"} 相似题`)));

}

function closeDrawer() {
  $("#drawer").classList.remove("open");
  $("#mask").classList.remove("on");
  state.simOf = null;
  state.simIds = [];
}

/* ---------- 下载 ---------- */
/* 本地服务（server.py，127.0.0.1:8760）可直接生成 PDF；
   纯静态托管（如 GitHub Pages）没有后端，退回浏览器打印另存为 PDF。 */
const LOCAL_SERVER = location.hostname === "127.0.0.1" || location.hostname === "localhost";
function download(mode, ids, tag = "") {
  ids = ids.map(i => QMAP[i]).filter(Boolean).sort(cmpQT).map(q => q.id);
  if (!ids.length) { alert("当前没有题目可导出"); return; }
  if (LOCAL_SERVER) {
    const u = `/api/pdf?mode=${mode}&ids=${ids.join(",")}&tag=${encodeURIComponent(tag || titleOf())}`;
    window.location.href = u;
    return;
  }
  printFallback(mode, ids, tag || titleOf());
}
function titleOf() {
  const n = state.node;
  if (n.startsWith("ch")) return CHMAP[n].no + CHMAP[n].name;
  if (n.split(".").length === 2) return SECMAP[n].no + " " + SECMAP[n].name;
  return KPMAP[n].id + " " + KPMAP[n].name;
}
function updatePicks() {
  document.querySelectorAll("[data-pick]").forEach(x => { x.checked = state.pick.has(x.dataset.pick); });
  document.querySelectorAll("[data-pcount]").forEach(x => { x.textContent = String(state.pick.size); });
  document.querySelectorAll(".pbar").forEach(bar => {
    const scope = bar.dataset.scope === "sim" ? $("#dBody") : $("#main");
    if (!scope) return;
    const boxes = [...scope.querySelectorAll("[data-pick]")];
    const all = boxes.length && boxes.every(x => x.checked);
    const btn = bar.querySelector("[data-pall]");
    if (btn) btn.textContent = all ? "取消全选" : "全选";
  });
}

function printFallback(mode, ids, tag) {
  const w = window.open("", "_blank");
  const qs = ids.map(i => QMAP[i]).filter(Boolean);
  const opt = q => (q.opts || []).length ? `<div class="o">${q.opts.map((x, j) => `${"ABCD"[j]}．${esc(x)}`).join("　　")}</div>` : "";
  const meta = q => `<div class="m">〔${esc(q.src)}〕　编号 ${QCODE[q.id] || ""}</div>`;
  const paperHTML = qs.map((q, i) => `<div class="q">${meta(q)}<div class="s"><b>${i + 1}.</b> ${esc(q.stem)}</div>${opt(q)}<div class="sp"></div></div>`).join("");
  const ansHTML = qs.map((q, i) => {
    const alts = Object.entries(q.alts || {}).filter(([, v]) => v && v !== q.sol)
      .map(([k, v]) => `<div class="a">另解·${esc((KPMAP[k] || {}).name || k)}　${esc(v)}</div>`).join("");
    const ansBlock = `<div class="a">答案　<b>${esc(q.ans)}</b></div><div class="a">解析　${esc(q.sol)}</div>${alts}`;
    return `<div class="q">${meta(q)}<div class="s"><b>${i + 1}.</b> ${esc(q.stem)}</div>${ansBlock}</div>`;
  }).join("");
  const headOf = name => `<h1>${tag}　${name}</h1><div class="meta">工科数学分析（上）· 期中范围 · 共 ${qs.length} 题 · 来自《大邮数学集》</div>`;
  let body;
  if (mode === "paper") body = headOf("习题册") + paperHTML;
  else if (mode === "ans" || mode === "inline") body = headOf("答案册") + ansHTML;
  else body = headOf("习题册") + paperHTML + `<div class="anssec">${headOf("答案册")}${ansHTML}</div>`;
  w.document.write(`<!DOCTYPE html><html lang="zh-CN"><head><meta charset="utf-8"><title>${tag}</title>
  <link rel="stylesheet" href="${location.href.replace(/[^/]*$/, "")}assets/katex/katex.min.css">
  <script src="${location.href.replace(/[^/]*$/, "")}assets/katex/katex.min.js"><\/script>
  <script src="${location.href.replace(/[^/]*$/, "")}assets/katex/contrib/auto-render.min.js"><\/script>
  <style>
  @page{size:A4;margin:18mm 16mm}
  body{font-family:"Times New Roman","SimSun",serif;font-size:11pt;line-height:1.75;color:#111}
  h1{font-size:16pt;text-align:center;margin:0 0 4mm}
  .meta{text-align:center;font-size:9pt;color:#666;margin-bottom:6mm}
  .q{margin:0 0 5mm;break-inside:avoid}
  .a{font-size:10.5pt;margin-left:5mm;color:#222}
  .m{font-size:9pt;color:#6e6047;margin-bottom:1mm;font-family:"Microsoft YaHei",sans-serif}
  .o{margin:1mm 0 0 5mm;font-size:10.5pt}
  .sp{height:14mm;border-bottom:.5pt dotted #bbb}
  .anssec{break-before:page}
  </style></head><body>
  ${body}
  <script>renderMathInElement(document.body,{delimiters:[{left:'$$',right:'$$',display:true},{left:'$',right:'$',display:false}],throwOnError:false});
  setTimeout(()=>window.print(),400);<\/script></body></html>`);
  w.document.close();
}

/* ---------- 初始化 ---------- */
function boot() {
  const total = DB.questions.length;
  buildTree();
  const h = decodeURIComponent(location.hash.slice(1));
  if (h === "fav") state.view = "fav";
  else if (h && (KPMAP[h] || SECMAP[h] || CHMAP[h])) state.node = h;
  saveFav();
  const qp = new URLSearchParams(location.search);
  if (qp.get("ans") === "1") state.showAns = true;
  render();
  if (qp.get("sim") && QMAP[qp.get("sim")])
    setTimeout(() => openSim(qp.get("sim"), qp.get("anchor") || null), 120);

  const fe = $("#favEntry");
  if (fe) fe.addEventListener("click", () => {
    state.search = ""; const si = $("#search"); if (si) si.value = "";
    if (state.view === "fav") { render(); return; }
    if (location.hash.slice(1) !== "fav") location.hash = "fav";
    else { state.view = "fav"; render(); }
    window.scrollTo({ top: 0 });
  });

  // 窄屏目录折叠
  const st = $("#sideToggle"), side = document.querySelector(".side");
  if (st && side) {
    if (window.innerWidth <= 1080) { side.classList.add("closed"); st.textContent = "展开"; }
    st.addEventListener("click", () => {
      const closed = side.classList.toggle("closed");
      st.textContent = closed ? "展开" : "收起";
      st.blur();
    });
  }

  document.addEventListener("change", e => {
    const el = e.target;
    if (el && el.matches && el.matches("[data-pick]")) {
      if (el.checked) state.pick.add(el.dataset.pick); else state.pick.delete(el.dataset.pick);
      updatePicks();
    }
  });
  document.addEventListener("click", e => {
    const bar = e.target.closest ? e.target.closest(".pbar") : null;
    if (!bar) return;
    const scope = bar.dataset.scope === "sim" ? $("#dBody") : $("#main");
    if (e.target.closest("[data-pall]")) {
      const boxes = [...scope.querySelectorAll("[data-pick]")];
      const all = boxes.length && boxes.every(x => x.checked);
      boxes.forEach(x => { if (all) state.pick.delete(x.dataset.pick); else state.pick.add(x.dataset.pick); });
      updatePicks(); return;
    }
    const pb = e.target.closest("[data-pmode]");
    if (pb) {
      const ids = [...state.pick];
      if (!ids.length) { alert("请先在题目左上角勾选要打印的题"); return; }
      const tag = bar.dataset.scope === "sim" ? "相似题" : (state.view === "fav" ? "收藏题目" : titleOf());
      printFallback(pb.dataset.pmode, ids, tag);
    }
  });

  $("#dClose").addEventListener("click", closeDrawer);
  $("#mask").addEventListener("click", closeDrawer);

  document.addEventListener("keydown", e => {
    const el = e.target, tag = (el && el.tagName || "").toLowerCase();
    const typing = tag === "input" || tag === "textarea" || tag === "select" || (el && el.isContentEditable);
    if (e.key === "Escape") {
      closeDrawer();
      if (typing && el.blur) el.blur();
      return;
    }
    if (typing || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === "/") { const si = $("#search"); if (si) { e.preventDefault(); si.focus(); } return; }
    if (e.key === "a" || e.key === "A") { state.showAns = !state.showAns; render(); return; }
    if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
      const i = DB.kps.findIndex(k => k.id === state.node);
      if (i < 0) return;
      const t = DB.kps[i + (e.key === "ArrowRight" ? 1 : -1)];
      if (t) { e.preventDefault(); location.hash = t.id; }
    }
  });

  const se = $("#search");
  if (se) {
    let t;
    se.addEventListener("input", e => {
      clearTimeout(t);
      const v = e.target.value.trim();
      t = setTimeout(() => {
        state.search = v;
        if (v) state.view = "tree";
        render();
      }, 200);
    });
  }
  window.addEventListener("hashchange", () => {
    const id = decodeURIComponent(location.hash.slice(1));
    if (id === "fav") { state.view = "fav"; render(); window.scrollTo({ top: 0 }); return; }
    if (KPMAP[id] || SECMAP[id] || CHMAP[id]) {
      state.view = "tree";
      state.node = id; state.search = "";
      const si = $("#search"); if (si) si.value = "";
      render(); window.scrollTo({ top: 0 });
    }
  });
}
document.addEventListener("DOMContentLoaded", boot);
