import { createBrowserRouter } from 'react-router'
import { HomePage } from '@/pages/HomePage'
import { LoginPage } from '@/pages/LoginPage'
import { SignupPage } from '@/pages/SignupPage'

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
])
