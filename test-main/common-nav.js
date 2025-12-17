// common-nav.js
// Safe navigation helper (does not touch styling).
;(function (window, document) {
  "use strict";
  try {
    // Optional: allow tabbar items to be clickable if they have data-href
    var items = document.querySelectorAll(".tabbar .tab-item[data-href]");
    for (var i = 0; i < items.length; i++) {
      (function (el) {
        el.addEventListener("click", function () {
          var href = el.getAttribute("data-href");
          if (href) window.location.href = href;
        });
      })(items[i]);
    }
  } catch (e) {}
})(window, document);
