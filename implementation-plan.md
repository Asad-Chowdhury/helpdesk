# Implementation Plan

Based on `project-scope.md` (MVP scope) and `tech-stack.md` (stack decisions). Grouped into 8 phases in build order — each phase mostly depends on the ones before it. A few tasks are blocked on open questions from the other two docs; those are called out inline.

Note: two MVP features didn't have an obvious slot in this 8-phase structure — **Stripe billing** is folded into Phase 3 (since seat-cap enforcement ties directly to agent management), and the **Knowledgebase** + **Client portal** are folded into Phases 5 and 4 respectively (since they're mostly AI work and ticket-viewing UI). Flag if you'd rather any of these get their own phase.

---

## Phase 1: Project Setup

**Scaffolding, database, Prisma schema, admin seed**

- [x] Set up two standalone projects (no monorepo): `client/` (React+Vite) and `server/` (Express), each with its own Bun install and `.gitignore`
- [x] Scaffold React + TypeScript + Vite app; add React Router, TanStack Query, Tailwind, ShadCN/UI
- [x] Scaffold Express + TypeScript app, run directly on Bun
- [ ] Set up Prisma with PostgreSQL, initial connection + migration workflow
- [ ] Set up Redis (for BullMQ, used from Phase 4 onward)
- [ ] Write separate Dockerfiles for `client/` and `server/` + a `docker-compose.yml` at the root for local dev (Postgres, Redis, both services)
- [ ] Environment variable/secrets structure per service
- [ ] Basic CI: lint, typecheck, build on push
- [ ] Provision Railway project (staging) with Postgres + Redis addons
- [ ] Design Prisma schema: `Workspace`, `User`, `Role`, `Category`, `Ticket`, `Comment`, `InternalNote`, `Attachment`, `Deliverable`, `ActivityLog`, `SLAConfig` — every tenant-scoped table carries `workspaceId`
- [ ] Build a Prisma Client Extension/wrapper that auto-scopes queries by `workspaceId` — build and test this before any feature work depends on it; it's the primary defense against cross-tenant data leaks
- [ ] Seed script: bootstrap a sample Workspace + Admin account + sample categories/tickets for local dev
- [ ] Cross-tenant isolation test harness, running in CI from day one

---

## Phase 2: Authentication

**Login, sessions, route protection**

- [ ] Integrate Better Auth in Express (Prisma adapter, session-based)
- [ ] Email/password login for Admin/Manager/Staff
- [ ] Magic-link plugin wired up for the Client role
- [ ] Self-service signup flow: creates a new Workspace + its first Admin account, and applies the Marketing Team template defaults (see Phase 4)
- [ ] Session/cookie config: `app.` / `api.` subdomains on the same root domain, `SameSite=Lax`
- [ ] Auth middleware (Express): validate session, attach user + workspace context to the request
- [ ] Frontend route protection: protected-route wrapper, redirect unauthenticated users to login
- [ ] Logout and session-expiry handling

---

## Phase 3: User Management

**Admin CRUD for agents, role-based access**

- [x] Admin CRUD for agents (Manager/Staff): add, edit role, deactivate/reactivate — `/users` page + `/api/workspaces/:workspaceId/users`. **"Invite" is not an invite yet:** with no transactional email, adding a member creates the account immediately and returns a one-time temporary password for the Admin to pass on. Swap in a token + email once SendGrid lands (Phase 6).
- [ ] Enforce the plan's team-member seat cap on invite — resolve the block-vs-upgrade-prompt open question first
- [ ] Client invitations: Admin invites a Client, default "watcher" permission, optional per-client "raise ticket" grant
- [x] Role-based access control middleware: `requireWorkspaceRole(...roles)` covers per-route checks on workspace-scoped routes. Per-*action* checks (the exceptions below) still to come.
- [ ] Enforce the specific permission exceptions: priority override is Admin-only; category/SLA edits are Admin/Manager; ticket status transitions are Staff/Manager
- [ ] Workspace settings page (name, branding basics)
- [ ] Stripe subscription tied to the workspace: flat tier gated on team-member count, upgrade/downgrade flow, Stripe customer portal

