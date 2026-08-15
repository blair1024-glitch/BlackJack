/* 起手式 — 本機設定
   這是唯一需要手動編輯的檔案。 */
window.CONFIG = {

  /* 盤中報價代理的網址。留空就不抓報價，網站其他功能照常運作。
     部署方式看 worker/quote-proxy.js 開頭的說明，Cloudflare 免費方案就夠。
     例："https://tw-quote.你的帳號.workers.dev" */
  quoteProxy: "",

  /* 幾秒重抓一次。證交所那個端點是給人看的，不要調到個位數。 */
  refreshSeconds: 15,

  /* 盤中時段（台北時間）。非交易時段不輪詢，省得白打。 */
  marketOpen: "09:00",
  marketClose: "13:35"
};
