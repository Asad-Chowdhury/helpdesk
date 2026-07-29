import type { ReactNode } from 'react'
import { Link } from 'react-router'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'

type AuthShellProps = {
  title: string
  description: string
  children: ReactNode
  /** Rendered under the card — typically the link to the opposite auth page. */
  footer: ReactNode
}

/** Shared frame for the login and signup pages so the two can't drift apart. */
export function AuthShell({ title, description, children, footer }: AuthShellProps) {
  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-6 bg-muted/40 px-4 py-10">
      <Link
        to="/"
        className="text-lg font-semibold tracking-tight text-foreground"
        aria-label="Helpdesk home"
      >
        Helpdesk
      </Link>

      <Card className="w-full max-w-sm">
        <CardHeader>
          {/* shadcn's CardTitle renders a plain <div>, which left these pages with no
              heading at all — bad for screen readers, and it made the title
              unreachable by role. The nested h1 restores the semantics while keeping
              the card's own layout slot. */}
          <CardTitle>
            <h1 className="text-xl">{title}</h1>
          </CardTitle>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
        <CardContent>{children}</CardContent>
      </Card>

      <p className="text-sm text-muted-foreground">{footer}</p>
    </div>
  )
}
