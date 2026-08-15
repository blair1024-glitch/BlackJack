/* 起手式 — 成長曲線（手寫 SVG，無圖表套件）
   畫的是「學習準備度」隨週數的推估，不是資產、不是報酬率。
   這條線只反映投入時間與現在的底子，任何情況下都不得拿來暗示投資績效。 */
(function (global) {
  "use strict";

  var W = 320, H = 180, PAD_L = 34, PAD_R = 14, PAD_T = 16, PAD_B = 30;

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  /* 終點：從現在的準備度往上走，能走多遠由時間投入決定。
     刻意壓在 92 以下——沒有任何課程能保證滿分。 */
  function project(readiness, timeScore) {
    var reach = 0.42 + (timeScore / 100) * 0.34;          // 0.42 – 0.76
    return Math.min(92, Math.round(readiness + (100 - readiness) * reach));
  }

  function points(from, to, n) {
    var out = [];
    for (var i = 0; i <= n; i++) {
      var t = i / n;
      var eased = 1 - Math.pow(1 - t, 2.1);               // 前期進步快，後期趨緩
      out.push({ t: t, v: from + (to - from) * eased });
    }
    return out;
  }

  function growth(opts) {
    var from = Math.max(0, Math.min(100, opts.readiness || 0));
    var weeks = opts.weeks || 8;
    var to = project(from, opts.timeScore || 50);

    var pts = points(from, to, 24);
    var x = function (t) { return PAD_L + t * (W - PAD_L - PAD_R); };
    var y = function (v) { return PAD_T + (1 - v / 100) * (H - PAD_T - PAD_B); };

    var line = pts.map(function (p, i) {
      return (i ? "L" : "M") + x(p.t).toFixed(1) + " " + y(p.v).toFixed(1);
    }).join(" ");
    var area = line + " L" + x(1).toFixed(1) + " " + y(0).toFixed(1) +
               " L" + x(0).toFixed(1) + " " + y(0).toFixed(1) + " Z";

    var grid = [0, 25, 50, 75, 100].map(function (v) {
      return '<line x1="' + PAD_L + '" y1="' + y(v).toFixed(1) + '" x2="' + (W - PAD_R) +
             '" y2="' + y(v).toFixed(1) + '" stroke="var(--border)" stroke-width="1"/>' +
             '<text x="' + (PAD_L - 7) + '" y="' + (y(v) + 4).toFixed(1) +
             '" text-anchor="end" font-size="9" fill="var(--text-faint)">' + v + "</text>";
    }).join("");

    var label = "現在準備度 " + from + " 分，第 " + weeks + " 週推估 " + to +
                " 分。這是學習進度的推估，不是投資報酬預測。";

    return {
      to: to,
      svg:
        '<svg viewBox="0 0 ' + W + " " + H + '" role="img" aria-label="' + esc(label) + '">' +
          '<defs><linearGradient id="fmFill" x1="0" y1="0" x2="0" y2="1">' +
            '<stop offset="0%" stop-color="var(--brand)" stop-opacity=".22"/>' +
            '<stop offset="100%" stop-color="var(--brand)" stop-opacity="0"/>' +
          "</linearGradient></defs>" +
          grid +
          '<path d="' + area + '" fill="url(#fmFill)"/>' +
          '<path d="' + line + '" fill="none" stroke="var(--brand)" stroke-width="2.5" ' +
            'stroke-linecap="round" stroke-linejoin="round"/>' +
          '<circle cx="' + x(0).toFixed(1) + '" cy="' + y(from).toFixed(1) + '" r="4.5" ' +
            'fill="var(--bg-elev)" stroke="var(--brand)" stroke-width="2.5"/>' +
          '<circle cx="' + x(1).toFixed(1) + '" cy="' + y(to).toFixed(1) + '" r="5" fill="var(--brand)"/>' +
          '<text x="' + PAD_L + '" y="' + (H - 9) + '" font-size="10" fill="var(--text-muted)">你在這裡</text>' +
          '<text x="' + (W - PAD_R) + '" y="' + (H - 9) + '" text-anchor="end" font-size="10" ' +
            'fill="var(--text-muted)">第 ' + weeks + " 週</text>" +
        "</svg>"
    };
  }

  global.CHART = { growth: growth, project: project };
})(typeof window !== "undefined" ? window : globalThis);
