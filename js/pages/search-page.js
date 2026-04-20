import { mountNav } from '../ui/nav.js';
import { renderParsedChips } from '../ui/chip.js';
import { resultTable } from '../ui/result-row.js';
import { search } from '../search.js';
import { loadBrands } from '../data-loader.js';
import { TIER_META, TIER_ORDER } from '../tiers.js';
import { escape } from '../format.js';

const state = {
  query: '',
  inStockOnly: true,
  basicOnly: false,
  brands: new Set(),
  packages: new Set(),
};

const PARSED_KEYS = ['value', 'package', 'tolerance', 'voltage', 'tempco', 'category', 'color', 'mpn'];

// ---- URL sync ----------------------------------------------------------

function readUrl() {
  const url = new URL(location.href);
  state.query = url.searchParams.get('q') || '';
  if (url.searchParams.has('basic')) state.basicOnly = url.searchParams.get('basic') === '1';
  if (url.searchParams.has('stock')) state.inStockOnly = url.searchParams.get('stock') === '1';
  const b = url.searchParams.get('brands'); if (b) state.brands = new Set(b.split('|').filter(Boolean));
  const p = url.searchParams.get('pkgs');   if (p) state.packages = new Set(p.split('|').filter(Boolean));
}

function writeUrl() {
  const url = new URL(location.href);
  url.searchParams.set('q', state.query);
  url.searchParams.set('stock', state.inStockOnly ? '1' : '0');
  url.searchParams.set('basic', state.basicOnly ? '1' : '0');
  if (state.brands.size) url.searchParams.set('brands', [...state.brands].join('|'));
  else url.searchParams.delete('brands');
  if (state.packages.size) url.searchParams.set('pkgs', [...state.packages].join('|'));
  else url.searchParams.delete('pkgs');
  history.replaceState({}, '', url);
}

// ---- Rendering ---------------------------------------------------------

function renderParsedRow(filters) {
  const host = document.getElementById('parsed-chips');
  const html = renderParsedChips(filters);
  host.innerHTML = html || '<span class="muted" style="font-size:12px">No filters — showing best matches by stock.</span>';
}

function renderRail(result, brands) {
  // Facet: packages, brands — built from the current result pool (pre-UI-filter)
  const pkgCounts = new Map();
  const brandCounts = new Map();
  const allPool = Object.values(result.bands).flat();
  for (const p of allPool) {
    if (p.package) pkgCounts.set(p.package, (pkgCounts.get(p.package) || 0) + 1);
    if (p.mfr)     brandCounts.set(p.mfr,     (brandCounts.get(p.mfr)     || 0) + 1);
  }

  const pkgOptions = [...pkgCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12)
    .map(([pkg, n]) => `
      <label class="facet__option">
        <input type="checkbox" value="${escape(pkg)}" data-facet="package" ${state.packages.has(pkg) ? 'checked' : ''}/>
        <span>${escape(pkg)}</span>
        <span class="facet__option-count">${n}</span>
      </label>`).join('');

  const brandOptions = [...brandCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 14)
    .map(([m, n]) => {
      const info = brands[m];
      const tierGlyph = info?.tier === 'global' ? '●' : '○';
      const tierColor = info?.tier === 'global' ? 'color:var(--accent-tier1)' : 'color:var(--fg-3)';
      return `
        <label class="facet__option">
          <input type="checkbox" value="${escape(m)}" data-facet="brand" ${state.brands.has(m) ? 'checked' : ''}/>
          <span style="${tierColor}">${tierGlyph}</span>
          <span>${escape(info?.display || m)}</span>
          <span class="facet__option-count">${n}</span>
        </label>`;
    }).join('');

  document.getElementById('package-facet').innerHTML = pkgOptions
    ? `<div class="facet"><div class="facet__title">Package</div>${pkgOptions}</div>` : '';
  document.getElementById('brand-facet').innerHTML = brandOptions
    ? `<div class="facet"><div class="facet__title">Brand</div>${brandOptions}</div>` : '';
}

