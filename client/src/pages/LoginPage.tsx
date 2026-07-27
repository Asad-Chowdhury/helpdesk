import { Link, useNavigate } from 'react-router'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Loader2 } from 'lucide-react'
import { AuthShell } from '@/components/AuthShell'
import { PasswordInput } from '@/components/PasswordInput'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Field, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field'
import { authClient } from '@/lib/auth-client'
import { loginSchema, type LoginValues } from '@/lib/schemas'

/**
 * Turns Better Auth's error into something worth showing a user. Invalid credentials
 * deliberately stay vague — the API returns the same message for a wrong password and
 * an unknown email, so the UI must not narrow it down either.
 */
function messageFor(error: { status?: number; message?: string }): string {
  if (error.status === 401) return 'Invalid email or password'
  if (error.status === 429) return 'Too many attempts. Wait a few seconds and try again.'
  return error.message || 'Could not sign you in. Please try again.'
}

export function LoginPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  })

  const mutation = useMutation({
    mutationFn: async (credentials: LoginValues) => {
      const { data, error } = await authClient.signIn.email(credentials)
      if (error) throw new Error(messageFor(error))
      return data
    },
    onSuccess: async () => {
      // The cached /api/me from before sign-in is stale — refetch before navigating so
      // the navbar renders the signed-in state (and any admin links) immediately.
      await queryClient.invalidateQueries({ queryKey: ['me'] })
      navigate('/')
    },
  })

  const busy = isSubmitting || mutation.isPending

  return (
    <AuthShell
      title="Sign in"
      description="Welcome back to your helpdesk."
      footer={
        <>
          Don't have a workspace?{' '}
          <Link to="/signup" className="text-foreground underline-offset-4 hover:underline">
            Create one
          </Link>
        </>
      }
    >
      <form onSubmit={handleSubmit((values) => mutation.mutateAsync(values))} noValidate>
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="email">Email</FieldLabel>
            <Input
              id="email"
              type="email"
              placeholder="jane@acme.com"
              autoComplete="email"
              aria-invalid={Boolean(errors.email)}
              {...register('email')}
            />
            {errors.email && <FieldError>{errors.email.message}</FieldError>}
          </Field>

          <Field>
            <FieldLabel htmlFor="password">Password</FieldLabel>
            <PasswordInput
              id="password"
              autoComplete="current-password"
              aria-invalid={Boolean(errors.password)}
              {...register('password')}
            />
            {errors.password && <FieldError>{errors.password.message}</FieldError>}
          </Field>

          {mutation.error && (
            <div
              role="alert"
              className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
            >
              {mutation.error.message}
            </div>
          )}

          <Button type="submit" size="lg" className="w-full" disabled={busy}>
            {busy && <Loader2 className="animate-spin" />}
            {busy ? 'Signing in…' : 'Sign in'}
          </Button>
        </FieldGroup>
      </form>
    </AuthShell>
  )
}
