import type { Currency, ModelingType, RevenueCarrier } from '../types';
import { CURRENCIES } from './constants';
import { resolveCarrier } from '../shared/financial-math';

export function getCurrencySymbol(currency: Currency): string {
  return CURRENCIES.find(c => c.value === currency)?.symbol || '$';
}

const GROUP = '\u202F'; // narrow no-break space (display only)

function formatGrouped(value: number, decimals: number, forceSign: boolean = false): string {
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
    signDisplay: forceSign ? 'exceptZero' : 'auto'
  })
    .formatToParts(value)
    .map((p) => (p.type === 'group' ? GROUP : p.value))
    .join('');
}

// `forceSign` prepends "+" to positive values (e.g. attribution-band bounds where the sign
// itself is the signal), via Intl's `signDisplay` rather than manual string handling.
export function formatCurrency(value: number, currency: Currency, decimals: number = 0, forceSign: boolean = false): string {
  const currencyInfo = CURRENCIES.find(c => c.value === currency);
  const symbol = currencyInfo?.symbol || '$';
  const position = currencyInfo?.position || 'prefix';

  const formattedValue = formatGrouped(value, decimals, forceSign);

  return position === 'prefix' ? `${symbol}${formattedValue}` : `${formattedValue} ${symbol}`;
}

export function formatNumber(value: number, decimals: number = 0): string {
  return formatGrouped(value, decimals);
}

export function formatPercent(value: number, decimals: number = 1): string {
  // Assuming value is a decimal (e.g. 0.125 for 12.5%)
  const percentage = value * 100;
  const formatted = formatGrouped(percentage, decimals);
  
  return `${formatted}%`;
}

export function formatTokens(value: number): string {
  if (value >= 1_000_000) {
    return `${formatNumber(value / 1_000_000, 1)}M`;
  }
  if (value >= 1_000) {
    return `${formatNumber(value / 1_000, 1)}K`;
  }
  return formatNumber(value);
}

export function formatMonths(value: number | null): string {
  if (value === null || !isFinite(value)) {
    return '∞';
  }
  
  if (value < 1) {
    return `${formatNumber(value * 30, 0)} days`;
  }
  
  const years = Math.floor(value / 12);
  const months = value % 12;
  
  if (years > 0) {
    const yearsStr = years === 1 ? '1 yr' : `${years} yrs`;
    const monthsStr = months > 0 ? ` ${formatNumber(months, 1)} mos` : '';
    return `${yearsStr}${monthsStr}`;
  }
  
  return `${formatNumber(value, 1)} mos`;
}

export function formatIrr(irr: any): string {
  if (!irr) return 'n/d';
  
  const status = irr.status || irr.irr_status;
  const annualNominal = irr.annualNominal !== undefined ? irr.annualNominal : irr.irr_annual_nominal;
  const displayable = irr.displayable !== undefined ? irr.displayable : (status === 'ok');

  if (displayable && annualNominal !== null && annualNominal !== undefined) {
    return formatPercent(annualNominal);
  }

  return 'n/d';
}

export function formatPI(value: number | null | undefined): string {
  if (value === null || value === undefined) return 'N/A';
  return `${value.toFixed(2)}x`;
}

// Labels the RESOLVED revenue carrier (same resolveCarrier the engine and the
// triangulation panel use), not the raw modeling_type. For 'appraisal' scenarios,
// modeling_type alone under-determines the carrier (cohort/feature/pack/pool are
// all valid), so reading modeling_type in isolation can label a scenario "Charge
// for Usage / Add-On" when the money is actually booked by the cohort.
export function modelingTypeLabel(
  type: ModelingType | undefined | null,
  revenueCarrier?: RevenueCarrier | null
): string {
  if (!type && !revenueCarrier) return '';
  const carrier = resolveCarrier(type ?? undefined, revenueCarrier);
  switch (carrier) {
    case 'cohort': return 'Improve Existing Clients';
    case 'plan': return 'Sell New Plan (Seats)';
    case 'feature':
    case 'pack': return 'Charge for Usage / Add-On';
    case 'pool': return 'Unified Credit Pool';
    case 'composite': return 'Composite (All Carriers)';
    default: return '';
  }
}

export function modelingTypeShortCode(
  type: ModelingType | undefined | null,
  revenueCarrier?: RevenueCarrier | null
): string {
  if (!type && !revenueCarrier) return '';
  const carrier = resolveCarrier(type ?? undefined, revenueCarrier);
  switch (carrier) {
    case 'cohort': return 'INC';
    case 'plan': return 'GTM';
    case 'feature':
    case 'pack': return 'USE';
    case 'pool': return 'POOL';
    case 'composite': return 'CMP';
    default: return '';
  }
}

