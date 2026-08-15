/* 起手式 — 狀態機與畫面渲染
   一次只有一屏。所有題目來自 quiz-data.js，所有分數來自 scoring.js，
   這支只負責「現在該顯示什麼」與「使用者按了什麼」。 */
(function () {
  "use strict";

  var QUIZ = window.QUIZ, SCORING = window.SCORING, CHART = window.CHART;
  var BUILDER = window.PLAN_BUILDER;
  var T = window.ANALYTICS, N = T.NAMES;

  var app = document.getElementById("app");
  var backBtn = document.getElementById("back-btn");
  var themeBtn = document.getElementById("theme-btn");
  var progressBox = document.getElementById("progress");
  var progressFill = document.getElementById("progress-fill");
  var progressLabel = document.getElementById("progress-label");
  var progressPct = document.getElementById("progress-pct");
  var progressLive = document.getElementById("progress-live");

  /* ---- 小工具 ---------------------------------------------------------- */
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function store(key, val) {
    try {
      if (val === undefined) return localStorage.getItem(key);
      localStorage.setItem(key, val);
    } catch (e) { /* 無痕模式或 file:// */ }
    return null;
  }
  function session(key, val) {
    try {
      if (val === undefined) return sessionStorage.getItem(key);
      sessionStorage.setItem(key, val);
    } catch (e) { }
    return null;
  }
  function reducedMotion() {
    return window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }
  function $(sel, root) { return (root || app).querySelector(sel); }
  function $$(sel, root) { return Array.prototype.slice.call((root || app).querySelectorAll(sel)); }
  function money(n) { return "NT$" + n.toLocaleString("zh-TW"); }

  /* ---- 主題 ------------------------------------------------------------ */
  var saved = store("fm-theme");
  if (saved === "light" || saved === "dark") document.documentElement.setAttribute("data-theme", saved);
  themeBtn.addEventListener("click", function () {
    var cur = document.documentElement.getAttribute("data-theme");
    var sysDark = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
    var next = (cur ? cur === "dark" : sysDark) ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    store("fm-theme", next);
  });

  /* ---- 步驟表：題目與過場屏攤平成一條線 -------------------------------- */
  var STEPS = [];
  QUIZ.questions.forEach(function (q, i) {
    STEPS.push({ kind: "question", q: q, number: i + 1 });
    if (q.interstitialAfter) STEPS.push({ kind: "interstitial", data: q.interstitialAfter, number: i + 1 });
  });
  var TOTAL = QUIZ.questions.length;

  /* ---- 狀態 ------------------------------------------------------------ */
  var state = {
    flow: "intro",          // intro | steps | analyzing | plan | planDetail | email | pricing | done
    stepIndex: 0,
    answers: {},
    result: null,
    studyPlan: null,        // 週次表，進 planDetail 時才建
    email: "",
    plan: "p12"
  };

  var OFFER_MINUTES = 10;
  var OFFER_KEY = "fm-offer-deadline";
  var PLANS = [
    { id: "p4",  name: "4 週入門",   days: 28, price: 690,  list: 990,  note: "先把基礎打完" },
    { id: "p12", name: "12 週完整",  days: 84, price: 1490, list: 2370, note: "最多人選，含實戰模擬", best: true }
  ];

  /* ---- 進度 ------------------------------------------------------------ */
  function syncProgress() {
    if (state.flow !== "steps") { progressBox.hidden = true; return; }
    progressBox.hidden = false;
    var num = STEPS[state.stepIndex].number;
    var pct = Math.round((num / TOTAL) * 100);
    progressFill.style.width = pct + "%";
    progressLabel.textContent = "第 " + num + " 題 / 共 " + TOTAL + " 題";
    progressPct.textContent = pct + "%";
    progressLive.textContent = "第 " + num + " 題，共 " + TOTAL + " 題，完成 " + pct + "%";
  }

  function syncBack() {
    var canBack = (state.flow === "steps" && state.stepIndex > 0) ||
                  state.flow === "planDetail" || state.flow === "email" ||
                  state.flow === "pricing";
    backBtn.hidden = !canBack;
  }

  function goBack() {
    if (state.flow === "steps" && state.stepIndex > 0) { state.stepIndex--; render(); return; }
    if (state.flow === "planDetail") { state.flow = "plan"; render(); return; }
    if (state.flow === "email") { state.flow = "planDetail"; render(); return; }
    if (state.flow === "pricing") { state.flow = "email"; render(); return; }
  }
  backBtn.addEventListener("click", goBack);

  /* ---- 畫面切換 -------------------------------------------------------- */
  function paint(html) {
    app.innerHTML = '<div class="screen">' + html + "</div>";
    syncProgress();
    syncBack();
    var head = $("[data-focus]");
    if (head) head.focus();
  }

  function advance() {
    if (state.stepIndex < STEPS.length - 1) { state.stepIndex++; render(); return; }
    state.flow = "analyzing";
    T.track(N.quizCompleted, { answered: Object.keys(state.answers).length });
    render();
  }

  /* ---- 開場鉤子 -------------------------------------------------------- */
  function renderIntro() {
    paint(
      '<div class="stack-lg">' +
        "<div>" +
          '<p class="eyebrow">台股學習定位測驗</p>' +
          '<h1 class="h1" data-focus tabindex="-1">3 分鐘，找出你的台股起手式</h1>' +
          '<p class="lede">' + TOTAL + " 題問答，算出你的準備度、適合的學習路徑，" +
            "以及一份照你的時間排出來的入門順序。</p>" +
        "</div>" +

        '<ul class="card stack" style="list-style:none;padding-left:18px;margin:0">' +
          '<li>✅ <b>不用註冊</b>，做完才決定要不要留 Email</li>' +
          '<li>🧮 結果<b>依你的實際作答計算</b>，不是罐頭答案</li>' +
          '<li>🇹🇼 題目全是台灣情境：0050、除權息、二代健保、勞退</li>' +
        "</ul>" +

        "<div>" +
          '<button class="btn" id="start">開始測驗</button>' +
          '<p class="fine" style="text-align:center;margin-top:10px">' +
            "約 " + QUIZ.meta.estMinutes + " 分鐘 · 免費 · 隨時可以回上一題改答案</p>" +
        "</div>" +

        '<p class="fine">本測驗為教育用途，結果是學習路徑建議，不構成投資建議。</p>' +
      "</div>"
    );

    $("#start").addEventListener("click", function () {
      state.flow = "steps";
      state.stepIndex = 0;
      T.track(N.quizStarted, { total: TOTAL });
      render();
    });
  }

  /* ---- 選項卡 ---------------------------------------------------------- */
  function optionHTML(opt, selected, multi) {
    return '<button class="option" type="button" role="' + (multi ? "checkbox" : "radio") + '" ' +
      'aria-checked="' + (selected ? "true" : "false") + '" ' +
      'data-opt="' + esc(opt.id) + '">' +
      (opt.icon ? '<span class="option-icon" aria-hidden="true">' + esc(opt.icon) + "</span>" : "") +
      '<span class="option-body">' +
        '<span class="option-label">' + esc(opt.label) + "</span>" +
        (opt.note ? '<span class="option-note">' + esc(opt.note) + "</span>" : "") +
      "</span>" +
      '<span class="option-check" aria-hidden="true">✓</span>' +
    "</button>";
  }

  function questionHead(q) {
    return '<p class="eyebrow">' + esc(q.stage) + "</p>" +
      '<h2 class="h1" data-focus tabindex="-1">' + esc(q.title) + "</h2>" +
      (q.note ? '<p class="lede">' + esc(q.note) + "</p>" : "");
  }

  /* ---- 單選 ------------------------------------------------------------ */
  function renderSingle(q) {
    var cur = state.answers[q.id];
    paint(
      questionHead(q) +
      '<div class="options" role="radiogroup" aria-label="' + esc(q.title) + '">' +
        q.options.map(function (o) { return optionHTML(o, cur === o.id, false); }).join("") +
      "</div>"
    );

    var locked = false;
    $$(".option").forEach(function (btn) {
      btn.addEventListener("click", function () {
        if (locked) return;
        locked = true;
        var id = btn.getAttribute("data-opt");
        state.answers[q.id] = id;
        $$(".option").forEach(function (b) { b.setAttribute("aria-checked", b === btn ? "true" : "false"); });
        T.track(N.questionAnswered, { question: q.id, answer: id });
        // 選完稍等一下再走，讓選中狀態看得見
        setTimeout(advance, reducedMotion() ? 60 : 300);
      });
    });
  }

  /* ---- 多選 ------------------------------------------------------------ */
  function renderMulti(q) {
    var cur = (state.answers[q.id] || []).slice();
    var min = q.minSelect || 1;

    paint(
      questionHead(q) +
      '<div class="options" role="group" aria-label="' + esc(q.title) + '">' +
        q.options.map(function (o) { return optionHTML(o, cur.indexOf(o.id) >= 0, true); }).join("") +
      "</div>" +
      '<div class="sticky-foot"><button class="btn" id="next">下一步</button>' +
      '<p class="fine" style="text-align:center;margin-top:8px" id="hint">至少選 ' + min + " 項</p></div>"
    );

    var next = $("#next"), hint = $("#hint");
    function sync() {
      next.disabled = cur.length < min;
      hint.textContent = cur.length < min ? "至少選 " + min + " 項" : "已選 " + cur.length + " 項";
    }
    sync();

    $$(".option").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var id = btn.getAttribute("data-opt");
        var at = cur.indexOf(id);
        if (at >= 0) cur.splice(at, 1); else cur.push(id);
        btn.setAttribute("aria-checked", at >= 0 ? "false" : "true");
        state.answers[q.id] = cur.slice();
        sync();
      });
    });

    next.addEventListener("click", function () {
      T.track(N.questionAnswered, { question: q.id, answer: cur.slice() });
      advance();
    });
  }

  /* ---- 滑桿 ------------------------------------------------------------ */
  function renderSlider(q) {
    var cur = state.answers[q.id] != null ? Number(state.answers[q.id]) : q.default;
    paint(
      questionHead(q) +
      '<div class="slider-wrap card">' +
        '<div class="slider-value tnum" id="sv">' + cur + "</div>" +
        '<div class="slider-caption" id="sc">' + esc(q.captions[cur]) + "</div>" +
        '<input class="slider" type="range" id="sr" min="' + q.min + '" max="' + q.max +
          '" step="' + q.step + '" value="' + cur + '" aria-label="' + esc(q.title) + '">' +
        '<div class="slider-ends"><span>' + q.min + "</span><span>" + q.max + "</span></div>" +
      "</div>" +
      '<div class="sticky-foot"><button class="btn" id="next">繼續</button></div>'
    );

    state.answers[q.id] = cur;
    var sr = $("#sr"), sv = $("#sv"), sc = $("#sc");
    sr.addEventListener("input", function () {
      var v = Number(sr.value);
      state.answers[q.id] = v;
      sv.textContent = v;
      sc.textContent = q.captions[v];
    });
    $("#next").addEventListener("click", function () {
      T.track(N.questionAnswered, { question: q.id, answer: state.answers[q.id] });
      advance();
    });
  }

  /* ---- 過場鼓勵屏 ------------------------------------------------------ */
  function renderInterstitial(data) {
    paint(
      '<div class="interstitial">' +
        '<div class="interstitial-emoji" aria-hidden="true">' + esc(data.emoji) + "</div>" +
        '<h2 class="h2" data-focus tabindex="-1">' + esc(data.title) + "</h2>" +
        '<p class="lede">' + esc(data.body) + "</p>" +
      "</div>" +
      '<div class="sticky-foot"><button class="btn" id="next">繼續</button></div>'
    );
    $("#next").addEventListener("click", advance);
  }

  /* ---- 分析屏 ---------------------------------------------------------- */
  function labelsFor(result) {
    var q = {};
    QUIZ.questions.forEach(function (x) { q[x.id] = x; });

    function labelOf(qid, optId) {
      var found = null;
      (q[qid].options || []).forEach(function (o) { if (o.id === optId) found = o; });
      return found ? found.label : "";
    }
    var markets = (state.answers.markets || []).map(function (id) { return labelOf("markets", id); });
    var goals = (state.answers.goals || []).map(function (id) { return labelOf("goals", id); });

    return {
      experience: labelOf("experience", state.answers.experience),
      time: labelOf("time", state.answers.time),
      markets: markets.join("、") || "尚未指定",
      goals: goals.join("、") || "尚未指定",
      horizon: labelOf("horizon", state.answers.horizon),
      style: labelOf("style", state.answers.style)
    };
  }

  function renderAnalyzing() {
    // 真的在這裡算分：下面的打勾是計算結果，不是純動畫
    state.result = SCORING.evaluate(state.answers, QUIZ.questions);
    var L = labelsFor(state.result);
    var r = state.result;

    var checks = [
      "比對經驗等級：" + r.level.name,
      "讀取你選的市場：" + L.markets,
      "設定學習節奏：" + (L.time || "未指定"),
      "計算準備度：" + r.readiness + " / 100",
      "排出「" + r.path.name + "」的入門順序"
    ];
    var tips = [
      "準備度是四個維度加權算出來的，不是隨機數字。",
      "路徑會依你的目標與風險準備挑，不是每個人都一樣。",
      "算完就會顯示，中間沒有跟任何伺服器往來。"
    ];

    paint(
      '<div class="analyzing">' +
        '<h2 class="h2" data-focus tabindex="-1">正在算你的起手式…</h2>' +
        '<svg class="ring" viewBox="0 0 120 120" aria-hidden="true">' +
          '<circle class="ring-track" cx="60" cy="60" r="52"/>' +
          '<circle class="ring-fill" id="ring" cx="60" cy="60" r="52" ' +
            'stroke-dasharray="326.7" stroke-dashoffset="326.7"/>' +
          '<text class="ring-pct" id="ringpct" x="60" y="70" text-anchor="middle">0%</text>' +
        "</svg>" +
        '<span class="sr-only" aria-live="polite" id="alive">正在計算你的結果</span>' +
        '<div class="check-list">' +
          checks.map(function (c, i) {
            return '<div class="check-item" id="ck' + i + '">' +
              '<span class="check-mark" aria-hidden="true">✓</span><span>' + esc(c) + "</span></div>";
          }).join("") +
        "</div>" +
        '<p class="analyzing-tip" id="tip">' + esc(tips[0]) + "</p>" +
      "</div>"
    );

    var DUR = reducedMotion() ? 400 : 2800;
    var ring = $("#ring"), ringpct = $("#ringpct"), tip = $("#tip");
    var CIRC = 2 * Math.PI * 52;
    var t0 = performance.now();
    var shown = -1, tipAt = 0;

    function frame(now) {
      var p = Math.min(1, (now - t0) / DUR);
      var eased = 1 - Math.pow(1 - p, 2);
      ring.setAttribute("stroke-dashoffset", (CIRC * (1 - eased)).toFixed(1));
      ringpct.textContent = Math.round(eased * 100) + "%";

      var idx = Math.min(checks.length - 1, Math.floor(p * checks.length));
      while (shown < idx) { shown++; var el = $("#ck" + shown); if (el) el.classList.add("on"); }

      var ti = Math.min(tips.length - 1, Math.floor(p * tips.length));
      if (ti !== tipAt) { tipAt = ti; tip.textContent = tips[ti]; }

      if (p < 1) requestAnimationFrame(frame);
      else {
        $$(".check-item").forEach(function (el) { el.classList.add("on"); });
        $("#alive").textContent = "計算完成";
        setTimeout(function () { state.flow = "plan"; render(); }, reducedMotion() ? 100 : 350);
      }
    }
    requestAnimationFrame(frame);
  }

  /* ---- 個人化計畫 ------------------------------------------------------ */
  function readinessNote(score) {
    if (score < 35) return "底子還在建立中——這是最適合把觀念一次弄對的階段，不用急著進場。";
    if (score < 60) return "你已經有感覺了，缺的是把零散的知識串成一套自己的流程。";
    if (score < 80) return "基礎穩，接下來的重點是紀律與部位管理，而不是再多學十個名詞。";
    return "你的準備度偏高，適合直接進到研究與風險管理的深水區。";
  }

  function renderPlan() {
    var r = state.result, L = labelsFor(r);
    var chart = CHART.growth({ readiness: r.readiness, weeks: r.weeks, timeScore: r.scores.time });
    T.track(N.resultViewed, { level: r.level.id, path: r.path.id, readiness: r.readiness });

    paint(
      '<div class="stack-lg">' +
        "<div>" +
          '<p class="eyebrow">你的結果</p>' +
          '<h2 class="h1" data-focus tabindex="-1">你的起手式出來了 🎉</h2>' +
          '<p class="lede">依你剛剛的 ' + TOTAL + " 題作答計算，沒有兩份會完全一樣。</p>" +
          '<p style="margin-top:12px"><span class="badge">' + esc(r.level.name) + "</span> " +
            '<span class="badge badge-soft">準備度 ' + r.readiness + " / 100</span></p>" +
        "</div>" +

        '<div class="summary-grid">' +
          '<div class="summary-cell"><div class="summary-key">主要目標</div><div class="summary-val">' + esc(L.goals) + "</div></div>" +
          '<div class="summary-cell"><div class="summary-key">想學的市場</div><div class="summary-val">' + esc(L.markets) + "</div></div>" +
          '<div class="summary-cell"><div class="summary-key">每日節奏</div><div class="summary-val">' + esc(L.time || "未指定") + "</div></div>" +
          '<div class="summary-cell"><div class="summary-key">預估入門</div><div class="summary-val">' + r.weeks + " 週</div></div>" +
        "</div>" +

        '<div class="card">' +
          '<h3 class="h2">你現在的三個面向</h3>' +
          '<div style="margin-top:14px">' +
            r.meters.map(function (m) {
              return '<div class="meter"><div class="meter-head"><span>' + esc(m.label) +
                "</span><b class=\"tnum\">" + m.value + " / 100</b></div>" +
                '<div class="meter-track"><div class="meter-fill" data-w="' + m.value + '"></div></div></div>';
            }).join("") +
          "</div>" +
          '<p class="fine" style="margin-top:14px">' + esc(readinessNote(r.readiness)) + "</p>" +
        "</div>" +

        '<div class="card">' +
          '<h3 class="h2">照這個節奏，第 ' + r.weeks + " 週會在哪裡</h3>" +
          '<div class="chart-wrap">' + chart.svg + "</div>" +
          '<p class="fine">縱軸是<b>學習準備度</b>，不是報酬率、也不是資產。這條線只反映你填的投入時間與現在的底子，' +
            "跟市場漲跌無關。</p>" +
        "</div>" +

        '<div class="card">' +
          '<p class="eyebrow">建議路徑</p>' +
          '<h3 class="h2">' + esc(r.path.name) + "</h3>" +
          '<p class="lede">' + esc(r.path.why) + "</p>" +
          '<ol class="path-steps" style="margin-top:14px">' +
            r.path.steps.map(function (s) { return "<li><span>" + esc(s) + "</span></li>"; }).join("") +
          "</ol>" +
        "</div>" +

        '<div class="sticky-foot"><button class="btn" id="next">看我的完整 ' + r.weeks + ' 週計畫</button>' +
          '<p class="fine" style="text-align:center;margin-top:8px">免費，不用留 Email</p></div>' +
      "</div>"
    );

    // 進度條等畫面上去之後再長，才看得到動畫
    requestAnimationFrame(function () {
      $$(".meter-fill").forEach(function (el) { el.style.width = el.getAttribute("data-w") + "%"; });
    });

    $("#next").addEventListener("click", function () { state.flow = "planDetail"; render(); });
  }

  /* ---- 完整計畫：這才是使用者真正拿得走的東西 -------------------------- */
  function renderPlanDetail() {
    var r = state.result;
    if (!state.studyPlan) state.studyPlan = BUILDER.build(r, state.answers);
    var plan = state.studyPlan;
    T.track(N.planViewed, { path: plan.pathId, weeks: plan.totalWeeks });

    var weeksHTML = plan.weeks.map(function (w) {
      return '<article class="card week">' +
        '<div class="week-head"><span class="week-n">第 ' + w.n + " 週</span>" +
          (w.phase ? '<span class="badge badge-soft">' + esc(w.phase) + "</span>" : "") + "</div>" +
        '<h3 class="h2">' + esc(w.title) + "</h3>" +
        (w.why ? '<p class="lede">' + esc(w.why) + "</p>" : "") +
        (w.points.length
          ? '<p class="week-label">本週重點</p><ul class="week-list">' +
            w.points.map(function (x) { return "<li>" + esc(x) + "</li>"; }).join("") + "</ul>"
          : "") +
        (w.tasks.length
          ? '<p class="week-label">本週任務</p><ul class="task-list">' +
            w.tasks.map(function (x) { return "<li>" + esc(x) + "</li>"; }).join("") + "</ul>"
          : "") +
        (w.check ? '<p class="week-check"><b>檢查點</b>　' + esc(w.check) + "</p>" : "") +
      "</article>";
    }).join("");

    paint(
      '<div class="stack-lg">' +
        "<div>" +
          '<p class="eyebrow">你的完整計畫</p>' +
          '<h2 class="h1" data-focus tabindex="-1">' + plan.totalWeeks + " 週・" + esc(plan.pathName) + "</h2>" +
          '<p class="lede">' + esc(plan.intro) + "</p>" +
          '<p style="margin-top:12px">' +
            '<span class="badge">' + esc(plan.rhythm.perDay) + "</span> " +
            '<span class="badge badge-soft">' + plan.counts.points + " 條重點</span> " +
            '<span class="badge badge-soft">' + plan.counts.tasks + " 項任務</span></p>" +
        "</div>" +

        '<div class="notice"><b>節奏建議</b>　' + esc(plan.rhythm.how) + "</div>" +

        weeksHTML +

        (plan.extras.length
          ? '<div class="card"><h3 class="h2">之後可以再學</h3>' +
            '<p class="fine">你這次選的時間排不下這幾個單元，等前面走完再回來。</p>' +
            '<ul class="week-list" style="margin-top:12px">' +
              plan.extras.map(function (e) {
                return "<li><b>" + esc(e.title) + "</b>：" + esc(e.why) + "</li>";
              }).join("") +
            "</ul></div>"
          : "") +

        '<div class="card no-print">' +
          '<h3 class="h2">把計畫帶走</h3>' +
          '<p class="fine">這份計畫在你的瀏覽器裡，重整就沒了。存一份起來。</p>' +
          '<div style="margin-top:14px;display:grid;gap:10px">' +
            '<button class="btn btn-ghost" id="print">列印，或存成 PDF</button>' +
            '<button class="btn btn-ghost" id="dl">下載 Markdown 檔</button>' +
          "</div>" +
        "</div>" +

        '<div class="sticky-foot no-print">' +
          '<button class="btn" id="next">也寄一份到我的信箱</button></div>' +
      "</div>"
    );

    $("#print").addEventListener("click", function () {
      T.track(N.planPrinted, { path: plan.pathId });
      window.print();
    });

    $("#dl").addEventListener("click", function () {
      var md = BUILDER.toMarkdown(plan, r);
      var blob = new Blob([md], { type: "text/markdown;charset=utf-8" });
      var url = URL.createObjectURL(blob);
      var a = document.createElement("a");
      a.href = url;
      // 檔名刻意用 ASCII：Chromium 遇到含中文的 download 檔名會整個丟掉，
      // 退回成沒有副檔名的 "download"，使用者拿到一個打不開的檔案。
      // 檔案內容本身是 UTF-8 中文，不受影響。
      a.download = "tw-stock-study-plan-" + plan.totalWeeks + "w.md";
      document.body.appendChild(a);
      a.click();
      // 不能馬上移除：Chromium 是非同步處理下載的，太早拔掉 <a> 會連 download
      // 屬性一起弄丟，檔名就變成 "download"。等一秒再一起清掉。
      setTimeout(function () {
        if (a.parentNode) a.parentNode.removeChild(a);
        URL.revokeObjectURL(url);
      }, 1000);
      T.track(N.planDownloaded, { path: plan.pathId, bytes: md.length });
    });

    $("#next").addEventListener("click", function () { state.flow = "email"; render(); });
  }

  /* ---- Email 收集 ------------------------------------------------------ */
  function validEmail(v) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(v).trim());
  }

  function renderEmail() {
    var r = state.result;
    paint(
      '<div class="stack-lg">' +
        "<div>" +
          '<p class="eyebrow">最後一步</p>' +
          '<h2 class="h1" data-focus tabindex="-1">把計畫寄給你</h2>' +
          '<p class="lede">' + r.weeks + " 週的「" + esc(r.path.name) +
            "」順序表，加上第一堂課的連結。不留也可以繼續看方案。</p>" +
        "</div>" +

        '<div class="card">' +
          '<div class="field">' +
            '<label for="email">你的 Email</label>' +
            '<input class="input" id="email" type="email" inputmode="email" autocomplete="email" ' +
              'placeholder="you@example.com" aria-describedby="email-err" value="' + esc(state.email) + '">' +
            '<p class="error-text" id="email-err" hidden></p>' +
          "</div>" +
          '<label class="consent"><input type="checkbox" id="consent">' +
            "<span>我同意收到這份學習計畫與後續的課程通知，隨時可以退訂。</span></label>" +
          '<p class="fine" style="margin-top:12px">這是原型，Email 只會留在你的瀏覽器主控台，' +
            "不會送到任何伺服器。</p>" +
        "</div>" +

        '<div class="sticky-foot">' +
          '<button class="btn" id="send">寄給我並看方案</button>' +
          '<button class="btn btn-ghost" id="skip" style="margin-top:10px">先跳過，直接看方案</button>' +
        "</div>" +
      "</div>"
    );

    var input = $("#email"), err = $("#email-err"), consent = $("#consent");

    function fail(msg) {
      err.textContent = msg;
      err.hidden = false;
      input.setAttribute("aria-invalid", "true");
      input.focus();
    }

    $("#send").addEventListener("click", function () {
      var v = input.value.trim();
      if (!validEmail(v)) return fail("Email 格式看起來不太對，再檢查一下。");
      if (!consent.checked) return fail("要先勾選同意，才能把計畫寄給你。");
      err.hidden = true;
      input.removeAttribute("aria-invalid");
      state.email = v;
      T.track(N.emailSubmitted, { hasEmail: true });
      // TODO: 串接 API — POST /api/lead { email, answers, result }
      console.log("[TODO 串接 API] lead", { email: v, answers: state.answers, result: state.result });
      state.flow = "pricing";
      render();
    });

    $("#skip").addEventListener("click", function () {
      T.track(N.emailSubmitted, { hasEmail: false });
      state.flow = "pricing";
      render();
    });
  }

  /* ---- 方案：真的會到期的限時優惠 -------------------------------------- */
  function offerDeadline() {
    var saved = session(OFFER_KEY);
    if (saved) return Number(saved);
    var dl = Date.now() + OFFER_MINUTES * 60 * 1000;
    session(OFFER_KEY, String(dl));
    return dl;
  }

  var tickTimer = null;

  function renderPricing() {
    var r = state.result;
    var deadline = offerDeadline();
    T.track(N.pricingViewed, { path: r.path.id });

    function planCard(p, active, expired) {
      var price = expired ? p.list : p.price;
      var daily = Math.round(price / p.days);
      return '<button class="plan" type="button" role="radio" aria-checked="' + (active ? "true" : "false") +
        '" data-plan="' + p.id + '">' +
        '<div class="plan-top"><span class="plan-name">' + esc(p.name) +
          (p.best ? ' <span class="badge">最多人選</span>' : "") + "</span>" +
          '<span class="plan-price tnum">' + money(price) +
          (expired ? "" : '<span class="plan-was">' + money(p.list) + "</span>") + "</span></div>" +
        '<div class="plan-daily">' + esc(p.note) + " · 每天約 " + money(daily) + "</div>" +
      "</button>";
    }

    var expired = Date.now() >= deadline;   // tick() 會在跨過期限時翻成 true

    paint(
      '<div class="stack-lg">' +
        "<div>" +
          '<p class="eyebrow">你的 ' + r.weeks + " 週計畫已就緒</p>" +
          '<h2 class="h1" data-focus tabindex="-1">開始「' + esc(r.path.name) + "」</h2>" +
          '<p class="lede">前兩堂課免費看完再決定，不用先付錢。</p>' +
        "</div>" +

        '<div class="countdown" id="countdown"></div>' +

        '<div class="stack" role="radiogroup" aria-label="選擇方案" id="plans">' +
          PLANS.map(function (p) { return planCard(p, state.plan === p.id, expired); }).join("") +
        "</div>" +

        '<div class="notice">' +
          "<b>訂閱條款</b>：到期後自動續訂，續訂價為原價（4 週 " + money(990) + "／12 週 " + money(2370) +
          "）。可在設定頁隨時取消，取消後仍可用到當期結束。7 天內未開始課程可全額退款。" +
        "</div>" +

        '<div class="card">' +
          '<p class="eyebrow">示範資料</p>' +
          '<p class="fine">以下評價與星等是<b>版面示範用的假資料</b>，這個原型沒有真實用戶，' +
            "所以不會假裝有。</p>" +
          '<div style="margin-top:14px">' +
            '<div class="quote"><div class="stars" aria-hidden="true">★★★★★</div>' +
              '<p class="fine">「終於知道除權息不是虧錢了。」— 示範用戶 A</p></div>' +
            '<div class="quote"><div class="stars" aria-hidden="true">★★★★☆</div>' +
              '<p class="fine">「每天 15 分鐘真的做得到。」— 示範用戶 B</p></div>' +
          "</div>" +
        "</div>" +

        '<div class="sticky-foot"><button class="btn" id="buy">開始我的計畫</button>' +
          '<p class="fine" style="text-align:center;margin-top:8px">原型未串接金流，按下去只會顯示成功畫面</p></div>' +
      "</div>"
    );

    var cd = $("#countdown");

    function tick() {
      var left = deadline - Date.now();
      if (left <= 0) {
        cd.className = "countdown expired";
        cd.textContent = "限時優惠已結束，價格已回到原價。";
        if (tickTimer) { clearInterval(tickTimer); tickTimer = null; }
        // 只在「剛好跨過期限」時重畫一次，否則 render → tick → render 會打死自己
        if (!expired) {
          expired = true;
          T.track(N.offerExpired, {});
          if (state.flow === "pricing") render();   // 價格真的換回原價
        }
        return;
      }
      var m = Math.floor(left / 60000), s = Math.floor((left % 60000) / 1000);
      cd.className = "countdown";
      cd.innerHTML = "首購優惠剩 <b>" + m + ":" + (s < 10 ? "0" : "") + s + "</b>";
    }

    if (tickTimer) clearInterval(tickTimer);
    tick();
    if (!expired) tickTimer = setInterval(tick, 1000);

    $$("[data-plan]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        state.plan = btn.getAttribute("data-plan");
        $$("[data-plan]").forEach(function (b) {
          b.setAttribute("aria-checked", b === btn ? "true" : "false");
        });
        T.track(N.planSelected, { plan: state.plan });
      });
    });

    $("#buy").addEventListener("click", function () {
      T.track(N.checkoutStarted, { plan: state.plan, expired: Date.now() >= deadline });
      // TODO: 串接金流 — 導向結帳頁或開啟結帳 Modal
      console.log("[TODO 串接金流] checkout", { plan: state.plan, email: state.email });
      if (tickTimer) { clearInterval(tickTimer); tickTimer = null; }
      state.flow = "done";
      render();
    });
  }

  /* ---- 成功屏 ---------------------------------------------------------- */
  function renderDone() {
    var r = state.result;
    paint(
      '<div class="stack-lg" style="text-align:center">' +
        '<div class="interstitial-emoji" aria-hidden="true">🎉</div>' +
        '<h2 class="h1" data-focus tabindex="-1">計畫已建立</h2>' +
        '<p class="lede">「' + esc(r.path.name) + "」· " + r.weeks + " 週 · " +
          esc(PLANS.filter(function (p) { return p.id === state.plan; })[0].name) + "</p>" +
        '<div class="notice">這是原型，沒有真的扣款、也沒有寄出任何信件。' +
          "上面所有數字都來自你剛才的作答，重做一次換不同答案，結果就會不一樣。</div>" +
        '<button class="btn" id="toplan">回我的完整計畫</button>' +
        '<button class="btn btn-ghost" id="again" style="margin-top:10px">重做一次</button>' +
      "</div>"
    );
    $("#toplan").addEventListener("click", function () { state.flow = "planDetail"; render(); });
    $("#again").addEventListener("click", function () {
      state = { flow: "intro", stepIndex: 0, answers: {}, result: null,
                studyPlan: null, email: "", plan: "p12" };
      render();
    });
  }

  /* ---- 路由 ------------------------------------------------------------ */
  function render() {
    if (tickTimer && state.flow !== "pricing") { clearInterval(tickTimer); tickTimer = null; }

    if (state.flow === "intro") return renderIntro();
    if (state.flow === "analyzing") return renderAnalyzing();
    if (state.flow === "plan") return renderPlan();
    if (state.flow === "planDetail") return renderPlanDetail();
    if (state.flow === "email") return renderEmail();
    if (state.flow === "pricing") return renderPricing();
    if (state.flow === "done") return renderDone();

    var step = STEPS[state.stepIndex];
    if (step.kind === "interstitial") return renderInterstitial(step.data);
    if (step.q.type === "single") return renderSingle(step.q);
    if (step.q.type === "multi") return renderMulti(step.q);
    if (step.q.type === "slider") return renderSlider(step.q);
  }

  render();
})();
