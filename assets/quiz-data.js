/* 起手式 — 題庫設定檔
   畫面完全由這份資料產生：加題、減題、改文案都不用動 app.js。
   score 的每個維度會在 scoring.js 依「本題最高可得分」正規化成 0–100，
   所以這裡填相對權重即可，不必自己湊總分。
   tag 用來累計偏好（目標、市場），不進分數。 */
window.QUIZ = {
  meta: {
    estMinutes: 3,
    // 題目總數由 questions.length 算出，不另外寫死，避免進度條說謊。
  },

  questions: [
    {
      id: "experience",
      stage: "背景",
      type: "single",
      title: "你目前的台股經驗到哪裡？",
      note: "沒有標準答案，選最接近的就好。",
      options: [
        { id: "none",    icon: "🌱", label: "還沒開證券戶", note: "想先搞懂再說", score: { experience: 0,  knowledge: 0 } },
        { id: "etf",     icon: "📥", label: "有開戶，買過 ETF 或定期定額", note: "0050、0056、00878 這類", score: { experience: 8,  knowledge: 6 } },
        { id: "picker",  icon: "🎯", label: "自己選過個股，進出過幾次", note: "有賺有賠", score: { experience: 16, knowledge: 11 } },
        { id: "pro",     icon: "📚", label: "會看財報和法說會，有自己一套", note: "想再補強系統性", score: { experience: 24, knowledge: 18 } }
      ]
    },

    {
      id: "goals",
      stage: "目標",
      type: "multi",
      minSelect: 1,
      title: "你最想達成什麼？",
      note: "可複選，選 1–3 個最有感的。",
      options: [
        { id: "income",     icon: "💵", label: "每年多一筆股利現金流", tag: { goal: "income" },     score: { discipline: 4 } },
        { id: "milestone",  icon: "🏠", label: "存到一筆錢：頭期款、育兒、退休", tag: { goal: "milestone" }, score: { discipline: 5 } },
        { id: "research",   icon: "🔍", label: "看懂財報和法說會，自己判斷", tag: { goal: "research" },   score: { knowledge: 6 } },
        { id: "riskctl",    icon: "🛡️", label: "學會控管風險，不要再睡不著", tag: { goal: "riskctl" },  score: {} },
        { id: "allocation", icon: "🧭", label: "建立長期的資產配置", tag: { goal: "allocation" }, score: { discipline: 4 } }
      ]
    },

    {
      id: "pain",
      stage: "目標",
      type: "single",
      title: "現在最大的卡點是什麼？",
      options: [
        { id: "start",   icon: "🚪", label: "不知道從哪一步開始",           score: { knowledge: 0 } },
        { id: "noise",   icon: "📡", label: "資訊太多太雜，不知道該信誰",   score: { knowledge: 4 } },
        { id: "fear",    icon: "😰", label: "怕買在最高點，遲遲不敢下手",   score: {} },
        { id: "blind",   icon: "🌀", label: "有在買，但說不出自己為什麼買", score: { knowledge: 3 } }
      ],
      interstitialAfter: {
        emoji: "🍵",
        title: "不用急著懂全部",
        body: "台股一年就四次財報、四次法說會。看懂節奏，比天天盯盤有用得多。"
      }
    },

    {
      id: "markets",
      stage: "偏好",
      type: "multi",
      minSelect: 1,
      title: "你比較想學哪一塊？",
      note: "可複選。不確定也是一種答案。",
      options: [
        { id: "etf",      icon: "🧺", label: "台股 ETF", note: "0050、0056、00878", tag: { market: "etf" },      score: { knowledge: 2 } },
        { id: "stock",    icon: "🏭", label: "台股個股", note: "像 2330 這種自己挑", tag: { market: "stock" },   score: { knowledge: 4 } },
        { id: "dividend", icon: "🏦", label: "金融股、存股領息", tag: { market: "dividend" }, score: { discipline: 3 } },
        { id: "us",       icon: "🌎", label: "美股／複委託", note: "或海外券商", tag: { market: "us" },        score: { knowledge: 3 } },
        { id: "unsure",   icon: "🤷", label: "還不確定，想先看看", tag: { market: "unsure" },   score: {} }
      ]
    },

    {
      id: "time",
      stage: "偏好",
      type: "single",
      title: "每天大概能投入多少時間？",
      note: "誠實填，這會直接決定你的計畫節奏。",
      options: [
        { id: "t5",   icon: "🚇", label: "5 分鐘，通勤滑一下",     score: { time: 4,  discipline: 3 } },
        { id: "t15",  icon: "☕", label: "15 分鐘",                score: { time: 10, discipline: 6 } },
        { id: "t30",  icon: "🌙", label: "30 分鐘以上",            score: { time: 16, discipline: 8 } },
        { id: "week", icon: "📆", label: "平日沒空，週末一次補完", score: { time: 8,  discipline: 4 } }
      ]
    },

    {
      id: "drawdown",
      stage: "行為",
      type: "single",
      title: "假設你的部位帳面虧 15%，你通常會？",
      note: "這題測的是反應習慣，不是對錯。",
      options: [
        { id: "panic",  icon: "😵", label: "睡不著，想趕快賣掉",             score: { risk: 2,  discipline: 2 } },
        { id: "ignore", icon: "🙈", label: "先放著不看盤，等它自己回來",     score: { risk: 6,  discipline: 4 } },
        { id: "review", icon: "🧪", label: "回頭檢查當初買的理由還在不在",   score: { risk: 16, discipline: 12, knowledge: 5 } },
        { id: "add",    icon: "➕", label: "再買一些，攤平成本",             score: { risk: 5,  discipline: 5 } }
      ],
      interstitialAfter: {
        emoji: "⏱️",
        title: "重點從來不是時間長短",
        body: "每天 15 分鐘、持續三個月，會比某個週末讀八小時走得更遠。固定比長度重要。"
      }
    },

    {
      id: "age",
      stage: "背景",
      type: "single",
      title: "你的年齡層？",
      note: "用來抓時間軸，不會拿去做別的事。",
      options: [
        { id: "a18", icon: "🎒", label: "18–29 歲", score: {} },
        { id: "a30", icon: "💼", label: "30–39 歲", score: {} },
        { id: "a40", icon: "🏡", label: "40–49 歲", score: {} },
        { id: "a50", icon: "🌤️", label: "50 歲以上", score: {} }
      ]
    },

    {
      id: "localrule",
      stage: "知識",
      type: "single",
      title: "下面哪一句，你現在最答不出來？",
      options: [
        { id: "exdiv",  icon: "📉", label: "除權息後股價變低，那不就等於沒賺？", score: { knowledge: 2 } },
        { id: "nhi",    icon: "🏥", label: "二代健保補充保費什麼時候會被扣？",   score: { knowledge: 5 } },
        { id: "tax",    icon: "🧾", label: "股利要合併課稅還是分開計稅？",       score: { knowledge: 7 } },
        { id: "allok",  icon: "✅", label: "這幾題我大致都答得出來",             score: { knowledge: 14 } }
      ]
    },

    {
      id: "horizon",
      stage: "目標",
      type: "single",
      title: "你希望多久看到成果？",
      options: [
        { id: "h4",   icon: "⚡", label: "4 週內先入門",      score: { discipline: 6, risk: 1 } },
        { id: "h12",  icon: "📈", label: "3 個月穩定下來",    score: { discipline: 9, risk: 3 } },
        { id: "h26",  icon: "🌳", label: "半年到一年",        score: { discipline: 8, risk: 5 } },
        { id: "hlong",icon: "🪨", label: "長期慢慢來就好",    score: { discipline: 6, risk: 6 } }
      ],
      interstitialAfter: {
        emoji: "🧩",
        title: "剩最後幾題",
        body: "你的計畫正在成形。接下來三題決定的是「怎麼學」，不是「學什麼」。"
      }
    },

    {
      id: "style",
      stage: "偏好",
      type: "single",
      title: "你比較吃得下哪種學習方式？",
      options: [
        { id: "video", icon: "🎬", label: "短影音，三分鐘講完一個觀念", score: { time: 3 } },
        { id: "read",  icon: "📖", label: "圖文小課，可以自己控速",     score: { time: 5, knowledge: 3 } },
        { id: "sim",   icon: "🕹️", label: "實戰模擬，直接動手",         score: { experience: 5 } },
        { id: "quiz",  icon: "❓", label: "測驗互動，邊做邊修正",       score: { knowledge: 4, discipline: 3 } }
      ]
    },

    {
      id: "capital",
      stage: "行為",
      type: "single",
      title: "練習階段，你願意先動用多少錢？",
      note: "選模擬完全沒問題，很多人是這樣開始的。",
      options: [
        { id: "paper", icon: "🧪", label: "先用模擬金就好",        score: { risk: 6, discipline: 5 } },
        { id: "c1",    icon: "🪙", label: "NT$1 萬以內",           score: { risk: 5, experience: 3 } },
        { id: "c5",    icon: "💰", label: "NT$1–5 萬",             score: { risk: 4, experience: 6 } },
        { id: "c5up",  icon: "🏛️", label: "NT$5 萬以上",           score: { risk: 3, experience: 9 } }
      ]
    },

    {
      id: "selfrate",
      stage: "知識",
      type: "slider",
      title: "你現在對台股的了解，自己打幾分？",
      note: "0 是完全空白，10 是能跟朋友解釋清楚。",
      min: 0, max: 10, step: 1, default: 4,
      captions: [
        "完全空白，正要開始",       // 0
        "聽過幾個名詞",             // 1
        "聽過幾個名詞",             // 2
        "大概知道在幹嘛",           // 3
        "大概知道在幹嘛",           // 4
        "看得懂一半",               // 5
        "看得懂一半",               // 6
        "能自己判斷一些事",         // 7
        "能自己判斷一些事",         // 8
        "能跟朋友解釋清楚",         // 9
        "能跟朋友解釋清楚"          // 10
      ],
      // 滑桿分數 = 值 × perUnit
      score: { knowledge: 1.2 }
    },

    {
      id: "coaching",
      stage: "偏好",
      type: "single",
      title: "卡關的時候，你希望有人在旁邊嗎？",
      options: [
        { id: "coach", icon: "🤝", label: "很需要，最好有人直接點我",   score: { discipline: 4 } },
        { id: "hint",  icon: "💡", label: "偶爾提示一下就好",           score: { discipline: 7 } },
        { id: "solo",  icon: "🧗", label: "我自己來，給我材料就好",     score: { discipline: 9, experience: 3 } }
      ]
    }
  ]
};
