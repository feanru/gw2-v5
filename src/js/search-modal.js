// search-modal.js
// Carga el modal de búsqueda estándar utilizando search-modal-core

(function() {
  function start() {
    if (typeof initSearchModal === 'function') {
      initSearchModal({
        onSelect: function(id) {
          window.location.href = `/item?id=${id}`;
        },
        formatPrice: window.formatGoldColored,
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
