import { expect, test } from '@playwright/test';
import { makeDeck } from '../fixtures/makeDeck';

function isLanIpv4(hostname: string) {
  const parts = hostname.split('.').map(Number);
  return (
    parts.length === 4 &&
    parts.every((part) => Number.isInteger(part) && part >= 0 && part <= 255) &&
    !hostname.startsWith('127.') &&
    hostname !== '0.0.0.0'
  );
}

test('renders a local deck and synchronizes an approved phone with private notes', async ({
  page,
  browser,
}) => {
  const pageErrors: string[] = [];
  const deckBuffer = Buffer.from(await makeDeck());
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await page.goto('/');
  const networkResponse = await page.request.get('/api/network');
  const network = (await networkResponse.json()) as { origin: string };
  const appOrigin = new URL(page.url()).origin;
  await page.getByLabel('Presentation file').setInputFiles({
    name: 'research.pptx',
    mimeType:
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    buffer: deckBuffer,
  });
  await expect(page.getByLabel('Presentation notes Markdown')).toBeEnabled();
  await expect(
    page.getByRole('button', { name: 'Connect your phone' }),
  ).toBeEnabled();
  await expect(page.getByLabel('Audience presentation')).toContainText(
    'Pocket Presenter',
  );
  await page.getByRole('button', { name: 'Fullscreen' }).click();
  await expect
    .poll(() =>
      page.evaluate(() =>
        document.fullscreenElement?.getAttribute('aria-label'),
      ),
    )
    .toBe('Audience presentation');
  await page.screenshot({
    path: 'test-results/fullscreen.png',
    animations: 'disabled',
  });
  await page.keyboard.press('Escape');
  await expect
    .poll(() => page.evaluate(() => document.fullscreenElement === null))
    .toBe(true);
  await page.getByRole('button', { name: 'Connect your phone' }).click();
  await expect(page.getByTestId('session-code')).toBeVisible();
  const code = (await page.getByTestId('session-code').innerText()).replaceAll(
    ' ',
    '',
  );
  const phoneContext = await browser.newContext({
    viewport: { width: 393, height: 851 },
    isMobile: true,
    hasTouch: true,
  });
  const phone = await phoneContext.newPage();
  const phoneRequests: string[] = [];
  phone.on('request', (request) => phoneRequests.push(request.url()));
  await expect(
    page.getByRole('link', { name: 'Open pairing link' }),
  ).toHaveAttribute('href', `${network.origin}/join?code=${code}`);
  const pairingHost = new URL(network.origin).hostname;
  const pairingOrigin = isLanIpv4(pairingHost) ? network.origin : appOrigin;
  await phone.goto(`${pairingOrigin}/join?code=${code}`);
  if (
    isLanIpv4(new URL(network.origin).hostname) &&
    !(await phone.evaluate(() => window.isSecureContext))
  ) {
    expect(await phone.evaluate(() => typeof crypto.randomUUID)).toBe(
      'undefined',
    );
  }
  await phone.getByRole('button', { name: 'Connect to presentation' }).click();
  await expect(phone.getByText('Waiting for PC approval…')).toBeVisible();
  await page.getByRole('button', { name: 'Approve phone' }).click();
  await expect(phone.getByText('First paragraph.\nSecond line.')).toBeVisible();
  await phone.screenshot({
    path: 'test-results/remote.png',
    fullPage: true,
    animations: 'disabled',
  });
  await phone.getByRole('button', { name: 'Next' }).click();
  await expect(page.getByLabel('Audience presentation')).toContainText(
    'Second slide',
  );
  await expect(
    phone.getByText('No speaker notes for this slide.'),
  ).toBeVisible();
  await expect(phone.getByRole('button', { name: 'Next' })).toBeDisabled();
  await page.locator('body').click({ position: { x: 5, y: 5 } });
  await page.keyboard.press('ArrowLeft');
  await expect(phone.getByText('First paragraph.\nSecond line.')).toBeVisible();
  await phone.reload();
  await expect(phone.getByText('First paragraph.\nSecond line.')).toBeVisible();
  await page.reload();
  await expect(phone.getByRole('button', { name: 'Next' })).toBeDisabled();
  await page.getByLabel('Presentation file').setInputFiles({
    name: 'research.pptx',
    mimeType:
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    buffer: deckBuffer,
  });
  await expect(phone.getByText('First paragraph.\nSecond line.')).toBeVisible();
  await page.getByRole('button', { name: 'End session', exact: true }).click();
  await expect(phone.getByText('Session ended', { exact: true })).toBeVisible();
  expect(phoneRequests.some((url) => url.endsWith('.pptx'))).toBe(false);
  expect(pageErrors).toEqual([]);
  await phoneContext.close();
});

test('opens a PPTX from an HTTP LAN origin without secure-context APIs', async ({
  page,
}) => {
  const response = await page.request.get('/api/network');
  const { origin } = (await response.json()) as { origin: string };
  test.skip(
    !isLanIpv4(new URL(origin).hostname),
    'The dev worker did not provide a local LAN IPv4 origin.',
  );
  await page.goto(origin);
  test.skip(
    await page.evaluate(() => window.isSecureContext),
    'This browser treats the local HTTP address as a secure context.',
  );
  expect(await page.evaluate(() => window.isSecureContext)).toBe(false);
  expect(await page.evaluate(() => typeof crypto.subtle)).toBe('undefined');
  await page.getByLabel('Presentation file').setInputFiles({
    name: 'lan.pptx',
    mimeType:
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    buffer: Buffer.from(await makeDeck()),
  });
  await expect(
    page.getByRole('button', { name: 'Connect your phone' }),
  ).toBeEnabled();
  await page.getByRole('button', { name: 'Next slide', exact: true }).click();
  await expect(page.getByLabel('Audience presentation')).toContainText(
    'Second slide',
  );
  await page.getByRole('button', { name: 'Connect your phone' }).click();
  await expect(page.getByTestId('session-code')).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Previous slide', exact: true }),
  ).toBeEnabled();
  await page
    .getByRole('button', { name: 'Previous slide', exact: true })
    .click();
  await expect(page.getByLabel('Audience presentation')).toContainText(
    'Pocket Presenter',
  );
  await page.getByRole('button', { name: 'End session', exact: true }).click();
});

test('corporate desktop and mobile setup remain usable at narrow widths', async ({
  page,
}) => {
  await page.goto('/');
  await expect(
    page.getByRole('heading', {
      name: 'Present freely. Keep your notes close.',
    }),
  ).toBeVisible();
  await page.screenshot({
    path: 'test-results/desktop.png',
    fullPage: true,
    animations: 'disabled',
  });
  await page.setViewportSize({ width: 393, height: 851 });
  await page.goto('/join');
  await expect(page.getByLabel('Session code')).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: 'test-results/mobile.png',
    fullPage: true,
    animations: 'disabled',
  });
});
