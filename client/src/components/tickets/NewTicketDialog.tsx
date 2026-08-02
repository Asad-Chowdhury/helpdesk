import { useEffect, useState } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Field, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { createTicketSchema, type CreateTicketValues } from '@/lib/schemas'
import { canAssign, canSetPriority } from '@/lib/ticket-policy'
import type { Role } from '@/lib/me'
import {
  createTicket,
  PRIORITY_LABELS,
  TICKET_PRIORITIES,
  TicketsError,
  type TicketFormOptions,
  type TicketPriority,
} from '@/lib/tickets'

type Props = {
  workspaceId: string
  role: Role
  options: TicketFormOptions | undefined
}

/** '' is the Select's "none" option; the API wants null to mean "not set". */
const NONE = ''

export function NewTicketDialog({ workspaceId, role, options }: Props) {
  const [open, setOpen] = useState(false)
  const queryClient = useQueryClient()
  const navigate = useNavigate()

  const {
    register,
    control,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<CreateTicketValues>({
    resolver: zodResolver(createTicketSchema),
    defaultValues: { subject: '', description: '', categoryId: NONE, assigneeId: NONE, priority: 'NORMAL' },
  })

  // Both are re-checked on the server; hiding them here just avoids offering a control
  // whose response would be a 403.
  const mayAssign = canAssign(role)
  const maySetPriority = canSetPriority(role)

  /**
   * `mutate`, not `mutateAsync` — the same reason as AddMemberDialog: a rejected
   * `mutateAsync` propagates out of handleSubmit with nothing awaiting it, which logs an
   * unhandled rejection on every failed submit.
   */
  const mutation = useMutation({
    mutationFn: (values: CreateTicketValues) =>
      createTicket(workspaceId, {
        subject: values.subject,
        description: values.description,
        // '' → null: the server treats null as "clear" and absent as "leave alone", and at
        // creation there is nothing to leave alone.
        categoryId: values.categoryId || null,
        ...(mayAssign ? { assigneeId: values.assigneeId || null } : {}),
        ...(maySetPriority && values.priority ? { priority: values.priority } : {}),
      }),
    onSuccess: ({ ticket }) => {
      queryClient.invalidateQueries({ queryKey: ['tickets', workspaceId] })
      close(false)
      // Straight to the ticket just raised — the next thing anyone does is look at it.
      navigate(`/tickets/${ticket.id}`)
    },
  })

  // Server field errors (an invalid category or assignee) land on the matching input.
  useEffect(() => {
    if (!(mutation.error instanceof TicketsError)) return
    for (const [field, message] of Object.entries(mutation.error.fields)) {
      setError(field as keyof CreateTicketValues, { type: 'server', message })
    }
  }, [mutation.error, setError])

  const formError =
    mutation.error instanceof TicketsError && Object.keys(mutation.error.fields).length > 0
      ? null
      : (mutation.error?.message ?? null)

  const busy = isSubmitting || mutation.isPending

  function close(next: boolean) {
    setOpen(next)
    if (!next) {
      mutation.reset()
      reset()
    }
  }

  const categoryItems: Record<string, string> = {
    [NONE]: 'No category',
    ...Object.fromEntries((options?.categories ?? []).map((c) => [c.id, c.name])),
  }
  const assigneeItems: Record<string, string> = {
    [NONE]: 'Unassigned',
    ...Object.fromEntries((options?.assignees ?? []).map((a) => [a.id, a.name])),
  }

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogTrigger render={<Button>New ticket</Button>} />

      <DialogContent className="sm:max-w-lg">
        <form onSubmit={handleSubmit((values) => mutation.mutate(values))} noValidate>
          <DialogHeader>
            <DialogTitle>Raise a ticket</DialogTitle>
            <DialogDescription>
              Describe the request. You can change the category and assignee afterwards.
            </DialogDescription>
          </DialogHeader>

          <FieldGroup className="py-4">
            <Field>
              <FieldLabel htmlFor="ticket-subject">Subject</FieldLabel>
              <Input
                id="ticket-subject"
                placeholder="Rebrand the launch deck"
                autoComplete="off"
                aria-invalid={Boolean(errors.subject)}
                {...register('subject')}
              />
              {errors.subject && <FieldError>{errors.subject.message}</FieldError>}
            </Field>

            <Field>
              <FieldLabel htmlFor="ticket-description">Description</FieldLabel>
              <Textarea
                id="ticket-description"
                rows={5}
                placeholder="What needs doing, and by when?"
                aria-invalid={Boolean(errors.description)}
                {...register('description')}
              />
              {errors.description && <FieldError>{errors.description.message}</FieldError>}
            </Field>

            <Field>
              <FieldLabel htmlFor="ticket-category">Category</FieldLabel>
              <Controller
                control={control}
                name="categoryId"
                render={({ field }) => (
                  <Select
                    items={categoryItems}
                    value={field.value ?? NONE}
                    onValueChange={(value) => field.onChange(value)}
                  >
                    <SelectTrigger id="ticket-category" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE}>No category</SelectItem>
                      {(options?.categories ?? []).map((category) => (
                        <SelectItem key={category.id} value={category.id}>
                          {category.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
              {errors.categoryId && <FieldError>{errors.categoryId.message}</FieldError>}
            </Field>

            {mayAssign && (
              <Field>
                <FieldLabel htmlFor="ticket-assignee">Assignee</FieldLabel>
                <Controller
                  control={control}
                  name="assigneeId"
                  render={({ field }) => (
                    <Select
                      items={assigneeItems}
                      value={field.value ?? NONE}
                      onValueChange={(value) => field.onChange(value)}
                    >
                      <SelectTrigger id="ticket-assignee" className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={NONE}>Unassigned</SelectItem>
                        {(options?.assignees ?? []).map((assignee) => (
                          <SelectItem key={assignee.id} value={assignee.id}>
                            {assignee.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
                {errors.assigneeId && <FieldError>{errors.assigneeId.message}</FieldError>}
              </Field>
            )}

            {maySetPriority && (
              <Field>
                <FieldLabel htmlFor="ticket-priority">Priority</FieldLabel>
                <Controller
                  control={control}
                  name="priority"
                  render={({ field }) => (
                    <Select
                      items={PRIORITY_LABELS}
                      value={field.value ?? 'NORMAL'}
                      onValueChange={(value) => field.onChange(value as TicketPriority)}
                    >
                      <SelectTrigger id="ticket-priority" className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {TICKET_PRIORITIES.map((priority) => (
                          <SelectItem key={priority} value={priority}>
                            {PRIORITY_LABELS[priority]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
                {errors.priority && <FieldError>{errors.priority.message}</FieldError>}
              </Field>
            )}

            {formError && (
              <div
                role="alert"
                className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
              >
                {formError}
              </div>
            )}
          </FieldGroup>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => close(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy}>
              {busy && <Loader2 className="animate-spin" />}
              {busy ? 'Creating…' : 'Create ticket'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
