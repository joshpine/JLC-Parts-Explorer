// Tier metadata shared across UI and data pipeline.

export const TIER_ORDER = ['basic', 'tier1', 'tier3'];

export const TIER_META = {
  basic: {
    name: 'JLC Basic',
    short: 'Basic',
    blurb: 'Basic library parts from JLCPCB',
    badge: 'BASIC',
    accent: 'var(--accent-basic)',
  },
  tier1: {
    name: 'Extended · Global',
    short: 'Extended · Global',
    blurb: 'Extended parts from larger global manufacturers',
    badge: 'GLOBAL',
    accent: 'var(--accent-tier1)',
  },
  tier3: {
    name: 'Economy Extended',
    short: 'Extended · Economy',
    blurb: 'Extended parts from other manufacturers',
    badge: 'ECONOMY',
    accent: 'var(--accent-tier3)',
  },
};

export function tierRank(tier) {
  const idx = TIER_ORDER.indexOf(tier);
  return idx < 0 ? 99 : idx;
}
