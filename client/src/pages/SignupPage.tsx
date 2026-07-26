import { useEffect } from 'react'
import { Link, useNavigate } from 'react-router'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation } from '@tanstack/react-query'
import { Loader2 } from 'lucide-react'
import { AuthShell } from '@/components/AuthShell'
import { PasswordInput } from '@/components/PasswordInput'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Field, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field'
import { SignupError, signUp } from '@/lib/signup'
import { MIN_PASSWORD_LENGTH, signupSchema, type SignupValues } from '@/lib/schemas'

export function SignupPage() {
  const navigate = useNavigate()

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<SignupValues>({
    resolver: zodResolver(signupSchema),
    defaultValues: { workspaceName: '', name: '', email: '', password: '' },
  })

  const mutation = useMutation({
    mutationFn: signUp,
    onSuccess: () => navigate('/'),
  })

  // Field-level errors from the API (409 duplicate email, 400 validation) are pushed
  // onto the matching inputs so they render in the same place as client-side ones.
  useEffect(() => {
    if (!(mutation.error instanceof SignupError)) return
    for (const [field, message] of Object.entries(mutation.error.fields)) {
      setError(field as keyof SignupValues, { type: 'server', message })
    }
  }, [mutation.error, setError])

  const formError =
    mutation.error && !(mutation.error instanceof SignupError)
      ? mutation.error.message
      : mutation.error instanceof SignupError &&
          Object.keys(mutation.error.fields).length === 0
        ? mutation.error.message
        : null

  const busy = isSubmitting || mutation.isPending

  return (
    <AuthShell
      title="Create your workspace"
      description="You'll be the admin and can invite your team afterwards."
      footer={
        <>
          Already have an account?{' '}
          <Link to="/login" className="text-foreground underline-offset-4 hover:underline">
            Sign in
          </Link>
        </>
      }
    >
      <form onSubmit={handleSubmit((values) => mutation.mutateAsync(values))} noValidate>
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="workspaceName">Workspace name</FieldLabel>
            <Input
              id="workspaceName"
              placeholder="Acme Marketing"
              autoComplete="organization"
              aria-invalid={Boolean(errors.workspaceName)}
              {...register('workspaceName')}
            />
            {errors.workspaceName && <FieldError>{errors.workspaceName.message}</FieldError>}
          </Field>

          <Field>
            <FieldLabel htmlFor="name">Your name</FieldLabel>
            <Input
              id="name"
              placeholder="Jane Doe"
              autoComplete="name"
              aria-invalid={Boolean(errors.name)}
              {...register('name')}
            />
            {errors.name && <FieldError>{errors.name.message}</FieldError>}
          </Field>

          <Field>
            <FieldLabel htmlFor="email">Work email</FieldLabel>
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
              autoComplete="new-password"
              aria-invalid={Boolean(errors.password)}
              {...register('password')}
            />
            {errors.password ? (
              <FieldError>{errors.password.message}</FieldError>
            ) : (
              <p className="text-xs text-muted-foreground">
                At least {MIN_PASSWORD_LENGTH} characters.
              </p>
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

          <Button type="submit" size="lg" className="w-full" disabled={busy}>
            {busy && <Loader2 className="animate-spin" />}
            {busy ? 'Creating workspace…' : 'Create workspace'}
          </Button>
        </FieldGroup>
      </form>
    </AuthShell>
  )
}