---

## Phase 4: Ticket CRUD

**Core ticketing operations, list/detail pages with filtering**

- [ ] Ticket category CRUD (admin-only), including an SLA-timeframe field per category
- [ ] Define and seed the Marketing Team template defaults (default categories, form schemas, status/priority config, SLA values) that get applied to every new workspace on signup
- [ ] Dynamic form builder: field types, required-field validation, conditional fields; store schema as JSON per category
- [ ] Public form renderer (unauthenticated) + submission endpoint
- [ ] Internal form renderer (authenticated)
- [ ] File upload: presigned URL to Cloudflare R2, attach to ticket
- [ ] Draft requests (save incomplete submissions, resume later)
- [ ] Basic CSV import of existing backlog at onboarding
- [ ] Unified ticket list/queue page: search, filters, sorting, bulk actions, activity history
- [ ] Ticket detail page: comments, internal notes, attachments, deliverables
- [ ] Fixed ticket statuses (Requested/Open/Resolved/Closed), transitions restricted to Staff/Manager, no renaming in MVP
- [ ] Manual assignment
- [ ] Basic automatic routing rules (category → default assignee/team)
- [ ] Priority field: 5 levels (Low/Normal/Medium/High/Urgent), manual override restricted to Admin
- [ ] SLA setup UI: Admin sets a timeframe per category
- [ ] BullMQ job: periodic SLA-deadline check per open ticket, auto priority escalation — resolve the escalation-threshold and "impact on requester" open questions before building the scoring logic
- [ ] Client-facing ticket view (magic-link portal): live status, comments, deliverable download, request history, "raise ticket" flow gated by the client's permission

---

## Phase 5: AI Features

**Claude API integration for AI-powered work**

- [ ] Claude API client/service layer in Express
- [ ] AI intake assistant (helps requester complete the form at submission time)
- [ ] AI categorization/classification of incoming tickets (feeds Phase 4's priority + routing)
- [ ] AI ticket summaries (condense thread/history for quick staff review)
- [ ] AI-suggested brief and replies for staff
- [ ] Knowledgebase data capture: per resolved ticket, store brief, deliverables, completion time/delay breakdown, FAQ/resolution notes
- [ ] pgvector-based similarity search over past resolved tickets in the same category
- [ ] Requester-facing suggestion surfaced at intake based on similar past tickets — accept the cold-start limitation (no useful suggestions until enough history exists per category)

---

## Phase 6: Email Integration

**Inbound webhook to create tickets, outbound replies, threading**

- [ ] SendGrid Inbound Parse webhook → create ticket from email
- [ ] Resolve inbound email addressing (dedicated per-workspace address vs. shared address + routing) — open question in `project-scope.md`
- [ ] Email threading: unique reply-to token per ticket so replies append to the same ticket instead of creating duplicates
- [ ] SPF/DKIM/DMARC configured on the sending domain
- [ ] AI-drafted initial reply sent on ticket creation via email
- [ ] BullMQ job: scheduled AI follow-up emails, timed off each category's SLA
- [ ] Email notifications for status changes, comments, and assignment

---

## Phase 7: Dashboard

**Stats overview, category breakdown, quick filters**

- [ ] Stats overview: request volume, throughput, cycle time, time in status
- [ ] Category breakdown view
- [ ] SLA performance, bottleneck analysis
- [ ] Quick filters (status, priority, category, assignee)
- [ ] CSV export

---

## Phase 8: Polish and Deployment

**Validation, error handling, Docker**

- [ ] Form validation hardening (client + server)
- [ ] Consistent API error shape; frontend error boundaries/toasts
- [ ] Cross-tenant isolation test pass, revisited against the full feature surface built by this point
- [ ] End-to-end golden-path test: submit → triage → assign → resolve → close, across web form, email intake, and the magic-link portal
- [ ] SLA escalation and follow-up email timing verified against real category configs
- [ ] Docker production build hardening
- [ ] Railway staging → production deploy pipeline, with a rollback plan
- [ ] Onboarding walkthrough using the Marketing Team template defaults, end-to-end
