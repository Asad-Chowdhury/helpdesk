import { createBrowserRouter } from 'react-router'
import { RequireRole } from '@/components/RequireRole'
import { HomePage } from '@/pages/HomePage'
import { LoginPage } from '@/pages/LoginPage'
import { SignupPage } from '@/pages/SignupPage'
import { UsersPage } from '@/pages/UsersPage'

export const router = createBrowserRouter([
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
])
