import { Brand } from '../../components/Brand';
import { commandId } from '../../lib/commandId';
import { useSession } from '../session/useSession';
import { RemoteView } from './RemoteView';

export default function RemotePage({ sessionId }: { sessionId: string }) {
  const session = useSession(sessionId, 'presenter');
  return (
    <div className="min-h-dvh bg-base-100">
      <header className="mx-auto flex max-w-xl items-center justify-between px-5 py-6">
        <Brand />
        <span className="eyebrow">Remote</span>
      </header>
      <main className="mx-auto max-w-xl px-5 pt-5">
        {session.error ? (
          <div
            role="alert"
            className="alert alert-soft alert-warning mb-5 text-sm"
          >
            <span>
              {session.error}{' '}
              {session.needsPairing ? (
                <a href="/join" className="underline">
                  Pair this phone
                </a>
              ) : session.terminal ? (
                <a href="/join" className="underline">
                  Join another session
                </a>
              ) : (
                <button
                  type="button"
                  className="btn min-h-11"
                  onClick={session.retry}
                >
                  Retry connection
                </button>
              )}
            </span>
          </div>
        ) : null}
        <RemoteView
          state={session.state}
          notes={session.notes}
          connected={session.connected && !session.terminal}
          navigate={(target) =>
            session.send({
              type: 'navigate',
              commandId: commandId(),
              target,
            })
          }
        />
      </main>
    </div>
  );
}
