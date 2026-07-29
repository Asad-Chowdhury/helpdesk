import { beforeEach, describe, expect, it, vi } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
import { renderWithProviders } from '@/test/render'
import { UsersPage } from './UsersPage'
import { MembersError, type Member } from '@/lib/members'
import type { Me } from '@/lib/me'
import * as membersApi from '@/lib/members'
import * as meApi from '@/lib/me'

// The data layer is the seam: these tests are about what the page renders and which
// calls a click produces, not about HTTP. Real-network coverage lives in e2e/.
vi.mock('@/lib/me', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/me')>()),
  fetchMe: vi.fn(),
}))

vi.mock('@/lib/members', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/members')>()),
  fetchMembers: vi.fn(),
  addMember: vi.fn(),
  updateMember: vi.fn(),
}))

const WORKSPACE_ID = 'ws_1'

const me: Me = {
  user: { id: 'u_admin', name: 'Ada Admin', email: 'ada@example.test' },
  memberships: [
    { role: 'ADMIN', workspace: { id: WORKSPACE_ID, name: 'Acme', slug: 'acme' } },
  ],
}

function member(overrides: Partial<Member> & { id: string; user: Member['user'] }): Member {
  return {
    role: 'STAFF',
    createdAt: '2026-01-15T10:00:00.000Z',
    deactivatedAt: null,
    ...overrides,
  }
}

const adminRow = member({
  id: 'm_admin',
  role: 'ADMIN',
  user: { id: 'u_admin', name: 'Ada Admin', email: 'ada@example.test' },
})

const staffRow = member({
  id: 'm_staff',
  role: 'STAFF',
  user: { id: 'u_staff', name: 'Sam Staff', email: 'sam@example.test' },
})

const rowFor = (email: string) => screen.getByRole('row', { name: new RegExp(email) })

// Every mock gets a working default so each test starts from the same baseline and
// only overrides what it is actually about.
beforeEach(() => {
  vi.mocked(meApi.fetchMe).mockResolvedValue(me)
  vi.mocked(membersApi.fetchMembers).mockResolvedValue({ members: [adminRow, staffRow] })
  vi.mocked(membersApi.addMember).mockResolvedValue({ member: staffRow })
  vi.mocked(membersApi.updateMember).mockResolvedValue({ member: staffRow })
})

