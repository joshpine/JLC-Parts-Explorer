#!/usr/bin/env node
/**
 * JLCPCB Component Library CSV → sharded JSON.
 *
 * Usage:  node scripts/build-data.js path/to/JLCPCB_SMT_Parts_Library.csv
 *
 * Expected columns (order-tolerant, matched by header name):
 *   "LCSC Part" | "First Category" | "Second Category" | "MFR.Part" |
 *   "Package"   | "Solder Joint"   | "Manufacturer"    | "Library Type" |
 *   "Description" | "Datasheet"    | "Price"           | "Stock"
 *
 * Output: data/categories/<cat>.json (one per top-level category we care about)
 *         data/snapshot-meta.json (updated with counts + date)
 *
 * This script trades simplicity for coverage: it only hard-normalizes the
 * category-specific fields it knows how to (capacitance, resistance, package
 * alias, tolerance, voltage, tempco). Unknown parametrics are preserved in
 * `desc` for free-text matching.
 */

const fs = require('node:fs');
const path = require('node:path');

const CATEGORY_MAP = {
  'Capacitors': 'capacitors',
  'Resistors': 'resistors',
  'Inductors/Coils/Transformers': 'inductors',
  'Inductors': 'inductors',
  'Diodes': 'diodes',
  'Optoelectronics': 'leds',             // LEDs live here in the JLC taxonomy
  'Transistors': 'mosfets',
  'Integrated Circuits (ICs)': 'ics',
  'Connectors': 'connectors',
};

const GLOBAL_BRANDS = new Set([
  'Samsung Electro-Mechanics', 'Murata', 'TDK', 'Yageo', 'KEMET', 'Vishay',
  'Panasonic', 'Nichicon', 'Würth Elektronik', 'Bourns', 'ROHM', 'Rohm Semi.',
  'Toshiba', 'Infineon', 'Texas Instruments', 'Analog Devices', 'NXP Semiconductors',
  'STMicroelectronics', 'Microchip Tech', 'onsemi', 'Diodes Incorporated',
  'Espressif Systems', 'Sunlord', 'Everlight Elec', 'JST Sales America',
  'Torex Semiconductor',
]);

const CANON_BRAND = {
  'Samsung Electro-Mechanics': 'Samsung',
  'KEMET': 'Kemet',
  'Würth Elektronik': 'Wurth',
  'ROHM': 'Rohm',
  'Rohm Semi.': 'Rohm',
  'Texas Instruments': 'TI',
  'Analog Devices': 'ADI',
  'NXP Semiconductors': 'NXP',
  'STMicroelectronics': 'ST',
  'Microchip Tech': 'Microchip',
  'onsemi': 'Onsemi',
  'Diodes Incorporated': 'Diodes Inc',
  'Espressif Systems': 'Espressif',
  'Everlight Elec': 'Everlight',
  'Hubei KENTO Elec': 'Hubei KENTO',
  'UNI-ROYAL(Uniroyal Elec)': 'UNI-ROYAL',
  'FH(Guangdong Fenghua Advanced Tech)': 'Fenghua',
  'JieJie Microelectronics': 'JieJie',
  'Microdiode Electronics': 'MDD',
  'Nanjing Qinheng Microelectronics': 'WCH',
  'Advanced Monolithic Systems': 'AMS',
  'XKB Connection': 'XKB',
  'JST Sales America': 'JST',
  'Torex Semiconductor': 'Torex',
};

function canonBrand(raw) {
  const t = (raw || '').trim();
  return CANON_BRAND[t] || t;
}

function classifyTier(libraryType, manufacturer) {
  if ((libraryType || '').toLowerCase() === 'basic') return 'basic';
  const display = Object.keys(CANON_BRAND).find(k => CANON_BRAND[k] === manufacturer) || manufacturer;
  if (GLOBAL_BRANDS.has(display) || GLOBAL_BRANDS.has(manufacturer)) return 'tier1';
  return 'tier3';
}

// --- Value extraction ----------------------------------------------------

const UNIT_PREFIX = { p: 1e-12, n: 1e-9, u: 1e-6, µ: 1e-6, m: 1e-3, '': 1, k: 1e3, M: 1e6, G: 1e9 };

/** Extract capacitance in Farads from a description string. */
function parseCap(desc) {
  const m = desc.match(/(\d+(?:\.\d+)?)\s*(p|n|u|µ|m)?F\b/i);
  if (!m) return null;
  const v = parseFloat(m[1]);
  const pfx = (m[2] || '').toLowerCase();
  return v * (UNIT_PREFIX[pfx] ?? 1);
}

/** Extract resistance in Ohms. Handles "10kΩ", "4.99kΩ", "470Ω", "0Ω". */
function parseRes(desc) {
  const m = desc.match(/(\d+(?:\.\d+)?)\s*([kMG]?)Ω/);
  if (!m) return null;
  const v = parseFloat(m[1]);
  const pfx = m[2] || '';
  return v * (UNIT_PREFIX[pfx] ?? 1);
}

