import { beforeEach, describe, expect, it, vi } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
import { renderWithProviders } from '@/test/render'
import { TicketsPage } from './TicketsPage'
import * as ticketsApi from '@/lib/tickets'
import * as meApi from '@/lib/me'
import { TicketsError, type Ticket, type TicketFormOptions } from '@/lib/tickets'
import type { Me, Role } from '@/lib/me'

// Mocked at the lib/* seam, like UsersPage.test.tsx: these tests are about what the page
// renders and which call an interaction produces. Real HTTP belongs in e2e/.
vi.mock('@/lib/tickets', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/tickets')>()),
  fetchTickets: vi.fn(),
  fetchTicketOptions: vi.fn(),
  createTicket: vi.fn(),
}))

vi.mock('@/lib/me', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/me')>()),
  fetchMe: vi.fn(),
}))

const WORKSPACE_ID = 'ws_1'

function me(role: Role): Me {
  return {
    user: { id: 'u_me', name: 'Ada Admin', email: 'ada@acme.test' },
    memberships: [{ role, workspace: { id: WORKSPACE_ID, name: 'Acme', slug: 'acme' } }],
  }
}

const ticket = (over: Partial<Ticket> = {}): Ticket => ({
  id: 't_1',
  number: 1,
  subject: 'Rebrand the launch deck',
  status: 'OPEN',
  priority: 'HIGH',
  createdAt: '2026-07-01T10:00:00.000Z',
  updatedAt: '2026-07-01T10:00:00.000Z',
  resolvedAt: null,
  closedAt: null,
  category: { id: 'c_1', name: 'Design' },
  requester: { id: 'u_me', name: 'Ada Admin', email: 'ada@acme.test', deleted: false },
  assignee: { id: 'u_sam', name: 'Sam Staff', email: 'sam@acme.test', deleted: false },
  ...over,
})

const options: TicketFormOptions = {
  assignees: [
    { id: 'u_sam', name: 'Sam Staff', email: 'sam@acme.test', role: 'STAFF' },
    { id: 'u_mia', name: 'Mia Manager', email: 'mia@acme.test', role: 'MANAGER' },
  ],
  categories: [
    { id: 'c_1', name: 'Design' },
    { id: 'c_2', name: 'Copywriting' },
  ],
}

beforeEach(() => {
  vi.mocked(meApi.fetchMe).mockResolvedValue(me('ADMIN'))
  vi.mocked(ticketsApi.fetchTicketOptions).mockResolvedValue(options)
  vi.mocked(ticketsApi.fetchTickets).mockResolvedValue({
    tickets: [ticket()],
    total: 1,
    page: 1,
    perPage: 25,
  })
  vi.mocked(ticketsApi.createTicket).mockResolvedValue({
    ticket: { ...ticket({ id: 't_new', number: 2 }), description: 'x', comments: [], events: [] },
  })
})

