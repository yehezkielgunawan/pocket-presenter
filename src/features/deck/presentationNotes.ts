import type { Deck } from './deckTypes';
import { fingerprint, fingerprintPair } from './fingerprint';
import { MAX_FILE_BYTES, MAX_NOTES } from './limits';
import { parseMarkdownNotes } from './markdownNotes';

export function notesFormat(deck: Deck): 'text' | 'markdown' {
  return deck.markdownNotes ? 'markdown' : 'text';
}

export async function attachMarkdownNotes<T extends Deck>(
  presentation: T,
  notesBuffer: ArrayBuffer,
  notesName: string,
): Promise<T> {
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
  if (notes.length > presentation.slides.length)
    throw new Error(
      `The notes file has ${notes.length} sections, but the presentation has ${presentation.slides.length} slides. Remove the extra sections and try again.`,
    );
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
    markdownNotes: {
      name: notesName,
      originalNotes:
        presentation.markdownNotes?.originalNotes ??
        presentation.slides.map((slide) => slide.notes),
    },
  };
}

export async function removeMarkdownNotes<T extends Deck>(
  presentation: T,
): Promise<T> {
  if (!presentation.markdownNotes) return presentation;
  const { markdownNotes, ...original } = presentation;
  return {
    ...original,
    fingerprint: await fingerprint(presentation.buffer),
    slides: presentation.slides.map((slide, index) => ({
      ...slide,
      notes: markdownNotes.originalNotes[index] ?? '',
    })),
  } as T;
}
