import { expect, type Page, test } from '@playwright/test';

async function createSession(page: Page, approve = true) {
  const baseURL = test.info().project.use.baseURL;
  if (!baseURL) throw new Error('Recovery tests require a base URL');
  const headers = { Origin: new URL(baseURL).origin };
  const created = await page.request.post('/api/sessions', {
    headers,
    data: { fingerprint: 'a'.repeat(64), slideCount: 3, initialIndex: 1 },
  });
  expect(created.status()).toBe(201);
  const { sessionId } = (await created.json()) as { sessionId: string };
  if (approve) {
    const pair = await page.request.post(
      `/api/sessions/${sessionId}/pairings`,
      {
        headers,
        data: { label: 'Recovery test phone' },
      },
    );
    const { requestId } = (await pair.json()) as { requestId: string };
    const approval = await page.request.post(
      `/api/sessions/${sessionId}/pairings/${requestId}/approve`,
      { headers, data: {} },
    );
    expect(approval.status()).toBe(200);
    const claim = await page.request.post(
      `/api/sessions/${sessionId}/pairings/${requestId}/claim`,
      { headers, data: {} },
    );
    expect(claim.status()).toBe(200);
  }
  return sessionId;
}

test('an explicit different code takes priority, and manual entry reuses approval', async ({
  page,
}) => {
  const first = await createSession(page);
  const second = await createSession(page, false);
  await page.goto(`/remote/${first}`);
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem('pp.presenter.v1')))
    .toBe(first);
  await page.goto(`/join?code=${second}`);
  await expect(page.getByLabel('Session code')).toHaveValue(second);
  await expect(page).toHaveURL(`/join?code=${second}`);
  let pairingRequests = 0;
  page.on('request', (request) => {
    if (request.method() === 'POST' && request.url().endsWith('/pairings'))
      pairingRequests++;
  });
  await page.getByLabel('Session code').fill(first);
  await page.getByRole('button', { name: 'Connect to presentation' }).click();
  await expect(page).toHaveURL(`/remote/${first}`);
  expect(pairingRequests).toBe(0);
});

test('temporary recovery errors retain access and support keyboard retry on mobile', async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 640 });
  const id = await createSession(page);
  await page.goto(`/remote/${id}`);
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem('pp.presenter.v1')))
    .toBe(id);
  let unavailable = true;
  await page.route(`**/api/sessions/${id}/status?role=presenter`, (route) =>
    unavailable ? route.fulfill({ status: 503, body: '{}' }) : route.continue(),
  );
  await page.goto('/');
  const retry = page.getByRole('button', { name: 'Retry connection' });
  await expect(retry).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  expect(
    await page.evaluate(() => localStorage.getItem('pp.presenter.v1')),
  ).toBe(id);
  await retry.focus();
  await expect(retry).toBeFocused();
  const contrast = await retry.evaluate((button) => {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 1;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Missing canvas context');
    const luminance = (color: string) => {
      ctx.fillStyle = color;
      ctx.fillRect(0, 0, 1, 1);
      const pixels = ctx.getImageData(0, 0, 1, 1).data;
      const channels = [pixels[0], pixels[1], pixels[2]].map((value) => {
        const channel = value / 255;
        return channel <= 0.04045
          ? channel / 12.92
          : ((channel + 0.055) / 1.055) ** 2.4;
      });
      return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
    };
    const ratio = (foreground: string, background: string) => {
      const a = luminance(foreground);
      const b = luminance(background);
      return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
    };
    const style = getComputedStyle(button);
    const status = document.querySelector('[role="status"]');
    if (!status) throw new Error('Missing recovery status');
    return {
      button: ratio(style.color, style.backgroundColor),
      status: ratio(
        getComputedStyle(status).color,
        getComputedStyle(document.documentElement).backgroundColor,
      ),
      outline: style.outlineStyle,
    };
  });
  expect(contrast.button).toBeGreaterThanOrEqual(4.5);
  expect(contrast.status).toBeGreaterThanOrEqual(4.5);
  expect(contrast.outline).not.toBe('none');
  console.info('Session recovery contrast audit:', contrast);
  expect(
    await retry.evaluate((button) => button.getBoundingClientRect().height),
  ).toBeGreaterThanOrEqual(44);
  unavailable = false;
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(`/remote/${id}`);
});

test('lost approval is cleared rather than causing an automatic-return loop', async ({
  page,
  context,
}) => {
  const id = await createSession(page);
  await page.goto(`/remote/${id}`);
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem('pp.presenter.v1')))
    .toBe(id);
  await context.clearCookies();
  await page.goto('/');
  await expect(page.getByLabel('Session code')).toHaveValue(id);
  expect(
    await page.evaluate(() => localStorage.getItem('pp.presenter.v1')),
  ).toBeNull();
});
