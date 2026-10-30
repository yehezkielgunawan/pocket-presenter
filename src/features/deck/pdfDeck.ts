import type { PdfDeck } from './deckTypes';
import { fingerprint } from './fingerprint';
import { MAX_FILE_BYTES, MAX_SLIDES } from './limits';

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
  };
}
