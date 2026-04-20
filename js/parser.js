// Semantic shorthand parser: turns free-form engineer input into structured filters.
// Example: "100n 0402 x7r" → { value: 1e-7, unit: 'F', category: 'capacitors', package: '0402', tempco: 'X7R' }
// All regexes are anchored/bounded so ordering of tokens doesn't matter.

const UNIT_PREFIX = { p: 1e-12, n: 1e-9, u: 1e-6, µ: 1e-6, m: 1e-3, '': 1, k: 1e3, M: 1e6, G: 1e9 };

// Imperial ↔ metric chip package aliases (canonicalize to imperial)
const PKG_METRIC_TO_IMP = new Map([
  ['1005', '0402'], ['1608', '0603'], ['2012', '0805'], ['3216', '1206'],
  ['3225', '1210'], ['5025', '2010'], ['6432', '2512'],
]);
const CHIP_PKGS = new Set(['0201', '0402', '0603', '0805', '1206', '1210', '1812', '2010', '2512']);
const DISCRETE_PKGS = new Set([
  'SOT-23', 'SOT-23-3', 'SOT-23-5', 'SOT-23-6', 'SOT-223', 'SOT-89', 'SOT-323',
  'SOD-123', 'SOD-323', 'SOD-523', 'SMA', 'SMB', 'SMC', 'DO-214AC', 'DO-214AA',
  'TO-220', 'TO-252', 'DPAK',
]);
const IC_PKGS_RE = /^(SOIC|TSSOP|MSOP|SSOP|LQFP|TQFP|QFN|DFN|BGA|LGA|WLCSP|SOP)-?\d+$/i;

const TEMPCO_RE = /^(C0G|NP0|X5R|X7R|X7S|X7T|X8R|Y5V|Z5U)$/i;

const CATEGORY_ALIAS = {
  cap: 'capacitors', caps: 'capacitors', capacitor: 'capacitors', capacitors: 'capacitors',
  res: 'resistors', resistor: 'resistors', resistors: 'resistors',
  ind: 'inductors', inductor: 'inductors', inductors: 'inductors',
  led: 'leds', leds: 'leds',
  mosfet: 'mosfets', mosfets: 'mosfets', fet: 'mosfets',
  diode: 'diodes', diodes: 'diodes',
  mcu: 'ics', cpu: 'ics', ic: 'ics', ics: 'ics',
  connector: 'connectors', connectors: 'connectors', header: 'connectors',
  crystal: 'crystals', crystals: 'crystals', xtal: 'crystals',
  oscillator: 'crystals', oscillators: 'crystals', osc: 'crystals',
  resonator: 'crystals', resonators: 'crystals',
};

const FUNCTION_TAGS = {
  ldo: 'LDO', regulator: 'Regulator', reg: 'Regulator',
  buck: 'Buck', boost: 'Boost',
  opamp: 'Op-Amp', 'op-amp': 'Op-Amp',
  timer: 'Timer', comparator: 'Comparator',
  adc: 'ADC', dac: 'DAC',
  usb: 'USB', uart: 'UART',
};

const COLORS = new Set(['red', 'green', 'blue', 'yellow', 'white', 'amber', 'orange', 'rgb', 'warm']);

// Known MPN prefixes — if a token starts with one we flag it as an MPN hint and skip the parametric path.
const MPN_PREFIXES = [
  'STM32', 'ATMEGA', 'ATTINY', 'AT32', 'ESP32', 'ESP8266',
  '74HC', '74HCT', '74LS', '74LVC',
  'CH340', 'CH32V', 'CH552',
  'AMS1117', 'NE555', 'LM358', 'LM324', 'LM317', 'LM7805',
  'AO3400', 'AO3401', 'SI2302',
  '1N4148', '1N4007', 'BAT54', 'SS34', 'SS14', 'SS54',
  'MP1584', 'MP2307', 'TPS', 'LDO', 'GRM', 'GCM', 'CL10', 'CL21',
  'CC0402', 'CC0603', 'CC0805', 'RC0402', 'RC0603',
  'IRFZ', 'IRF', 'PMEG',
];

function isKnownMpn(tok) {
  const up = tok.toUpperCase();
  return MPN_PREFIXES.some(p => up.startsWith(p));
}

// --- Token recognizers ---------------------------------------------------

