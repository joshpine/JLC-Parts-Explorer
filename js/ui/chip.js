// Filter chip rendering. Two flavours:
//   - parsed chips (dismissible), keyed by filter name
//   - hint chips (clickable demo queries on landing/empty states)

import { formatValue, chipLabel } from '../parser.js';
import { formatTolerance, escape } from '../format.js';

const KIND_LABEL = {
  value: 'Value',
  package: 'Pkg',
  tolerance: 'Tol',
  voltage: 'V',
  tempco: 'TempCo',
  category: 'Cat',
  color: 'Color',
  mpn: 'MPN',
};

/** Build chip HTML for each non-null field in a parsed filter object. */
export function renderParsedChips(filters, { removable = true } = {}) {
  const chips = [];

  if (filters.value != null && filters.unit) {
    chips.push(chipHTML('value', KIND_LABEL.value, formatValue(filters.value, filters.unit), removable));
  }
  for (const k of ['package', 'tolerance', 'voltage', 'tempco', 'category', 'color', 'mpn']) {
    if (filters[k] == null) continue;
    const label = k === 'tolerance' ? formatTolerance(filters[k]) : chipLabel(k, filters[k]);
    chips.push(chipHTML(k, KIND_LABEL[k], label, removable));
  }
  for (const tag of filters.fnTags || []) {
    chips.push(chipHTML('fnTag', 'Fn', tag, removable));
  }
  for (const t of filters.freeText || []) {
    chips.push(chipHTML('freeText', 'Match', `"${t}"`, removable));
  }
  return chips.join('');
}

function chipHTML(key, kind, label, removable) {
  const modClass = key === 'value' ? ' chip--value' : '';
  const close = removable
    ? `<button class="chip__close" data-chip-remove="${key}" data-chip-label="${escape(label)}" aria-label="Remove ${escape(kind)} filter">×</button>`
    : '';
  return `<span class="chip${modClass}" data-chip-key="${key}"><span class="chip__kind">${escape(kind)}</span><span class="chip__label">${escape(label)}</span>${close}</span>`;
}

export function renderHintChip(query) {
  return `<button class="chip chip--hint" data-hint="${escape(query)}"><span class="chip__label">${escape(query)}</span></button>`;
}
