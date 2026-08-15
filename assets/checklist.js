/* 起手式 — 進場前檢查表
   決策工具算出結論之後，規則如果只留在腦子裡，下次打開就不見了。
   這支把規則存進 localStorage，讓它下次還在。

   只存在這台裝置的瀏覽器：沒有帳號、沒有後端、沒有同步。
   清瀏覽器資料就會消失——所以畫面上要講清楚，並且提供匯出。 */
(function (global) {
  "use strict";

  var KEY = "fm-checklists";
  var MAX = 20;   // 存太多就失去「一張表對一個決定」的意義

  var STATUS = {
    planning: { id: "planning", label: "還沒進場", tone: "warn" },
    entered:  { id: "entered",  label: "已進場",   tone: "ok" },
    done:     { id: "done",     label: "已結束",   tone: "muted" },
    dropped:  { id: "dropped",  label: "放棄了",   tone: "muted" }
  };

  function read() {
    try {
      var raw = localStorage.getItem(KEY);
      var arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr : [];
    } catch (e) { return []; }   // 無痕模式、file://、或資料壞掉
  }

  function write(items) {
    try {
      localStorage.setItem(KEY, JSON.stringify(items.slice(0, MAX)));
      return true;
    } catch (e) { return false; }
  }

  /* 從決策結果生一張新的檢查表。規則欄位先用決策算出的建議填好，
     使用者可以改——改過的才是他自己的規則。 */
  function makeItem(opts) {
    var d = opts.decision || {};
    var now = new Date();
    return {
      id: "c" + now.getTime().toString(36),
      stock: opts.stock || "未指名的標的",
      pathId: opts.pathId || "",
      createdAt: now.getFullYear() + "-" +
                 String(now.getMonth() + 1).padStart(2, "0") + "-" +
                 String(now.getDate()).padStart(2, "0"),
      verdict: d.verdict ? d.verdict.id : "",
      verdictLabel: d.verdict ? d.verdict.label : "",
      score: d.score == null ? null : d.score,
      status: "planning",
      rules: {
        amount: opts.rules && opts.rules.amount || "",
        batches: opts.rules && opts.rules.batches || "",
        stop: opts.rules && opts.rules.stop || "",
        review: opts.rules && opts.rules.review || ""
      },
      checks: (opts.steps || []).map(function (st) {
        return { head: st.head, done: false };
      })
    };
  }

  function add(item) {
    var items = read();
    items.unshift(item);
    write(items);
    return items;
  }

  function update(id, patch) {
    var items = read().map(function (it) {
      if (it.id !== id) return it;
      var next = JSON.parse(JSON.stringify(it));
      Object.keys(patch || {}).forEach(function (k) { next[k] = patch[k]; });
      return next;
    });
    write(items);
    return items;
  }

  function remove(id) {
    var items = read().filter(function (it) { return it.id !== id; });
    write(items);
    return items;
  }

  function clear() { write([]); return []; }

  /* 匯出成 Markdown，讓這些規則不會被綁死在一台裝置上 */
  function toMarkdown(items) {
    if (!items || !items.length) return "";
    var L = ["## 我的進場檢查表", ""];
    items.forEach(function (it) {
      L.push("### " + it.stock + "　（" + (STATUS[it.status] || {}).label + "）");
      L.push("");
      L.push("- 建立日期：" + it.createdAt);
      if (it.verdictLabel) {
        L.push("- 當時的判斷：" + it.verdictLabel +
               (it.score == null ? "" : "（完備度 " + it.score + "）"));
      }
      L.push("");
      L.push("**我寫下的規則**");
      L.push("");
      L.push("- 這筆最多投入：" + (it.rules.amount || "（沒寫）"));
      L.push("- 分批計畫：" + (it.rules.batches || "（沒寫）"));
      L.push("- 出場條件：" + (it.rules.stop || "（沒寫）"));
      L.push("- 什麼時候回來檢查：" + (it.rules.review || "（沒寫）"));
      L.push("");
      if (it.checks && it.checks.length) {
        L.push("**執行進度**");
        L.push("");
        it.checks.forEach(function (c) {
          L.push("- [" + (c.done ? "x" : " ") + "] " + c.head);
        });
        L.push("");
      }
    });
    L.push("> 規則是在冷靜的時候訂的。改規則可以，但要在沒有部位壓力的時候改，");
    L.push("> 不要在虧損的當下改。");
    L.push("");
    return L.join("\n");
  }

  global.CHECKLIST = {
    KEY: KEY, MAX: MAX, STATUS: STATUS,
    all: read, add: add, update: update, remove: remove, clear: clear,
    makeItem: makeItem, toMarkdown: toMarkdown
  };
})(typeof window !== "undefined" ? window : globalThis);
