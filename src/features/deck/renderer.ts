import type { Deck } from './deckTypes';

export function openRenderer(
  deck: Deck,
  container: HTMLElement,
  onWarning: (message: string) => void,
) {
  if (deck.format === 'pdf')
    return import('./pdfRenderer').then(({ openPdfRenderer }) =>
      openPdfRenderer(deck, container, onWarning),
    );
  return import('./pptxRenderer').then(({ openPptxRenderer }) =>
    openPptxRenderer(deck, container, onWarning),
  );
}
