import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Loader2 } from 'lucide-react'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { deleteMember, type Member } from '@/lib/members'

type Props = {
  workspaceId: string
  member: Member
  disabled?: boolean
  onError: (message: string) => void
}

/**
 * Permanently removes a member. Always behind a confirmation dialog — unlike
 * deactivation there is nothing to undo afterwards, so the modal is the last stop.
 *
 * The wording deliberately does not promise which of the two outcomes will happen. The
 * server decides that (see deleteMember in users.service.ts): an account is erased only
 * if this workspace was the person's only one, and the client cannot know whether they
 * belong to others — that is another tenant's data. Claiming "deletes their account"
 * here would be a lie in exactly the case where it matters most.
 */
export function MemberDeleteButton({ workspaceId, member, disabled, onError }: Props) {
  const [confirming, setConfirming] = useState(false)
  const queryClient = useQueryClient()

  const mutation = useMutation({
    mutationFn: () => deleteMember(workspaceId, member.id),
    onSuccess: () => {
      setConfirming(false)
      queryClient.invalidateQueries({ queryKey: ['members', workspaceId] })
    },
    onError: (err) => {
      setConfirming(false)
      onError(err.message)
    },
  })

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        // Named for the person, so the accessible name is unique per row — otherwise
        // every row offers an identical "Delete".
        aria-label={`Delete ${member.user.name}`}
        disabled={disabled}
        onClick={() => setConfirming(true)}
        className="text-destructive hover:bg-destructive/10 hover:text-destructive"
      >
        Delete
      </Button>

      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {member.user.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              This cannot be undone. {member.user.name} is removed from this workspace
              and signed out everywhere. If this is the only workspace they belong to,
              their account and sign-in details are erased completely. To keep their
              account and only revoke access, deactivate them instead.
              {' '}
              Their tickets, comments and activity history stay in this workspace under
              their name — deleting a person does not delete the work.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={mutation.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={mutation.isPending}
              onClick={() => mutation.mutate()}
            >
              {mutation.isPending && <Loader2 className="animate-spin" />}
              {mutation.isPending ? 'Deleting…' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
