import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Loader2 } from 'lucide-react'
import { Navbar } from '@/components/Navbar'
import { PasswordInput } from '@/components/PasswordInput'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Field, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Separator } from '@/components/ui/separator'
import { authClient } from '@/lib/auth-client'
import { fetchMe, MeError, updateProfile, type Me } from '@/lib/me'
import { ROLE_LABELS } from '@/lib/members'
import {
  changePasswordSchema,
  profileSchema,
  type ChangePasswordValues,
  type ProfileValues,
} from '@/lib/schemas'

const dateFormat = new Intl.DateTimeFormat(undefined, {
  year: 'numeric',
  month: 'long',
  day: 'numeric',
})

/**
 * Everything about the signed-in user, editable in one place: their details, their
 * password, and a read-only view of the workspaces they belong to.
 *
 * Roles are shown but not editable here — a role is per-workspace and an admin's
 * decision. Letting someone change their own would make /users pointless and the
 * ADMIN guard self-serve.
 */
export function ProfilePage() {
  const { data: me, isPending, isError, error } = useQuery({
    queryKey: ['me'],
    queryFn: fetchMe,
    retry: false,
  })

  return (
    <div className="flex min-h-svh flex-col">
      <Navbar />
      <main className="mx-auto w-full max-w-2xl flex-1 px-6 py-10">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Profile</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Your account details and sign-in password.
        </p>

        {isPending ? (
          <div className="mt-8 flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            <span role="status">Loading your profile…</span>
          </div>
        ) : isError || !me ? (
          <div
            role="alert"
            className="mt-8 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
          >
            {error?.message ?? 'You are not signed in.'}
          </div>
        ) : (
          <div className="mt-8 flex flex-col gap-6">
            <ProfileDetailsCard me={me} />
            <PasswordCard />
            <WorkspacesCard me={me} />
          </div>
        )}
      </main>
    </div>
  )
}

function ProfileDetailsCard({ me }: { me: Me }) {
  const queryClient = useQueryClient()
  const [saved, setSaved] = useState(false)

  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isDirty },
  } = useForm<ProfileValues>({
    resolver: zodResolver(profileSchema),
    values: { name: me.user.name, email: me.user.email },
  })

  const mutation = useMutation({
    mutationFn: (values: ProfileValues) => updateProfile(values),
    onSuccess: (next) => {
      // The response is the same shape as fetchMe, so seed the cache rather than
      // refetching — the navbar reads this key and updates in the same tick.
      queryClient.setQueryData(['me'], next)
      reset({ name: next.user.name, email: next.user.email })
      setSaved(true)
    },
  })

  // Field errors from the server (409 on a taken email, 400 on validation) land on the
  // inputs, the same way SignupPage and AddMemberDialog handle them.
  useEffect(() => {
    if (!(mutation.error instanceof MeError)) return
    for (const [field, message] of Object.entries(mutation.error.fields)) {
      setError(field as keyof ProfileValues, { type: 'server', message })
    }
  }, [mutation.error, setError])

  const formError =
    mutation.error instanceof MeError && Object.keys(mutation.error.fields).length > 0
      ? null
      : (mutation.error?.message ?? null)

  return (
    <Card>
      {/* `mutate`, not `mutateAsync` — a rejected promise inside handleSubmit has
          nothing awaiting it and shows up as an unhandled rejection. */}
      <form
        onSubmit={handleSubmit((values) => {
          setSaved(false)
          mutation.mutate(values)
        })}
        noValidate
      >
        <CardHeader>
          <CardTitle>Your details</CardTitle>
          <CardDescription>
            Your email is what you sign in with. Changing it changes your login.
          </CardDescription>
        </CardHeader>

        <CardContent>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="profile-name">Name</FieldLabel>
              <Input
                id="profile-name"
                autoComplete="name"
                aria-invalid={Boolean(errors.name)}
                {...register('name')}
              />
              {errors.name && <FieldError>{errors.name.message}</FieldError>}
            </Field>

            <Field>
              <FieldLabel htmlFor="profile-email">Email</FieldLabel>
              <Input
                id="profile-email"
                type="email"
                autoComplete="email"
                aria-invalid={Boolean(errors.email)}
                {...register('email')}
              />
              {errors.email && <FieldError>{errors.email.message}</FieldError>}
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
        </CardContent>

        <CardFooter className="justify-end gap-3">
          {saved && !isDirty && (
            <span role="status" className="text-sm text-muted-foreground">
              Saved
            </span>
          )}
          <Button type="submit" disabled={mutation.isPending || !isDirty}>
            {mutation.isPending && <Loader2 className="animate-spin" />}
            {mutation.isPending ? 'Saving…' : 'Save changes'}
          </Button>
        </CardFooter>
      </form>
    </Card>
  )
}

