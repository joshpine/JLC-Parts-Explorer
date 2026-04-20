#!/usr/bin/env node
/**
 * Pulls the JLC parts catalog from yaqwsx's public mirror (yaqwsx/jlcparts) and
 * reshapes it into our per-shard JSON format.
 *
 * yaqwsx exposes:
 *   https://yaqwsx.github.io/jlcparts/data/index.json           — manifest
 *   https://yaqwsx.github.io/jlcparts/data/<source>.json.gz     — components
 *   https://yaqwsx.github.io/jlcparts/data/<source>.stock.json  — LCSC→stock
 *
 * Usage: node scripts/ingest-jlcparts.js
 */

const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

const CACHE = path.join(__dirname, '..', '.cache-jlc');
fs.mkdirSync(CACHE, { recursive: true });

const BASE = 'https://yaqwsx.github.io/jlcparts/data';

const SHARD_ORDER = ['capacitors', 'resistors', 'inductors', 'diodes', 'leds', 'mosfets', 'ics', 'connectors', 'crystals', 'other'];

function classifyShard(top, sub) {
  const scope = `${top} ${sub}`.toLowerCase();

  if (/capacitor/.test(scope)) return 'capacitors';
  if (/resistor/.test(scope)) return 'resistors';
  if (/inductor|choke|transformer|coil/.test(scope)) return 'inductors';
  if (/diode|rectifier|tvs|esd protection/.test(scope)) return 'diodes';
  if (/led|optoelectronic|infrared|display/.test(scope)) return 'leds';
  if (/mosfet|transistor|bjt|igbt/.test(scope)) return 'mosfets';
  if (/connector|socket|terminal block|header|usb connector|ffc|fpc/.test(scope)) return 'connectors';
  if (/crystal|oscillator|resonator|clock generator/.test(scope)) return 'crystals';

  if (
    /embedded|processor|controller|power management|amplifier|interface|logic|memory|driver|audio|rf|wireless|pmic|data converter|adc|dac|sensor interface|opamp|comparator|switching controller|gate driver|transceiver|eeprom|flash|fpga|cpld|isolator|timer|watchdog|reference|supervisor|rtc|ethernet|usb ic|can ic/.test(scope)
  ) return 'ics';

  return 'other';
}

// Brands that render as "Reputable Extended" when not Basic.
// These are matched against the raw JLC manufacturer string (case-insensitive
// substring) so we don't have to enumerate every "Murata Electronics", etc.
const GLOBAL_BRAND_MATCH = [
  'Samsung Electro-Mechanics', 'Samsung', 'Murata', 'TDK', 'Yageo', 'KEMET',
  'Vishay', 'Panasonic', 'Nichicon', 'Würth', 'Wurth', 'Bourns', 'ROHM',
  'Toshiba', 'Infineon', 'Texas Instruments', 'Analog Devices', 'NXP',
  'STMicroelectronics', 'Microchip', 'onsemi', 'ON Semiconductor',
  'Diodes Incorporated', 'Espressif', 'Sunlord', 'Everlight', 'JST',
  'Torex', 'Renesas', 'Maxim Integrated', 'Linear Technology',
  'Silicon Labs', 'Cypress', 'Nexperia', 'Kyocera', 'Taiyo Yuden',
  'Walsin', 'Samwha', 'Abracon', 'TE Connectivity', 'Molex', 'Amphenol',
  'Hirose', 'FCI',
];

