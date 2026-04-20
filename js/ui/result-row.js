// Renders a single result table row, category-aware for spec columns.

import { formatValue } from '../parser.js';
import { formatStock, formatPrice, formatTolerance, stockDotClass, escape } from '../format.js';
import { tierBadge, brandInline } from './brand-badge.js';
import { packageIcon } from './package-icon.js';

const UNIT_BY_CATEGORY = { capacitors: 'F', resistors: 'Ω', inductors: 'H', crystals: 'Hz' };

/** Inline spec summary for a single part within a given category. */
export function specSummary(part, category) {
  const parts = [];
  const unit = UNIT_BY_CATEGORY[category];
  if (unit && part.value != null) parts.push(formatValue(part.value, unit));
  if (part.tolerance != null) parts.push(formatTolerance(part.tolerance));
  if (part.voltage != null) parts.push(`${part.voltage}V`);
  if (part.tempco) parts.push(part.tempco);
  if (part.channel) parts.push(`${part.channel}-Ch`);
  if (part.vds) parts.push(`${part.vds}V`);
  if (part.id) parts.push(`${part.id}A`);
  if (part.rds_on) parts.push(`${(part.rds_on * 1000).toFixed(0)}mΩ`);
  if (part.color) parts.push(part.color);
  if (part.load_cap != null) parts.push(`${part.load_cap}pF CL`);
  if (part.stability) parts.push(part.stability);
  if (part.function) parts.push(part.function);
  if (part.channel == null && part.type) parts.push(part.type);
  if (part.package) parts.push(part.package);
  return parts.filter(Boolean).join(' · ');
}

export function resultRow(part, category, brands) {
  const brandInfo = brands?.[part.mfr];
  return `
    <tr data-lcsc="${escape(part.lcsc)}">
      <td class="cell-pkg">${packageIcon(part.package, category)}</td>
      <td>${brandInline(part, brandInfo)}</td>
      <td><div class="cell-mpn">${escape(part.mpn)}</div><div class="cell-lcsc">${escape(part.lcsc)}</div></td>
      <td class="cell-spec">${escape(specSummary(part, category))}</td>
      <td>${tierBadge(part.tier)}</td>
      <td class="cell-stock"><span class="${stockDotClass(part.stock)}"></span>${formatStock(part.stock)}</td>
      <td class="cell-price">${formatPrice(part.price)}</td>
    </tr>
  `;
}

export function resultTable(parts, category, brands) {
  return `
    <table class="result-table">
      <thead>
        <tr>
          <th style="width:64px"></th>
          <th>Brand</th>
          <th>MPN / LCSC</th>
          <th>Specs</th>
          <th>Tier</th>
          <th style="text-align:right">Stock</th>
          <th style="text-align:right">Price</th>
        </tr>
      </thead>
      <tbody>${parts.map(p => resultRow(p, category, brands)).join('')}</tbody>
    </table>
  `;
}
