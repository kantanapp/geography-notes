// Geography Notes 穴埋めアプリ
// データは data/units.js（window.GEO_DATA）から読み込む。
// 入力内容と「答え合わせ」の記録はブラウザ（localStorage）に保存される。
(function () {
  "use strict";

  const DATA = window.GEO_DATA;
  const STORE_KEY = "geo-notes-v1";
  const HISTORY_MAX = 50;
  const $ = (id) => document.getElementById(id);

  // ---------- 保存 ----------
  function load() {
    try { return JSON.parse(localStorage.getItem(STORE_KEY)) || {}; }
    catch (e) { return {}; }
  }
  function save() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch (e) { /* 保存できなくても動かす */ }
  }
  const state = Object.assign({ unit: DATA.units[0].id, answers: {}, history: [] }, load());

  // ---------- 問題の分解（描画せずに採点するため） ----------
  // unit.id -> [{ key, no, accepted:[...] }]
  const BLANKS = {};
  DATA.units.forEach((u) => {
    let n = 0;
    BLANKS[u.id] = [];
    u.blocks.forEach((b) => {
      b.text.replace(/\{([^}]+)\}/g, (_, raw) => {
        n += 1;
        BLANKS[u.id].push({ key: `${u.id}#${n}`, no: n, accepted: raw.split("|").map((s) => s.trim()) });
      });
    });
  });

  // ---------- 判定 ----------
  // 大文字小文字・前後の空白・ハイフン/スペースの違い・末尾の記号は無視する
  function normalize(s) {
    return String(s).toLowerCase().trim()
      .replace(/[\u2010-\u2015-]/g, " ")
      .replace(/[.,!?;:'"]+$/g, "")
      .replace(/\s+/g, " ");
  }
  function isCorrect(value, accepted) {
    const v = normalize(value || "");
    return v !== "" && accepted.some((a) => normalize(a) === v);
  }

  function unitStats(unitId) {
    const list = BLANKS[unitId];
    let correct = 0, wrong = 0, empty = 0;
    const misses = [];
    list.forEach((b) => {
      const v = state.answers[b.key] || "";
      if (!v.trim()) { empty++; misses.push({ ...b, value: "" }); }
      else if (isCorrect(v, b.accepted)) correct++;
      else { wrong++; misses.push({ ...b, value: v }); }
    });
    return { total: list.length, correct, wrong, empty, misses };
  }

  // ---------- 描画 ----------
  function escapeHtml(s) {
    return String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  }
  const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);

  function renderTabs() {
    $("tabs").innerHTML = DATA.units.map((u) => {
      const s = unitStats(u.id);
      const done = s.correct === s.total ? " done" : "";
      return `<button type="button" class="tab${done}" role="tab" data-unit="${u.id}" aria-selected="${u.id === state.unit}">` +
        `${u.id}<small>${s.correct}/${s.total}</small></button>`;
    }).join("");
  }

  function renderUnit() {
    const unit = DATA.units.find((u) => u.id === state.unit) || DATA.units[0];
    const list = BLANKS[unit.id];
    let i = 0;
    const html = unit.blocks.map((b) => {
      const body = escapeHtml(b.text).replace(/\{([^}]+)\}/g, () => {
        const blank = list[i++];
        const val = state.answers[blank.key] || "";
        // 幅は答えの長さに合わせない（ヒントにならないよう入力に合わせて伸びる）
        const width = fitWidth(val);
        return `<span class="blank" id="b-${blank.no}" data-key="${blank.key}" data-accept="${escapeHtml(JSON.stringify(blank.accepted))}">` +
          `<input type="text" value="${escapeHtml(val)}" style="width:${width}ch" ` +
          `aria-label="空欄 ${blank.no}" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" enterkeyhint="next">` +
          `<span class="answer">${escapeHtml(blank.accepted[0])}</span></span>`;
      });
      if (b.type === "heading") return `<h3 class="sec">${body}</h3>`;
      if (b.type === "bullet") return `<p class="bullet">${body}</p>`;
      return `<p class="p">${body}</p>`;
    }).join("");

    $("sheet").classList.remove("reveal");
    $("btn-reveal").textContent = "答えを見る";
    $("sheet").innerHTML =
      `<h2 class="unit-title">Unit ${unit.id} - ${escapeHtml(unit.title)}</h2>` +
      `<p class="unit-sub">空欄をタップして英語で入力。Enter で次の空欄へ進みます。</p>` + html;

    blanks().forEach((el) => { if (input(el).value) judge(el); });
    updateScore();
  }

  function fitWidth(v) { return Math.min(28, Math.max(8, String(v).length + 2)); }

  const blanks = () => Array.from(document.querySelectorAll(".blank"));
  const input = (el) => el.querySelector("input");

  function judge(el) {
    const val = input(el).value;
    el.classList.remove("correct", "wrong");
    if (!val.trim()) return;
    el.classList.add(isCorrect(val, JSON.parse(el.dataset.accept)) ? "correct" : "wrong");
  }

  function updateScore() {
    const s = unitStats(state.unit);
    $("score").innerHTML = `<strong>${s.correct}</strong> / ${s.total}`;
    $("progress-bar").style.width = `${pct(s.correct, s.total)}%`;
    renderTabs();
  }

  // ---------- 結果パネル ----------
  function formatDate(ts) {
    const d = new Date(ts);
    const p = (n) => String(n).padStart(2, "0");
    return `${d.getMonth() + 1}/${d.getDate()} ${p(d.getHours())}:${p(d.getMinutes())}`;
  }

  function openResult() {
    const unit = DATA.units.find((u) => u.id === state.unit);
    const s = unitStats(unit.id);

    const missList = s.misses.length
      ? `<ul class="misses">${s.misses.map((m) =>
          `<li><button type="button" data-jump="${m.no}"><span class="no">(${m.no})</span>` +
          `<span class="yours${m.value ? "" : " empty"}">${m.value ? escapeHtml(m.value) : "未回答"}</span>` +
          `<span class="right">${escapeHtml(m.accepted[0])}</span></button></li>`).join("")}</ul>`
      : `<p class="muted">全問正解です。</p>`;

    let allCorrect = 0, allTotal = 0;
    const unitRows = DATA.units.map((u) => {
      const us = unitStats(u.id);
      allCorrect += us.correct; allTotal += us.total;
      return `<tr><td>Unit ${u.id}</td><td><span class="bar"><i style="width:${pct(us.correct, us.total)}%"></i></span>${us.correct}/${us.total}</td>` +
        `<td>${pct(us.correct, us.total)}%</td></tr>`;
    }).join("");

    const hist = state.history.slice().reverse().slice(0, 10);
    const histHtml = hist.length
      ? `<div class="table-wrap"><table class="history"><tr><th>日時</th><th>Unit</th><th>正解</th><th>正答率</th></tr>` +
        hist.map((h) => `<tr><td>${formatDate(h.at)}</td><td>${h.unit}</td><td>${h.correct}/${h.total}</td><td>${pct(h.correct, h.total)}%</td></tr>`).join("") +
        `</table></div>`
      : `<p class="muted">まだ記録がありません。「答え合わせ」を押すと記録されます。</p>`;

    $("result-title").textContent = `Unit ${unit.id} の結果`;
    $("result-body").innerHTML =
      `<p class="big">${s.correct}<span> / ${s.total}（${pct(s.correct, s.total)}%）</span></p>` +
      `<p class="counts"><span>正解 <b class="ok">${s.correct}</b></span><span>まちがい <b class="ng">${s.wrong}</b></span><span>未回答 <b>${s.empty}</b></span></p>` +
      `<h3>まちがい・未回答（タップでその空欄へ）</h3>${missList}` +
      `<h3>全体の進み具合　${allCorrect}/${allTotal}（${pct(allCorrect, allTotal)}%）</h3>` +
      `<div class="table-wrap"><table class="units">${unitRows}</table></div>` +
      `<h3>答え合わせの記録（新しい順・最大10件）</h3>${histHtml}`;
    $("result").showModal();
  }

  function recordAttempt() {
    const s = unitStats(state.unit);
    state.history.push({ at: Date.now(), unit: state.unit, correct: s.correct, wrong: s.wrong, empty: s.empty, total: s.total });
    if (state.history.length > HISTORY_MAX) state.history = state.history.slice(-HISTORY_MAX);
    save();
  }

  // ---------- 操作 ----------
  $("tabs").addEventListener("click", (e) => {
    const t = e.target.closest(".tab");
    if (!t) return;
    state.unit = t.dataset.unit;
    save(); renderUnit();
    window.scrollTo(0, 0);
  });

  $("sheet").addEventListener("input", (e) => {
    const el = e.target.closest(".blank");
    if (!el) return;
    state.answers[el.dataset.key] = e.target.value;
    e.target.style.width = fitWidth(e.target.value) + "ch";
    el.classList.remove("correct", "wrong");
    save();
  });

  $("sheet").addEventListener("focusout", (e) => {
    const el = e.target.closest(".blank");
    if (el) { judge(el); updateScore(); }
  });

  $("sheet").addEventListener("keydown", (e) => {
    if (e.key !== "Enter" || e.isComposing) return;
    const el = e.target.closest(".blank");
    if (!el) return;
    e.preventDefault();
    const all = blanks();
    const next = all[all.indexOf(el) + 1];
    if (next) input(next).focus(); else input(el).blur();
  });

  $("btn-check").addEventListener("click", () => {
    blanks().forEach(judge);
    updateScore();
    recordAttempt();
    openResult();
  });

  $("score").addEventListener("click", openResult);
  $("btn-close").addEventListener("click", () => $("result").close());
  $("result").addEventListener("click", (e) => {
    if (e.target === $("result")) { $("result").close(); return; }
    const j = e.target.closest("[data-jump]");
    if (!j) return;
    $("result").close();
    const el = $("b-" + j.dataset.jump);
    el.scrollIntoView({ block: "center" });
    input(el).focus();
  });

  $("btn-reveal").addEventListener("click", () => {
    blanks().forEach(judge);
    updateScore();
    const on = $("sheet").classList.toggle("reveal");
    $("btn-reveal").textContent = on ? "答えを隠す" : "答えを見る";
  });

  $("btn-reset").addEventListener("click", () => {
    if (!confirm(`Unit ${state.unit} の入力をすべて消しますか？（答え合わせの記録は残ります）`)) return;
    Object.keys(state.answers).forEach((k) => { if (k.startsWith(state.unit + "#")) delete state.answers[k]; });
    save(); renderUnit();
  });

  renderUnit();
})();
