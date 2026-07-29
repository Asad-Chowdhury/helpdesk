import { beforeEach, describe, expect, it, vi } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
import { renderWithProviders } from '@/test/render'
import { ProfilePage } from './ProfilePage'
import { MeError, type Me } from '@/lib/me'
import * as meApi from '@/lib/me'
import { authClient } from '@/lib/auth-client'

// Mocked at the lib/* seam, like UsersPage.test.tsx: these tests are about what the
// page renders and which call a submit produces. Real HTTP belongs in e2e/.
vi.mock('@/lib/me', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/me')>()),
  fetchMe: vi.fn(),
  updateProfile: vi.fn(),
}))

// Better Auth ships its own fetch layer, so the password form is stubbed here rather
// than at axios — changePassword never goes through lib/api.ts.
vi.mock('@/lib/auth-client', () => ({
  authClient: { changePassword: vi.fn() },
}))

const changePassword = vi.mocked(authClient.changePassword)

const me: Me = {
  user: {
    id: 'u_admin',
    name: 'Ada Admin',
    email: 'ada@example.test',
    emailVerified: false,
    createdAt: '2026-01-15T10:00:00.000Z',
  },
  memberships: [
    { role: 'ADMIN', workspace: { id: 'ws_1', name: 'Acme', slug: 'acme' } },
    { role: 'CLIENT', workspace: { id: 'ws_2', name: 'Vendor Co', slug: 'vendor-co' } },
  ],
}

beforeEach(() => {
  vi.mocked(meApi.fetchMe).mockResolvedValue(me)
  vi.mocked(meApi.updateProfile).mockResolvedValue(me)
  changePassword.mockResolvedValue({ data: { token: null }, error: null } as never)
})

