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

// 最好的那組決策答案。不能用「最後一個選項」——第 5 題最後一項是「超過 30%」，那是硬紅旗。
const BEST = {
  motive: "etf", understand: "deep", trend: "up", position: "low",
  weight: "w5", horizon: "y5", drop: "review", exit: "rule"
};

// 從開場一路答到結果屏，供需要重跑漏斗的段落共用
async function runFunnel(page) {
  await page.click("#start");
  for (let i = 0; i < 40; i++) {
    if (await page.locator(".path-steps").count()) break;
    if (await page.locator("#nm").count()) await page.click("#skip");
    else if (await page.locator("#sr").count()) { await page.locator("#sr").fill("5"); await page.click("#next"); }
    else if (await page.locator(".option").count()) {
      const multi = (await page.locator(".option").first().getAttribute("role")) === "checkbox";
      if (multi) { await page.locator(".option").nth(0).click(); await page.click("#next"); }
      else { await page.locator(".option").nth(1).click(); await page.waitForTimeout(400); }
    } else if (await page.locator(".interstitial").count()) await page.click("#next");
    else await page.waitForTimeout(180);
    await page.waitForTimeout(50);
  }
  await page.waitForSelector(".path-steps");
}

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

  // 資料還沒抓的時候，要老實說，不能生一份假名單
  ok(/資料還沒抓/.test(await page.locator(".card").nth(1).textContent()),
     "觀察名單沒有資料時顯示誠實的空狀態");

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

  // ---- 進場檢查表：規則要存得住 ----
  await page.click("#tolist");
  await page.waitForSelector("#save");
  await page.fill("#r-amount", "NT$30,000");
  await page.fill("#r-stop", "跌破 180 或當初的理由消失");
  ok(/只存在.*這台裝置的瀏覽器/.test(await page.locator(".notice").last().textContent()),
     "有講清楚規則只存在本機瀏覽器");
  await page.click("#save");

  await page.waitForSelector(".cl");
  ok((await page.locator(".cl").count()) === 1, "存好一張檢查表");
  const clText = await page.locator(".cl").first().textContent();
  ok(/NT\$30,000/.test(clText), "檢查表記住了投入上限");
  ok(/跌破 180/.test(clText), "檢查表記住了出場條件");
  ok(/0050/.test(clText), "檢查表記住了標的");

  // 勾一個項目，重整之後要還在
  const firstCheck = page.locator(".cl-check").first();
  await firstCheck.click();
  ok((await firstCheck.getAttribute("aria-checked")) === "true", "可以勾選執行進度");

  await page.reload({ waitUntil: "domcontentloaded" });
  ok(await page.locator("#saved").isVisible(), "重整後首頁出現檢查表入口");
  await page.click("#saved");
  await page.waitForSelector(".cl");
  ok((await page.locator(".cl-check").first().getAttribute("aria-checked")) === "true",
     "勾選狀態撐過重新整理");
  ok(/NT\$30,000/.test(await page.locator(".cl").first().textContent()),
     "規則撐過重新整理");

  // 下載
  const dl3 = await Promise.all([page.waitForEvent("download"), page.click("#dl3")]);
  const st3 = await dl3[0].createReadStream();
  let md3 = "";
  for await (const c of st3) md3 += c;
  ok(md3.includes("我的進場檢查表"), "檢查表匯出得了");
  ok(md3.includes("NT$30,000"), "匯出的檔案含規則");
  ok(md3.includes("- [x] "), "匯出的檔案帶著勾選狀態");

  // 改狀態、刪除
  await page.selectOption(".cl-status", "entered");
  await page.waitForSelector(".badge-ok");
  ok(await page.locator(".badge-ok").first().isVisible(), "狀態改得動");
  await page.click(".cl-del");
  await page.waitForTimeout(200);
  ok((await page.locator(".cl").count()) === 0, "刪得掉");

  // 回到裁決頁繼續原本的流程
  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  ok((await page.locator("#saved").count()) === 0, "全部刪掉之後首頁不再顯示入口");
  await runFunnel(page);
  await page.click("#next"); await page.waitForSelector(".week");
  await page.click("#next"); await page.waitForSelector("#calc");
  for (const [qid, optId] of Object.entries(BEST)) {
    await page.locator(`[data-q="${qid}"] [data-opt="${optId}"]`).click();
  }
  await page.click("#calc");
  await page.waitForSelector(".path-steps");
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

  // ---- 觀察名單有資料時的樣子（注入假資料，不動 repo 裡的檔案）----
  await page.addInitScript(() => {
    window.__FIXTURE_SCREEN = {
      meta: { updated: "2026-08-15 15:30", sources: ["https://openapi.twse.com.tw/v1/exchangeReport/BWIBBU_ALL"], total: 1234,
              note: "本清單為公開資料的篩選結果，不是推薦名單。" },
      screens: {
        etfStart: { criteria: ["ETF（代號 00 開頭）", "日成交金額門檻"], manual: ["內扣費用要去投信官網查"],
                    items: [{ code: "0050", name: "元大台灣50", pe: null, yield: 3.2 },
                            { code: "00878", name: "國泰永續高股息", pe: null, yield: 5.6 }] },
        cashflow: { criteria: ["殖利率 ≥ 4%", "本益比 0～20"], manual: ["連續配息年數要自己查"],
                    // high/low/histDays 是 Action 累積出來的收盤價區間
                    items: [{ code: "2884", name: "玉山金", pe: 12.3, yield: 5.4,
                              high: 32.5, low: 24.1, histDays: 250 }] },
        research: { criteria: ["本益比 0～25"], manual: ["三率趨勢要自己查"],
                    items: [{ code: "2330", name: "台積電", pe: 21.5, yield: 1.8 }] },
        riskFirst: { criteria: [], manual: ["先把部位大小定下來"], items: [] }
      }
    };
  });
  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  await page.evaluate(() => { window.SCREEN = window.__FIXTURE_SCREEN; });

  // 快速走到決策工具
  await page.click("#start");
  for (let i = 0; i < 40; i++) {
    if (await page.locator(".path-steps").count()) break;
    if (await page.locator("#nm").count()) await page.click("#skip");
    else if (await page.locator("#sr").count()) { await page.locator("#sr").fill("5"); await page.click("#next"); }
    else if (await page.locator(".option").count()) {
      const multi = (await page.locator(".option").first().getAttribute("role")) === "checkbox";
      if (multi) { await page.locator(".option").nth(0).click(); await page.click("#next"); }
      else { await page.locator(".option").nth(1).click(); await page.waitForTimeout(400); }
    } else if (await page.locator(".interstitial").count()) await page.click("#next");
    else await page.waitForTimeout(180);
    await page.waitForTimeout(50);
  }
  await page.waitForSelector(".path-steps");
  await page.click("#next"); await page.waitForSelector(".week");
  await page.click("#next"); await page.waitForSelector("#calc");

  const rows = page.locator(".wl-row");
  const rowCount = await rows.count();
  ok(rowCount > 0, `觀察名單有資料時列出標的（${rowCount} 檔）`);
  ok(/資料日期 2026-08-15/.test(await page.locator(".eyebrow").nth(1).textContent()),
     "名單標出資料日期");
  const wlText = await page.locator(".card").nth(1).textContent();
  ok(/這是篩選結果，不是推薦/.test(wlText), "名單明白標示不是推薦");
  ok(/篩選條件/.test(wlText), "名單列出篩選條件");
  ok(/API 查不到/.test(wlText), "名單列出 API 查不到、要自己查的項目");
  ok(/openapi\.twse\.com\.tw/.test(wlText), "名單標出資料來源");

  await rows.first().click();
  const filled = await page.locator("#stk").inputValue();
  ok(filled.length > 0, `點名單會帶入標的欄位（${filled}）`);
  ok((await rows.first().getAttribute("class")).includes("on"), "被點選的那列有選取樣式");

  // ---- 盤中報價：預設關閉，設定之後要接得上 ----
  ok(/想看盤中報價/.test(await page.locator(".card").nth(1).textContent()),
     "沒設定代理時，名單上說明怎麼開啟報價");

  // 假裝已經部署好 Worker，攔截請求回假資料
  await page.route("**/fake-proxy**", route => route.fulfill({
    status: 200,
    contentType: "application/json",
    headers: { "Access-Control-Allow-Origin": "*" },
    body: JSON.stringify({
      updated: "2026-08-15T05:30:00.000Z",
      source: "臺灣證券交易所 MIS（盤中資訊，非逐筆即時）",
      quotes: [
        { code: "2884", name: "玉山金", price: 30.15, prevClose: 28.50,
          open: 28.6, high: 30.2, low: 28.5, volume: 12345, time: "13:30:00" },
        { code: "0050", name: "元大台灣50", price: 190.0, prevClose: 195.0,
          open: 194, high: 195, low: 189, volume: 5000, time: "13:30:00" }
      ]
    })
  }));
  await page.addInitScript(() => {
    window.__PATCH_CFG = true;
  });
  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  await page.evaluate(() => {
    window.CONFIG.quoteProxy = "https://example.invalid/fake-proxy";
    window.SCREEN = window.__FIXTURE_SCREEN;
  });
  await runFunnel(page);
  await page.click("#next"); await page.waitForSelector(".week");
  await page.click("#next"); await page.waitForSelector("#calc");

  await page.waitForSelector(".q", { timeout: 8000 });
  const qText = await page.locator(".q").first().textContent();
  ok(/30\.15/.test(qText), `名單顯示現價（${qText.trim()}）`);
  ok(/\+5\.79%/.test(qText), "算得出漲跌幅");
  ok((await page.locator(".q-up").count()) > 0, "上漲用紅色（台股慣例，不是綠色）");
  ok(/不是逐筆即時成交價/.test(await page.locator(".card").nth(1).textContent()),
     "有標明是盤中資訊不是逐筆即時");
  ok((await page.locator(".q-range-pin").count()) > 0, "有累積區間資料的標的畫出位置指示");
  ok(/累積|近一年區間/.test(await page.locator(".q-range").first().textContent()),
     "區間標明是累積幾天，不假裝一定是一年");

  const overflow2 = await page.evaluate(() =>
    document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
  ok(!overflow2, "接上報價之後仍然沒有橫向捲動");

  // 停損價比對
  for (const [qid, optId] of Object.entries(BEST)) {
    await page.locator(`[data-q="${qid}"] [data-opt="${optId}"]`).click();
  }
  await page.locator(".wl-row").first().click();
  await page.click("#calc");
  await page.waitForSelector(".path-steps");
  await page.click("#tolist");
  await page.waitForSelector("#save");
  await page.fill("#r-stopprice", "31.5");     // 高於現價 30.15 → 應該判定跌破
  await page.click("#save");
  await page.waitForSelector(".cl");
  await page.waitForSelector(".stop-hit", { timeout: 8000 });
  const hit = await page.locator(".stop-hit").textContent();
  ok(/已經跌破你設的停損價/.test(hit), "現價低於停損價時明確示警");
  ok(/30\.15/.test(hit), "示警訊息帶上現價");

  await page.locator(".cl-del").click();
  await page.waitForTimeout(200);

  // ---- 自用模式：只換措辭，判斷邏輯一個字都不能動 ----
  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  await page.evaluate(() => {
    window.CONFIG.selfUse = true;
    window.SCREEN = window.__FIXTURE_SCREEN;
  });
  await runFunnel(page);
  await page.click("#next"); await page.waitForSelector(".week");
  await page.click("#next"); await page.waitForSelector("#calc");

  const selfNotice = await page.locator(".notice").first().textContent();
  ok(/這是你自己的判斷/.test(selfNotice), "自用模式換掉法規說明");
  ok(!/證券投資顧問業務/.test(selfNotice), "自用模式不再顯示公開發布用的法律措辭");

  const selfWl = await page.locator(".card").nth(1).textContent();
  ok(/今天通過你設的條件/.test(selfWl), "自用模式的名單標題改了");
  // 這幾樣不管哪個模式都要在——它們是工程品質，不是法律措辭
  ok(/資料日期/.test(selfWl), "自用模式仍然標出資料日期");
  ok(/API 查不到/.test(selfWl), "自用模式仍然列出要自己查的項目");
  ok(/還是要跑完八題/.test(selfWl), "自用模式仍然要求逐檔跑判斷");

  // 硬紅旗不能因為自用就放行
  await page.fill("#stk", "測試");
  const boxes3 = page.locator("[data-q]");
  for (let i = 0; i < (await boxes3.count()); i++) {
    await boxes3.nth(i).locator(".option").first().click();
  }
  await page.click("#calc");
  await page.waitForSelector("h2.h1");
  ok((await page.locator("h2.h1").textContent()).trim() === "先不要買",
     "自用模式的硬紅旗照樣擋");

  ok(/不保證任何投資結果/.test(await page.locator(".site-foot").textContent()),
     "自用模式的頁尾仍然寫明不保證結果");

  ok(errors.length === 0, "沒有 console 錯誤" + (errors.length ? "：" + errors.join(" | ") : ""));

  await browser.close();
}

(async () => {
  for (const vp of VIEWPORTS) await run(vp);
  console.log(failed ? `\n✗ ${failed} 項沒過\n` : "\n全部通過\n");
  process.exit(failed ? 1 : 0);
})();