describe('TicketsPage', () => {
  describe('the queue', () => {
    it('lists tickets with their number, status, priority and assignee', async () => {
      renderWithProviders(<TicketsPage />)

      const row = (await screen.findByRole('link', { name: 'Rebrand the launch deck' })).closest('tr')!
      expect(within(row).getByText('1')).toBeInTheDocument()
      expect(within(row).getByText('Open')).toBeInTheDocument()
      expect(within(row).getByText('High')).toBeInTheDocument()
      expect(within(row).getByText('Design')).toBeInTheDocument()
      expect(within(row).getByText('Sam Staff')).toBeInTheDocument()
    })

    it('scopes the query to the workspace from the membership', async () => {
      renderWithProviders(<TicketsPage />)

      await waitFor(() =>
        expect(ticketsApi.fetchTickets).toHaveBeenCalledWith(
          WORKSPACE_ID,
          expect.objectContaining({ sort: 'newest', page: 1 }),
        ),
      )
    })

    it('reports a failed load in an alert instead of an empty table', async () => {
      vi.mocked(ticketsApi.fetchTickets).mockRejectedValue(new TicketsError('Could not load tickets'))

      renderWithProviders(<TicketsPage />)

      expect(await screen.findByRole('alert')).toHaveTextContent('Could not load tickets')
    })

    it('says so when nothing matches rather than showing an empty grid', async () => {
      vi.mocked(ticketsApi.fetchTickets).mockResolvedValue({
        tickets: [], total: 0, page: 1, perPage: 25,
      })

      renderWithProviders(<TicketsPage />)

      expect(await screen.findByText('No tickets match these filters.')).toBeInTheDocument()
    })
  })

  describe('a deleted assignee', () => {
    it('still shows their name, marked as deleted', async () => {
      vi.mocked(ticketsApi.fetchTickets).mockResolvedValue({
        tickets: [
          ticket({
            assignee: { id: null, name: 'Sam Staff', email: 'sam@acme.test', deleted: true },
          }),
        ],
        total: 1,
        page: 1,
        perPage: 25,
      })

      renderWithProviders(<TicketsPage />)

      const row = (await screen.findByRole('link', { name: 'Rebrand the launch deck' })).closest('tr')!
      // The name survives on the ticket, so the record stays readable...
      expect(within(row).getByText('Sam Staff')).toBeInTheDocument()
      // ...but it must not read as a current member.
      expect(within(row).getByText('(deleted)')).toBeInTheDocument()
    })
  })

  describe('filtering', () => {
    it('sends the chosen status and resets to page 1', async () => {
      const { user } = renderWithProviders(<TicketsPage />)

      await user.click(await screen.findByRole('combobox', { name: 'Filter by status' }))
      await user.click(await screen.findByRole('option', { name: 'Resolved' }))

      await waitFor(() =>
        expect(ticketsApi.fetchTickets).toHaveBeenCalledWith(
          WORKSPACE_ID,
          expect.objectContaining({ status: ['RESOLVED'], page: 1 }),
        ),
      )
    })

    it('sends the unassigned sentinel, which a plain id filter cannot express', async () => {
      const { user } = renderWithProviders(<TicketsPage />)

      await user.click(await screen.findByRole('combobox', { name: 'Filter by assignee' }))
      await user.click(await screen.findByRole('option', { name: 'Unassigned' }))

      await waitFor(() =>
        expect(ticketsApi.fetchTickets).toHaveBeenCalledWith(
          WORKSPACE_ID,
          expect.objectContaining({ assigneeId: 'unassigned' }),
        ),
      )
    })

    it('passes the search term through', async () => {
      const { user } = renderWithProviders(<TicketsPage />)

      await user.type(await screen.findByRole('searchbox', { name: 'Search tickets' }), 'deck')

      await waitFor(() =>
        expect(ticketsApi.fetchTickets).toHaveBeenCalledWith(
          WORKSPACE_ID,
          expect.objectContaining({ q: 'deck' }),
        ),
      )
    })
  })

  describe('who may raise a ticket', () => {
    it('offers the button to a manager', async () => {
      vi.mocked(meApi.fetchMe).mockResolvedValue(me('MANAGER'))

      renderWithProviders(<TicketsPage />)

      expect(await screen.findByRole('button', { name: 'New ticket' })).toBeInTheDocument()
    })

    it('hides it from staff, who work the queue rather than raising into it', async () => {
      vi.mocked(meApi.fetchMe).mockResolvedValue(me('STAFF'))

      renderWithProviders(<TicketsPage />)

      // Wait for the page to settle before asserting an absence.
      await screen.findByRole('searchbox', { name: 'Search tickets' })
      expect(screen.queryByRole('button', { name: 'New ticket' })).not.toBeInTheDocument()
    })

    it('hides it from a client, who has no grant to raise tickets yet', async () => {
      vi.mocked(meApi.fetchMe).mockResolvedValue(me('CLIENT'))

      renderWithProviders(<TicketsPage />)

      await screen.findByRole('searchbox', { name: 'Search tickets' })
      expect(screen.queryByRole('button', { name: 'New ticket' })).not.toBeInTheDocument()
    })
  })

  describe('the queue a staff member sees', () => {
    it('drops the assignee filter and says the queue is only theirs', async () => {
      vi.mocked(meApi.fetchMe).mockResolvedValue(me('STAFF'))

      renderWithProviders(<TicketsPage />)

      // Wait on the role-dependent copy, not the searchbox: ['me'] resolves async and the
      // filter is shown by default until it does, so asserting earlier races the query.
      expect(await screen.findByText('Tickets assigned to you, or raised by you, in Acme.')).toBeInTheDocument()
      // Every value but themselves would match nothing, so the control is not offered.
      expect(
        screen.queryByRole('combobox', { name: 'Filter by assignee' }),
      ).not.toBeInTheDocument()
    })

    it('keeps the assignee filter for a manager, who sees the whole queue', async () => {
      vi.mocked(meApi.fetchMe).mockResolvedValue(me('MANAGER'))

      renderWithProviders(<TicketsPage />)

      expect(await screen.findByText('Requests in Acme.')).toBeInTheDocument()
      expect(
        screen.getByRole('combobox', { name: 'Filter by assignee' }),
      ).toBeInTheDocument()
    })
  })

  describe('raising a ticket', () => {
    it('sends the subject, description and category', async () => {
      const { user } = renderWithProviders(<TicketsPage />)

      await user.click(await screen.findByRole('button', { name: 'New ticket' }))
      await user.type(screen.getByLabelText('Subject'), 'New brochure')
      await user.type(screen.getByLabelText('Description'), 'Eight pages, A5.')
      await user.click(screen.getByRole('button', { name: 'Create ticket' }))

      await waitFor(() =>
        expect(ticketsApi.createTicket).toHaveBeenCalledWith(WORKSPACE_ID, {
          subject: 'New brochure',
          description: 'Eight pages, A5.',
          categoryId: null,
          assigneeId: null,
          priority: 'NORMAL',
        }),
      )
    })

    it('blocks submission and never calls the API without a subject', async () => {
      const { user } = renderWithProviders(<TicketsPage />)

      await user.click(await screen.findByRole('button', { name: 'New ticket' }))
      await user.type(screen.getByLabelText('Description'), 'No subject given.')
      await user.click(screen.getByRole('button', { name: 'Create ticket' }))

      expect(await screen.findByText('Subject is required')).toBeInTheDocument()
      expect(ticketsApi.createTicket).not.toHaveBeenCalled()
    })

    it('omits priority for a manager, who may not override it', async () => {
      vi.mocked(meApi.fetchMe).mockResolvedValue(me('MANAGER'))

      const { user } = renderWithProviders(<TicketsPage />)

      await user.click(await screen.findByRole('button', { name: 'New ticket' }))
      // Priority is Admin-only, so the control is not offered; assignment is a lead's
      // call, so it is.
      expect(screen.queryByLabelText('Priority')).not.toBeInTheDocument()
      expect(screen.getByLabelText('Assignee')).toBeInTheDocument()

      await user.type(screen.getByLabelText('Subject'), 'Manager request')
      await user.type(screen.getByLabelText('Description'), 'Please help.')
      await user.click(screen.getByRole('button', { name: 'Create ticket' }))

      await waitFor(() =>
        expect(ticketsApi.createTicket).toHaveBeenCalledWith(WORKSPACE_ID, {
          subject: 'Manager request',
          description: 'Please help.',
          categoryId: null,
          assigneeId: null,
        }),
      )
    })

    it('puts a server field error onto the matching input', async () => {
      vi.mocked(ticketsApi.createTicket).mockRejectedValue(
        new TicketsError('That category does not exist in this workspace', {
          categoryId: 'That category does not exist in this workspace',
        }),
      )

      const { user } = renderWithProviders(<TicketsPage />)

      await user.click(await screen.findByRole('button', { name: 'New ticket' }))
      await user.type(screen.getByLabelText('Subject'), 'Broken category')
      await user.type(screen.getByLabelText('Description'), 'Whatever.')
      await user.click(screen.getByRole('button', { name: 'Create ticket' }))

      expect(
        await screen.findByText('That category does not exist in this workspace'),
      ).toBeInTheDocument()
    })
  })
})
