import type { Deck } from '../deck/deckTypes';
import { NotesGuide } from './NotesGuide';

export function PresentationFiles({
  deck,
  loading,
  selectPresentation,
  selectNotes,
  removeNotes,
}: {
  deck: Deck | null;
  loading: boolean;
  selectPresentation: (file: File) => void;
  selectNotes: (file: File) => void;
  removeNotes: () => void;
}) {
  return (
    <section
      aria-label="Select presentation and notes files"
      aria-busy={loading}
      className="mb-6 grid gap-x-6 gap-y-4 rounded-box border border-base-300 bg-base-100 p-4 sm:grid-cols-2"
    >
      <fieldset className="fieldset min-w-0">
        <legend className="fieldset-legend">Presentation file</legend>
        <input
          type="file"
          accept=".pptx,.pdf,application/pdf,application/vnd.openxmlformats-officedocument.presentationml.presentation"
          aria-label="Presentation file"
          className="file-input presentation-file-input"
          disabled={loading}
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = '';
            if (file) selectPresentation(file);
          }}
        />
        <p className="mt-2 block break-words text-sm text-base-content">
          {deck
            ? `${deck.name} · ${deck.slides.length} pages · 32 MB max`
            : 'Choose a PPTX or PDF, up to 32 MB. Speaker notes are optional.'}
        </p>
      </fieldset>
      <fieldset className="fieldset min-w-0">
        <legend className="fieldset-legend">Markdown notes (optional)</legend>
        <input
          type="file"
          accept=".md,.markdown,text/markdown"
          aria-label="Presentation notes Markdown"
          aria-describedby="notes-file-help"
          className="file-input presentation-file-input"
          disabled={loading || !deck}
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = '';
            if (file) selectNotes(file);
          }}
        />
        <p
          id="notes-file-help"
          className="mt-2 block break-words text-sm text-base-content"
        >
          {deck?.markdownNotes
            ? `${deck.markdownNotes.name} · Markdown notes loaded`
            : deck?.format === 'pptx'
              ? 'Using embedded PPTX notes, if present. Upload Markdown to replace them.'
              : deck
                ? 'You can present without notes, or choose a .md or .markdown file, up to 32 MB.'
                : 'Choose a PDF or PPTX presentation first. Notes are optional.'}
        </p>
        {deck?.markdownNotes ? (
          <button
            type="button"
            className="btn min-h-11 justify-self-start whitespace-normal"
            disabled={loading}
            onClick={removeNotes}
          >
            Remove Markdown notes
          </button>
        ) : null}
        {deck ? (
          <p className="block text-sm text-base-content">
            Separate slide notes with <code>---</code> on its own line. Sections
            follow slide order; missing sections stay blank.
          </p>
        ) : null}
      </fieldset>
      <NotesGuide />
      {loading ? (
        <p role="status" className="text-sm text-base-content sm:col-span-2">
          Reading the selected file locally…
        </p>
      ) : null}
    </section>
  );
}
