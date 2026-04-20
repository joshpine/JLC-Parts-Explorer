// Visual glyphs for common component packages.
// Each SVG uses a 24×24 viewBox and only `currentColor` + opacity so it
// inherits color from the surrounding text (tier accent, brand cell, etc.).
// The caller sets .pkg-icon { color: ... } via CSS.

const PAD = 'style="opacity:0.55"';  // lighter shade used for leads/pads
const BODY = 'style="opacity:1"';

// --- Shape primitives ----------------------------------------------------

function chipSMD() {
  // Two-terminal passive footprint
  return `
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="3" y="9.25" width="5.2" height="5.5" rx="0.8" ${PAD}/>
      <rect x="15.8" y="9.25" width="5.2" height="5.5" rx="0.8" ${PAD}/>
      <rect x="9.4" y="10" width="5.2" height="4" rx="0.8" style="opacity:0.18;fill:currentColor"/>
    </svg>`;
}

function sotDiscrete(pins = 3) {
  // SOT footprints are asymmetric: half the pads on one side, remainder on the other.
  const bottomPads = Math.ceil(pins / 2);
  const topPads = pins - bottomPads;
  const pads = [
    ...horizontalPads(bottomPads, 4, 16.3, 16, 3.5),
    ...horizontalPads(topPads, 6, 4.2, 12, 3.2),
  ];
  return `
    <svg viewBox="0 0 24 24" aria-hidden="true">
      ${pads.join('')}
      <rect x="6" y="7" width="12" height="9" rx="1.4" style="opacity:0.22;fill:currentColor"/>
      <circle cx="8.3" cy="9.1" r="0.9" style="opacity:0.35;fill:var(--bg-0,#070b11)"/>
    </svg>`;
}

function sot223() {
  return `
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="4" y="17" width="4" height="3.2" rx="0.6" ${PAD}/>
      <rect x="10" y="17" width="4" height="3.2" rx="0.6" ${PAD}/>
      <rect x="16" y="17" width="4" height="3.2" rx="0.6" ${PAD}/>
      <rect x="6.3" y="3.8" width="11.4" height="4.2" rx="0.8" ${PAD}/>
      <rect x="6" y="8" width="12" height="7.5" rx="1.4" style="opacity:0.22;fill:currentColor"/>
    </svg>`;
}

function sodDiode() {
  // Rectangular SMD diode with cathode band
  return `
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="2" y="10" width="3" height="4" rx="0.5" ${PAD}/>
      <rect x="19" y="10" width="3" height="4" rx="0.5" ${PAD}/>
      <rect x="5" y="8" width="14" height="8" rx="1" ${BODY}/>
      <rect x="7" y="8" width="1.5" height="8" style="opacity:0.3;fill:var(--bg-0,#070b11)"/>
    </svg>`;
}

function smaDiode() {
  // Large diode brick (SMA/SMB/SMC/DO-214)
  return `
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="1" y="9" width="4" height="6" rx="0.5" ${PAD}/>
      <rect x="19" y="9" width="4" height="6" rx="0.5" ${PAD}/>
      <rect x="5" y="7" width="14" height="10" rx="1.2" ${BODY}/>
      <rect x="7.5" y="7" width="2" height="10" style="opacity:0.3;fill:var(--bg-0,#070b11)"/>
    </svg>`;
}

function soicGullwing(pins = 8) {
  const perSide = Math.max(2, Math.round(pins / 2));
  const leads = [
    ...verticalPads(perSide, 1.5, 4.2, 3.2, 1.2),
    ...verticalPads(perSide, 19.3, 4.2, 3.2, 1.2),
  ];
  return `
    <svg viewBox="0 0 24 24" aria-hidden="true">
      ${leads.join('')}
      <rect x="6" y="4" width="12" height="16" rx="1.2" style="opacity:0.22;fill:currentColor"/>
      <circle cx="7.5" cy="5.8" r="0.9" style="opacity:0.35;fill:var(--bg-0,#070b11)"/>
    </svg>`;
}

function qfpSquare(pins = 32) {
  const perSide = Math.max(4, Math.round(pins / 4));
  const leads = perimeterPads(perSide, {
    leftX: 1.4, rightX: 19.8, topY: 1.4, bottomY: 19.8,
    start: 4.8, span: 14.4, long: 2.8, thick: 0.9, rx: 0.2
  });
  return `
    <svg viewBox="0 0 24 24" aria-hidden="true">
      ${leads.join('')}
      <rect x="5.4" y="5.4" width="13.2" height="13.2" rx="1.2" style="opacity:0.22;fill:currentColor"/>
      <circle cx="6.5" cy="6.5" r="0.8" style="opacity:0.35;fill:var(--bg-0,#070b11)"/>
    </svg>`;
}

