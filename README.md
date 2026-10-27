# Pocket Presenter

Present a PowerPoint or PDF on your computer and control it from your phone, with private speaker notes and a confirmed slide counter. Built with React, Rsbuild, DaisyUI's **corporate** theme, and Cloudflare Workers + Durable Objects.

## How it works

1. Open the site on your computer and choose a `.pptx` or presentation `.pdf` file.
2. For a PDF presentation, choose a Markdown notes file (`.md` or `.markdown`). Separate each slide's notes with `---` on its own line.
3. Review the rendered slides and notes preview. The selected files are parsed locally; they are not uploaded.
4. Select **Connect your phone**.
5. Scan the QR code or open `/join` on your phone and enter the displayed code.
6. Approve the phone on the computer.
7. Enter fullscreen on the computer. Use Previous/Next on the phone while reading your notes.

Both devices need internet, but do not need the same Wi-Fi network. A slide number is confirmed only after the computer's browser reports rendering that slide. This does not verify a physical projector's output.

### Markdown notes for PDF presentations

Write UTF-8 Markdown with sections in slide order:

```markdown
# Introduction
- Welcome everyone
- Explain the **goal**

---

# Background
Key context for the second slide.

---

---

# Demo
Notes for the fourth slide. The third section is intentionally blank.
```

Section 1 follows PDF page 1, section 2 follows page 2, and so on. Notes always follow the active slide, including backward navigation and jumps. You do not need the same number of notes sections as PDF pages: missing or empty sections show “No speaker notes for this slide.” Extra sections are accepted and ignored. A trailing separator adds an empty section.

The PC preview and phone render headings, lists, emphasis, links, and code. A separator inside a fenced code block stays part of the code. Only a line containing exactly `---` (with up to three leading spaces and optional trailing spaces or tabs) splits sections; use `***` for a horizontal rule within a section. The separator convention takes precedence over Markdown front matter and setext heading underlines, so use `#` headings instead.

## Local development

Use Node.js 24+ and pnpm 12.4.1 (pinned in `package.json`). Dependency install scripts are allowed only for `esbuild` and `workerd` in `pnpm-workspace.yaml`.

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

- **Rstest + jsdom:** React UI, relationship-based PPTX notes extraction, Markdown notes parsing and rendering, slide mapping, fingerprints, protocol validation, and navigation state transitions. jsdom is used because the PPTX notes parser requires namespace-aware XML DOM behavior.
- **Vitest + Cloudflare's Workers plugin:** real Worker/Durable Object APIs, pairing permissions, WebSocket acknowledgments, persisted recovery, and expiry.
- **Playwright:** production-built renderer, separate computer and phone browser contexts, pairing approval, notes synchronization, keyboard navigation, refresh recovery, fullscreen, and responsive layouts.

`pnpm run check` and `pnpm run format` modify files. `pnpm run lint` is non-writing.

## Continuous integration

[CI](https://github.com/yehezkielgunawan/pocket-presenter/actions/workflows/ci.yml) runs for pull requests targeting `main` and pushes to `main`. It installs dependencies with a frozen lockfile, checks lint/formatting and frontend/Worker types, runs unit/component tests and Worker integration tests, then builds the app and validates Worker packaging without deploying.

Browser tests remain available locally through `pnpm run test:browser`; they are not required by the base CI workflow.

## Deploy to Cloudflare Workers

Production URL: **https://remote-presenter.yehezgun.com**.

### Manual GitHub deployment

The [Deploy to Cloudflare](https://github.com/yehezkielgunawan/pocket-presenter/actions/workflows/deploy.yml) workflow runs only when manually dispatched, and its deployment job runs only for the `main` branch. Pushes and pull requests never deploy automatically. The workflow reruns lint, type checks, and unit/Worker tests before building and deploying.

Add these [repository Actions secrets](https://github.com/yehezkielgunawan/pocket-presenter/settings/secrets/actions) before the first deployment:

| Secret | Value |
| --- | --- |
| `CLOUDFLARE_API_TOKEN` | A Cloudflare API token authorized to deploy Workers and manage the custom domain in the `yehezgun.com` zone. Start with the **Edit Cloudflare Workers** token template, scoped to the correct account and zone. |
| `CLOUDFLARE_ACCOUNT_ID` | The Cloudflare account ID that owns the Worker and domain zone. |

Then open **Actions → Deploy to Cloudflare → Run workflow**, select **main**, and run it. The workflow records the deployment in the GitHub `production` environment.

`wrangler.jsonc` declares `remote-presenter.yehezgun.com` as a Worker Custom Domain. The `yehezgun.com` zone must already be active in the deploying Cloudflare account. Cloudflare provisions the hostname's DNS and TLS on deployment; no origin server is needed. An existing conflicting CNAME for that hostname must be removed before the first deployment. Staging explicitly has no production custom-domain route.

### Local CLI deployment

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

- PPTX bytes, presentation PDFs, Markdown notes files, and rendered slides remain in the computer's browser memory.
- Session metadata includes a SHA-256 deck fingerprint, slide count, revision, and confirmed/pending indexes.
- Only current speaker notes are relayed through the Worker to the approved phone. Notes are not written to Durable Object storage or application logs.
- Session codes identify rooms; they do not grant control. The host approves pairing, and role credentials use HttpOnly, same-site cookies (Secure on HTTPS).
- One host and one presenter connection are active per session. A replacement connection supersedes the old one.
- Commands are bounded and deduplicated. Stale acknowledgments cannot advance confirmed state.
- A failed or timed-out render disables remote navigation until the host resumes.
- Sessions expire after 24 hours. Ending or expiring a session deletes its persisted metadata.
- After refreshing the computer, reselect the exact original presentation file and, for PDFs, its original Markdown notes file to resume. Files are not saved in browser storage; only the session identifier is kept in sessionStorage.
- PPTX notes are plain text; PDF notes are Markdown with raw HTML disabled and unsafe link protocols filtered. External slide media is blocked; embedded media remains subject to renderer support.

## Presentation compatibility

PPTX files render with `@aiden0z/pptx-renderer`; PDF files render with PDF.js. PDF speaker notes come from a separate Markdown file, with `---` sections mapped to the same-numbered PDF page. Both presentation renderers and the Markdown renderer run in the browser.

PPTX playback supports static slides, not PowerPoint animation or transition playback. Fonts, SmartArt, charts, equations, and advanced effects can differ from PowerPoint. Embedded PDF-based media fallbacks are disabled in this MVP.

Always preview your actual deck before presenting. Automated browser tests use a generated fixture, not a guarantee of fidelity for arbitrary presentations.

Limits: each selected file can be up to 32 MB; presentations support 1–500 slides; PPTX files allow 4,000 archive entries and 2 MB per extracted XML part; notes are limited to 16,000 characters per slide or mapped Markdown section. Extra Markdown sections beyond the presentation's page count are ignored. Hidden PPTX slides are included in presentation order. PPTX notes are associated through XML relationships, not numeric filenames.

## Structure

```text
src/features/deck/       Local PPTX/PDF readers, notes extraction, and renderers
src/features/host/       Computer setup and fullscreen audience stage
src/features/remote/     Pairing form, notes, and mobile navigation
src/features/session/    HTTP and reconnecting WebSocket clients
shared/                 Runtime-validated messages and session transitions
worker/                 Hono API, authorization, and session Durable Object
tests/                  Unit, component, runtime, and browser tests
```
