import type { PdfDeck } from './deckTypes';
import { fingerprint, fingerprintPair } from './fingerprint';
import { MAX_FILE_BYTES, MAX_NOTES, MAX_SLIDES } from './limits';
import { parseMarkdownNotes } from './markdownNotes';

export async function createPdfPresentation(
  buffer: ArrayBuffer,
  name: string,
  pageCount: number,
): Promise<PdfDeck> {
  if (buffer.byteLength > MAX_FILE_BYTES)
    throw new Error('Choose a PDF smaller than 32 MB.');
  if (!Number.isInteger(pageCount) || pageCount < 1 || pageCount > MAX_SLIDES)
    throw new Error('Choose a PDF with 1–500 pages.');
  return {
    format: 'pdf',
    name,
    fingerprint: await fingerprint(buffer),
    slides: Array.from({ length: pageCount }, () => ({
      notes: '',
      hidden: false,
    })),
    buffer,
    notesName: null,
    notesReady: false,
  };
}

export async function attachMarkdownNotes(
  presentation: PdfDeck,
  notesBuffer: ArrayBuffer,
  notesName: string,
): Promise<PdfDeck> {
  if (notesBuffer.byteLength > MAX_FILE_BYTES)
    throw new Error('Choose a Markdown file smaller than 32 MB.');
  if (!/\.(md|markdown)$/i.test(notesName))
    throw new Error('Choose a Markdown notes file (.md or .markdown).');
  let source: string;
  try {
    source = new TextDecoder('utf-8', { fatal: true }).decode(notesBuffer);
  } catch {
    throw new Error(
      'Save your Markdown notes as UTF-8 and select the file again.',
    );
  }
  const notes = parseMarkdownNotes(source);
  const slides = presentation.slides.map((slide, index) => {
    const text = notes[index] ?? '';
    if (text.length > MAX_NOTES)
      throw new Error(
        `Notes for slide ${index + 1} exceed the 16,000 character limit.`,
      );
    return { ...slide, notes: text };
  });
  return {
    ...presentation,
    fingerprint: await fingerprintPair(presentation.buffer, notesBuffer),
    slides,
    notesName,
    notesReady: true,
  };
}