function qfnNoLead(pins = 16) {
  const perSide = Math.max(3, Math.round(pins / 4));
  const pads = perimeterPads(perSide, {
    leftX: 2.5, rightX: 20.0, topY: 2.5, bottomY: 20.0,
    start: 4.2, span: 15.6, long: 1.6, thick: 0.7, rx: 0.18
  });
  return `
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="5" y="5" width="14" height="14" rx="2" style="opacity:0.22;fill:currentColor"/>
      <rect x="9" y="9" width="6" height="6" rx="0.8" style="opacity:0.3;fill:currentColor"/>
      ${pads.join('')}
      <circle cx="6" cy="6" r="0.8" style="opacity:0.35;fill:var(--bg-0,#070b11)"/>
    </svg>`;
}

function bgaGrid(pins = 16) {
  const side = Math.max(2, Math.min(8, Math.round(Math.sqrt(pins))));
  const step = side === 1 ? 0 : 12 / (side - 1);
  const balls = [];
  for (let r = 0; r < side; r++) {
    for (let c = 0; c < side; c++) {
      balls.push(`<circle cx="${6 + c * step}" cy="${6 + r * step}" r="0.85" ${PAD}/>`);
    }
  }
  return `
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="3" y="3" width="18" height="18" rx="1.5" style="opacity:0.22;fill:currentColor"/>
      ${balls.join('')}
    </svg>`;
}

function dipThruHole(pins = 8) {
  const perSide = Math.max(2, Math.round(pins / 2));
  const legs = [
    ...horizontalPads(perSide, 4.4, 0.8, 1.2, 3.2),
    ...horizontalPads(perSide, 4.4, 20.0, 1.2, 3.2),
  ];
  return `
    <svg viewBox="0 0 24 24" aria-hidden="true">
      ${legs.join('')}
      <rect x="4" y="5" width="16" height="14" rx="1" style="opacity:0.22;fill:currentColor"/>
      <path d="M 10 4 A 2 2 0 0 0 14 4" style="opacity:0.35;fill:var(--bg-0,#070b11)"/>
    </svg>`;
}

function toTab() {
  // TO-220 / DPAK with heat-sink tab
  return `
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="4" y="3" width="16" height="13" rx="1" ${BODY}/>
      <circle cx="12" cy="7" r="1.2" style="opacity:0.35;fill:var(--bg-0,#070b11)"/>
      <rect x="7" y="16" width="2" height="6" ${PAD}/>
      <rect x="11" y="16" width="2" height="6" ${PAD}/>
      <rect x="15" y="16" width="2" height="6" ${PAD}/>
    </svg>`;
}

function pinHeader() {
  // Row of pins
  const pins = [];
  for (let i = 0; i < 5; i++) {
    pins.push(`<circle cx="${4 + i * 4}" cy="12" r="1.6" ${BODY}/>`);
    pins.push(`<circle cx="${4 + i * 4}" cy="12" r="0.6" style="opacity:0.35;fill:var(--bg-0,#070b11)"/>`);
  }
  return `
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="2" y="9" width="20" height="6" rx="0.5" ${PAD}/>
      ${pins.join('')}
    </svg>`;
}

function usbConnector() {
  return `
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="3" y="7" width="18" height="10" rx="1.2" ${BODY}/>
      <rect x="6" y="10" width="4" height="1.6" ${PAD}/>
      <rect x="6" y="12.4" width="4" height="1.6" ${PAD}/>
      <rect x="14" y="10" width="4" height="1.6" ${PAD}/>
      <rect x="14" y="12.4" width="4" height="1.6" ${PAD}/>
      <rect x="1" y="10" width="2" height="4" ${PAD}/>
      <rect x="21" y="10" width="2" height="4" ${PAD}/>
    </svg>`;
}

function ffcConnector() {
  // Flex ribbon connector — striped
  const stripes = [];
  for (let i = 0; i < 7; i++)
    stripes.push(`<rect x="${4 + i * 2.2}" y="8" width="1" height="8" ${PAD}/>`);
  return `
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="2" y="6" width="20" height="12" rx="1.2" ${BODY}/>
      ${stripes.join('')}
    </svg>`;
}

