import { SpeakerNotes } from '../../components/SpeakerNotes';
import type { Deck } from '../deck/deckTypes';
import { notesFormat } from '../deck/presentationNotes';

export function NotesPreview({ deck, index }: { deck: Deck; index: number }) {
  const text = deck.slides[index]?.notes ?? '';
  return (
    <section
      aria-labelledby="notes-preview-heading"
      className="mt-6 rounded-box border border-base-300 bg-base-100 p-5"
    >
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2
          id="notes-preview-heading"
          className="text-sm font-semibold text-base-content"
        >
          Speaker notes preview
        </h2>
        <span className="text-sm text-base-content">
          Slide {index + 1} of {deck.slides.length}
        </span>
      </div>
      <div
        data-testid="notes-preview"
        aria-live="polite"
        className="max-h-64 overflow-y-auto break-words text-base leading-relaxed"
      >
        <SpeakerNotes text={text} format={notesFormat(deck)} />
      </div>
    </section>
  );
}
