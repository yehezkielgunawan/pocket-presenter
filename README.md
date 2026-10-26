# Pocket Presenter

Open a PowerPoint on your computer and control it from your phone, with private speaker notes and a confirmed slide counter. Built with React, Rsbuild, DaisyUI's **corporate** theme, and Cloudflare Workers + Durable Objects.

## How it works

1. Open the site on your computer and choose a `.pptx` file.
2. Review the rendered slides. The file is parsed and rendered locally; it is not uploaded.
3. Select **Connect your phone**.
4. Scan the QR code or open `/join` on your phone and enter the displayed code.
5. Approve the phone on the computer.
6. Enter fullscreen on the computer. Use Previous/Next on the phone while reading your notes.

Both devices need internet, but do not need the same Wi-Fi network. A slide number is confirmed only after the computer's browser reports rendering that slide. This does not verify a physical projector's output.

## Local development

Use Node.js 22.12+ (Node 24 recommended) and pnpm. Dependency install scripts are allowed only for `esbuild` and `workerd` in `pnpm-workspace.yaml`.

```sh
pnpm install
pnpm run types
pnpm run dev:full
```

This builds the frontend and serves the full app through a local Worker, with local Durable Object storage. The server listens on `0.0.0.0` and prints both the localhost URL and your computer's detected LAN IPv4 URL, for example:

```text
Pocket Presenter local: http://localhost:8787
Pocket Presenter LAN:   http://192.168.18.130:8787
```

Open either URL on the computer. Pairing QR codes and links use the LAN address even when the computer page is opened through localhost. On the phone, use the LAN URL, not localhost, and connect both devices to the same Wi-Fi network. Allow incoming connections through your computer's firewall if prompted.

If detection selects the wrong adapter (for example, with multiple networks), override it:

```sh
LAN_IP=192.168.18.130 pnpm run dev:full
```

Replace that example with your computer's current address. You can also set `PORT` to change the full-stack development port. Restart the development server after changing networks or updating these settings.

For frontend hot reload, run these in separate terminals:

```sh
pnpm run dev:worker
pnpm run dev
```

Open `http://localhost:3000` or the computer's LAN address on port 3000. Rsbuild also listens on `0.0.0.0` and proxies `/api` and WebSockets to the local Worker on port 8787. The Worker needs `dist/` to exist, so run `pnpm run build` once first.

Local HTTP LAN origins are not secure browser contexts. Command IDs use `crypto.getRandomValues()`, and deck fingerprints fall back to a browser-local SHA-256 implementation when Web Crypto digest is unavailable. This supports phone navigation and opening decks over the exposed IP without browser flags. Production should use the deployed HTTPS site; local HTTP traffic is unencrypted.

## Checks

```sh
pnpm run types
pnpm run typecheck
pnpm run lint
pnpm run test
pnpm run test:workers
pnpm exec playwright install chromium
pnpm run test:browser
pnpm run deploy:dry
```

- **Rstest + jsdom:** React UI, relationship-based notes extraction, protocol validation, and navigation state transitions. jsdom is used because the notes parser requires namespace-aware XML DOM behavior.
- **Vitest + Cloudflare's Workers plugin:** real Worker/Durable Object APIs, pairing permissions, WebSocket acknowledgments, persisted recovery, and expiry.
- **Playwright:** production-built renderer, separate computer and phone browser contexts, pairing approval, notes synchronization, keyboard navigation, refresh recovery, fullscreen, and responsive layouts.

`pnpm run check` and `pnpm run format` modify files. `pnpm run lint` is non-writing.

## Deploy to Cloudflare Workers

```sh
pnpm exec wrangler login
pnpm run types
pnpm run deploy:dry
pnpm run deploy
```

For an isolated staging Worker:

```sh
pnpm run deploy:staging
```

`wrangler.jsonc` contains the static asset configuration, SPA fallback, API routing, Durable Object binding, SQLite migration, and staging binding. No R2, D1, external conversion API, container, or application secret is required. Cloudflare account limits and Durable Object usage still apply.

Deployment publishes the application; it does not upload presentation files. The deployment commands are explicit and are not run automatically by tests.

## Privacy and session behavior

- PPTX bytes, slide media, and rendered slides remain in the computer's browser memory.
- Session metadata includes a SHA-256 deck fingerprint, slide count, revision, and confirmed/pending indexes.
- Only current speaker notes are relayed through the Worker to the approved phone. Notes are not written to Durable Object storage or application logs.
- Session codes identify rooms; they do not grant control. The host approves pairing, and role credentials use HttpOnly, same-site cookies (Secure on HTTPS).
- One host and one presenter connection are active per session. A replacement connection supersedes the old one.
- Commands are bounded and deduplicated. Stale acknowledgments cannot advance confirmed state.
- A failed or timed-out render disables remote navigation until the host resumes.
- Sessions expire after 24 hours. Ending or expiring a session deletes its persisted metadata.
- After refreshing the computer, reselect the exact original file to resume. Files are not saved in browser storage; only the session identifier is kept in sessionStorage.
- Notes are plain text. External slide media is blocked; embedded media remains subject to renderer support.

## Presentation compatibility

The browser renderer is `@aiden0z/pptx-renderer`, isolated behind `src/features/deck/renderer.ts`. This MVP supports static slides, not PowerPoint animation or transition playback. Fonts, SmartArt, charts, equations, and advanced effects can differ from PowerPoint. Embedded PDF-based media fallbacks are disabled in this MVP.

Always preview your actual deck before presenting. Automated browser tests use a generated fixture, not a guarantee of fidelity for arbitrary presentations.

Limits: 32 MB input, 1–500 slides, 4,000 archive entries, 2 MB per extracted XML part, 16,000 characters of notes per slide, and bounded renderer decompression. Hidden slides are included in presentation order. Notes are associated through XML relationships, not numeric filenames.

## Structure

```text
src/features/deck/       Local ZIP/XML notes parser and renderer adapter
src/features/host/       Computer setup and fullscreen audience stage
src/features/remote/     Pairing form, notes, and mobile navigation
src/features/session/    HTTP and reconnecting WebSocket clients
shared/                 Runtime-validated messages and session transitions
worker/                 Hono API, authorization, and session Durable Object
tests/                  Unit, component, runtime, and browser tests
```
