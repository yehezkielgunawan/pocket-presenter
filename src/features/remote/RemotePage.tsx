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
              <a href="/join" className="underline">
                Join again
              </a>
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
