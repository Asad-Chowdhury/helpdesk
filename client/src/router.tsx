import { Outlet, createBrowserRouter } from 'react-router'
import { RequireAuth } from '@/components/RequireAuth'
import { RequireRole } from '@/components/RequireRole'
import { RouteErrorBoundary } from '@/components/RouteErrorBoundary'
import { HomePage } from '@/pages/HomePage'
import { LoginPage } from '@/pages/LoginPage'
import { ProfilePage } from '@/pages/ProfilePage'
import { SignupPage } from '@/pages/SignupPage'
import { TicketDetailPage } from '@/pages/TicketDetailPage'
import { TicketsPage } from '@/pages/TicketsPage'
import { UsersPage } from '@/pages/UsersPage'

export const router = createBrowserRouter([
  {
    // Pathless root whose only job is to own the ErrorBoundary. React Router matches the
    // *closest* boundary above the route that threw, so putting it here means every page
    // is covered — including a render crash deep inside a page component, which is what
    // used to drop the user on React Router's developer-facing default screen.
    Component: () => <Outlet />,
    ErrorBoundary: RouteErrorBoundary,
    children: [
      {
        path: '/',
        Component: HomePage,
      },
      {
        path: '/signup',
        Component: SignupPage,
      },
      {
        path: '/login',
        Component: LoginPage,
      },
      // Signed-in area, any role. Tickets are here rather than behind RequireRole because
      // every role has some access to them — the server narrows what each one sees (a
      // Client gets only their own requests) and which controls come back 403.
      {
        Component: RequireAuth,
        children: [
          {
            path: '/profile',
            Component: ProfilePage,
          },
          {
            path: '/tickets',
            Component: TicketsPage,
          },
          {
            path: '/tickets/:ticketId',
            Component: TicketDetailPage,
          },
        ],
      },
      // Admin-only area. RequireRole is a pathless layout route: it renders an <Outlet />
      // for admins and a redirect or refusal for everyone else.
      {
        Component: () => <RequireRole role="ADMIN" />,
        children: [
          {
            path: '/users',
            Component: UsersPage,
          },
        ],
      },
      // Anything unmatched. Without this a bad URL renders nothing at all; throwing a 404
      // sends it to the boundary above, which has wording for exactly this case.
      {
        path: '*',
        Component: () => {
          throw new Response('Not Found', { status: 404 })
        },
      },
    ],
  },
])