function renderBands(result, brands) {
  const host = document.getElementById('results');
  const anyResults = Object.values(result.bands).some(b => b.length);

  if (!anyResults && !state.query) {
    host.innerHTML = `
      <div class="empty-state">
        <h3>Start typing a part.</h3>
        <p class="muted">Try <span class="mono">100n 0402</span>, <span class="mono">10k 1%</span>, or <span class="mono">STM32F103</span>.</p>
      </div>`;
    return;
  }
  if (!anyResults) {
    host.innerHTML = `
      <div class="empty-state">
        <h3>No parts matched.</h3>
        <p class="muted">Try loosening filters — the ${state.basicOnly ? 'Basic-only ' : ''}${state.inStockOnly ? 'in-stock ' : ''}toggles may be narrowing things.</p>
      </div>`;
    return;
  }

  const cat = result.filters.category || 'capacitors';
  host.innerHTML = TIER_ORDER.map(tier => {
    const parts = result.bands[tier] || [];
    const meta = TIER_META[tier];
    const body = parts.length
      ? resultTable(parts.slice(0, 50), cat, brands)
      : `<div class="tier-band__empty">No ${meta.short} matches for these filters.</div>`;
    return `
      <div class="tier-band tier-band--${tier}">
        <div class="tier-band__header">
          <div class="tier-band__name">${meta.name}</div>
          <div class="tier-band__blurb">${meta.blurb}</div>
          <div class="tier-band__count">${parts.length} ${parts.length === 1 ? 'part' : 'parts'}</div>
        </div>
        ${body}
      </div>`;
  }).join('');

  // Row click → detail
  host.addEventListener('click', ev => {
    const row = ev.target.closest('[data-lcsc]');
    if (!row) return;
    location.href = `./part.html?lcsc=${encodeURIComponent(row.getAttribute('data-lcsc'))}`;
  }, { once: false });
}

// ---- Main loop ---------------------------------------------------------

let brandsCache = null;

async function run() {
  if (!brandsCache) brandsCache = await loadBrands();
  document.getElementById('q').value = state.query;
  document.getElementById('toggle-instock').checked = state.inStockOnly;
  document.getElementById('toggle-basiconly').checked = state.basicOnly;

  const result = await search(state.query, {
    inStockOnly: state.inStockOnly,
    basicOnly: state.basicOnly,
    brands: [...state.brands],
  });

  // The package facet is applied after the parser so users can narrow without re-typing.
  if (state.packages.size) {
    for (const tier of Object.keys(result.bands)) {
      result.bands[tier] = result.bands[tier].filter(p => state.packages.has(p.package));
    }
  }

  renderParsedRow(result.filters);
  renderRail(result, brandsCache);
  renderBands(result, brandsCache);
  writeUrl();
}

// ---- Wiring ------------------------------------------------------------

function wire() {
  // Main form
  document.getElementById('query-form').addEventListener('submit', ev => {
    ev.preventDefault();
    state.query = document.getElementById('q').value.trim();
    run();
  });

  // Chip dismiss
  document.getElementById('parsed-chips').addEventListener('click', ev => {
    const btn = ev.target.closest('[data-chip-remove]');
    if (!btn) return;
    const key = btn.getAttribute('data-chip-remove');
    const label = btn.getAttribute('data-chip-label');
    // Reconstruct query by removing the chip's originating tokens
    const tokens = state.query.trim().split(/\s+/);
    const kept = tokens.filter(t => {
      const parsed = [t];
      // Naive: drop any token whose parse produces the same chip-label
      return !tokenMatchesChip(t, key, label);
    });
    state.query = kept.join(' ');
    document.getElementById('q').value = state.query;
    run();
  });

  // Rail toggles
  document.getElementById('toggle-instock').addEventListener('change', e => {
    state.inStockOnly = e.target.checked; run();
  });
  document.getElementById('toggle-basiconly').addEventListener('change', e => {
    state.basicOnly = e.target.checked; run();
  });

  // Facet checkboxes (delegated)
  document.getElementById('rail').addEventListener('change', ev => {
    const cb = ev.target.closest('input[type="checkbox"][data-facet]');
    if (!cb) return;
    const facet = cb.getAttribute('data-facet');
    const set = facet === 'brand' ? state.brands : state.packages;
    if (cb.checked) set.add(cb.value); else set.delete(cb.value);
    run();
  });
}

/** Helper: given a token and a chip (key,label), decide whether the token produced that chip. */
function tokenMatchesChip(token, key, label) {
  // Simple substring check by category; good enough for the demo
  const t = token.toLowerCase();
  const l = String(label).toLowerCase();
  if (key === 'package') return t === l || t === l.replace('-', '');
  if (key === 'tolerance') return t.replace('±','') === l.replace('±','');
  if (key === 'voltage') return t.endsWith('v') && t === l;
  if (key === 'tempco') return t.toUpperCase() === String(label).toUpperCase();
  if (key === 'mpn') return t.toUpperCase() === String(label).toUpperCase();
  if (key === 'category') return ['cap','caps','capacitor','capacitors','res','resistor','resistors','led','leds','mosfet','diode','ind','inductor'].includes(t);
  if (key === 'color') return t === l;
  if (key === 'value') return /^[\d.]+[pnumkMG]?[FHRΩ]?$/i.test(token); // loose
  return false;
}

mountNav('search');
readUrl();
wire();
run().catch(err => {
  console.error(err);
  document.getElementById('results').innerHTML =
    `<div class="empty-state"><h3>Couldn't load part data.</h3><p class="muted">If you opened this from a <span class="mono">file://</span> URL, run <span class="mono">python3 -m http.server</span> in the project root and browse to <a href="http://localhost:8000">localhost:8000</a>.</p></div>`;
});
