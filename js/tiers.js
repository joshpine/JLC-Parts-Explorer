// Tier metadata shared across UI and data pipeline.

export const TIER_ORDER = ['basic', 'tier1', 'tier3'];

export const TIER_META = {
  basic: {
    name: 'JLC Basic',
    short: 'Basic',
    blurb: 'Pre-loaded feeders · zero feeder fee · always in stock',
    badge: 'BASIC',
    accent: 'var(--accent-basic)',
  },
  tier1: {
    name: 'Reputable Extended',
    short: 'Extended · Global',
    blurb: 'Tier-1 global brands · $3 feeder fee per unique part',
    badge: 'GLOBAL',
    accent: 'var(--accent-tier1)',
  },
  tier3: {
    name: 'Economy Extended',
    short: 'Extended · Economy',
    blurb: 'Domestic brands · lowest prices · check popularity before trusting',
    badge: 'ECONOMY',
    accent: 'var(--accent-tier3)',
  },
};

export function tierRank(tier) {
  const idx = TIER_ORDER.indexOf(tier);
  return idx < 0 ? 99 : idx;
}
