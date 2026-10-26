import { expect, test } from '@rstest/core';
import JSZip from 'jszip';
import { readDeck } from '../../src/features/deck/readDeck';
import { makeDeck } from '../fixtures/makeDeck';

test('follows presentation and notes relationships, preserving paragraphs', async () => {
  const deck = await readDeck(await makeDeck());
  expect(deck.slides.map((slide) => slide.path)).toEqual([
    'ppt/slides/slide7.xml',
    'ppt/slides/slide2.xml',
  ]);
  expect(deck.slides[0].notes).toBe('First paragraph.\nSecond line.');
  expect(deck.slides[1].notes).toBe('');
  expect(deck.slides[1].hidden).toBe(true);
});

test('rejects a file that is not a PowerPoint archive', async () => {
  await expect(
    readDeck(new TextEncoder().encode('not a zip').buffer),
  ).rejects.toThrow();
});

test('rejects relationships escaping the package', async () => {
  await expect(
    readDeck(await makeDeck({ badRelationship: true })),
  ).rejects.toThrow(/relationship/i);
});

test('bounds decompression of XML parts before parsing', async () => {
  const zip = await JSZip.loadAsync(await makeDeck());
  zip.file('ppt/notesSlides/notesSlide9.xml', 'x'.repeat(2 * 1024 * 1024 + 1));
  const compressed = await zip.generateAsync({
    type: 'arraybuffer',
    compression: 'DEFLATE',
  });
  await expect(readDeck(compressed)).rejects.toThrow(
    'XML exceeds the 2 MB limit',
  );
});
