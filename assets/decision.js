/* 起手式 — 「該不該買」決策引擎
   
   這支不推薦任何個股，也不可能推薦：這個網站沒有即時報價，寫死的明牌隔天就過期；
   而且在台灣，對不特定人推薦個股買賣屬於證券投資顧問業務，要金管會執照。

   它做的是另一件事——把「該不該買」拆成八個可以自己回答的問題，
   依使用者自己的答案算出裁決與具體操作步驟。答案是使用者的，不是我們的。
   純函式，同樣輸入永遠同樣輸出。 */
(function (global) {
  "use strict";

  var QUESTIONS = [
    {
      id: "motive",
      title: "你為什麼想買它？",
      note: "這題最重要。買進動機決定了你會在什麼時候賣。",
      options: [
        { id: "tip",    icon: "📢", label: "朋友、網紅或新聞說的", flag: "hearsay", score: -14 },
        { id: "fomo",   icon: "🚀", label: "最近漲很多，怕錯過",   flag: "fomo",    score: -12 },
        { id: "cheap",  icon: "🔍", label: "我看過財報，覺得價格合理", score: 10 },
        { id: "income", icon: "💵", label: "想長期持有領股利",     score: 8 },
        { id: "etf",    icon: "🧺", label: "它是 ETF，我要定期定額", score: 12 }
      ]
    },
    {
      id: "understand",
      title: "它靠什麼賺錢，你講得出來嗎？",
      note: "講不出來就等於不知道自己在買什麼。",
      options: [
        { id: "no",     icon: "🤷", label: "老實說不知道",           flag: "blind", score: -12 },
        { id: "vague",  icon: "🌫️", label: "大概知道產業，細節說不清", score: 0 },
        { id: "clear",  icon: "🎯", label: "講得出主要產品和客戶",   score: 10 },
        { id: "deep",   icon: "🔬", label: "連上下游和競爭者都知道", score: 14 }
      ]
    },
    {
      id: "trend",
      title: "它最近幾季的三率，是往上還往下？",
      note: "毛利率、營益率、淨利率。公開資訊觀測站查得到。ETF 這題選「不適用」。",
      options: [
        { id: "unchecked", icon: "❓", label: "我沒查過",       flag: "unchecked", score: -10 },
        { id: "down",      icon: "📉", label: "在下滑",          flag: "deteriorating", score: -8 },
        { id: "flat",      icon: "➖", label: "大致持平",        score: 4 },
        { id: "up",        icon: "📈", label: "在上升",          score: 10 },
        { id: "na",        icon: "🧺", label: "不適用（我買的是 ETF）", score: 6 }
      ]
    },
    {
      id: "position",
      title: "現在的股價，在它自己過去一年的哪個位置？",
      note: "不是要你抓最低點，是要你知道自己買在哪。",
      options: [
        { id: "unchecked", icon: "❓", label: "我沒查過",         flag: "unchecked", score: -10 },
        { id: "high",      icon: "⛰️", label: "接近一年高點",     score: -4 },
        { id: "mid",       icon: "〰️", label: "在中間區域",       score: 4 },
        { id: "low",       icon: "🏔️", label: "接近一年低點",     score: 6 }
      ]
    },
    {
      id: "weight",
      title: "這一筆會佔你全部投資的幾成？",
      note: "這題決定你看錯的時候會不會出局。",
      options: [
        { id: "w5",   icon: "🌱", label: "不到 5%",   score: 12 },
        { id: "w10",  icon: "🪴", label: "5～10%",    score: 8 },
        { id: "w30",  icon: "🌳", label: "10～30%",   score: -6 },
        { id: "w30up", icon: "🏔️", label: "超過 30%", flag: "oversized", score: -18 }
      ]
    },
    {
      id: "horizon",
      title: "這筆錢，你多久之內會用到？",
      note: "短期會用到的錢不該進股市，這跟你看得準不準無關。",
      options: [
        { id: "any",  icon: "🚨", label: "隨時可能用到",   flag: "needcash", score: -30 },
        { id: "y1",   icon: "⏳", label: "一年內",         flag: "needcash", score: -20 },
        { id: "y3",   icon: "📆", label: "三年內用不到",   score: 6 },
        { id: "y5",   icon: "🪨", label: "五年以上用不到", score: 12 }
      ]
    },
    {
      id: "drop",
      title: "如果買完隔天就跌 20%，你會怎麼做？",
      note: "誠實回答。這題在測你的部位是不是開太大。",
      options: [
        { id: "panic",  icon: "😵", label: "睡不著，馬上賣掉",       flag: "fragile", score: -10 },
        { id: "freeze", icon: "🙈", label: "不敢看，放著不管",       score: 0 },
        { id: "review", icon: "🧪", label: "回頭檢查當初的理由",     score: 12 },
        { id: "add",    icon: "➕", label: "照計畫加碼下一批",       score: 8 }
      ]
    },
    {
      id: "exit",
      title: "你寫下出場條件了嗎？",
      note: "「什麼情況我會承認看錯」——寫下來的才算。",
      options: [
        { id: "none",    icon: "🌀", label: "還沒想過",         flag: "norule", score: -12 },
        { id: "mental",  icon: "💭", label: "心裡有個數字",     score: -2 },
        { id: "written", icon: "📝", label: "寫下來了",         score: 12 },
        { id: "rule",    icon: "🛡️", label: "寫下來了，還包含「理由消失就走」", score: 16 }
      ]
    }
  ];

  /* 硬紅旗：只要中一個，不管其他答得多好，結論都是先不要買。
     這些不是分數低，是這筆交易的前提就不成立。 */
  var HARD = {
    needcash: {
      title: "這筆錢一年內會用到",
      why: "短期要用的錢進股市，等於把「什麼時候賣」的決定權交給生活，不是交給你的判斷。" +
           "剛好需要用錢那天就是股價低點的機率，比你想的高。"
    },
    oversized: {
      title: "單一標的超過總投資的三成",
      why: "這個部位大小會讓你在看錯一次的時候直接出局。不是這檔不好，是這個比重不對。"
    }
  };

  /* 軟紅旗：可以買，但要先補功課或縮小部位 */
  var SOFT = {
    hearsay:       { title: "買進理由來自別人的嘴",   why: "別人叫你買的時候會通知你，但跌下去的時候不會通知你賣。" },
    fomo:          { title: "怕錯過而想追",           why: "「漲很多」不是買進理由，它只描述了過去。" },
    blind:         { title: "說不出它靠什麼賺錢",     why: "股價下跌時，唯一能撐住你的就是你知道自己買了什麼。" },
    unchecked:     { title: "關鍵資料還沒查",         why: "三率和股價位置都查得到，花十分鐘就好。沒查就買等於擲骰子。" },
    deteriorating: { title: "三率在下滑",             why: "不是不能買，但你要說得出「為什麼它會轉回來」，而且要寫下來。" },
    fragile:       { title: "跌 20% 你會馬上賣",      why: "那代表這個部位對你來說太大了。縮小到你跌 20% 還睡得著的金額。" },
    norule:        { title: "沒有出場條件",           why: "沒寫下來的規則，在恐慌的當下會自己改變。" }
  };

  var VERDICTS = {
    stop: {
      id: "stop", label: "先不要買", tone: "bad",
      lead: "不是這檔股票的問題，是這筆交易的前提不成立。先把下面這件事處理掉。"
    },
    wait: {
      id: "wait", label: "再等一下", tone: "warn",
      lead: "還缺幾塊拼圖。把下面幾件事補完，再回來重跑一次這個判斷。"
    },
    small: {
      id: "small", label: "可以買，但要縮小、分批", tone: "ok",
      lead: "條件大致成立，但有幾個地方不夠紮實。用比原本計畫更小的部位開始。"
    },
    go: {
      id: "go", label: "條件齊了，照你的規則執行", tone: "good",
      lead: "該查的查了、部位合理、出場條件也寫了。剩下的是執行，不是判斷。"
    }
  };

  function evaluate(answers, profile) {
    profile = profile || {};

    var raw = 0, hard = [], soft = [], picked = {};

    QUESTIONS.forEach(function (q) {
      var id = answers[q.id];
      if (id == null) return;
      var opt = null;
      q.options.forEach(function (o) { if (o.id === id) opt = o; });
      if (!opt) return;

      picked[q.id] = opt;
      raw += opt.score;

      if (opt.flag) {
        if (HARD[opt.flag]) { if (hard.indexOf(opt.flag) < 0) hard.push(opt.flag); }
        else if (SOFT[opt.flag]) { if (soft.indexOf(opt.flag) < 0) soft.push(opt.flag); }
      }
    });

    // 分數正規化：最低與最高由題庫自己算，改題目不用重調
    var min = 0, max = 0;
    QUESTIONS.forEach(function (q) {
      var lo = Infinity, hi = -Infinity;
      q.options.forEach(function (o) { lo = Math.min(lo, o.score); hi = Math.max(hi, o.score); });
      min += lo; max += hi;
    });
    var score = Math.round(((raw - min) / (max - min)) * 100);
    score = Math.max(0, Math.min(100, score));

    var verdict;
    if (hard.length) verdict = VERDICTS.stop;
    else if (score < 45 || soft.length >= 3) verdict = VERDICTS.wait;
    else if (score < 68 || soft.length >= 1) verdict = VERDICTS.small;
    else verdict = VERDICTS.go;

    return {
      score: score,
      verdict: verdict,
      hardFlags: hard.map(function (k) { return { key: k, title: HARD[k].title, why: HARD[k].why }; }),
      softFlags: soft.map(function (k) { return { key: k, title: SOFT[k].title, why: SOFT[k].why }; }),
      steps: steps(verdict, picked, profile),
      picked: picked
    };
  }

  /* 具體操作步驟。這裡只講「怎麼做」，不講「買什麼」。 */
  function steps(verdict, picked, profile) {
    var out = [];
    var weight = picked.weight ? picked.weight.id : "w10";
    var isETF = picked.trend && picked.trend.id === "na";

    if (verdict.id === "stop") {
      out.push({ head: "現在該做的", body: "把上面那個硬條件解決掉。錢的問題就補緊急預備金，部位的問題就先減碼到三成以下。" });
      out.push({ head: "什麼時候回來", body: "條件解決之後回來重跑一次這八題。前提變了，結論就會變。" });
      return out;
    }

    if (verdict.id === "wait") {
      out.push({ head: "先補這幾件事", body: "上面列的每一項紅旗都對應一個具體動作：沒查就去查、沒寫就去寫。多數只要十到二十分鐘。" });
      out.push({ head: "在那之前", body: "如果真的很想先參與，用你原本打算金額的三分之一以下，當作學費而不是投資。" });
      out.push({ head: "重跑判斷", body: "補完之後回來重答一次。分數會變，結論也會跟著變。" });
      return out;
    }

    var frac = verdict.id === "small" ? "三分之一" : "三分之一到二分之一";
    out.push({
      head: "第一批買多少",
      body: "把你打算投入的總金額分成三批，這次只買第一批（約 " + frac + "）。" +
            (verdict.id === "small" ? "而且總金額先砍半——你有幾項還不夠紮實。" : "")
    });
    out.push({
      head: "怎麼下單",
      body: "用限價單，不要用市價單。台股漲跌幅 10%，市價單在開盤或急拉急殺時的成交價可能差很多。" +
            "設一個你願意成交的價格，沒成交就明天再來。"
    });
    out.push({
      head: "剩下兩批什麼時候進",
      body: isETF
        ? "ETF 直接設定期定額，讓它自動分批，不要自己抓時點。"
        : "先寫下條件再進場：可以是時間（每隔一個月）或事件（下一次財報公布後）。" +
          "不要用「跌了就加」——那是攤平，不是分批。"
    });
    out.push({
      head: "停損寫在哪",
      body: picked.exit && (picked.exit.id === "written" || picked.exit.id === "rule")
        ? "你已經寫了，現在把它貼在看得到的地方。執行不了的規則等於沒有規則。"
        : "現在就寫。兩種擇一：價格（跌破某個價位）或理由（當初買的理由消失）。理由型比較難執行但更接近本質。"
    });
    out.push({
      head: "什麼時候回來檢查",
      body: "下一次財報或月營收公布時。不是每天，是有新資訊的時候。" +
            (weight === "w30" ? "你的部位偏大，建議縮到一成以內再開始。" : "")
    });
    return out;
  }

  /* 觀察名單怎麼自己篩出來——這是「推薦個股」的誠實版本 */
  var SCREENS = {
    etfStart: {
      title: "ETF 觀察名單怎麼篩",
      where: "投信官網公開說明書、TWSE 基本市況報導、券商 App 的 ETF 專區",
      rules: [
        "規模夠大（避免清算風險），成交量夠（避免買賣價差吃掉報酬）",
        "內扣費用（經理費＋保管費）跟同類型比，越低越好",
        "追蹤誤差小，代表它有確實追到它要追的指數",
        "現在是溢價還是折價，高溢價時進場等於多付錢",
        "配息頻率符合你的現金流需求（半年配、季配、月配）"
      ]
    },
    cashflow: {
      title: "存股名單怎麼篩",
      where: "公開資訊觀測站的股利分派、TWSE 個股日成交資訊、公司年報",
      rules: [
        "連續配息年數：至少看五年，中間有沒有斷過",
        "配發率是否長期低於 100%（配得比賺的多，遲早撐不住）",
        "配息來源是本業還是業外（賣土地撐起來的配息不會有第二次）",
        "歷年填息天數，填不了息的高殖利率沒有意義",
        "產業是否穩定、需求是否有長期結構性衰退"
      ]
    },
    research: {
      title: "個股研究名單怎麼篩",
      where: "公開資訊觀測站（三率、月營收、法說會簡報）、TWSE OpenAPI",
      rules: [
        "三率連續四季的方向，以及毛利率和營益率有沒有背離",
        "月營收年增率的趨勢，不是單月數字",
        "本益比落在自己近五年區間的哪裡，並和同業比",
        "客戶集中度：前三大客戶佔比太高就是風險",
        "法說會裡管理層對下一季的措辭，跟上一季比有沒有變"
      ]
    },
    riskFirst: {
      title: "先別篩股，先篩自己",
      where: "你的帳戶對帳單、交易紀錄、月支出表",
      rules: [
        "緊急預備金夠不夠三到六個月的生活費",
        "目前單一標的最大佔比是多少，超過你的上限沒有",
        "手上標的的相關性，是不是集中在同一產業",
        "過去一年有幾筆交易是沒有事先寫下理由的",
        "跌 20% 你睡不睡得著——睡不著就是部位太大，跟選股無關"
      ]
    }
  };

  global.DECISION = {
    QUESTIONS: QUESTIONS,
    VERDICTS: VERDICTS,
    SCREENS: SCREENS,
    evaluate: evaluate
  };
})(typeof window !== "undefined" ? window : globalThis);
