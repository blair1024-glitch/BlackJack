/* 體質速讀的離線測試：不開瀏覽器、不連網。
   驗的是「同樣的數字永遠推出同樣的解讀」，以及分類邊界對不對。
   跑法：node scripts/test_analysis.js */
"use strict";
const path = require("path");
const vm = require("vm");
const fs = require("fs");

const sandbox = { window: {}, console };
sandbox.window.window = sandbox.window;
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "assets", "analysis.js"), "utf8"),
                sandbox, { filename: "analysis.js" });
const A = sandbox.window.ANALYSIS;

let failed = 0;
function ok(cond, msg) {
  console.log((cond ? "  ✓ " : "  ✗ ") + msg);
  if (!cond) failed++;
}

/* 這 12 檔是 2026-08-16 那次 Action 真的抓回來的數字 */
const PEERS = [
  { code: "2408", name: "南亞科", pe: 19.87, pb: 5.48, yield: 0.26 },
  { code: "2344", name: "華邦電", pe: 20.23, pb: 5.00, yield: 0.27 },
  { code: "3231", name: "緯創",   pe: 15.37, pb: 3.17, yield: 2.84 },
  { code: "2324", name: "仁寶",   pe: 21.71, pb: 1.33, yield: 2.55 },
  { code: "6669", name: "緯穎",   pe: 20.63, pb: 8.76, yield: 2.55 },
  { code: "2357", name: "華碩",   pe: 14.56, pb: 2.45, yield: 4.22 },
  { code: "2382", name: "廣達",   pe: 14.27, pb: 5.18, yield: 4.76 },
  { code: "2303", name: "聯電",   pe: 18.20, pb: 3.42, yield: 2.16 },
  { code: "2317", name: "鴻海",   pe: 17.11, pb: 1.91, yield: 2.76 },
  { code: "3008", name: "大立光", pe: 24.52, pb: 3.15, yield: 1.74 },
  { code: "3533", name: "嘉澤",   pe: 20.97, pb: 4.72, yield: 2.03 },
  { code: "2376", name: "技嘉",   pe: 18.57, pb: 4.12, yield: 3.02 },
];
const by = {};
PEERS.forEach(r => { by[r.code] = r; });

console.log("\n=== 股東權益報酬率的推算 ===");
// 股價淨值比 = 本益比 × ROE，所以 ROE = PB / PE
ok(Math.abs(A.roeOf({ pe: 10, pb: 2 }) - 20) < 0.001, "PE 10、PB 2 推出 ROE 20%");
ok(Math.abs(A.roeOf(by["6669"]) - 42.46) < 0.05, "緯穎 42.5%");
ok(Math.abs(A.roeOf(by["2324"]) - 6.13) < 0.05, "仁寶 6.1%");
ok(A.roeOf({ pe: null, pb: 2 }) === null, "缺本益比就回 null，不猜");
ok(A.roeOf({ pe: 10, pb: null }) === null, "缺股價淨值比就回 null");
ok(A.roeOf({ pe: -5, pb: 2 }) === null, "本益比是負的（虧損）不推算");

console.log("\n=== 四象限的邊界 ===");
const T = A.THRESHOLDS;
ok(A.quadrantOf(T.PE_LOW, T.ROE_HIGH).id === "cyclicalPeak", "高報酬 + 低估值 → 不信獲利能持續");
ok(A.quadrantOf(T.PE_HIGH + 1, T.ROE_HIGH).id === "growth", "高報酬 + 高估值 → 成長定價");
ok(A.quadrantOf(T.PE_HIGH + 1, T.ROE_LOW - 1).id === "turnaround", "低報酬 + 高估值 → 賭轉機");
ok(A.quadrantOf(T.PE_LOW, T.ROE_LOW - 1).id === "valueTrap", "低報酬 + 低估值 → 價值陷阱區");
ok(A.quadrantOf(17, 15).id === "balanced", "中間地帶 → 大致相稱");
ok(A.quadrantOf(null, 20) === null, "缺資料回 null");

