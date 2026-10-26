import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { pairingOrigin } from '../shared/network';
import { deckInput } from '../shared/protocol';
import { sessionCode } from './auth';

export { PresentationSession } from './session';

const app = new Hono<{ Bindings: Env }>();
app.use(
  '/api/*',
  bodyLimit({
    maxSize: 4096,
    onError: (c) => c.json({ error: 'Request too large.' }, 413),
  }),
);
app.use('/api/*', async (c, next) => {
  const origin = c.req.header('Origin');
  if (origin && origin !== new URL(c.req.url).origin)
    return c.json({ error: 'Origin not allowed.' }, 403);
  if (
    (c.req.method !== 'GET' ||
      c.req.header('Upgrade')?.toLowerCase() === 'websocket') &&
    !origin
  )
    return c.json({ error: 'Origin required.' }, 403);
  c.header('Cache-Control', 'no-store');
  await next();
});
app.get('/api/network', (c) =>
  c.json({ origin: pairingOrigin(c.req.url, c.env.LOCAL_LAN_HOST ?? '') }),
);
app.post('/api/sessions', async (c) => {
  const parsed = deckInput.safeParse(await c.req.json());
  if (!parsed.success || parsed.data.initialIndex >= parsed.data.slideCount)
    return c.json({ error: 'Invalid deck metadata.' }, 400);
  for (let attempt = 0; attempt < 3; attempt++) {
    const id = sessionCode();
    const response = await c.env.SESSIONS.getByName(id).fetch(
      new Request(new URL(`/api/sessions/${id}/initialize`, c.req.url), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(parsed.data),
      }),
    );
    if (response.status !== 409) return response;
  }
  return c.json({ error: 'Could not allocate a session. Please retry.' }, 503);
});
app.all('/api/sessions/:id/*', (c) => {
  const id = c.req.param('id');
  if (!/^[A-HJ-NP-Z2-9]{12}$/.test(id) || c.req.path.endsWith('/initialize'))
    return c.json({ error: 'Session not found.' }, 404);
  return c.env.SESSIONS.getByName(id).fetch(c.req.raw);
});
app.delete('/api/sessions/:id', (c) => {
  const id = c.req.param('id');
  if (!/^[A-HJ-NP-Z2-9]{12}$/.test(id))
    return c.json({ error: 'Session not found.' }, 404);
  return c.env.SESSIONS.getByName(id).fetch(c.req.raw);
});
app.all('/api/*', (c) => c.json({ error: 'Not found.' }, 404));
app.all('*', (c) => c.env.ASSETS.fetch(c.req.raw));
app.onError((error, c) => {
  if (error instanceof SyntaxError)
    return c.json({ error: 'Invalid JSON.' }, 400);
  console.error(
    JSON.stringify({ message: 'Request failed', error: error.message }),
  );
  return c.json({ error: 'The request failed. Please retry.' }, 500);
});
export default app;
