import { QRCodeSVG } from 'qrcode.react';
import { useEffect, useState } from 'react';

export interface PairingRequest {
  requestId: string;
  label: string;
}
export function PairingPanel({
  sessionId,
  requests,
  decide,
}: {
  sessionId: string;
  requests: PairingRequest[];
  decide: (id: string, action: 'approve' | 'reject') => Promise<void>;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [origin, setOrigin] = useState(window.location.origin);
  useEffect(() => {
    const controller = new AbortController();
    async function discover() {
      try {
        const response = await fetch('/api/network', {
          signal: controller.signal,
        });
        if (!response.ok) return;
        const data: unknown = await response.json();
        if (
          data &&
          typeof data === 'object' &&
          'origin' in data &&
          typeof data.origin === 'string'
        ) {
          const candidate = new URL(data.origin);
          if (
            !controller.signal.aborted &&
            ['http:', 'https:'].includes(candidate.protocol)
          )
            setOrigin(candidate.origin);
        }
      } catch {
        /* Keep the current origin when network discovery is unavailable. */
      }
    }
    void discover();
    return () => controller.abort();
  }, []);
  const url = `${origin}/join?code=${sessionId}`;
  return (
    <>
      <div className="my-1 rounded-box border border-base-300 p-5 text-center">
        <QRCodeSVG
          value={url}
          size={160}
          className="mx-auto"
          title="Scan to pair your phone"
        />
        <p className="eyebrow mb-2 mt-5">Or enter this session code</p>
        <p
          className="font-mono text-lg font-semibold tracking-wider"
          data-testid="session-code"
        >
          {sessionId.match(/.{1,4}/g)?.join(' ')}
        </p>
      </div>
      <a
        className="mt-2 break-all text-xs text-base-content/50 underline"
        href={url}
        target="_blank"
        rel="noreferrer"
      >
        Open pairing link ↗
      </a>
      <p className="mt-2 break-all text-xs text-base-content/50">
        Phone address: {origin}/join
      </p>
      <p className="mt-3 text-xs text-base-content/50">
        Approve the request below after joining on your phone.
      </p>
      {requests.map((request) => (
        <div
          key={request.requestId}
          className="mt-3 rounded-box border border-base-300 p-3"
        >
          <p className="mb-3 text-sm font-medium">
            {request.label} wants to connect
          </p>
          <div className="flex gap-2">
            {(['approve', 'reject'] as const).map((action) => (
              <button
                type="button"
                key={action}
                className="btn btn-sm"
                disabled={busy !== null}
                onClick={async () => {
                  setBusy(request.requestId);
                  try {
                    await decide(request.requestId, action);
                  } finally {
                    setBusy(null);
                  }
                }}
              >
                {action === 'approve' ? 'Approve phone' : 'Decline'}
              </button>
            ))}
          </div>
        </div>
      ))}
    </>
  );
}