console.log("\n=== 真實資料落點 ===");
const got = {};
PEERS.forEach(r => { got[r.code] = A.profile(r, PEERS); });
PEERS.forEach(r => {
  const p = got[r.code];
  console.log(`  ${r.code} ${r.name.padEnd(4)} ROE ${p.roe.toFixed(1).padStart(5)}%  ${p.quadrant.id}`);
});
console.log("");
ok(got["2324"].quadrant.id === "turnaround", "仁寶（ROE 6.1%、本益比 21.71）判為賭轉機");
ok(got["6669"].quadrant.id === "growth", "緯穎（ROE 42.5%、本益比 20.63）判為成長定價");
ok(got["2382"].quadrant.id === "cyclicalPeak", "廣達（ROE 36.3%、本益比 14.27）判為市場不信獲利能持續");

console.log("\n=== 溢價判讀 ===");
ok(got["6669"].premium && /帳面溢價偏高/.test(got["6669"].premium.head), "緯穎股價淨值比 8.76 標為高溢價");
ok(got["2408"].premium && /帳面溢價偏高/.test(got["2408"].premium.head), "南亞科 5.48 也標為高溢價");
ok(got["2317"].premium === null, "鴻海 1.91 落在中間，不特別標");
const cheap = A.profile({ code: "2536", pe: 5.01, pb: 0.54, yield: 9.62 }, []);
ok(cheap.premium && /低於帳面淨值/.test(cheap.premium.head), "宏普 0.54 標為低於帳面淨值");
ok(/早年取得的土地/.test(cheap.premium.body), "低於淨值時說明兩種可能，不直接說便宜");

console.log("\n=== 配息判讀 ===");
ok(got["2408"].payout && /賺得多、配得少/.test(got["2408"].payout.head),
   "南亞科 ROE 27.6%、殖利率 0.26% → 賺得多配得少");
ok(got["2382"].payout && /又賺錢又配息/.test(got["2382"].payout.head),
   "廣達 ROE 36.3%、殖利率 4.76% → 又賺錢又配息");
const bleeding = A.profile({ code: "9999", pe: 30, pb: 1.5, yield: 7 }, []);
ok(bleeding.payout && /賺得少、配得多/.test(bleeding.payout.head),
   "ROE 5%、殖利率 7% → 賺得少配得多");
ok(/配發率/.test(bleeding.payout.body), "提醒去查配發率");

console.log("\n=== 相對位置 ===");
ok(got["6669"].ranks.roe.rank === 1, "緯穎 ROE 排第 1");
ok(got["2324"].ranks.roe.rank === 12, "仁寶 ROE 排第 12（墊底）");
ok(got["2382"].ranks.pe.rank === 1, "廣達本益比最低，由低到高排第 1");
ok(got["2382"].ranks.yield.rank === 1, "廣達殖利率最高排第 1");
ok(A.rankIn([{ code: "a", pe: 1 }], "a", "pe", false) === null, "同儕不足三檔就不給排名");

console.log("\n=== 不做的事 ===");
const all = JSON.stringify(A);
ok(!/建議買進|該買|值得買|必買|快買|賣出訊號/.test(all),
   "整份判讀沒有任何買賣指令的字眼");
ok(Object.values(A.QUADRANTS).every(q => q.ask && q.ask.length > 10),
   "每個象限都給出「該去查什麼」，不是只下標籤");
ok(/近四季獲利/.test(got["2408"].caveat) && /循環/.test(got["2408"].caveat),
   "警語說明推算的是過去的報酬率，且點名循環股要小心");

console.log("\n=== 推導出來的每股數字 ===");
const cp = A.profile({ code: "2324", pe: 21.71, pb: 1.33, yield: 2.55, close: 43.2 }, []);
ok(Math.abs(cp.eps - 1.99) < 0.01, "每股盈餘 = 股價 ÷ 本益比");
ok(Math.abs(cp.bps - 32.48) < 0.01, "每股淨值 = 股價 ÷ 股價淨值比");
ok(Math.abs(cp.earningsYield - 4.61) < 0.01, "盈餘殖利率 = 1 ÷ 本益比");
// 配發率 = 每股股利/每股盈餘 = (殖利率×股價)/(股價/本益比) = 殖利率 × 本益比
ok(Math.abs(cp.payoutRatio - 55.36) < 0.05, "配發率 = 殖利率 × 本益比");
ok(A.payoutRatio(null, 10) === null && A.payoutRatio(3, 0) === null, "缺數字就不推算配發率");
ok(/撐不久/.test(A.profile({ pe: 20, pb: 2, yield: 6, close: 100 }, []).payoutRatioNote),
   "配發率超過 100% 會說撐不久");
