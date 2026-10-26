import type { Snapshot } from '../../../shared/protocol';
import type { Notes } from '../session/useSession';

export function RemoteView({
  state,
  notes,
  connected,
  navigate,
}: {
  state: Snapshot | null;
  notes: Notes | null;
  connected: boolean;
  navigate: (target: number) => void;
}) {
  const usable =
    connected &&
    state?.hostConnected &&
    state.hostReady &&
    state.status === 'active' &&
    !state.pending;
  const matchingNotes =
    usable &&
    notes?.index === state.confirmedSlideIndex &&
    notes.revision === state.revision;
  const label =
    state?.status === 'ended'
      ? 'Session ended'
      : !connected
        ? 'Connecting…'
        : !state?.hostConnected
          ? 'Waiting for PC'
          : state.pending
            ? 'Changing slide…'
            : !state.hostReady
              ? 'Waiting for PC to resume'
              : 'Connected';
  return (
    <>
      <section className="flex items-start justify-between gap-4 border-b border-base-300 pb-7">
        <div>
          <p className="eyebrow mb-2">On the audience screen</p>
          <h1 className="text-5xl font-semibold tracking-tight tabular-nums">
            {state ? state.confirmedSlideIndex + 1 : '—'}
            <span className="ml-2 text-2xl font-normal text-base-content/40">
              / {state?.slideCount ?? '—'}
            </span>
          </h1>
        </div>
        <span
          className={`badge badge-soft ${usable ? 'badge-success' : 'badge-warning'} mt-1`}
          role="status"
        >
          {label}
        </span>
      </section>
      <section className="py-8 pb-44">
        <div className="mb-6 flex items-center justify-between">
          <h2 className="eyebrow">Speaker notes</h2>
          <span className="text-xs text-base-content/45">
            Only on your phone
          </span>
        </div>
        <div className="remote-notes" aria-live="polite">
          {matchingNotes ? (
            notes.text || (
              <span className="text-base-content/45">
                No speaker notes for this slide.
              </span>
            )
          ) : (
            <span className="text-base-content/45">
              {state?.pending
                ? 'Waiting for the PC to display the next slide…'
                : 'Waiting for current speaker notes…'}
            </span>
          )}
        </div>
      </section>
      <div className="remote-controls fixed inset-x-0 bottom-0 border-t border-base-300 bg-base-100 px-5 pt-4">
        <div className="mx-auto grid max-w-xl grid-cols-2 gap-3">
          <button
            type="button"
            className="btn btn-lg h-16"
            disabled={!usable || state.confirmedSlideIndex === 0}
            onClick={() => state && navigate(state.confirmedSlideIndex - 1)}
          >
            ← Previous
          </button>
          <button
            type="button"
            className="btn btn-primary btn-lg h-16"
            disabled={
              !usable || state.confirmedSlideIndex >= state.slideCount - 1
            }
            onClick={() => state && navigate(state.confirmedSlideIndex + 1)}
          >
            Next →
          </button>
        </div>
        <p className="mt-3 text-center text-xs text-base-content/45">
          Slide numbers update after the PC confirms.
        </p>
      </div>
    </>
  );
}
