# 部署指南

從零到跑起來。整份大概二十分鐘，其中十五分鐘在等 Cloudflare 建站。

---

## 先決定：這個站要放哪裡

**這一步會卡住很多人**：GitHub Pages 在**私有 repo 上需要付費方案**（Pro 以上）。
所以「把 repo 轉 private」和「GitHub Pages 網址還能用」在免費帳號下不能並存。

| 託管方式 | 私有 repo | 費用 | 能不能鎖存取 | 適合 |
| --- | --- | --- | --- | --- |
| **Cloudflare Pages** | ✅ 支援 | 免費 | ✅ Zero Trust Access | **自用，推薦** |
| GitHub Pages | ❌ 要 Pro | 免費／$4 每月 | ❌ 只能靠網址沒人知道 | 公開發布 |
| 本機 | — | 免費 | ✅ 根本沒對外 | 只在電腦上用 |

反正報價代理要開 Cloudflare 帳號，用 Cloudflare Pages 等於一個帳號解決兩件事，
而且 Access 是真的把網站鎖起來，不是靠「沒人知道網址」。

---

## 一、報價代理（Cloudflare Worker）

沒有這一步網站也能跑，只是看不到盤中報價。

### 1. 註冊 Cloudflare

<https://dash.cloudflare.com> — 免費方案，不需要信用卡。

### 2. 建立 Worker

左側 **Workers & Pages** → **Create** → **Workers** → **Start with Hello World**
→ 取個名字（例如 `tw-quote`）→ **Deploy**

第一次會要你選一個 `workers.dev` 子網域。選好之後網址固定是：

```
https://tw-quote.<你的子網域>.workers.dev
```

### 3. 貼上程式碼

剛部署好的頁面按 **Edit code** → 把編輯器裡的預設內容**全部刪掉**
→ 貼上 [`worker/quote-proxy.js`](../worker/quote-proxy.js) 的完整內容 → 右上角 **Deploy**

<details>
<summary>不想用網頁編輯器？用 CLI</summary>

```bash
cd worker
npx wrangler login
npx wrangler deploy
```

`wrangler.toml` 已經在 repo 裡了，不含任何帳號資訊。

</details>

### 4. 驗證（這步別跳過）

直接在瀏覽器打開：

```
https://tw-quote.<你的子網域>.workers.dev/?stocks=2330,0050
```

應該看到 JSON，裡面有 `quotes` 陣列，每筆有 `price`、`prevClose`、`name`。

**非交易時段也會有資料**（顯示最後收盤），所以隨時都能測。

### 5. 填進設定

編輯 [`assets/config.js`](../assets/config.js)：

```js
quoteProxy: "https://tw-quote.你的子網域.workers.dev",
```

手機上可以用 GitHub 網頁版改：進 repo → `assets/config.js` → 右上角鉛筆 → Commit。

### 6.（選用）限制只有自己的站能呼叫

`worker/quote-proxy.js` 最上面：

```js
const ALLOWED_ORIGINS = [
  "https://你的網站.pages.dev",
  "http://127.0.0.1:8899",      // 本機開發也要加，不然本機會被擋
];
```

留空陣列代表不限制。這支只轉發公開資料，被別人用走最多是耗你的額度——
免費方案一天十萬次請求，這種用量大概用掉千分之一。

---

## 二、網站（Cloudflare Pages）

### 1. 建立 Pages 專案

**Workers & Pages** → **Create** → **Pages** → **Connect to Git**
→ 授權 GitHub → 選 `BlackJack` repo

### 2. 建置設定

這是純靜態站，**沒有 build 步驟**：

| 欄位 | 填什麼 |
| --- | --- |
| Framework preset | None |
| Build command | **留空** |
| Build output directory | `/` |
| Root directory | **留空** |

按 **Save and Deploy**，一兩分鐘後會給你 `https://<專案名>.pages.dev`。

之後每次 push 到分支都會自動重新部署。

### 3. 鎖起來（自用的話一定要做）

Pages 預設是公開的。要限定只有你看得到：

**Zero Trust** → **Access** → **Applications** → **Add an application** → **Self-hosted**

| 欄位 | 填什麼 |
| --- | --- |
| Application domain | 你的 `xxx.pages.dev` |
| Policy name | 隨便，例如 `only me` |
| Action | Allow |
| Include | Emails → 填你自己的 email |

存檔之後，任何人開那個網址都要先收驗證碼才進得去。免費方案含 50 個使用者，
你一個人用綽綽有餘。

---

## 三、轉成自用模式

**順序很重要**，先確認網站真的鎖起來了，再開這個開關。

1. 確認 Cloudflare Access 已經生效（用無痕視窗開網址，應該要求驗證）
2. **關掉 GitHub Pages**：Settings → Pages → Source 設成 **None**
   （不然舊網址還開著，鎖了新的等於沒鎖）
3.（選用）Settings → General → Danger Zone → Change visibility → **Private**
4. 編輯 `assets/config.js`：

```js
selfUse: true
```

打開之後只有**措辭**會變，判斷邏輯一個字都沒動——硬紅旗照樣擋、資料日期照樣標、
報價照樣標明不是逐筆即時。詳見 README 的「自用模式」章節。

---

## 四、資料更新（GitHub Actions）

觀察名單由 [`.github/workflows/update-screen.yml`](../.github/workflows/update-screen.yml)
在每個交易日 15:30（台北時間）自動更新。

第一次要手動跑一次，不然名單是空的：

**Actions** → 左側 **更新觀察名單** → **Run workflow**

建議先勾 **probe** 跑一次，只探測端點通不通、不寫檔。確認四個來源都通了，
再跑一次不勾 probe 的正式版。

> `data/history.json` 的收盤價是**一天累積一筆**。從零開始要 250 個交易日
> 才滿一年，所以初期畫面上會寫「累積 N 個交易日的區間」而不是「近一年區間」。
> 這是刻意的，不會假裝資料比實際多。

---

## 常見問題

**`{"error":"上游沒有回應"}`**
證交所端擋了或暫時不通。等幾分鐘再試。這個端點限個人非商業使用，
不要把 `CACHE_SECONDS` 或 `refreshSeconds` 調低。

**畫面上報價一直是「…」**
開瀏覽器主控台看有沒有 CORS 錯誤。多半是 `ALLOWED_ORIGINS` 填了但漏掉目前的網址
（例如本機測試忘了加 `http://127.0.0.1:8899`）。

**GitHub Pages 突然 404**
repo 轉 private 了，而帳號是免費方案。改用 Cloudflare Pages，或把 repo 轉回 public。

**名單顯示「資料還沒抓」**
Action 還沒跑過。照上面第四節手動觸發一次。

**Action 跑完但名單還是空的**
看 Action 的 log。如果四個來源全部失敗，端點可能改名了——
`scripts/fetch_screen.py` 的 `SOURCES` 每組都有多個候選網址，加一個新的進去。

---

## 我沒辦法幫你驗的部分

開發這個站的環境有網路政策，擋掉了 `mis.twse.com.tw` 和 `openapi.twse.com.tw`。
所以以下兩段**沒有實際連線測試過**：

- Worker 到證交所 MIS 的請求（第一節第 4 步）
- `scripts/fetch_screen.py` 到 TWSE／TPEx OpenAPI 的請求（第四節）

驗證過的是它們的**解析與篩選邏輯**——用假資料跑了 47 項離線測試，
以及前端在拿到報價之後的行為（漲跌計算、紅漲綠跌、停損比對）。

實際端點通不通，要等你跑第一節第 4 步和第四節的 probe 才知道。
有錯誤訊息就貼出來。
