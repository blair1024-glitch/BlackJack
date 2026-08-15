/* 介面煙霧測試：真的用瀏覽器把漏斗從頭點到尾。
   需要先開好 http server：python3 -m http.server 8899
   跑法：CHROME_PATH=/opt/pw-browsers/chromium-1194/chrome-linux/chrome node scripts/smoke.js */
"use strict";
const { chromium } = require("playwright");

const BASE = process.env.BASE || "http://127.0.0.1:8899/";
const VIEWPORTS = [
  { name: "iPhone SE", width: 375, height: 667 },
  { name: "桌機", width: 1440, height: 900 }
];

let failed = 0;
function ok(cond, msg) {
  console.log((cond ? "  ✓ " : "  ✗ ") + msg);
  if (!cond) failed++;
}

async function run(vp) {
  console.log(`\n=== ${vp.name} (${vp.width}×${vp.height}) ===`);
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH });
  const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height } });

  const errors = [];
  page.on("console", m => { if (m.type() === "error") errors.push(m.text()); });
  page.on("pageerror", e => errors.push(String(e)));

  await page.goto(BASE, { waitUntil: "domcontentloaded" });

  // ---- 開場 ----
  ok(await page.locator("#start").isVisible(), "開場屏有「開始測驗」");
  ok(!(await page.locator("#progress").isVisible()), "開場不顯示進度條");
  await page.click("#start");

  // ---- 問答：一路點到底 ----
  let guard = 0;
  let sawInterstitial = 0;
  let firstLabel = await page.locator("#progress-label").textContent();
  ok(/第 1 題 \/ 共 13 題/.test(firstLabel), `進度從第 1 題開始（${firstLabel.trim()}）`);

  while (guard++ < 40) {
    // 結果屏一出現就停手——它也有 #next，不能跟過場屏搞混
    if (await page.locator(".path-steps").count()) break;

    const slider = page.locator("#sr");
    const next = page.locator("#next");
    const options = page.locator(".option");

    if (await slider.count()) {
      await slider.fill("7");
      ok((await page.locator("#sv").textContent()).trim() === "7", "滑桿數值跟著動");
      await next.click();
    } else if (await options.count()) {
      const multi = (await options.first().getAttribute("role")) === "checkbox";
      if (multi) {
        ok(await next.isDisabled(), "多選題還沒選就不能按下一步");
        await options.first().click();
        await options.nth(1).click();
        ok(!(await next.isDisabled()), "多選題選了之後可以按下一步");
        await next.click();
      } else {
        await options.nth(1).click();
        await page.waitForTimeout(420);   // 單選 300ms 自動前進
      }
    } else if (await page.locator("#nm").count()) {
      await page.fill("#nm", "小陳");
      await page.click("#go");
    } else if (await page.locator(".interstitial").count() && await next.count()) {
      sawInterstitial++;
      await next.click();
    } else {
      await page.waitForTimeout(200);
    }
    await page.waitForTimeout(60);
  }

  ok(sawInterstitial === 3, `過場鼓勵屏出現 3 次（實際 ${sawInterstitial}）`);

  // ---- 結果屏 ----
  await page.waitForSelector(".path-steps", { timeout: 15000 });
  const badge = await page.locator(".badge").first().textContent();
  ok(!!badge, `結果屏顯示等級徽章（${badge.trim()}）`);
  ok((await page.locator("h2.h1").textContent()).includes("小陳"), "結果屏用了使用者填的稱呼");
  ok((await page.locator(".blocker").textContent()).length > 10, "有一句話點出最擋路的事");
  ok((await page.locator(".gauge-pin").count()) > 0, "準備度有色階條");
  ok(await page.locator(".chart-wrap svg").isVisible(), "成長曲線畫出來了");
  const chartLabel = await page.locator(".chart-wrap svg").getAttribute("aria-label");
  ok(/不是投資報酬預測/.test(chartLabel), "曲線有標明不是報酬預測");
  ok((await page.locator(".meter").count()) === 3, "三條能力進度條都在");
  ok(!(await page.locator("#progress").isVisible()), "結果屏不再顯示題目進度條");

  await page.click("#next");

  // ---- 完整計畫：使用者真正拿得走的東西 ----
  await page.waitForSelector(".week");
  const weekCount = await page.locator(".week").count();
  const planHead = await page.locator("h2.h1").textContent();
  const declaredWeeks = parseInt(planHead.match(/(\d+)\s*週/)[1], 10);
  ok(weekCount === declaredWeeks, `週次卡數量等於標題宣稱的週數（${weekCount} 張 / ${declaredWeeks} 週）`);
  ok((await page.locator(".week-n").first().textContent()).includes("第 1 週"), "從第 1 週開始排");
  ok((await page.locator(".task-list li").count()) > 0, "每週有可勾選的任務");
  ok((await page.locator(".week-check").count()) > 0, "有檢查點");
  ok(await page.locator("#print").isVisible(), "有列印按鈕");
  ok(await page.locator("#dl").isVisible(), "有下載按鈕");

  // 真的下載得到檔案
  const dl = await Promise.all([page.waitForEvent("download"), page.click("#dl")]);
  const fname = dl[0].suggestedFilename();
  // 檔名必須是 ASCII，Chromium 遇到中文檔名會退回成沒有副檔名的 "download"
  ok(/^tw-stock-study-plan-\d+w\.md$/.test(fname), `下載得到正確檔名（${fname}）`);
  const stream = await dl[0].createReadStream();
  let md = "";
  for await (const c of stream) md += c;
  ok(md.includes("## 第 1 週"), "下載的檔案裡有週次內容");
  ok(md.includes("不構成投資建議"), "下載的檔案帶著免責聲明");
  ok(md.length > 1500, `下載的檔案有份量（${md.length} 字元）`);

  await page.click("#next");

  // ---- 該不該買 ----
  await page.waitForSelector("#calc");
  ok(await page.locator("#calc").isDisabled(), "八題沒答完不能算");
  ok(/不推薦任何個股/.test(await page.locator(".notice").first().textContent()),
     "明講這個工具不推薦個股");

  await page.fill("#stk", "0050");
  const boxes = page.locator("[data-q]");
  const qn = await boxes.count();
  ok(qn === 8, `決策工具有 8 個問題（實際 ${qn}）`);

  // 先全選最糟的答案，應該會被擋下來
  for (let i = 0; i < qn; i++) await boxes.nth(i).locator(".option").first().click();
  ok(!(await page.locator("#calc").isDisabled()), "八題答完就能算");
  await page.click("#calc");
  await page.waitForSelector(".verdict-bad, .verdict-warn, .verdict-ok, .verdict-good");
  let verdict = (await page.locator("h2.h1").textContent()).trim();
  ok(verdict === "先不要買", `最糟的答案會被擋下來（${verdict}）`);
  ok((await page.locator(".flag-hard").count()) > 0, "有硬紅旗區塊");
  ok(/0050/.test(await page.locator(".eyebrow").first().textContent()), "裁決頁標出使用者輸入的標的");

  // 改成最好的答案，結論要跟著變。
  // 注意：不能用「最後一個選項」當成最好的——第 5 題最後一項是「超過 30%」，那是硬紅旗。
  await page.click("#redo");
  await page.waitForSelector("#calc");
  const BEST = {
    motive: "etf", understand: "deep", trend: "up", position: "low",
    weight: "w5", horizon: "y5", drop: "review", exit: "rule"
  };
  for (const [qid, optId] of Object.entries(BEST)) {
    await page.locator(`[data-q="${qid}"] [data-opt="${optId}"]`).click();
  }
  await page.click("#calc");
  await page.waitForSelector("h2.h1");
  const verdict2 = (await page.locator("h2.h1").textContent()).trim();
  ok(verdict2 !== verdict, `換答案結論就變（${verdict} → ${verdict2}）`);
  ok((await page.locator(".path-steps li").count()) >= 4, "給了具體操作步驟");
  ok((await page.locator(".week-list li").count()) >= 4, "附上觀察名單的篩選條件");

  // 裁決頁下載的檔案要同時包含週計畫與判斷紀錄
  const dl2 = await Promise.all([page.waitForEvent("download"), page.click("#dl2")]);
  const st2 = await dl2[0].createReadStream();
  let md2 = "";
  for await (const c of st2) md2 += c;
  ok(md2.includes("## 第 1 週"), "下載的檔案仍有週計畫");
  ok(md2.includes("「該不該買」判斷紀錄"), "下載的檔案含判斷紀錄");
  ok(md2.includes("0050"), "判斷紀錄標出使用者輸入的標的");
  ok(md2.includes("需金管會核發執照"), "檔案裡寫明本站不推薦個股的原因");
  ok(md2.includes("小陳的"), "檔案標題用了使用者的稱呼");
  ok(md2.length > md.length, `含判斷的檔案比純計畫長（${md.length} → ${md2.length}）`);

  await page.click("#next");

  // ---- Email 驗證 ----
  await page.waitForSelector("#email");
  await page.fill("#email", "不是信箱");
  await page.click("#send");
  ok(await page.locator("#email-err").isVisible(), "Email 格式錯誤會擋下來");
  await page.fill("#email", "test@example.com");
  await page.click("#send");
  ok(await page.locator("#email-err").isVisible(), "沒勾同意也會擋下來");
  await page.check("#consent");
  await page.click("#send");

  // ---- 方案 ----
  await page.waitForSelector("#plans");
  const cd = await page.locator("#countdown").textContent();
  ok(/首購優惠剩/.test(cd), `倒數計時在跑（${cd.trim()}）`);
  ok((await page.locator("[data-plan]").count()) === 2, "兩個方案卡");
  ok(/自動續訂/.test(await page.locator(".notice").first().textContent()), "續訂條款有寫出來");
  ok(/示範/.test(await page.locator(".card").last().textContent()), "評價標示為示範資料");

  await page.click('[data-plan="p4"]');
  ok((await page.locator('[data-plan="p4"]').getAttribute("aria-checked")) === "true", "方案可以切換");

  await page.click("#buy");
  await page.waitForSelector("#again");
  ok(await page.locator("#again").isVisible(), "結帳後到成功屏");

  // ---- 返回鍵 ----
  await page.click("#toplan");
  await page.waitForSelector(".week");
  ok(true, "成功屏可以回到完整計畫");
  await page.click("#back-btn");           // 計畫 → 結果
  await page.waitForSelector(".path-steps");
  await page.click("#next");               // 結果 → 計畫
  await page.waitForSelector(".week");
  ok(true, "計畫與結果之間可以來回");

  await page.click("#next");
  await page.waitForSelector("#calc");
  ok(true, "計畫可以走到決策工具");
  await page.click("#back-btn");
  ok(await page.locator(".week").count() > 0, "決策工具返回會回到完整計畫");

  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  await page.click("#start");
  await page.locator(".option").nth(0).click();
  await page.waitForTimeout(420);
  const before = await page.locator("#progress-label").textContent();
  await page.click("#back-btn");
  await page.waitForTimeout(150);
  const after = await page.locator("#progress-label").textContent();
  ok(before !== after, `返回鍵可以回上一題（${before.trim()} → ${after.trim()}）`);

  // ---- 版面不能橫向溢出 ----
  const overflow = await page.evaluate(() =>
    document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
  ok(!overflow, "沒有橫向捲動");

  ok(errors.length === 0, "沒有 console 錯誤" + (errors.length ? "：" + errors.join(" | ") : ""));

  await browser.close();
}

(async () => {
  for (const vp of VIEWPORTS) await run(vp);
  console.log(failed ? `\n✗ ${failed} 項沒過\n` : "\n全部通過\n");
  process.exit(failed ? 1 : 0);
})();
