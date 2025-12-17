// The DemoWallet object implements a lightweight, purely front‑end
// wallet and user system. Everything is stored in localStorage so
// that pages under the file:// scheme can share state. There is no
// backend – this file is the only source of truth for balances,
// users, invitations and transaction history. It follows the data
// structures described in Yazan_Platform_Documentation_AR.

;(function (window) {
  "use strict";

  /**
   * Keys used for localStorage. We keep the current user and the
   * associated wallet state separate. A third key (demoUsers_v1) can
   * hold a list of all users that have ever signed up on this
   * browser. Only the current user is actively used by the pages.
   */
  var USER_KEY = "demoCurrentUser";
  var STATE_KEY = "demoWalletState_v1";
  var USERS_LIST_KEY = "demoUsers_v1";
  // Key for storing team relationships by invitation code. Each entry maps
  // an invitation code to an array of member objects, enabling the
  // inviter's team to be reconstructed even when they are not the
  // current user.
  var TEAMS_KEY = "demoTeams_v1";

  // --- Supabase configuration for syncing demo balances ---
  // These values mirror the ones used in auth.js. The key is the public
  // anon key provided by Supabase and is safe to expose in frontend code.
  var SUPABASE_URL = "https://oyowsjjmaesspqiknvhp.supabase.co";
  var SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im95b3dzamptYWVzc3BxaWtudmhwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjU4MTE4NzcsImV4cCI6MjA4MTM4Nzg3N30.aBo32xNG_dh1QD7NBI4N6jhYFLY42Xyxer2DNXxJi-w";
  var BSC_SCAN_API_KEY = "NYJBRUE9MAGSXQ1S9FRC28XD1DE2MSE146";

  /**
   * Push a lightweight snapshot of the current wallet state to Supabase.
   * This keeps a backend copy of the demo balance for each uid so that
   * data is not lost if localStorage is cleared. The backend schema is
   * expected to have a wallet_balances table with a unique `uid` column
   * and `usdt_balance` numeric column.
   */
  function syncWalletToSupabase(st) {
    try {
      if (!st || !st.balances) return;
      var user = getUser && getUser();
      var uid = (st.userId) || (user && user.id);
      if (!uid) return;
      var usdt = parseFloat(st.balances.USDT || 0);
      if (isNaN(usdt)) usdt = 0;
      var payload = {
        uid: uid,
        usdt_balance: usdt,
        updated_at: new Date().toISOString()
      };
      var url = SUPABASE_URL + "/rest/v1/wallet_balances?on_conflict=uid";
      fetch(url, {
        method: "POST",
        headers: {
          "apikey": SUPABASE_KEY,
          "Authorization": "Bearer " + SUPABASE_KEY,
          "Content-Type": "application/json",
          "Prefer": "resolution=merge-duplicates,return=minimal"
        },
        body: JSON.stringify(payload)
      }).catch(function (err) {
        if (typeof console !== "undefined" && console && console.error) {
          console.error("Supabase wallet sync error", err);
        }
      });
    } catch (e) {
      if (typeof console !== "undefined" && console && console.error) {
        console.error("Supabase wallet sync exception", e);
      }
    }
  }

  /**
   * Generate a pseudo‑random user identifier. It starts with "U"
   * followed by the last 6 digits of the current timestamp and a
   * three‑digit random number. This format matches the example IDs in
   * the project documentation.
   */
  function generateUserId() {
    var ts = String(Date.now());
    var last6 = ts.slice(-6);
    var rand3 = String(Math.floor(100 + Math.random() * 900));
    return "U" + last6 + rand3;
  }

  /**
   * Generate an invitation code consisting of uppercase letters and
   * digits (excluding easily confused ones). This can be used both
   * as the user's own code and as the inviter code for new signups.
   */
  function generateInviteCode(len) {
    len = len || 6;
    var chars = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
    var code = "";
    for (var i = 0; i < len; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
  }

  /**
   * Safely parse JSON from localStorage. Returns null on failure.
   */
  function loadJson(key) {
    try {
      var raw = localStorage.getItem(key);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (e) {
      return null;
    }
  }

  /**
   * Save a value to localStorage as JSON. Wraps errors in a try/catch.
   */
  function saveJson(key, val) {
    try {
      localStorage.setItem(key, JSON.stringify(val));
    } catch (e) {
      // Ignore quota errors silently
    }
  }

  /**
   * Retrieve the current user. If none exists in storage a blank user
   * object is returned. The blank user is not persisted until a
   * caller invokes setUser().
   */
  function getUser() {
    var u = loadJson(USER_KEY);
    if (!u || typeof u !== "object") {
      return null;
    }
    return u;
  }

  /**
   * Persist the given user object to localStorage. A minimal copy of
   * the user is stored in the demoUsers_v1 list to allow lookup by
   * phone number in auth.js. We do not write to the wallet state
   * here.
   */
  function setUser(u) {
    if (!u || typeof u !== "object") return;
    // Ensure an ID and invitation code are present
    if (!u.id) {
      u.id = generateUserId();
    }
    // If we are connected to Supabase, invitation_code should come from the DB
    // (generated by trigger). Only generate a local code for offline/demo mode.
    var hasSupabaseUser = false;
    try { hasSupabaseUser = !!localStorage.getItem('sb_user_id_v1'); } catch (e) { hasSupabaseUser = false; }
    if (!u.invitationCode && !hasSupabaseUser) {
      u.invitationCode = generateInviteCode(6);
    }
    // Update timestamps
    var nowIso = new Date().toISOString();
    if (!u.createdAt) {
      u.createdAt = nowIso;
    }
    u.lastLoginAt = nowIso;
    // Persist current user
    saveJson(USER_KEY, u);
    // Update the users list
    var list = loadJson(USERS_LIST_KEY);
    if (!Array.isArray(list)) list = [];
    var existingIndex = -1;
    for (var i = 0; i < list.length; i++) {
      if (list[i] && list[i].phoneDigits && u.phoneDigits && String(list[i].phoneDigits) === String(u.phoneDigits)) {
        existingIndex = i;
        break;
      }
    }
    var minimal = {
      id: u.id,
      phoneDigits: u.phoneDigits || "",
      areaCode: u.areaCode || "",
      inviterCode: u.inviterCode || "",
      invitationCode: u.invitationCode || "",
      createdAt: u.createdAt,
      lastLoginAt: u.lastLoginAt
    };
    if (existingIndex >= 0) {
      list[existingIndex] = minimal;
    } else {
      list.push(minimal);
    }
    saveJson(USERS_LIST_KEY, list);
  }

  /**
   * Initialise a brand new wallet state for the current user. The
   * initial demo balance is 3 USDT. Additional currencies start at 0.
   */
  function createNewState(userId) {
    var nowIso = new Date().toISOString();
    return {
      userId: userId,
      createdAt: nowIso,
      balances: {
        USDT: 3,
        BTC: 0,
        ETH: 0,
        USDC: 0,
        TRX: 0
      },
      personal: {
        today: 0,
        total: 0
      },
      team: {
        today: 0,
        total: 0
      },
      totalIncome: 3,
      lastIncomeAt: null,
      lastWithdrawAt: null,
      transactions: [
        {
          id: "tx_bonus_" + Date.now(),
          type: "income",
          amount: 3,
          currency: "USDT",
          status: "SUCCESS",
          fee: 0,
          net: 3,
          createdAt: nowIso,
          note: "Signup bonus"
        }
      ],
      invite: {
        code: null,
        inviterCode: null,
        link: null
      },
      teamSummary: null
    };
  }

  /**
   * Retrieve the wallet state. If no state exists or the stored
   * state's userId doesn't match the current user then a new state
   * will be created. This ensures each user gets their own wallet.
   */
  function getState() {
    var user = getUser();
    if (!user || !user.id) {
      return null;
    }
    var st = loadJson(STATE_KEY);
    if (!st || typeof st !== "object" || st.userId !== user.id) {
      st = createNewState(user.id);
      // Link invite info to the user
      st.invite.code = user.invitationCode;
      st.invite.inviterCode = user.inviterCode || null;
      st.invite.link = null;
      saveJson(STATE_KEY, st);
    }
    return st;
  }

  /**
   * Persist the given state to localStorage. Any errors are
   * silently ignored.
   */
  function saveState(st) {
    saveJson(STATE_KEY, st);
    // Sync legacy demo keys used by older pages. Some pages still
    // reference `demoBalance` and `demoEffectiveUsers` in
    // localStorage to determine VIP level and computing power
    // availability. To maintain backward compatibility with those
    // pages we update these values whenever the wallet state is
    // persisted. `demoBalance` is defined as the sum of all token
    // balances expressed in USDT equivalents (no exchange rate is
    // applied; tokens are assumed to be worth 1 USDT each in this
    // demo). `demoEffectiveUsers` represents the number of
    // effective users in the current user's team if available.
    try {
      var totalBal = 0;
      if (st && st.balances) {
        Object.keys(st.balances).forEach(function (sym) {
          var v = parseFloat(st.balances[sym]);
          if (!isNaN(v)) totalBal += v;
        });
      }
      localStorage.setItem('demoBalance', String(totalBal));
      var eff = 0;
      try {
        var tsum = getTeamSummary();
        if (tsum && typeof tsum.teamSize === 'number') {
          eff = tsum.teamSize;
        }
      } catch (err) {}
      localStorage.setItem('demoEffectiveUsers', String(eff));
    } catch (e) {
      // Ignore sync errors silently
    }
    // Also push a snapshot of this state to Supabase so the backend
    // always has the latest demo balance per uid.
    try { syncWalletToSupabase(st); } catch (e2) {}
  }

  /**
   * Return a summary of the wallet for easy consumption by pages.
   * Includes the balance (USDT only), a copy of balances, total
   * income and today income. Team incomes are returned as stored in
   * the state.
   */
  function getWallet() {
    var st = getState();
    if (!st) return { balance: 0, balances: {}, totalIncome: 0, todayIncome: 0, todayTeamIncome: 0, totalTeamIncome: 0 };
    var bal = st.balances && typeof st.balances.USDT === "number" ? st.balances.USDT : 0;
    // Sync legacy fields on each call to keep external pages up to date.
    try {
      var totalForLegacy = 0;
      if (st && st.balances) {
        Object.keys(st.balances).forEach(function (sym) {
          var v = parseFloat(st.balances[sym]);
          if (!isNaN(v)) totalForLegacy += v;
        });
      }
      localStorage.setItem('demoBalance', String(totalForLegacy));
      var effLegacy = 0;
      try {
        // Use the size of the inviter's team as the legacy effective
        // user count. getTeamSummary() computes this from the team
        // relationships map (demoTeams_v1).
        var tsum = getTeamSummary();
        if (tsum && typeof tsum.teamSize === 'number') {
          effLegacy = tsum.teamSize;
        }
      } catch (e) {}
      localStorage.setItem('demoEffectiveUsers', String(effLegacy));
    } catch (e) {
      // ignore
    }
    return {
      balance: bal,
      balances: Object.assign({}, st.balances || {}),
      totalUSDT: Object.keys(st.balances || {}).reduce(function (sum, k) {
        var v = st.balances[k];
        return sum + (typeof v === "number" ? v : 0);
      }, 0),
      todayIncome: st.personal && typeof st.personal.today === "number" ? st.personal.today : 0,
      totalIncome: st.personal && typeof st.personal.total === "number" ? st.personal.total : 0,
      todayTeamIncome: st.team && typeof st.team.today === "number" ? st.team.today : 0,
      totalTeamIncome: st.team && typeof st.team.total === "number" ? st.team.total : 0
    };
  }

  /**
   * Add income to the wallet. The amount must be a number or a
   * numeric string. Updates personal incomes and records a
   * transaction with type "income". Returns the updated wallet
   * summary.
   */
  function addIncome(amount) {
    var v = parseFloat(amount);
    if (isNaN(v) || v <= 0) return getWallet();
    var st = getState();
    if (!st) return getWallet();
    st.balances.USDT = (st.balances.USDT || 0) + v;
    if (!st.personal) st.personal = { today: 0, total: 0 };
    st.personal.today += v;
    st.personal.total += v;
    st.totalIncome += v;
    st.lastIncomeAt = new Date().toISOString();
    st.transactions.push({
      id: "tx_" + Date.now() + "_" + Math.floor(Math.random() * 100000),
      type: "income",
      amount: v,
      currency: "USDT",
      status: "SUCCESS",
      fee: 0,
      net: v,
      createdAt: new Date().toISOString(),
      note: "AI power income"
    });
    saveState(st);
    return getWallet();
  }


  /**
   * Record a manual deposit (recharge) initiated by the user. This is
   * used when the user sends real funds to the on‑screen address but
   * we only credit a demo balance in the front‑end.
   */
  function recordDeposit(amount, currency) {
    var v = parseFloat(amount);
    if (isNaN(v) || v <= 0) return getWallet();
    var st = getState();
    if (!st) return getWallet();
    var code = currency || "USDT";
    if (!st.balances) st.balances = {};
    if (typeof st.balances[code] !== "number") {
      st.balances[code] = 0;
    }
    st.balances[code] += v;
    var nowIso = new Date().toISOString();
    st.transactions.push({
      id: "tx_dep_" + Date.now() + "_" + Math.floor(Math.random() * 100000),
      type: "deposit",
      amount: v,
      currency: code,
      status: "SUCCESS",
      fee: 0,
      net: v,
      createdAt: nowIso,
      note: "Manual deposit (demo)"
    });
    saveState(st);
    return getWallet();
  }

  
  /**
   * Submit a blockchain deposit transaction hash (txid) to Supabase.
   * This only records a pending deposit row; it does not change the
   * front-end balance. A backend job / function can later verify the
   * tx on-chain and credit the user if valid.
   *
   * Params:
   *   txid    - transaction hash pasted by the user
   *   network - "BEP20", "TRC20", "ERC20", ...
   *   currency- e.g. "USDT"
   */
  
  /**
   * Try to read a BEP20 USDT transfer amount for a given txid using BscScan API.
   * This is a front-end only helper for demo purposes. It will only work on
   * BNB Smart Chain (BEP20) and requires you to set BSC_SCAN_API_KEY.
   *
   * If successful and the "to" address matches the current BEP20 deposit
   * address, it will call recordDeposit(amount, currency) to update the local
   * wallet balance, in addition to submitting the txid to Supabase.
   */
  function autoApplyBep20Deposit(txid, currency) {
    try {
      if (!txid || typeof txid !== "string") return;
      txid = txid.trim();
      if (!txid) return;
      if (!BSC_SCAN_API_KEY || BSC_SCAN_API_KEY === "PUT_YOUR_BSCSCAN_API_KEY_HERE") {
        return;
      }
      var st = getState();
      if (!st || !st.balances) return;
      var user = getUser && getUser();
      var uid = (st.userId) || (user && user.id);
      if (!uid) return;

      // We need the BEP20 deposit address from config if available
      var depAddr = null;
      if (window && window.depositNetworkConfigs && window.depositNetworkConfigs.BEP20) {
        depAddr = window.depositNetworkConfigs.BEP20.address;
      }
      if (!depAddr) return;
      depAddr = depAddr.toLowerCase();

      // Call BscScan tx API
      var url = "https://api.bscscan.com/api"
        + "?module=account&action=tokentx"
        + "&sort=desc&txhash=" + encodeURIComponent(txid)
        + "&apikey=" + encodeURIComponent(BSC_SCAN_API_KEY);

      fetch(url)
        .then(function (r) { return r.json(); })
        .then(function (data) {
          if (!data || data.status !== "1" || !data.result || !data.result.length) {
            return;
          }
          var tx = data.result[0];
          if (!tx.to) return;
          if (tx.to.toLowerCase() !== depAddr) return;

          // amount = value / 10^decimals
          var decimals = parseInt(tx.tokenDecimal || "18", 10);
          var raw = tx.value || "0";
          var amount = 0;
          try {
            // convert big integer string to float approximately
            var len = raw.length;
            if (decimals >= len) {
              var s = "0." + "0".repeat(decimals - len) + raw;
              amount = parseFloat(s);
            } else {
              var intPart = raw.slice(0, len - decimals);
              var fracPart = raw.slice(len - decimals);
              var s2 = intPart + "." + fracPart;
              amount = parseFloat(s2);
            }
          } catch (e) {
            return;
          }
          if (!amount || !isFinite(amount) || amount <= 0) return;

          // Apply to local wallet
          recordDeposit(amount, currency || "USDT");
        })
        .catch(function (err) {
          if (typeof console !== "undefined" && console && console.error) {
            console.error("BscScan fetch error", err);
          }
        });
    } catch (e) {
      if (typeof console !== "undefined" && console && console.error) {
        console.error("autoApplyBep20Deposit exception", e);
      }
    }
  }

function submitDepositTx(txid, network, currency) {
    try {
      if (!txid || typeof txid !== "string") return;
      txid = txid.trim();
      if (!txid) return;

      var st = getState();
      if (!st || !st.balances) return;
      var user = getUser && getUser();
      var uid = (st.userId) || (user && user.id);
      if (!uid) return;

      // Try to auto-apply BEP20 deposit amount locally (best-effort)
      var net = network || "BEP20";
      if (net === "BEP20") {
        autoApplyBep20Deposit(txid, currency);
      }

      var payload = {
        uid: uid,
        txid: txid,
        network: net,
        currency: currency || "USDT",
        status: "pending",
        created_at: new Date().toISOString()
      };

      var url = SUPABASE_URL + "/rest/v1/deposits";
      fetch(url, {
        method: "POST",
        headers: {
          "apikey": SUPABASE_KEY,
          "Authorization": "Bearer " + SUPABASE_KEY,
          "Content-Type": "application/json",
          "Prefer": "return=minimal"
        },
        body: JSON.stringify(payload)
      }).catch(function (err) {
        if (typeof console !== "undefined" && console && console.error) {
          console.error("Supabase deposit submit error", err);
        }
      });
    } catch (e) {
      if (typeof console !== "undefined" && console && console.error) {
        console.error("Supabase deposit submit exception", e);
      }
    }
  }

/**
   * Withdraw an amount from the USDT balance. A 5% fee is applied
   * according to the demo specification. If the amount is invalid or
   * exceeds the available balance the function returns null. On
   * success a transaction with type "withdraw" is recorded and the
   * updated wallet summary is returned.
   */
  function withdraw(amount) {
    var v = parseFloat(amount);
    if (isNaN(v) || v <= 0) return null;
    var st = getState();
    if (!st) return null;
    var available = st.balances.USDT || 0;
    if (v > available) return null;
    var fee = v * 0.05;
    var net = v - fee;
    st.balances.USDT = available - v;
    st.lastWithdrawAt = new Date().toISOString();
    st.transactions.push({
      id: "tx_" + Date.now() + "_" + Math.floor(Math.random() * 100000),
      type: "withdraw",
      amount: v,
      currency: "USDT",
      status: "PENDING",
      fee: fee,
      net: net,
      createdAt: new Date().toISOString(),
      note: "Withdrawal request (demo)"
    });
    saveState(st);
    return getWallet();
  }


  /**
   * Record a manual deposit (recharge) initiated by the user. This is
   * used when the user sends real funds to the on‑screen address but
   * we only credit a demo balance in the front‑end.
   */
  function recordDeposit(amount, currency) {
    var v = parseFloat(amount);
    if (isNaN(v) || v <= 0) return getWallet();
    var st = getState();
    if (!st) return getWallet();
    var code = currency || "USDT";
    if (!st.balances) st.balances = {};
    if (typeof st.balances[code] !== "number") {
      st.balances[code] = 0;
    }
    st.balances[code] += v;
    var nowIso = new Date().toISOString();
    st.transactions.push({
      id: "tx_dep_" + Date.now() + "_" + Math.floor(Math.random() * 100000),
      type: "deposit",
      amount: v,
      currency: code,
      status: "SUCCESS",
      fee: 0,
      net: v,
      createdAt: nowIso,
      note: "Manual deposit (demo)"
    });
    saveState(st);
    return getWallet();
  }

  /**
   * Record a currency swap. This deducts from the fromToken balance
   * and increases the toToken balance by the received amount. A
   * transaction with type "swap" is appended to the history. If the
   * fromToken balance is insufficient the function still records the
   * swap but the negative balance will be reflected in the summary.
   */
  function recordSwap(fromToken, toToken, amountFrom, amountTo) {
    var st = getState();
    if (!st) return;
    var f = String(fromToken || "USDT").toUpperCase();
    var t = String(toToken || "USDT").toUpperCase();
    var af = parseFloat(amountFrom);
    var at = parseFloat(amountTo);
    if (isNaN(af) || af <= 0) return;
    if (isNaN(at) || at <= 0) at = af;
    if (!st.balances) st.balances = {};
    if (typeof st.balances[f] !== "number") st.balances[f] = 0;
    if (typeof st.balances[t] !== "number") st.balances[t] = 0;
    st.balances[f] -= af;
    st.balances[t] += at;
    st.transactions.push({
      id: "tx_" + Date.now() + "_" + Math.floor(Math.random() * 100000),
      type: "swap",
      amount: af,
      currency: f + "→" + t,
      status: "SUCCESS",
      fee: 0,
      net: at,
      createdAt: new Date().toISOString(),
      note: "Swap (demo)"
    });
    saveState(st);
  }

  /**
   * Return a copy of the transaction list from the state. Each call
   * returns a new array so that callers don't mutate the internal
   * state inadvertently.
   */
  function getTransactions() {
    var st = getState();
    if (!st || !Array.isArray(st.transactions)) return [];
    return st.transactions.slice();
  }

  /**
   * Compute VIP level and progress. Levels are defined on the USDT
   * balance only. Returns an object describing the current and next
   * level and a textual progress indicator. The feePercent is fixed
   * at 5% for all levels in this demo.
   */
  function getVipInfo() {
    var w = getWallet();
    var bal = w.balance || 0;
    var levels = [
      { name: "V0", minBalance: 0,    minUsers: 0 },
      { name: "V1", minBalance: 50,   minUsers: 5 },
      { name: "V2", minBalance: 500,  minUsers: 5 },
      { name: "V3", minBalance: 3000, minUsers: 10 },
      { name: "V4", minBalance: 10000,minUsers: 10 },
      { name: "V5", minBalance: 30000,minUsers: 10 },
      { name: "V6", minBalance: 100000,minUsers: 10 }
    ];
    // Determine the number of effective users from the team summary.
    var effectiveUsers = 0;
    try {
      var ts = getTeamSummary();
      if (ts && typeof ts.teamSize === 'number') {
        effectiveUsers = ts.teamSize;
      }
    } catch (e) {}
    var current = levels[0];
    for (var i = levels.length - 1; i >= 0; i--) {
      var lv = levels[i];
      if (bal >= lv.minBalance && effectiveUsers >= lv.minUsers) {
        current = lv;
        break;
      }
    }
    var next = null;
    for (var j = 0; j < levels.length; j++) {
      if (levels[j].name === current.name) {
        next = levels[j + 1] || null;
        break;
      }
    }
    var progressText = '';
    var progressPercent = 100;
    if (next) {
      var need = next.minBalance;
      var have = bal;
      var pct = need > 0 ? Math.min(100, Math.floor((have / need) * 100)) : 100;
      progressPercent = pct;
      progressText = have.toFixed(2) + ' / ' + need + ' USDT (' + pct + '%)';
    }
    return {
      currentLevel: current.name,
      nextLevel: next ? next.name : null,
      progressText: progressText,
      progressPercent: progressPercent,
      feePercent: 5
    };
  }

  /**
   * Provide the invite code and registration link for the current
   * user. If the link is not already stored in the state one is
   * generated using the current location's origin (or a fallback). The
   * link ends with '?code=<code>' to match how invite.html builds
   * smart defaults.
   */
  function getInviteInfo() {
    var user = getUser();
    var st = getState();
    if (!user || !st) return { code: null, link: null };
    // Update invite code on state if missing
    if (!st.invite) st.invite = {};
    if (user && user.invitationCode) st.invite.code = user.invitationCode;
    // Build link only if not present
    if (!st.invite.link) {
      var origin = '';
      try {
        origin = window.location.origin || '';
      } catch (e) {
        origin = '';
      }
      var path = '/signup.html';
      var code = st.invite.code || user.invitationCode;
      st.invite.link = origin + path + '?code=' + encodeURIComponent(code);
      saveState(st);
    }
    return { code: st.invite.code, link: st.invite.link };
  }

  /**
   * Return an empty team summary. Real team calculations are beyond
   * the scope of this demo. If a teamSummary exists in state it is
   * returned instead.
   */
  function getTeamSummary() {
    // Build the team summary based on persistent team data. Each
    // invitation code in localStorage.demoTeams_v1 maps to an array
    // of member objects. When called for the current user, we
    // retrieve the members list keyed by the user's invitation code
    // and compute counts. If no data exists, return an empty summary.
    var user = getUser();
    if (!user || !user.invitationCode) {
      return {
        teamSize: 0,
        todayIncome: 0,
        totalIncome: 0,
        generations: {
          1: { generation: 1, effective: 0, percent: 0, income: 0 },
          2: { generation: 2, effective: 0, percent: 0, income: 0 },
          3: { generation: 3, effective: 0, percent: 0, income: 0 }
        },
        members: []
      };
    }
    var code = String(user.invitationCode).toUpperCase();
    var teams = loadJson(TEAMS_KEY);
    if (!teams || typeof teams !== 'object') teams = {};
    var members = Array.isArray(teams[code]) ? teams[code].slice() : [];
    var size = members.length;
    // For this demo all referred users count as generation 1
    var gens = {
      1: { generation: 1, effective: size, percent: size > 0 ? 20 : 0, income: 0 },
      2: { generation: 2, effective: 0, percent: 0, income: 0 },
      3: { generation: 3, effective: 0, percent: 0, income: 0 }
    };
    return {
      teamSize: size,
      todayIncome: 0,
      totalIncome: 0,
      generations: gens,
      members: members
    };
  }

  /**
   * Register a referral. If the provided inviteCode matches the
   * current user's invitation code we simply record it in the state so
   * that future expansions can calculate effective users. For a real
   * backend this would instead look up another user's code.
   */
  function registerReferral(inviteCode, info) {
    var code = String(inviteCode || '').trim().toUpperCase();
    if (!code) return false;
    // Load the team map from storage
    var teams = loadJson(TEAMS_KEY);
    if (!teams || typeof teams !== 'object') teams = {};
    if (!Array.isArray(teams[code])) {
      teams[code] = [];
    }
    // Build a new member entry
    var item = {
      account: info && info.account ? info.account : 'demo' + (teams[code].length + 1),
      userId: info && info.userId ? info.userId : generateUserId(),
      level: info && info.level ? info.level : 1,
      generation: info && info.generation ? info.generation : 1,
      registeredAt: info && info.registeredAt ? info.registeredAt : new Date().toISOString().slice(0, 19).replace('T', ' ')
    };
    teams[code].push(item);
    saveJson(TEAMS_KEY, teams);
    return true;
  }

  /**
   * Apply wallet data to the Assets page. This fills in the balance,
   * donut, personal/team incomes and currency rows. It is wrapped in
   * try/catch so that missing DOM elements do not break the page.
   */
  function applyToAssetsPage() {
    try {
      var w = getWallet();
      // Main balance and donut
      var balanceEl = document.querySelector('.assets-usdt-balance');
      if (balanceEl) {
        // Display the total of all tokens as the main balance. The original
        // implementation showed only the USDT balance which led to
        // confusion after swaps into other tokens. Use totalUSDT to
        // represent the combined value of all currencies in USDT units.
        var val = typeof w.totalUSDT === 'number' ? w.totalUSDT.toFixed(2) : '0.00';
        balanceEl.textContent = val.replace(/\.00$/, '') + ' USDT';
      }
      var donutInner = document.querySelector('.donut-inner');
      if (donutInner) {
        var total = typeof w.totalUSDT === 'number' ? w.totalUSDT.toFixed(2) : '0.00';
        donutInner.innerHTML = '<strong>Total Assets</strong>≈$' + total.replace(/\.00$/, '');
      }
      // Personal income
      var totalPersonal = document.querySelector('.assets-total-personal');
      if (totalPersonal) {
        var tPers = typeof w.totalIncome === 'number' ? w.totalIncome.toFixed(2) : '0.00';
        totalPersonal.textContent = tPers.replace(/\.00$/, '') + ' USDT';
      }
      var todayPersonal = document.querySelector('.assets-today-personal');
      if (todayPersonal) {
        var dPers = typeof w.todayIncome === 'number' ? w.todayIncome.toFixed(2) : '0.00';
        todayPersonal.textContent = dPers.replace(/\.00$/, '') + ' USDT';
      }
      // Team income
      var totalTeam = document.querySelector('.assets-total-team');
      if (totalTeam) {
        var tTeam = typeof w.totalTeamIncome === 'number' ? w.totalTeamIncome.toFixed(2) : '0.00';
        totalTeam.textContent = tTeam.replace(/\.00$/, '') + ' USDT';
      }
      var todayTeam = document.querySelector('.assets-today-team');
      if (todayTeam) {
        var dTeam = typeof w.todayTeamIncome === 'number' ? w.todayTeamIncome.toFixed(2) : '0.00';
        todayTeam.textContent = dTeam.replace(/\.00$/, '') + ' USDT';
      }
      // Currency list
      var rows = document.querySelectorAll('.currency-list .currency-row');
      if (rows && rows.length) {
        rows.forEach(function (row) {
          var symbol = (row.getAttribute('data-symbol') || '').toUpperCase();
          var amountEl = row.querySelector('.currency-amount');
          if (!amountEl) return;
          var val2 = w.balances && typeof w.balances[symbol] === 'number' ? w.balances[symbol] : 0;
          amountEl.textContent = String(parseFloat(val2.toFixed(2))).replace(/\.00$/, '');
        });
      }
      // Token percentages: allocate 100% to USDT if present
      var tokenRows = document.querySelectorAll('.token-row');
      if (tokenRows && tokenRows.length) {
        tokenRows.forEach(function (row) {
          var symbol = (row.getAttribute('data-symbol') || '').toUpperCase();
          var percentEl = row.querySelector('.token-percent');
          if (!percentEl) return;
          var val3 = w.totalUSDT > 0 ? ((w.balances[symbol] || 0) / w.totalUSDT) * 100 : 0;
          percentEl.textContent = (symbol === 'USDT' ? '100%' : val3.toFixed(2) + '%');
        });
      }
    } catch (e) {
      // Swallow DOM errors silently; the rest of the page may still work
    }
  }

  /**
   * Grant a one‑time signup bonus to the wallet if it hasn't been
   * claimed before. This bonus is 5 USDT and is recorded as an
   * "income" transaction with source "signup-bonus". The function
   * returns the updated wallet summary.
   */
    /**
   * (Disabled) One-time signup bonus.
   * NOTE: New users already receive 3 USDT in createNewState().
   * This function is kept for backward compatibility but it does NOT add balance,
   * to prevent 3 + 5 = 8 USDT.
   */
  function grantSignupBonusOnce() {
    var st = getState();
    if (!st) return getWallet();
    if (st.signupBonusClaimed) return getWallet();
    st.signupBonusClaimed = true;
    saveState(st);
    return getWallet();
  }


  /**
   * Record a manual deposit (recharge) initiated by the user. This is
   * used when the user sends real funds to the on‑screen address but
   * we only credit a demo balance in the front‑end.
   */
  function recordDeposit(amount, currency) {
    var v = parseFloat(amount);
    if (isNaN(v) || v <= 0) return getWallet();
    var st = getState();
    if (!st) return getWallet();
    var code = currency || "USDT";
    if (!st.balances) st.balances = {};
    if (typeof st.balances[code] !== "number") {
      st.balances[code] = 0;
    }
    st.balances[code] += v;
    var nowIso = new Date().toISOString();
    st.transactions.push({
      id: "tx_dep_" + Date.now() + "_" + Math.floor(Math.random() * 100000),
      type: "deposit",
      amount: v,
      currency: code,
      status: "SUCCESS",
      fee: 0,
      net: v,
      createdAt: nowIso,
      note: "Manual deposit (demo)"
    });
    saveState(st);
    return getWallet();
  }

  /**
   * Compute withdraw rules for the current VIP level. A 5% fee is
   * applied uniformly. The minimum and maximum amounts are derived
   * from the getVipInfo() definitions.
   */
  function getCurrentWithdrawRules() {
    var vip = getVipInfo();
    // Basic default rules
    var rules = { minWithdraw: 20, maxWithdraw: 500, feePercent: 5 };
    if (!vip || !vip.currentLevel) return rules;
    // Map levels to rules
    var map = {
      V0: { minWithdraw: 20, maxWithdraw: 500, feePercent: 5 },
      V1: { minWithdraw: 20, maxWithdraw: 500, feePercent: 5 },
      V2: { minWithdraw: 20, maxWithdraw: 1000, feePercent: 5 },
      V3: { minWithdraw: 20, maxWithdraw: 2000, feePercent: 5 },
      V4: { minWithdraw: 20, maxWithdraw: 3000, feePercent: 5 },
      V5: { minWithdraw: 20, maxWithdraw: 5000, feePercent: 5 },
      V6: { minWithdraw: 20, maxWithdraw: 7000, feePercent: 5 }
    };
    return map[vip.currentLevel] || rules;
  }

  /**
   * Withdraw respecting VIP rules. If the amount violates min/max
   * constraints this returns false, otherwise it invokes withdraw().
   */
  function vipAwareWithdraw(amount) {
    var rules = getCurrentWithdrawRules();
    var v = parseFloat(amount);
    if (isNaN(v) || v <= 0) return false;
    if (v < rules.minWithdraw || v > rules.maxWithdraw) return false;
    var result = withdraw(v);
    return !!result;
  }

  /**
   * For backwards compatibility some pages call getUserProfile(). It
   * simply returns the current user.
   */
  function getUserProfile() {
    return getUser();
  }

  // Expose the API on window.DemoWallet. If an existing object
  // exists we merge into it rather than overwriting entirely.
  if (!window.DemoWallet) {
    window.DemoWallet = {};
  }
  var api = {
    // User and state
    getUser: getUser,
    setUser: setUser,
    getState: getState,
    saveState: saveState,
    // Wallet operations
    getWallet: getWallet,
    addIncome: addIncome,
    recordDeposit: recordDeposit,
    submitDepositTx: submitDepositTx,
    withdraw: withdraw,
    recordSwap: recordSwap,
    getTransactions: getTransactions,
    // Info providers
    getVipInfo: getVipInfo,
    getInviteInfo: getInviteInfo,
    getTeamSummary: getTeamSummary,
    applyToAssetsPage: applyToAssetsPage,
    registerReferral: registerReferral,
    // Bonus and VIP aware withdraw
    grantSignupBonusOnce: grantSignupBonusOnce,
    getCurrentWithdrawRules: getCurrentWithdrawRules,
    vipAwareWithdraw: vipAwareWithdraw,
    // Legacy alias
    getUserProfile: getUserProfile
  };
  Object.keys(api).forEach(function (k) {
    window.DemoWallet[k] = api[k];
  });
})(window);