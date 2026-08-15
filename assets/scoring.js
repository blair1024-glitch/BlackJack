/* 起手式 — 計分引擎
   純函式：同一組作答永遠算出同一份結果，沒有隨機、沒有假 AI。
   UI 不准自己算分，一律呼叫 window.SCORING.evaluate(answers)。 */
(function (global) {
  "use strict";

  var DIMENSIONS = ["experience", "knowledge", "risk", "discipline", "time"];

  /* 每個維度「理論上最高能拿幾分」——直接從題庫推算，
     這樣改題目時分數自動跟著校正，不會出現永遠 100 分或永遠 40 分。 */
  function maxima(questions) {
    var max = {};
    DIMENSIONS.forEach(function (d) { max[d] = 0; });

    questions.forEach(function (q) {
      if (q.type === "slider") {
        Object.keys(q.score || {}).forEach(function (d) {
          if (max[d] != null) max[d] += q.score[d] * q.max;
        });
        return;
      }
      var best = {};
      DIMENSIONS.forEach(function (d) { best[d] = q.type === "multi" ? 0 : -Infinity; });

      (q.options || []).forEach(function (opt) {
        DIMENSIONS.forEach(function (d) {
          var v = (opt.score && opt.score[d]) || 0;
          // 多選題：全選就是上限；單選題：只能拿最高的那一個
          if (q.type === "multi") best[d] += Math.max(0, v);
          else if (v > best[d]) best[d] = v;
        });
      });

      DIMENSIONS.forEach(function (d) {
        if (best[d] !== -Infinity) max[d] += Math.max(0, best[d]);
      });
    });
    return max;
  }

  function clamp(n, lo, hi) { return Math.min(hi, Math.max(lo, n)); }
  function pct(raw, max) { return max <= 0 ? 0 : clamp(Math.round((raw / max) * 100), 0, 100); }

  /* ---- 學習路徑：四條，依目標、市場偏好與風險意識挑一條 ---- */
  var PATHS = {
    etfStart: {
      id: "etfStart",
      name: "ETF 定期定額起步",
      why: "你想要的是先站上場，而不是先變成分析師。從一籃子標的開始，把「開始」這件事變簡單。",
      steps: [
        "證券戶、定期定額怎麼設定",
        "0050、0056、00878 到底差在哪",
        "為什麼分散比選中更重要",
        "除權息與填息：股價變低不等於虧錢",
        "把每月扣款變成不用想的習慣"
      ]
    },
    cashflow: {
      id: "cashflow",
      name: "存股與現金流",
      why: "你要的是一筆每年都會進來的錢。重點會放在配息的來源、可不可持續，以及稅怎麼算。",
      steps: [
        "股利從哪裡來：配息不是公司送你錢",
        "殖利率陷阱：高配息不等於好公司",
        "除權息、填息與參與除息的判斷",
        "股利課稅：合併計稅 vs 分開計稅",
        "二代健保補充保費怎麼算、什麼時候扣"
      ]
    },
    research: {
      id: "research",
      name: "個股研究：從財報到法說會",
      why: "你想自己下判斷，那就得看得懂公司在說什麼。這條路徑從三率開始，走到法說會的前瞻說法。",
      steps: [
        "三率：毛利率、營益率、淨利率怎麼讀",
        "營收月報與季報的節奏",
        "法說會在講什麼、哪幾句要記下來",
        "本益比與同業比較的正確用法",
        "把研究寫成自己的買進理由清單"
      ]
    },
    riskFirst: {
      id: "riskFirst",
      name: "風險控管與部位管理",
      why: "你的卡點不在知識，在睡不著。先把部位大小和停損規則定下來，其他事才學得進去。",
      steps: [
        "先決定最多能虧多少，再決定買多少",
        "部位大小：一檔佔幾成才合理",
        "停損與停利：規則寫下來就不用臨場決定",
        "分批進場，降低買在最高點的痛感",
        "回頭檢討：帳本比記憶可靠"
      ]
    }
  };

  function pickPath(tally, scores, answers) {
    var g = tally.goal, m = tally.market;

    /* 風險準備不足的人先修風險課，其他都往後排。三種進場條件：
       分數本身就低、明說想學控管風險、或是一虧就想跑的反應。 */
    if (scores.risk < 40) return PATHS.riskFirst;
    if (g.riskctl >= 1 && scores.risk < 60) return PATHS.riskFirst;
    if (answers.drawdown === "panic" && scores.risk < 55) return PATHS.riskFirst;

    if (g.research >= 1 && (m.stock >= 1 || scores.knowledge >= 55)) return PATHS.research;
    if (g.income >= 1 || m.dividend >= 1) return PATHS.cashflow;
    if (g.allocation >= 1 || m.etf >= 1 || m.unsure >= 1) return PATHS.etfStart;
    return scores.knowledge >= 60 ? PATHS.research : PATHS.etfStart;
  }

  /* ---- 等級 ---- */
  function levelOf(experience, knowledge) {
    var blended = experience * 0.55 + knowledge * 0.45;
    if (blended < 32) return { id: "beginner", name: "新手起步", blended: blended };
    if (blended < 62) return { id: "intermediate", name: "入門進行中", blended: blended };
    return { id: "advanced", name: "進階打底", blended: blended };
  }

  /* ---- 入門週數：時間投入越少、底子越薄，週數越長 ---- */
  function weeksTo(level, timeScore) {
    var base = { beginner: 12, intermediate: 8, advanced: 6 }[level.id];
    var adj = timeScore >= 70 ? -2 : timeScore >= 45 ? 0 : timeScore >= 25 ? 2 : 4;
    return clamp(base + adj, 4, 20);
  }

  /* ---- 主函式 ---- */
  function evaluate(answers, questions) {
    questions = questions || (global.QUIZ && global.QUIZ.questions) || [];

    var raw = {};
    DIMENSIONS.forEach(function (d) { raw[d] = 0; });

    var tally = {
      goal:   { income: 0, milestone: 0, research: 0, riskctl: 0, allocation: 0 },
      market: { etf: 0, stock: 0, dividend: 0, us: 0, unsure: 0 }
    };
    var picked = {};   // 給結果頁回填文案用

    questions.forEach(function (q) {
      var a = answers[q.id];
      if (a == null) return;

      if (q.type === "slider") {
        Object.keys(q.score || {}).forEach(function (d) {
          if (raw[d] != null) raw[d] += q.score[d] * Number(a);
        });
        picked[q.id] = Number(a);
        return;
      }

      var chosen = q.type === "multi" ? a : [a];
      picked[q.id] = chosen.slice();

      chosen.forEach(function (optId) {
        var opt = null;
        for (var i = 0; i < q.options.length; i++) {
          if (q.options[i].id === optId) { opt = q.options[i]; break; }
        }
        if (!opt) return;

        Object.keys(opt.score || {}).forEach(function (d) {
          if (raw[d] != null) raw[d] += opt.score[d];
        });
        if (opt.tag) {
          Object.keys(opt.tag).forEach(function (k) {
            if (tally[k]) tally[k][opt.tag[k]] = (tally[k][opt.tag[k]] || 0) + 1;
          });
        }
      });
    });

    var max = maxima(questions);
    var scores = {};
    DIMENSIONS.forEach(function (d) { scores[d] = pct(raw[d], max[d]); });

    var level = levelOf(scores.experience, scores.knowledge);
    var path = pickPath(tally, scores, answers);
    var weeks = weeksTo(level, scores.time);

    /* 準備度：知識 30%、風險準備 30%、紀律 25%、經驗 15%。
       時間投入不算進準備度——它決定的是速度，不是程度。
       風險準備只吃行為訊號（面對虧損的反應、練習金額、投資期間），
       「想學風險控管」是願望，不會讓這個分數變高。 */
    var readiness = clamp(Math.round(
      scores.knowledge * 0.30 + scores.risk * 0.30 +
      scores.discipline * 0.25 + scores.experience * 0.15
    ), 0, 100);

    return {
      scores: scores,
      raw: raw,
      max: max,
      tally: tally,
      picked: picked,
      level: level,
      path: path,
      weeks: weeks,
      readiness: readiness,
      // 結果頁的三條進度條，刻意只挑三個看得懂的維度
      meters: [
        { key: "knowledge",  label: "基礎知識", value: scores.knowledge },
        { key: "risk",       label: "風險準備", value: scores.risk },
        { key: "discipline", label: "執行紀律", value: scores.discipline }
      ]
    };
  }

  global.SCORING = { evaluate: evaluate, PATHS: PATHS, DIMENSIONS: DIMENSIONS, maxima: maxima };
})(typeof window !== "undefined" ? window : globalThis);