function crystalCan() {
  // Rounded rectangle crystal package (SMD3225, SMD5032, HC-49)
  return `
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="3" y="6" width="18" height="12" rx="6" ${BODY}/>
      <rect x="5" y="16" width="3" height="4" rx="0.4" ${PAD}/>
      <rect x="16" y="16" width="3" height="4" rx="0.4" ${PAD}/>
      <path d="M 8 12 L 10 9 L 14 15 L 16 12" fill="none" stroke="var(--bg-0,#070b11)" stroke-width="0.8" style="opacity:0.45"/>
    </svg>`;
}

function electrolytic() {
  // Top-down view of an aluminum electrolytic — circle with cross
  return `
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="9" ${BODY}/>
      <path d="M 12 5 L 12 19 M 5 12 L 19 12" stroke="var(--bg-0,#070b11)" stroke-width="1.4" style="opacity:0.4"/>
      <path d="M 15 7 L 19 7 M 17 5 L 17 9" stroke="var(--bg-0,#070b11)" stroke-width="0.8" style="opacity:0.6"/>
    </svg>`;
}

function tantalum() {
  // Molded tantalum brick with polarity stripe
  return `
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="2" y="8" width="20" height="8" rx="1.2" ${BODY}/>
      <rect x="2" y="8" width="4" height="8" style="opacity:0.35;fill:var(--bg-0,#070b11)"/>
      <rect x="1" y="10" width="2" height="4" rx="0.3" ${PAD}/>
      <rect x="21" y="10" width="2" height="4" rx="0.3" ${PAD}/>
    </svg>`;
}

function ledChip() {
  // Rectangular chip LED with emissive dome
  return `
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="3" y="10" width="4" height="4" rx="0.5" ${PAD}/>
      <rect x="17" y="10" width="4" height="4" rx="0.5" ${PAD}/>
      <rect x="7" y="7" width="10" height="10" rx="1" ${BODY}/>
      <circle cx="12" cy="12" r="2.5" style="opacity:0.35;fill:var(--bg-0,#070b11)"/>
    </svg>`;
}

function genericIc() {
  return `
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="4" y="4" width="16" height="16" rx="2" ${BODY}/>
      <text x="12" y="15" font-size="7" text-anchor="middle"
        fill="var(--bg-0,#070b11)" style="opacity:0.55;font-family:ui-monospace,monospace;font-weight:600">IC</text>
    </svg>`;
}

function horizontalPads(count, startX, y, span, width, height = 2.8, rx = 0.35) {
  if (!count) return [];
  if (count === 1) return [`<rect x="${startX}" y="${y}" width="${width}" height="${height}" rx="${rx}" ${PAD}/>`];
  const step = span / (count - 1);
  return Array.from({ length: count }, (_, i) =>
    `<rect x="${startX + i * step}" y="${y}" width="${width}" height="${height}" rx="${rx}" ${PAD}/>`
  );
}

function verticalPads(count, x, startY, span, width = 2.8, height = 1.1, rx = 0.25) {
  if (!count) return [];
  if (count === 1) return [`<rect x="${x}" y="${startY}" width="${width}" height="${height}" rx="${rx}" ${PAD}/>`];
  const step = span / (count - 1);
  return Array.from({ length: count }, (_, i) =>
    `<rect x="${x}" y="${startY + i * step}" width="${width}" height="${height}" rx="${rx}" ${PAD}/>`
  );
}

function perimeterPads(count, dims) {
  return [
    ...verticalPads(count, dims.leftX, dims.start, dims.span, dims.long, dims.thick, dims.rx),
    ...verticalPads(count, dims.rightX, dims.start, dims.span, dims.long, dims.thick, dims.rx),
    ...horizontalPads(count, dims.start, dims.topY, dims.span, dims.thick, dims.long, dims.rx),
    ...horizontalPads(count, dims.start, dims.bottomY, dims.span, dims.thick, dims.long, dims.rx),
  ];
}

function packagePins(pkg) {
  const p = (pkg || '').toUpperCase().trim();
  if (!p) return null;

  if (/^SOT-?23$/.test(p)) return 3;
  if (/^SOT-?223$/.test(p)) return 4;
  if (/^SOT-?89$/.test(p)) return 3;
  if (/^SOT-?323$/.test(p)) return 3;
  if (/^SOT-?363$/.test(p)) return 6;
  if (/^SOT-?523$/.test(p)) return 3;
  if (/^SOT-?723$/.test(p)) return 3;
  if (/^SC-?70$/.test(p)) return 3;

  const match = p.match(/-(\d+)$/);
  return match ? Number(match[1]) : null;
}

