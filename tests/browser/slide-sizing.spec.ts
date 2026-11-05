import { expect, type Page, test } from '@playwright/test';
import { makeDeck } from '../fixtures/makeDeck';
import { makePdf } from '../fixtures/makePdf';

type Mode = 'fit' | 'fill' | 'stretch';

async function expectSizing(page: Page, mode: Mode, sourceRatio: number) {
  await expect
    .poll(async () =>
      page.locator('.stage-renderer').evaluate(
        (stage, { mode, sourceRatio }) => {
          const content = stage.querySelector('canvas, .pptx-surface');
          if (!content) return false;
          const frame = stage.getBoundingClientRect();
          const slide = content.getBoundingClientRect();
          const scale =
            mode === 'fill'
              ? Math.max(frame.width / sourceRatio, frame.height)
              : Math.min(frame.width / sourceRatio, frame.height);
          const width = mode === 'stretch' ? frame.width : sourceRatio * scale;
          const height = mode === 'stretch' ? frame.height : scale;
          return (
            Math.abs(slide.width - width) < 1 &&
            Math.abs(slide.height - height) < 1 &&
            Math.abs(slide.x + slide.width / 2 - frame.x - frame.width / 2) <
              1 &&
            Math.abs(slide.y + slide.height / 2 - frame.y - frame.height / 2) <
              1 &&
            getComputedStyle(stage).overflow === 'hidden'
          );
        },
        { mode, sourceRatio },
      ),
    )
    .toBe(true);
}

for (const format of ['pdf', 'pptx'] as const) {
  test(`${format} sizing works in preview and fullscreen, survives navigation and restores preferences`, async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    const file = {
      name: `sizing.${format}`,
      mimeType:
        format === 'pdf'
          ? 'application/pdf'
          : 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      buffer:
        format === 'pdf'
          ? Buffer.from(makePdf([['First slide'], ['Second slide']]))
          : Buffer.from(await makeDeck()),
    };
    const ratio = format === 'pdf' ? 792 / 612 : 16 / 9;
    await page.setViewportSize({ width: 1200, height: 900 });
    await page.goto('/');
    await page.getByLabel('Presentation file').setInputFiles(file);
    const sizing = page.getByRole('combobox', { name: 'Slide sizing' });
    await expect(sizing).toBeEnabled();
    await expect(sizing).toHaveValue('fit');
    // A different preview shape exercises both width- and height-constrained sizing.
    await page.getByLabel('Audience presentation').evaluate((stage) => {
      stage.style.aspectRatio = '4 / 3';
    });
    for (const mode of ['fit', 'fill', 'stretch'] as const) {
      await sizing.selectOption(mode);
      await expectSizing(page, mode, ratio);
      await page.getByRole('button', { name: 'Fullscreen' }).click();
      await expect
        .poll(() => page.evaluate(() => document.fullscreenElement !== null))
        .toBe(true);
      await expectSizing(page, mode, ratio);
      await page.screenshot({
        path: `test-results/${format}-${mode}-fullscreen.png`,
      });
      await page.keyboard.press('ArrowRight');
      if (format === 'pdf')
        await expect(page.locator('.stage-renderer canvas')).toHaveAttribute(
          'aria-label',
          'Presentation page 2',
        );
      else
        await expect(page.getByLabel('Audience presentation')).toContainText(
          'Second slide',
        );
      await expectSizing(page, mode, ratio);
      await page.keyboard.press('Escape');
      await expect
        .poll(() => page.evaluate(() => document.fullscreenElement === null))
        .toBe(true);
      await expect(
        page.getByText('Slide 2 / 2', { exact: true }),
      ).toBeVisible();
      await expectSizing(page, mode, ratio);
    }
    await sizing.focus();
    await expect(sizing).toBeFocused();
    const contrast = await sizing.evaluate((element) => {
      const style = getComputedStyle(element);
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = 1;
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Missing contrast-check canvas');
      const luminance = (color: string) => {
        context.fillStyle = style.backgroundColor;
        context.fillRect(0, 0, 1, 1);
        context.fillStyle = color;
        context.fillRect(0, 0, 1, 1);
        const pixels = context.getImageData(0, 0, 1, 1).data;
        const channels = [pixels[0], pixels[1], pixels[2]].map((value) => {
          const channel = value / 255;
          return channel <= 0.04045
            ? channel / 12.92
            : ((channel + 0.055) / 1.055) ** 2.4;
        });
        return (
          channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722
        );
      };
      const background = luminance(style.backgroundColor);
      const ratio = (color: string) => {
        const foreground = luminance(color);
        return (
          (Math.max(background, foreground) + 0.05) /
          (Math.min(background, foreground) + 0.05)
        );
      };
      return {
        text: ratio(style.color),
        border: ratio(style.borderColor),
        focus: ratio(style.outlineColor),
        outline: style.outlineStyle,
      };
    });
    expect(contrast.text).toBeGreaterThanOrEqual(4.5);
    expect(contrast.border).toBeGreaterThanOrEqual(3);
    expect(contrast.focus).toBeGreaterThanOrEqual(3);
    expect(contrast.outline).not.toBe('none');
    await page.keyboard.press('Home');
    await page.keyboard.press('End');
    await expect(page.getByText('Slide 2 / 2', { exact: true })).toBeVisible();
    await page.keyboard.press('Tab');
    await expect(
      page.getByRole('button', { name: 'Fullscreen' }),
    ).toBeFocused();
    await sizing.selectOption('stretch');
    await expect(page.getByText('Slide 2 / 2', { exact: true })).toBeVisible();
    for (const width of [393, 360]) {
      await page.setViewportSize({ width, height: 851 });
      await expectSizing(page, 'stretch', ratio);
      await expect(sizing).toBeVisible();
      expect(
        await sizing.evaluate(
          (element) => element.getBoundingClientRect().height,
        ),
      ).toBeGreaterThanOrEqual(44);
      const overflow = await page.evaluate(() => ({
        viewport: innerWidth,
        document: document.documentElement.scrollWidth,
        elements: [...document.querySelectorAll('main *')]
          .filter(
            (element) =>
              !element.closest('.stage-frame') &&
              element.getBoundingClientRect().right > innerWidth,
          )
          .map((element) => ({
            tag: element.tagName,
            className: element.className,
            right: element.getBoundingClientRect().right,
          })),
      }));
      expect(overflow.document, JSON.stringify(overflow)).toBeLessThanOrEqual(
        overflow.viewport,
      );
      await page.screenshot({
        path: `test-results/${format}-sizing-${width}.png`,
        fullPage: true,
      });
    }
    await page.setViewportSize({ width: 1200, height: 900 });
    await page.reload();
    await page.getByLabel('Presentation file').setInputFiles(file);
    await expect(sizing).toBeEnabled();
    await expect(sizing).toHaveValue('stretch');
    await expectSizing(page, 'stretch', ratio);
    expect(errors).toEqual([]);
  });
}
