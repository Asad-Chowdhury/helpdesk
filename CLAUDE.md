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
├── project-scope.md
├── tech-stack.md
└── implementation-plan.md
```

## Tech stack

- **Runtime & package manager:** Bun (both projects). Express runs directly on Bun (no ts-node/tsx).
- **Client:** React + TypeScript + Vite, React Router, TanStack Query, Tailwind CSS v4, shadcn/ui (Base UI primitives, Nova preset). Path alias `@/*` → `client/src/*`.
- **Server:** Express + TypeScript, `cors` configured for the client origin with credentials enabled.
- **Planned (not yet built):** PostgreSQL + Prisma (shared-DB, `workspaceId`-scoped, app-layer tenant isolation via a Prisma Client Extension), Better Auth (session-based, magic-link for the Client role), BullMQ + Redis, SendGrid, Anthropic Claude API, Cloudflare R2, Stripe, Docker + Railway.

## Commands

Run each project from its own directory.

**Client** (`cd client`):

- `bun install` — install deps
- `bun run dev` — Vite dev server (http://localhost:5173)
- `bun run build` — typecheck + production build
- `bun run lint` — oxlint

**Server** (`cd server`):

- `bun install` — install deps
- `bun run dev` — start with watch/reload (http://localhost:3000)
- `bun run start` — start without watch
- `bun run typecheck` — `tsc --noEmit`

## Conventions

- **Client ↔ server:** the client calls the API directly (no Vite proxy) via `API_BASE_URL` in `client/src/lib/api.ts`, driven by the `VITE_API_URL` env var (default `http://localhost:3000`). Fetches use `credentials: 'include'` for cross-origin cookie/session support.
- **Ports:** client `5173`, server `3000`. CORS on the server allows the client origin(s) from `CLIENT_ORIGIN` (comma-separated, default `http://localhost:5173`).
- **Env:** copy each project's `.env.example` to `.env`. Real `.env` files are gitignored; `.env.example` is committed.
- **Secrets:** never commit API keys. `context7-api.txt` at the repo root holds a live key — keep it out of version control.
- **Styling:** Tailwind utility classes + shadcn tokens. `client/src/index.css` holds only the Tailwind imports and shadcn theme layers (`:root`, `@theme inline`, `.dark`, `@layer base`) — do not reintroduce Vite starter CSS. For theme-aware text prefer `text-foreground` over hardcoded colors.
- Use context7 MCP server to fetch up-to-date documentation for libraries
