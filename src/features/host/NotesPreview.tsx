import { SpeakerNotes } from '../../components/SpeakerNotes';
import type { PdfDeck } from '../deck/deckTypes';

export function NotesPreview({
  deck,
  index,
}: {
  deck: PdfDeck;
  index: number;
}) {
  const text = deck.slides[index]?.notes ?? '';
  return (
    <section
      aria-labelledby="notes-preview-heading"
      className="mt-6 rounded-box border border-base-300 bg-base-100 p-5"
    >
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="notes-preview-heading" className="eyebrow">
          Speaker notes preview
        </h2>
        <span className="text-sm text-base-content">
          Page {index + 1} of {deck.slides.length}
        </span>
      </div>
      <div
        data-testid="notes-preview"
        aria-live="polite"
        className="max-h-64 overflow-y-auto break-words text-base leading-relaxed"
      >
        {deck.notesReady ? (
          <SpeakerNotes text={text} format="markdown" />
        ) : (
          <span className="text-base-content">
            Choose Markdown notes to preview the active slide's section here.
          </span>
        )}
      </div>
    </section>
  );
}
