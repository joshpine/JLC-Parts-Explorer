import { mountNav } from '../ui/nav.js';
import { renderHintChip } from '../ui/chip.js';
import { resultTable } from '../ui/result-row.js';
import { search } from '../search.js';
import { loadBrands, loadMeta } from '../data-loader.js';
import { TIER_META, TIER_ORDER } from '../tiers.js';

const DEMO_QUERIES = [
  '100n 0402 x7r',
  '10k 1% 0402',
  'STM32F103',
  'red led 0603',
  '3.3V LDO SOT-223',
  'AO3400',
];

function wireSearchForm() {
  const form = document.getElementById('hero-search');
  const input = document.getElementById('hero-input');
  form.addEventListener('submit', ev => {
    ev.preventDefault();
    const q = input.value.trim();
    if (!q) return;
    location.href = `./search.html?q=${encodeURIComponent(q)}`;
  });
}

function renderHints() {
  const host = document.getElementById('hero-hints');
  host.insertAdjacentHTML('beforeend', DEMO_QUERIES.map(renderHintChip).join(''));
  host.addEventListener('click', ev => {
    const btn = ev.target.closest('[data-hint]');
    if (!btn) return;
    const q = btn.getAttribute('data-hint');
    document.getElementById('hero-input').value = q;
    location.href = `./search.html?q=${encodeURIComponent(q)}`;
  });
}

async function renderWalkthrough() {
  const host = document.getElementById('walkthrough');
  const [{ bands }, brands] = await Promise.all([
    search('100n 0402'),
    loadBrands(),
  ]);
  const html = TIER_ORDER.map(tier => {
    const parts = (bands[tier] || []).slice(0, 3);
    const meta = TIER_META[tier];
    return `
      <div class="tier-band tier-band--${tier}">
        <div class="tier-band__header">
          <div class="tier-band__name">${meta.name}</div>
          <div class="tier-band__blurb">${meta.blurb}</div>
          <div class="tier-band__count">${parts.length} shown</div>
        </div>
        ${parts.length
          ? resultTable(parts, 'capacitors', brands)
          : `<div class="tier-band__empty">No matches in this tier.</div>`}
      </div>
    `;
  }).join('');
  host.innerHTML = html;
  // Click-to-detail
  host.addEventListener('click', ev => {
    const row = ev.target.closest('[data-lcsc]');
    if (!row) return;
    location.href = `./part.html?lcsc=${encodeURIComponent(row.getAttribute('data-lcsc'))}`;
  });
}

async function renderFooter() {
  const meta = await loadMeta();
  document.getElementById('footer-meta').textContent =
    `Snapshot ${meta.snapshot_date} · ${meta.part_count} parts indexed across ${meta.categories.length} categories`;
}

mountNav('landing');
wireSearchForm();
renderHints();
renderWalkthrough().catch(err => {
  console.error(err);
  document.getElementById('walkthrough').innerHTML =
    `<div class="empty-state">Couldn't load part data. Are you opening this from a file:// URL? Try <span class="mono">python3 -m http.server</span> in the project directory and visit <a href="http://localhost:8000">localhost:8000</a>.</div>`;
});
renderFooter().catch(() => {});
