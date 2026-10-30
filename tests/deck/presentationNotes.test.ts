import { expect, test } from '@rstest/core';
import { createPdfPresentation } from '../../src/features/deck/pdfDeck';
import {
  attachMarkdownNotes,
  notesFormat,
  removeMarkdownNotes,
} from '../../src/features/deck/presentationNotes';
import { readDeck } from '../../src/features/deck/readDeck';
import { makeDeck } from '../fixtures/makeDeck';

const bytes = (value: string) =>
  new TextEncoder().encode(value).buffer as ArrayBuffer;

test('Markdown replaces embedded PPTX notes, including blanks and hidden slides', async () => {
  const original = await readDeck(await makeDeck());
  const deck = await attachMarkdownNotes(
    original,
    bytes('\n---\n# Hidden slide'),
    'notes.md',
  );
  expect(deck.slides.map((slide) => slide.notes)).toEqual([
    '',
    '# Hidden slide',
  ]);
  expect(deck.slides[1].hidden).toBe(true);
  expect(deck.slides[0].path).toBe(original.slides[0].path);
  expect(original.slides[0].notes).toBe('First paragraph.\nSecond line.');
  expect(notesFormat(original)).toBe('text');
  expect(notesFormat(deck)).toBe('markdown');
});

test('replacing then removing Markdown restores original PPTX notes and identity', async () => {
  const original = await readDeck(await makeDeck());
  const first = await attachMarkdownNotes(
    original,
    bytes('# First override'),
    'first.md',
  );
  const second = await attachMarkdownNotes(
    first,
    bytes('# Second override'),
    'second.md',
  );
  const restored = await removeMarkdownNotes(second);
  expect(restored.slides).toEqual(original.slides);
  expect(restored.fingerprint).toBe(original.fingerprint);
  expect(restored.markdownNotes).toBeUndefined();
  expect(notesFormat(restored)).toBe('text');
  expect(second.slides[0].notes).toBe('# Second override');
});

test('removing PDF Markdown restores empty notes and original identity', async () => {
  const original = await createPdfPresentation(bytes('pdf'), 'slides.pdf', 2);
  const attached = await attachMarkdownNotes(
    original,
    bytes('First'),
    'notes.md',
  );
  expect(await removeMarkdownNotes(attached)).toEqual(original);
  expect(await removeMarkdownNotes(original)).toBe(original);
});

test('invalid replacement leaves existing notes and fingerprint unchanged', async () => {
  const original = await readDeck(await makeDeck());
  const attached = await attachMarkdownNotes(
    original,
    bytes('Keep these'),
    'notes.md',
  );
  const identity = attached.fingerprint;
  await expect(
    attachMarkdownNotes(
      attached,
      bytes('One\n---\nTwo\n---\nThree'),
      'extra.md',
    ),
  ).rejects.toThrow(/3 sections.*2 slides/);
  expect(attached.slides[0].notes).toBe('Keep these');
  expect(attached.fingerprint).toBe(identity);
});
