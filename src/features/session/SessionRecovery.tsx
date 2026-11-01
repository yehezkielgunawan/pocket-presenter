import { type ReactNode, useEffect, useState } from 'react';
import { presenterAccess } from './presenterAccess';
import { forgetSession, rememberSession } from './rememberedSession';

export function SessionRecovery({
  sessionId,
  onResume,
  children,
}: {
  sessionId: string | null;
  onResume: (id: string) => void;
  children: ReactNode;
}) {
  const [status, setStatus] = useState<'checking' | 'failed' | 'setup'>(
    sessionId ? 'checking' : 'setup',
  );
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!sessionId) {
      setStatus('setup');
      return;
    }
    const controller = new AbortController();
    let disposed = false;
    let failed = false;
    let retry: ReturnType<typeof setTimeout>;
    const timeout = setTimeout(() => controller.abort(), 10000);
    setStatus('checking');
    void presenterAccess(sessionId, controller.signal)
      .then((access) => {
        if (disposed) return;
        if (access === 'approved') {
          rememberSession(sessionId);
          onResume(sessionId);
        } else {
          forgetSession(sessionId);
          setStatus('setup');
        }
      })
      .catch(() => {
        if (disposed) return;
        failed = true;
        setStatus('failed');
        retry = setTimeout(
          () => setAttempt((value) => value + 1),
          Math.min(1000 * 2 ** attempt, 15000),
        );
      })
      .finally(() => clearTimeout(timeout));
    const wake = () => {
      if (failed) setAttempt((value) => value + 1);
    };
    window.addEventListener('online', wake);
    return () => {
      disposed = true;
      controller.abort();
      clearTimeout(timeout);
      clearTimeout(retry);
      window.removeEventListener('online', wake);
    };
  }, [sessionId, onResume, attempt]);

  if (status === 'setup') return children;
  return (
    <main className="mx-auto max-w-md px-6 py-16 text-base-content">
      <h1 className="mb-4 text-2xl font-semibold">
        Returning to your presentation
      </h1>
      <p role="status">
        {status === 'failed'
          ? 'Cannot reach your session. Reconnecting automatically…'
          : 'Checking your phone’s session…'}
      </p>
      {status === 'failed' ? (
        <button
          className="btn mt-6 min-h-11"
          type="button"
          onClick={() => setAttempt((value) => value + 1)}
        >
          Retry connection
        </button>
      ) : null}
    </main>
  );
}
