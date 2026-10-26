import { expect, rs, test } from '@rstest/core';
import { render, screen, waitFor } from '@testing-library/react';
import { PairingPanel } from '../../src/features/host/PairingPanel';

test('uses the exposed LAN address in the pairing link when opened on localhost', async () => {
  const fetch = rs
    .spyOn(globalThis, 'fetch')
    .mockResolvedValue(Response.json({ origin: 'http://192.168.18.130:8787' }));
  try {
    render(
      <PairingPanel
        sessionId="AAAAAAAAAAAA"
        requests={[]}
        decide={async () => {}}
      />,
    );
    await waitFor(() =>
      expect(
        screen.getByRole('link', { name: /open pairing link/i }),
      ).toHaveAttribute(
        'href',
        'http://192.168.18.130:8787/join?code=AAAAAAAAAAAA',
      ),
    );
  } finally {
    fetch.mockRestore();
  }
});