describe('ProfilePage', () => {
  describe('rendering', () => {
    it('pre-fills the form with the signed-in user and lists their workspaces', async () => {
      renderWithProviders(<ProfilePage />)

      expect(await screen.findByLabelText('Name')).toHaveValue('Ada Admin')
      expect(screen.getByLabelText('Email')).toHaveValue('ada@example.test')

      // Every workspace the account belongs to, with the role it holds there.
      expect(screen.getByText('Acme')).toBeInTheDocument()
      expect(screen.getByText('Admin')).toBeInTheDocument()
      expect(screen.getByText('Vendor Co')).toBeInTheDocument()
      expect(screen.getByText('Client')).toBeInTheDocument()
    })

    it('shows an error instead of the form when the session is gone', async () => {
      vi.mocked(meApi.fetchMe).mockResolvedValue(null)

      renderWithProviders(<ProfilePage />)

      expect(await screen.findByRole('alert')).toHaveTextContent('You are not signed in.')
      expect(screen.queryByLabelText('Name')).not.toBeInTheDocument()
    })
  })

  describe('editing details', () => {
    it('keeps save disabled until something actually changes', async () => {
      const { user } = renderWithProviders(<ProfilePage />)

      const save = await screen.findByRole('button', { name: 'Save changes' })
      expect(save).toBeDisabled()

      await user.type(screen.getByLabelText('Name'), ' Jr')
      expect(save).toBeEnabled()
    })

    it('sends both fields and confirms the save', async () => {
      const updated: Me = { ...me, user: { ...me.user, name: 'Ada Lovelace' } }
      vi.mocked(meApi.updateProfile).mockResolvedValue(updated)

      const { user } = renderWithProviders(<ProfilePage />)

      const name = await screen.findByLabelText('Name')
      await user.clear(name)
      await user.type(name, 'Ada Lovelace')
      await user.click(screen.getByRole('button', { name: 'Save changes' }))

      await waitFor(() =>
        expect(meApi.updateProfile).toHaveBeenCalledWith({
          name: 'Ada Lovelace',
          email: 'ada@example.test',
        }),
      )
      expect(await screen.findByText('Saved')).toBeInTheDocument()
    })

    it('blocks submission and never calls the API for an invalid email', async () => {
      const { user } = renderWithProviders(<ProfilePage />)

      const email = await screen.findByLabelText('Email')
      await user.clear(email)
      await user.type(email, 'not-an-email')
      await user.click(screen.getByRole('button', { name: 'Save changes' }))

      expect(await screen.findByText('Enter a valid email address')).toBeInTheDocument()
      expect(meApi.updateProfile).not.toHaveBeenCalled()
    })

    it('puts a rejected email from the server onto the email input', async () => {
      vi.mocked(meApi.updateProfile).mockRejectedValue(
        new MeError('An account with that email already exists', {
          email: 'An account with that email already exists',
        }),
      )

      const { user } = renderWithProviders(<ProfilePage />)

      const email = await screen.findByLabelText('Email')
      await user.clear(email)
      await user.type(email, 'taken@example.test')
      await user.click(screen.getByRole('button', { name: 'Save changes' }))

      expect(
        await screen.findByText('An account with that email already exists'),
      ).toBeInTheDocument()
    })
  })

  describe('changing password', () => {
    async function fillPasswordForm(
      user: ReturnType<typeof renderWithProviders>['user'],
      values: { current: string; next: string; confirm: string },
    ) {
      await user.type(await screen.findByLabelText('Current password'), values.current)
      await user.type(screen.getByLabelText('New password'), values.next)
      await user.type(screen.getByLabelText('Confirm new password'), values.confirm)
      await user.click(screen.getByRole('button', { name: 'Change password' }))
    }

    it('revokes other sessions when changing the password', async () => {
      const { user } = renderWithProviders(<ProfilePage />)

      await fillPasswordForm(user, {
        current: 'oldpassword',
        next: 'newpassword123',
        confirm: 'newpassword123',
      })

      await waitFor(() =>
        expect(changePassword).toHaveBeenCalledWith({
          currentPassword: 'oldpassword',
          newPassword: 'newpassword123',
          revokeOtherSessions: true,
        }),
      )
      expect(await screen.findByText('Password updated')).toBeInTheDocument()
    })

    it('refuses a mismatched confirmation without calling the API', async () => {
      const { user } = renderWithProviders(<ProfilePage />)

      await fillPasswordForm(user, {
        current: 'oldpassword',
        next: 'newpassword123',
        confirm: 'differentpassword',
      })

      expect(await screen.findByText('Passwords do not match')).toBeInTheDocument()
      expect(changePassword).not.toHaveBeenCalled()
    })

    it('refuses a new password under the minimum length', async () => {
      const { user } = renderWithProviders(<ProfilePage />)

      await fillPasswordForm(user, { current: 'oldpassword', next: 'short', confirm: 'short' })

      expect(
        await screen.findByText('Password must be at least 8 characters'),
      ).toBeInTheDocument()
      expect(changePassword).not.toHaveBeenCalled()
    })

    it('reports a wrong current password on that field', async () => {
      changePassword.mockResolvedValue({
        data: null,
        error: { status: 400, message: 'Invalid password' },
      } as never)

      const { user } = renderWithProviders(<ProfilePage />)

      await fillPasswordForm(user, {
        current: 'wrongpassword',
        next: 'newpassword123',
        confirm: 'newpassword123',
      })

      expect(await screen.findByText('Invalid password')).toBeInTheDocument()
      expect(screen.queryByText('Password updated')).not.toBeInTheDocument()
    })

    it('reports a non-field failure in the form alert', async () => {
      changePassword.mockResolvedValue({
        data: null,
        error: { status: 500, message: 'Something went wrong' },
      } as never)

      const { user } = renderWithProviders(<ProfilePage />)

      await fillPasswordForm(user, {
        current: 'oldpassword',
        next: 'newpassword123',
        confirm: 'newpassword123',
      })

      const alert = await screen.findByRole('alert')
      expect(within(alert).getByText('Something went wrong')).toBeInTheDocument()
    })
  })
})
