import { mountNav } from '../ui/nav.js';
import { findByLcsc, loadCategory, loadBrands } from '../data-loader.js';
import { tierBadge, contextBadges } from '../ui/brand-badge.js';
import { resultTable, specSummary } from '../ui/result-row.js';
import { packageIcon } from '../ui/package-icon.js';
import { formatValue } from '../parser.js';
import { formatStock, formatPrice, formatTolerance, stockDotClass, escape } from '../format.js';
import { TIER_META, tierRank } from '../tiers.js';

const UNIT = { capacitors: 'F', resistors: 'Ω', inductors: 'H', crystals: 'Hz' };

function titleCase(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

function specRows(part, category) {
  const rows = [];
  const unit = UNIT[category];
  if (unit && part.value != null) rows.push(['Value', formatValue(part.value, unit)]);
  if (part.tolerance != null) rows.push(['Tolerance', formatTolerance(part.tolerance)]);
  if (part.voltage != null)   rows.push(['Voltage', `${part.voltage}V`]);
  if (part.tempco)            rows.push(['Temp. Coefficient', part.tempco]);
  if (part.power)             rows.push(['Power', `${part.power * 1000} mW (1/${Math.round(1/part.power)} W)`]);
  if (part.package)           rows.push(['Package', part.package]);
  if (part.channel)           rows.push(['Channel', `${part.channel}-Channel`]);
  if (part.vds)               rows.push(['V_DS', `${part.vds}V`]);
  if (part.id)                rows.push(['I_D (cont.)', `${part.id}A`]);
  if (part.rds_on)            rows.push(['R_DS(on)', `${(part.rds_on * 1000).toFixed(0)} mΩ`]);
  if (part.vgs_th != null)    rows.push(['V_GS(th)', `${part.vgs_th}V`]);
  if (part.current != null && !part.channel)  rows.push(['Current', `${part.current}A`]);
  if (part.dcr != null)       rows.push(['DCR', `${part.dcr} Ω`]);
  if (part.wavelength)        rows.push(['Wavelength', `${part.wavelength} nm`]);
  if (part.vf != null)        rows.push(['V_F', `${part.vf}V`]);
  if (part.if != null)        rows.push(['I_F', `${part.if * 1000} mA`]);
  if (part.color)             rows.push(['Color', titleCase(part.color)]);
  if (part.load_cap != null)  rows.push(['Load capacitance', `${part.load_cap} pF`]);
  if (part.stability)         rows.push(['Frequency stability', part.stability]);
  if (part.freq_tol)          rows.push(['Frequency tolerance', part.freq_tol]);
  if (part.crystal_type)      rows.push(['Crystal type', part.crystal_type]);
  if (part.function)          rows.push(['Function', part.function]);
  if (part.type)              rows.push(['Type', part.type]);
  if (part.pins)              rows.push(['Pins', String(part.pins)]);
  rows.push(['LCSC Part #', part.lcsc]);
  rows.push(['Manufacturer Part #', part.mpn]);
  return rows;
}

function reputationPanel(brandInfo, part) {
  if (!brandInfo) {
    return `
      <div class="reputation__brand">
        <div>
          <div class="cell-brand">${escape(part.mfr)}</div>
          <div class="muted" style="font-size:11px">No local brand metadata.</div>
        </div>
      </div>`;
  }
  const tierLabel = brandInfo.tier === 'global' ? 'Global tier' : 'Economy tier';
  const tierColor = brandInfo.tier === 'global' ? 'var(--accent-tier1)' : 'var(--accent-tier3)';
  return `
    <div class="reputation">
      <div class="reputation__brand">
        <div style="flex:1">
          <div class="cell-brand">${escape(brandInfo.display)}</div>
          <div class="muted" style="font-size:11px">${escape(tierLabel)}</div>
        </div>
        <span class="reputation__flag">${escape(brandInfo.country || '?')}</span>
      </div>
      <div>
        <div class="reputation__metric">
          <span>Brand score</span>
          <span class="mono">${brandInfo.popularity}/100</span>
        </div>
        <div class="reputation__bar"><div class="reputation__bar-fill" style="width:${brandInfo.popularity}%;background:${tierColor}"></div></div>
      </div>
      <p class="muted" style="font-size:12px;line-height:1.5;margin-top:var(--sp-2)">${escape(brandInfo.known_for || '')}</p>
    </div>`;
}

function priceLadder(p) {
  const base = p.price || 0;
  if (!base) return '';
  const ladders = [
    { qty: 10,   mult: 1.0 },
    { qty: 100,  mult: 0.95 },
    { qty: 1000, mult: 0.85 },
    { qty: 10000,mult: 0.75 },
  ];
  return ladders.map(l => `
    <div class="price-ladder__step">
      <div class="qty">${l.qty.toLocaleString()}+</div>
      <div class="px">${formatPrice(base * l.mult)}</div>
    </div>
  `).join('');
}

async function findAlternates(current, category, brands) {
  // Same category, same package, same value (for parametric cats) or same function (for ICs etc.)
  const pool = await loadCategory(category);
  const currentRank = tierRank(current.tier);
  const sameClass = pool.filter(p => p.lcsc !== current.lcsc && p.package === current.package);
  const filtered = sameClass.filter(p => {
    if (current.value != null && p.value != null) {
      const eps = 0.05;
      return Math.abs(p.value - current.value) / current.value <= eps;
    }
    if (current.function && p.function) return p.function === current.function;
    if (current.color && p.color) return p.color === current.color;
    if (current.channel && p.channel) return p.channel === current.channel;
    return false;
  });
  // Prefer same-or-higher tier (i.e. rank <= currentRank) when showing upgrades
  const upgrades = filtered.filter(p => tierRank(p.tier) <= currentRank);
  const others = filtered.filter(p => tierRank(p.tier) > currentRank);
  return [...upgrades, ...others].slice(0, 5);
}

async function render() {
  const url = new URL(location.href);
  const lcsc = url.searchParams.get('lcsc');
  const root = document.getElementById('part-root');
  if (!lcsc) {
    root.innerHTML = `<div class="empty-state"><h3>No part specified.</h3><p><a href="./search.html">Start a search</a>.</p></div>`;
    return;
  }

  const [hit, brands] = await Promise.all([findByLcsc(lcsc), loadBrands()]);
  if (!hit) {
    root.innerHTML = `<div class="empty-state"><h3>Part <span class="mono">${escape(lcsc)}</span> not in the snapshot.</h3><p class="muted">It may exist on LCSC — this demo only indexes a curated subset. <a href="./search.html">Back to search</a>.</p></div>`;
    return;
  }
  const { part, category } = hit;
  const brandInfo = brands[part.mfr];
  const alternates = await findAlternates(part, category, brands);
  const tierMeta = TIER_META[part.tier];

  document.title = `${part.mpn} · ${part.mfr} · JLC Parts Explorer`;

  root.innerHTML = `
    <nav class="part-page__crumbs">
      <a href="./index.html">JLC Parts Explorer</a> ·
      <a href="./category.html?cat=${category}">${titleCase(category)}</a> ·
      <span>${escape(part.package || '')}</span>
    </nav>

    <div class="part-page__grid">
      <div>
        <div class="card card--tier-strip" style="--tier-color:${tierMeta.accent}">
          <div class="part-page__header">
            <div style="color:${tierMeta.accent}">${packageIcon(part.package, category, { large: true })}</div>
            <div style="flex:1;min-width:0">
              <div class="part-page__title">
                <span class="mpn">${escape(part.mpn)}</span>
                ${tierBadge(part.tier)}
                ${contextBadges(part, brandInfo)}
              </div>
              <div class="muted mono" style="font-size:12px">${escape(part.lcsc)} · ${escape(part.mfr)}${part.package ? ' · ' + escape(part.package) : ''}</div>
            </div>
          </div>
          <p class="part-page__desc" style="margin-top:var(--sp-4)">${escape(part.desc)}</p>
          <div style="display:flex;align-items:center;gap:var(--sp-4);flex-wrap:wrap">
            <div>
              <div class="muted" style="font-size:11px;text-transform:uppercase;letter-spacing:0.08em">Stock</div>
              <div class="mono" style="font-size:var(--step-3)"><span class="${stockDotClass(part.stock)}"></span>${formatStock(part.stock)}</div>
            </div>
            <div>
              <div class="muted" style="font-size:11px;text-transform:uppercase;letter-spacing:0.08em">Unit price</div>
              <div class="mono" style="font-size:var(--step-3)">${formatPrice(part.price)}</div>
            </div>
            <a class="btn" href="${escape(part.datasheet)}" target="_blank" rel="noopener noreferrer" style="margin-left:auto">Datasheet ↗</a>
          </div>
        </div>

        <h4 style="margin:var(--sp-6) 0 var(--sp-3)">Specifications</h4>
        <div class="card" style="padding:0">
          <table class="spec">
            <tbody>
              ${specRows(part, category).map(([k, v]) =>
                `<tr><td>${escape(k)}</td><td>${escape(v)}</td></tr>`).join('')}
            </tbody>
          </table>
        </div>

        <h4 style="margin:var(--sp-6) 0 var(--sp-3)">Price ladder</h4>
        <div class="price-ladder">${priceLadder(part)}</div>
      </div>

      <aside>
        <h4 style="margin:0 0 var(--sp-3)">Brand metadata</h4>
        ${reputationPanel(brandInfo, part)}

        <h4 style="margin:var(--sp-6) 0 var(--sp-3)">Alternates${alternates.length ? '' : ' (none found)'}</h4>
        ${alternates.length
          ? `<div class="card" style="padding:0">${resultTable(alternates, category, brands)}</div>`
          : `<div class="empty-state"><p class="muted">No matching alternates were found in the current snapshot.</p></div>`}
      </aside>
    </div>
  `;

  root.addEventListener('click', ev => {
    const row = ev.target.closest('[data-lcsc]');
    if (!row) return;
    const next = row.getAttribute('data-lcsc');
    if (next !== part.lcsc) location.href = `./part.html?lcsc=${encodeURIComponent(next)}`;
  });
}

mountNav('part');
render().catch(err => {
  console.error(err);
  document.getElementById('part-root').innerHTML =
    `<div class="empty-state"><h3>Couldn't load part data.</h3><p class="muted">If you opened this from a <span class="mono">file://</span> URL, run <span class="mono">python3 -m http.server</span> in the project root and browse to <a href="http://localhost:8000">localhost:8000</a>.</p></div>`;
});
