import { useCallback, useEffect, useRef, useState } from 'react';
import {
  type ClientMessage,
  type ServerMessage,
  type Snapshot,
  serverMessage,
} from '../../../shared/protocol';

export type Notes = { index: number; revision: number; text: string };
export function useSession(
  id: string | null,
  role: 'host' | 'presenter',
  onMessage?: (message: ServerMessage) => void,
) {
  const socket = useRef<WebSocket | null>(null);
  const callback = useRef(onMessage);
  callback.current = onMessage;
  const [state, setState] = useState<Snapshot | null>(null);
  const [connected, setConnected] = useState(false);
  const [notes, setNotes] = useState<Notes | null>(null);
  const [error, setError] = useState('');
  const [terminal, setTerminal] = useState(false);
  useEffect(() => {
    setState(null);
    setNotes(null);
    setError('');
    setTerminal(false);
    if (!id) return;
    let disposed = false;
    let attempt = 0;
    let timer: ReturnType<typeof setTimeout>;
    let heartbeat: ReturnType<typeof setInterval>;
    async function connect() {
      if (disposed) return;
      try {
        const response = await fetch(`/api/sessions/${id}/status?role=${role}`);
        if (disposed) return;
        if (response.status === 403 || response.status === 410) {
          setError(
            response.status === 410
              ? 'Session ended or expired.'
              : 'Pair this device first.',
          );
          setTerminal(true);
          return;
        }
        if (!response.ok) throw new Error('Session unavailable');
      } catch {
        if (disposed) return;
        setError('Cannot reach the session. Reconnecting…');
        timer = setTimeout(
          () => {
            void connect();
          },
          Math.min(1000 * 2 ** attempt++, 15000),
        );
        return;
      }
      const url = new URL(
        `/api/sessions/${id}/socket?role=${role}`,
        window.location.href,
      );
      url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
      const ws = new WebSocket(url);
      socket.current = ws;
      let lastSeen = Date.now();
      ws.onopen = () => {
        if (disposed) {
          ws.close();
          return;
        }
        attempt = 0;
        setConnected(true);
        setError('');
        heartbeat = setInterval(() => {
          if (Date.now() - lastSeen > 45000) ws.close();
          else if (ws.readyState === WebSocket.OPEN) ws.send('ping');
        }, 15000);
      };
      ws.onmessage = (event) => {
        if (disposed) return;
        lastSeen = Date.now();
        if (event.data === 'pong') return;
        let raw: unknown;
        try {
          raw = JSON.parse(event.data);
        } catch {
          return;
        }
        const parsed = serverMessage.safeParse(raw);
        if (!parsed.success) return;
        const message = parsed.data;
        if (message.type === 'snapshot') setState(message.state);
        if (message.type === 'notes') setNotes(message);
        if (message.type === 'error') setError(message.message);
        callback.current?.(message);
      };
      ws.onclose = (event) => {
        clearInterval(heartbeat);
        if (disposed) return;
        setConnected(false);
        setNotes(null);
        if (event.code === 4000 || event.code === 4001 || event.code === 1008) {
          setError(event.reason || 'Session ended.');
          setTerminal(true);
          return;
        }
        setError(
          'Connection lost. Reconnecting… If the session expired, join again.',
        );
        timer = setTimeout(
          () => {
            void connect();
          },
          Math.min(1000 * 2 ** attempt++, 15000) + Math.random() * 500,
        );
      };
    }
    void connect();
    return () => {
      disposed = true;
      clearTimeout(timer);
      clearInterval(heartbeat);
      socket.current?.close();
      socket.current = null;
      setConnected(false);
    };
  }, [id, role]);
  const send = useCallback((message: ClientMessage) => {
    if (socket.current?.readyState === WebSocket.OPEN) {
      socket.current.send(JSON.stringify(message));
      return true;
    }
    return false;
  }, []);
  return { state, connected, notes, error, terminal, send };
}
