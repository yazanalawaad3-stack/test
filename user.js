/* user.js
 * User profile helper (no auth/register here).
 * Depends on auth.js if present (uses ExaAuth.getSupabaseUserId()).
 * Exposes:
 *   window.SBUser.getCurrentProfile() -> Promise<{id, phone, inviteCode, publicId, createdAt} | null>
 *   window.SBUser.fetchUserRowById(id) -> Promise<row|null>
 */
;(function (window) {
  "use strict";

  // Keep only what this file truly needs.
  var SUPABASE_URL = "https://oyowsjjmaesspqiknvhp.supabase.co";
  var SUPABASE_ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im95b3dzamptYWVzc3BxaWtudmhwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjU4MTE4NzcsImV4cCI6MjA4MTM4Nzg3N30.aBo32xNG_dh1QD7NBI4N6jhYFLY42Xyxer2DNXxJi-w";
  var SB_USER_ID_KEY = "sb_user_id_v1"; // fallback only if auth.js isn't loaded

  function apiHeaders() {
    return {
      apikey: SUPABASE_ANON,
      Authorization: "Bearer " + SUPABASE_ANON,
      "Content-Type": "application/json",
      Accept: "application/json"
    };
  }

  function getSupabaseUserId() {
    // Prefer auth.js (single source of truth)
    try {
      if (window.ExaAuth && typeof window.ExaAuth.getSupabaseUserId === "function") {
        return String(window.ExaAuth.getSupabaseUserId() || "");
      }
    } catch (e) {}

    // Fallback: read directly
    try { return localStorage.getItem(SB_USER_ID_KEY) || ""; } catch (e) { return ""; }
  }

  async function fetchUserRowById(id) {
    id = String(id || "").trim();
    if (!id) return null;

    var url = SUPABASE_URL +
      "/rest/v1/users?select=id,phone,invite_code,public_id,created_at&id=eq." +
      encodeURIComponent(id) + "&limit=1";

    var res = await fetch(url, { method: "GET", headers: apiHeaders() });
    if (!res.ok) return null;

    var rows = await res.json();
    return (Array.isArray(rows) && rows[0]) ? rows[0] : null;
  }

  async function getCurrentProfile() {
    var id = getSupabaseUserId();
    if (!id) return null;

    var row = await fetchUserRowById(id);
    if (!row) return null;

    return {
      id: row.id || "",
      phone: row.phone || "",
      inviteCode: row.invite_code || "",
      publicId: row.public_id || "",
      createdAt: row.created_at || ""
    };
  }

  window.SBUser = {
    getCurrentProfile: getCurrentProfile,
    fetchUserRowById: fetchUserRowById
  };
})(window);
