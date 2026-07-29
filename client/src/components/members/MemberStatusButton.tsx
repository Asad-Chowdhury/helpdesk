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
import { updateMember, type Member } from '@/lib/members'

type Props = {
  workspaceId: string
  member: Member
  disabled?: boolean
  onError: (message: string) => void
}

/**
 * Deactivate/reactivate for one member. Deactivating asks for confirmation because it
 * cuts off the person's access to the workspace; reactivating is harmless, so it goes
 * through immediately.
 */
export function MemberStatusButton({ workspaceId, member, disabled, onError }: Props) {
  const [confirming, setConfirming] = useState(false)
  const queryClient = useQueryClient()
  const isActive = member.deactivatedAt === null

  const mutation = useMutation({
    mutationFn: (active: boolean) => updateMember(workspaceId, member.id, { active }),
    onSuccess: () => {
      setConfirming(false)
      queryClient.invalidateQueries({ queryKey: ['members', workspaceId] })
    },
    onError: (err) => {
      setConfirming(false)
      onError(err.message)
    },
  })

  if (!isActive) {
    return (
      <Button
        variant="outline"
        size="sm"
        disabled={disabled || mutation.isPending}
        onClick={() => mutation.mutate(true)}
      >
        {mutation.isPending && <Loader2 className="animate-spin" />}
        Reactivate
      </Button>
    )
  }

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        disabled={disabled}
        onClick={() => setConfirming(true)}
      >
        Deactivate
      </Button>

      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Deactivate {member.user.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              They lose access to this workspace immediately. Their account and history
              stay intact, and you can reactivate them at any time.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={mutation.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={mutation.isPending}
              onClick={() => mutation.mutate(false)}
            >
              {mutation.isPending && <Loader2 className="animate-spin" />}
              {mutation.isPending ? 'Deactivating…' : 'Deactivate'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