ok(/再投資報酬率/.test(A.profile({ pe: 20, pb: 5, yield: 0.5, close: 100 }, []).payoutRatioNote),
   "配發率過低會問再投資報酬率");

console.log("\n=== 每個象限都要有 needs 與求證清單 ===");
Object.values(A.QUADRANTS).forEach(q => {
  ok(Array.isArray(q.needs) && q.needs.length >= 2, `${q.id} 說明需要什麼樣的持有者`);
  ok(Array.isArray(q.verify) && q.verify.length >= 2, `${q.id} 給出要求證的事`);
  ok(q.verify.every(v => v.what && v.where && v.pass),
     `${q.id} 每一項都有「查什麼／去哪查／怎樣算過關」`);
});

console.log("\n=== 體質 × 答案的對照 ===");
const turnaround = A.profile(by["2324"], PEERS);      // 賭轉機
const cyclical = A.profile(by["2382"], PEERS);        // 市場不信獲利能持續
const growth = A.profile(by["6669"], PEERS);          // 成長定價

let m = A.matchWith(turnaround, { understand: "vague", trend: "unchecked" });
ok(m.conflicts.length === 2, "賭轉機 + 說不出它靠什麼賺錢 + 沒查三率 → 兩處錯配");
ok(/建立在轉機上/.test(m.conflicts[0].head), "點出價格建立在轉機上");

m = A.matchWith(turnaround, { understand: "deep", trend: "up" });
ok(m.conflicts.length === 0 && m.fits.length === 1, "同一檔換成有做功課的人 → 沒有錯配");

m = A.matchWith(cyclical, { drop: "panic", exit: "none" });
ok(m.conflicts.length === 2, "循環高點 + 跌 20% 會賣 + 沒寫出場條件 → 兩處錯配");
ok(/跌幅通常不只 20%/.test(m.conflicts[0].body), "說明循環反轉跌幅會更深");

m = A.matchWith(growth, { horizon: "y1" });
ok(m.conflicts.some(c => /一年內要用/.test(c.head)), "成長定價 + 錢一年內要用 → 錯配");
m = A.matchWith(growth, { horizon: "y5" });
ok(m.fits.some(f => /五年以上/.test(f.head)), "成長定價 + 錢放得久 → 對得上");

// 高溢價 × 重押
m = A.matchWith(growth, { weight: "w30up" });
ok(m.conflicts.some(c => /不該押這麼重/.test(c.head)), "股價淨值比 8.76 + 押超過三成 → 錯配");
m = A.matchWith(growth, { weight: "w5" });
ok(m.fits.some(f => /5% 以內/.test(f.head)), "高溢價 + 小部位 → 對得上");

// 為了領息而買
m = A.matchWith(A.profile(by["2408"], PEERS), { motive: "income" });
ok(m.conflicts.some(c => /殖利率只有/.test(c.head)),
   "為了領息買南亞科（殖利率 0.26%）→ 目的與標的對不上");
m = A.matchWith(A.profile(by["2382"], PEERS), { motive: "income" });
ok(m.fits.some(f => /配得起/.test(f.body)), "廣達殖利率 4.76%、配發率合理 → 對得上");

ok(A.matchWith(null, {}) === null && A.matchWith(turnaround, null) === null,
   "缺任何一邊就不給對照，不硬湊");

console.log("\n=== 決定性 ===");
ok(JSON.stringify(A.profile(by["2408"], PEERS)) === JSON.stringify(A.profile(by["2408"], PEERS)),
   "同樣的輸入永遠推出同樣的判讀");

console.log(failed ? `\n✗ ${failed} 項沒過\n` : "\n全部通過\n");
process.exit(failed ? 1 : 0);
