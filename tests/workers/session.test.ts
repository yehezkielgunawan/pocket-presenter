import {
  evictDurableObject,
  runDurableObjectAlarm,
  runInDurableObject,
} from 'cloudflare:test';
import { env, exports } from 'cloudflare:workers';
import { expect, test } from 'vitest';
import type { ServerMessage } from '../../shared/protocol';
import type { SessionState } from '../../shared/session';

declare module 'cloudflare:workers' {
  interface ProvidedEnv extends Env {}
}

const origin = 'https://presenter.test';
async function request(
  path: string,
  method = 'GET',
  body?: object,
  cookie?: string,
) {
  return exports.default.fetch(`${origin}${path}`, {
    method,
    headers: {
      Origin: origin,
      'Content-Type': 'application/json',
      ...(cookie ? { Cookie: cookie } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
}
test('requires host approval before a phone can claim presenter access', async () => {
  const created = await request('/api/sessions', 'POST', {
    fingerprint: 'a'.repeat(64),
    slideCount: 2,
    initialIndex: 0,
  });
  expect(created.status).toBe(201);
  const { sessionId } = (await created.json()) as { sessionId: string };
  const hostCookie = created.headers.get('Set-Cookie')?.split(';')[0];
  const pair = await request(`/api/sessions/${sessionId}/pairings`, 'POST', {
    label: 'Android',
  });
  expect(pair.status).toBe(201);
  const { requestId } = (await pair.json()) as { requestId: string };
  const pendingCookie = pair.headers.get('Set-Cookie')?.split(';')[0];
  expect(
    (
      await request(
        `/api/sessions/${sessionId}/pairings/${requestId}/claim`,
        'POST',
        {},
        pendingCookie,
      )
    ).status,
  ).toBe(202);
  expect(
    (
      await request(
        `/api/sessions/${sessionId}/pairings/${requestId}/approve`,
        'POST',
        {},
      )
    ).status,
  ).toBe(403);
  expect(
    (
      await request(
        `/api/sessions/${sessionId}/pairings/${requestId}/approve`,
        'POST',
        {},
        hostCookie,
      )
    ).status,
  ).toBe(200);
  const claimed = await request(
    `/api/sessions/${sessionId}/pairings/${requestId}/claim`,
    'POST',
    {},
    pendingCookie,
  );
  expect(claimed.status).toBe(200);
  expect(claimed.headers.get('Set-Cookie')).toContain('HttpOnly');
  const presenterCookie =
    claimed.headers.get('Set-Cookie')?.split(';')[0] ?? '';
  const hostResponse = await exports.default.fetch(
    `${origin}/api/sessions/${sessionId}/socket?role=host`,
    {
      headers: {
        Upgrade: 'websocket',
        Origin: origin,
        Cookie: hostCookie ?? '',
      },
    },
  );
  const presenterResponse = await exports.default.fetch(
    `${origin}/api/sessions/${sessionId}/socket?role=presenter`,
    {
      headers: {
        Upgrade: 'websocket',
        Origin: origin,
        Cookie: presenterCookie,
      },
    },
  );
  const host = hostResponse.webSocket;
  const presenter = presenterResponse.webSocket;
  if (!host || !presenter) throw new Error('Missing WebSocket');
  const hostMessages: ServerMessage[] = [];
  const phoneMessages: ServerMessage[] = [];
  host.addEventListener('message', (event) => {
    hostMessages.push(JSON.parse(String(event.data)));
  });
  presenter.addEventListener('message', (event) => {
    phoneMessages.push(JSON.parse(String(event.data)));
  });
  host.accept();
  presenter.accept();
  host.send(JSON.stringify({ type: 'ready', fingerprint: 'a'.repeat(64) }));
  await expect
    .poll(() => hostMessages.find((message) => message.type === 'renderTarget'))
    .toBeDefined();
  const target = hostMessages.find(
    (message) => message.type === 'renderTarget',
  );
  if (target?.type !== 'renderTarget') throw new Error('Missing render target');
  host.send(
    JSON.stringify({
      type: 'renderConfirmed',
      index: target.index,
      revision: target.revision,
    }),
  );
  await expect
    .poll(() => hostMessages.find((message) => message.type === 'requestNotes'))
    .toBeDefined();
  const markdownNote = {
    type: 'notes',
    index: target.index,
    revision: target.revision,
    text: '# Private Markdown\n\n- **Remember**',
    format: 'markdown',
  };
  host.send(
    JSON.stringify({
      ...markdownNote,
      revision: target.revision - 1,
      text: 'Stale Markdown',
    }),
  );
  host.send(JSON.stringify(markdownNote));
  await expect
    .poll(() => phoneMessages.filter((message) => message.type === 'notes'))
    .toEqual([markdownNote]);
  const stored = await runInDurableObject(
    env.SESSIONS.getByName(sessionId),
    async (_instance, ctx) => ctx.storage.get('session'),
  );
  expect(JSON.stringify(stored)).not.toContain('Private Markdown');
  expect(
    (await request(`/api/sessions/${sessionId}`, 'DELETE', {}, hostCookie))
      .status,
  ).toBe(200);
  host.close();
  presenter.close();
});
test('rejects cross-origin creation and public initialization', async () => {
  const response = await exports.default.fetch(`${origin}/api/sessions`, {
    method: 'POST',
    headers: { Origin: 'https://other.test' },
  });
  expect(response.status).toBe(403);
  expect(
    (await request('/api/sessions/AAAAAAAAAAAA/initialize', 'POST', {})).status,
  ).toBe(404);
});

test('ignores stale acknowledgments and persists only confirmed navigation metadata', async () => {
  const created = await request('/api/sessions', 'POST', {
    fingerprint: 'b'.repeat(64),
    slideCount: 3,
    initialIndex: 0,
  });
  const { sessionId } = (await created.json()) as { sessionId: string };
  const cookie = created.headers.get('Set-Cookie')?.split(';')[0] ?? '';
  const socketUrl = `${origin}/api/sessions/${sessionId}/socket?role=host`;
  expect(
    (
      await exports.default.fetch(socketUrl, {
        headers: { Upgrade: 'websocket', Origin: origin },
      })
    ).status,
  ).toBe(403);
  const response = await exports.default.fetch(socketUrl, {
    headers: { Upgrade: 'websocket', Origin: origin, Cookie: cookie },
  });
  expect(response.status).toBe(101);
  const socket = response.webSocket;
  if (!socket) throw new Error('Missing WebSocket');
  const messages: ServerMessage[] = [];
  socket.addEventListener('message', (event) => {
    messages.push(JSON.parse(String(event.data)));
  });
  socket.accept();
  socket.send(JSON.stringify({ type: 'ready', fingerprint: 'b'.repeat(64) }));
  await expect
    .poll(() => messages.find((message) => message.type === 'renderTarget'))
    .toBeDefined();
  const initial = messages.find((message) => message.type === 'renderTarget');
  if (initial?.type !== 'renderTarget')
    throw new Error('Missing render target');
  socket.send(
    JSON.stringify({
      type: 'renderConfirmed',
      index: 0,
      revision: initial.revision,
    }),
  );
  await expect
    .poll(
      () =>
        messages.filter((message) => message.type === 'requestNotes').length,
    )
    .toBe(1);
  const stub = env.SESSIONS.getByName(sessionId);
  socket.send(
    JSON.stringify({ type: 'navigate', commandId: 'next-slide', target: 1 }),
  );
  await expect
    .poll(
      () =>
        messages.filter((message) => message.type === 'renderTarget').length,
    )
    .toBe(2);
  const target = messages
    .filter((message) => message.type === 'renderTarget')
    .at(-1);
  if (target?.type !== 'renderTarget') throw new Error('Missing render target');
  socket.send(
    JSON.stringify({ type: 'renderConfirmed', index: 1, revision: 0 }),
  );
  socket.send(
    JSON.stringify({
      type: 'renderConfirmed',
      index: 1,
      revision: target.revision,
    }),
  );
  await expect
    .poll(
      () =>
        messages.filter((message) => message.type === 'requestNotes').length,
    )
    .toBe(2);
  socket.send(
    JSON.stringify({
      type: 'notes',
      index: 1,
      revision: target.revision,
      text: 'Do not persist this note',
    }),
  );
  const stored = await runInDurableObject(stub, async (_instance, ctx) =>
    ctx.storage.get<{ state: SessionState }>('session'),
  );
  expect(stored?.state.confirmedSlideIndex).toBe(1);
  expect(stored?.state.pending).toBeNull();
  expect(JSON.stringify(stored)).not.toContain('Do not persist');
  socket.send(
    JSON.stringify({
      type: 'notes',
      index: 1,
      revision: target.revision,
      text: '\n'.repeat(16000),
    }),
  );
  socket.send(
    JSON.stringify({
      type: 'navigate',
      commandId: 'escaped-notes-check',
      target: 2,
    }),
  );
  await expect
    .poll(
      () =>
        messages.filter((message) => message.type === 'renderTarget').length,
    )
    .toBe(3);
  await request(`/api/sessions/${sessionId}`, 'DELETE', {}, cookie);
  socket.close();
});

test('recovers metadata after eviction and requires host reconciliation on timeout', async () => {
  const created = await request('/api/sessions', 'POST', {
    fingerprint: 'd'.repeat(64),
    slideCount: 3,
    initialIndex: 1,
  });
  const { sessionId } = (await created.json()) as { sessionId: string };
  const cookie = created.headers.get('Set-Cookie')?.split(';')[0];
  const stub = env.SESSIONS.getByName(sessionId);
  await runInDurableObject(stub, async (_instance, ctx) => {
    const stored = await ctx.storage.get<{ state: SessionState }>('session');
    if (!stored) throw new Error('Missing state');
    stored.state.hostReady = true;
    stored.state.revision = 2;
    stored.state.pending = {
      commandId: 'timeout',
      revision: 2,
      targetSlideIndex: 2,
      deadline: Date.now() - 1,
    };
    await ctx.storage.put('session', stored);
  });
  await evictDurableObject(stub);
  await runDurableObjectAlarm(stub);
  const response = await exports.default.fetch(
    `${origin}/api/sessions/${sessionId}/status?role=host`,
    { headers: { Cookie: cookie ?? '' } },
  );
  expect(await response.json()).toMatchObject({
    confirmedSlideIndex: 1,
    pending: null,
    hostReady: false,
    revision: 3,
  });
  await request(`/api/sessions/${sessionId}`, 'DELETE', {}, cookie);
});

test('expires sessions and deletes their persisted metadata', async () => {
  const created = await request('/api/sessions', 'POST', {
    fingerprint: 'c'.repeat(64),
    slideCount: 2,
    initialIndex: 0,
  });
  const { sessionId } = (await created.json()) as { sessionId: string };
  const stub = env.SESSIONS.getByName(sessionId);
  await runInDurableObject(stub, async (_instance, ctx) => {
    const stored = await ctx.storage.get<{ state: SessionState }>('session');
    if (!stored) throw new Error('Missing state');
    stored.state.expiresAt = Date.now() - 1;
    await ctx.storage.put('session', stored);
  });
  await evictDurableObject(stub);
  await runDurableObjectAlarm(stub);
  expect(
    (await request(`/api/sessions/${sessionId}/pairings`, 'POST', {})).status,
  ).toBe(410);
  expect(
    await runInDurableObject(stub, async (_instance, ctx) =>
      ctx.storage.get('session'),
    ),
  ).toBeUndefined();
});