/** "100n", "0.1uF", "4.7nF", "2.2uH", "10uH", "100pF" — cap or inductor value */
function tryCapOrIndValue(tok, out) {
  // Match number + optional prefix + optional F/H unit
  const m = tok.match(/^(\d+(?:\.\d+)?)(p|n|u|µ|m)?(F|H)?$/i);
  if (!m) return false;
  const num = parseFloat(m[1]);
  const pfx = (m[2] || '').toLowerCase().replace('µ', 'u');
  const unit = m[3]?.toUpperCase();
  if (!pfx && !unit) return false; // bare number — ambiguous, skip
  if (unit === 'F') {
    out.value = num * (UNIT_PREFIX[pfx] ?? 1);
    out.unit = 'F';
    return true;
  }
  if (unit === 'H') {
    out.value = num * (UNIT_PREFIX[pfx] ?? 1);
    out.unit = 'H';
    return true;
  }
  // No explicit unit. Engineer default: p/n/µ → capacitance; k/M → resistance (handled elsewhere)
  if (pfx === 'p' || pfx === 'n') {
    out.value = num * UNIT_PREFIX[pfx];
    out.unit = 'F';
    return true;
  }
  if (pfx === 'u') {
    // ambiguous between µF and µH — assume µF (far more common in shorthand)
    out.value = num * 1e-6;
    out.unit = 'F';
    return true;
  }
  return false;
}

/** "16MHz", "32.768kHz", "25M", "8MHz" — crystal/oscillator frequency */
function tryFrequency(tok, out) {
  const m = tok.match(/^(\d+(?:\.\d+)?)\s*(k|M|G)?Hz$/);
  if (!m) return false;
  const pfx = m[2] || '';
  out.value = parseFloat(m[1]) * (UNIT_PREFIX[pfx] ?? 1);
  out.unit = 'Hz';
  return true;
}

/** "10k", "4k7", "4.99k", "1M", "470R", "1R5", "0R22", "470Ω", "10kΩ" */
function tryResValue(tok, out) {
  // "4k7", "1R5" style: letter as decimal point
  let m = tok.match(/^(\d+)([kMR])(\d+)$/);
  if (m) {
    const pfx = m[2];
    const whole = parseFloat(m[1] + '.' + m[3]);
    const mult = pfx === 'R' ? 1 : UNIT_PREFIX[pfx];
    out.value = whole * mult;
    out.unit = 'Ω';
    return true;
  }
  // "10k", "4.99k", "1M", "470R", optional Ω
  m = tok.match(/^(\d+(?:\.\d+)?)([kMGR])Ω?$/);
  if (m) {
    const pfx = m[2];
    const mult = pfx === 'R' ? 1 : UNIT_PREFIX[pfx];
    out.value = parseFloat(m[1]) * mult;
    out.unit = 'Ω';
    return true;
  }
  // "470Ω" bare ohms
  m = tok.match(/^(\d+(?:\.\d+)?)Ω$/);
  if (m) {
    out.value = parseFloat(m[1]);
    out.unit = 'Ω';
    return true;
  }
  return false;
}

function tryPackage(tok, out) {
  const up = tok.toUpperCase();
  if (CHIP_PKGS.has(up)) { out.package = up; return true; }
  if (PKG_METRIC_TO_IMP.has(up)) { out.package = PKG_METRIC_TO_IMP.get(up); return true; }
  if (DISCRETE_PKGS.has(up)) { out.package = up; return true; }
  if (IC_PKGS_RE.test(up)) {
    // normalize SOIC8 → SOIC-8
    const norm = up.replace(/^([A-Z]+)-?(\d+)$/, '$1-$2');
    out.package = norm;
    return true;
  }
  return false;
}

function tryTolerance(tok, out) {
  const m = tok.match(/^±?(\d+(?:\.\d+)?)%$/);
  if (!m) return false;
  out.tolerance = parseFloat(m[1]) / 100;
  return true;
}

function tryVoltage(tok, out) {
  const m = tok.match(/^(\d+(?:\.\d+)?)V$/i);
  if (!m) return false;
  out.voltage = parseFloat(m[1]);
  return true;
}

function tryTempco(tok, out) {
  if (!TEMPCO_RE.test(tok)) return false;
  out.tempco = tok.toUpperCase().replace('NP0', 'C0G');
  return true;
}

function tryCategory(tok, out) {
  const alias = CATEGORY_ALIAS[tok.toLowerCase()];
  if (!alias) return false;
  out.category = alias;
  return true;
}

function tryColor(tok, out) {
  if (!COLORS.has(tok.toLowerCase())) return false;
  out.color = tok.toLowerCase();
  out.category ||= 'leds';
  return true;
}

