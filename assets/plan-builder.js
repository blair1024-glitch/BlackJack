/* 起手式 — 把路徑內容攤成一份週次表
   同一條路徑，4 週和 14 週要排出不一樣的表：週數多就把單元拆成「讀懂」和「動手」兩週，
   週數少就先排前面幾個單元、其餘列成延伸。純函式，同樣輸入永遠同樣輸出。 */
(function (global) {
  "use strict";

  /* 每天能投入多少，決定這份計畫的節奏建議 */
  var RHYTHM = {
    t5:   { perDay: "每天 5 分鐘",  how: "讀 1 條重點，週末再一次把本週任務做完" },
    t15:  { perDay: "每天 15 分鐘", how: "讀 1～2 條重點，順手推進 1 項任務" },
    t30:  { perDay: "每天 30 分鐘", how: "讀完重點後直接動手做任務，當天就完成" },
    week: { perDay: "週末集中",     how: "平日不用開盤看，週末一次讀完重點並做完任務" }
  };

  /* 把陣列切成 n 份，盡量平均，前面的份數多 1 */
  function chunk(arr, n) {
    var out = [], len = arr.length, base = Math.floor(len / n), extra = len % n, i = 0;
    for (var k = 0; k < n; k++) {
      var take = base + (k < extra ? 1 : 0);
      out.push(arr.slice(i, i + take));
      i += take;
    }
    return out;
  }

  var PHASE = ["讀懂", "動手", "複習與檢討"];

  function build(result, answers) {
    var content = (global.PLAN_CONTENT || {})[result.path.id];
    if (!content) return null;

    var modules = content.modules;
    var W = result.weeks;
    var M = modules.length;
    var rhythm = RHYTHM[answers.time] || RHYTHM.t15;

    var weeks = [], extras = [], n = 1;

    if (W >= M) {
      // 週數夠：每個單元至少一週，多出來的週數平均分給前面的單元
      var base = Math.floor(W / M), extra = W % M;

      modules.forEach(function (mod, mi) {
        var span = base + (mi < extra ? 1 : 0);
        var pointChunks = chunk(mod.points, span);
        var taskChunks = chunk(mod.tasks, span);

        for (var s = 0; s < span; s++) {
          weeks.push({
            n: n++,
            module: mi + 1,
            title: mod.title,
            phase: span > 1 ? PHASE[Math.min(s, PHASE.length - 1)] : null,
            why: s === 0 ? mod.why : null,          // 只在單元的第一週說明為什麼
            points: pointChunks[s],
            tasks: taskChunks[s],
            check: s === span - 1 ? mod.check : null // 檢查點放在單元的最後一週
          });
        }
      });
    } else {
      // 週數不夠：先排前 W 個單元，其餘誠實列成延伸，不假裝塞得下
      modules.slice(0, W).forEach(function (mod, mi) {
        weeks.push({
          n: n++, module: mi + 1, title: mod.title, phase: null,
          why: mod.why, points: mod.points, tasks: mod.tasks, check: mod.check
        });
      });
      extras = modules.slice(W).map(function (mod) {
        return { title: mod.title, why: mod.why };
      });
    }

    return {
      pathId: result.path.id,
      pathName: result.path.name,
      intro: content.intro,
      totalWeeks: weeks.length,
      rhythm: rhythm,
      weeks: weeks,
      extras: extras,
      counts: {
        points: weeks.reduce(function (a, w) { return a + w.points.length; }, 0),
        tasks: weeks.reduce(function (a, w) { return a + w.tasks.length; }, 0)
      }
    };
  }

  /* 匯出成 Markdown，讓使用者真的帶得走 */
  function toMarkdown(plan, result) {
    var L = [];
    L.push("# 我的 " + plan.totalWeeks + " 週台股學習計畫");
    L.push("");
    L.push("**路徑**：" + plan.pathName + "  ");
    L.push("**等級**：" + result.level.name + "  ");
    L.push("**準備度**：" + result.readiness + " / 100  ");
    L.push("**節奏**：" + plan.rhythm.perDay + "（" + plan.rhythm.how + "）");
    L.push("");
    L.push(plan.intro);
    L.push("");
    L.push("目前分數：基礎知識 " + result.scores.knowledge +
           "、風險準備 " + result.scores.risk +
           "、執行紀律 " + result.scores.discipline + "（各 100 分）");
    L.push("");
    L.push("---");
    L.push("");

    plan.weeks.forEach(function (w) {
      L.push("## 第 " + w.n + " 週　" + w.title + (w.phase ? "（" + w.phase + "）" : ""));
      L.push("");
      if (w.why) { L.push("> " + w.why); L.push(""); }
      if (w.points.length) {
        L.push("**本週重點**");
        L.push("");
        w.points.forEach(function (p) { L.push("- " + p); });
        L.push("");
      }
      if (w.tasks.length) {
        L.push("**本週任務**");
        L.push("");
        w.tasks.forEach(function (t) { L.push("- [ ] " + t); });
        L.push("");
      }
      if (w.check) { L.push("**檢查點**：" + w.check); L.push(""); }
    });

    if (plan.extras.length) {
      L.push("---");
      L.push("");
      L.push("## 之後可以再學");
      L.push("");
      L.push("你這次選的時間排不下這幾個單元，等前面走完再回來：");
      L.push("");
      plan.extras.forEach(function (e) { L.push("- **" + e.title + "**：" + e.why); });
      L.push("");
    }

    L.push("---");
    L.push("");
    L.push("本計畫依測驗作答產生，為投資**教育**用途，不構成投資建議，也不保證任何投資結果。");
    L.push("內容中的稅率、費率等數字會隨年度調整，請以主管機關當年度公告為準。");
    L.push("");
    return L.join("\n");
  }

  global.PLAN_BUILDER = { build: build, toMarkdown: toMarkdown, RHYTHM: RHYTHM };
})(typeof window !== "undefined" ? window : globalThis);
