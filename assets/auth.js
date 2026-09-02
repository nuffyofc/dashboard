/*
 * Lightweight password gate for a static, no-backend site.
 *
 * Honest limits, worth reading before relying on this: this page has no
 * server, so there is nothing that can truly keep someone out — anyone
 * who has the URL can view the page source and read this file. Hashing
 * the password (below) means the real password isn't sitting in plain
 * text for a casual look at the source, but it is NOT protection against
 * someone who deliberately inspects the code or already knows how this
 * works. What it *does* do well: it stops a stranger who stumbles on the
 * link (search engines, a shared bookmark, a forwarded URL) from opening
 * the tool casually, and it's a normal, expected gate for an internal
 * team tool. It does not protect any ticket data — that data never lives
 * on this page anyway; each visitor's tickets stay in their own browser
 * (see README.md).
 *
 * Changing the password:
 * 1. Open any page (or the browser console on this site) and run:
 *      crypto.subtle.digest("SHA-256", new TextEncoder().encode("your-new-password"))
 *        .then(b => console.log([...new Uint8Array(b)].map(x => x.toString(16).padStart(2,"0")).join("")))
 * 2. Copy the printed 64-character hash and paste it in place of
 *    PASSWORD_HASH below. Commit and push — that's the whole change.
 */
(function (global) {
  "use strict";

  // Default password: kovanec-tulipan-borovnica-97 — change it (see above).
  var PASSWORD_HASH = "bec1eed698365a6f85001a08a16df9daec678d7b62b6ab6e2982893acc8acb4f";

  // sessionStorage (not localStorage) on purpose: closing the browser
  // tab/window requires the password again. Swap to localStorage below
  // if you'd rather it stay unlocked across restarts on a trusted device.
  var STORE = window.sessionStorage;
  var UNLOCK_KEY = "bossTable.unlocked.v1";

  function sha256Hex(text) {
    var data = new TextEncoder().encode(text);
    return crypto.subtle.digest("SHA-256", data).then(function (buf) {
      return Array.prototype.map.call(new Uint8Array(buf), function (b) {
        return b.toString(16).padStart(2, "0");
      }).join("");
    });
  }

  function isUnlocked() {
    try { return STORE.getItem(UNLOCK_KEY) === "1"; } catch (e) { return false; }
  }
  function markUnlocked() {
    try { STORE.setItem(UNLOCK_KEY, "1"); } catch (e) { /* private mode etc — still works this load */ }
  }

  function buildGate() {
    var overlay = document.createElement("div");
    overlay.className = "auth-gate";
    overlay.innerHTML =
      '<form class="auth-card" id="authForm">' +
      '  <div class="auth-mark">🎫</div>' +
      '  <h1>GA SUPPORT · <span class="gold">BOSS TABLE</span></h1>' +
      '  <p class="auth-sub">Dostop je zaščiten z geslom.</p>' +
      '  <div class="auth-hint">🪙 &mdash; 🌷 &mdash; 🫐 &mdash; 97</div>' +
      '  <input type="password" id="authInput" placeholder="Geslo" autocomplete="current-password" autofocus>' +
      '  <button type="submit" class="btn primary">Odkleni</button>' +
      '  <div class="auth-error" id="authError" hidden>Napačno geslo — poskusi znova.</div>' +
      '</form>';
    return overlay;
  }

  function showGate(onSuccess) {
    var overlay = buildGate();
    document.body.appendChild(overlay);
    var form = overlay.querySelector("#authForm");
    var input = overlay.querySelector("#authInput");
    var error = overlay.querySelector("#authError");
    input.focus();

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      sha256Hex(input.value).then(function (hash) {
        if (hash === PASSWORD_HASH) {
          markUnlocked();
          overlay.remove();
          document.body.classList.remove("locked");
          onSuccess();
        } else {
          error.hidden = false;
          overlay.querySelector(".auth-card").classList.add("shake");
          input.value = "";
          input.focus();
          setTimeout(function () {
            overlay.querySelector(".auth-card").classList.remove("shake");
          }, 400);
        }
      });
    });
  }

  global.TicketAuth = { isUnlocked: isUnlocked, showGate: showGate };
})(window);
