import { afterEach, expect, rs, test } from '@rstest/core';
import {
  forgetSession,
  readRememberedSession,
  rememberSession,
} from '../../src/features/session/rememberedSession';

const id = 'ABCDEFGH2345';
afterEach(() => {
  rs.restoreAllMocks();
  localStorage.clear();
});

test('remembers only a valid session ID across reads', () => {
  rememberSession(id);
  expect(readRememberedSession()).toBe(id);
  expect(localStorage.getItem('pp.presenter.v1')).toBe(id);
  rememberSession('invalid');
  expect(readRememberedSession()).toBe(id);
});

test('ignores malformed saved data', () => {
  localStorage.setItem('pp.presenter.v1', '../bad');
  expect(readRememberedSession()).toBeNull();
});

test('clearing an old session does not erase a newer one', () => {
  rememberSession(id);
  forgetSession('ZZZZZZZZ2345');
  expect(readRememberedSession()).toBe(id);
  forgetSession(id);
  expect(readRememberedSession()).toBeNull();
});

test('unavailable storage never prevents using the remote', () => {
  rs.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
    throw new Error('Blocked');
  });
  rs.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
    throw new Error('Blocked');
  });
  expect(readRememberedSession()).toBeNull();
  expect(() => rememberSession(id)).not.toThrow();
  expect(() => forgetSession(id)).not.toThrow();
});
