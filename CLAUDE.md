# CLAUDE.md

Guidance for working in this repository.

## Documentation — use Context7

Whenever a task involves a library, framework, SDK, API, CLI tool, or cloud service — even well-known ones like React, Express, Prisma, Tailwind, TanStack Query, or Vite — **fetch current docs via the Context7 MCP server** (`resolve-library-id` then `query-docs`) before writing or changing code against that library. Do this even when you think you know the answer; training data may lag behind recent releases. Prefer Context7 over web search for library documentation.

Do not use Context7 for: refactoring, writing scripts from scratch, debugging business logic, code review, or general programming concepts.

## Project overview

Multi-tenant SaaS helpdesk / request-management platform. First market is in-house marketing & creative teams; the engine is intended to stay industry-agnostic. See `project-scope.md` (MVP scope + decisions), `tech-stack.md` (stack decisions), and `implementation-plan.md` (phased build plan).

## Structure — two standalone projects

This is **not** a monorepo. `client/` and `server/` are fully independent — each has its own `package.json`, `bun.lock`, `node_modules`, and `.gitignore`, and is installed, run, and deployed on its own. There is no shared-types package; the frontend and backend are treated separately.

```
Helpdesk/
├── client/   # React + Typescript + Vite (port 5173)
├── server/   # Express + typescript + Bun (Port 3000)
├── e2e/      # Playwright — boots both, owns the test database
├── project-scope.md
├── tech-stack.md
└── implementation-plan.md
```

## Tech stack

- **Runtime & package manager:** Bun (both projects). Express runs directly on Bun (no ts-node/tsx).
- **Client:** React + TypeScript + Vite, React Router, TanStack Query, Tailwind CSS v4, shadcn/ui (Base UI primitives, Nova preset), react-hook-form + zod v4. Path alias `@/*` → `client/src/*`.
- **Server:** Express 4 + TypeScript, `cors` configured for the client origin with credentials enabled, PostgreSQL + Prisma 7 (driver adapter `@prisma/adapter-pg`), Better Auth, express-rate-limit.
- **Planned (not yet built):** the `workspaceId`-scoping Prisma Client Extension, magic-link for the Client role, BullMQ + Redis, SendGrid, Anthropic Claude API, Cloudflare R2, Stripe, Docker + Railway.

## Commands

Run each project from its own directory.

**Client** (`cd client`):

