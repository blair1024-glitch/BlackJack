/* 起手式 — 個股體質速讀
 *
 * 全部從證交所公開的兩個數字推導：股價淨值比 ÷ 本益比 = 股東權益報酬率。
 * 不需要翻財報，也不需要即時報價。同樣輸入永遠同樣輸出。
 *
 * 這裡給的是「數字說了什麼」與「該追問什麼」，不是買賣建議。
 * 差別在於：每一句話都能指回它是從哪個數字推出來的。
 */
(function (global) {
  "use strict";

  /* 股價淨值比 = 本益比 × 股東權益報酬率，所以 ROE = PB / PE。
     兩者缺一就算不出來（ETF 沒有這些欄位）。 */
  function roeOf(row) {
    if (!row || row.pe == null || row.pb == null) return null;
    if (row.pe <= 0 || row.pb <= 0) return null;
    return (row.pb / row.pe) * 100;
  }

  var ROE_HIGH = 20, ROE_LOW = 10;
  var PE_HIGH = 20, PE_LOW = 15;

  /* 估值與獲利能力的四個象限。
     每一格講的是「市場在說什麼」，以及據此你該去查什麼。 */
  var QUADRANTS = {
    cyclicalPeak: {
      id: "cyclicalPeak",
      title: "高報酬、低估值——市場不相信這個獲利能持續",
      why: "股東權益報酬率不低，本益比卻壓在低檔。這個組合最常出現在" +
           "景氣循環股的獲利高點：分子（獲利）在頂點，所以本益比看起來便宜。",
      ask: "拉出近五年的每股盈餘。如果今年是個突出的異常值，那現在的本益比是假的便宜。"
    },
    growth: {
      id: "growth",
      title: "高報酬、高估值——市場認為這個獲利能持續甚至成長",
      why: "市場願意用高倍數買它，代表預期這個賺錢能力不只是一時的。" +
           "你買的是未來，不是現在的獲利。",
      ask: "確認高報酬是靠本業還是靠財務槓桿——去查負債比。借錢也能把股東權益報酬率撐高。"
    },
    turnaround: {
      id: "turnaround",
      title: "低報酬、高估值——市場在賭轉機",
      why: "用高倍數去買一個賺不了什麼錢的生意，只有一個理由：預期它會變好。" +
           "這不是「貴」，是市場已經先付了轉機的錢。",
      ask: "你要說得出「憑什麼會變好」，而且那個理由要能驗證。答不出來就不是投資。"
    },
    valueTrap: {
      id: "valueTrap",
      title: "低報酬、低估值——市場認為它就是這樣了",
      why: "估值合理反映了平庸的賺錢能力。這一區不是撿便宜的地方，" +
           "是價值陷阱最常出現的地方——便宜通常是有原因的。",
      ask: "找出「為什麼便宜」，然後判斷那個原因會不會改變。不會改變的話，它就會一直便宜。"
    },
    balanced: {
      id: "balanced",
      title: "估值與獲利能力大致相稱",
      why: "沒有明顯的錯配。市場給的倍數和它賺錢的能力對得起來。",
      ask: "這種時候光看估值判斷不了什麼，得回到產業與競爭力。"
    }
  };

  function quadrantOf(pe, roe) {
    if (pe == null || roe == null) return null;
    if (roe >= ROE_HIGH && pe <= PE_LOW) return QUADRANTS.cyclicalPeak;
    if (roe >= ROE_HIGH && pe > PE_HIGH) return QUADRANTS.growth;
    if (roe < ROE_LOW && pe > PE_HIGH) return QUADRANTS.turnaround;
    if (roe < ROE_LOW && pe <= PE_LOW) return QUADRANTS.valueTrap;
    return QUADRANTS.balanced;
  }

  /* 配息政策：賺的錢留下來還是發出去，兩種都可能合理也可能有問題。 */
  function payoutNote(roe, dy) {
    if (roe == null || dy == null) return null;
    if (roe >= ROE_HIGH && dy < 1) {
      return {
        head: "賺得多、配得少",
        body: "獲利幾乎全部留在公司。合理的前提是再投資的報酬率撐得住——" +
              "如果留下來的錢只能賺到定存的報酬，不如發給股東。去看它的資本支出用在哪。"
      };
    }
    if (roe < ROE_LOW && dy >= 5) {
      return {
        head: "賺得少、配得多",
        body: "配息高於它的賺錢能力，這種狀態撐不久。" +
              "去查配發率有沒有超過 100%，以及配息來源是本業還是業外（例如賣資產）。"
      };
    }
    if (roe >= 15 && dy >= 4) {
      return {
        head: "又賺錢又配息",
        body: "通常出現在資產輕、現金流穩的生意。要確認的是配發率會不會太高，" +
              "以及這個獲利水準是不是循環高點帶來的。"
      };
    }
    return null;
  }

  /* 股價淨值比本身的極端值。四象限只看本益比與報酬率，
     會漏掉「付了多少溢價買帳面淨值」這件事。 */
  function premiumNote(pb) {
    if (pb == null || pb <= 0) return null;
    if (pb >= 5) {
      var book = (1 / pb).toFixed(2);
      return {
        head: "帳面溢價偏高（股價淨值比 " + pb.toFixed(2) + "）",
        body: "每付 1 元只買到 " + book + " 元的帳面淨值，其餘是市場給無形價值的定價——" +
              "品牌、技術、通路、或單純的期待。這個溢價在獲利轉弱時消失得最快。"
      };
    }
    if (pb <= 1) {
      return {
        head: "股價低於帳面淨值（" + pb.toFixed(2) + "）",
        body: "市價比公司帳上的淨資產還低。兩種可能：資產被低估（例如早年取得的土地" +
              "仍以成本入帳），或市場認為那些資產有問題（存貨賣不掉、應收收不回）。" +
              "看資產結構才分得出是哪一種。"
      };
    }
    return null;
  }

  /* 在同一份名單裡排第幾。給的是相對位置，不是絕對好壞。 */
  function rankIn(peers, code, key, desc) {
    var vals = [];
    (peers || []).forEach(function (r) {
      var v = key === "roe" ? roeOf(r) : r[key];
      if (v != null) vals.push({ code: r.code, v: v });
    });
    if (vals.length < 3) return null;
    vals.sort(function (a, b) { return desc ? b.v - a.v : a.v - b.v; });
    for (var i = 0; i < vals.length; i++) {
      if (vals[i].code === code) return { rank: i + 1, total: vals.length };
    }
    return null;
  }

  /* 主函式。peers 是同一份名單的其他標的，用來給相對位置。 */
  function profile(row, peers) {
    var roe = roeOf(row);
    if (roe == null) {
      return {
        ok: false,
        reason: row && row.close != null
          ? "公開 API 沒有這檔的本益比與股價淨值比——ETF 與部分標的沒有這兩個欄位，所以推算不出股東權益報酬率。"
          : "沒有這檔的估值資料。"
      };
    }

    return {
      ok: true,
      roe: roe,
      pe: row.pe,
      pb: row.pb,
      dividendYield: row["yield"],
      quadrant: quadrantOf(row.pe, roe),
      payout: payoutNote(roe, row["yield"]),
      premium: premiumNote(row.pb),
      ranks: {
        roe: rankIn(peers, row.code, "roe", true),
        pe: rankIn(peers, row.code, "pe", false),
        yield: rankIn(peers, row.code, "yield", true)
      },
      caveat: "本益比用的是近四季獲利，所以這裡推算的是**過去**的股東權益報酬率，不是未來。" +
              "對景氣循環股（記憶體、鋼鐵、航運、營建）這個差別特別大——" +
              "循環高點的報酬率一定會回落。"
    };
  }

  global.ANALYSIS = {
    roeOf: roeOf,
    quadrantOf: quadrantOf,
    payoutNote: payoutNote,
    premiumNote: premiumNote,
    rankIn: rankIn,
    profile: profile,
    QUADRANTS: QUADRANTS,
    THRESHOLDS: { ROE_HIGH: ROE_HIGH, ROE_LOW: ROE_LOW, PE_HIGH: PE_HIGH, PE_LOW: PE_LOW }
  };
})(typeof window !== "undefined" ? window : globalThis);