/**
 * Password changes go through Better Auth's own endpoint rather than our API: it
 * verifies the current password and hashes with the configured algorithm. This is the
 * documented exception to the axios rule — authClient ships its own fetch layer.
 */
function PasswordCard() {
  const [changed, setChanged] = useState(false)

  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<ChangePasswordValues>({
    resolver: zodResolver(changePasswordSchema),
    defaultValues: { currentPassword: '', newPassword: '', confirmPassword: '' },
  })

  const [formError, setFormError] = useState<string | null>(null)

  async function onSubmit(values: ChangePasswordValues) {
    setFormError(null)
    setChanged(false)

    const { error } = await authClient.changePassword({
      currentPassword: values.currentPassword,
      newPassword: values.newPassword,
      // Anyone signed in elsewhere on this account loses their session. If the reason
      // for the change is that the password leaked, leaving those alive would defeat
      // it. Better Auth issues a fresh cookie for this tab, so we stay signed in.
      revokeOtherSessions: true,
    })

    if (error) {
      // The only failure a user can act on is the current password being wrong;
      // Better Auth reports it as a 400 on that field.
      if (error.status === 400) {
        setError('currentPassword', {
          type: 'server',
          message: error.message ?? 'That password is not correct',
        })
      } else {
        setFormError(error.message ?? 'Could not change your password')
      }
      return
    }

    reset()
    setChanged(true)
  }

  return (
    <Card>
      <form onSubmit={handleSubmit(onSubmit)} noValidate>
        <CardHeader>
          <CardTitle>Password</CardTitle>
          <CardDescription>
            Changing your password signs you out of any other device.
          </CardDescription>
        </CardHeader>

        <CardContent>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="current-password">Current password</FieldLabel>
              <PasswordInput
                id="current-password"
                autoComplete="current-password"
                aria-invalid={Boolean(errors.currentPassword)}
                {...register('currentPassword')}
              />
              {errors.currentPassword && (
                <FieldError>{errors.currentPassword.message}</FieldError>
              )}
            </Field>

            <Field>
              <FieldLabel htmlFor="new-password">New password</FieldLabel>
              <PasswordInput
                id="new-password"
                autoComplete="new-password"
                aria-invalid={Boolean(errors.newPassword)}
                {...register('newPassword')}
              />
              {errors.newPassword && <FieldError>{errors.newPassword.message}</FieldError>}
            </Field>

            <Field>
              <FieldLabel htmlFor="confirm-password">Confirm new password</FieldLabel>
              <PasswordInput
                id="confirm-password"
                autoComplete="new-password"
                aria-invalid={Boolean(errors.confirmPassword)}
                {...register('confirmPassword')}
              />
              {errors.confirmPassword && (
                <FieldError>{errors.confirmPassword.message}</FieldError>
              )}
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
        </CardContent>

        <CardFooter className="justify-end gap-3">
          {changed && (
            <span role="status" className="text-sm text-muted-foreground">
              Password updated
            </span>
          )}
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting && <Loader2 className="animate-spin" />}
            {isSubmitting ? 'Updating…' : 'Change password'}
          </Button>
        </CardFooter>
      </form>
    </Card>
  )
}

/** Read-only: which workspaces this account belongs to, and as what. */
function WorkspacesCard({ me }: { me: Me }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Workspaces</CardTitle>
        <CardDescription>
          Your role is set by an admin of each workspace and cannot be changed here.
        </CardDescription>
      </CardHeader>

      <CardContent>
        {me.memberships.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            You don't belong to any workspace.
          </p>
        ) : (
          <ul className="flex flex-col gap-3">
            {me.memberships.map((membership) => (
              <li
                key={membership.workspace.id}
                className="flex items-center justify-between gap-4"
              >
                <span className="text-sm font-medium text-foreground">
                  {membership.workspace.name}
                </span>
                <Badge variant="secondary">{ROLE_LABELS[membership.role]}</Badge>
              </li>
            ))}
          </ul>
        )}

        {me.user.createdAt && (
          <>
            <Separator className="my-4" />
            <p className="text-sm text-muted-foreground">
              Member since {dateFormat.format(new Date(me.user.createdAt))}
            </p>
          </>
        )}
      </CardContent>
    </Card>
  )
}
