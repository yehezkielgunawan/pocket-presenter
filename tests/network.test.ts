import { expect, test } from '@rstest/core';
import { selectLanAddress } from '../scripts/network.mjs';
import { pairingOrigin } from '../shared/network';

test('prefers a physical LAN adapter over loopback and VPN interfaces', () => {
  expect(
    selectLanAddress({
      lo0: [{ address: '127.0.0.1', family: 'IPv4', internal: true }],
      utun0: [{ address: '10.9.0.1', family: 'IPv4', internal: false }],
      en0: [{ address: '192.168.18.130', family: 'IPv4', internal: false }],
    }),
  ).toBe('192.168.18.130');
});

test('honors an explicitly selected interface address', () => {
  expect(selectLanAddress({}, '192.168.20.5')).toBe('192.168.20.5');
  expect(() => selectLanAddress({}, 'example.com/path')).toThrow();
});

test('substitutes the LAN host only for a loopback origin, preserving its port', () => {
  expect(
    pairingOrigin('http://localhost:8787/api/network', '192.168.18.130'),
  ).toBe('http://192.168.18.130:8787');
  expect(
    pairingOrigin('http://127.0.0.1:3000/api/network', '192.168.18.130'),
  ).toBe('http://192.168.18.130:3000');
  expect(
    pairingOrigin('https://presenter.example/api/network', '192.168.18.130'),
  ).toBe('https://presenter.example');
  expect(pairingOrigin('http://localhost:8787/api/network', '')).toBe(
    'http://localhost:8787',
  );
});
