import { useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { useMutation } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Field, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field'
import { authClient } from '@/lib/auth-client'

type Credentials = { email: string; password: string }

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
  const [values, setValues] = useState<Credentials>({ email: '', password: '' })
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})

  const mutation = useMutation({
    mutationFn: async (credentials: Credentials) => {
      const { data, error } = await authClient.signIn.email(credentials)
      if (error) throw new Error(messageFor(error))
      return data
    },
    onSuccess: () => navigate('/'),
  })

  function update(key: keyof Credentials, value: string) {
    setValues((prev) => ({ ...prev, [key]: value }))
    setFieldErrors((prev) => {
      if (!prev[key]) return prev
      const next = { ...prev }
      delete next[key]
      return next
    })
    mutation.reset()
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault()

    const errors: Record<string, string> = {}
    if (!values.email.trim()) errors.email = 'Email is required'
    if (!values.password) errors.password = 'Password is required'
    setFieldErrors(errors)
    if (Object.keys(errors).length > 0) return

    mutation.mutate({ email: values.email.trim(), password: values.password })
  }

  return (
    <div className="flex min-h-svh items-center justify-center p-6">
      <div className="w-full max-w-sm">
        <div className="mb-6 space-y-1">
          <h1 className="text-2xl font-semibold text-foreground">Sign in</h1>
          <p className="text-sm text-muted-foreground">Welcome back to your helpdesk.</p>
        </div>

        <form onSubmit={handleSubmit} noValidate>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="email">Email</FieldLabel>
              <Input
                id="email"
                type="email"
                value={values.email}
                onChange={(e) => update('email', e.target.value)}
                placeholder="jane@acme.com"
                autoComplete="email"
                aria-invalid={Boolean(fieldErrors.email)}
              />
              {fieldErrors.email && <FieldError>{fieldErrors.email}</FieldError>}
            </Field>

            <Field>
              <FieldLabel htmlFor="password">Password</FieldLabel>
              <Input
                id="password"
                type="password"
                value={values.password}
                onChange={(e) => update('password', e.target.value)}
                autoComplete="current-password"
                aria-invalid={Boolean(fieldErrors.password)}
              />
              {fieldErrors.password && <FieldError>{fieldErrors.password}</FieldError>}
            </Field>

            {mutation.error && (
              <p role="alert" className="text-sm text-destructive">
                {mutation.error.message}
              </p>
            )}

            <Button type="submit" size="lg" disabled={mutation.isPending}>
              {mutation.isPending ? 'Signing in…' : 'Sign in'}
            </Button>
          </FieldGroup>
        </form>

        <p className="mt-6 text-center text-sm text-muted-foreground">
          Don't have a workspace?{' '}
          <Link to="/signup" className="text-primary underline-offset-4 hover:underline">
            Create one
          </Link>
        </p>
      </div>
    </div>
  )
}
