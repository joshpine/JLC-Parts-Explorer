import { mountNav } from '../ui/nav.js';
import { findByLcsc } from '../data-loader.js';
import { search } from '../search.js';
import { formatPrice, formatStock, escape } from '../format.js';
import { tierBadge } from '../ui/brand-badge.js';
import { packageIcon } from '../ui/package-icon.js';

const state = {
  rows: [],
};

const HEADER_MAP = {
  designator: ['designator', 'designators', 'reference', 'references', 'ref', 'refdes'],
  quantity: ['quantity', 'qty', 'q'],
  comment: ['comment', 'value', 'description', 'desc', 'part'],
  footprint: ['footprint', 'package', 'pattern', 'land pattern', 'case'],
  mpn: ['mpn', 'manufacturer part number', 'mfr.part', 'part number', 'manufacturer p/n'],
  lcsc: ['lcsc', 'lcsc part', 'lcsc part #', 'lcsc part number', 'jlcpcb part', 'jlcpcb part #'],
};

function qs(id) {
  return document.getElementById(id);
}

function normalizeHeader(text) {
  return String(text || '').trim().toLowerCase().replace(/[^a-z0-9#]+/g, ' ');
}

function detectDelimiter(text) {
  const sample = text.split(/\r?\n/).slice(0, 5).join('\n');
  const counts = [
    ['\t', (sample.match(/\t/g) || []).length],
    [';', (sample.match(/;/g) || []).length],
    [',', (sample.match(/,/g) || []).length],
  ].sort((a, b) => b[1] - a[1]);
  return counts[0][1] > 0 ? counts[0][0] : ',';
}

function parseDelimited(text, delimiter = detectDelimiter(text)) {
  const rows = [];
  let row = [];
  let cell = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        cell += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === delimiter) {
      row.push(cell);
      cell = '';
    } else if (ch === '\n') {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else if (ch !== '\r') {
      cell += ch;
    }
  }

  if (cell.length || row.length) {
    row.push(cell);
    rows.push(row);
  }

  return rows.filter(r => r.some(v => String(v || '').trim()));
}

function mapHeaders(headerRow) {
  const mapping = {};
  for (const [field, aliases] of Object.entries(HEADER_MAP)) {
    const idx = headerRow.findIndex(cell => aliases.includes(normalizeHeader(cell)));
    if (idx >= 0) mapping[field] = idx;
  }
  return mapping;
}

function countDesignators(text) {
  const tokens = String(text || '')
    .split(/[\s,;]+/)
    .map(t => t.trim())
    .filter(Boolean);
  return tokens.length || null;
}

function deriveRow(row, headerMap, index) {
  const read = key => {
    const col = headerMap[key];
    return col == null ? '' : String(row[col] || '').trim();
  };
  const designator = read('designator');
  const quantityText = read('quantity');
  const qty = Number(quantityText) || countDesignators(designator) || 1;
  const comment = read('comment');
  const footprint = read('footprint');
  const mpn = read('mpn');
  const lcsc = read('lcsc').replace(/^C/i, m => m.toUpperCase());
  const query = lcsc || mpn || [comment, footprint].filter(Boolean).join(' ');

  return {
    id: index + 1,
    raw: row,
    designator,
    qty,
    comment,
    footprint,
    mpn,
    lcsc,
    query,
    status: 'pending',
    candidates: [],
    selectedLcsc: '',
    selected: null,
  };
}

async function candidateSearch(query, existingLcsc) {
  if (existingLcsc) {
    const hit = await findByLcsc(existingLcsc);
    return hit ? [{ ...hit.part, _category: hit.category }] : [];
  }
  if (!query) return [];
  const result = await search(query, { inStockOnly: false });
  return Object.entries(result.bands)
    .flatMap(([_, parts]) => parts)
    .slice(0, 8);
}

function optionLabel(part) {
  const packageText = part.package ? ` · ${part.package}` : '';
  return `${part.lcsc} · ${part.mpn}${packageText} · ${formatPrice(part.price)}`;
}

function buildExportCsv(rows) {
  const header = ['Comment', 'Designator', 'Footprint', 'LCSC Part #'];
  const lines = [header];
  for (const row of rows) {
    if (!row.selected) continue;
    lines.push([
      row.comment || row.selected.desc || row.selected.mpn,
      row.designator,
      row.footprint || row.selected.package || '',
      row.selected.lcsc,
    ]);
  }
  return lines.map(cells => cells.map(csvCell).join(',')).join('\n');
}

function csvCell(value) {
  const text = String(value ?? '');
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function exportCsv() {
  const csv = buildExportCsv(state.rows);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'jlc-bom.csv';
  a.click();
  URL.revokeObjectURL(url);
}

function renderSummary() {
  const host = qs('bom-summary');
  if (!state.rows.length) {
    host.hidden = true;
    return;
  }
  const assigned = state.rows.filter(r => r.selected).length;
  const unresolved = state.rows.length - assigned;
  host.hidden = false;
  host.innerHTML = `
    <div class="bom-summary__grid">
      <div><div class="bom-summary__label">Rows</div><div class="bom-summary__value">${state.rows.length}</div></div>
      <div><div class="bom-summary__label">Assigned</div><div class="bom-summary__value">${assigned}</div></div>
      <div><div class="bom-summary__label">Unresolved</div><div class="bom-summary__value">${unresolved}</div></div>
    </div>
  `;
  qs('bom-export').disabled = assigned === 0;
  qs('bom-autofill').disabled = state.rows.length === 0;
}

function renderRows() {
  const host = qs('bom-rows');
  if (!state.rows.length) {
    host.innerHTML = '';
    return;
  }
  host.innerHTML = state.rows.map(row => {
    const options = row.candidates.map(part =>
      `<option value="${escape(part.lcsc)}" ${part.lcsc === row.selectedLcsc ? 'selected' : ''}>${escape(optionLabel(part))}</option>`
    ).join('');
    const assigned = row.selected ? `
      <div class="bom-row__assigned">
        <div class="bom-row__assigned-icon">${packageIcon(row.selected.package, row.selected._category || '', { large: false })}</div>
        <div class="bom-row__assigned-meta">
          <div class="mono">${escape(row.selected.mpn)}</div>
          <div class="muted">${escape(row.selected.lcsc)} · ${escape(row.selected.mfr || '')}${row.selected.package ? ` · ${escape(row.selected.package)}` : ''}</div>
        </div>
        <div class="bom-row__assigned-side">
          ${tierBadge(row.selected.tier)}
          <div class="mono">${formatPrice(row.selected.price)} · ${formatStock(row.selected.stock)}</div>
        </div>
      </div>
    ` : '<div class="bom-row__assigned bom-row__assigned--empty">No part assigned.</div>';

    return `
      <article class="card bom-row" data-row-id="${row.id}">
        <div class="bom-row__top">
          <div>
            <div class="bom-row__title">${escape(row.designator || `Row ${row.id}`)}</div>
            <div class="muted mono">Qty ${escape(row.qty)}${row.comment ? ` · ${escape(row.comment)}` : ''}${row.footprint ? ` · ${escape(row.footprint)}` : ''}</div>
          </div>
          <div class="bom-row__status bom-row__status--${row.selected ? 'assigned' : 'open'}">${row.selected ? 'Assigned' : 'Needs review'}</div>
        </div>
        <div class="bom-row__query">
          <label class="bom-row__field">
            <span>Search query</span>
            <input type="text" data-action="query" value="${escape(row.query)}" />
          </label>
          <button class="btn" type="button" data-action="search">Search</button>
        </div>
        <div class="bom-row__query bom-row__query--compact">
          <label class="bom-row__field">
            <span>Candidates</span>
            <select data-action="candidate">
              <option value="">Select a candidate</option>
              ${options}
            </select>
          </label>
          <button class="btn" type="button" data-action="assign" ${row.selectedLcsc ? '' : 'disabled'}>Assign</button>
        </div>
        ${assigned}
      </article>
    `;
  }).join('');
}

async function runSearchForRow(row) {
  row.status = 'loading';
  const candidates = await candidateSearch(row.query, row.lcsc);
  row.candidates = candidates;
  row.status = 'ready';
  if (!row.selected && candidates[0]) {
    row.selectedLcsc = candidates[0].lcsc;
  }
}

function assignRow(row) {
  if (!row.selectedLcsc) return;
  row.selected = row.candidates.find(p => p.lcsc === row.selectedLcsc) || null;
}

async function importBomText(text) {
  const rows = parseDelimited(text);
  if (rows.length < 2) {
    qs('bom-rows').innerHTML = `<div class="empty-state"><h3>No BOM rows found.</h3><p class="muted">The file needs a header row and at least one data row.</p></div>`;
    return;
  }
  const headerMap = mapHeaders(rows[0]);
  const parsed = rows.slice(1).map((row, index) => deriveRow(row, headerMap, index))
    .filter(row => row.designator || row.comment || row.mpn || row.lcsc);

  state.rows = parsed;
  renderSummary();
  renderRows();

  for (const row of state.rows) {
    await runSearchForRow(row);
    assignRow(row);
    renderSummary();
    renderRows();
  }
}

async function autoMatchAll() {
  for (const row of state.rows) {
    if (!row.candidates.length) await runSearchForRow(row);
    if (!row.selected && row.selectedLcsc) assignRow(row);
  }
  renderSummary();
  renderRows();
}

function wire() {
  qs('bom-file').addEventListener('change', async ev => {
    const file = ev.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    qs('bom-text').value = text;
    importBomText(text);
  });

  qs('bom-load-text').addEventListener('click', () => {
    const text = qs('bom-text').value.trim();
    if (text) importBomText(text);
  });

  qs('bom-export').addEventListener('click', exportCsv);
  qs('bom-autofill').addEventListener('click', autoMatchAll);

  qs('bom-rows').addEventListener('input', ev => {
    const rowEl = ev.target.closest('[data-row-id]');
    if (!rowEl) return;
    const row = state.rows.find(r => String(r.id) === rowEl.dataset.rowId);
    if (!row) return;
    if (ev.target.dataset.action === 'query') {
      row.query = ev.target.value;
    }
    if (ev.target.dataset.action === 'candidate') {
      row.selectedLcsc = ev.target.value;
      rowEl.querySelector('[data-action="assign"]').disabled = !row.selectedLcsc;
    }
  });

  qs('bom-rows').addEventListener('click', async ev => {
    const button = ev.target.closest('[data-action]');
    if (!button) return;
    const rowEl = button.closest('[data-row-id]');
    const row = state.rows.find(r => String(r.id) === rowEl.dataset.rowId);
    if (!row) return;

    if (button.dataset.action === 'search') {
      await runSearchForRow(row);
      renderRows();
      renderSummary();
      return;
    }
    if (button.dataset.action === 'assign') {
      assignRow(row);
      renderRows();
      renderSummary();
    }
  });
}

mountNav('bom');
wire();
