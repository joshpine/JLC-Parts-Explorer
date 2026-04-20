import { mountNav } from '../ui/nav.js';
import { resultTable } from '../ui/result-row.js';
import { loadCategory, loadBrands, knownCategories } from '../data-loader.js';
import { formatValue } from '../parser.js';
import { formatTolerance, escape } from '../format.js';
import { TIER_ORDER } from '../tiers.js';

const UNIT = { capacitors: 'F', resistors: 'Ω', inductors: 'H', crystals: 'Hz' };

const state = {
  category: 'capacitors',
  inStockOnly: true,
  basicOnly: false,
  filters: {
    package: new Set(),
    tolerance: new Set(),
    voltage: new Set(),
    tempco: new Set(),
    brand: new Set(),
    color: new Set(),
    channel: new Set(),
  },
};

function readUrl() {
  const url = new URL(location.href);
  const cat = url.searchParams.get('cat');
  if (cat) state.category = cat;
  if (url.searchParams.has('stock')) state.inStockOnly = url.searchParams.get('stock') === '1';
  if (url.searchParams.has('basic')) state.basicOnly   = url.searchParams.get('basic') === '1';
  for (const facet of Object.keys(state.filters)) {
    const v = url.searchParams.get(facet);
    if (v) state.filters[facet] = new Set(v.split('|').filter(Boolean));
  }
}
function writeUrl() {
  const url = new URL(location.href);
  url.searchParams.set('cat', state.category);
  url.searchParams.set('stock', state.inStockOnly ? '1' : '0');
  url.searchParams.set('basic', state.basicOnly ? '1' : '0');
  for (const [k, set] of Object.entries(state.filters)) {
    if (set.size) url.searchParams.set(k, [...set].join('|'));
    else url.searchParams.delete(k);
  }
  history.replaceState({}, '', url);
}

