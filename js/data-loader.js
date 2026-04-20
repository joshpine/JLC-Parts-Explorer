// Lazy, cached loader for per-category part shards and the brand directory.
// All shards live under /data/categories/<name>.json.

const cache = new Map();
let brandsPromise = null;
let metaPromise = null;
let categoriesCache = ['capacitors', 'resistors', 'inductors', 'diodes', 'leds', 'mosfets', 'ics', 'connectors', 'crystals'];

export function knownCategories() { return categoriesCache.slice(); }

async function ensureCategories() {
  const meta = await loadMeta();
  if (Array.isArray(meta?.categories) && meta.categories.length) {
    categoriesCache = meta.categories.slice();
  }
  return categoriesCache;
}

export async function loadCategory(name) {
  const categories = await ensureCategories();
  if (!categories.includes(name)) throw new Error(`Unknown category: ${name}`);
  if (!cache.has(name)) {
    cache.set(name, fetch(`./data/categories/${name}.json`).then(r => r.json()));
  }
  return cache.get(name);
}

export async function loadAllCategories() {
  const categories = await ensureCategories();
  const entries = await Promise.all(
    categories.map(async c => [c, await loadCategory(c)])
  );
  return Object.fromEntries(entries);
}

export async function loadBrands() {
  if (!brandsPromise) brandsPromise = fetch('./data/brands.json').then(r => r.json());
  return brandsPromise;
}

export async function loadMeta() {
  if (!metaPromise) {
    metaPromise = fetch('./data/snapshot-meta.json')
      .then(r => r.json())
      .then(meta => {
        if (Array.isArray(meta?.categories) && meta.categories.length) {
          categoriesCache = meta.categories.slice();
        }
        return meta;
      });
  }
  return metaPromise;
}

/** Locate a part by LCSC code across all shards. Returns { part, category } or null. */
export async function findByLcsc(lcsc) {
  const all = await loadAllCategories();
  for (const [cat, parts] of Object.entries(all)) {
    const hit = parts.find(p => p.lcsc === lcsc);
    if (hit) return { part: hit, category: cat };
  }
  return null;
}
