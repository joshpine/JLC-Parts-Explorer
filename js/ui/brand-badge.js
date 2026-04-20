import { escape } from '../format.js';

/** Compact tier badge. */
export function tierBadge(tier) {
  const map = {
    basic: { label: 'BASIC', cls: 'badge--basic' },
    tier1: { label: 'GLOBAL', cls: 'badge--tier1' },
    tier3: { label: 'ECONOMY', cls: 'badge--tier3' },
  };
  const m = map[tier] || map.tier3;
  return `<span class="badge ${m.cls}">${m.label}</span>`;
}

/** Extra contextual badges given a part + brand-directory entry. */
export function contextBadges(part, brandInfo) {
  const out = [];
  if (part.tier === 'tier1' && brandInfo?.tier === 'global') {
    out.push(`<span class="badge badge--tier1" title="Tier-1 global manufacturer">GLOBAL STANDARD</span>`);
  }
  if (part.tier === 'tier3' && brandInfo?.popularity >= 85) {
    out.push(`<span class="badge badge--tier3" title="High community usage volume">HIGH POPULARITY</span>`);
  }
  if (/automotive|AEC-Q/i.test(part.desc || '')) {
    out.push(`<span class="badge" style="color:var(--accent-focus)">AUTOMOTIVE</span>`);
  }
  return out.join(' ');
}

/** Inline brand+country label. */
export function brandInline(part, brandInfo) {
  const name = brandInfo?.display || part.mfr;
  const country = brandInfo?.country ? ` · ${brandInfo.country}` : '';
  return `<span class="cell-brand">${escape(name)}</span><span class="muted" style="font-size:11px">${escape(country)}</span>`;
}
