import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { MemberRoleSelect } from './MemberRoleSelect'
import { MemberStatusButton } from './MemberStatusButton'
import type { Member } from '@/lib/members'

type Props = {
  workspaceId: string
  members: Member[]
  currentUserId: string
  onError: (message: string) => void
}

const dateFormat = new Intl.DateTimeFormat(undefined, {
  year: 'numeric',
  month: 'short',
  day: 'numeric',
})

export function MembersTable({ workspaceId, members, currentUserId, onError }: Props) {
  // The server enforces this too — it is repeated here only so the control is visibly
  // unavailable rather than failing after the fact.
  const activeAdmins = members.filter(
    (m) => m.role === 'ADMIN' && m.deactivatedAt === null,
  ).length

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Name</TableHead>
          <TableHead>Email</TableHead>
          <TableHead>Role</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Joined</TableHead>
          <TableHead className="text-right">Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {members.map((member) => {
          const isSelf = member.user.id === currentUserId
          const isActive = member.deactivatedAt === null
          const isLastActiveAdmin = member.role === 'ADMIN' && isActive && activeAdmins === 1

          return (
            <TableRow key={member.id}>
              <TableCell className="font-medium text-foreground">
                {member.user.name}
                {isSelf && <span className="ml-2 text-xs text-muted-foreground">You</span>}
              </TableCell>
              <TableCell className="text-muted-foreground">{member.user.email}</TableCell>
              <TableCell>
                <MemberRoleSelect
                  workspaceId={workspaceId}
                  member={member}
                  isSelf={isSelf}
                  disabled={isLastActiveAdmin}
                  onError={onError}
                />
              </TableCell>
              <TableCell>
                {isActive ? (
                  <Badge variant="secondary">Active</Badge>
                ) : (
                  <Badge variant="outline" className="text-muted-foreground">
                    Deactivated
                  </Badge>
                )}
              </TableCell>
              <TableCell className="text-muted-foreground">
                {dateFormat.format(new Date(member.createdAt))}
              </TableCell>
              <TableCell className="text-right">
                <MemberStatusButton
                  workspaceId={workspaceId}
                  member={member}
                  disabled={isSelf || isLastActiveAdmin}
                  onError={onError}
                />
              </TableCell>
            </TableRow>
          )
        })}
      </TableBody>
    </Table>
  )
}
