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

  /* 從收盤價與兩個比率反推每股數字。
     每股盈餘 = 股價 ÷ 本益比；每股淨值 = 股價 ÷ 股價淨值比。 */
  function perShare(row) {
    if (!row || row.close == null) return {};
    return {
      eps: (row.pe && row.pe > 0) ? row.close / row.pe : null,
      bps: (row.pb && row.pb > 0) ? row.close / row.pb : null
    };
  }

  /* 盈餘殖利率 = 1 ÷ 本益比。拿來跟定存、公債直接比同一個單位。 */
  function earningsYield(pe) {
    return (pe && pe > 0) ? (1 / pe) * 100 : null;
  }

  /* 配發率 = 殖利率 × 本益比。
     推導：殖利率 = 每股股利 ÷ 股價，本益比 = 股價 ÷ 每股盈餘，
     兩者相乘股價消掉，剩下每股股利 ÷ 每股盈餘。
     這是存股最關鍵的一個數字，而且同樣不用翻財報。 */
  function payoutRatio(dy, pe) {
    if (dy == null || pe == null || pe <= 0) return null;
    return dy * pe;
  }

  function payoutNoteOf(ratio) {
    if (ratio == null) return null;
    if (ratio > 100) {
      return "配得比賺的多。可能動用了保留盈餘或資本公積，這種狀態撐不久——" +
             "去查配息來源，以及公司帳上還有多少可分配盈餘。";
    }
    if (ratio >= 70) {
      return "把大部分獲利發出去。成熟穩定的生意這樣沒問題，" +
             "但如果它還需要投資成長，配這麼高代表沒有更好的用錢地方。";
    }
    if (ratio <= 20) {
      return "獲利大多留在公司。合理的前提是再投資報酬率夠高——" +
             "去看資本支出投在哪裡、過去幾年的投資有沒有變成獲利。";
    }
    return "配發比例落在常見區間。";
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
      ask: "拉出近五年的每股盈餘。如果今年是個突出的異常值，那現在的本益比是假的便宜。",
      needs: ["判斷循環位置的能力", "事先寫好的停損", "不拿長期持有當不停損的藉口"],
      verify: [
        { what: "近五年每股盈餘",
          where: "公開資訊觀測站 → 財務報表 → 每股盈餘",
          pass: "今年的數字跟前四年在同一個量級。如果是兩三倍，那就是循環高點" },
        { what: "產能與資本支出",
          where: "法說會簡報、年報的「營運概況」",
          pass: "同業沒有在大規模擴產。大家一起擴產就是循環見頂的前兆" },
        { what: "產品報價趨勢",
          where: "產業新聞、月營收公告",
          pass: "報價還在漲或至少持平。開始跌就是循環轉折" }
      ]
    },
    growth: {
      id: "growth",
      title: "高報酬、高估值——市場認為這個獲利能持續甚至成長",
      why: "市場願意用高倍數買它，代表預期這個賺錢能力不只是一時的。" +
           "你買的是未來，不是現在的獲利。",
      ask: "確認高報酬是靠本業還是靠財務槓桿——去查負債比。借錢也能把股東權益報酬率撐高。",
      needs: ["放得夠久的資金", "追蹤成長有沒有兌現的耐心", "接受期待落空時跌幅很深"],
      verify: [
        { what: "負債比與利息保障倍數",
          where: "公開資訊觀測站 → 財務報表 → 資產負債表",
          pass: "負債比沒有明顯高於同業。高報酬如果是借錢撐出來的，景氣反轉會加倍痛" },
        { what: "營收年增率的連續性",
          where: "公開資訊觀測站 → 每月營收",
          pass: "連續數月維持成長，而不是單月跳增" },
        { what: "毛利率有沒有跟著營收一起走",
          where: "財務報表的三率",
          pass: "營收成長時毛利率沒有下滑。下滑代表是低價搶單換來的" }
      ]
    },
    turnaround: {
      id: "turnaround",
      title: "低報酬、高估值——市場在賭轉機",
      why: "用高倍數去買一個賺不了什麼錢的生意，只有一個理由：預期它會變好。" +
           "這不是「貴」，是市場已經先付了轉機的錢。",
      ask: "你要說得出「憑什麼會變好」，而且那個理由要能驗證。答不出來就不是投資。",
      needs: ["說得出轉機的具體內容", "持續追蹤的時間", "轉機證偽時願意認錯"],
      verify: [
        { what: "轉機的具體來源",
          where: "法說會簡報與 Q&A、重大訊息",
          pass: "管理層明確講出新產品、新客戶或成本改善，而且有時間表" },
        { what: "毛利率有沒有開始回升",
          where: "公開資訊觀測站 → 財務報表 → 三率",
          pass: "連續兩季以上回升。單季回升可能只是一次性因素" },
        { what: "轉機說法講了多久",
          where: "翻前幾季的法說會簡報，對照當時的說法",
          pass: "如果同一套說法講了三年還沒兌現，那不是轉機，是故事" }
      ]
    },
    valueTrap: {
      id: "valueTrap",
      title: "低報酬、低估值——市場認為它就是這樣了",
      why: "估值合理反映了平庸的賺錢能力。這一區不是撿便宜的地方，" +
           "是價值陷阱最常出現的地方——便宜通常是有原因的。",
      ask: "找出「為什麼便宜」，然後判斷那個原因會不會改變。不會改變的話，它就會一直便宜。",
      needs: ["找得出便宜的原因", "判斷那個原因會不會改變", "等得起"],
      verify: [
        { what: "產業需求是不是結構性衰退",
          where: "年報的產業概況、同業的營收趨勢",
          pass: "整個產業還在成長或至少持平。產業在萎縮的話，便宜是應該的" },
        { what: "有沒有改變的觸發點",
          where: "法說會、重大訊息、轉投資公告",
          pass: "看得到具體的動作，不是只有「我們會努力」" },
        { what: "資產有沒有被低估",
          where: "資產負債表的土地、長期投資",
          pass: "帳上有以成本入帳的土地或轉投資，市價明顯高於帳面" }
      ]
    },
    balanced: {
      id: "balanced",
      title: "估值與獲利能力大致相稱",
      why: "沒有明顯的錯配。市場給的倍數和它賺錢的能力對得起來。",
      ask: "這種時候光看估值判斷不了什麼，得回到產業與競爭力。",
      needs: ["對這個產業有基本認識", "看得懂三率的變化"],
      verify: [
        { what: "三率近八季的方向",
          where: "公開資訊觀測站 → 財務報表 → 綜合損益表",
          pass: "毛利率與營益率同向。毛利率漲但營益率沒漲，代表費用在膨脹" },
        { what: "客戶集中度",
          where: "年報的「主要客戶」章節",
          pass: "前三大客戶佔比不會高到單一客戶抽單就出事" },
        { what: "在同業裡的相對位置",
          where: "把同產業幾家的本益比與股價淨值比排一起比",
          pass: "說得出它為什麼比同業貴或便宜" }
      ]
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

    var ps = perShare(row);
    var payout = payoutRatio(row["yield"], row.pe);

    return {
      ok: true,
      roe: roe,
      pe: row.pe,
      pb: row.pb,
      dividendYield: row["yield"],
      eps: ps.eps,
      bps: ps.bps,
      earningsYield: earningsYield(row.pe),
      payoutRatio: payout,
      payoutRatioNote: payoutNoteOf(payout),
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

  /* 這是整套東西的接點。
     體質速讀說的是「這檔需要什麼樣的持有者」，
     八題說的是「你是什麼樣的持有者」。
     兩邊對上才叫該不該買——只看其中一邊都不完整。 */
  function matchWith(profile, answers) {
    if (!profile || !profile.ok || !answers) return null;
    var q = profile.quadrant ? profile.quadrant.id : null;
    var fits = [], conflicts = [];

    function conflict(head, body) { conflicts.push({ head: head, body: body }); }
    function fit(head, body) { fits.push({ head: head, body: body }); }

    // 賭轉機：整個估值建立在「它會變好」上
    if (q === "turnaround") {
      if (answers.understand === "no" || answers.understand === "vague") {
        conflict("你說不出它靠什麼賺錢，但這檔的價格建立在轉機上",
          "市場已經先付了「它會變好」的錢。你要判斷的不是它現在好不好，" +
          "而是它會不會變好——這需要你先知道它現在是怎麼運作的。");
      } else {
        fit("你講得出它靠什麼賺錢",
          "這是判斷轉機能不能成立的前提，你有了。");
      }
      if (answers.trend === "unchecked") {
        conflict("轉機標的最不該跳過三率",
          "轉機會不會發生，最早的訊號就在毛利率有沒有開始回升。這題你答沒查過。");
      }
    }

    // 循環高點：低本益比是假的便宜
    if (q === "cyclicalPeak") {
      if (answers.drop === "panic") {
        conflict("這檔的低本益比建立在獲利高點上，而你說跌 20% 會馬上賣",
          "循環反轉時跌幅通常不只 20%。你會賣在最痛的位置，" +
          "然後在低點看著它跌更多。要嘛縮小部位，要嘛換標的。");
      }
      if (answers.exit === "none" || answers.exit === "mental") {
        conflict("循環股沒有寫下來的出場條件，等於沒有出場條件",
          "獲利在頂點的股票跌起來很快，臨場決定來不及。" +
          "寫下來——價格或理由都行，但要白紙黑字。");
      } else {
        fit("你有寫下來的出場條件",
          "這是持有循環股的最低門檻，你過了。");
      }
    }

    // 成長定價：時間是必要成本
    if (q === "growth") {
      if (answers.horizon === "any" || answers.horizon === "y1") {
        conflict("成長要時間兌現，而你的錢一年內要用",
          "市場付的是未來三五年的期待。你沒有那麼多時間等，" +
          "中間任何一次期待落空，你就被迫在低點賣。");
      } else if (answers.horizon === "y5") {
        fit("你的錢五年以上用不到",
          "成長定價的標的需要的就是時間，這點你有。");
      }
    }

    // 價值陷阱區：便宜是有原因的
    if (q === "valueTrap") {
      if (answers.understand === "no" || answers.understand === "vague") {
        conflict("你說不出它靠什麼賺錢，卻要買一檔便宜的股票",
          "這一區的關鍵不是「多便宜」，是「為什麼便宜」。" +
          "找不出原因就買，買到的通常是還會更便宜的東西。");
      }
    }

    // 高溢價：跌起來最快的部分
    if (profile.pb != null && profile.pb >= 5) {
      if (answers.weight === "w30" || answers.weight === "w30up") {
        conflict("股價淨值比 " + profile.pb.toFixed(2) + " 的標的，不該押這麼重",
          "溢價的部分不是資產，是市場給的期待。期待消失得比資產快，" +
          "而你打算把" + (answers.weight === "w30up" ? "超過三成" : "一到三成") +
          "的部位放在這裡。");
      } else if (answers.weight === "w5") {
        fit("部位控制在 5% 以內",
          "高溢價標的看錯的時候跌得深，小部位是最有效的保護。");
      }
    }

    // 配息：你為了領息而買，它配不配得起
    if (answers.motive === "income" && profile.payoutRatio != null) {
      if (profile.payoutRatio > 100) {
        conflict("你買它是為了領息，但它配得比賺的多",
          "配發率推算約 " + profile.payoutRatio.toFixed(0) + "%，" +
          "代表配息超過當期獲利。這種狀態撐不久，先查配息來源。");
      } else if (profile.dividendYield != null && profile.dividendYield < 2) {
        conflict("你買它是為了領息，但它的殖利率只有 " +
                 profile.dividendYield.toFixed(2) + "%",
          "這檔不是收息標的。要現金流的話，這個選擇跟目的對不上。");
      } else if (profile.payoutRatio <= 80 && profile.dividendYield >= 4) {
        fit("配息水準與配發率都合理",
          "殖利率 " + profile.dividendYield.toFixed(2) + "%、配發率推算約 " +
          profile.payoutRatio.toFixed(0) + "%，配得起。" +
          "剩下要確認的是這個獲利水準能不能延續。");
      }
    }

    return { fits: fits, conflicts: conflicts };
  }

  global.ANALYSIS = {
    perShare: perShare,
    earningsYield: earningsYield,
    payoutRatio: payoutRatio,
    matchWith: matchWith,
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
