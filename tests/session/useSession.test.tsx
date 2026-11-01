import { afterEach, beforeEach, expect, rs, test } from '@rstest/core';
import { act, cleanup, renderHook } from '@testing-library/react';
import type { Snapshot } from '../../shared/protocol';
import { createState } from '../../shared/session';
import {
  readRememberedSession,
  rememberSession,
} from '../../src/features/session/rememberedSession';
import { useSession } from '../../src/features/session/useSession';

const id = 'ABCDEFGH2345';
const fetchMock = rs.fn<typeof fetch>();
class Socket {
  static OPEN = 1;
  static instances: Socket[] = [];
  readyState = 0;
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onclose: ((event: { code: number; reason: string }) => void) | null = null;
  onerror: (() => void) | null = null;
  send = rs.fn();
  close = rs.fn(() => {
    this.readyState = 3;
  });
  constructor(_url: URL) {
    Socket.instances.push(this);
  }
  open() {
    this.readyState = 1;
    this.onopen?.();
  }
  message(message: unknown) {
    this.onmessage?.({
      data: typeof message === 'string' ? message : JSON.stringify(message),
    });
  }
  disconnect(code = 1006) {
    this.readyState = 3;
    this.onclose?.({
      code,
      reason: code === 4001 ? 'Connected in another tab' : '',
    });
  }
}
const snapshot: Snapshot = {
  ...createState(id, 'a'.repeat(64), 3, 1),
  hostConnected: true,
  presenterConnected: true,
};
async function settle() {
  await act(async () => {
    await Promise.resolve();
  });
}
async function start(role: 'presenter' | 'host' = 'presenter') {
  const hook = renderHook(() => useSession(id, role));
  await settle();
  const ws = Socket.instances[Socket.instances.length - 1];
  if (!ws) throw new Error('Expected a session socket');
  act(() => ws.open());
  return { ...hook, ws };
}
beforeEach(() => {
  rs.useFakeTimers();
  rs.stubGlobal('fetch', fetchMock);
  rs.stubGlobal('WebSocket', Socket);
  fetchMock.mockReset().mockResolvedValue(new Response('{}'));
  Socket.instances = [];
});
afterEach(() => {
  cleanup();
  rs.useRealTimers();
  rs.unstubAllGlobals();
  localStorage.clear();
});

test('remembers approved phone access but never host access', async () => {
  const phone = await start();
  expect(readRememberedSession()).toBe(id);
  phone.unmount();
  localStorage.clear();
  await start('host');
  expect(readRememberedSession()).toBeNull();
});

test('retries immediately when the network returns, with only one attempt', async () => {
  const { ws } = await start();
  act(() => ws.disconnect());
  act(() => {
    window.dispatchEvent(new Event('online'));
    window.dispatchEvent(new Event('online'));
  });
  await settle();
  expect(fetchMock).toHaveBeenCalledTimes(2);
  expect(Socket.instances).toHaveLength(2);
});

test('waking a live phone checks liveness without replacing the socket', async () => {
  const { ws, result } = await start();
  act(() => ws.message({ type: 'snapshot', state: snapshot }));
  act(() => window.dispatchEvent(new Event('pageshow')));
  expect(ws.send).toHaveBeenCalledWith('ping');
  expect(result.current.connected).toBe(false);
  act(() => ws.message('pong'));
  expect(result.current.connected).toBe(true);
  expect(Socket.instances).toHaveLength(1);
});

test('a suspended socket that fails its wake probe is replaced promptly', async () => {
  const { ws } = await start();
  act(() => document.dispatchEvent(new Event('visibilitychange')));
  await act(async () => {
    await rs.advanceTimersByTimeAsync(5000);
  });
  expect(ws.close).toHaveBeenCalled();
  expect(Socket.instances).toHaveLength(2);
});

