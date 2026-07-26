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
 * Resolves a free slug for `name`. Runs before the transaction, so the unique
 * constraint on workspace.slug remains the real guarantee — this only avoids
 * colliding with slugs that already exist.
 */
async function resolveSlug(name: string): Promise<string> {
  const base = slugify(name) || 'workspace'

  if (!(await prisma.workspace.findUnique({ where: { slug: base } }))) return base

  for (let n = 2; n <= 20; n++) {
    const candidate = `${base}-${n}`
    if (!(await prisma.workspace.findUnique({ where: { slug: candidate } }))) return candidate
  }

  return `${base}-${crypto.randomUUID().slice(0, 8)}`
}

type AuthContext = Awaited<typeof auth.$context>

/**
 * Better Auth returns `false` from generateId when it is configured to let the
 * database assign ids. Neither user.id nor account.id has a Prisma default, so
 * produce one ourselves in that case.
 */
function newId(ctx: AuthContext, model: 'user' | 'account'): string {
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

  if (await prisma.user.findUnique({ where: { email } })) {
    throw new EmailTakenError()
  }

  const hashedPassword = await ctx.password.hash(input.password)
  const slug = await resolveSlug(input.workspaceName)
  const userId = newId(ctx, 'user')

  return prisma.$transaction(async (tx) => {
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
}
