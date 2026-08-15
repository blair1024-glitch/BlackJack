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

for (const f of ["quiz-data.js", "scoring.js", "chart.js"]) {
  const src = fs.readFileSync(path.join(__dirname, "..", "assets", f), "utf8");
  vm.runInContext(src, sandbox, { filename: f });
}

const { QUIZ, SCORING, CHART } = sandbox.window;

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

console.log(failed ? `\n✗ ${failed} 項沒過\n` : "\n全部通過\n");
process.exit(failed ? 1 : 0);
