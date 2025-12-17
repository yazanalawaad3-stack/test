// sb-config.js
;(function (window) {
  "use strict";
  window.SB_CONFIG = {
    url: "https://oyowsjjmaesspqiknvhp.supabase.co",
    anonKey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im95b3dzamptYWVzc3BxaWtudmhwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjU4MTE4NzcsImV4cCI6MjA4MTM4Nzg3N30.aBo32xNG_dh1QD7NBI4N6jhYFLY42Xyxer2DNXxJi-w"
  };

  window.SB_HEADERS = function () {
    return {
      "apikey": window.SB_CONFIG.anonKey,
      "Authorization": "Bearer " + window.SB_CONFIG.anonKey,
      "Content-Type": "application/json"
    };
  };

  window.SB_REST = function (path) {
    return window.SB_CONFIG.url.replace(/\/$/, "") + "/rest/v1/" + path.replace(/^\//, "");
  };

  window.SB_RPC = function (fnName) {
    return window.SB_CONFIG.url.replace(/\/$/, "") + "/rest/v1/rpc/" + fnName;
  };
})(window);
