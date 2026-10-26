import { useEffect, useState } from 'react';
import { Brand } from '../../components/Brand';
import { api, errorText } from '../session/api';

export default function JoinPage() {
  const [code, setCode] = useState(
    new URLSearchParams(window.location.search).get('code') ?? '',
  );
  const [pairing, setPairing] = useState<{
    sessionId: string;
    requestId: string;
  } | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!pairing) return;
    let disposed = false;
    let timer: ReturnType<typeof setTimeout>;
    async function claim() {
      try {
        const result = await api<{ pending?: boolean }>(
          `/${pairing?.sessionId}/pairings/${pairing?.requestId}/claim`,
          {},
        );
        if (disposed) return;
        if (result.pending) timer = setTimeout(claim, 1500);
        else window.location.assign(`/remote/${pairing?.sessionId}`);
      } catch (err) {
        if (!disposed) {
          setError(errorText(err));
          setPairing(null);
        }
      }
    }
    timer = setTimeout(claim, 800);
    return () => {
      disposed = true;
      clearTimeout(timer);
    };
  }, [pairing]);
  return (
    <div className="app-shell">
      <header className="border-b border-base-300 bg-base-100 px-6 py-5">
        <Brand />
      </header>
      <main className="mx-auto max-w-md px-6 py-16">
        <p className="eyebrow mb-4">Your phone. Your presenter remote.</p>
        <h1 className="mb-3 text-4xl font-semibold tracking-tight">
          Take the controls.
        </h1>
        <p className="mb-9 text-base-content/60">
          Enter the code shown on your PC. Keep your notes close and your slides
          in sync.
        </p>
        <form
          className="card card-border bg-base-100"
          onSubmit={async (event) => {
            event.preventDefault();
            setError('');
            setBusy(true);
            try {
              const id = code.toUpperCase().replace(/[^A-Z2-9]/g, '');
              if (!/^[A-HJ-NP-Z2-9]{12}$/.test(id))
                throw new Error('Enter the 12-character code from your PC.');
              const result = await api<{ requestId: string }>(
                `/${id}/pairings`,
                { label: 'Phone remote' },
              );
              setPairing({ sessionId: id, requestId: result.requestId });
            } catch (err) {
              setError(errorText(err));
            } finally {
              setBusy(false);
            }
          }}
        >
          <div className="card-body gap-5">
            <label htmlFor="code" className="text-sm font-medium">
              Session code
            </label>
            <input
              id="code"
              className="input input-lg w-full font-mono uppercase tracking-widest"
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              placeholder="XXXX XXXX XXXX"
              value={code}
              onChange={(event) => setCode(event.target.value)}
              disabled={!!pairing}
              required
            />
            {error ? (
              <div
                role="alert"
                className="alert alert-soft alert-error text-sm"
              >
                {error}
              </div>
            ) : null}
            <button
              className="btn btn-primary"
              type="submit"
              disabled={busy || !!pairing}
            >
              {pairing
                ? 'Waiting for PC approval…'
                : busy
                  ? 'Joining…'
                  : 'Connect to presentation →'}
            </button>
            {pairing ? (
              <p className="text-sm text-base-content/60" role="status">
                Approve this phone on your PC. The request expires in two
                minutes.
              </p>
            ) : null}
          </div>
        </form>
        <p className="mt-7 text-center text-xs text-base-content/45">
          Both devices need internet. The same Wi-Fi is optional.
        </p>
      </main>
    </div>
  );
}
