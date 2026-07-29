import { useEffect, useState } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Check, Copy, Loader2 } from 'lucide-react'
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
import { addMember, MembersError, ROLE_LABELS } from '@/lib/members'
import type { Role } from '@/lib/me'
import { addMemberSchema, type AddMemberValues } from '@/lib/schemas'

export function AddMemberDialog({ workspaceId }: { workspaceId: string }) {
  const [open, setOpen] = useState(false)
  const [temporaryPassword, setTemporaryPassword] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const queryClient = useQueryClient()

  const {
    register,
    control,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<AddMemberValues>({
    resolver: zodResolver(addMemberSchema),
    defaultValues: { name: '', email: '', role: 'STAFF' },
  })

  /**
   * Submitted with `mutate`, not `mutateAsync`. The failure is rendered from
   * `mutation.error` below, and a rejected `mutateAsync` propagates back out of
   * react-hook-form's handleSubmit with nothing awaiting it — an unhandled rejection
   * in the console on every failed add.
   */
  const mutation = useMutation({
    mutationFn: (values: AddMemberValues) => addMember(workspaceId, values),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['members', workspaceId] })
      // Shown once and never retrievable — hold the dialog open on this screen rather
      // than closing, or the admin loses the only copy.
      if (result.temporaryPassword) setTemporaryPassword(result.temporaryPassword)
      else setOpen(false)
      reset()
    },
  })

  // Server field errors (409 already-a-member, 400 validation) land on the inputs, the
  // same way SignupPage handles them.
  useEffect(() => {
    if (!(mutation.error instanceof MembersError)) return
    for (const [field, message] of Object.entries(mutation.error.fields)) {
      setError(field as keyof AddMemberValues, { type: 'server', message })
    }
  }, [mutation.error, setError])

  const formError =
    mutation.error instanceof MembersError && Object.keys(mutation.error.fields).length > 0
      ? null
      : (mutation.error?.message ?? null)

  const busy = isSubmitting || mutation.isPending

  function close(next: boolean) {
    setOpen(next)
    if (!next) {
      setTemporaryPassword(null)
      setCopied(false)
      mutation.reset()
      reset()
    }
  }

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogTrigger render={<Button>Add member</Button>} />

      <DialogContent>
        {temporaryPassword ? (
          <>
            <DialogHeader>
              <DialogTitle>Member added</DialogTitle>
              <DialogDescription>
                Send them this temporary password out of band. It is shown only once and
                cannot be retrieved again — they can change it after signing in.
              </DialogDescription>
            </DialogHeader>

            <div className="flex items-center gap-2">
              <code
                className="flex-1 rounded-lg border border-border bg-muted px-3 py-2 font-mono text-sm text-foreground"
                data-testid="temporary-password"
              >
                {temporaryPassword}
              </code>
              <Button
                variant="outline"
                size="icon"
                aria-label="Copy temporary password"
                onClick={async () => {
                  await navigator.clipboard.writeText(temporaryPassword)
                  setCopied(true)
                }}
              >
                {copied ? <Check /> : <Copy />}
              </Button>
            </div>

            <DialogFooter>
              <Button onClick={() => close(false)}>Done</Button>
            </DialogFooter>
          </>
        ) : (
          <form onSubmit={handleSubmit((values) => mutation.mutate(values))} noValidate>
            <DialogHeader>
              <DialogTitle>Add a member</DialogTitle>
              <DialogDescription>
                They get an account straight away. Email invitations arrive in a later
                release, so you'll pass on a temporary password yourself.
              </DialogDescription>
            </DialogHeader>

            <FieldGroup className="py-4">
              <Field>
                <FieldLabel htmlFor="member-name">Name</FieldLabel>
                <Input
                  id="member-name"
                  placeholder="Jane Doe"
                  autoComplete="off"
                  aria-invalid={Boolean(errors.name)}
                  {...register('name')}
                />
                {errors.name && <FieldError>{errors.name.message}</FieldError>}
              </Field>

              <Field>
                <FieldLabel htmlFor="member-email">Email</FieldLabel>
                <Input
                  id="member-email"
                  type="email"
                  placeholder="jane@acme.com"
                  autoComplete="off"
                  aria-invalid={Boolean(errors.email)}
                  {...register('email')}
                />
                {errors.email && <FieldError>{errors.email.message}</FieldError>}
              </Field>

              <Field>
                <FieldLabel htmlFor="member-role">Role</FieldLabel>
                <Controller
                  control={control}
                  name="role"
                  render={({ field }) => (
                    <Select
                      items={ROLE_LABELS}
                      value={field.value}
                      onValueChange={(value) => field.onChange(value as Role)}
                    >
                      <SelectTrigger id="member-role" className="w-full">
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
                  )}
                />
                {errors.role && <FieldError>{errors.role.message}</FieldError>}
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
              <Button type="submit" disabled={busy}>
                {busy && <Loader2 className="animate-spin" />}
                {busy ? 'Adding…' : 'Add member'}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}
