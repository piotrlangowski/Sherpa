import { describe, it, expect } from 'vitest';
import { formatCurrency, formatNumber, formatPercent, formatTokens, formatMonths, modelingTypeLabel, modelingTypeShortCode } from './format';

describe('format utilities with space grouping', () => {
  const GROUP = '\u202F'; // narrow no-break space

  describe('formatNumber', () => {
    it('should format numbers with space grouping and correct decimal places', () => {
      expect(formatNumber(1234)).toBe(`1${GROUP}234`);
      expect(formatNumber(1234567.89, 2)).toBe(`1${GROUP}234${GROUP}567.89`);
      expect(formatNumber(0)).toBe('0');
      expect(formatNumber(0.5, 1)).toBe('0.5');
      expect(formatNumber(-1234)).toBe(`-1${GROUP}234`);
    });
  });

  describe('formatCurrency', () => {
    it('should format currencies with correct symbol positioning and space grouping', () => {
      expect(formatCurrency(1234, 'USD', 0)).toBe(`$1${GROUP}234`);
      expect(formatCurrency(1234.56, 'USD', 2)).toBe(`$1${GROUP}234.56`);
      expect(formatCurrency(1000000, 'EUR', 0)).toBe(`€1${GROUP}000${GROUP}000`);
      expect(formatCurrency(500, 'PLN', 0)).toBe(`500 zł`);
    });

    it('should force a leading sign only when forceSign is true', () => {
      expect(formatCurrency(1234, 'EUR', 0, true)).toBe(`€+1${GROUP}234`);
      expect(formatCurrency(-1234, 'EUR', 0, true)).toBe(`€-1${GROUP}234`);
      expect(formatCurrency(0, 'EUR', 0, true)).toBe(`€0`);
      expect(formatCurrency(1234, 'EUR', 0)).toBe(`€1${GROUP}234`);
    });
  });

  describe('formatPercent', () => {
    it('should format percentage values with correct scaling and space grouping', () => {
      expect(formatPercent(0.1234, 1)).toBe(`12.3%`);
      expect(formatPercent(12.3456, 2)).toBe(`1${GROUP}234.56%`);
    });
  });

  describe('formatTokens', () => {
    it('should format tokens with K/M abbreviations or exact grouping', () => {
      expect(formatTokens(500)).toBe('500');
      expect(formatTokens(1500)).toBe(`1.5K`);
      expect(formatTokens(2500000)).toBe(`2.5M`);
    });
  });

  describe('formatMonths', () => {
    it('should format months with appropriate yr/mos units', () => {
      expect(formatMonths(null)).toBe('∞');
      expect(formatMonths(0.5)).toBe('15 days');
      expect(formatMonths(12)).toBe('1 yr');
      expect(formatMonths(18)).toBe(`1 yr 6.0 mos`);
    });
  });

  describe('modelingTypeLabel / modelingTypeShortCode', () => {
    it('never returns an empty string for a known carrier, including composite (ADR 0014)', () => {
      expect(modelingTypeLabel('incremental', 'cohort')).not.toBe('');
      expect(modelingTypeLabel('gtm', 'plan')).not.toBe('');
      expect(modelingTypeLabel('appraisal', 'feature')).not.toBe('');
      expect(modelingTypeLabel('appraisal', 'pool')).not.toBe('');
      expect(modelingTypeLabel('composite', 'composite')).not.toBe('');
      expect(modelingTypeShortCode('composite', 'composite')).toBe('CMP');
    });
  });
});
