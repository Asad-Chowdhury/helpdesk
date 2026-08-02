import { auth } from '../lib/auth'
import { prisma } from '../lib/prisma'

/// Starter categories applied to every new workspace. Phase 4 replaces this with the
/// full Marketing Team template (form schemas, status/priority config, SLA values).
const DEFAULT_CATEGORIES = ['Design', 'Copywriting', 'Web', 'Video']

export class EmailTakenError extends Error {
  constructor() {
    super('An account with that email already exists')
    this.name = 'EmailTakenError'
  }
}

export type CreateWorkspaceInput = {
  workspaceName: string
  name: string
  email: string
  password: string
}

function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)
}

/**
 * Slugs a workspace may not have, because the slug is also its inbound email local part
 * (`<slug>@MAIL_DOMAIN` — see modules/email/addressing.ts).
 *
 * Two groups, and both matter:
 *   - **Mail infrastructure names.** `postmaster` and `abuse` are mandated by RFC 2142 and
 *     must reach a human, not a ticket queue. `mailer-daemon` and `bounces` receive
 *     delivery failures, which would otherwise loop back in as tickets.
 *   - **Names we mint ourselves.** `reply` is the prefix of every threading address
 *     (`reply+<token>@`), so a workspace called "Reply" would collide with the reply
 *     router. The rest are reserved against future use (`www`, `api`, `app`) and against
 *     confusion (`admin`, `support`, `no-reply`).
 *
 * This has to be enforced *before* any slug becomes a published address: retro-fixing it
 * means renaming a live workspace's inbound address, which breaks every thread already
 * pointing at it.
 */
const RESERVED_SLUGS = new Set([
  'reply',
  'no-reply',
  'noreply',
  'postmaster',
  'abuse',
  'mailer-daemon',
  'bounces',
  'bounce',
  'admin',
  'support',
  'help',
  'www',
  'api',
  'app',
  'mail',
  'workspace',
])

/**
 * Resolves a slug that is free *right now*. This is advisory only — the check and the
 * insert can't be atomic, so the unique constraint on workspace.slug stays the real
 * guarantee and the caller retries when it loses the race.
 *
 * `randomise` skips straight to a suffixed candidate, used on retry so a concurrent
 * signup with the same workspace name doesn't just collide again.
 *
 * A reserved base is suffixed rather than rejected: the workspace *name* is fine, it is
 * only the derived address that would clash, and failing someone's signup because they
 * called their company "Support" would be absurd.
 */
async function resolveSlug(name: string, randomise = false): Promise<string> {
  const slugged = slugify(name) || 'workspace'
  const base = RESERVED_SLUGS.has(slugged) ? `${slugged}-team` : slugged

  if (randomise) return `${base}-${crypto.randomUUID().slice(0, 8)}`

  if (!(await prisma.workspace.findUnique({ where: { slug: base } }))) return base

  for (let n = 2; n <= 20; n++) {
    const candidate = `${base}-${n}`
    if (!(await prisma.workspace.findUnique({ where: { slug: candidate } }))) return candidate
  }

  return `${base}-${crypto.randomUUID().slice(0, 8)}`
}

/**
 * Prisma's unique-constraint violation (P2002), narrowed to the field that collided.
 *
 * Where the field name lives depends on how Prisma reached the database. The classic
 * engine puts it in `meta.target`; the Prisma 7 driver adapter this project uses
 * reports it under `meta.driverAdapterError.cause.constraint.fields` instead. Both are
 * checked, with the raw Postgres message as a last resort, so this keeps working if
 * the adapter setup changes.
 */
export function uniqueViolationOn(err: unknown, field: string): boolean {
  const e = err as {
    code?: string
    meta?: {
      target?: unknown
      driverAdapterError?: {
        cause?: { constraint?: { fields?: unknown }; originalMessage?: string }
      }
    }
  }
  if (e?.code !== 'P2002') return false

  const target = e.meta?.target
  if (Array.isArray(target) && target.includes(field)) return true
  if (typeof target === 'string' && target.includes(field)) return true

  const cause = e.meta?.driverAdapterError?.cause
  const fields = cause?.constraint?.fields
  if (Array.isArray(fields) && fields.includes(field)) return true

  return typeof cause?.originalMessage === 'string' && cause.originalMessage.includes(field)
}

