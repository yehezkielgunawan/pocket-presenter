import { expect, test } from '@playwright/test';
import JSZip from 'jszip';
import { makeDeck } from '../fixtures/makeDeck';
import { makePdf } from '../fixtures/makePdf';

for (const format of ['pdf', 'pptx'] as const) {
  test(`${format} presents without notes and resumes without a Markdown file`, async ({
    page,
    browser,
  }) => {
    const zip =
      format === 'pptx' ? await JSZip.loadAsync(await makeDeck()) : null;
    zip?.remove('ppt/slides/_rels/slide7.xml.rels');
    const presentation = {
      name: `slides.${format}`,
      mimeType:
        format === 'pdf'
          ? 'application/pdf'
          : 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      buffer: Buffer.from(
        zip
          ? await zip.generateAsync({ type: 'arraybuffer' })
          : makePdf([['First'], ['Second']]),
      ),
    };
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto('/');
    await page.getByLabel('Presentation file').setInputFiles(presentation);
    await expect(page.getByTestId('notes-preview')).toContainText(
      'No speaker notes for this slide.',
    );
    await expect(
      page.getByRole('button', { name: 'Connect your phone' }),
    ).toBeEnabled();
    await page.getByRole('button', { name: 'Connect your phone' }).click();
    const code = (
      await page.getByTestId('session-code').innerText()
    ).replaceAll(' ', '');
    const context = await browser.newContext();
    const phone = await context.newPage();
    await phone.goto(`/join?code=${code}`);
    await phone
      .getByRole('button', { name: 'Connect to presentation' })
      .click();
    await page.getByRole('button', { name: 'Approve phone' }).click();
    await expect(
      phone.getByText('No speaker notes for this slide.'),
    ).toBeVisible();
    await phone.getByRole('button', { name: 'Next' }).click();
    await expect(page.getByText('Slide 2 / 2')).toBeVisible();
    await page.reload();
    await expect(
      phone.getByRole('button', { name: 'Previous' }),
    ).toBeDisabled();
    await page.getByLabel('Presentation file').setInputFiles(presentation);
    await expect(page.getByText('Slide 2 / 2')).toBeVisible();
    await expect(phone.getByRole('button', { name: 'Previous' })).toBeEnabled();
    await phone.getByRole('button', { name: 'Previous' }).click();
    await expect(page.getByText('Slide 1 / 2')).toBeVisible();
    await page
      .getByRole('button', { name: 'End session', exact: true })
      .click();
    expect(errors).toEqual([]);
    await context.close();
  });

  test(`${format} supports optional Markdown replacement and removal before pairing`, async ({
    page,
  }) => {
    await page.goto('/');
    await page.getByLabel('Presentation file').setInputFiles({
      name: `slides.${format}`,
      mimeType:
        format === 'pdf'
          ? 'application/pdf'
          : 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      buffer: Buffer.from(
        format === 'pdf' ? makePdf([['First'], ['Second']]) : await makeDeck(),
      ),
    });
    const preview = page.getByTestId('notes-preview');
    await expect(preview).toContainText(
      format === 'pptx'
        ? 'First paragraph.'
        : 'No speaker notes for this slide.',
    );
    await page.getByLabel('Presentation notes Markdown').setInputFiles({
      name: 'notes.md',
      mimeType: 'text/markdown',
      buffer: Buffer.from('# Override\n---\n'),
    });
    await expect(
      preview.getByRole('heading', { name: 'Override' }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Next slide', exact: true }).click();
    await expect(preview).toContainText('No speaker notes for this slide.');
    await page.getByLabel('Presentation notes Markdown').setInputFiles({
      name: 'extra.md',
      mimeType: 'text/markdown',
      buffer: Buffer.from('One\n---\nTwo\n---\nExtra'),
    });
    await expect(page.getByRole('alert')).toContainText('3 sections');
    await expect(
      page.getByText('notes.md · Markdown notes loaded'),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Remove Markdown notes' }).click();
    await page
      .getByRole('button', { name: 'Previous slide', exact: true })
      .click();
    await expect(preview).toContainText(
      format === 'pptx'
        ? 'First paragraph.'
        : 'No speaker notes for this slide.',
    );
    await expect(
      page.getByRole('button', { name: 'Remove Markdown notes' }),
    ).toHaveCount(0);
  });
}

test('PPTX Markdown overrides embedded notes on the remote and resumes with the original pair', async ({
  page,
  browser,
}) => {
  const presentation = {
    name: 'slides.pptx',
    mimeType:
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    buffer: Buffer.from(await makeDeck()),
  };
  const notes = {
    name: 'notes.md',
    mimeType: 'text/markdown',
    buffer: Buffer.from('# Custom notes\n---\n# Hidden slide notes'),
  };
  await page.goto('/');
  await page.getByLabel('Presentation file').setInputFiles(presentation);
  await expect(page.getByLabel('Presentation notes Markdown')).toBeEnabled();
  await page.getByLabel('Presentation notes Markdown').setInputFiles(notes);
  await expect(
    page
      .getByTestId('notes-preview')
      .getByRole('heading', { name: 'Custom notes' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Connect your phone' }).click();
  const code = (await page.getByTestId('session-code').innerText()).replaceAll(
    ' ',
    '',
  );
  const context = await browser.newContext();
  const phone = await context.newPage();
  await phone.goto(`/join?code=${code}`);
  await phone.getByRole('button', { name: 'Connect to presentation' }).click();
  await page.getByRole('button', { name: 'Approve phone' }).click();
  await expect(
    phone.getByRole('heading', { name: 'Custom notes' }),
  ).toBeVisible();
  await expect(phone.getByText('First paragraph.')).toHaveCount(0);
  await phone.getByRole('button', { name: 'Next' }).click();
  await expect(
    phone.getByRole('heading', { name: 'Hidden slide notes' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Remove Markdown notes' }).click();
  await expect(page.getByRole('alert')).toContainText('end this session first');
  await expect(
    page.getByText('notes.md · Markdown notes loaded'),
  ).toBeVisible();
  await page.reload();
  await page.getByLabel('Presentation file').setInputFiles({
    name: 'wrong.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from(makePdf([['Wrong deck']])),
  });
  await expect(page.locator('.stage-renderer canvas')).toHaveCount(1);
  await expect(phone.getByRole('button', { name: 'Previous' })).toBeDisabled();
  await page.getByLabel('Presentation file').setInputFiles(presentation);
  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect(page.getByLabel('Presentation notes Markdown')).toBeEnabled();
  await expect(phone.getByRole('button', { name: 'Previous' })).toBeDisabled();
  await page
    .getByLabel('Presentation notes Markdown')
    .setInputFiles({ ...notes, buffer: Buffer.from('Wrong') });
  await expect(page.getByRole('alert')).toContainText(
    'original presentation and Markdown notes',
  );
  await page.getByLabel('Presentation notes Markdown').setInputFiles(notes);
  await expect(page.getByText('Slide 2 / 2')).toBeVisible();
  await expect(
    phone.getByRole('heading', { name: 'Hidden slide notes' }),
  ).toBeVisible();
  await phone.getByRole('button', { name: 'Previous' }).click();
  await expect(
    phone.getByRole('heading', { name: 'Custom notes' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'End session', exact: true }).click();
  await context.close();
});

test('notes guide supports keyboard, clipboard fallback, and narrow screens', async ({
  page,
  context,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  const summary = page.locator('summary', {
    hasText: 'How to write presentation notes',
  });
  await summary.focus();
  await page.keyboard.press('Enter');
  const guide = page.locator('details', { has: summary });
  await expect(guide).toHaveAttribute('open', '');
  await expect(page.getByLabel('AI prompt')).toBeVisible();
  for (const width of [196, 393, 1280]) {
    await page.setViewportSize({ width, height: 851 });
    expect(
      await guide.evaluate(
        (element) => element.scrollWidth <= element.clientWidth,
      ),
    ).toBe(true);
    if (width >= 393)
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
      ).toBe(true);
    await expect(
      page.getByRole('button', { name: 'Copy AI prompt' }),
    ).toBeVisible();
  }
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.getByRole('button', { name: 'Copy AI prompt' }).click();
  await expect(guide.getByRole('status')).toContainText('Prompt copied');
  expect(await page.evaluate(() => navigator.clipboard.readText())).toContain(
    'UTF-8 Markdown',
  );
  await expect(page.getByRole('button', { name: 'Copied!' })).toHaveClass(
    /btn-success/,
  );
  const contrast = await guide.evaluate((element) => {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 1;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Missing canvas context');
    const luminance = (color: string) => {
      ctx.clearRect(0, 0, 1, 1);
      ctx.fillStyle = color;
      ctx.fillRect(0, 0, 1, 1);
      const channels = Array.from(ctx.getImageData(0, 0, 1, 1).data)
        .slice(0, 3)
        .map((value) => {
          const c = value / 255;
          return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
        });
      return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
    };
    return Array.from(
      element.querySelectorAll('summary, li, pre, label, p, textarea, button'),
    ).map((node) => {
      let background: Element | null = node;
      while (
        background &&
        getComputedStyle(background).backgroundColor === 'rgba(0, 0, 0, 0)'
      )
        background = background.parentElement;
      const base = luminance(
        background ? getComputedStyle(background).backgroundColor : '#fff',
      );
      const foreground = luminance(getComputedStyle(node).color);
      return (
        (Math.max(base, foreground) + 0.05) /
        (Math.min(base, foreground) + 0.05)
      );
    });
  });
  expect(Math.min(...contrast)).toBeGreaterThanOrEqual(4.5);
  await expect(
    page.getByRole('button', { name: 'Copy AI prompt' }),
  ).toBeVisible();
  await page.evaluate(() =>
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: undefined,
    }),
  );
  await page.getByRole('button', { name: 'Copy AI prompt' }).focus();
  await page.keyboard.press('Space');
  await expect(guide.getByRole('status')).toContainText(
    'Select and copy the prompt below',
  );
  await expect(page.getByLabel('AI prompt')).toBeFocused();
  expect(
    await page
      .getByLabel('AI prompt')
      .evaluate(
        (element: HTMLTextAreaElement) =>
          element.selectionEnd - element.selectionStart ===
          element.value.length,
      ),
  ).toBe(true);
  await summary.focus();
  await page.keyboard.press('Enter');
  await expect(guide).not.toHaveAttribute('open');
  expect(errors).toEqual([]);
});
