import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Loader2 } from 'lucide-react'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { ROLE_LABELS, updateMember, type Member } from '@/lib/members'
import type { Role } from '@/lib/me'

type Props = {
  workspaceId: string
  member: Member
  /** True when this row is the signed-in admin — their own role change affects their nav. */
  isSelf: boolean
  disabled?: boolean
  onError: (message: string) => void
}

export function MemberRoleSelect({ workspaceId, member, isSelf, disabled, onError }: Props) {
  const queryClient = useQueryClient()

  const mutation = useMutation({
    mutationFn: (role: Role) => updateMember(workspaceId, member.id, { role }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['members', workspaceId] })
      // The admin just changed their own role — the navbar and the /users route guard
      // both read ['me'], so they have to re-resolve or the UI outlives the permission.
      if (isSelf) queryClient.invalidateQueries({ queryKey: ['me'] })
    },
    // The server rejects the change (last admin, for instance) and the list is never
    // updated, so the select snaps back to the real value on its own.
    onError: (err) => onError(err.message),
  })

  return (
    <div className="flex items-center gap-2">
      <Select
        items={ROLE_LABELS}
        value={member.role}
        onValueChange={(role) => mutation.mutate(role as Role)}
        disabled={disabled || mutation.isPending}
      >
        <SelectTrigger
          size="sm"
          className="w-32"
          aria-label={`Role for ${member.user.name}`}
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {(Object.keys(ROLE_LABELS) as Role[]).map((role) => (
            <SelectItem key={role} value={role}>
              {ROLE_LABELS[role]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {mutation.isPending && (
        <Loader2 className="size-3.5 animate-spin text-muted-foreground" aria-hidden />
      )}
    </div>
  )
}
