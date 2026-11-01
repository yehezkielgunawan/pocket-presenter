import { useCallback, useEffect, useRef, useState } from 'react';
import {
  type ClientMessage,
  type ServerMessage,
  type Snapshot,
  serverMessage,
} from '../../../shared/protocol';
import { forgetSession, rememberSession } from './rememberedSession';

export type Notes = Omit<Extract<ServerMessage, { type: 'notes' }>, 'type'>;
export function useSession(
  id: string | null,
  role: 'host' | 'presenter',
  onMessage?: (message: ServerMessage) => void,
) {
  const socket = useRef<WebSocket | null>(null);
  const available = useRef(false);
  const reconnect = useRef<() => void>(() => {});
  const callback = useRef(onMessage);
  callback.current = onMessage;
  const [state, setState] = useState<Snapshot | null>(null);
  const [connected, setConnected] = useState(false);
  const [notes, setNotes] = useState<Notes | null>(null);
  const [error, setError] = useState('');
  const [terminal, setTerminal] = useState(false);
  const [needsPairing, setNeedsPairing] = useState(false);
  useEffect(() => {
    setState(null);
    setNotes(null);
    setError('');
    setTerminal(false);
    setNeedsPairing(false);
    setConnected(false);
    available.current = false;
    if (!id) return;
    const sessionId = id;
    let disposed = false;
    let halted = false;
    let busy = false;
    let generation = 0;
    let attempt = 0;
    let lastSeen = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let deadline: ReturnType<typeof setTimeout> | undefined;
    let probe: ReturnType<typeof setTimeout> | undefined;
    let heartbeat: ReturnType<typeof setInterval> | undefined;
    let request: AbortController | null = null;

    function connectionStatus(value: boolean) {
      available.current = value;
      setConnected(value);
    }
    function discard() {
      generation++;
      busy = false;
      clearTimeout(timer);
      clearTimeout(deadline);
      clearTimeout(probe);
      probe = undefined;
      clearInterval(heartbeat);
      request?.abort();
      request = null;
      const ws = socket.current;
      socket.current = null;
      if (ws) {
        ws.onopen = ws.onclose = ws.onmessage = ws.onerror = null;
        ws.close();
      }
      connectionStatus(false);
    }
    function stop(message: string, forget = false, pair = false) {
      halted = true;
      discard();
      setNotes(null);
      setError(message);
      setTerminal(true);
      setNeedsPairing(pair);
      if (forget && role === 'presenter') forgetSession(sessionId);
    }
    function retry(immediate = false) {
      if (disposed || halted) return;
      discard();
      setState(null);
      setNotes(null);
      setError('Connection lost. Reconnecting…');
      timer = setTimeout(
        () => void connect(),
        immediate
          ? 0
          : Math.min(1000 * 2 ** attempt++, 15000) + Math.random() * 500,
      );
    }
    async function connect() {
      if (disposed || halted || busy || socket.current) return;
      clearTimeout(timer);
      busy = true;
      const current = ++generation;
      const active = () => !disposed && !halted && generation === current;
      request = new AbortController();
      deadline = setTimeout(() => {
        if (active()) retry();
      }, 10000);
      try {
        const response = await fetch(
          `/api/sessions/${id}/status?role=${role}`,
          {
            signal: request.signal,
            credentials: 'same-origin',
            cache: 'no-store',
          },
        );
        if (!active()) return;
        clearTimeout(deadline);
        request = null;
        if (response.status === 403 || response.status === 410) {
          stop(
            response.status === 410
              ? 'Session ended or expired.'
              : 'Pair this device first.',
            true,
            response.status === 403,
          );
          return;
        }
        if (!response.ok) throw new Error('Session unavailable');
        if (role === 'presenter') rememberSession(sessionId);
        const url = new URL(
          `/api/sessions/${id}/socket?role=${role}`,
          window.location.href,
        );
        url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
        const ws = new WebSocket(url);
        socket.current = ws;
        deadline = setTimeout(() => {
          if (active()) retry();
        }, 10000);
        ws.onopen = () => {
          if (!active()) return;
          clearTimeout(deadline);
          busy = false;
          attempt = 0;
          lastSeen = Date.now();
          connectionStatus(true);
          setError('');
          heartbeat = setInterval(() => {
            if (!active()) return;
            if (Date.now() - lastSeen > 45000) retry();
            else if (ws.readyState === WebSocket.OPEN) {
              try {
                ws.send('ping');
              } catch {
                retry();
              }
            }
          }, 15000);
        };
        ws.onmessage = (event) => {
          if (!active()) return;
          lastSeen = Date.now();
          if (event.data === 'pong') {
            if (probe !== undefined) {
              clearTimeout(probe);
              probe = undefined;
              connectionStatus(true);
              setError('');
            }
            return;
          }
          let raw: unknown;
          try {
            raw = JSON.parse(event.data);
          } catch {
            return;
          }
          const parsed = serverMessage.safeParse(raw);
          if (!parsed.success) return;
          const message = parsed.data;
          if (message.type === 'snapshot') {
            setState(message.state);
            if (message.state.status === 'ended') stop('Session ended.', true);
          }
          if (message.type === 'notes') setNotes(message);
          if (message.type === 'error') setError(message.message);
          callback.current?.(message);
        };
        ws.onclose = (event) => {
          if (!active()) return;
          if (
            event.code === 4000 ||
            event.code === 4001 ||
            event.code === 1008
          ) {
            stop(event.reason || 'Session ended.', event.code === 4000);
          } else retry();
        };
        ws.onerror = () => {
          if (active()) retry();
        };
      } catch {
        if (active()) retry();
      }
    }
    function wake() {
      if (disposed || halted || document.visibilityState === 'hidden') return;
      const ws = socket.current;
      if (ws?.readyState === WebSocket.OPEN) {
        if (probe !== undefined) return;
        if (role === 'presenter') connectionStatus(false);
        probe = setTimeout(() => retry(true), 4000);
        try {
          ws.send('ping');
        } catch {
          retry(true);
        }
      } else if (!busy) {
        discard();
        void connect();
      }
    }
    reconnect.current = wake;
    const offline = () => retry();
    window.addEventListener('online', wake);
    window.addEventListener('offline', offline);
    window.addEventListener('pageshow', wake);
    document.addEventListener('visibilitychange', wake);
    void connect();
    return () => {
      disposed = true;
      reconnect.current = () => {};
      window.removeEventListener('online', wake);
      window.removeEventListener('offline', offline);
      window.removeEventListener('pageshow', wake);
      document.removeEventListener('visibilitychange', wake);
      discard();
    };
  }, [id, role]);
  const send = useCallback((message: ClientMessage) => {
    if (available.current && socket.current?.readyState === WebSocket.OPEN) {
      try {
        socket.current.send(JSON.stringify(message));
        return true;
      } catch {
        reconnect.current();
      }
    }
    return false;
  }, []);
  const retry = useCallback(() => reconnect.current(), []);
  return {
    state,
    connected,
    notes,
    error,
    terminal,
    needsPairing,
    send,
    retry,
  };
}