describe('UsersPage', () => {
  describe('loading and error states', () => {
    it('shows a skeleton, not a spinner, while members load', async () => {
      vi.mocked(membersApi.fetchMembers).mockReturnValue(new Promise(() => {}))

      renderWithProviders(<UsersPage />)

      // The bars are aria-hidden, so the live region is what a screen reader gets.
      expect(await screen.findByRole('status')).toHaveTextContent('Loading members…')
      expect(document.querySelectorAll('[data-slot="skeleton"]').length).toBeGreaterThan(0)
      expect(document.querySelector('.animate-spin')).toBeNull()
    })

    it('replaces the skeleton with the table once members arrive', async () => {
      renderWithProviders(<UsersPage />)

      expect(await screen.findByRole('row', { name: /ada@example.test/ })).toBeInTheDocument()
      expect(screen.queryByRole('status')).not.toBeInTheDocument()
      expect(document.querySelectorAll('[data-slot="skeleton"]')).toHaveLength(0)
    })

    it('surfaces a failed load as an alert instead of an empty table', async () => {
      vi.mocked(membersApi.fetchMembers).mockRejectedValue(
        new MembersError('Could not load members'),
      )

      renderWithProviders(<UsersPage />)

      expect(await screen.findByRole('alert')).toHaveTextContent('Could not load members')
      expect(screen.queryByRole('table')).not.toBeInTheDocument()
    })
  })

  describe('member table', () => {
    it('renders a row per member with their name, email and status', async () => {
      renderWithProviders(<UsersPage />)

      const row = await screen.findByRole('row', { name: /sam@example.test/ })
      expect(within(row).getByText('Sam Staff')).toBeInTheDocument()
      expect(within(row).getByText('Active')).toBeInTheDocument()
      // Header row plus the two members.
      expect(screen.getAllByRole('row')).toHaveLength(3)
    })

    it("marks the signed-in admin's own row", async () => {
      renderWithProviders(<UsersPage />)

      await screen.findByRole('table')
      expect(within(rowFor('ada@example.test')).getByText('You')).toBeInTheDocument()
      expect(within(rowFor('sam@example.test')).queryByText('You')).not.toBeInTheDocument()
    })

    it('shows a deactivated member as such, offering to reactivate', async () => {
      vi.mocked(membersApi.fetchMembers).mockResolvedValue({
        members: [adminRow, { ...staffRow, deactivatedAt: '2026-02-01T00:00:00.000Z' }],
      })

      renderWithProviders(<UsersPage />)

      await screen.findByRole('table')
      const row = rowFor('sam@example.test')
      expect(within(row).getByText('Deactivated')).toBeInTheDocument()
      expect(within(row).getByRole('button', { name: 'Reactivate' })).toBeInTheDocument()
      expect(within(row).queryByRole('button', { name: 'Deactivate' })).not.toBeInTheDocument()
    })
  })

  describe('last-admin protection', () => {
    it('disables role and deactivate controls for the only active admin', async () => {
      renderWithProviders(<UsersPage />)

      await screen.findByRole('table')
      const row = rowFor('ada@example.test')
      expect(within(row).getByRole('combobox', { name: 'Role for Ada Admin' })).toBeDisabled()
      expect(within(row).getByRole('button', { name: 'Deactivate' })).toBeDisabled()
    })

    it('enables them once a second admin exists', async () => {
      vi.mocked(membersApi.fetchMembers).mockResolvedValue({
        members: [adminRow, { ...staffRow, role: 'ADMIN' }],
      })

      renderWithProviders(<UsersPage />)

      await screen.findByRole('table')
      const row = rowFor('ada@example.test')
      expect(within(row).getByRole('combobox', { name: 'Role for Ada Admin' })).toBeEnabled()
      // Still disabled: an admin may not deactivate themselves, second admin or not.
      expect(within(row).getByRole('button', { name: 'Deactivate' })).toBeDisabled()
      expect(within(rowFor('sam@example.test')).getByRole('button', { name: 'Deactivate' }))
        .toBeEnabled()
    })
  })

  describe('adding a member', () => {
    it('sends the form values and shows the one-time temporary password', async () => {
      vi.mocked(membersApi.addMember).mockResolvedValue({
        member: member({
          id: 'm_new',
          user: { id: 'u_new', name: 'Mia Manager', email: 'mia@example.test' },
        }),
        temporaryPassword: 'Temp1234Secret',
      })

      const { user } = renderWithProviders(<UsersPage />)
      await screen.findByRole('table')

      await user.click(screen.getByRole('button', { name: 'Add member' }))
      const dialog = await screen.findByRole('dialog')
      await user.type(within(dialog).getByLabelText('Name'), 'Mia Manager')
      await user.type(within(dialog).getByLabelText('Email'), 'mia@example.test')
      await user.click(within(dialog).getByRole('button', { name: 'Add member' }))

      await waitFor(() =>
        expect(membersApi.addMember).toHaveBeenCalledWith(WORKSPACE_ID, {
          name: 'Mia Manager',
          email: 'mia@example.test',
          role: 'STAFF',
        }),
      )

      // Shown once and unrecoverable, so the dialog must not close on success.
      expect(await within(dialog).findByTestId('temporary-password')).toHaveTextContent(
        'Temp1234Secret',
      )
    })

    it('blocks submission and never calls the API when the email is invalid', async () => {
      const { user } = renderWithProviders(<UsersPage />)
      await screen.findByRole('table')

      await user.click(screen.getByRole('button', { name: 'Add member' }))
      const dialog = await screen.findByRole('dialog')
      await user.type(within(dialog).getByLabelText('Name'), 'Mia Manager')
      await user.type(within(dialog).getByLabelText('Email'), 'not-an-email')
      await user.click(within(dialog).getByRole('button', { name: 'Add member' }))

      expect(await within(dialog).findByText('Enter a valid email address')).toBeInTheDocument()
      expect(membersApi.addMember).not.toHaveBeenCalled()
    })

    it('puts a server field error on the matching input', async () => {
      vi.mocked(membersApi.addMember).mockRejectedValue(
        new MembersError('That person is already a member of this workspace', {
          email: 'That person is already a member of this workspace',
        }),
      )

      const { user } = renderWithProviders(<UsersPage />)
      await screen.findByRole('table')

      await user.click(screen.getByRole('button', { name: 'Add member' }))
      const dialog = await screen.findByRole('dialog')
      await user.type(within(dialog).getByLabelText('Name'), 'Sam Staff')
      await user.type(within(dialog).getByLabelText('Email'), 'sam@example.test')
      await user.click(within(dialog).getByRole('button', { name: 'Add member' }))

      expect(
        await within(dialog).findByText('That person is already a member of this workspace'),
      ).toBeInTheDocument()
    })
  })

  describe('deactivating a member', () => {
    it('asks for confirmation before deactivating', async () => {
      const { user } = renderWithProviders(<UsersPage />)
      await screen.findByRole('table')

      await user.click(
        within(rowFor('sam@example.test')).getByRole('button', { name: 'Deactivate' }),
      )

      expect(await screen.findByRole('alertdialog')).toHaveTextContent('Deactivate Sam Staff?')
      expect(membersApi.updateMember).not.toHaveBeenCalled()
    })

    it('deactivates once confirmed', async () => {
      vi.mocked(membersApi.updateMember).mockResolvedValue({
        member: { ...staffRow, deactivatedAt: '2026-02-01T00:00:00.000Z' },
      })

      const { user } = renderWithProviders(<UsersPage />)
      await screen.findByRole('table')

      await user.click(
        within(rowFor('sam@example.test')).getByRole('button', { name: 'Deactivate' }),
      )
      const confirm = await screen.findByRole('alertdialog')
      await user.click(within(confirm).getByRole('button', { name: 'Deactivate' }))

      await waitFor(() =>
        expect(membersApi.updateMember).toHaveBeenCalledWith(WORKSPACE_ID, 'm_staff', {
          active: false,
        }),
      )
    })

    it('leaves the member alone when the confirmation is cancelled', async () => {
      const { user } = renderWithProviders(<UsersPage />)
      await screen.findByRole('table')

      await user.click(
        within(rowFor('sam@example.test')).getByRole('button', { name: 'Deactivate' }),
      )
      const confirm = await screen.findByRole('alertdialog')
      await user.click(within(confirm).getByRole('button', { name: 'Cancel' }))

      await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument())
      expect(membersApi.updateMember).not.toHaveBeenCalled()
    })

    it('reports a rejected mutation in the page-level alert', async () => {
      vi.mocked(membersApi.updateMember).mockRejectedValue(
        new MembersError('This workspace must keep at least one active admin'),
      )

      const { user } = renderWithProviders(<UsersPage />)
      await screen.findByRole('table')

      await user.click(
        within(rowFor('sam@example.test')).getByRole('button', { name: 'Deactivate' }),
      )
      const confirm = await screen.findByRole('alertdialog')
      await user.click(within(confirm).getByRole('button', { name: 'Deactivate' }))

      expect(await screen.findByRole('alert')).toHaveTextContent(
        'This workspace must keep at least one active admin',
      )
    })
  })

  describe('changing a role', () => {
    it('sends the newly picked role for that member', async () => {
      vi.mocked(membersApi.updateMember).mockResolvedValue({
        member: { ...staffRow, role: 'MANAGER' },
      })

      const { user } = renderWithProviders(<UsersPage />)
      await screen.findByRole('table')

      await user.click(
        within(rowFor('sam@example.test')).getByRole('combobox', { name: 'Role for Sam Staff' }),
      )
      await user.click(await screen.findByRole('option', { name: 'Manager' }))

      await waitFor(() =>
        expect(membersApi.updateMember).toHaveBeenCalledWith(WORKSPACE_ID, 'm_staff', {
          role: 'MANAGER',
        }),
      )
    })
  })
})
