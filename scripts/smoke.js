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
  ok(await page.locator(".chart-wrap svg").isVisible(), "成長曲線畫出來了");
  const chartLabel = await page.locator(".chart-wrap svg").getAttribute("aria-label");
  ok(/不是投資報酬預測/.test(chartLabel), "曲線有標明不是報酬預測");
  ok((await page.locator(".meter").count()) === 3, "三條能力進度條都在");
  ok(!(await page.locator("#progress").isVisible()), "結果屏不再顯示題目進度條");

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
  await page.click("#again");
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
