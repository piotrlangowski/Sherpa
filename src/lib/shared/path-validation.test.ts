import { describe, it, expect } from 'vitest';

describe('open_dashboard path parameter validation', () => {
  const safePathPattern = /^(?!.*\/{2})\/[a-zA-Z0-9\-_/]*$/;

  it('should accept valid relative paths', () => {
    expect(safePathPattern.test('/')).toBe(true);
    expect(safePathPattern.test('/scenarios')).toBe(true);
    expect(safePathPattern.test('/scenarios/123')).toBe(true);
    expect(safePathPattern.test('/scenarios/123-abc_def')).toBe(true);
    expect(safePathPattern.test('/scenarios/123/edit')).toBe(true);
  });

  it('should reject paths with metacharacters used in shell command injection', () => {
    expect(safePathPattern.test('/scenarios/123&calc.exe')).toBe(false);
    expect(safePathPattern.test('/scenarios/123|calc.exe')).toBe(false);
    expect(safePathPattern.test('/scenarios/123;calc.exe')).toBe(false);
    expect(safePathPattern.test('/scenarios/123>out.txt')).toBe(false);
    expect(safePathPattern.test('/scenarios/123<in.txt')).toBe(false);
    expect(safePathPattern.test('/scenarios/123$VAR')).toBe(false);
    expect(safePathPattern.test('/scenarios/123`cmd`')).toBe(false);
  });

  it('should reject paths with spaces, quotes, or backslashes', () => {
    expect(safePathPattern.test('/scenarios/123 ')).toBe(false);
    expect(safePathPattern.test('/scenarios/123\\abc')).toBe(false);
    expect(safePathPattern.test('/scenarios/123"')).toBe(false);
    expect(safePathPattern.test("/scenarios/123'")).toBe(false);
  });

  it('should reject protocol-relative or absolute URLs', () => {
    expect(safePathPattern.test('//scenarios')).toBe(false);
    expect(safePathPattern.test('http://127.0.0.1')).toBe(false);
    expect(safePathPattern.test('https://google.com')).toBe(false);
    expect(safePathPattern.test('javascript:alert(1)')).toBe(false);
  });
});
