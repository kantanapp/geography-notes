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
          `aria-label="Blank ${blank.no}" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" enterkeyhint="next">` +
          `<span class="answer">${escapeHtml(blank.accepted[0])}</span></span>`;
      });
      if (b.type === "heading") return `<h3 class="sec">${body}</h3>`;
      if (b.type === "bullet") return `<p class="bullet">${body}</p>`;
      return `<p class="p">${body}</p>`;
    }).join("");

    $("sheet").classList.remove("reveal");
    $("btn-reveal").textContent = "Show answers";
    $("sheet").innerHTML =
      `<h2 class="unit-title">Unit ${unit.id} - ${escapeHtml(unit.title)}</h2>` +
      `<p class="unit-sub">Tap a blank and type your answer. Press Enter to jump to the next one.</p>` + html;

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
    $("score").innerHTML = `<span class="score-num"><strong>${s.correct}</strong> / ${s.total}</span><span class="score-go">★ Progress</span>`;
    $("progress-bar").style.width = `${pct(s.correct, s.total)}%`;
    renderTabs();
    renderKiroku();
  }

  // ---------- 全体の集計（きろくページ用） ----------
  function overall() {
    const byUnit = {};
    let correct = 0, total = 0;
    DATA.units.forEach((u) => {
      const s = unitStats(u.id);
      byUnit[u.id] = s; correct += s.correct; total += s.total;
    });
    return { byUnit, correct, total, attempts: state.history.length, streak: streak(), days: dayList().length };
  }

  // 答え合わせをした日（重複なし・古い順）
  function dayList() {
    const set = new Set(state.history.map((h) => {
      const d = new Date(h.at);
      return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
    }));
    return Array.from(set).sort((a, b) => new Date(a) - new Date(b));
  }
  // いちばん長く続いた日数
  function streak() {
    const days = dayList().map((d) => new Date(d).getTime());
    let best = 0, run = 0;
    days.forEach((t, i) => {
      run = (i > 0 && Math.round((t - days[i - 1]) / 86400000) === 1) ? run + 1 : 1;
      if (run > best) best = run;
    });
    return best;
  }

  // ---------- ごほうびバッジ ----------
  // got: もらえたか / now・goal: あと少しを見せるための数（いらないバッジは省略）
  const BADGES = [
    { icon: "🌱", name: "First step", need: "Check your answers once",
      got: (o) => o.attempts >= 1, now: (o) => o.attempts, goal: 1 },
    { icon: "🔥", name: "10 checks", need: "Check your answers 10 times",
      got: (o) => o.attempts >= 10, now: (o) => o.attempts, goal: 10 },
    { icon: "📅", name: "3 day streak", need: "Check answers 3 days in a row",
      got: (o) => o.streak >= 3, now: (o) => o.streak, goal: 3 },
    { icon: "⛰️", name: "Halfway", need: "Get half of all the blanks right",
      got: (o) => o.correct * 2 >= o.total, now: (o) => o.correct, goal: (o) => Math.ceil(o.total / 2) }
  ].concat(DATA.units.map((u) => ({
    icon: "🗺️", name: `Unit ${u.id} perfect`, need: `Get every blank in Unit ${u.id} right`,
    got: (o) => o.byUnit[u.id].correct === o.byUnit[u.id].total,
    now: (o) => o.byUnit[u.id].correct, goal: (o) => o.byUnit[u.id].total
  }))).concat([
    { icon: "🏆", name: "All clear", need: "Get every blank in the whole book right",
      got: (o) => o.total > 0 && o.correct === o.total, now: (o) => o.correct, goal: (o) => o.total }
  ]);

  // ---------- 結果パネル ----------
  function formatDate(ts) {
    const d = new Date(ts);
    const p = (n) => String(n).padStart(2, "0");
    return `${d.getMonth() + 1}/${d.getDate()} ${p(d.getHours())}:${p(d.getMinutes())}`;
  }

  // 点数に合わせたほめ言葉と星（子どもが次もやりたくなるように）
  function praise(p) {
    if (p >= 100) return { face: "🏆", word: "Perfect!", sub: "Every blank correct" };
    if (p >= 80) return { face: "🎉", word: "Great job!", sub: "Almost a complete unit" };
    if (p >= 50) return { face: "👍", word: "Nice work!", sub: "You are past halfway" };
    if (p >= 20) return { face: "💪", word: "Keep going!", sub: "Every blank you fill is progress" };
    if (p > 0) return { face: "🌱", word: "You have started!", sub: "Build it up from here" };
    return { face: "✏️", word: "Let's begin", sub: "One blank is one step" };
  }
  function stars(p) {
    const n = p >= 100 ? 3 : p >= 80 ? 2 : p >= 50 ? 1 : 0;
    return `<span class="stars" aria-label="${n} out of 3 stars">${"★".repeat(n)}${"☆".repeat(3 - n)}</span>`;
  }

  function openResult() {
    const unit = DATA.units.find((u) => u.id === state.unit);
    const s = unitStats(unit.id);
    const p = pct(s.correct, s.total);
    const pr = praise(p);

    const missList = s.misses.length
      ? `<ul class="misses">${s.misses.map((m) =>
          `<li><button type="button" data-jump="${m.no}"><span class="no">(${m.no})</span>` +
          `<span class="yours${m.value ? "" : " empty"}">${m.value ? escapeHtml(m.value) : "left blank"}</span>` +
          `<span class="right">${escapeHtml(m.accepted[0])}</span></button></li>`).join("")}</ul>`
      : `<p class="allclear">🏆 Everything correct!</p>`;

    $("result-title").textContent = `Unit ${unit.id} results`;
    $("result-body").innerHTML =
      `<div class="cheer"><div class="cheer-face">${pr.face}</div>` +
      `<div><p class="cheer-word">${pr.word}</p><p class="cheer-sub">${pr.sub}</p></div></div>` +
      `<p class="big">${s.correct}<span> / ${s.total}（${p}%）</span> ${stars(p)}</p>` +
      `<p class="counts"><span>Correct <b class="ok">${s.correct}</b></span>` +
      `<span>Wrong <b class="ng">${s.wrong}</b></span><span>Blank <b>${s.empty}</b></span></p>` +
      (s.misses.length ? `<h3>Fix these (tap one to jump to that blank)</h3>` : "") + missList +
      `<p class="result-foot">Your full record is further down the page, under <b>★ Progress</b></p>`;
    $("result").showModal();
  }

  function recordAttempt() {
    const s = unitStats(state.unit);
    state.history.push({ at: Date.now(), unit: state.unit, correct: s.correct, wrong: s.wrong, empty: s.empty, total: s.total });
    if (state.history.length > HISTORY_MAX) state.history = state.history.slice(-HISTORY_MAX);
    save();
  }

  // ---------- きろくページ ----------
  // ドーナツ型の進みぐあい（中に % を出す）
  function ring(percent, size, thick) {
    const r = (size - thick) / 2, c = 2 * Math.PI * r;
    return `<svg class="ring" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" role="img" aria-label="${percent}%">` +
      `<circle class="ring-track" cx="${size / 2}" cy="${size / 2}" r="${r}" stroke-width="${thick}" fill="none"></circle>` +
      `<circle class="ring-fill" cx="${size / 2}" cy="${size / 2}" r="${r}" stroke-width="${thick}" fill="none"` +
      ` stroke-dasharray="${c}" stroke-dashoffset="${c * (1 - percent / 100)}"` +
      ` transform="rotate(-90 ${size / 2} ${size / 2})"></circle>` +
      `<text class="ring-text" x="50%" y="50%" text-anchor="middle" dominant-baseline="central">${percent}%</text></svg>`;
  }

  function heroMsg(o) {
    const p = pct(o.correct, o.total);
    if (o.total === 0) return "Let's get started!";
    if (p >= 100) return "All clear! That is really something.";
    if (p >= 80) return `Only ${o.total - o.correct} blanks left to finish everything!`;
    if (p >= 50) return "Past halfway. Keep it up!";
    if (p >= 20) return "Good pace. It gets easier the more you do.";
    if (p > 0) return "You have started! Build it up from here.";
    return "Let's get started! One blank is one step.";
  }

  // がんばりグラフ（直近の答え合わせの せいかい率）
  // 1本だけの系列なので色は1色。数字は「さいしん」と「さいこう」だけに付け、
  // 残りはタップ/ホバーの吹き出しと、下の「きろく」の表で読めるようにする。
  const CHART_MAX = 12;
  function chart() {
    const rows = state.history.slice(-CHART_MAX).map((h) => ({ ...h, p: pct(h.correct, h.total) }));
    if (!rows.length) {
      return `<p class="k-empty">No chart yet.<br>Press <b>Check answers</b> and it will start filling up here.</p>`;
    }
    const W = 320, H = 150, L = 30, R = 8, T = 20, B = 24;
    const pw = W - L - R, ph = H - T - B;
    const band = pw / rows.length;
    const bw = Math.min(16, band - 6); // 実寸で 24px を超えないように（SVG は拡大されるため小さめに取る）
    const y = (v) => T + ph * (1 - v / 100);
    const best = Math.max(...rows.map((r) => r.p));
    const bestIdx = rows.findIndex((r) => r.p === best);

    const grid = [0, 50, 100].map((v) =>
      `<line class="c-grid" x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}"></line>` +
      `<text class="c-axis" x="${L - 6}" y="${y(v)}" text-anchor="end" dominant-baseline="central">${v}</text>`).join("");

    const bars = rows.map((r, i) => {
      const cx = L + band * i + band / 2;
      const x = cx - bw / 2;
      const top = y(r.p), h = Math.max(r.p === 0 ? 0 : 2, y(0) - top);
      const rad = Math.min(4, h, bw / 2);
      // 上だけ角を丸め、下（0のライン）は四角のまま
      const d = h === 0 ? "" :
        `M${x} ${y(0)} L${x} ${top + rad} Q${x} ${top} ${x + rad} ${top} L${x + bw - rad} ${top} Q${x + bw} ${top} ${x + bw} ${top + rad} L${x + bw} ${y(0)} Z`;
      const label = (i === rows.length - 1 || i === bestIdx)
        ? `<text class="c-val" x="${cx}" y="${top - 6}" text-anchor="middle">${r.p}%</text>` : "";
      return (d ? `<path class="c-bar" d="${d}"></path>` : "") + label +
        `<rect class="c-hit" x="${L + band * i}" y="${T}" width="${band}" height="${ph}" tabindex="0" role="button"` +
        ` data-tip="${escapeHtml(`${formatDate(r.at)} · Unit ${r.unit} · ${r.correct}/${r.total} (${r.p}%)`)}"></rect>`;
    }).join("");

    const ends = `<text class="c-axis" x="${L}" y="${H - 6}">${formatDate(rows[0].at).split(" ")[0]}</text>` +
      (rows.length > 1 ? `<text class="c-axis" x="${W - R}" y="${H - 6}" text-anchor="end">latest</text>` : "");

    return `<div class="chart-wrap"><svg class="chart" viewBox="0 0 ${W} ${H}" role="img"` +
      ` aria-label="Your score each time you checked answers. The same numbers are in the table below.">` +
      grid + bars + ends + `</svg><div class="chart-tip" id="chart-tip" hidden></div></div>`;
  }

  function renderKiroku() {
    const o = overall();
    const p = pct(o.correct, o.total);

    const unitCards = DATA.units.map((u) => {
      const s = o.byUnit[u.id];
      const up = pct(s.correct, s.total);
      const left = s.total - s.correct;
      return `<div class="k-unit${up === 100 ? " done" : ""}">${ring(up, 64, 8)}` +
        `<div class="k-unit-body"><p class="k-unit-name">Unit ${u.id}${up === 100 ? " 🏆" : ""}</p>` +
        `<p class="k-unit-num">${s.correct} / ${s.total} blanks</p>` +
        `<p class="k-unit-left">${left ? `${left} to go` : "Complete!"}</p></div>` +
        `<button type="button" class="btn small" data-go="${u.id}">Go</button></div>`;
    }).join("");

    const gotCount = BADGES.filter((b) => b.got(o)).length;
    const badges = BADGES.map((b) => {
      const got = b.got(o);
      const goal = typeof b.goal === "function" ? b.goal(o) : b.goal;
      const now = Math.min(b.now(o), goal);
      return `<div class="k-badge${got ? " got" : ""}"><span class="k-badge-icon">${b.icon}</span>` +
        `<span class="k-badge-name">${escapeHtml(b.name)}</span>` +
        (got ? `<span class="k-badge-got">Earned!</span>`
             : `<span class="k-badge-need">${escapeHtml(b.need)}</span>` +
               `<span class="k-badge-bar"><i style="width:${pct(now, goal)}%"></i></span>` +
               `<span class="k-badge-now">${now} / ${goal}</span>`) + `</div>`;
    }).join("");

    const hist = state.history.slice().reverse().slice(0, 20);
    const histHtml = hist.length
      ? `<div class="table-wrap"><table class="history"><caption class="sr-only">Every time you checked your answers</caption>` +
        `<tr><th>When</th><th>Unit</th><th>Correct</th><th>Score</th></tr>` +
        hist.map((h) => `<tr><td>${formatDate(h.at)}</td><td>${h.unit}</td><td>${h.correct}/${h.total}</td>` +
          `<td><span class="bar"><i style="width:${pct(h.correct, h.total)}%"></i></span>${pct(h.correct, h.total)}%</td></tr>`).join("") +
        `</table></div>`
      : `<p class="k-empty">No records yet. Press <b>Check answers</b> and each try is saved here.</p>`;

    $("kiroku").innerHTML =
      `<h2 class="k-title" id="k-title">★ Progress</h2>` +
      `<section class="k-hero">${ring(p, 104, 12)}` +
      `<div><p class="k-hero-num">${o.correct}<span> / ${o.total} blanks correct</span></p>` +
      `<p class="k-hero-msg">${escapeHtml(heroMsg(o))}</p>` +
      `<p class="k-hero-sub">Checked ${o.attempts} ${o.attempts === 1 ? "time" : "times"} · ` +
      `${o.days} ${o.days === 1 ? "day" : "days"} of practice` +
      `${o.streak >= 2 ? ` · best streak ${o.streak} days` : ""}</p></div></section>` +
      `<h3 class="k-h">Each unit</h3><div class="k-units">${unitCards}</div>` +
      `<h3 class="k-h">Rewards <span class="k-count">${gotCount} / ${BADGES.length}</span></h3>` +
      `<div class="k-badges">${badges}</div>` +
      `<h3 class="k-h">Progress chart</h3>` +
      `<p class="k-sub">Your score each time you checked answers (newest on the right)</p>${chart()}` +
      `<h3 class="k-h">Your record</h3>${histHtml}` +
      `<p class="k-top"><a href="#main">&uarr; Back to the questions</a></p>`;
  }

  // きろくは問題の下にいつも出している（別画面にしない）ので、
  // 点数が動いたら その場で描きなおす。
  // 上の固定バーの高さぶんだけ手前で止める（スマホは2段になって高くなるので実測する）
  function jumpTo(id) {
    const el = $(id);
    if (!el) return;
    const bar = document.querySelector(".topbar");
    const top = el.getBoundingClientRect().top + window.scrollY - (bar ? bar.offsetHeight : 0) - 8;
    window.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
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

  // 上の点数（★ Progress）→ 下のきろくへスクロール。
  // href="#kiroku" だけだと「同じ場所への2回目のクリック」で何も起きないので、自分でスクロールする。
  $("score").addEventListener("click", (e) => { e.preventDefault(); jumpTo("kiroku"); });

  // 下のボタンバーの「★ Progress」→ 下のきろくへスクロール
  $("btn-progress").addEventListener("click", () => jumpTo("kiroku"));

  // 結果パネルの「★ Progress」→ 下のきろくへスクロール
  $("btn-to-kiroku").addEventListener("click", () => { $("result").close(); jumpTo("kiroku"); });

  // きろくの「Go」ボタン → その Unit の問題へ（上にもどる）
  $("kiroku").addEventListener("click", (e) => {
    if (e.target.closest(".k-top a")) { e.preventDefault(); window.scrollTo({ top: 0, behavior: "smooth" }); return; }
    const go = e.target.closest("[data-go]");
    if (!go) return;
    state.unit = go.dataset.go;
    save(); renderUnit(); window.scrollTo(0, 0);
  });

  // がんばりグラフの吹き出し（タップ・マウス・キーボードのどれでも出す）
  function showTip(hit) {
    const tip = $("chart-tip"), wrap = hit.closest(".chart-wrap");
    if (!tip || !wrap) return;
    tip.textContent = hit.dataset.tip;
    tip.hidden = false;
    const r = hit.getBoundingClientRect(), w = wrap.getBoundingClientRect();
    const x = r.left - w.left + r.width / 2;
    tip.style.left = Math.max(4, Math.min(w.width - tip.offsetWidth - 4, x - tip.offsetWidth / 2)) + "px";
  }
  function hideTip() { const tip = $("chart-tip"); if (tip) tip.hidden = true; }
  $("kiroku").addEventListener("pointerover", (e) => { const h = e.target.closest(".c-hit"); if (h) showTip(h); });
  $("kiroku").addEventListener("pointerdown", (e) => { const h = e.target.closest(".c-hit"); if (h) showTip(h); });
  $("kiroku").addEventListener("focusin", (e) => { const h = e.target.closest(".c-hit"); if (h) showTip(h); });
  $("kiroku").addEventListener("pointerleave", hideTip);
  $("kiroku").addEventListener("focusout", hideTip);
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
    $("btn-reveal").textContent = on ? "Hide answers" : "Show answers";
  });

  $("btn-reset").addEventListener("click", () => {
    if (!confirm(`Clear everything you typed in Unit ${state.unit}?\nYour check-answer records are kept.`)) return;
    Object.keys(state.answers).forEach((k) => { if (k.startsWith(state.unit + "#")) delete state.answers[k]; });
    save(); renderUnit();
  });

  renderUnit();
})();