// Display-name normalization for brands we track in brands.json.
// Left side is a *substring* (case-insensitive) of the raw JLC manufacturer;
// right is the key used in data/brands.json.
const CANON_BRAND = [
  [/^Samsung Electro-?Mechanics/i, 'Samsung'],
  [/^Samsung$/i, 'Samsung'],
  [/Murata/i, 'Murata'],
  [/^TDK/i, 'TDK'],
  [/^Yageo/i, 'Yageo'],
  [/KEMET/i, 'Kemet'],
  [/Vishay/i, 'Vishay'],
  [/Panasonic/i, 'Panasonic'],
  [/Nichicon/i, 'Nichicon'],
  [/W[üu]rth/i, 'Wurth'],
  [/Bourns/i, 'Bourns'],
  [/ROHM|Rohm/i, 'Rohm'],
  [/Toshiba/i, 'Toshiba'],
  [/Infineon/i, 'Infineon'],
  [/Texas Instruments|^TI(?![A-Za-z])/i, 'TI'],
  [/Analog Devices/i, 'ADI'],
  [/NXP/i, 'NXP'],
  [/STMicroelectronics|^ST\b/i, 'ST'],
  [/Microchip/i, 'Microchip'],
  [/^onsemi|ON Semiconductor/i, 'Onsemi'],
  [/Diodes Incorporated|Diodes Inc/i, 'Diodes Inc'],
  [/Espressif/i, 'Espressif'],
  [/Sunlord/i, 'Sunlord'],
  [/Everlight/i, 'Everlight'],
  [/JST|Japan Solderless/i, 'JST'],
  [/Torex/i, 'Torex'],
  [/Hubei KENTO/i, 'Hubei KENTO'],
  [/UNI-?ROYAL|Uniroyal/i, 'UNI-ROYAL'],
  [/FH\(|Fenghua/i, 'Fenghua'],
  [/JieJie/i, 'JieJie'],
  [/Microdiode|^MDD/i, 'MDD'],
  [/WCH|Qinheng/i, 'WCH'],
  [/Advanced Monolithic|^AMS(?![A-Za-z])/i, 'AMS'],
  [/XKB/i, 'XKB'],
  [/Chang.?jiang|^CJ /i, 'Chang Jiang'],
  [/Worldsemi/i, 'Worldsemi'],
  [/WINSOK/i, 'WINSOK'],
  [/BOOM(ELE|\.|$|\()|Boom Precision/i, 'BOOMELE'],
];

function canonBrand(raw) {
  const t = (raw || '').trim();
  for (const [re, out] of CANON_BRAND) if (re.test(t)) return out;
  return t;
}

function classifyTier(basicFlag, rawMfr) {
  if ((basicFlag || '').toLowerCase() === 'basic') return 'basic';
  const t = rawMfr || '';
  for (const g of GLOBAL_BRAND_MATCH) {
    if (t.toLowerCase().includes(g.toLowerCase())) return 'tier1';
  }
  return 'tier3';
}

// --- Value extraction (fallback from description when attrs are strings) ---

const UNIT_PREFIX = { p: 1e-12, n: 1e-9, u: 1e-6, µ: 1e-6, m: 1e-3, '': 1, k: 1e3, M: 1e6, G: 1e9 };

function parseCap(desc) {
  const m = desc.match(/(\d+(?:\.\d+)?)\s*(p|n|u|µ|m)?F\b/i);
  if (!m) return null;
  return parseFloat(m[1]) * (UNIT_PREFIX[(m[2] || '').toLowerCase()] ?? 1);
}
function parseRes(desc) {
  const m = desc.match(/(\d+(?:\.\d+)?)\s*([kMG]?)(?:Ω|Ohm|ohm|R)\b/);
  if (!m) return null;
  return parseFloat(m[1]) * (UNIT_PREFIX[m[2] || ''] ?? 1);
}
function parseInd(desc) {
  const m = desc.match(/(\d+(?:\.\d+)?)\s*(p|n|u|µ|m)?H\b/i);
  if (!m) return null;
  return parseFloat(m[1]) * (UNIT_PREFIX[(m[2] || '').toLowerCase()] ?? 1);
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
function parseNumericAmps(s) {
  if (typeof s === 'number') return s;
  const t = String(s);
  const m = t.match(/(\d+(?:\.\d+)?)\s*(m|u|µ|n)?A\b/i);
  if (!m) return null;
  return parseFloat(m[1]) * (UNIT_PREFIX[(m[2] || '').toLowerCase()] ?? 1);
}
function parseNumericOhms(s) {
  if (typeof s === 'number') return s;
  const t = String(s);
  const m = t.match(/(\d+(?:\.\d+)?)\s*(m|u|µ)?(Ω|Ohm|ohm)\b/i);
  if (!m) return null;
  return parseFloat(m[1]) * (UNIT_PREFIX[(m[2] || '').toLowerCase()] ?? 1);
}
function parseNumericVolts(s) {
  if (typeof s === 'number') return s;
  const t = String(s);
  const m = t.match(/(-?\d+(?:\.\d+)?)\s*V\b/i);
  if (!m) return null;
  return parseFloat(m[1]);
}
function parseWavelengthNm(s) {
  const t = String(s);
  const m = t.match(/(\d{3,4})\s*nm/);
  return m ? parseInt(m[1], 10) : null;
}

// --- Package normalization -----------------------------------------------

const PKG_ALIAS = new Map([
  ['1005', '0402'], ['1608', '0603'], ['2012', '0805'], ['3216', '1206'],
  ['3225', '1210'], ['5025', '2010'], ['6432', '2512'],
]);
// Strip Chinese/Asian mounting-style prefixes that JLC ships in the Package field.
// Example raw: "插件,P=2mm" → "P=2mm"; "弯插,P=2.54mm" → "P=2.54mm"; "贴片" → "SMD".
function cleanPackageText(t) {
  if (!t) return t;
  let out = t
    .replace(/^[^\x00-\x7F,\s]+[,，、]\s*/u, '')  // lead Chinese label + comma
    .replace(/[\u4e00-\u9fff]+/gu, '')            // stray CJK chars
    .replace(/\s*,\s*,\s*/g, ',')
    .replace(/^[,，\s]+|[,，\s]+$/g, '')
    .trim();
  return out || t;  // never return empty
}

function canonPackage(raw) {
  const t = cleanPackageText((raw || '').trim());
  return PKG_ALIAS.get(t) || t;
}

// --- Attribute helpers ----------------------------------------------------

function attrVal(attrs, ...keys) {
  for (const k of keys) {
    for (const ak of Object.keys(attrs || {})) {
      if (ak.toLowerCase() === k.toLowerCase()) {
        const box = attrs[ak];
        const prim = box?.primary;
        if (prim && box.values && box.values[prim]) return box.values[prim][0];
      }
    }
  }
  return null;
}
function attrRaw(attrs, ...keys) {
  const v = attrVal(attrs, ...keys);
  if (v && typeof v === 'object') return null; // skip nested (like Category)
  return v;
}

// --- HTTP + cache ---------------------------------------------------------

async function fetchCached(url, destName) {
  const dest = path.join(CACHE, destName);
  if (fs.existsSync(dest) && fs.statSync(dest).size > 0) return dest;
  process.stdout.write(`  ↓ ${destName} `);
  const res = await fetch(url);
  if (!res.ok) {
    process.stdout.write('FAIL ' + res.status + '\n');
    throw new Error(`fetch ${url} → ${res.status}`);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(dest, buf);
  process.stdout.write(`${(buf.length / 1024).toFixed(0)} KB\n`);
  return dest;
}

async function loadShard(sourcename) {
  const gzPath = await fetchCached(`${BASE}/${sourcename}.json.gz`, `${sourcename}.json.gz`);
  const stockPath = await fetchCached(`${BASE}/${sourcename}.stock.json`, `${sourcename}.stock.json`);
  const compText = zlib.gunzipSync(fs.readFileSync(gzPath)).toString('utf8');
  const comp = JSON.parse(compText);
  const stock = JSON.parse(fs.readFileSync(stockPath, 'utf8'));
  return { comp, stock };
}

// --- Per-shard record builders -------------------------------------------

function baseRecord(c, stock, desc, attrs) {
  const rawMfr = attrRaw(attrs, 'Manufacturer') || '';
  const basic = attrRaw(attrs, 'Basic/Extended');
  const pkg = canonPackage(attrRaw(attrs, 'Package') || '');
  const prices = Array.isArray(c[5]) ? c[5] : [];
  const price = prices.length ? prices[prices.length - 1].price : 0;  // bulk price
  return {
    lcsc: c[0],
    mpn: c[1],
    mfr: canonBrand(rawMfr),
    _rawMfr: rawMfr,
    package: pkg,
    tier: classifyTier(basic, rawMfr),
    stock: stock || 0,
    price: Number(price) || 0,
    datasheet: c[4] || '',
    desc,
  };
}

function roundSig(v, sig = 4) {
  if (v == null || v === 0 || !isFinite(v)) return v;
  const d = Math.ceil(Math.log10(Math.abs(v)));
  const p = sig - d;
  const m = Math.pow(10, p);
  return Math.round(v * m) / m;
}

function buildCapacitor(c, stock) {
  const attrs = c[8] || {};
  const desc = c[3] || '';
  const r = baseRecord(c, stock, desc, attrs);
  const val = attrVal(attrs, 'Capacitance');
  const raw = typeof val === 'number' ? val : parseCap(desc);
  r.value = raw != null ? roundSig(raw) : null;
  const tol = parseTolerance(attrRaw(attrs, 'Tolerance') || desc);
  if (tol != null) r.tolerance = tol;
  const v = attrVal(attrs, 'Rated Voltage', 'Allowable voltage', 'Voltage');
  r.voltage = typeof v === 'number' ? v : (parseVoltage(desc) ?? null);
  const tc = attrRaw(attrs, 'Temperature coefficient', 'Temperature Coefficient') || parseTempco(desc);
  if (tc && tc !== '-') r.tempco = tc;
  return r;
}

function buildResistor(c, stock) {
  const attrs = c[8] || {};
  const desc = c[3] || '';
  const r = baseRecord(c, stock, desc, attrs);
  const val = attrVal(attrs, 'Resistance');
  const raw = typeof val === 'number' ? val : parseRes(desc);
  r.value = raw != null ? roundSig(raw) : null;
  const tol = parseTolerance(attrRaw(attrs, 'Tolerance') || desc);
  if (tol != null) r.tolerance = tol;
  const powStr = attrRaw(attrs, 'Power', 'Power (Watts)', 'Power Rating');
  if (powStr) {
    const m = String(powStr).match(/(\d+(?:\/\d+)?)W/i);
    if (m) {
      if (m[1].includes('/')) {
        const [a, b] = m[1].split('/').map(Number);
        r.power = a / b;
      } else {
        r.power = parseFloat(m[1]);
      }
    }
  }
  return r;
}

function buildInductor(c, stock) {
  const attrs = c[8] || {};
  const desc = c[3] || '';
  const r = baseRecord(c, stock, desc, attrs);
  const val = attrVal(attrs, 'Inductance');
  const raw = typeof val === 'number' ? val : parseInd(desc);
  r.value = raw != null ? roundSig(raw) : null;
  const cur = attrVal(attrs, 'Rated current', 'Saturation current', 'Current');
  const curN = typeof cur === 'number' ? cur : parseNumericAmps(cur);
  if (curN != null) r.current = Number(curN.toFixed(3));
  const dcr = attrVal(attrs, 'DC Resistance (DCR)', 'DC resistance (DCR)', 'DCR');
  const dcrN = typeof dcr === 'number' ? dcr : parseNumericOhms(dcr);
  if (dcrN != null) r.dcr = Number(dcrN.toFixed(4));
  return r;
}

function buildDiode(c, stock, subcat) {
  const attrs = c[8] || {};
  const desc = c[3] || '';
  const r = baseRecord(c, stock, desc, attrs);
  const vf = attrVal(attrs, 'Forward voltage (vf)', 'Forward Voltage (VF)', 'VF');
  const vfN = typeof vf === 'number' ? vf : parseNumericVolts(vf);
  if (vfN != null) r.vf = vfN;
  const ifv = attrVal(attrs, 'Forward current', 'Forward Current (IF)', 'IF');
  const ifN = typeof ifv === 'number' ? ifv : parseNumericAmps(ifv);
  if (ifN != null) r.if = ifN;
  const vr = attrVal(attrs, 'Reverse voltage (vr)', 'Reverse Voltage (VR)');
  const vrN = typeof vr === 'number' ? vr : parseNumericVolts(vr);
  if (vrN != null) r.voltage = vrN;
  // Type derived from subcategory
  if (/Zener/i.test(subcat)) r.type = 'Zener';
  else if (/Schottky/i.test(subcat)) r.type = 'Schottky';
  else if (/TVS/i.test(subcat)) r.type = 'TVS';
  else if (/Switching/i.test(subcat)) r.type = 'Switching';
  else if (/Bridge/i.test(subcat)) r.type = 'Bridge Rectifier';
  else if (/ESD/i.test(subcat)) r.type = 'ESD';
  else if (/General/i.test(subcat)) r.type = 'Rectifier';
  return r;
}

const LED_COLOR_MAP = [
  [/white/i, 'white'], [/warm white/i, 'white'],
  [/red/i, 'red'], [/blue/i, 'blue'], [/green/i, 'green'],
  [/yellow/i, 'yellow'], [/orange/i, 'orange'], [/amber/i, 'amber'],
  [/purple|violet/i, 'purple'], [/pink/i, 'pink'], [/uv|ultra.?violet/i, 'uv'],
  [/infrared|IR\b/i, 'ir'], [/rgb/i, 'rgb'], [/emerald/i, 'green'],
];

function buildLed(c, stock, subcat) {
  const attrs = c[8] || {};
  const desc = c[3] || '';
  const r = baseRecord(c, stock, desc, attrs);
  const color = attrRaw(attrs, 'Emitted color', 'Emission color', 'Color');
  let col = null;
  if (color) {
    for (const [re, name] of LED_COLOR_MAP) if (re.test(String(color))) { col = name; break; }
  }
  if (!col) for (const [re, name] of LED_COLOR_MAP) if (re.test(desc)) { col = name; break; }
  if (/RGB/i.test(subcat)) col = col || 'rgb';
  if (col) r.color = col;
  const wl = attrRaw(attrs, 'Dominant wavelength', 'Peak wavelength', 'Wavelength');
  const wlN = parseWavelengthNm(wl);
  if (wlN) r.wavelength = wlN;
  const vf = attrVal(attrs, 'Forward voltage (vf)', 'Forward Voltage (VF)');
  const vfN = typeof vf === 'number' ? vf : parseNumericVolts(vf);
  if (vfN != null) r.vf = vfN;
  const ifv = attrVal(attrs, 'Forward current', 'Forward Current (IF)');
  const ifN = typeof ifv === 'number' ? ifv : parseNumericAmps(ifv);
  if (ifN != null) r.if = ifN;
  return r;
}

function buildMosfet(c, stock, subcat) {
  const attrs = c[8] || {};
  const desc = c[3] || '';
  const r = baseRecord(c, stock, desc, attrs);
  const type = attrRaw(attrs, 'Type');
  if (type) {
    const s = String(type);
    if (/N-?channel/i.test(s)) r.channel = 'N';
    else if (/P-?channel/i.test(s)) r.channel = 'P';
    // count: "2 N-channel" etc.
    const m = s.match(/^(\d+)\s*[NPnp]/);
    if (m) r.type = `${m[1]}× ${r.channel || ''}-Channel`.trim();
  }
  // Also capture BJT polarity for BJTs
  if (/BJT|Bipolar|NPN|PNP/i.test(subcat) || /NPN|PNP/i.test(desc)) {
    if (/NPN/i.test(desc)) r.type = 'NPN';
    else if (/PNP/i.test(desc)) r.type = 'PNP';
    r.channel = null;  // BJTs don't have channels
  }
  const vds = attrVal(attrs, 'Drain source voltage (vdss)', 'Vdss');
  const vdsN = typeof vds === 'number' ? vds : parseNumericVolts(vds);
  if (vdsN != null) r.vds = vdsN;
  const id = attrVal(attrs, 'Continuous drain current (id)', 'ID', 'Collector current');
  const idN = typeof id === 'number' ? id : parseNumericAmps(id);
  if (idN != null) r.id = Number(idN.toFixed(2));
  const rds = attrVal(attrs, 'Drain source on resistance (rds(on)@vgs,id)', 'Rds(on)');
  const rdsN = typeof rds === 'number' ? rds : parseNumericOhms(rds);
  if (rdsN != null) r.rds_on = Number(rdsN.toFixed(5));
  const vgs = attrVal(attrs, 'Gate threshold voltage (vgs(th)@id)', 'Vgs(th)');
  const vgsN = typeof vgs === 'number' ? vgs : parseNumericVolts(vgs);
  if (vgsN != null) r.vgs_th = vgsN;
  return r;
}

function buildIc(c, stock, subcat) {
  const attrs = c[8] || {};
  const desc = c[3] || '';
  const r = baseRecord(c, stock, desc, attrs);
  // Infer a short "function" label from the subcategory
  const fnMap = [
    [/MCU|Microcontroller/i, 'MCU'],
    [/LDO|Linear Voltage/i, 'LDO'],
    [/DC-DC|Switching/i, 'DC-DC'],
    [/Operational Amplifier|Op.?Amp/i, 'Op-Amp'],
    [/Comparator/i, 'Comparator'],
    [/UART/i, 'UART'],
    [/USB/i, 'USB'],
    [/CAN/i, 'CAN'],
    [/RS.?485|RS.?422/i, 'RS-485'],
    [/RS.?232/i, 'RS-232'],
    [/Ethernet/i, 'Ethernet'],
    [/Gate/i, 'Logic Gate'],
    [/Buffer|Driver|Transceiver/i, 'Buffer/Driver'],
    [/EEPROM/i, 'EEPROM'],
    [/FLASH/i, 'NOR Flash'],
  ];
  for (const [re, label] of fnMap) if (re.test(subcat)) { r.function = label; break; }
  return r;
}

function buildConnector(c, stock, subcat) {
  const attrs = c[8] || {};
  const desc = c[3] || '';
  const r = baseRecord(c, stock, desc, attrs);
  // Pins
  const pinStr = attrRaw(attrs, 'Number of pins', 'Pin structure', 'Number of Pins');
  if (pinStr) {
    const s = String(pinStr);
    const m = s.match(/(\d+)\s*[xX\*]\s*(\d+)/) || s.match(/(\d+)\s*[Pp]/);
    if (m) {
      if (m[2]) r.pins = parseInt(m[1], 10) * parseInt(m[2], 10);
      else r.pins = parseInt(m[1], 10);
    }
  }
  const typeMap = [
    [/Pin Header/i, 'Pin Header'],
    [/Female Header/i, 'Female Header'],
    [/USB/i, 'USB'],
    [/FFC|FPC/i, 'FFC/FPC'],
    [/Wire[- ]?to[- ]?Board/i, 'Wire-to-Board'],
    [/Screw Terminal/i, 'Terminal Block'],
    [/IC Socket/i, 'IC Socket'],
  ];
  for (const [re, label] of typeMap) if (re.test(subcat)) { r.type = label; break; }
  const pitch = attrRaw(attrs, 'Pitch');
  if (pitch) {
    const m = String(pitch).match(/(\d+(?:\.\d+)?)\s*mm/);
    if (m) r.pitch = parseFloat(m[1]);
  }
  return r;
}

function parseFrequencyHz(s) {
  if (s == null) return null;
  if (typeof s === 'number') return s;
  const m = String(s).match(/(\d+(?:\.\d+)?)\s*(k|M|G)?Hz/i);
  if (!m) return null;
  const pfx = (m[2] || '').replace('K', 'k');
  const mult = { k: 1e3, M: 1e6, G: 1e9, '': 1 }[pfx] ?? 1;
  return parseFloat(m[1]) * mult;
}

function parseLoadCapPf(s) {
  if (s == null) return null;
  const m = String(s).match(/(\d+(?:\.\d+)?)\s*pF/i);
  return m ? parseFloat(m[1]) : null;
}

function buildCrystal(c, stock, subcat) {
  const attrs = c[8] || {};
  const desc = c[3] || '';
  const r = baseRecord(c, stock, desc, attrs);
  // Frequency: attrs → MPN → description
  const fAttr = attrRaw(attrs, 'Frequency');
  let hz = parseFrequencyHz(fAttr && fAttr !== '-' ? fAttr : null);
  if (hz == null) hz = parseFrequencyHz(c[1]);
  if (hz == null) hz = parseFrequencyHz(desc);
  if (hz != null) r.value = roundSig(hz, 6);
  // Load capacitance (pF)
  const lc = attrRaw(attrs, 'Load capacitance', 'External load capacitor', 'Load Capacitance');
  const lcN = parseLoadCapPf(lc);
  if (lcN != null) r.load_cap = lcN;
  // Stability (±Xppm)
  const stab = attrRaw(attrs, 'Frequency stability', 'Frequency Stability');
  if (stab && stab !== '-') r.stability = String(stab).trim();
  const ftol = attrRaw(attrs, 'Frequency tolerance', 'Frequency Tolerance');
  if (ftol && ftol !== '-') r.freq_tol = String(ftol).trim();
  const ctype = attrRaw(attrs, 'Crystal type', 'Crystal Type');
  if (ctype && ctype !== '-') r.crystal_type = String(ctype).trim();
  // Classify type from subcategory
  if (/Oscillator/i.test(subcat)) r.type = 'Oscillator';
  else if (/Ceramic/i.test(subcat)) r.type = 'Ceramic Resonator';
  else r.type = 'Crystal';
  return r;
}

function buildOther(c, stock, subcat, topcat) {
  const attrs = c[8] || {};
  const desc = c[3] || '';
  const r = baseRecord(c, stock, desc, attrs);
  const bucket = classifyShard(topcat, subcat);
  if (bucket !== 'other') r.type = bucket;
  else if (subcat) r.type = subcat;
  return r;
}

const BUILDER = {
  capacitors: (c, s) => buildCapacitor(c, s),
  resistors:  (c, s) => buildResistor(c, s),
  inductors:  (c, s) => buildInductor(c, s),
  diodes:     (c, s, sc) => buildDiode(c, s, sc),
  leds:       (c, s, sc) => buildLed(c, s, sc),
  mosfets:    (c, s, sc) => buildMosfet(c, s, sc),
  ics:        (c, s, sc) => buildIc(c, s, sc),
  connectors: (c, s, sc) => buildConnector(c, s, sc),
  crystals:   (c, s, sc) => buildCrystal(c, s, sc),
  other:      (c, s, sc, tc) => buildOther(c, s, sc, tc),
};

// --- Main ----------------------------------------------------------------

async function main() {
  console.log('Fetching manifest...');
  const manifestPath = await fetchCached(`${BASE}/index.json`, 'index.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')).categories;

  const outDir = path.join(__dirname, '..', 'data', 'categories');
  fs.mkdirSync(outDir, { recursive: true });

  const recordsByShard = new Map(SHARD_ORDER.map(name => [name, new Map()]));
  const counts = {};
  let total = 0;

  for (const [top, subcats] of Object.entries(manifest)) {
    console.log(`\n== ${top} ==`);
    for (const [sub, entry] of Object.entries(subcats)) {
      const shard = classifyShard(top, sub);
      const records = recordsByShard.get(shard);
      const build = BUILDER[shard] || BUILDER.other;
      console.log(`  ${sub} -> ${shard}`);
      try {
        const { comp, stock } = await loadShard(entry.sourcename);
        for (const c of comp.components) {
          const lcsc = c[0];
          const st = stock[lcsc] ?? 0;
          if (st <= 0) continue;
          if (records.has(lcsc)) continue;
          const rec = build(c, st, sub, top);
          if (!rec.mpn || !rec.mfr) continue;
          records.set(lcsc, rec);
        }
      } catch (e) {
        console.log(`    ERROR: ${e.message}`);
      }
    }
  }

  const tierRank = { basic: 0, tier1: 1, tier3: 2 };
  for (const shard of SHARD_ORDER) {
    const records = recordsByShard.get(shard);
    if (!records?.size) continue;

    let parts = [...records.values()]
      .sort((a, b) => (tierRank[a.tier] - tierRank[b.tier]) || (b.stock - a.stock));

    parts = parts.map(p => {
      const { _rawMfr, ...clean } = p;
      return clean;
    });

    fs.writeFileSync(path.join(outDir, `${shard}.json`), JSON.stringify(parts));
    counts[shard] = parts.length;
    total += parts.length;
    console.log(`  -> ${shard}: ${parts.length} parts written`);
  }

  const meta = {
    snapshot_date: new Date().toISOString().slice(0, 10),
    source: 'yaqwsx/jlcparts mirror of the JLCPCB component library',
    source_url: 'https://yaqwsx.github.io/jlcparts/',
    part_count: total,
    categories: SHARD_ORDER.filter(name => counts[name]),
    counts,
  };
  fs.writeFileSync(path.join(__dirname, '..', 'data', 'snapshot-meta.json'),
    JSON.stringify(meta, null, 2));
  console.log(`\nDone. ${total} parts across ${meta.categories.length} categories.`);
}

main().catch(e => { console.error(e); process.exit(1); });