- `bun install` — install deps
- `bun run dev` — Vite dev server (http://localhost:5173)
- `bun run build` — typecheck + production build
- `bun run lint` — oxlint

**Server** (`cd server`):

- `bun install` — install deps
- `bun run dev` — start with watch/reload (http://localhost:3000). Sets `NODE_ENV=development`, which turns rate limiting off and lets Better Auth resolve a local client IP. Note the value is matched verbatim: an unset `NODE_ENV` is treated as production throughout `lib/env.ts`.
- `bun run start` — start without watch. Sets `NODE_ENV=production`, which is what enables the rate limiters.
- `bun run typecheck` — `tsc --noEmit`
- `bun run prisma:migrate` — `prisma migrate dev`. Follow it with `bun run prisma:generate`; the custom `prisma-client` generator output is not always regenerated automatically, and a stale client makes Better Auth fail with "Model user does not exist".
- `bun run auth:generate` — **overwrites `prisma/schema.prisma` entirely.** It would delete `User.memberships` and every domain model. Only run it when adding a Better Auth plugin, and diff the result before keeping it.

**E2E** (`cd e2e`):

- `bun install` then `bunx playwright install chromium` — one-time
- `bun run db:setup` — create `helpdesk_test` if missing and apply migrations
- `bun run test` / `test:ui` / `test:headed` — Playwright boots both servers itself

The suite runs against `helpdesk_test` on ports **3001/5174**, offset from the dev ports so a running dev environment is untouched. `support/test-db.ts` refuses any `TEST_DATABASE_URL` whose database name doesn't end in `_test` — it truncates every table, so that guard is what stands between a typo and your dev data. `resetDatabase()` discovers tables from the catalog rather than a hard-coded list, so it can't silently miss new ones.

The test server runs with `NODE_ENV=test`, which leaves both rate limiters off (see `rateLimitingEnabled`) and lets Better Auth resolve a local client IP. Without that, the built-in 3-sign-ins-per-10s rule would fail any suite authenticating more than twice, since every request shares one address.

## Authentication & tenancy

Better Auth with email/password and **database sessions**. `server/src/lib/auth.ts` is the single instance; it reuses the `prisma` singleton from `lib/prisma.ts` rather than opening a second client.

**Accounts are never created from the public HTTP surface except through `POST /api/signup`.** Better Auth's own `/api/auth/sign-up/email` is disabled (`emailAndPassword.disableSignUp`) because it produces a `User` with no workspace and no role — an account the `workspaceId`-scoping layer has nothing to scope to. `disableSignUp` gates only the public endpoint; server-side creation still works.

`createWorkspaceWithAdmin()` in `server/src/services/workspace.ts` is the **single provisioning path** — workspace, admin user, credential account, `ADMIN` membership and starter categories in one `prisma.$transaction`. `POST /api/signup` wraps it with validation and session issuing; the future seed script and invite flows should call it directly rather than reimplementing it. It writes the `user`/`account` rows with Prisma instead of Better Auth's adapter, because that adapter holds its own client and would not enlist in the transaction; hashing still goes through `ctx.password.hash`, so credentials are identical to a sign-up's.

Roles live on `Membership`, not `User` — one email can hold different roles in different workspaces.

Constraints that break things silently if violated:

- **`app.all('/api/auth/*', toNodeHandler(auth))` must be mounted before `express.json()`** (`server/src/index.ts`). Better Auth reads the raw request stream; if the body parser consumes it first, sign-in/sign-up POSTs hang as "pending" with no error. Routes needing a parsed body (like `signupRouter`) mount after it. The bare `*` wildcard is Express 4 syntax — Express 5 needs `/api/auth/*splat`.
- **`session.cookieCache` stays disabled.** That is what makes these database sessions: every request validates against the `session` row, so deleting it revokes a live cookie immediately.
- **Rate limiting is two separate systems, and runs in production only.** Better Auth's own limiter covers `/api/auth/*` (built-in: 3 per 10s on sign-in/sign-up); `express-rate-limit` guards `POST /api/signup` (10 per 15 min). Both are gated on `rateLimitingEnabled` in `server/src/lib/env.ts` — dev, staging and the E2E suite skip them. That flag is written as "not dev/staging/test" rather than `NODE_ENV === 'production'` so a deploy that forgets `NODE_ENV` keeps protection on instead of silently dropping it. Both key on client IP and store in memory, so limits are per-instance until they move to Redis. **Consequence: the limits are never exercised before production** — verify them against a staging deploy with `NODE_ENV=production` before trusting them.
- **State-changing auth requests require an `Origin` header.** That is Better Auth's CSRF check; browsers always send one, but `curl` testing needs `-H 'Origin: http://localhost:5173'` or it returns `403 MISSING_OR_NULL_ORIGIN`.

Server env vars beyond the basics: `BETTER_AUTH_SECRET` (startup throws when missing in production — Better Auth otherwise falls back to a built-in default and signs sessions with a publicly known key), `BETTER_AUTH_URL` (its protocol decides whether cookies get `Secure`, so it must be `https://` in production), and `TRUST_PROXY` (hop count for Express `trust proxy`; 0 locally, typically 1 on Railway — wrong values either collapse rate limiting into one shared bucket or let clients spoof `X-Forwarded-For`).

Client side: `client/src/lib/auth-client.ts` exports `authClient`/`useSession`; `lib/signup.ts` calls the custom endpoint. Pages are `/signup` and `/login`, sharing the `AuthShell` frame. Protected routes and a route guard do not exist yet.

Open before deploying: `advanced.ipAddress.trustedProxies` on the Better Auth side still needs the real proxy topology.

## Conventions

- **Client ↔ server:** the client calls the API directly (no Vite proxy) via `API_BASE_URL` in `client/src/lib/api.ts`, driven by the `VITE_API_URL` env var (default `http://localhost:3000`). Fetches use `credentials: 'include'` for cross-origin cookie/session support.
- **Ports:** client `5173`, server `3000`. CORS on the server allows the client origin(s) from `CLIENT_ORIGIN` (comma-separated, default `http://localhost:5173`).
- **Env:** copy each project's `.env.example` to `.env`. Real `.env` files are gitignored; `.env.example` is committed.
- **Secrets:** never commit API keys. `context7-api.txt` at the repo root holds a live key — keep it out of version control.
- **Forms:** react-hook-form with `zodResolver`. Schemas live in `client/src/lib/schemas.ts` and are the single source of truth — form value types are inferred from them (`z.infer`), so do not hand-write a parallel input type. Zod v4 API: `z.email()` is top-level (not `z.string().email()`) and custom messages use `{ error: '…' }`, not the deprecated `{ message: '…' }`. Client validation mirrors the server's rules for fast feedback; the server stays the authority, and field errors it returns are pushed onto inputs with `setError`.
- **Styling:** Tailwind utility classes + shadcn tokens. `client/src/index.css` holds only the Tailwind imports and shadcn theme layers (`:root`, `@theme inline`, `.dark`, `@layer base`) — do not reintroduce Vite starter CSS. For theme-aware text prefer `text-foreground` over hardcoded colors.
- Use context7 MCP server to fetch up-to-date documentation for libraries
