# Tech Stack

## Frontend

- **React** + **TypeScript**, bundled with **Vite**
- **React Router** for client-side routing
- **TanStack Query** for calling the Express API (caching, loading/error states, mutations), over **axios** as the HTTP client — one configured instance carries `withCredentials` for the session cookie. No bare `fetch`.
- **Tailwind CSS** + **ShadCN/UI**
- Pure client-side SPA — no server of its own, just a static build

## Backend

- **Express** + **TypeScript**, run directly on **Bun** (no ts-node/tsx needed) — separate service from the React app
- **Better Auth** — session-based auth (not JWT); Prisma adapter; magic-link plugin covers the Client/Requester passwordless flow; organization plugin is the foundation for multi-tenancy/workspaces. Mounted on the Express side since it needs direct DB access.
- Frontend and API run on subdomains of the same root domain (e.g. `app.yourdomain.com` / `api.yourdomain.com`) so the Better Auth session cookie works with `SameSite=Lax` instead of needing full cross-origin cookie config.

## Database

- **PostgreSQL** + **Prisma ORM**
- Multi-tenancy: shared database, `tenant_id`-scoped. No native Row-Level Security (not on Supabase), so tenant isolation is enforced at the application layer via a Prisma Client Extension/middleware wrapper — every query must be tenant-scoped by construction, not by convention.
- **pgvector** extension — powers similarity search for the Knowledgebase & Suggestions feature (matching new tickets against past resolved tickets in the same category)

## Background Jobs

- **BullMQ + Redis** — drives SLA escalation checks and scheduled follow-up emails; natural fit since Express is already a persistent Node process.

## Email

- **SendGrid** — Inbound Parse webhook for email-to-ticket; transactional send for AI-drafted replies, scheduled follow-ups, and notifications.
- SPF/DKIM/DMARC must be configured on the sending domain regardless of provider — deliverability is a trust issue for a support-ticket product, not a cosmetic one.
- Mailgun was considered as an alternative; either works, SendGrid was chosen for docs/community maturity.

## AI

- **Anthropic Claude API** — categorization/classification, ticket summaries, suggested briefs/replies, and knowledgebase matching.

## File Storage

- **Cloudflare R2** (S3-compatible) — attachments and deliverables. Uploads use presigned URLs so large files bypass the Express server.

## Billing

- **Stripe** — flat per-workspace pricing tiers, gated on internal team-member count.

## Containerization & Hosting

- **Docker** — separate Dockerfiles: `client/` builds the Vite static assets (served by a static web server or a CDN/static host), `server/` runs the Express API. The two ship and scale as independent containers, consistent with the standalone project structure.
- **Railway** — hosts the server container plus managed Postgres and a Redis addon. Chosen for low ops overhead while validating the product.
  - The client (static build) can be served by its own container on Railway, or pushed to a static host (e.g. Cloudflare Pages) for CDN-edge delivery — decide per deployment; nothing in the codebase couples the two.
  - Migration to **AWS** (ECS/Fargate, RDS, ElastiCache) is a deliberate later step, only if a concrete trigger shows up — real scale, an enterprise customer requiring VPC isolation/compliance, or cost optimization at volume. Containerizing now keeps that migration contained.
- Postgres stays a **managed** service (Railway's Postgres addon, or RDS/Neon later) — never self-run in a container in production.

## Project Structure

- **Two standalone projects** under the repo root — `client/` (React + Vite) and `server/` (Express) — each with its own `package.json`, `bun.lock`, `node_modules`, and `.gitignore`. No monorepo/workspace layer: frontend and backend are developed, installed, and deployed independently.
- **Bun** is the package manager and runtime for both. Vite handles the React dev server/build (run via Bun); Bun's own bundler was not adopted.
- No shared-types package. The frontend and backend are treated separately; the small number of shared request/response shapes are defined independently on each side. Revisit a shared contract (e.g. a generated client from an OpenAPI spec, or a shared package) only if type drift between the two becomes a real problem.

---

## Open Items

- **Better Auth maturity**: newer/less battle-tested than Auth.js or a hosted provider — expect some API churn; its organization plugin's role model won't map 1:1 to Admin/Manager/Staff/Client, so custom authorization logic still sits on top.
- **Tenant-scoping enforcement**: the Prisma extension/wrapper approach needs to be built and tested carefully early — a single missed tenant filter on a future endpoint is a cross-tenant data leak, not a cosmetic bug.
- **Public form SSR trade-off**: the public intake forms (unauthenticated external submitters) lose Next.js-style server rendering now that the frontend is a pure SPA — first paint is blank until JS loads. Likely a minor cost for a B2B tool, but a real regression worth watching, not a free change.
- **SendGrid vs Mailgun**: not a hard requirement either way; revisit if deliverability issues surface.
- **Railway vs AWS**: intentionally deferred; revisit only when a concrete scale/compliance/cost trigger appears.
