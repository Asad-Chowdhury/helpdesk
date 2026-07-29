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
- **Client:** React + TypeScript + Vite, React Router, TanStack Query over axios (see Conventions — no `fetch`), Tailwind CSS v4, shadcn/ui (Base UI primitives, Nova preset), react-hook-form + zod v4. Path alias `@/*` → `client/src/*`.
- **Server:** Express 4 + TypeScript, `cors` configured for the client origin with credentials enabled, PostgreSQL + Prisma 7 (driver adapter `@prisma/adapter-pg`), Better Auth, express-rate-limit.
- **Planned (not yet built):** the `workspaceId`-scoping Prisma Client Extension, magic-link for the Client role, BullMQ + Redis, SendGrid, Anthropic Claude API, Cloudflare R2, Stripe, Docker + Railway.

## Commands

Run each project from its own directory.

**Client** (`cd client`):

- `bun install` — install deps
- `bun run dev` — Vite dev server (http://localhost:5173)
- `bun run build` — typecheck + production build
- `bun run lint` — oxlint
- `bun run test` / `bun run test:components` — component tests, one run (Vitest). Same command; the longer alias exists because the repo also has a Playwright suite in `e2e/`.
- `bun run test:watch` — same, in watch mode
- `bun run test:coverage` — with a v8 coverage report

**Server** (`cd server`):

- `bun install` — install deps
- `bun run dev` — start with watch/reload (http://localhost:3000). Sets `NODE_ENV=development`, which turns rate limiting off and lets Better Auth resolve a local client IP. Note the value is matched verbatim: an unset `NODE_ENV` is treated as production throughout `lib/env.ts`.
- `bun run start` — start without watch. Sets `NODE_ENV=production`, which is what enables the rate limiters.
- `bun run typecheck` — `tsc --noEmit`
- `bun run prisma:migrate` — `prisma migrate dev`. Follow it with `bun run prisma:generate`; the custom `prisma-client` generator output is not always regenerated automatically, and a stale client makes Better Auth fail with "Model user does not exist".
- `bun run auth:generate` — **overwrites `prisma/schema.prisma` entirely.** It would delete `User.memberships` and every domain model. Only run it when adding a Better Auth plugin, and diff the result before keeping it.

**E2E** (`cd e2e`): `bun run test` — Playwright boots both servers itself, on ports 3001/5174 against the `helpdesk_test` database.

## Testing

Two layers, and the split is deliberate — **do not duplicate one in the other.**

| | Component tests (`client/`) | E2E (`e2e/`) |
|---|---|---|
| Stack | Vitest 4 + React Testing Library + jsdom | Playwright, real browser + real servers |
| Answers | does this component render and react correctly | does the whole system actually work |
| HTTP | mocked at the `lib/*` seam | real, against a live API and Postgres |
| Written by | you, directly | the **`e2e-test-writer`** subagent |

Anything needing a real session cookie, real tenant isolation, or a real database belongs in `e2e/`. Anything about rendering, disabled states, form validation, or which call a click produces belongs in a component test — they run in ~2s versus ~18s and fail with a far more precise message.

### Writing component tests

Live beside the component as `<Name>.test.tsx`. `src/pages/UsersPage.test.tsx` is the worked example; copy its shape.

- **Render with `renderWithProviders` from `@/test/render`** — never RTL's bare `render`. It wraps the same provider stack as `main.tsx` (ThemeProvider → QueryClientProvider → MemoryRouter); without it anything using `Link` or `useQuery` throws. It returns a `user` (userEvent) alongside the usual result.
- **Mock at the `lib/*` seam, not at axios.** `vi.mock('@/lib/members', …)` with `importOriginal` spread so real exports (`ROLE_LABELS`, `MembersError`) survive and only the fetchers become `vi.fn()`. Assert on the arguments a click produced (`expect(updateMember).toHaveBeenCalledWith(workspaceId, id, { active: false })`).
- **Give every mock a working default in `beforeEach`** and override per test. `clearMocks: true` is set in `vite.config.ts`, and it is load-bearing: `restoreMocks` alone does **not** clear call history on `vi.fn()`s from a `vi.mock` factory, so a `not.toHaveBeenCalled()` assertion silently sees the previous test's calls.
- **Query by role and accessible name**, scoped with `within(row)` — the same discipline the E2E suite uses. `getByRole('combobox', { name: 'Role for Sam Staff' })`, not a class selector.
- **Reject errors, don't await them:** the test QueryClient sets `retry: false`, so a mocked rejection surfaces at once rather than after back-offs.
- **Base UI needs jsdom polyfills** — `ResizeObserver`, `scrollIntoView`, `matchMedia` are stubbed in `src/test/setup.ts` because Select and Dialog measure themselves on open. A new Base UI primitive that throws on open probably needs another stub there, not a rewritten test.
- **Prove the test can fail.** Break the behaviour deliberately, watch it go red, restore. A component test that passes against broken code is worse than none.
- Never reach for `waitFor` to paper over a missing `find*`; never weaken an assertion to reach green.

## Subagents

Project subagents live in `.claude/agents/`. Agent types are enumerated when a session starts, so a newly added or renamed agent file cannot be invoked until Claude Code is restarted — the Agent tool reports "agent type not found". Don't retry the call; restart, or do the work inline following that agent's instructions.

**`e2e-test-writer` — use this for E2E tests instead of writing specs directly.** Invoke it via the Agent tool whenever the task is to write, extend, or fix Playwright tests, cover a user flow end to end, or reproduce a bug as a failing test. Hand it the user-visible behaviour to cover and let it choose the structure; it already carries this suite's setup (ports, the `_test` database guard, reset semantics, how to provision an authenticated admin) and the conventions tests must follow — role-based locators over CSS, no fixed sleeps, unique data per test, and never weakening an assertion to reach green. When it reports a failure it traced to the application rather than the test, treat that as a real bug and fix the app.

Its instructions in `.claude/agents/e2e-test-writer.md` are the source of truth for **Playwright** conventions — extend that file rather than restating them here. It does not cover component tests; those are written directly, per the Testing section above.

**`security-reviewer`** — read-only audit for tenant-isolation leaks, broken authorization, auth misconfiguration, injection, and secret exposure. Use before deploying or after changes to auth, provisioning, or anything touching `workspaceId`.

## Authentication & tenancy

Better Auth with email/password and **database sessions**. `server/src/lib/auth.ts` is the single instance; it reuses the `prisma` singleton from `lib/prisma.ts` rather than opening a second client.

**Accounts are never created from the public HTTP surface except through `POST /api/signup`.** Better Auth's own `/api/auth/sign-up/email` is disabled (`emailAndPassword.disableSignUp`) because it produces a `User` with no workspace and no role — an account the `workspaceId`-scoping layer has nothing to scope to. `disableSignUp` gates only the public endpoint; server-side creation still works.

`createWorkspaceWithAdmin()` in `server/src/services/workspace.ts` is the **single provisioning path** — workspace, admin user, credential account, `ADMIN` membership and starter categories in one `prisma.$transaction`. `POST /api/signup` wraps it with validation and session issuing; the future seed script and invite flows should call it directly rather than reimplementing it. It writes the `user`/`account` rows with Prisma instead of Better Auth's adapter, because that adapter holds its own client and would not enlist in the transaction; hashing still goes through `ctx.password.hash`, so credentials are identical to a sign-up's.

Roles live on `Membership`, not `User` — one email can hold different roles in different workspaces.

### Authorization

`requireWorkspaceRole(...roles)` in `server/src/middleware/require-workspace-role.ts` is **the tenant boundary**. Chain it after `requireAuth` (`requireAuth, requireWorkspaceRole('ADMIN')`) so a missing session is 401 rather than 403. It resolves the caller's active `Membership` for `req.params.workspaceId` and attaches `req.membership`. Handlers downstream query on `req.params.workspaceId` directly — that is only safe because this ran first, so **any new workspace-scoped route must use it**. Non-members, insufficient roles and unknown workspace ids all get a flat `403 Forbidden`; returning 404 for the last would let a caller enumerate workspace ids. Service functions scope their own lookups by `workspaceId` too, so a membership id from another tenant returns 404 rather than being touched.

`Membership.deactivatedAt` (null = active) is per-workspace, so a person can be active in one and deactivated in another. **`GET /api/me` filters on `deactivatedAt: null` (in `listMyMemberships()`), and that is what makes deactivation take effect** — sessions are not workspace-scoped, so the cookie stays valid, but the workspace disappears from `/api/me` and the client guard plus admin nav go with it. Don't remove that filter.

**Everything user-facing lives in `server/src/modules/users/`** — `users.routes.ts` (`GET`/`PATCH /api/me` plus `/api/workspaces/:workspaceId/users` GET/POST/PATCH/DELETE), `users.service.ts`, and `users.schemas.ts`. `index.ts` mounts `usersRouter` bare; the router registers full paths, matching `signup.ts`. `POST /api/signup` deliberately stays in `routes/` — it provisions a *tenant* (workspace + first admin + categories) and carries its own rate limiter, so it is not user CRUD.

Workspace membership CRUD holds two invariants: a workspace must always keep at least one active ADMIN, and nobody can deactivate themselves.

**Being inside a `$transaction` is not enough to enforce the last-admin rule** — that was a real bug, and it is why `lockWorkspace()` (`SELECT … FOR UPDATE` on the workspace row) runs first in both `updateMemberRole` and `setMemberActive`. Prisma uses Postgres's default READ COMMITTED and `count()` takes no locks, so two transactions demoting *different* admins each still see the other as active and both commit, leaving zero admins — unrecoverable in-app, since every route then fails `requireWorkspaceRole('ADMIN')`. Reproduced at 7/8 concurrent attempts without the lock, 0/8 with it. **Any future check shaped like "count rows, then write" needs the same lock.**

`deleteMember()` is irreversible and **not an unconditional `user.delete`**. One email can hold memberships in several workspaces, so erasing the User row on one workspace admin's say-so would destroy an account another tenant depends on — reaching outside the workspace the request is scoped to. It therefore deletes the membership, and deletes the `User` (cascading Session, Account, Membership) **only when that was the person's last membership**. The response says which happened (`{ deleted: 'account' | 'membership' }`) and the UI reports it. Every account this app creates today has exactly one membership, so the full wipe is the normal path; the other branch is what stops a cross-tenant deletion. Same guards as deactivation — no self-deletion, last active ADMIN must stay — behind the same `lockWorkspace()`, since "count the other admins, then write" is exactly the read-then-write shape READ COMMITTED does not make safe.

`PATCH /api/me` is self-service profile edit (name + email only). **It takes its target from `req.user.id`, never from the body**, so there is no id for a caller to swap — that, not the client-side `RequireAuth` guard, is what stops it becoming "edit anyone". Role is deliberately not editable there: it lives on Membership and is an admin's call. Password changes go to Better Auth's `/api/auth/change-password` (via `authClient.changePassword`, with `revokeOtherSessions: true`), which verifies the current password and hashes with the configured algorithm — don't reimplement either.

`addMember()` is **not an invite**. With no transactional email yet, a new address gets an account immediately and the endpoint returns a one-time `temporaryPassword` for the admin to hand over out of band — it is never stored in plaintext or retrievable again. An address that already has a `User` just gains a membership and keeps its own password. Replace this with a token emailed to the address once SendGrid lands; the rest of the path doesn't change.

Constraints that break things silently if violated:

- **`app.all('/api/auth/*', toNodeHandler(auth))` must be mounted before `express.json()`** (`server/src/index.ts`). Better Auth reads the raw request stream; if the body parser consumes it first, sign-in/sign-up POSTs hang as "pending" with no error. Routes needing a parsed body (like `signupRouter`) mount after it. The bare `*` wildcard is Express 4 syntax — Express 5 needs `/api/auth/*splat`.
- **`session.cookieCache` stays disabled.** That is what makes these database sessions: every request validates against the `session` row, so deleting it revokes a live cookie immediately.
- **Rate limiting is two separate systems, and runs in production only.** Better Auth's own limiter covers `/api/auth/*` (built-in: 3 per 10s on sign-in/sign-up); `express-rate-limit` guards `POST /api/signup` (10 per 15 min). Both are gated on `rateLimitingEnabled` in `server/src/lib/env.ts` — dev, staging and the E2E suite skip them. That flag is written as "not dev/staging/test" rather than `NODE_ENV === 'production'` so a deploy that forgets `NODE_ENV` keeps protection on instead of silently dropping it. Both key on client IP and store in memory, so limits are per-instance until they move to Redis. **Consequence: the limits are never exercised before production** — verify them against a staging deploy with `NODE_ENV=production` before trusting them.
- **State-changing auth requests require an `Origin` header.** That is Better Auth's CSRF check; browsers always send one, but `curl` testing needs `-H 'Origin: http://localhost:5173'` or it returns `403 MISSING_OR_NULL_ORIGIN`.

Server env vars beyond the basics: `BETTER_AUTH_SECRET` (startup throws when missing in production — Better Auth otherwise falls back to a built-in default and signs sessions with a publicly known key), `BETTER_AUTH_URL` (its protocol decides whether cookies get `Secure`, so it must be `https://` in production), and `TRUST_PROXY` (hop count for Express `trust proxy`; 0 locally, typically 1 on Railway — wrong values either collapse rate limiting into one shared bucket or let clients spoof `X-Forwarded-For`).

Client side: `client/src/lib/auth-client.ts` exports `authClient`/`useSession`; `lib/signup.ts` calls the custom endpoint. Pages are `/signup` and `/login` (sharing the `AuthShell` frame), `/profile` for any signed-in user, and the admin-only `/users`. Identity is read through the `['me']` TanStack Query (`lib/me.ts`), not `useSession`. `components/RequireAuth.tsx` gates `/profile` on having a session at all; `components/RequireRole.tsx` is a pathless layout route gating `/users` on ADMIN — it **controls navigation only**; every endpoint behind a guarded page still needs its own `requireWorkspaceRole`. `hasRole()` currently means "holds the role in *any* workspace" because there is no active-workspace concept yet; `UsersPage` picks the first ADMIN membership's workspace for the same reason. Both need re-scoping when a user can meaningfully belong to several.

Open before deploying: `advanced.ipAddress.trustedProxies` on the Better Auth side still needs the real proxy topology.

## Conventions

- **HTTP: axios, never `fetch`.** All calls to our API go through the shared `api` instance exported from `client/src/lib/api.ts` — never `axios` directly, never a bare `fetch`. That instance sets `baseURL` (from `VITE_API_URL`, default `http://localhost:3000`; the client calls the API directly, there is no Vite proxy) and `withCredentials: true`, which is what carries the session cookie cross-origin — a request that bypasses it is silently anonymous. Pass request paths relative (`api.get('/api/me')`).
  Unlike `fetch`, **axios rejects on any non-2xx**, so there is no `res.ok` check: wrap calls in try/catch and run the error through `readApiError(err, fallback)`, which normalises the server's `{ error, fields }` envelope into `{ message, fields, status }` and rethrows anything that isn't an axios error. A status that is a legitimate answer rather than a failure — the 401 from `/api/me` meaning "signed out" — arrives as a thrown error and must be read back off `status` (see `fetchMe`). Better Auth's `authClient` is the one exception: it ships its own fetch layer and is configured separately in `lib/auth-client.ts`.
- **Server state: TanStack Query, always.** Every read is a `useQuery` and every write a `useMutation` — no `useEffect`-plus-`useState` fetching, and no calling the `lib/*` fetchers directly from a component. The `lib/` modules stay plain async functions (no hooks); components consume them through Query. After a successful mutation, invalidate every key the write affects — `['members', workspaceId]` for membership changes, and `['me']` as well whenever the change touches the signed-in user's own role or session, since the navbar and the `RequireRole` guard both read that key. Query keys in use: `['me']` (always with `retry: false` — a 401 is an answer, not a transient failure), `['members', workspaceId]`, `['health']`.
- **Ports:** client `5173`, server `3000`. CORS on the server allows the client origin(s) from `CLIENT_ORIGIN` (comma-separated, default `http://localhost:5173`).
- **Env:** copy each project's `.env.example` to `.env`. Real `.env` files are gitignored; `.env.example` is committed.
- **Secrets:** never commit API keys. `context7-api.txt` at the repo root holds a live key — keep it out of version control.
- **Validation: zod on both sides.** No hand-rolled checks anywhere. On the server every route parses its body with `parseBody(schema, req.body)` and renders failures with `validationErrorBody(err)` — both from `server/src/lib/validation.ts` — which is what keeps the `{ error, fields? }` envelope identical across endpoints. `parseBody` normalises a non-object body (`null`, a string, an array — all valid JSON that `express.json()` passes through) to `{}` so the caller gets "this field is missing" instead of zod's internal "expected object, received null". `validationErrorBody` takes one message per field and prefers field issues over object-level ones, so a schema-level `.refine` (like `updateMemberSchema`'s "Nothing to update") never masks a specific field error. Field schemas shared by more than one route — `emailField`, `personNameField` — live in that same file; route-specific ones live with their module (`modules/users/users.schemas.ts`). Roles come from `z.enum(Role)` against the Prisma-generated const object, so adding a role to the schema needs no second list. Note zod checks *accumulate*: appending `.min(1, …)` to a shared field adds a second check rather than replacing the first, so a route needing its own message spells the field out.
- **Forms:** react-hook-form with `zodResolver`. Schemas live in `client/src/lib/schemas.ts` and are the single source of truth — form value types are inferred from them (`z.infer`), so do not hand-write a parallel input type. Zod v4 API: `z.email()` is top-level (not `z.string().email()`) and custom messages use `{ error: '…' }`, not the deprecated `{ message: '…' }`. Client validation mirrors the server's rules for fast feedback; the server stays the authority, and field errors it returns are pushed onto inputs with `setError`.
- **Styling:** Tailwind utility classes + shadcn tokens. `client/src/index.css` holds only the Tailwind imports and shadcn theme layers (`:root`, `@theme inline`, `.dark`, `@layer base`) — do not reintroduce Vite starter CSS. For theme-aware text prefer `text-foreground` over hardcoded colors.
- Use context7 MCP server to fetch up-to-date documentation for libraries
