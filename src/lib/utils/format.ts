import type { Currency } from '../types';
import { CURRENCIES } from './constants';

export function getCurrencySymbol(currency: Currency): string {
  return CURRENCIES.find(c => c.value === currency)?.symbol || '$';
}

export function formatCurrency(value: number, currency: Currency = 'USD', decimals: number = 0): string {
  const symbol = getCurrencySymbol(currency);
  
  // Format with commas and optional decimals
  const formattedValue = new Intl.NumberFormat('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  }).format(value);
  
  // Position symbol based on standard conventions (left for $, right/left for others depending on preferences, keeping simple left for all in this dashboard context)
  return `${symbol}${formattedValue}`;
}

export function formatNumber(value: number, decimals: number = 0): string {
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  }).format(value);
}

export function formatPercent(value: number, decimals: number = 1): string {
  // Assuming value is a decimal (e.g. 0.125 for 12.5%)
  const percentage = value * 100;
  const formatted = new Intl.NumberFormat('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  }).format(percentage);
  
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
