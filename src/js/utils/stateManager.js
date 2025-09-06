const renderers = new Map();
const visibility = new WeakMap();

const observer = new IntersectionObserver(entries => {
  entries.forEach(entry => {
    const el = entry.target;
    visibility.set(el, entry.isIntersecting);
    if (entry.isIntersecting) {
      const id = el.dataset.stateId || el.dataset.path;
      if (!id) return;
      const list = renderers.get(id);
      if (!list) return;
      const item = list.find(r => r.el === el);
      const data = el._pendingState;
      if (item && data) {
        item.renderFn(data);
        el._pendingState = null;
      }
    }
  });
});

export function register(id, el, renderFn) {
  const key = String(id);
  el.dataset.stateId = key;
  let list = renderers.get(key);
  if (!list) {
    list = [];
    renderers.set(key, list);
  }
  list.push({ el, renderFn });
  observer.observe(el);
}

export function update(id, data) {
  const list = renderers.get(String(id));
  if (!list) return;
  list.forEach(({ el, renderFn }) => {
    if (visibility.get(el)) {
      renderFn && renderFn(data);
    } else {
      el._pendingState = data;
    }
  });
}
