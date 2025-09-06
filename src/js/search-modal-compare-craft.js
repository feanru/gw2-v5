// search-modal-compare-craft.js
// Configura el modal de búsqueda para compare-craft.html utilizando search-modal-core

(function() {
  function start() {
    if (typeof initSearchModal === 'function') {
      initSearchModal({
        onSelect: function(id, e) {
          if (window.selectItem) window.selectItem(id, e);
        },
        formatPrice: function(v) { return v || 0; },
        useSuggestions: false
      });
    }
  }

  if (typeof initSearchModal === 'undefined') {
    var script = document.createElement('script');
    script.type = 'module';
    script.src = '/dist/js/search-modal-core.min.js';
    script.onload = start;
    document.body.appendChild(script);
  } else {
    start();
  }
})();
