import { createBrowserRouter } from 'react-router'
import { RequireAuth } from '@/components/RequireAuth'
import { RequireRole } from '@/components/RequireRole'
import { HomePage } from '@/pages/HomePage'
import { LoginPage } from '@/pages/LoginPage'
import { ProfilePage } from '@/pages/ProfilePage'
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
  // Signed-in area, any role.
  {
    Component: RequireAuth,
    children: [
      {
        path: '/profile',
        Component: ProfilePage,
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
])
