export interface DeckSlide {
  notes: string;
  hidden: boolean;
}

export interface PptxDeckSlide extends DeckSlide {
  path: string;
}

interface DeckMetadata {
  name: string;
  fingerprint: string;
  buffer: ArrayBuffer;
}

export interface PptxDeck extends DeckMetadata {
  format: 'pptx';
  slides: PptxDeckSlide[];
}

export interface PdfDeck extends DeckMetadata {
  format: 'pdf';
  slides: DeckSlide[];
  notesName: string | null;
  notesReady: boolean;
}

export type Deck = PptxDeck | PdfDeck;