const MAX_SLUG_ATTEMPTS = 3

export type AuthContext = Awaited<typeof auth.$context>

/**
 * Better Auth returns `false` from generateId when it is configured to let the
 * database assign ids. Neither user.id nor account.id has a Prisma default, so
 * produce one ourselves in that case.
 */
export function newId(ctx: AuthContext, model: 'user' | 'account'): string {
  const id = ctx.generateId({ model })
  return typeof id === 'string' ? id : crypto.randomUUID()
}

/**
 * Provisions a brand-new tenant: workspace, its first Admin, and starter categories.
 *
 * Everything happens in one transaction so a failure can't leave a user without a
 * workspace — an account the workspaceId-scoping layer would have nothing to scope to.
 *
 * The user and credential-account rows are written directly rather than through
 * Better Auth's adapter, because that adapter holds its own Prisma client and would
 * not enlist in this transaction. Hashing still goes through Better Auth
 * (`ctx.password.hash`), so the stored credential is identical to a sign-up's.
 *
 * This is the single provisioning path: POST /api/signup wraps it with HTTP
 * validation and session issuing, and the dev seed script calls it directly.
 */
export async function createWorkspaceWithAdmin(input: CreateWorkspaceInput) {
  const email = input.email.trim().toLowerCase()
  const ctx = await auth.$context

  // Hash BEFORE the existence check, deliberately, so hashing cost is not one of the
  // things that differs between a taken and a free address. Do not "optimise" this by
  // skipping the hash when the email is already known.
  //
  // Note this does NOT make the two paths take equal time today — a free address goes
  // on to run the whole provisioning transaction and is measurably slower. That gap is
  // unavoidable while the responses differ anyway (409 vs 201), and closing it only
  // matters once the responses are made identical. This ordering is what makes that
  // future change effective rather than cosmetic.
  const hashedPassword = await ctx.password.hash(input.password)

  // TODO: this 409 tells an unauthenticated caller whether an address has an account.
  // The real fix needs email: respond as if signup succeeded and notify the address
  // instead. Blocked on transactional email (SendGrid) — see implementation-plan.md.
  // Equalising the work on both paths has to land in the same change.
  if (await prisma.user.findUnique({ where: { email } })) {
    throw new EmailTakenError()
  }

  const userId = newId(ctx, 'user')

  // The pre-checks above narrow the common cases; these retries handle the rest. Two
  // concurrent signups can pass the same checks and then race on insert, and without
  // this the loser would get a 500 for what is really "pick another slug".
  for (let attempt = 1; ; attempt++) {
    const slug = await resolveSlug(input.workspaceName, attempt > 1)

    try {
      return await prisma.$transaction(async (tx) => {
        const workspace = await tx.workspace.create({
          data: { name: input.workspaceName.trim(), slug },
        })

        const user = await tx.user.create({
          data: { id: userId, name: input.name.trim(), email, emailVerified: false },
        })

        await tx.account.create({
          data: {
            id: newId(ctx, 'account'),
            accountId: userId, // for the credential provider Better Auth uses the user id
            providerId: 'credential',
            userId,
            password: hashedPassword,
          },
        })

        await tx.membership.create({
          data: { userId, workspaceId: workspace.id, role: 'ADMIN' },
        })

        await tx.category.createMany({
          data: DEFAULT_CATEGORIES.map((name) => ({ workspaceId: workspace.id, name })),
        })

        return { workspace, user }
      })
    } catch (err) {
      // Lost the race on email — report it the same way the pre-check does, so a
      // concurrent duplicate signup gets 409 rather than 500.
      if (uniqueViolationOn(err, 'email')) throw new EmailTakenError()

      if (uniqueViolationOn(err, 'slug') && attempt < MAX_SLUG_ATTEMPTS) continue

      throw err
    }
  }
}
