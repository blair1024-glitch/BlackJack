/* 計分引擎離線測試：不開瀏覽器、不連網。
   驗收重點——結果必須「真的」隨作答改變，而不是每個人都拿到同一份。
   跑法：node scripts/test_scoring.js */
"use strict";
const path = require("path");
const vm = require("vm");
const fs = require("fs");

const sandbox = { window: {}, console };
sandbox.window.window = sandbox.window;
vm.createContext(sandbox);

for (const f of ["quiz-data.js", "scoring.js", "chart.js", "plan-content.js", "plan-builder.js"]) {
  const src = fs.readFileSync(path.join(__dirname, "..", "assets", f), "utf8");
  vm.runInContext(src, sandbox, { filename: f });
}

const { QUIZ, SCORING, CHART, PLAN_CONTENT, PLAN_BUILDER } = sandbox.window;

let failed = 0;
function ok(cond, msg) {
  console.log((cond ? "  ✓ " : "  ✗ ") + msg);
  if (!cond) failed++;
}

/* ---- 三組差異很大的作答 ---- */
const PROFILES = {
  "完全新手／怕虧錢／沒時間": {
    experience: "none", goals: ["riskctl"], pain: "fear", markets: ["unsure"],
    time: "t5", drawdown: "panic", age: "a50", localrule: "exdiv",
    horizon: "hlong", style: "video", capital: "paper", selfrate: 1, coaching: "coach"
  },
  "存股族／想要現金流": {
    experience: "etf", goals: ["income", "milestone"], pain: "noise", markets: ["dividend", "etf"],
    time: "t15", drawdown: "ignore", age: "a40", localrule: "tax",
    horizon: "h26", style: "read", capital: "c5", selfrate: 5, coaching: "hint"
  },
  "老手／想自己研究個股": {
    experience: "pro", goals: ["research", "allocation"], pain: "blind", markets: ["stock", "us"],
    time: "t30", drawdown: "review", age: "a30", localrule: "allok",
    horizon: "h12", style: "sim", capital: "c5up", selfrate: 9, coaching: "solo"
  }
};

const results = {};
console.log("\n=== 三種作答的結果 ===");
for (const [name, answers] of Object.entries(PROFILES)) {
  const r = SCORING.evaluate(answers, QUIZ.questions);
  results[name] = r;
  const c = CHART.growth({ readiness: r.readiness, weeks: r.weeks, timeScore: r.scores.time });
  console.log(`\n${name}`);
  console.log(`  等級 ${r.level.name} · 路徑 ${r.path.name} · ${r.weeks} 週 · 準備度 ${r.readiness}`);
  console.log(`  知識 ${r.scores.knowledge} / 風險 ${r.scores.risk} / 紀律 ${r.scores.discipline} ` +
              `/ 經驗 ${r.scores.experience} / 時間 ${r.scores.time}`);
  console.log(`  曲線終點 ${c.to}`);
}

console.log("\n=== 驗收 ===");
const vals = Object.values(results);

ok(new Set(vals.map(r => r.path.id)).size === 3, "三組作答走到三條不同的學習路徑");
ok(new Set(vals.map(r => r.readiness)).size === 3, "準備度三組都不同");
ok(new Set(vals.map(r => r.level.id)).size >= 2, "等級至少分出兩種");
ok(new Set(vals.map(r => r.weeks)).size >= 2, "預估週數至少分出兩種");

const [novice, saver, pro] = vals;
ok(novice.readiness < pro.readiness, "新手的準備度低於老手");
ok(novice.scores.knowledge < pro.scores.knowledge, "新手的知識分低於老手");
ok(novice.weeks > pro.weeks, "新手需要的週數多於老手");
ok(saver.path.id === "cashflow", "想要股利現金流 → 走存股與現金流");
ok(pro.path.id === "research", "老手想研究個股 → 走個股研究");
ok(novice.path.id === "riskFirst", "怕虧錢、一虧就想跑 → 先修風險控管");

/* 決定性：同一組作答算兩次必須一模一樣 */
const a = SCORING.evaluate(PROFILES["存股族／想要現金流"], QUIZ.questions);
const b = SCORING.evaluate(PROFILES["存股族／想要現金流"], QUIZ.questions);
ok(JSON.stringify(a) === JSON.stringify(b), "同一組作答重算的結果完全相同（沒有隨機）");

/* 分數必須落在 0–100，不能出現 120 分或負分 */
const inRange = vals.every(r => SCORING.DIMENSIONS.every(d => r.scores[d] >= 0 && r.scores[d] <= 100));
ok(inRange, "所有維度分數都在 0–100 之間");