// --- Package → icon resolver --------------------------------------------

export function packageIcon(pkg, category, opts = {}) {
  const p = (pkg || '').toUpperCase().trim();
  const render = svg => wrap(svg, p, opts);
  const pins = packagePins(p);

  // 2-terminal passive: any 4-digit imperial or metric chip code
  if (/^0[124]0[12]$|^(0603|0805|1206|1210|1812|2010|2512)$/.test(p)) {
    if (category === 'leds') return render(ledChip());
    return render(chipSMD());
  }

  // Tantalum prefix like "A","B","C","D" with tantalum category hint
  if (category === 'capacitors' && /TANT|^[ABCDEVXY]$/.test(p)) return render(tantalum());

  // Aluminum electrolytic SMD canisters: ∅ × H patterns like 6.3x5.4 / "CASE-A"
  if (category === 'capacitors' && /^(\d+(\.\d+)?X\d+(\.\d+)?|CASE-?[A-Z])/.test(p)) {
    return render(electrolytic());
  }

  // Crystals
  if (category === 'crystals' || /^HC-?49|^SMD\d{3,4}|^(3225|5032|2016|7050|1612)(-\d)?$/.test(p)) {
    return render(crystalCan());
  }

  // Diode SMDs
  if (/^SOD-?\d+$|^DO-?214/.test(p)) return render(sodDiode());
  if (/^SM[ABC]$/.test(p)) return render(smaDiode());

  // SOT transistor/discrete family
  if (/^SOT-?223/.test(p)) return render(sot223());
  if (/^SOT-?23-?6/.test(p)) return render(sotDiscrete(6));
  if (/^SOT-?23-?5/.test(p)) return render(sotDiscrete(5));
  if (/^SOT-?(23|323|363|523|89|416|723)/.test(p) || /^SC-?70/.test(p)) return render(sotDiscrete(pins || 3));

  // Power-tab packages
  if (/^TO-?(220|252|220[AFI]?B?|247|263)|^DPAK|^D2PAK|^IPAK|^TO-?92/.test(p)) return render(toTab());

  // IC packages — gull-wing two-row
  if (/^(SOIC|SOP|TSSOP|MSOP|SSOP|MSOIC|TSOP|uMAX|HTSSOP)-?\d+/.test(p)) return render(soicGullwing(pins || 8));

  // Four-side QFP
  if (/^(LQFP|TQFP|QFP|PQFP|HQFP|CQFP|VQFP|MQFP|LFQP)-?\d+/.test(p)) return render(qfpSquare(pins || 32));

  // No-lead QFN/DFN
  if (/^(QFN|DFN|HVQFN|VQFN|LGA|MLF|TDFN|UDFN|UQFN|WQFN|UFQFPN)-?\d+/.test(p)) return render(qfnNoLead(pins || 16));

  // Ball-grid
  if (/^(BGA|FBGA|TFBGA|UFBGA|VFBGA|WLCSP|CSP|XFBGA)-?\d+/.test(p)) return render(bgaGrid(pins || 16));

  // Thru-hole DIP
  if (/^(DIP|PDIP|CDIP|SDIP)-?\d+/.test(p)) return render(dipThruHole(pins || 8));

  // Connector heuristics (category-aware)
  if (category === 'connectors') {
    if (/USB|TYPE-?[ACB]|MICRO|MINI/i.test(p)) return render(usbConnector());
    if (/FFC|FPC|FLEX/i.test(p)) return render(ffcConnector());
    return render(pinHeader());
  }

  // Last resort
  return render(genericIc());
}

function wrap(svg, label, opts = {}) {
  const classes = ['pkg-mark'];
  if (opts.large) classes.push('pkg-mark--lg');
  const title = escapeAttr(label || '');
  const text = packageLabel(label);

  return `
    <span class="${classes.join(' ')}" title="${title}" aria-label="${title ? `Package ${title}` : 'Package'}">
      <span class="pkg-icon${opts.large ? ' pkg-icon--lg' : ''}">${svg}</span>
      ${text ? `<span class="pkg-mark__label">${escapeHtml(text)}</span>` : ''}
    </span>
  `;
}

function packageLabel(label) {
  const text = (label || '').trim();
  if (!text) return '';
  return text.length > 10 ? `${text.slice(0, 9)}…` : text;
}

function escapeAttr(value) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function escapeHtml(value) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