test('a displaced tab never reconnects on online, visibility, or retry', async () => {
  const { ws, result } = await start();
  act(() => ws.disconnect(4001));
  act(() => {
    window.dispatchEvent(new Event('online'));
    window.dispatchEvent(new Event('pageshow'));
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await act(async () => {
    await rs.advanceTimersByTimeAsync(60000);
  });
  expect(result.current.terminal).toBe(true);
  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(readRememberedSession()).toBe(id);
});

test.each([403, 410])(
  'forgets rejected access on status %s',
  async (status) => {
    rememberSession(id);
    fetchMock.mockResolvedValue(new Response('{}', { status }));
    const hook = renderHook(() => useSession(id, 'presenter'));
    await settle();
    expect(hook.result.current.terminal).toBe(true);
    expect(readRememberedSession()).toBeNull();
    expect(Socket.instances).toHaveLength(0);
  },
);

test('bounds stalled status requests and cancels them on unmount', async () => {
  fetchMock.mockImplementation(
    (_url, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () =>
          reject(new Error('Aborted')),
        );
      }),
  );
  const hook = renderHook(() => useSession(id, 'presenter'));
  const signal = fetchMock.mock.calls[0][1]?.signal;
  await act(async () => {
    await rs.advanceTimersByTimeAsync(10000);
  });
  expect(signal?.aborted).toBe(true);
  await act(async () => {
    await rs.advanceTimersByTimeAsync(2000);
  });
  expect(fetchMock).toHaveBeenCalledTimes(2);
  const nextSignal = fetchMock.mock.calls[1][1]?.signal;
  hook.unmount();
  expect(nextSignal?.aborted).toBe(true);
});

test('bounds socket establishment and ignores callbacks from obsolete sockets', async () => {
  const hook = renderHook(() => useSession(id, 'presenter'));
  await settle();
  const old = Socket.instances[0];
  const staleOpen = old.onopen;
  const staleMessage = old.onmessage;
  await act(async () => {
    await rs.advanceTimersByTimeAsync(12000);
  });
  expect(old.close).toHaveBeenCalled();
  expect(Socket.instances).toHaveLength(2);
  act(() => {
    staleOpen?.();
    staleMessage?.({
      data: JSON.stringify({ type: 'snapshot', state: snapshot }),
    });
  });
  expect(hook.result.current.connected).toBe(false);
  expect(hook.result.current.state).toBeNull();
});

test('drops offline navigation instead of replaying it on reconnect', async () => {
  const { ws, result } = await start();
  act(() => ws.disconnect());
  expect(
    result.current.send({ type: 'navigate', commandId: 'offline', target: 2 }),
  ).toBe(false);
  act(() => window.dispatchEvent(new Event('online')));
  await settle();
  act(() => Socket.instances[1].open());
  expect(Socket.instances[1].send).not.toHaveBeenCalled();
});

test('reconnection clears old slide state until a fresh snapshot arrives', async () => {
  const { ws, result } = await start();
  act(() => ws.message({ type: 'snapshot', state: snapshot }));
  expect(result.current.state).not.toBeNull();
  act(() => ws.disconnect());
  act(() => window.dispatchEvent(new Event('online')));
  await settle();
  act(() => Socket.instances[1].open());
  expect(result.current.state).toBeNull();
});

test('going offline disables controls immediately even if the socket still looks open', async () => {
  const { ws, result } = await start();
  act(() => window.dispatchEvent(new Event('offline')));
  expect(result.current.connected).toBe(false);
  expect(ws.close).toHaveBeenCalled();
  expect(
    result.current.send({ type: 'navigate', commandId: 'offline', target: 2 }),
  ).toBe(false);
});

test('waking the PC keeps its render confirmations available during the probe', async () => {
  const { ws, result } = await start('host');
  act(() => window.dispatchEvent(new Event('pageshow')));
  expect(result.current.connected).toBe(true);
  expect(
    result.current.send({ type: 'renderConfirmed', index: 1, revision: 0 }),
  ).toBe(true);
  expect(ws.send).toHaveBeenCalledWith(
    JSON.stringify({ type: 'renderConfirmed', index: 1, revision: 0 }),
  );
});
