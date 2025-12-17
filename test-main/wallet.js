// wallet.js
// Minimal glue between pages and Supabase (RPC + balances).
;(function (window, document) {
  "use strict";

  var SUPABASE_URL = (window.SB_CONFIG && window.SB_CONFIG.url) ? window.SB_CONFIG.url : "https://oyowsjjmaesspqiknvhp.supabase.co";
  var SUPABASE_KEY = (window.SB_CONFIG && window.SB_CONFIG.anonKey) ? window.SB_CONFIG.anonKey : "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im95b3dzamptYWVzc3BxaWtudmhwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjU4MTE4NzcsImV4cCI6MjA4MTM4Nzg3N30.aBo32xNG_dh1QD7NBI4N6jhYFLY42Xyxer2DNXxJi-w";
  var SB_USER_ID_KEY = "sb_user_id_v1";

  function apiHeaders() {
    return {
      apikey: SUPABASE_KEY,
      Authorization: "Bearer " + SUPABASE_KEY,
      "Content-Type": "application/json",
      Accept: "application/json"
    };
  }

  function getUserId() {
    try {
      if (window.ExaAuth && typeof window.ExaAuth.getSupabaseUserId === "function") {
        var id = window.ExaAuth.getSupabaseUserId();
        if (id) return id;
      }
    } catch (e) {}
    try {
      return localStorage.getItem(SB_USER_ID_KEY) || "";
    } catch (e) {}
    return "";
  }

  async function rpc(name, body) {
    var res = await fetch(SUPABASE_URL + "/rest/v1/rpc/" + name, {
      method: "POST",
      headers: apiHeaders(),
      body: JSON.stringify(body || {})
    });
    var text = await res.text();
    if (!res.ok) {
      throw new Error(text || ("RPC " + name + " failed"));
    }
    try { return JSON.parse(text); } catch (e) { return text; }
  }

  // --- Demo wallet fallback (offline)
  var DEMO_WALLET_KEY = "demo_wallet_v1";
  function loadDemo() {
    try {
      var v = JSON.parse(localStorage.getItem(DEMO_WALLET_KEY) || "{}");
      if (!v || typeof v !== "object") v = {};
      if (typeof v.usdt !== "number") v.usdt = 0;
      return v;
    } catch (e) {
      return { usdt: 0 };
    }
  }
  function saveDemo(v) {
    try { localStorage.setItem(DEMO_WALLET_KEY, JSON.stringify(v)); } catch (e) {}
  }
  window.DemoWallet = window.DemoWallet || {
    getBalance: function () { return loadDemo().usdt; },
    setBalance: function (n) {
      var v = loadDemo();
      v.usdt = Number(n) || 0;
      saveDemo(v);
      if (window.SBBalance && typeof window.SBBalance.refresh === "function") {
        window.SBBalance.refresh();
      }
    },
    addIncome: function (n) {
      var v = loadDemo();
      v.usdt = (Number(v.usdt) || 0) + (Number(n) || 0);
      saveDemo(v);
      if (window.SBBalance && typeof window.SBBalance.refresh === "function") {
        window.SBBalance.refresh();
      }
    }
  };

  // --- Public actions used by pages
  async function applyIpowerProfit() {
    var uid = getUserId();
    if (!uid) throw new Error("NOT_LOGGED_IN");

    // Preferred: use your DB RPC if it exists (perform_ipower_action)
    // It returns a row: { action_id, out_user_id, earning_amount, new_balance, out_created_at }
    try {
      var rows = await rpc("perform_ipower_action", { p_user: uid });
      // Supabase returns array for table-returning functions
      var row = Array.isArray(rows) ? rows[0] : rows;
      if (row && row.earning_amount != null) return Number(row.earning_amount) || 0;
      return 0;
    } catch (e) {
      // Fallback: allow demo mode (do not block UI)
      if (window.DemoWallet && typeof window.DemoWallet.addIncome === "function") {
        window.DemoWallet.addIncome(1);
        return 1;
      }
      throw e;
    }
  }

  async function requestWithdrawal(amount, currency, network, address) {
    var uid = getUserId();
    if (!uid) throw new Error("NOT_LOGGED_IN");
    return rpc("request_withdrawal", {
      p_user: uid,
      p_amount: Number(amount),
      p_currency: String(currency || "usdt").toLowerCase(),
      p_network: String(network || "bep20").toLowerCase(),
      p_address: String(address || "").trim()
    });
  }

  window.WalletAPI = {
    getUserId: getUserId,
    rpc: rpc,
    applyIpowerProfit: applyIpowerProfit,
    requestWithdrawal: requestWithdrawal
  };
})(window, document);
