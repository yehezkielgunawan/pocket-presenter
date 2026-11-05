import { afterEach, expect, rs, test } from '@rstest/core';
import {
  readSlideSizingPreference,
  saveSlideSizingPreference,
} from '../../src/features/host/slideSizingPreference';

afterEach(() => {
  rs.restoreAllMocks();
  localStorage.clear();
});

test('defaults to fit and ignores invalid preferences', () => {
  expect(readSlideSizingPreference()).toBe('fit');
  localStorage.setItem('pp.slide-sizing.v1', 'cover');
  expect(readSlideSizingPreference()).toBe('fit');
});

test('remembers each supported mode', () => {
  for (const mode of ['fit', 'fill', 'stretch'] as const) {
    saveSlideSizingPreference(mode);
    expect(localStorage.getItem('pp.slide-sizing.v1')).toBe(mode);
    expect(readSlideSizingPreference()).toBe(mode);
  }
});

test('continues working when browser storage is unavailable', () => {
  rs.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
    throw new Error('Blocked');
  });
  rs.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
    throw new Error('Blocked');
  });
  expect(readSlideSizingPreference()).toBe('fit');
  expect(() => saveSlideSizingPreference('fill')).not.toThrow();
});
