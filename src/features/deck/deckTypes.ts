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
  markdownNotes?: {
    name: string;
    originalNotes: string[];
  };
}

export interface PptxDeck extends DeckMetadata {
  format: 'pptx';
  slides: PptxDeckSlide[];
}

export interface PdfDeck extends DeckMetadata {
  format: 'pdf';
  slides: DeckSlide[];
}

export type Deck = PptxDeck | PdfDeck;
