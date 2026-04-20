// Shared formatters for display values.

export function formatStock(n) {
  if (!n) return '0';
  if (n >= 1e6) return `${(n / 1e6).toFixed(1).replace(/\.0$/, '')}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(n >= 1e4 ? 0 : 1).replace(/\.0$/, '')}k`;
  return n.toLocaleString('en-US');
}

export function formatPrice(p) {
  if (!p) return '—';
  if (p < 0.01) return `$${p.toFixed(4)}`;
  if (p < 1)    return `$${p.toFixed(3)}`;
  return `$${p.toFixed(2)}`;
}

export function formatTolerance(t) {
  if (t == null) return '';
  const pct = t * 100;
  if (pct < 1) return `±${pct.toFixed(1).replace(/\.0$/, '')}%`;
  return `±${pct.toFixed(0)}%`;
}

export function stockDotClass(n) {
  if (!n) return 'stock-dot stock-dot--zero';
  if (n < 10000) return 'stock-dot stock-dot--low';
  return 'stock-dot';
}

export function escape(str) {
  return String(str ?? '').replace(/[&<>"']/g, ch => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[ch]));
}
