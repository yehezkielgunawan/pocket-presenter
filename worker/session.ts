import { DurableObject } from 'cloudflare:workers';
import { generateCookie } from 'hono/cookie';
import {
  clientMessage,
  deckInput,
  type ServerMessage,
  type Snapshot,
} from '../shared/protocol';
import {
  confirm,
  createState,
  failRender,
  navigate,
  type SessionState,
} from '../shared/session';
import { cookieName, hash, matches, token } from './auth';

type Role = 'host' | 'presenter';
interface Connection {
  role: Role;
  active: boolean;
  windowStart: number;
  count: number;
}
interface Pairing {
  id: string;
  label: string;
  proof: Uint8Array;
  approved: boolean;
  expiresAt: number;
}
interface Stored {
  state: SessionState;
  hostHash: Uint8Array;
  presenterHash?: Uint8Array;
  pairings: Pairing[];
  pairWindow: number;
  pairCount: number;
}

export class PresentationSession extends DurableObject<Env> {
  private stored: Stored | undefined;
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.blockConcurrencyWhile(async () => {
      this.stored = await ctx.storage.get<Stored>('session');
    });
    ctx.setWebSocketAutoResponse(
      new WebSocketRequestResponsePair('ping', 'pong'),
    );
  }
  private sockets(role?: Role) {
    return this.ctx.getWebSockets().filter((ws) => {
      const attachment = ws.deserializeAttachment() as Connection;
      return (
        attachment.active &&
        ws.readyState === WebSocket.OPEN &&
        (!role || attachment.role === role)
      );
    });
  }
  private send(message: ServerMessage, role?: Role) {
    for (const ws of this.sockets(role)) {
      try {
        ws.send(JSON.stringify(message));
      } catch {
        ws.close(1011, 'Reconnect');
      }
    }
  }
  private snapshot(): Snapshot {
    const { recentCommands: _, ...state } = this.requireStored().state;
    return {
      ...state,
      hostConnected: this.sockets('host').length > 0,
      presenterConnected: this.sockets('presenter').length > 0,
    };
  }
  private broadcast() {
    this.send({ type: 'snapshot', state: this.snapshot() });
  }
  private requireStored() {
    if (!this.stored) throw new Error('Missing session');
    return this.stored;
  }
  private async save() {
    const stored = this.requireStored();
    await this.ctx.storage.put('session', stored);
    await this.ctx.storage.setAlarm(
      Math.min(
        stored.state.expiresAt,
        stored.state.pending?.deadline ?? Infinity,
      ),
    );
  }
  private cookie(request: Request, role: string) {
    const name = cookieName(this.requireStored().state.sessionId, role);
    return (
      request.headers
        .get('Cookie')
        ?.split(';')
        .map((item) => item.trim())
        .find((item) => item.startsWith(`${name}=`))
        ?.slice(name.length + 1) ?? ''
    );
  }
  private cookieHeader(
    request: Request,
    role: string,
    value: string,
    maxAge = 86400,
  ) {
    const id = this.requireStored().state.sessionId;
    return generateCookie(cookieName(id, role), value, {
      httpOnly: true,
      sameSite: 'Strict',
      secure: new URL(request.url).protocol === 'https:',
      path: `/api/sessions/${id}`,
      maxAge,
    });
  }
  private json(data: object, status = 200, cookie?: string) {
    return Response.json(data, {
      status,
      headers: {
        'Cache-Control': 'no-store',
        ...(cookie ? { 'Set-Cookie': cookie } : {}),
      },
    });
  }
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const body = request.body ? await request.json() : {};
    const pieces = url.pathname.split('/');
    const action = pieces[4];
    if (action === 'initialize' && request.method === 'POST') {
      if (this.stored) return this.json({ error: 'Session exists.' }, 409);
      const data = deckInput.parse(body);
      const credential = token();
      this.stored = {
        state: createState(
          pieces[3],
          data.fingerprint,
          data.slideCount,
          data.initialIndex,
        ),
        hostHash: await hash(credential),
        pairings: [],
        pairCount: 0,
        pairWindow: Date.now(),
      };
      this.stored.state.hostReady = false;
      await this.save();
      return this.json(
        { sessionId: pieces[3] },
        201,
        this.cookieHeader(request, 'host', credential),
      );
    }
    if (
      !this.stored ||
      this.stored.state.status === 'ended' ||
      Date.now() >= this.stored.state.expiresAt
    )
      return this.json({ error: 'Session ended or not found.' }, 410);
    const stored = this.stored;
    const isHost = await matches(this.cookie(request, 'host'), stored.hostHash);
    if (action === 'status' && request.method === 'GET') {
      const role = url.searchParams.get('role');
      const allowed =
        role === 'host'
          ? isHost
          : role === 'presenter' &&
            (await matches(
              this.cookie(request, 'presenter'),
              stored.presenterHash,
            ));
      return allowed
        ? this.json(this.snapshot())
        : this.json({ error: 'Pair this device first.' }, 403);
    }
    if (action === 'pairings' && request.method === 'POST') {
      stored.pairings = stored.pairings.filter(
        (pair) => pair.expiresAt > Date.now(),
      );
      const requestId = pieces[5];
      const operation = pieces[6];
      if (!requestId) {
        if (Date.now() - stored.pairWindow > 60000) {
          stored.pairCount = 0;
          stored.pairWindow = Date.now();
        }
        if (++stored.pairCount > 10 || stored.pairings.length >= 5) {
          await this.save();
          return this.json(
            { error: 'Too many pairing requests. Try again in a minute.' },
            429,
          );
        }
        const data = body as { label?: unknown };
        const proof = token();
        const pair: Pairing = {
          id: crypto.randomUUID(),
          label:
            typeof data.label === 'string' ? data.label.slice(0, 40) : 'Phone',
          proof: await hash(proof),
          approved: false,
          expiresAt: Date.now() + 120000,
        };
        stored.pairings.push(pair);
        await this.save();
        this.send(
          { type: 'pairing', requestId: pair.id, label: pair.label },
          'host',
        );
        return this.json(
          { requestId: pair.id },
          201,
          this.cookieHeader(request, 'pair', proof, 120),
        );
      }
      const pair = stored.pairings.find((item) => item.id === requestId);
      if (!pair)
        return this.json(
          { error: 'Pairing expired or declined. Join again.' },
          410,
        );
      if (operation === 'approve' || operation === 'reject') {
        if (!isHost)
          return this.json({ error: 'Host permission required.' }, 403);
        if (operation === 'approve') pair.approved = true;
        else stored.pairings = stored.pairings.filter((item) => item !== pair);
        await this.save();
        return this.json({ ok: true });
      }
      if (operation === 'claim') {
        if (!(await matches(this.cookie(request, 'pair'), pair.proof)))
          return this.json({ error: 'Invalid pairing proof.' }, 403);
        if (!pair.approved) return this.json({ pending: true }, 202);
        const credential = token();
        stored.presenterHash = await hash(credential);
        stored.pairings = stored.pairings.filter((item) => item !== pair);
        this.replaceConnections('presenter');
        await this.save();
        return this.json(
          { sessionId: stored.state.sessionId },
          200,
          this.cookieHeader(request, 'presenter', credential),
        );
      }
    }
    if (
      action === 'socket' &&
      request.headers.get('Upgrade')?.toLowerCase() === 'websocket'
    ) {
      const role = url.searchParams.get('role');
      if (
        (role !== 'host' && role !== 'presenter') ||
        (role === 'host'
          ? !isHost
          : !(await matches(
              this.cookie(request, 'presenter'),
              stored.presenterHash,
            )))
      )
        return this.json({ error: 'Pair this device first.' }, 403);
      this.replaceConnections(role);
      if (role === 'host') {
        stored.state = {
          ...stored.state,
          hostReady: false,
          pending: null,
          revision: stored.state.revision + 1,
        };
        await this.save();
      }
      const pair = new WebSocketPair();
      this.ctx.acceptWebSocket(pair[1]);
      pair[1].serializeAttachment({
        role,
        active: true,
        windowStart: Date.now(),
        count: 0,
      } satisfies Connection);
      this.broadcast();
      if (role === 'host') {
        for (const item of stored.pairings.filter(
          (item) => item.expiresAt > Date.now() && !item.approved,
        ))
          this.send(
            { type: 'pairing', requestId: item.id, label: item.label },
            'host',
          );
      } else if (stored.state.hostReady && !stored.state.pending)
        this.send(
          {
            type: 'requestNotes',
            index: stored.state.confirmedSlideIndex,
            revision: stored.state.revision,
          },
          'host',
        );
      return new Response(null, { status: 101, webSocket: pair[0] });
    }
    if (request.method === 'DELETE' && !action) {
      if (!isHost)
        return this.json({ error: 'Host permission required.' }, 403);
      await this.end();
      return this.json({ ok: true });
    }
    return this.json({ error: 'Not found.' }, 404);
  }
  private replaceConnections(role: Role) {
    for (const ws of this.sockets(role)) {
      const attachment = ws.deserializeAttachment() as Connection;
      ws.serializeAttachment({ ...attachment, active: false });
      ws.close(4001, 'Connected in another tab');
    }
  }
  async webSocketMessage(ws: WebSocket, raw: string | ArrayBuffer) {
    const attachment = ws.deserializeAttachment() as Connection;
    if (
      !attachment.active ||
      !this.stored ||
      this.stored.state.status === 'ended'
    )
      return;
    if (Date.now() >= this.stored.state.expiresAt) {
      await this.end();
      return;
    }
    if (typeof raw !== 'string' || raw.length > 128000) {
      ws.close(1009, 'Message too large');
      return;
    }
    if (Date.now() - attachment.windowStart > 1000) {
      attachment.windowStart = Date.now();
      attachment.count = 0;
    }
    attachment.count++;
    ws.serializeAttachment(attachment);
    if (attachment.count > 30) {
      ws.close(1008, 'Too many commands');
      return;
    }
    let input: unknown;
    try {
      input = JSON.parse(raw);
    } catch {
      ws.send(JSON.stringify({ type: 'error', message: 'Invalid message.' }));
      return;
    }
    const parsed = clientMessage.safeParse(input);
    if (!parsed.success) {
      ws.send(JSON.stringify({ type: 'error', message: 'Invalid message.' }));
      return;
    }
    const message = parsed.data;
    const stored = this.stored;
    const state = stored.state;
    if (message.type !== 'navigate' && attachment.role !== 'host') {
      ws.send(
        JSON.stringify({ type: 'error', message: 'Host permission required.' }),
      );
      return;
    }
    if (message.type === 'ready') {
      if (message.fingerprint !== state.fingerprint) {
        ws.send(
          JSON.stringify({
            type: 'error',
            message: 'Select the original presentation to resume.',
          }),
        );
        return;
      }
      const revision = state.revision + 1;
      stored.state = {
        ...state,
        hostReady: false,
        revision,
        pending: {
          revision,
          targetSlideIndex: state.confirmedSlideIndex,
          commandId: crypto.randomUUID(),
          deadline: Date.now() + 15000,
        },
      };
      await this.save();
      this.broadcast();
      this.send(
        { type: 'renderTarget', index: state.confirmedSlideIndex, revision },
        'host',
      );
    } else if (message.type === 'navigate') {
      if (!this.sockets('host').length || !state.hostReady) {
        ws.send(
          JSON.stringify({
            type: 'error',
            message: 'Waiting for the PC to be ready.',
          }),
        );
        return;
      }
      const next = navigate(
        state,
        message.commandId,
        message.target,
        Date.now(),
      );
      if (next === state) {
        this.broadcast();
        return;
      }
      stored.state = next;
      await this.save();
      this.broadcast();
      this.send(
        {
          type: 'renderTarget',
          index: message.target,
          revision: next.revision,
        },
        'host',
      );
    } else if (message.type === 'renderConfirmed') {
      const next = confirm(state, message.index, message.revision);
      if (next === state) return;
      stored.state = next;
      await this.save();
      this.broadcast();
      this.send(
        { type: 'requestNotes', index: message.index, revision: next.revision },
        'host',
      );
    } else if (message.type === 'renderFailed') {
      stored.state = failRender(state, message.revision);
      await this.save();
      this.broadcast();
      this.send({
        type: 'error',
        message: 'The PC could not display this slide. Resume from the PC.',
      });
    } else if (
      message.type === 'notes' &&
      state.hostReady &&
      !state.pending &&
      message.revision === state.revision &&
      message.index === state.confirmedSlideIndex
    )
      this.send(message, 'presenter');
  }
  async webSocketClose(ws: WebSocket) {
    await this.disconnected(ws);
  }
  async webSocketError(ws: WebSocket) {
    await this.disconnected(ws);
  }
  private async disconnected(ws: WebSocket) {
    const attachment = ws.deserializeAttachment() as Connection;
    if (!attachment.active || !this.stored) return;
    ws.serializeAttachment({ ...attachment, active: false });
    if (attachment.role === 'host') {
      this.stored.state = {
        ...this.stored.state,
        hostReady: false,
        pending: null,
        revision: this.stored.state.revision + 1,
      };
      await this.save();
    }
    this.broadcast();
  }
  private async end() {
    const stored = this.requireStored();
    stored.state = {
      ...stored.state,
      status: 'ended',
      pending: null,
      hostReady: false,
    };
    stored.pairings = [];
    stored.presenterHash = undefined;
    await this.ctx.storage.deleteAll();
    this.broadcast();
    for (const ws of this.sockets()) ws.close(4000, 'Session ended');
  }
  async alarm() {
    if (!this.stored) return;
    if (Date.now() >= this.stored.state.expiresAt) {
      await this.end();
      return;
    }
    if (
      this.stored.state.pending &&
      Date.now() >= this.stored.state.pending.deadline
    ) {
      this.stored.state = failRender(
        this.stored.state,
        this.stored.state.pending.revision,
      );
      await this.save();
      this.send({
        type: 'error',
        message: 'Slide confirmation timed out. Resume from the PC.',
      });
      this.broadcast();
      return;
    }
    await this.save();
  }
}