/** Extract inductance in Henries. */
function parseInd(desc) {
  const m = desc.match(/(\d+(?:\.\d+)?)\s*(p|n|u|µ|m)?H\b/i);
  if (!m) return null;
  const v = parseFloat(m[1]);
  const pfx = (m[2] || '').toLowerCase();
  return v * (UNIT_PREFIX[pfx] ?? 1);
}

function parseTolerance(desc) {
  const m = desc.match(/±?\s*(\d+(?:\.\d+)?)\s*%/);
  return m ? parseFloat(m[1]) / 100 : null;
}

function parseVoltage(desc) {
  const m = desc.match(/(\d+(?:\.\d+)?)\s*V\b/);
  return m ? parseFloat(m[1]) : null;
}

function parseTempco(desc) {
  const m = desc.match(/\b(C0G|NP0|X5R|X7R|X7S|Y5V|X8R)\b/);
  return m ? m[1].toUpperCase() : null;
}

/** Imperial ↔ metric package aliases. Canonicalize to imperial. */
const PKG_ALIAS = new Map([
  ['1005', '0402'], ['1608', '0603'], ['2012', '0805'], ['3216', '1206'],
  ['3225', '1210'], ['5025', '2010'], ['6432', '2512'],
]);

function canonPackage(raw) {
  const t = (raw || '').trim();
  return PKG_ALIAS.get(t) || t;
}

// --- CSV parsing (RFC 4180-ish, streaming-friendly) ---------------------

function parseCSV(text) {
  const rows = [];
  let row = [], cell = '', inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') inQuotes = false;
      else cell += ch;
    } else {
      if (ch === '"') inQuotes = true;
      else if (ch === ',') { row.push(cell); cell = ''; }
      else if (ch === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; }
      else if (ch === '\r') { /* ignore */ }
      else cell += ch;
    }
  }
  if (cell.length || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

// --- Main ----------------------------------------------------------------

function main() {
  const [, , csvPath] = process.argv;
  if (!csvPath) {
    console.error('Usage: node scripts/build-data.js <path-to-library.csv>');
    process.exit(1);
  }
  console.log(`Reading ${csvPath}...`);
  const text = fs.readFileSync(csvPath, 'utf8');
  const rows = parseCSV(text);
  const header = rows.shift().map(h => h.trim());
  const col = name => header.indexOf(name);

  const iLcsc = col('LCSC Part'), iCat1 = col('First Category'), iCat2 = col('Second Category');
  const iMpn = col('MFR.Part'), iPkg = col('Package'), iMfr = col('Manufacturer');
  const iLib = col('Library Type'), iDesc = col('Description');
  const iDs = col('Datasheet'), iPrice = col('Price'), iStock = col('Stock');

  const shards = {};
  let skipped = 0;

  for (const r of rows) {
    const cat1 = (r[iCat1] || '').trim();
    const shardName = CATEGORY_MAP[cat1];
    if (!shardName) { skipped++; continue; }

    const desc = r[iDesc] || '';
    const mfr = canonBrand(r[iMfr]);
    const lib = r[iLib] || '';
    const part = {
      lcsc: r[iLcsc],
      mpn: r[iMpn],
      mfr,
      package: canonPackage(r[iPkg]),
      tier: classifyTier(lib, mfr),
      stock: parseInt(r[iStock], 10) || 0,
      price: parseFloat((r[iPrice] || '0').split(',')[0].replace(/[^\d.]/g, '')) || 0,
      datasheet: r[iDs] || '',
      desc,
    };

    const tol = parseTolerance(desc); if (tol != null) part.tolerance = tol;
    const v   = parseVoltage(desc);   if (v   != null) part.voltage   = v;

    if (shardName === 'capacitors') {
      const val = parseCap(desc); if (val != null) part.value = val;
      const tc  = parseTempco(desc); if (tc) part.tempco = tc;
    } else if (shardName === 'resistors') {
      const val = parseRes(desc); if (val != null) part.value = val;
    } else if (shardName === 'inductors') {
      const val = parseInd(desc); if (val != null) part.value = val;
    }

    (shards[shardName] ||= []).push(part);
  }

  const outDir = path.join(__dirname, '..', 'data', 'categories');
  fs.mkdirSync(outDir, { recursive: true });
  const counts = {};
  for (const [name, parts] of Object.entries(shards)) {
    // Sort: basic first, then tier1, then tier3; within tier by stock desc
    const tierRank = { basic: 0, tier1: 1, tier3: 2 };
    parts.sort((a, b) => (tierRank[a.tier] - tierRank[b.tier]) || (b.stock - a.stock));
    fs.writeFileSync(path.join(outDir, `${name}.json`), JSON.stringify(parts));
    counts[name] = parts.length;
    console.log(`  ${name}: ${parts.length} parts`);
  }

  const meta = {
    snapshot_date: new Date().toISOString().slice(0, 10),
    source: 'JLCPCB Component Library CSV',
    part_count: Object.values(counts).reduce((a, b) => a + b, 0),
    skipped_uncategorized: skipped,
    categories: Object.keys(shards),
    counts,
  };
  fs.writeFileSync(path.join(__dirname, '..', 'data', 'snapshot-meta.json'), JSON.stringify(meta, null, 2));
  console.log(`Done. ${meta.part_count} parts across ${meta.categories.length} categories (${skipped} skipped).`);
}

main();
