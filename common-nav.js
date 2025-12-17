// Placeholder for common navigation behaviour.
// The original project references this script on many pages. In the
// absence of any specification it simply highlights the current page
// in the footer navigation if such elements exist.
;(function(window) {
  "use strict";
  function initNav() {
    try {
      var pathname = window.location.pathname || '';
      // Determine base name without extension, e.g. 'my-assets'
      var name = pathname.split('/').pop() || '';
      if (name.indexOf('.') >= 0) {
        name = name.slice(0, name.lastIndexOf('.'));
      }
      var items = document.querySelectorAll('.bottom-nav .bottom-item');
      items.forEach(function(item) {
        var cls = item.classList;
        // Each bottom-item may have a class that matches a page name
        cls.remove('active');
        var names = Array.from(cls);
        if (names.indexOf(name) >= 0) {
          cls.add('active');
        }
      });
    } catch (e) {
      // Silent fail – navigation highlighting is non‑critical
    }
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initNav);
  } else {
    initNav();
  }
})(window);