import { useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { useMutation } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Field, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field'
import { SignupError, signUp, type SignupInput } from '@/lib/signup'

const EMPTY: SignupInput = {
  workspaceName: '',
  name: '',
  email: '',
  password: '',
}

const MIN_PASSWORD_LENGTH = 8

/** Mirrors the server's rules so obvious mistakes don't need a round trip. */
function validate(values: SignupInput): Record<string, string> {
  const errors: Record<string, string> = {}

  if (!values.workspaceName.trim()) errors.workspaceName = 'Workspace name is required'
  if (!values.name.trim()) errors.name = 'Your name is required'
  if (!values.email.trim()) errors.email = 'Email is required'
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email.trim()))
    errors.email = 'Enter a valid email address'
  if (!values.password) errors.password = 'Password is required'
  else if (values.password.length < MIN_PASSWORD_LENGTH)
    errors.password = `Password must be at least ${MIN_PASSWORD_LENGTH} characters`

  return errors
}

export function SignupPage() {
  const navigate = useNavigate()
  const [values, setValues] = useState<SignupInput>(EMPTY)
  const [clientErrors, setClientErrors] = useState<Record<string, string>>({})

  const mutation = useMutation({
    mutationFn: signUp,
    onSuccess: () => navigate('/'),
  })

  // Server-reported field errors take over once a submission has been rejected.
  const serverErrors = mutation.error instanceof SignupError ? mutation.error.fields : {}
  const errors = { ...clientErrors, ...serverErrors }

  const formError =
    mutation.error && !(mutation.error instanceof SignupError)
      ? mutation.error.message
      : mutation.error instanceof SignupError &&
          Object.keys(mutation.error.fields).length === 0
        ? mutation.error.message
        : null

  function update(key: keyof SignupInput, value: string) {
    setValues((prev) => ({ ...prev, [key]: value }))
    setClientErrors((prev) => {
      if (!prev[key]) return prev
      const next = { ...prev }
      delete next[key]
      return next
    })
    mutation.reset()
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    const found = validate(values)
    setClientErrors(found)
    if (Object.keys(found).length > 0) return
    mutation.mutate(values)
  }

  return (
    <div className="flex min-h-svh items-center justify-center p-6">
      <div className="w-full max-w-sm">
        <div className="mb-6 space-y-1">
          <h1 className="text-2xl font-semibold text-foreground">Create your workspace</h1>
          <p className="text-sm text-muted-foreground">
            You'll be the admin and can invite your team afterwards.
          </p>
        </div>

        <form onSubmit={handleSubmit} noValidate>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="workspaceName">Workspace name</FieldLabel>
              <Input
                id="workspaceName"
                value={values.workspaceName}
                onChange={(e) => update('workspaceName', e.target.value)}
                placeholder="Acme Marketing"
                autoComplete="organization"
                aria-invalid={Boolean(errors.workspaceName)}
              />
              {errors.workspaceName && <FieldError>{errors.workspaceName}</FieldError>}
            </Field>

            <Field>
              <FieldLabel htmlFor="name">Your name</FieldLabel>
              <Input
                id="name"
                value={values.name}
                onChange={(e) => update('name', e.target.value)}
                placeholder="Jane Doe"
                autoComplete="name"
                aria-invalid={Boolean(errors.name)}
              />
              {errors.name && <FieldError>{errors.name}</FieldError>}
            </Field>

            <Field>
              <FieldLabel htmlFor="email">Work email</FieldLabel>
              <Input
                id="email"
                type="email"
                value={values.email}
                onChange={(e) => update('email', e.target.value)}
                placeholder="jane@acme.com"
                autoComplete="email"
                aria-invalid={Boolean(errors.email)}
              />
              {errors.email && <FieldError>{errors.email}</FieldError>}
            </Field>

            <Field>
              <FieldLabel htmlFor="password">Password</FieldLabel>
              <Input
                id="password"
                type="password"
                value={values.password}
                onChange={(e) => update('password', e.target.value)}
                autoComplete="new-password"
                aria-invalid={Boolean(errors.password)}
              />
              {errors.password ? (
                <FieldError>{errors.password}</FieldError>
              ) : (
                <p className="text-xs text-muted-foreground">
                  At least {MIN_PASSWORD_LENGTH} characters.
                </p>
              )}
            </Field>

            {formError && (
              <p role="alert" className="text-sm text-destructive">
                {formError}
              </p>
            )}

            <Button type="submit" size="lg" disabled={mutation.isPending}>
              {mutation.isPending ? 'Creating workspace…' : 'Create workspace'}
            </Button>
          </FieldGroup>
        </form>

        <p className="mt-6 text-center text-sm text-muted-foreground">
          Already have an account?{' '}
          <Link to="/login" className="text-primary underline-offset-4 hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  )
}
