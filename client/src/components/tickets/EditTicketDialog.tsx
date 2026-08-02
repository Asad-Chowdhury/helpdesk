import { useEffect, useState } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQueryClient } from '@tanstack/react-query'
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
import { editTicketSchema, type EditTicketValues } from '@/lib/schemas'
import {
  TicketsError,
  updateTicket,
  type TicketDetail,
  type TicketFormOptions,
} from '@/lib/tickets'

type Props = {
  workspaceId: string
  ticket: TicketDetail
  options: TicketFormOptions | undefined
}

const NONE = ''

/**
 * Edits the request itself — subject, description, category. Status, priority and assignee
 * are single controls in the sidebar instead, because those change often and a dialog per
 * change would be in the way.
 *
 * Only rendered for roles that may edit (Admin/Manager); the server enforces the same rule.
 */
export function EditTicketDialog({ workspaceId, ticket, options }: Props) {
  const [open, setOpen] = useState(false)
  const queryClient = useQueryClient()

  const {
    register,
    control,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<EditTicketValues>({
    resolver: zodResolver(editTicketSchema),
    // `values` rather than `defaultValues`: the ticket can change under this form (someone
    // else edits it, or the sidebar refetches), and the dialog should reopen showing the
    // current text rather than what it was first mounted with.
    values: {
      subject: ticket.subject,
      description: ticket.description,
      categoryId: ticket.category?.id ?? NONE,
    },
  })

  const mutation = useMutation({
    mutationFn: (values: EditTicketValues) =>
      updateTicket(workspaceId, ticket.id, {
        subject: values.subject,
        description: values.description,
        categoryId: values.categoryId || null,
      }),
    onSuccess: ({ ticket: updated }) => {
      queryClient.setQueryData(['ticket', workspaceId, ticket.id], { ticket: updated })
      queryClient.invalidateQueries({ queryKey: ['tickets', workspaceId] })
      close(false)
    },
  })

  useEffect(() => {
    if (!(mutation.error instanceof TicketsError)) return
    for (const [field, message] of Object.entries(mutation.error.fields)) {
      setError(field as keyof EditTicketValues, { type: 'server', message })
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

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogTrigger
        render={
          <Button variant="outline" size="sm">
            Edit
          </Button>
        }
      />

      <DialogContent className="sm:max-w-lg">
        <form onSubmit={handleSubmit((values) => mutation.mutate(values))} noValidate>
          <DialogHeader>
            <DialogTitle>Edit ticket #{ticket.number}</DialogTitle>
            <DialogDescription>
              Changes to the request text are not recorded in the activity history — only
              status, priority, assignee and category changes are.
            </DialogDescription>
          </DialogHeader>

          <FieldGroup className="py-4">
            <Field>
              <FieldLabel htmlFor="edit-subject">Subject</FieldLabel>
              <Input
                id="edit-subject"
                autoComplete="off"
                aria-invalid={Boolean(errors.subject)}
                {...register('subject')}
              />
              {errors.subject && <FieldError>{errors.subject.message}</FieldError>}
            </Field>

            <Field>
              <FieldLabel htmlFor="edit-description">Description</FieldLabel>
              <Textarea
                id="edit-description"
                rows={6}
                aria-invalid={Boolean(errors.description)}
                {...register('description')}
              />
              {errors.description && <FieldError>{errors.description.message}</FieldError>}
            </Field>

            <Field>
              <FieldLabel htmlFor="edit-category">Category</FieldLabel>
              <Controller
                control={control}
                name="categoryId"
                render={({ field }) => (
                  <Select
                    items={categoryItems}
                    value={field.value ?? NONE}
                    onValueChange={(value) => field.onChange(value)}
                  >
                    <SelectTrigger id="edit-category" className="w-full">
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
            <Button type="submit" disabled={busy || !isDirty}>
              {busy && <Loader2 className="animate-spin" />}
              {busy ? 'Saving…' : 'Save changes'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