/* 曲線不得承諾滿分 */
ok(vals.every(r => CHART.growth({ readiness: r.readiness, weeks: r.weeks, timeScore: r.scores.time }).to <= 92),
   "成長曲線終點不超過 92，不承諾滿分");

/* ---- 學習計畫：真的排得出一份帶得走的東西 ---- */
console.log("\n=== 學習計畫 ===");

const plans = {};
for (const [name, answers] of Object.entries(PROFILES)) {
  const r = results[name];
  const plan = PLAN_BUILDER.build(r, answers);
  plans[name] = plan;
  console.log(`\n${name}`);
  console.log(`  ${plan.totalWeeks} 週 · ${plan.pathName} · ${plan.rhythm.perDay}`);
  console.log(`  ${plan.counts.points} 條重點 / ${plan.counts.tasks} 項任務 / 延伸 ${plan.extras.length} 個單元`);
}

console.log("");
for (const [name, plan] of Object.entries(plans)) {
  const r = results[name];
  const M = PLAN_CONTENT[plan.pathId].modules.length;

  ok(plan.totalWeeks === r.weeks,
     `${name}：計畫週數等於測驗算出的週數（${plan.totalWeeks} 週）`);

  // 週次必須從 1 連號到底，中間不能跳號
  const nums = plan.weeks.map(w => w.n);
  ok(nums.every((v, i) => v === i + 1), `${name}：週次 1～${plan.totalWeeks} 連號沒跳號`);

  // 每一週都要有東西可做，不能排出空白週
  ok(plan.weeks.every(w => w.points.length + w.tasks.length > 0), `${name}：沒有空白的一週`);

  // 週數夠的話，六個單元都要排進去，不能有內容被吃掉
  if (r.weeks >= M) {
    const covered = new Set(plan.weeks.map(w => w.module));
    ok(covered.size === M, `${name}：${M} 個單元全部排進去了`);
    ok(plan.extras.length === 0, `${name}：週數夠，沒有被丟掉的單元`);

    // 拆成多週的單元，重點和任務不能重複也不能漏
    const mod1Points = plan.weeks.filter(w => w.module === 1).reduce((a, w) => a.concat(w.points), []);
    ok(mod1Points.length === PLAN_CONTENT[plan.pathId].modules[0].points.length,
       `${name}：單元拆成多週後，重點沒漏也沒重複`);
  } else {
    ok(plan.extras.length === M - r.weeks, `${name}：排不下的單元誠實列成延伸`);
  }

  // 檢查點只在單元的最後一週
  const checksPerModule = {};
  plan.weeks.forEach(w => { if (w.check) checksPerModule[w.module] = (checksPerModule[w.module] || 0) + 1; });
  ok(Object.values(checksPerModule).every(c => c === 1), `${name}：每個單元只有一個檢查點`);
}

/* 匯出的 Markdown 要是一份讀得懂的文件 */
const sample = Object.keys(plans)[1];
const md = PLAN_BUILDER.toMarkdown(plans[sample], results[sample]);
ok(md.includes("# 我的 " + plans[sample].totalWeeks + " 週台股學習計畫"), "Markdown 有標題");
ok((md.match(/^## 第 \d+ 週/gm) || []).length === plans[sample].totalWeeks, "Markdown 每一週都有一節");
ok(md.includes("- [ ] "), "Markdown 的任務是可勾選的清單");
ok(md.includes("不構成投資建議"), "Markdown 帶著免責聲明");
ok(md.length > 2000, `Markdown 有份量（${md.length} 字元）`);

/* 決定性：同樣的作答排出同樣的計畫 */
const p1 = PLAN_BUILDER.build(results[sample], PROFILES[sample]);
const p2 = PLAN_BUILDER.build(results[sample], PROFILES[sample]);
ok(JSON.stringify(p1) === JSON.stringify(p2), "同一組作答排出的計畫完全相同");

/* 四條路徑都要有內容，不能有哪條點進去是空的 */
Object.keys(SCORING.PATHS).forEach(id => {
  const c = PLAN_CONTENT[id];
  ok(!!c && c.modules.length >= 6 && c.modules.every(m =>
       m.why && m.points.length >= 3 && m.tasks.length >= 3 && m.check),
     `路徑「${SCORING.PATHS[id].name}」六個單元的內容都齊全`);
});

console.log(failed ? `\n✗ ${failed} 項沒過\n` : "\n全部通過\n");
process.exit(failed ? 1 : 0);
