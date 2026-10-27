import type { PdfDeck } from './deckTypes';
import { MAX_FILE_BYTES } from './limits';
import { createPdfPresentation } from './pdfDeck';
import { openPdfDocument } from './pdfDocument';

function validateFile(buffer: ArrayBuffer) {
  if (buffer.byteLength > MAX_FILE_BYTES)
    throw new Error('Choose a PDF smaller than 32 MB.');
}

async function open(buffer: ArrayBuffer) {
  try {
    return await openPdfDocument(buffer);
  } catch (error) {
    throw new Error(pdfError(error));
  }
}

export async function readPdfPresentation(
  buffer: ArrayBuffer,
  name = 'Presentation.pdf',
): Promise<PdfDeck> {
  validateFile(buffer);
  const loaded = await open(buffer);
  try {
    return await createPdfPresentation(buffer, name, loaded.document.numPages);
  } finally {
    await loaded.close();
  }
}

export function pdfError(error: unknown) {
  const candidate =
    error instanceof Error ? (error as Error & { name: string }) : null;
  if (candidate?.name === 'PasswordException')
    return 'Remove password protection before selecting this PDF.';
  if (
    candidate?.name === 'InvalidPDFException' ||
    candidate?.name === 'FormatError'
  )
    return 'Choose a readable PDF file.';
  return candidate?.message || 'The PDF could not be read.';
}
