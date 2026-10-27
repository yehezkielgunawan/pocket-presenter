import { expect, test } from '@rstest/core';
import {
  attachMarkdownNotes,
  createPdfPresentation,
} from '../../src/features/deck/pdfDeck';
import { MAX_FILE_BYTES } from '../../src/features/deck/readDeck';

function bytes(value: string) {
  return new TextEncoder().encode(value).buffer as ArrayBuffer;
}

test('creates a local PDF presentation with page-aligned empty notes', async () => {
  const buffer = bytes('presentation');
  const deck = await createPdfPresentation(buffer, 'slides.pdf', 2);

  expect(deck).toMatchObject({
    format: 'pdf',
    name: 'slides.pdf',
    notesReady: false,
    slides: [
      { notes: '', hidden: false },
      { notes: '', hidden: false },
    ],
    buffer,
  });
});

test('attaches Markdown sections and fingerprints both original files', async () => {
  const presentation = await createPdfPresentation(
    bytes('presentation'),
    'slides.pdf',
    2,
  );
  const notesBytes = bytes('# Notes for slide one\n---\n');

  const deck = await attachMarkdownNotes(
    presentation,
    notesBytes,
    'speaker-notes.md',
  );

  expect(deck).toMatchObject({
    format: 'pdf',
    notesName: 'speaker-notes.md',
    notesReady: true,
    slides: [
      { notes: '# Notes for slide one', hidden: false },
      { notes: '', hidden: false },
    ],
  });
  expect(deck.fingerprint).not.toBe(presentation.fingerprint);
  const same = await attachMarkdownNotes(
    presentation,
    notesBytes,
    'renamed.md',
  );
  expect(same.fingerprint).toBe(deck.fingerprint);
  const changed = await attachMarkdownNotes(
    presentation,
    bytes('Changed'),
    'notes.md',
  );
  expect(changed.fingerprint).not.toBe(deck.fingerprint);
});

test('pads missing sections and ignores extra sections without changing PDF slide count', async () => {
  const presentation = await createPdfPresentation(
    bytes('presentation'),
    'slides.pdf',
    3,
  );
  const shorter = await attachMarkdownNotes(
    presentation,
    bytes('First'),
    'notes.md',
  );
  expect(shorter.slides.map((slide) => slide.notes)).toEqual(['First', '', '']);
  const longer = await attachMarkdownNotes(
    presentation,
    bytes('First\n---\n\n---\nThird\n---\nExtra'),
    'notes.markdown',
  );
  expect(longer.slides.map((slide) => slide.notes)).toEqual([
    'First',
    '',
    'Third',
  ]);
  const empty = await attachMarkdownNotes(presentation, bytes(''), 'notes.md');
  expect(empty.notesReady).toBe(true);
  expect(empty.slides.map((slide) => slide.notes)).toEqual(['', '', '']);
});

test('rejects oversized notes files and mapped sections', async () => {
  const presentation = await createPdfPresentation(
    bytes('presentation'),
    'slides.pdf',
    2,
  );

  await expect(
    attachMarkdownNotes(
      presentation,
      new ArrayBuffer(MAX_FILE_BYTES + 1),
      'speaker-notes.md',
    ),
  ).rejects.toThrow(/32 MB/i);
  await expect(
    attachMarkdownNotes(presentation, bytes('a'.repeat(16001)), 'notes.md'),
  ).rejects.toThrow(/16,000/);
  await expect(
    attachMarkdownNotes(presentation, bytes('a'.repeat(16000)), 'notes.md'),
  ).resolves.toMatchObject({ notesReady: true });
  await expect(
    attachMarkdownNotes(
      presentation,
      bytes(`One\n---\nTwo\n---\n${'a'.repeat(16001)}`),
      'notes.md',
    ),
  ).resolves.toMatchObject({ notesReady: true });
  await expect(
    attachMarkdownNotes(presentation, bytes('%PDF-1.7'), 'notes.pdf'),
  ).rejects.toThrow(/Markdown/);
  await expect(
    attachMarkdownNotes(
      presentation,
      new Uint8Array([0xff]).buffer,
      'notes.md',
    ),
  ).rejects.toThrow(/UTF-8/);
  await expect(
    createPdfPresentation(new ArrayBuffer(MAX_FILE_BYTES + 1), 'large.pdf', 1),
  ).rejects.toThrow(/32 MB/i);
});
