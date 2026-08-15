/* 起手式 — 事件追蹤抽象層
   目前只寫 console 與記憶體佇列，沒有任何外部請求、沒有 cookie。
   之後要接 GA4 / PostHog / Mixpanel，只改這一支的 send()，別散落到各元件。 */
(function (global) {
  "use strict";

  var queue = [];
  var enabled = true;

  function send(name, payload) {
    // TODO: 串接分析服務，例如 gtag('event', name, payload)
    if (global.console && console.debug) console.debug("[track]", name, payload || {});
  }

  function track(name, payload) {
    if (!enabled) return;
    var evt = { name: name, at: Date.now(), payload: payload || {} };
    queue.push(evt);
    send(name, evt.payload);
  }

  global.ANALYTICS = {
    track: track,
    events: function () { return queue.slice(); },
    disable: function () { enabled = false; },
    /* 漏斗要看的就這幾個，名字定死免得各處自己發明 */
    NAMES: {
      quizStarted: "quiz_started",
      questionAnswered: "quiz_question_answered",
      quizCompleted: "quiz_completed",
      resultViewed: "result_viewed",
      planViewed: "plan_viewed",
      planPrinted: "plan_printed",
      planDownloaded: "plan_downloaded",
      emailSubmitted: "email_submitted",
      pricingViewed: "pricing_viewed",
      planSelected: "plan_selected",
      checkoutStarted: "checkout_started",
      offerExpired: "offer_expired"
    }
  };
})(typeof window !== "undefined" ? window : globalThis);
