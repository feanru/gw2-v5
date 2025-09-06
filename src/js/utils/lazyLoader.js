export function initLazyImages() {
  const io = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const img = entry.target;
        img.src = img.dataset.src;
        io.unobserve(img);
      }
    });
  });
  document.querySelectorAll('img[data-src]').forEach(img => io.observe(img));
}

export function observeSection(el, callback) {
  if (!el) return;
  const io = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        callback();
        io.unobserve(entry.target);
      }
    });
  });
  io.observe(el);
}
