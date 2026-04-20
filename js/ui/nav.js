// Shared top navigation bar.

export function renderNav(active) {
  const isA = k => (active === k ? 'aria-current="page"' : '');
  return `
    <nav class="nav">
      <a href="./index.html" class="nav__brand">
        <span class="nav__brand-mark" aria-hidden="true"></span>
        <span>JLC Parts Explorer</span>
      </a>
      <div class="nav__links">
        <a href="./search.html" ${isA('search')}>Search</a>
        <a href="./category.html?cat=capacitors" ${isA('category')}>Browse</a>
        <a href="./bom.html" ${isA('bom')}>BOM</a>
        <a href="./index.html#pillars">Overview</a>
      </div>
    </nav>
  `;
}

export function mountNav(active) {
  const host = document.querySelector('[data-nav]');
  if (host) host.outerHTML = renderNav(active);
}
