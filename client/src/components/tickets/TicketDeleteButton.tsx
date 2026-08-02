import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router'
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
import { deleteTicket, type TicketDetail } from '@/lib/tickets'

type Props = {
  workspaceId: string
  ticket: TicketDetail
  onError: (message: string) => void
}

/**
 * Permanently deletes a ticket, behind a confirmation. Admin only — enforced on the server;
 * the caller decides whether to render this at all.
 *
 * Unlike deleting a *user*, this genuinely does destroy the record: the comments and the
 * whole activity history cascade from the ticket, because they describe only this ticket and
 * mean nothing without it. The wording says so plainly rather than softening it.
 */
export function TicketDeleteButton({ workspaceId, ticket, onError }: Props) {
  const [confirming, setConfirming] = useState(false)
  const queryClient = useQueryClient()
  const navigate = useNavigate()

  const mutation = useMutation({
    mutationFn: () => deleteTicket(workspaceId, ticket.id),
    onSuccess: () => {
      setConfirming(false)
      queryClient.invalidateQueries({ queryKey: ['tickets', workspaceId] })
      queryClient.removeQueries({ queryKey: ['ticket', workspaceId, ticket.id] })
      // The page it was on no longer exists — going back to the queue avoids a 404 view.
      navigate('/tickets', { replace: true })
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
        onClick={() => setConfirming(true)}
        className="text-destructive hover:bg-destructive/10 hover:text-destructive"
      >
        Delete
      </Button>

      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete ticket #{ticket.number}?</AlertDialogTitle>
            <AlertDialogDescription>
              This cannot be undone. “{ticket.subject}” is removed along with its{' '}
              {ticket.comments.length === 1 ? 'comment' : 'comments'} and its full activity
              history. If you only want it out of the queue, close it instead.
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
              {mutation.isPending ? 'Deleting…' : 'Delete ticket'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
