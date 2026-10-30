import { useEffect, useRef, useState } from 'react';
import type { ServerMessage } from '../../../shared/protocol';
import { Brand } from '../../components/Brand';
import { commandId } from '../../lib/commandId';
import type { Deck } from '../deck/deckTypes';
import { MAX_FILE_BYTES } from '../deck/limits';
import { notesFormat } from '../deck/presentationNotes';
import type { openRenderer } from '../deck/renderer';
import { api, errorText } from '../session/api';
import { useSession } from '../session/useSession';
import { NotesPreview } from './NotesPreview';
import { PairingPanel } from './PairingPanel';
import { PresentationFiles } from './PresentationFiles';

type Renderer = Awaited<ReturnType<typeof openRenderer>>;
function restoredSession() {
  try {
    const id = sessionStorage.getItem('pp.host.v1');
    return id && /^[A-HJ-NP-Z2-9]{12}$/.test(id) ? id : null;
  } catch {
    return null;
  }
}
export default function HostPage() {
  const [deck, setDeck] = useState<Deck | null>(null);
  const deckRef = useRef(deck);
  deckRef.current = deck;
  const deckBuffer = deck?.buffer;
  const [sessionId, setSessionId] = useState<string | null>(restoredSession);
  const [index, setIndex] = useState(0);
  const [loading, setLoading] = useState(false);
  const [rendering, setRendering] = useState(false);
  const [ready, setReady] = useState(false);
  const [resume, setResume] = useState(0);
  const [error, setError] = useState('');
  const [warning, setWarning] = useState('');
  const [creating, setCreating] = useState(false);
  const [pairings, setPairings] = useState<
    { requestId: string; label: string }[]
  >([]);
  const stage = useRef<HTMLElement>(null);
  const container = useRef<HTMLDivElement>(null);
  const renderer = useRef<Renderer | null>(null);
  const queue = useRef<Promise<void>>(Promise.resolve());
  const latestRevision = useRef(-1);
  const session = useSession(sessionId, 'host', handleMessage);
  function handleMessage(message: ServerMessage) {
    if (message.type === 'pairing')
      setPairings((items) =>
        items.some((item) => item.requestId === message.requestId)
          ? items
          : [...items, message],
      );
    if (message.type === 'renderTarget') {
      latestRevision.current = message.revision;
      queue.current = queue.current
        .then(async () => {
          if (!renderer.current || latestRevision.current !== message.revision)
            return;
          setRendering(true);
          try {
            await renderer.current.showSlide(message.index);
            if (latestRevision.current === message.revision) {
              setIndex(message.index);
              session.send({
                type: 'renderConfirmed',
                index: message.index,
                revision: message.revision,
              });
            }
          } catch (err) {
            setError(errorText(err));
            session.send({ type: 'renderFailed', revision: message.revision });
          } finally {
            setRendering(false);
          }
        })
        .catch((err) => setError(errorText(err)));
    }
    if (message.type === 'requestNotes' && deck)
      session.send({
        type: 'notes',
        index: message.index,
        revision: message.revision,
        text: deck.slides[message.index]?.notes ?? '',
        format: notesFormat(deck),
      });
  }
  useEffect(() => {
    const selectedDeck = deckRef.current;
    if (!selectedDeck) return;
    if (!deckBuffer || selectedDeck.buffer !== deckBuffer) return;
    if (!container.current) return;
    let disposed = false;
    let instance: Renderer | null = null;
    setReady(false);
    setRendering(true);
    async function mount() {
      try {
        const { openRenderer: open } = await import('../deck/renderer');
        if (disposed) return;
        const renderDeck = deckRef.current;
        if (!renderDeck || renderDeck.buffer !== deckBuffer) return;
        const renderContainer = container.current;
        if (!renderContainer) return;
        const created = await open(renderDeck, renderContainer, (message) => {
          if (!disposed) setWarning(message);
        });
        instance = created;
        if (disposed) {
          created.destroy();
          return;
        }
        renderer.current = created;
        setReady(true);
        setIndex(0);
      } catch (err) {
        if (!disposed) setError(errorText(err));
      } finally {
        if (!disposed) setRendering(false);
      }
    }
    void mount();
    return () => {
      disposed = true;
      instance?.destroy();
      if (renderer.current === instance) renderer.current = null;
    };
  }, [deckBuffer]);
  useEffect(() => {
    if (
      session.connected &&
      ready &&
      deck &&
      deck.fingerprint === session.state?.fingerprint &&
      resume >= 0
    ) {
      latestRevision.current = -1;
      session.send({ type: 'ready', fingerprint: deck.fingerprint });
    }
  }, [
    session.connected,
    session.send,
    session.state?.fingerprint,
    ready,
    deck,
    resume,
  ]);
  const canNavigate =
    ready &&
    !loading &&
    !rendering &&
    (!sessionId ||
      (session.connected &&
        session.state?.hostReady &&
        !session.state.pending &&
        session.state.status === 'active'));
  function go(target: number) {
    if (!canNavigate || !deck || target < 0 || target >= deck.slides.length)
      return;
    if (sessionId)
      session.send({
        type: 'navigate',
        commandId: commandId(),
        target,
      });
    else {
      setRendering(true);
      queue.current = queue.current.then(async () => {
        try {
          await renderer.current?.showSlide(target);
          setIndex(target);
        } catch (err) {
          setError(errorText(err));
        } finally {
          setRendering(false);
        }
      });
    }
  }
  const keyHandler = useRef(go);
  keyHandler.current = go;
  useEffect(() => {
    function keydown(event: KeyboardEvent) {
      if (
        event.key === 'Escape' &&
        document.fullscreenElement === stage.current
      ) {
        void document.exitFullscreen().catch((err) => setError(errorText(err)));
        return;
      }
      if (
        (event.target as HTMLElement)?.closest(
          'input, textarea, button, [contenteditable="true"]',
        )
      )
        return;
      const target =
        event.key === 'ArrowRight' || event.key === 'PageDown'
          ? index + 1
          : event.key === 'ArrowLeft' || event.key === 'PageUp'
            ? index - 1
            : event.key === 'Home'
              ? 0
              : event.key === 'End'
                ? (deck?.slides.length ?? 1) - 1
                : null;
      if (target !== null) {
        event.preventDefault();
        keyHandler.current(target);
      }
    }
    window.addEventListener('keydown', keydown);
    return () => window.removeEventListener('keydown', keydown);
  }, [index, deck?.slides.length]);
  async function selectFile(file: File) {
    setError('');
    setWarning('');
    setLoading(true);
    try {
      if (file.size > MAX_FILE_BYTES)
        throw new Error(
          `Choose a ${file.name.toLowerCase().endsWith('.pdf') ? 'PDF' : 'PPTX'} smaller than 32 MB.`,
        );
      const buffer = await file.arrayBuffer();
      const next = file.name.toLowerCase().endsWith('.pdf')
        ? await (async () => {
            const { readPdfPresentation } = await import('../deck/readPdfDeck');
            return readPdfPresentation(buffer, file.name);
          })()
        : file.name.toLowerCase().endsWith('.pptx')
          ? await (async () => {
              const { readDeck } = await import('../deck/readDeck');
              return readDeck(buffer, file.name);
            })()
          : (() => {
              throw new Error('Choose a .pptx or .pdf presentation file.');
            })();
      if (
        sessionId &&
        session.state?.hostReady &&
        deck?.fingerprint === session.state.fingerprint &&
        next.fingerprint !== session.state.fingerprint
      )
        throw new Error(
          'Select the original presentation files to resume, or end this session first.',
        );
      setDeck(next);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setLoading(false);
    }
  }
  async function selectNotesFile(file: File) {
    if (!deck) return;
    setError('');
    setWarning('');
    setLoading(true);
    try {
      if (file.size > MAX_FILE_BYTES)
        throw new Error('Choose a Markdown file smaller than 32 MB.');
      const { attachMarkdownNotes } = await import('../deck/presentationNotes');
      const next = await attachMarkdownNotes(
        deck,
        await file.arrayBuffer(),
        file.name,
      );
      if (
        sessionId &&
        session.state &&
        next.fingerprint !== session.state.fingerprint
      )
        throw new Error(
          'Select the original presentation and Markdown notes to resume, or end this session first.',
        );
      setDeck(next);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setLoading(false);
    }
  }
  async function removeNotes() {
    if (!deck?.markdownNotes) return;
    setError('');
    setLoading(true);
    try {
      const { removeMarkdownNotes } = await import('../deck/presentationNotes');
      const next = await removeMarkdownNotes(deck);
      if (
        sessionId &&
        session.state &&
        next.fingerprint !== session.state.fingerprint
      )
        throw new Error('To change notes, end this session first.');
      setDeck(next);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setLoading(false);
    }
  }
  async function createSession() {
    if (!deck || !ready || loading || creating) return;
    setCreating(true);
    setError('');
    try {
      const result = await api<{ sessionId: string }>('', {
        fingerprint: deck.fingerprint,
        slideCount: deck.slides.length,
        initialIndex: index,
      });
      sessionStorage.setItem('pp.host.v1', result.sessionId);
      setSessionId(result.sessionId);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setCreating(false);
    }
  }
  async function endSession() {
    try {
      if (sessionId && !session.terminal)
        await api(`/${sessionId}`, {}, 'DELETE');
      sessionStorage.removeItem('pp.host.v1');
      setSessionId(null);
      setPairings([]);
      setError('');
    } catch (err) {
      setError(errorText(err));
    }
  }
  return (
    <div className="app-shell">
      <header className="border-b border-base-300 bg-base-100">
        <div className="mx-auto flex max-w-[1440px] items-center justify-between px-5 py-5 md:px-10">
          <Brand />
          <a href="/join" className="btn btn-sm btn-ghost">
            Join a session <span aria-hidden="true">↗</span>
          </a>
        </div>
      </header>
      <main className="workspace">
        <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="eyebrow mb-3">The stage is yours</p>
            <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">
              Present freely. Keep your notes close.
            </h1>
            <p className="mt-3 text-sm text-base-content/55">
              Your slides on the big screen. Your next move in your pocket.
            </p>
          </div>
          <span className="badge badge-outline gap-2 text-base-content/60">
            <span aria-hidden="true">◈</span> Files stay on this device
          </span>
        </div>
        {error || session.error ? (
          <div role="alert" className="alert alert-soft alert-error mb-5">
            <span>{error || session.error}</span>
            <button
              type="button"
              className="btn btn-xs"
              onClick={() => setError('')}
            >
              Dismiss
            </button>
          </div>
        ) : null}
        {warning ? (
          <div role="alert" className="alert alert-soft alert-warning mb-5">
            {warning}
          </div>
        ) : null}
        <PresentationFiles
          deck={deck}
          loading={loading}
          selectPresentation={(file) => void selectFile(file)}
          selectNotes={(file) => void selectNotesFile(file)}
          removeNotes={() => void removeNotes()}
        />
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
          <section className="min-w-0">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="eyebrow">Audience view</h2>
              <span className="text-xs text-base-content">
                {deck ? deck.name : 'Local presentation playback'}
              </span>
            </div>
            {deck ? (
              <>
                <section
                  ref={stage}
                  className="stage-frame"
                  aria-label="Audience presentation"
                >
                  <div className="stage-renderer" ref={container} />
                </section>
                <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-box border border-base-300 bg-base-100 p-3">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      aria-label="Previous slide"
                      className="btn btn-sm"
                      disabled={!canNavigate || index === 0}
                      onClick={() => go(index - 1)}
                    >
                      ←
                    </button>
                    <span className="min-w-24 text-center text-sm tabular-nums">
                      Slide {index + 1}{' '}
                      <span className="text-base-content/40">
                        / {deck.slides.length}
                      </span>
                    </span>
                    <button
                      type="button"
                      aria-label="Next slide"
                      className="btn btn-sm"
                      disabled={
                        !canNavigate || index === deck.slides.length - 1
                      }
                      onClick={() => go(index + 1)}
                    >
                      →
                    </button>
                  </div>
                  <button
                    type="button"
                    className="btn btn-sm"
                    disabled={!ready}
                    onClick={() => {
                      void stage.current
                        ?.requestFullscreen()
                        .catch((err) => setError(errorText(err)));
                    }}
                  >
                    Fullscreen ↗
                  </button>
                </div>
                <p className="mt-3 text-xs text-base-content/45">
                  {rendering
                    ? 'Rendering slide…'
                    : 'Use ← → to navigate. Escape exits fullscreen.'}{' '}
                  · Hidden slides are included.
                </p>
              </>
            ) : (
              <div className="upload-zone">
                <div>
                  <div
                    className="mx-auto mb-5 grid h-16 w-16 place-items-center rounded-2xl bg-base-200 text-3xl text-base-content/65"
                    aria-hidden="true"
                  >
                    ▤
                  </div>
                  <h3 className="text-xl font-semibold tracking-tight">
                    Ready when you are.
                  </h3>
                  <p className="mx-auto mb-6 mt-2 max-w-xs text-sm leading-relaxed text-base-content">
                    Choose a presentation file above. Slides and notes are read
                    in this browser and stay on this device.
                  </p>
                </div>
              </div>
            )}
            {deck ? (
              <div className="mt-5 flex items-center gap-4 text-xs text-base-content/55">
                <span>
                  {`${deck.slides.filter((slide) => slide.notes).length} slides with notes · notes are optional`}
                </span>
              </div>
            ) : null}
            {deck ? <NotesPreview deck={deck} index={index} /> : null}
            <div className="mt-8 grid gap-5 border-t border-base-300 pt-6 sm:grid-cols-3">
              {[
                [
                  '01',
                  'Open your deck',
                  'Slides and notes, processed locally.',
                ],
                [
                  '02',
                  'Pair your phone',
                  'Scan a code. Approve the connection.',
                ],
                ['03', 'Own the room', 'Navigate with your notes in hand.'],
              ].map(([number, title, text]) => (
                <div key={number}>
                  <span className="font-mono text-xs text-base-content/35">
                    {number} /
                  </span>
                  <h3 className="mb-1 mt-2 text-sm font-semibold">{title}</h3>
                  <p className="text-xs leading-relaxed text-base-content/50">
                    {text}
                  </p>
                </div>
              ))}
            </div>
          </section>
          <aside>
            <h2 className="eyebrow mb-3">Presenter remote</h2>
            <div className="card card-border bg-base-100">
              <div className="card-body p-6">
                <div className="mb-3 flex items-center justify-between">
                  <span className="text-2xl" aria-hidden="true">
                    ⌁
                  </span>
                  <span
                    className={`badge badge-soft ${session.state?.presenterConnected ? 'badge-success' : 'badge-ghost'}`}
                  >
                    {session.state?.presenterConnected
                      ? 'Phone connected'
                      : sessionId
                        ? 'Session open'
                        : 'Not paired'}
                  </span>
                </div>
                <h3 className="card-title text-xl tracking-tight">
                  A quieter kind of control.
                </h3>
                <p className="mb-4 text-sm leading-relaxed text-base-content/55">
                  Your phone gets private notes, the current slide number, and
                  two simple controls.
                </p>
                {sessionId ? (
                  <>
                    <PairingPanel
                      sessionId={sessionId}
                      requests={pairings}
                      decide={async (requestId, action) => {
                        try {
                          await api(
                            `/${sessionId}/pairings/${requestId}/${action}`,
                            {},
                          );
                        } catch (err) {
                          setError(errorText(err));
                        } finally {
                          setPairings((items) =>
                            items.filter(
                              (item) => item.requestId !== requestId,
                            ),
                          );
                        }
                      }}
                    />
                    {ready &&
                    session.connected &&
                    !session.state?.hostReady &&
                    !session.state?.pending ? (
                      <button
                        type="button"
                        className="btn mt-4"
                        onClick={() => {
                          setError('');
                          setResume((value) => value + 1);
                        }}
                      >
                        Resume presentation
                      </button>
                    ) : null}
                    {!deck ||
                    (session.state &&
                      deck.fingerprint !== session.state.fingerprint) ? (
                      <p className="mt-4 text-sm text-warning">
                        Reselect the original presentation and any Markdown
                        notes used for this session to resume, or end this
                        session first.
                      </p>
                    ) : null}
                    <button
                      type="button"
                      className="btn btn-ghost mt-4"
                      onClick={() => {
                        void endSession();
                      }}
                    >
                      {session.terminal ? 'Clear session' : 'End session'}
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    className="btn"
                    disabled={!ready || loading || creating}
                    onClick={() => {
                      void createSession();
                    }}
                  >
                    {creating ? 'Creating session…' : 'Connect your phone →'}
                  </button>
                )}
                {!sessionId ? (
                  <p className="mt-2 text-xs text-base-content/40">
                    Open a deck first to start a session.
                  </p>
                ) : null}
              </div>
            </div>
            <div className="px-1 py-5">
              <p className="eyebrow mb-2">Built for the browser</p>
              <p className="text-xs leading-relaxed text-base-content/50">
                No app to install. No Bluetooth to pair. Your phone and PC just
                need an internet connection.
              </p>
              <p className="mt-3 text-xs leading-relaxed text-base-content">
                PDF pages are shown as exported. PPTX fonts and complex elements
                may look different. Preview before presenting.
              </p>
            </div>
          </aside>
        </div>
        <footer className="mt-12 flex flex-wrap justify-between gap-3 border-t border-base-300 pt-5 text-xs text-base-content/40">
          <span>Pocket Presenter · Made for the moment.</span>
          <span>
            Slides stay local. Current notes travel securely to your phone.
          </span>
        </footer>
      </main>
    </div>
  );
}