function titleCase(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

function matchesFacets(p) {
  const f = state.filters;
  if (f.package.size   && !f.package.has(p.package))         return false;
  if (f.tolerance.size && !f.tolerance.has(String(p.tolerance ?? ''))) return false;
  if (f.voltage.size   && !f.voltage.has(String(p.voltage ?? '')))     return false;
  if (f.tempco.size    && !f.tempco.has(p.tempco || ''))     return false;
  if (f.brand.size     && !f.brand.has(p.mfr))               return false;
  if (f.color.size     && !f.color.has(p.color || ''))       return false;
  if (f.channel.size   && !f.channel.has(p.channel || ''))   return false;
  if (state.inStockOnly && !p.stock)                         return false;
  if (state.basicOnly && p.tier !== 'basic')                 return false;
  return true;
}

function buildCounts(parts) {
  const fields = ['package', 'tolerance', 'voltage', 'tempco', 'mfr', 'color', 'channel'];
  const counts = Object.fromEntries(fields.map(k => [k, new Map()]));
  for (const p of parts) {
    for (const k of fields) {
      const raw = p[k];
      if (raw == null || raw === '') continue;
      const key = String(raw);
      counts[k].set(key, (counts[k].get(key) || 0) + 1);
    }
  }
  return counts;
}

function facetCheckbox(facet, value, label, n, checked) {
  return `<label class="facet__option">
    <input type="checkbox" data-facet="${facet}" value="${escape(value)}" ${checked ? 'checked' : ''} />
    <span>${escape(label)}</span><span class="facet__option-count">${n}</span>
  </label>`;
}

function renderFacets(all, brands) {
  const counts = buildCounts(all);
  const host = document.getElementById('facets');
  const blocks = [];

  const cat = state.category;
  const valueUnit = UNIT[cat];

  // Package facet (always)
  if (counts.package.size) {
    blocks.push(renderBlock('Package', [...counts.package.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([v, n]) => facetCheckbox('package', v, v, n, state.filters.package.has(v))).join('')));
  }

  // Value-class specific
  if (cat === 'capacitors' && counts.tempco.size) {
    blocks.push(renderBlock('Temp. Coefficient', [...counts.tempco.entries()]
      .sort((a, b) => ({C0G: 0, X7R: 1, X5R: 2, Y5V: 3}[a[0]] ?? 9) - ({C0G:0,X7R:1,X5R:2,Y5V:3}[b[0]] ?? 9))
      .map(([v, n]) => facetCheckbox('tempco', v, v, n, state.filters.tempco.has(v))).join('')));
  }

  if (counts.tolerance.size) {
    blocks.push(renderBlock('Tolerance', [...counts.tolerance.entries()]
      .sort((a, b) => parseFloat(a[0]) - parseFloat(b[0]))
      .map(([v, n]) => facetCheckbox('tolerance', v, formatTolerance(parseFloat(v)), n, state.filters.tolerance.has(v))).join('')));
  }

  if (counts.voltage.size) {
    blocks.push(renderBlock('Voltage', [...counts.voltage.entries()]
      .sort((a, b) => parseFloat(a[0]) - parseFloat(b[0]))
      .map(([v, n]) => facetCheckbox('voltage', v, `${v}V`, n, state.filters.voltage.has(v))).join('')));
  }

  if (cat === 'leds' && counts.color.size) {
    blocks.push(renderBlock('Color', [...counts.color.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([v, n]) => facetCheckbox('color', v, titleCase(v), n, state.filters.color.has(v))).join('')));
  }

  if (cat === 'mosfets' && counts.channel.size) {
    blocks.push(renderBlock('Channel', [...counts.channel.entries()]
      .map(([v, n]) => facetCheckbox('channel', v, `${v}-Channel`, n, state.filters.channel.has(v))).join('')));
  }

  // Brand facet — grouped by tier
  if (counts.mfr.size) {
    const entries = [...counts.mfr.entries()]
      .map(([m, n]) => ({ mfr: m, n, info: brands[m] }))
      .sort((a, b) => {
        // global first, then by count
        const tA = a.info?.tier === 'global' ? 0 : 1;
        const tB = b.info?.tier === 'global' ? 0 : 1;
        if (tA !== tB) return tA - tB;
        return b.n - a.n;
      });
    const inner = entries.map(e => {
      const tierMark = e.info?.tier === 'global'
        ? `<span style="color:var(--accent-tier1)">●</span>`
        : `<span style="color:var(--fg-3)">○</span>`;
      const name = e.info?.display || e.mfr;
      return `<label class="facet__option">
        <input type="checkbox" data-facet="brand" value="${escape(e.mfr)}" ${state.filters.brand.has(e.mfr) ? 'checked' : ''} />
        ${tierMark}<span>${escape(name)}</span><span class="facet__option-count">${e.n}</span>
      </label>`;
    }).join('');
    blocks.push(renderBlock('Brand', inner));
  }

  host.innerHTML = blocks.join('');
}

function renderBlock(title, inner) {
  return `<div class="facet"><div class="facet__title">${title}</div>${inner}</div>`;
}

function renderChips() {
  const host = document.getElementById('cat-chips');
  const chips = [];
  for (const [facet, set] of Object.entries(state.filters)) {
    for (const v of set) {
      let label = v;
      if (facet === 'tolerance') label = formatTolerance(parseFloat(v));
      if (facet === 'voltage') label = `${v}V`;
      if (facet === 'color' || facet === 'channel') label = titleCase(v);
      chips.push(`<span class="chip" data-chip-key="${facet}"><span class="chip__kind">${escape(facet)}</span><span class="chip__label">${escape(label)}</span><button class="chip__close" data-chip-remove data-facet="${escape(facet)}" data-value="${escape(v)}" aria-label="Remove ${escape(facet)} filter">×</button></span>`);
    }
  }
  host.innerHTML = chips.join('');
}

function renderTabs() {
  const host = document.getElementById('cat-tabs');
  host.innerHTML = knownCategories().map(c => {
    const active = c === state.category;
    const cls = active ? 'chip chip--value' : 'chip chip--hint';
    return `<a href="?cat=${c}" class="${cls}"><span class="chip__label">${titleCase(c)}</span></a>`;
  }).join('');
}

function renderHeader(total, filtered) {
  document.getElementById('cat-crumbs').textContent = `Browse · ${state.category.toUpperCase()}`;
  document.getElementById('cat-title').textContent = titleCase(state.category);
  document.getElementById('cat-count').innerHTML =
    `<span class="mono">${filtered}</span> of <span class="mono">${total}</span> parts match your filters.`;
  document.getElementById('toggle-instock').checked = state.inStockOnly;
  document.getElementById('toggle-basiconly').checked = state.basicOnly;
}

function renderTable(parts, brands) {
  const host = document.getElementById('cat-results');
  if (!parts.length) {
    host.innerHTML = `<div class="empty-state"><h3>No parts in this cut.</h3><p class="muted">Try clearing a filter above.</p></div>`;
    return;
  }
  // Sort: tier first (so Basic stays top), then stock desc
  const rank = { basic: 0, tier1: 1, tier3: 2 };
  parts = [...parts].sort((a, b) => (rank[a.tier] - rank[b.tier]) || (b.stock - a.stock));
  host.innerHTML = resultTable(parts, state.category, brands);
  host.addEventListener('click', ev => {
    const row = ev.target.closest('[data-lcsc]');
    if (!row) return;
    location.href = `./part.html?lcsc=${encodeURIComponent(row.getAttribute('data-lcsc'))}`;
  });
}

async function run() {
  const [all, brands] = await Promise.all([loadCategory(state.category), loadBrands()]);
  const filtered = all.filter(matchesFacets);
  renderTabs();
  renderHeader(all.length, filtered.length);
  renderFacets(all, brands);
  renderChips();
  renderTable(filtered, brands);
  writeUrl();
}

function wire() {
  document.getElementById('facets').addEventListener('change', ev => {
    const cb = ev.target.closest('input[type="checkbox"][data-facet]');
    if (!cb) return;
    const set = state.filters[cb.getAttribute('data-facet')];
    if (!set) return;
    if (cb.checked) set.add(cb.value); else set.delete(cb.value);
    run();
  });
  document.getElementById('cat-chips').addEventListener('click', ev => {
    const btn = ev.target.closest('[data-chip-remove]');
    if (!btn) return;
    const facet = btn.getAttribute('data-facet');
    const v = btn.getAttribute('data-value');
    state.filters[facet]?.delete(v);
    run();
  });
  document.getElementById('toggle-instock').addEventListener('change', e => { state.inStockOnly = e.target.checked; run(); });
  document.getElementById('toggle-basiconly').addEventListener('change', e => { state.basicOnly = e.target.checked; run(); });
}

mountNav('category');
readUrl();
wire();
run().catch(err => {
  console.error(err);
  document.getElementById('cat-results').innerHTML =
    `<div class="empty-state"><h3>Couldn't load part data.</h3><p class="muted">If you opened this from a <span class="mono">file://</span> URL, run <span class="mono">python3 -m http.server</span> in the project root and browse to <a href="http://localhost:8000">localhost:8000</a>.</p></div>`;
});
