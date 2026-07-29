import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Navbar } from '@/components/Navbar'
import { AddMemberDialog } from '@/components/members/AddMemberDialog'
import { MembersTable } from '@/components/members/MembersTable'
import { MembersTableSkeleton } from '@/components/members/MembersTableSkeleton'
import { fetchMembers } from '@/lib/members'
import { fetchMe } from '@/lib/me'

export function UsersPage() {
  // Rejected mutations surface here rather than per-row, so a refusal like "must keep
  // one active admin" is announced once, near the heading.
  const [actionError, setActionError] = useState<string | null>(null)

  // Already cached — RequireRole resolved this before rendering the route.
  const { data: me } = useQuery({ queryKey: ['me'], queryFn: fetchMe, retry: false })
  const workspace = me?.memberships.find((m) => m.role === 'ADMIN')?.workspace

  const {
    data,
    isPending,
    isError,
    error,
  } = useQuery({
    queryKey: ['members', workspace?.id],
    queryFn: () => fetchMembers(workspace!.id),
    enabled: Boolean(workspace),
  })

  return (
    <div className="flex min-h-svh flex-col">
      <Navbar />
      <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-10">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">Users</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {workspace
                ? `Everyone with access to ${workspace.name}.`
                : 'Everyone with access to this workspace.'}
            </p>
          </div>
          {workspace && <AddMemberDialog workspaceId={workspace.id} />}
        </div>

        {actionError && (
          <div
            role="alert"
            className="mt-6 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
          >
            {actionError}
          </div>
        )}

        <div className="mt-6">
          {isPending ? (
            <MembersTableSkeleton />
          ) : isError ? (
            <div
              role="alert"
              className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
            >
              {error.message}
            </div>
          ) : data.members.length === 0 ? (
            <p className="text-sm text-muted-foreground">No members yet.</p>
          ) : (
            <MembersTable
              workspaceId={workspace!.id}
              members={data.members}
              currentUserId={me!.user.id}
              onError={setActionError}
            />
          )}
        </div>
      </main>
    </div>
  )
}
