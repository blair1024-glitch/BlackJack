/* 起手式 — 盤中報價
   透過自己部署的 Cloudflare Worker 取得證交所盤中資訊（見 worker/quote-proxy.js）。
   沒設定代理網址就整支停用，網站其他功能照常。

   這是盤中資訊不是逐筆即時，會有數秒到十幾秒的落差。畫面上要標明時間，
   不要讓人以為是即時成交價。 */
(function (global) {
  "use strict";

  var CFG = global.CONFIG || {};
  var cache = {};        // code -> { at, quote }
  var inflight = null;

  function enabled() {
    return !!(CFG.quoteProxy && String(CFG.quoteProxy).trim());
  }

  /* 台北時間的交易時段判斷。使用者的裝置時區可能不是台北，所以自己換算。 */
  function taipeiMinutes() {
    var now = new Date();
    var utc = now.getTime() + now.getTimezoneOffset() * 60000;
    var tpe = new Date(utc + 8 * 3600000);
    return { minutes: tpe.getHours() * 60 + tpe.getMinutes(), day: tpe.getDay() };
  }

  function parseHM(s, fallback) {
    var m = /^(\d{1,2}):(\d{2})$/.exec(String(s || ""));
    return m ? Number(m[1]) * 60 + Number(m[2]) : fallback;
  }

  function marketOpen() {
    var t = taipeiMinutes();
    if (t.day === 0 || t.day === 6) return false;          // 週末不開盤
    var o = parseHM(CFG.marketOpen, 9 * 60);
    var c = parseHM(CFG.marketClose, 13 * 60 + 35);
    return t.minutes >= o && t.minutes <= c;
  }

  function fresh(code) {
    var hit = cache[code];
    if (!hit) return null;
    var ttl = (CFG.refreshSeconds || 15) * 1000;
    return (Date.now() - hit.at) < ttl ? hit.quote : null;
  }

  /* 抓一批報價。任何失敗都回空物件，不丟例外——報價掛掉不該讓整頁壞掉。 */
  function fetchQuotes(codes) {
    if (!enabled() || !codes || !codes.length) return Promise.resolve({});

    var need = [], out = {};
    codes.forEach(function (c) {
      var f = fresh(c);
      if (f) out[c] = f; else need.push(c);
    });
    if (!need.length) return Promise.resolve(out);

    var url = String(CFG.quoteProxy).replace(/\/+$/, "") +
              "?stocks=" + encodeURIComponent(need.join(","));

    inflight = fetch(url, { mode: "cors" })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (data) {
        if (!data || !data.quotes) return out;
        data.quotes.forEach(function (q) {
          // 沒成交價時退回最佳買價，再退回昨收，並標明用了哪一個
          var px = q.price, basis = "成交";
          if (px == null) { px = q.bid; basis = "買價"; }
          if (px == null) { px = q.prevClose; basis = "昨收"; }

          var quote = {
            code: q.code, name: q.name, price: px, basis: basis,
            prevClose: q.prevClose, high: q.high, low: q.low,
            volume: q.volume, time: q.time, date: q.date,
            change: (px != null && q.prevClose) ? px - q.prevClose : null,
            changePct: (px != null && q.prevClose)
              ? ((px - q.prevClose) / q.prevClose) * 100 : null,
            source: data.source || "",
            fetchedAt: data.updated || null
          };
          cache[q.code] = { at: Date.now(), quote: quote };
          out[q.code] = quote;
        });
        return out;
      })
      .catch(function () { return out; });

    return inflight;
  }

  global.QUOTE = {
    enabled: enabled,
    marketOpen: marketOpen,
    fetch: fetchQuotes,
    cached: fresh,
    /* 台股慣例：漲紅跌綠。跟美股相反，改的時候別改反了。 */
    toneOf: function (change) {
      if (change == null || change === 0) return "flat";
      return change > 0 ? "up" : "down";
    }
  };
})(typeof window !== "undefined" ? window : globalThis);
