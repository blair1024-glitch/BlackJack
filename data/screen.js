/* 觀察名單 — 由 .github/workflows/update-screen.yml 每個交易日收盤後自動覆寫。
   這個檔案是佔位版本：在 Action 第一次跑起來之前，網站會顯示「資料還沒抓」的說明，
   而不是假裝有名單。手動改這裡沒有意義，下次 Action 執行就會被蓋掉。 */
window.SCREEN = {
  "meta": {
    "updated": null,
    "sources": [],
    "total": 0,
    "note": "本清單為公開資料的篩選結果，不是推薦名單。"
  },
  "screens": {}
};
