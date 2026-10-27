import { expect, test } from '@playwright/test';
import { makePdf } from '../fixtures/makePdf';

test('presents PDF pages with Markdown notes synchronized to the active slide', async ({
  page,
  browser,
}) => {
  const presentation = makePdf([
    ['Slide one'],
    ['Slide two'],
    ['Slide three'],
    ['Slide four'],
  ]);
  const notes =
    '# Notes for slide one\n\n- **Second notes line**\n\n---\n\n---\n\n# Notes for slide three\n\n```md\n---\n```';
  const pageErrors: string[] = [];
  const phoneRequests: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await page.goto('/');
  await page.setViewportSize({ width: 196, height: 851 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.locator('input[aria-label="Presentation file"]').setInputFiles({
    name: 'broken.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from('not a PDF'),
  });
  await expect(page.getByRole('alert')).toContainText(
    'Choose a readable PDF file.',
  );
  await page.setViewportSize({ width: 393, height: 851 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.locator('input[aria-label="Presentation file"]').setInputFiles({
    name: 'slides.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from(presentation),
  });

  await expect(page.locator('.stage-renderer canvas')).toHaveCount(1);
  await expect(
    page.getByRole('button', { name: 'Connect your phone' }),
  ).toBeDisabled();
  await page.getByLabel('Presentation notes Markdown').setInputFiles({
    name: 'wrong-notes.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from(makePdf([['Old PDF notes']])),
  });
  await expect(page.getByRole('alert')).toContainText(
    'Choose a Markdown notes file',
  );
  await expect(
    page.getByRole('button', { name: 'Connect your phone' }),
  ).toBeDisabled();
  await page.getByLabel('Presentation notes Markdown').setInputFiles({
    name: 'speaker-notes.md',
    mimeType: 'text/markdown',
    buffer: Buffer.from(notes),
  });
  await expect(page.getByTestId('notes-preview')).toContainText(
    'Notes for slide one',
  );
  await expect(
    page
      .getByTestId('notes-preview')
      .getByRole('heading', { name: 'Notes for slide one' }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Connect your phone' }),
  ).toBeEnabled();
  const initialCanvasWidth = await page
    .locator('.stage-renderer canvas')
    .evaluate((canvas) => canvas.width);
  await page.getByRole('button', { name: 'Fullscreen' }).click();
  await expect
    .poll(() =>
      page.locator('.stage-renderer canvas').evaluate((canvas) => canvas.width),
    )
    .toBeGreaterThan(initialCanvasWidth);
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
  phone.on('pageerror', (error) => pageErrors.push(error.message));
  phone.on('request', (request) => phoneRequests.push(request.url()));
  await phone.goto(`/join?code=${code}`);
  await phone.getByRole('button', { name: 'Connect to presentation' }).click();
  await expect(phone.getByText('Waiting for PC approval…')).toBeVisible();
  await page.getByRole('button', { name: 'Approve phone' }).click();
  await expect(
    phone.getByRole('heading', { name: 'Notes for slide one' }),
  ).toBeVisible();
  await expect(phone.locator('.remote-notes strong')).toHaveText(
    'Second notes line',
  );
  await phone.screenshot({
    path: 'test-results/markdown-phone.png',
    fullPage: true,
  });
  await phone.getByRole('button', { name: 'Next' }).click();
  await expect(page.getByText('Slide 2 / 4')).toBeVisible();
  await expect(page.locator('.stage-renderer canvas')).toHaveAttribute(
    'aria-label',
    'Presentation page 2',
  );
  await expect(
    phone.getByText('No speaker notes for this slide.'),
  ).toBeVisible();
  await expect(page.getByTestId('notes-preview')).toContainText(
    'No speaker notes for this slide.',
  );
  await phone.getByRole('button', { name: 'Next' }).click();
  await expect(
    phone.getByRole('heading', { name: 'Notes for slide three' }),
  ).toBeVisible();
  await expect(phone.locator('.remote-notes pre code')).toHaveText('---\n');
  await phone.getByRole('button', { name: 'Next' }).click();
  await expect(page.getByText('Slide 4 / 4')).toBeVisible();
  await expect(
    phone.getByText('No speaker notes for this slide.'),
  ).toBeVisible();
  await expect(phone.getByRole('button', { name: 'Next' })).toBeDisabled();
  await phone.getByRole('button', { name: 'Previous' }).click();
  await expect(
    phone.getByRole('heading', { name: 'Notes for slide three' }),
  ).toBeVisible();
  await page.keyboard.press('Home');
  await expect(
    phone.getByRole('heading', { name: 'Notes for slide one' }),
  ).toBeVisible();
  await page.keyboard.press('End');
  await expect(page.getByText('Slide 4 / 4')).toBeVisible();
  await expect(
    phone.getByText('No speaker notes for this slide.'),
  ).toBeVisible();
  await phone.getByRole('button', { name: 'Previous' }).click();
  await expect(
    phone.getByRole('heading', { name: 'Notes for slide three' }),
  ).toBeVisible();
  await page.reload();
  await expect(page.getByLabel('Presentation file')).toBeVisible();
  await page.getByLabel('Presentation file').setInputFiles({
    name: 'slides.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from(presentation),
  });
  await expect(page.locator('.stage-renderer canvas')).toHaveCount(1);
  await page.getByLabel('Presentation notes Markdown').setInputFiles({
    name: 'changed.md',
    mimeType: 'text/markdown',
    buffer: Buffer.from('# Different notes'),
  });
  await expect(page.getByRole('alert')).toContainText(
    'Select the original presentation PDF and Markdown notes',
  );
  await page.getByLabel('Presentation notes Markdown').setInputFiles({
    name: 'speaker-notes.md',
    mimeType: 'text/markdown',
    buffer: Buffer.from(notes),
  });
  await expect(
    phone.getByRole('heading', { name: 'Notes for slide three' }),
  ).toBeVisible();
  expect(
    await phone.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.getByRole('button', { name: 'End session', exact: true }).click();
  expect(phoneRequests.some((url) => /\.(pdf|md|markdown)$/.test(url))).toBe(
    false,
  );
  expect(pageErrors).toEqual([]);
  await phoneContext.close();
});

test('Markdown notes wrap long content and keep links keyboard accessible', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByLabel('Presentation file').setInputFiles({
    name: 'slides.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from(makePdf([['Slide one']])),
  });
  await expect(page.getByLabel('Presentation notes Markdown')).toBeEnabled();
  await page.getByLabel('Presentation notes Markdown').setInputFiles({
    name: 'notes.markdown',
    mimeType: 'text/markdown',
    buffer: Buffer.from(
      `# Notes\n\n${'long-content'.repeat(50)}\n\n\`\`\`text\n${'long-code'.repeat(50)}\n\`\`\`\n\n[Pairing help](/join)`,
    ),
  });
  const preview = page.getByTestId('notes-preview');
  await expect(
    preview.getByRole('heading', { name: 'Notes', exact: true }),
  ).toBeVisible();
  for (const width of [196, 393, 1280]) {
    await page.setViewportSize({ width, height: 851 });
    if (width >= 393) {
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
      ).toBe(true);
    }
    expect(
      await preview.evaluate(
        (element) => element.scrollWidth <= element.clientWidth,
      ),
    ).toBe(true);
  }
  const contrast = await preview.evaluate((element) => {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 1;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Missing canvas context');
    const background = getComputedStyle(
      element.closest('section') as HTMLElement,
    ).backgroundColor;
    const luminance = (pixels: Uint8ClampedArray) => {
      const channels = [pixels[0], pixels[1], pixels[2]].map((value) => {
        const channel = value / 255;
        return channel <= 0.04045
          ? channel / 12.92
          : ((channel + 0.055) / 1.055) ** 2.4;
      });
      return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
    };
    const ratio = (color: string) => {
      ctx.fillStyle = background;
      ctx.fillRect(0, 0, 1, 1);
      const base = luminance(ctx.getImageData(0, 0, 1, 1).data);
      ctx.fillStyle = color;
      ctx.fillRect(0, 0, 1, 1);
      const foreground = luminance(ctx.getImageData(0, 0, 1, 1).data);
      return (
        (Math.max(base, foreground) + 0.05) /
        (Math.min(base, foreground) + 0.05)
      );
    };
    return {
      body: ratio(getComputedStyle(element).color),
      label: ratio(
        getComputedStyle(
          document.getElementById('notes-preview-heading') as HTMLElement,
        ).color,
      ),
    };
  });
  expect(contrast.body).toBeGreaterThanOrEqual(4.5);
  console.info('Markdown notes contrast audit:', contrast);
  await page.setViewportSize({ width: 393, height: 851 });
  await preview.evaluate((element) => {
    element.style.fontSize = '200%';
  });
  expect(
    await preview.evaluate(
      (element) => element.scrollWidth <= element.clientWidth,
    ),
  ).toBe(true);
  const link = preview.getByRole('link', { name: 'Pairing help' });
  await link.focus();
  await expect(link).toBeFocused();
  const popup = page.waitForEvent('popup');
  await page.keyboard.press('Enter');
  await expect((await popup).getByLabel('Session code')).toBeVisible();
  await page.screenshot({
    path: 'test-results/markdown-preview.png',
    fullPage: true,
  });
});
