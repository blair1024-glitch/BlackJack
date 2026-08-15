/* 證交所盤中報價代理 — Cloudflare Worker
 *
 * 為什麼需要它：證交所的 MIS 端點不回 Access-Control-Allow-Origin，
 * 瀏覽器從別的網域直接 fetch 會被 CORS 擋掉。這支就是加上 CORS 標頭轉一手。
 *
 * 部署（免費方案就夠，這種用量遠遠用不完）：
 *   1. 到 dash.cloudflare.com → Workers & Pages → Create → Worker
 *   2. 把這整個檔案貼進編輯器，Deploy
 *   3. 複製網址（像 https://xxx.workers.dev），填進 assets/config.js 的 quoteProxy
 *
 * 用法：
 *   GET /?stocks=2330,0050        自動判斷上市／上櫃（先試上市，查無再試上櫃）
 *   GET /?stocks=tse_2330,otc_6488  自己指定市場
 *
 * 注意：證交所這個端點的條款限個人非商業使用。快取設 10 秒，
 * 不要改成每秒打——那對來源不禮貌，也可能被擋。
 */

const MIS = "https://mis.twse.com.tw/stock/api/getStockInfo.jsp";
const CACHE_SECONDS = 10;
const MAX_CODES = 30;

// 允許呼叫這支 Worker 的網站。留空陣列代表不限制。
//
// 這個 repo 是公開的，所以 assets/config.js 裡的 Worker 網址等於公開，
// 任何人翻到都能拿去用你的額度。填上來源就只有自己的站呼叫得動。
const ALLOWED_ORIGINS = [
  "https://blair1024-glitch.github.io",
];

// 本機開發不管開在哪個 port 都放行，省得每次換 port 都要回來改這裡。
const ALLOW_LOCALHOST = true;

function isAllowed(origin) {
  if (ALLOWED_ORIGINS.length === 0) return true;
  if (ALLOWED_ORIGINS.includes(origin)) return true;
  if (ALLOW_LOCALHOST && /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(origin)) return true;
  return false;
}

function cors(origin) {
  // 不允許的來源回傳第一個白名單網址，瀏覽器會因為對不上而擋掉。
  // 沒有 Origin 標頭的情況（直接在網址列打開）不受 CORS 管，照樣看得到 JSON，
  // 所以 docs/deploy.md 那個用瀏覽器驗證的步驟仍然有效。
  const allow = ALLOWED_ORIGINS.length === 0
    ? "*"
    : (isAllowed(origin) ? (origin || ALLOWED_ORIGINS[0]) : ALLOWED_ORIGINS[0]);
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Max-Age": "86400",
    "Cache-Control": `public, max-age=${CACHE_SECONDS}`,
    "Content-Type": "application/json; charset=utf-8",
  };
}

function json(body, status, origin) {
  return new Response(JSON.stringify(body), { status, headers: cors(origin) });
}

/** 2330 → tse_2330.tw；已經帶 tse_/otc_ 前綴的原樣用 */
function toChannel(raw, fallbackMarket) {
  const s = String(raw).trim();
  if (/^(tse|otc)_/.test(s)) return s.endsWith(".tw") ? s : s + ".tw";
  if (!/^\d{4,6}$/.test(s)) return null;
  return `${fallbackMarket}_${s}.tw`;
}

async function query(channels) {
  const url = `${MIS}?ex_ch=${encodeURIComponent(channels.join("|"))}&json=1&delay=0`;
  const r = await fetch(url, {
    headers: {
      // MIS 會擋沒有 Referer 的請求
      "Referer": "https://mis.twse.com.tw/stock/index.jsp",
      "User-Agent": "Mozilla/5.0 (compatible; tw-stock-quiz/1.0)",
    },
    cf: { cacheTtl: CACHE_SECONDS, cacheEverything: true },
  });
  if (!r.ok) return null;
  try { return await r.json(); } catch (e) { return null; }
}

export default {
  async fetch(request) {
    const origin = request.headers.get("Origin") || "";

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: cors(origin) });
    }
    if (request.method !== "GET") {
      return json({ error: "只接受 GET" }, 405, origin);
    }

    const url = new URL(request.url);
    const raw = (url.searchParams.get("stocks") || "").split(",")
      .map(s => s.trim()).filter(Boolean).slice(0, MAX_CODES);

    if (!raw.length) {
      return json({ error: "請帶 ?stocks=2330,0050" }, 400, origin);
    }

    // 第一輪全部當上市查
    const first = raw.map(c => toChannel(c, "tse")).filter(Boolean);
    if (!first.length) return json({ error: "代號格式不對" }, 400, origin);

    let data = await query(first);
    if (!data) return json({ error: "上游沒有回應" }, 502, origin);

    const got = new Set((data.msgArray || []).map(m => m.c));

    // 上市查無的，再用上櫃試一次
    const missing = raw.filter(c => !/^(tse|otc)_/.test(c) && !got.has(c));
    if (missing.length) {
      const second = missing.map(c => toChannel(c, "otc")).filter(Boolean);
      const more = second.length ? await query(second) : null;
      if (more && more.msgArray) {
        data.msgArray = (data.msgArray || []).concat(more.msgArray);
      }
    }

    // 只回傳需要的欄位，順便把字串轉成數字
    const num = v => {
      const n = parseFloat(String(v == null ? "" : v).replace(/,/g, ""));
      return Number.isFinite(n) ? n : null;
    };
    const best = s => {           // "500.0_499.5_..." 取第一個
      const first = String(s || "").split("_")[0];
      return num(first);
    };

    const quotes = (data.msgArray || []).map(m => ({
      code: m.c,
      name: m.n,
      price: num(m.z),                    // 沒成交時是 "-"，會變成 null
      prevClose: num(m.y),
      open: num(m.o),
      high: num(m.h),
      low: num(m.l),
      volume: num(m.v),
      bid: best(m.b),
      ask: best(m.a),
      time: m.t || null,
      date: m.d || null,
    }));

    return json({
      updated: new Date().toISOString(),
      source: "臺灣證券交易所 MIS（盤中資訊，非逐筆即時）",
      quotes,
    }, 200, origin);
  },
};
