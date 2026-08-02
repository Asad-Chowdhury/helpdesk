import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Loader2, Lock } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Field, FieldError } from '@/components/ui/field'
import { Textarea } from '@/components/ui/textarea'
import { PersonLabel } from './PersonLabel'
import { ticketCommentSchema, type TicketCommentValues } from '@/lib/schemas'
import { canUseInternalNotes } from '@/lib/ticket-policy'
import type { Role } from '@/lib/me'
import { addTicketComment, TicketsError, type TicketComment } from '@/lib/tickets'

type Props = {
  workspaceId: string
  ticketId: string
  comments: TicketComment[]
  role: Role
}

const timeFormat = new Intl.DateTimeFormat(undefined, {
  month: 'short',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
})

/**
 * The thread, plus the box to add to it.
 *
 * Comments and internal notes are one list in one order, because they are one conversation
 * — splitting them into tabs would make "what happened on this ticket, in order"
 * unanswerable. Notes are marked instead.
 *
 * A Client never receives internal notes at all: the server filters them out of the query,
 * so there is nothing here to accidentally render.
 */
export function TicketComments({ workspaceId, ticketId, comments, role }: Props) {
  const queryClient = useQueryClient()
  const mayPostInternal = canUseInternalNotes(role)

  const {
    register,
    handleSubmit,
    reset,
    setError,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<TicketCommentValues>({
    resolver: zodResolver(ticketCommentSchema),
    defaultValues: { body: '', internal: false },
  })

  const internal = watch('internal')

  const mutation = useMutation({
    mutationFn: (values: TicketCommentValues) =>
      addTicketComment(workspaceId, ticketId, {
        body: values.body,
        internal: values.internal ?? false,
      }),
    onSuccess: () => {
      // Refetch rather than append: the thread is part of the ticket query, and the server
      // is the authority on ordering and on what this role is allowed to see.
      queryClient.invalidateQueries({ queryKey: ['ticket', workspaceId, ticketId] })
      reset({ body: '', internal: false })
    },
  })

  useEffect(() => {
    if (!(mutation.error instanceof TicketsError)) return
    for (const [field, message] of Object.entries(mutation.error.fields)) {
      setError(field as keyof TicketCommentValues, { type: 'server', message })
    }
  }, [mutation.error, setError])

  const formError =
    mutation.error instanceof TicketsError && Object.keys(mutation.error.fields).length > 0
      ? null
      : (mutation.error?.message ?? null)

  const busy = isSubmitting || mutation.isPending

  return (
    <section aria-labelledby="ticket-thread-heading" className="space-y-4">
      <h2 id="ticket-thread-heading" className="text-sm font-semibold text-foreground">
        Conversation
      </h2>

      {comments.length === 0 ? (
        <p className="text-sm text-muted-foreground">No comments yet.</p>
      ) : (
        <ul className="space-y-3">
          {comments.map((comment) => (
            <li
              key={comment.id}
              className={
                comment.internal
                  ? 'rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2.5'
                  : 'rounded-lg border border-border px-3 py-2.5'
              }
            >
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="font-medium text-foreground">
                  <PersonLabel person={comment.author} fallback="Unknown" />
                </span>
                <span className="text-xs text-muted-foreground">
                  {timeFormat.format(new Date(comment.createdAt))}
                </span>
                {comment.internal && (
                  <Badge variant="outline" className="gap-1 border-amber-500/40">
                    <Lock aria-hidden />
                    Internal note
                  </Badge>
                )}
              </div>
              {/* whitespace-pre-wrap, not a markdown renderer: the body is stored as plain
                  text and React escapes it, so newlines survive and nothing is injectable. */}
              <p className="mt-1.5 text-sm whitespace-pre-wrap text-foreground">
                {comment.body}
              </p>
            </li>
          ))}
        </ul>
      )}

      <form
        onSubmit={handleSubmit((values) => mutation.mutate(values))}
        noValidate
        className="space-y-2"
      >
        <Field>
          <label htmlFor="new-comment" className="sr-only">
            {internal ? 'Internal note' : 'Comment'}
          </label>
          <Textarea
            id="new-comment"
            rows={3}
            placeholder={internal ? 'Visible to your team only…' : 'Add a comment…'}
            aria-invalid={Boolean(errors.body)}
            {...register('body')}
          />
          {errors.body && <FieldError>{errors.body.message}</FieldError>}
        </Field>

        {formError && (
          <div
            role="alert"
            className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
          >
            {formError}
          </div>
        )}

        <div className="flex items-center justify-between gap-3">
          {mayPostInternal ? (
            <label className="flex items-center gap-2 text-sm text-muted-foreground">
              <input
                type="checkbox"
                className="size-4 rounded border-input accent-primary"
                checked={internal ?? false}
                onChange={(event) => setValue('internal', event.target.checked)}
              />
              Internal note — not shown to clients
            </label>
          ) : (
            <span />
          )}

          <Button type="submit" size="sm" disabled={busy}>
            {busy && <Loader2 className="animate-spin" />}
            {busy ? 'Posting…' : internal ? 'Add note' : 'Comment'}
          </Button>
        </div>
      </form>
    </section>
  )
}
