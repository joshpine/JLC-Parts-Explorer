// In-memory query engine over loaded category shards.
// Applies structured filters from the parser plus free-text substring matching.

import { parse } from './parser.js';
import { loadCategory, loadAllCategories, knownCategories } from './data-loader.js';
import { TIER_ORDER } from './tiers.js';

/** Value-match tolerance: treat anything within ±1% as equal (loose match). */
const VALUE_EPSILON = 0.01;

function valueMatches(partValue, targetValue) {
  if (partValue == null || targetValue == null) return false;
  if (targetValue === 0) return partValue === 0;
  const delta = Math.abs(partValue - targetValue) / targetValue;
  return delta <= VALUE_EPSILON;
}

function matchesFilters(part, f) {
  if (f.package && part.package !== f.package) return false;
  if (f.value != null && !valueMatches(part.value, f.value)) return false;
  if (f.tolerance != null && part.tolerance != null && part.tolerance > f.tolerance + 1e-9) return false;
  if (f.voltage != null && part.voltage != null && part.voltage < f.voltage) return false;
  if (f.tempco && part.tempco !== f.tempco) return false;
  if (f.color && part.color && part.color.toLowerCase() !== f.color) return false;
  if (f.mpn) {
    const needle = f.mpn.toLowerCase();
    if (!part.mpn?.toLowerCase().includes(needle)) return false;
  }
  if (f.fnTags?.length) {
    const blob = `${part.function || ''} ${part.desc || ''}`.toLowerCase();
    for (const tag of f.fnTags) if (!blob.includes(tag.toLowerCase())) return false;
  }
  if (f.freeText?.length) {
    const blob = `${part.mpn} ${part.mfr} ${part.desc} ${part.lcsc}`.toLowerCase();
    for (const t of f.freeText) if (!blob.includes(t.toLowerCase())) return false;
  }
  return true;
}

/** Run a query string against the data. Returns { filters, category, bands, total }. */
export async function search(query, opts = {}) {
  const filters = parse(query);
  const categories = filters.category ? [filters.category] : knownCategories();

  let pool = [];
  if (filters.category) {
    pool = await loadCategory(filters.category);
  } else {
    const all = await loadAllCategories();
    pool = Object.values(all).flat();
  }

  // Apply additional UI-driven filters (not from parser)
  let hits = pool.filter(p => matchesFilters(p, filters));

  if (opts.inStockOnly) hits = hits.filter(p => p.stock > 0);
  if (opts.basicOnly) hits = hits.filter(p => p.tier === 'basic');
  if (opts.brands?.length) {
    const set = new Set(opts.brands);
    hits = hits.filter(p => set.has(p.mfr));
  }

  // Sort within tiers: stock desc, then price asc
  hits.sort((a, b) => {
    const ta = TIER_ORDER.indexOf(a.tier);
    const tb = TIER_ORDER.indexOf(b.tier);
    if (ta !== tb) return ta - tb;
    if (b.stock !== a.stock) return b.stock - a.stock;
    return a.price - b.price;
  });

  const bands = { basic: [], tier1: [], tier3: [] };
  for (const p of hits) (bands[p.tier] ||= []).push(p);

  return { filters, categories, bands, total: hits.length };
}
