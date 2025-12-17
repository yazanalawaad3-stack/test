// sb-assets.js
;(function (window, document) {
  "use strict";

  function getUserId() {
    try {
      if (window.ExaAuth && typeof window.ExaAuth.getSupabaseUserId === "function") {
        var id = window.ExaAuth.getSupabaseUserId();
        if (id) return id;
      }
      return localStorage.getItem("sb_user_id_v1") || "";
    } catch (e) {
      return "";
    }
  }

  function toNum(v) {
    var n = Number(v);
    return isFinite(n) ? n : 0;
  }

  function fmtUSDT(n) {
    // keep same "0 USDT" style
    var v = (Math.round(toNum(n) * 100000000) / 100000000);
    // show up to 8 decimals but trim zeros
    var s = v.toFixed(8).replace(/\.?0+$/, "");
    return s + " USDT";
  }

  async function fetchRows(table, filters, select) {
    var url = window.SB_REST(table) + "?select=" + encodeURIComponent(select || "*");
    if (filters) url += "&" + filters;
    var res = await fetch(url, { headers: window.SB_HEADERS() });
    if (!res.ok) throw new Error("Fetch failed: " + table);
    return await res.json();
  }

  function sumLast24h(rows, amountKey, timeKey) {
    var now = Date.now();
    var day = 24 * 60 * 60 * 1000;
    var total = 0;
    var last = 0;

    for (var i = 0; i < rows.length; i++) {
      var a = toNum(rows[i][amountKey]);
      total += a;

      var t = rows[i][timeKey];
      if (t) {
        var ms = Date.parse(t);
        if (!isNaN(ms) && (now - ms) <= day) last += a;
      }
    }
    return { total: total, last24h: last };
  }

  function setTextByClass(cls, text) {
    var el = document.querySelector("." + cls);
    if (el) el.textContent = text;
  }

  async function loadAssetsSummary() {
    var userId = getUserId();
    if (!userId) return;

    // 1) Balance
    try {
      var wb = await fetchRows("wallet_balances", "user_id=eq." + encodeURIComponent(userId), "usdt_balance");
      if (wb && wb[0]) {
        var bal = toNum(wb[0].usdt_balance);
        setTextByClass("assets-usdt-balance", (Math.round(bal * 100000000) / 100000000).toString());
      }
    } catch (e) {}

    // 2) Personal income = ipower_actions.earning_amount
    var personal = { total: 0, last24h: 0 };
    try {
      var ip = await fetchRows("ipower_actions", "user_id=eq." + encodeURIComponent(userId), "earning_amount,created_at");
      personal = sumLast24h(ip, "earning_amount", "created_at");
    } catch (e) {}

    // 3) Team income = referral_commissions.commission_amount
    var team = { total: 0, last24h: 0 };
    try {
      var rc = await fetchRows("referral_commissions", "earner_user_id=eq." + encodeURIComponent(userId), "commission_amount,created_at");
      team = sumLast24h(rc, "commission_amount", "created_at");
    } catch (e) {}

    setTextByClass("assets-total-personal", fmtUSDT(personal.total));
    setTextByClass("assets-today-personal", fmtUSDT(personal.last24h));
    setTextByClass("assets-total-team", fmtUSDT(team.total));
    setTextByClass("assets-today-team", fmtUSDT(team.last24h));
  }

  function init() {
    loadAssetsSummary();
    document.addEventListener("visibilitychange", function () {
      if (!document.hidden) loadAssetsSummary();
    });
    setInterval(loadAssetsSummary, 8000);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})(window, document);