function tryFunction(tok, out) {
  const tag = FUNCTION_TAGS[tok.toLowerCase()];
  if (!tag) return false;
  out.fnTags.push(tag);
  if (['LDO', 'Regulator', 'Buck', 'Boost', 'Op-Amp', 'Timer', 'Comparator', 'ADC', 'DAC'].includes(tag)) {
    out.category ||= 'ics';
  }
  return true;
}

function tryMpn(tok, out) {
  if (tok.length < 4) return false;
  if (!/[A-Z]/i.test(tok) || !/\d/.test(tok)) return false;
  if (isKnownMpn(tok)) {
    out.mpn = tok.toUpperCase();
    return true;
  }
  return false;
}

// --- Public API ----------------------------------------------------------

export function parse(input) {
  const out = {
    raw: input,
    value: null, unit: null,
    package: null, tolerance: null, voltage: null, tempco: null,
    category: null, color: null, mpn: null,
    fnTags: [], freeText: [],
  };
  if (!input) return out;
  const tokens = input.trim().split(/[\s,]+/).filter(Boolean);

  for (const raw of tokens) {
    const tok = raw.replace(/,$/, '');
    if (tryMpn(tok, out)) continue;
    if (tryFrequency(tok, out)) continue;
    if (tryResValue(tok, out)) continue;
    if (tryCapOrIndValue(tok, out)) continue;
    if (tryPackage(tok, out)) continue;
    if (tryTolerance(tok, out)) continue;
    if (tryVoltage(tok, out)) continue;
    if (tryTempco(tok, out)) continue;
    if (tryCategory(tok, out)) continue;
    if (tryColor(tok, out)) continue;
    if (tryFunction(tok, out)) continue;
    out.freeText.push(tok);
  }

  // Infer category from unit if not explicitly given
  if (!out.category) {
    if (out.unit === 'F') out.category = 'capacitors';
    else if (out.unit === 'Ω') out.category = 'resistors';
    else if (out.unit === 'H') out.category = 'inductors';
    else if (out.unit === 'Hz') out.category = 'crystals';
    else if (out.mpn) out.category = inferCategoryFromMpn(out.mpn);
  }

  return out;
}

function inferCategoryFromMpn(mpn) {
  const up = mpn.toUpperCase();
  if (/^(STM32|ATMEGA|ATTINY|AT32|ESP|CH32|CH55)/.test(up)) return 'ics';
  if (/^(74HC|74HCT|74LS|74LVC)/.test(up)) return 'ics';
  if (/^(NE555|LM358|LM324|LM317|LM7805|AMS1117|TPS)/.test(up)) return 'ics';
  if (/^(CH340|CH341)/.test(up)) return 'ics';
  if (/^(AO34|SI2302|IRF|IRFZ)/.test(up)) return 'mosfets';
  if (/^(1N4148|1N400|BAT54|SS|PMEG)/.test(up)) return 'diodes';
  if (/^(GRM|GCM|CL10|CL21|CC0402|CC0603|CC0805)/.test(up)) return 'capacitors';
  if (/^(RC0402|RC0603|ERJ)/.test(up)) return 'resistors';
  return null;
}

/** Human-readable label for a parsed filter chip. */
export function chipLabel(key, value) {
  if (key === 'value') {
    const { value: v, unit } = value; // special: value chip receives full parse
    return formatValue(v, unit);
  }
  if (key === 'tolerance') return `±${(value * 100).toFixed(value < 0.01 ? 2 : 1).replace(/\.0+$/, '')}%`;
  if (key === 'voltage') return `${value}V`;
  if (key === 'package') return value;
  if (key === 'tempco') return value;
  if (key === 'category') return value.charAt(0).toUpperCase() + value.slice(1);
  if (key === 'color') return value.charAt(0).toUpperCase() + value.slice(1);
  if (key === 'mpn') return value;
  return String(value);
}

export function formatValue(v, unit) {
  if (v == null || unit == null) return '';
  if (v === 0) return `0${unit}`;
  const prefixes = [
    [1e9, 'G'], [1e6, 'M'], [1e3, 'k'], [1, ''],
    [1e-3, 'm'], [1e-6, 'µ'], [1e-9, 'n'], [1e-12, 'p'],
  ];
  for (const [mult, pfx] of prefixes) {
    if (v >= mult) {
      const val = v / mult;
      const str = val >= 100
        ? val.toFixed(0)
        : val >= 10
          ? val.toFixed(1).replace(/\.0$/, '')
          : val.toFixed(2).replace(/\.?0+$/, '');
      return `${str}${pfx}${unit}`;
    }
  }
  return `${v}${unit}`;
}
