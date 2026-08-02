import { beforeEach, describe, expect, it, vi } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
import { renderWithProviders } from '@/test/render'
import { TicketDetailPage } from './TicketDetailPage'
import * as ticketsApi from '@/lib/tickets'
import * as meApi from '@/lib/me'
import { TicketsError, type TicketDetail, type TicketFormOptions } from '@/lib/tickets'
import type { Me, Role } from '@/lib/me'

vi.mock('@/lib/tickets', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/tickets')>()),
  fetchTicket: vi.fn(),
  fetchTicketOptions: vi.fn(),
  updateTicket: vi.fn(),
  addTicketComment: vi.fn(),
  deleteTicket: vi.fn(),
}))

vi.mock('@/lib/me', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/me')>()),
  fetchMe: vi.fn(),
}))

// The page reads :ticketId from the route. MemoryRouter in renderWithProviders has no such
// param, so useParams is stubbed rather than restructuring the shared render helper.
vi.mock('react-router', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react-router')>()),
  useParams: () => ({ ticketId: 't_1' }),
  useNavigate: () => vi.fn(),
}))

const WORKSPACE_ID = 'ws_1'
const TICKET_ID = 't_1'

function me(role: Role, userId = 'u_me'): Me {
  return {
    user: { id: userId, name: 'Ada Admin', email: 'ada@acme.test' },
    memberships: [{ role, workspace: { id: WORKSPACE_ID, name: 'Acme', slug: 'acme' } }],
  }
}

const detail = (over: Partial<TicketDetail> = {}): TicketDetail => ({
  id: TICKET_ID,
  number: 42,
  subject: 'Rebrand the launch deck',
  description: 'Needs the new logo and colour tokens.',
  status: 'OPEN',
  priority: 'HIGH',
  createdAt: '2026-07-01T10:00:00.000Z',
  updatedAt: '2026-07-01T10:00:00.000Z',
  resolvedAt: null,
  closedAt: null,
  category: { id: 'c_1', name: 'Design' },
  requester: { id: 'u_me', name: 'Ada Admin', email: 'ada@acme.test', deleted: false },
  assignee: { id: 'u_sam', name: 'Sam Staff', email: 'sam@acme.test', deleted: false },
  comments: [
    {
      id: 'cm_1',
      body: 'Started on this.',
      internal: false,
      createdAt: '2026-07-01T11:00:00.000Z',
      author: { id: 'u_sam', name: 'Sam Staff', email: 'sam@acme.test', deleted: false },
    },
  ],
  events: [
    {
      id: 'ev_1',
      type: 'CREATED',
      fromValue: null,
      toValue: null,
      createdAt: '2026-07-01T10:00:00.000Z',
      actor: { id: 'u_me', name: 'Ada Admin', email: 'ada@acme.test', deleted: false },
    },
  ],
  ...over,
})

const options: TicketFormOptions = {
  assignees: [
    { id: 'u_sam', name: 'Sam Staff', email: 'sam@acme.test', role: 'STAFF' },
    { id: 'u_mia', name: 'Mia Manager', email: 'mia@acme.test', role: 'MANAGER' },
  ],
  categories: [{ id: 'c_1', name: 'Design' }],
}

beforeEach(() => {
  vi.mocked(meApi.fetchMe).mockResolvedValue(me('ADMIN'))
  vi.mocked(ticketsApi.fetchTicketOptions).mockResolvedValue(options)
  vi.mocked(ticketsApi.fetchTicket).mockResolvedValue({ ticket: detail() })
  vi.mocked(ticketsApi.updateTicket).mockResolvedValue({ ticket: detail() })
  vi.mocked(ticketsApi.addTicketComment).mockResolvedValue({
    comment: detail().comments[0]!,
  })
  vi.mocked(ticketsApi.deleteTicket).mockResolvedValue({ deleted: true })
})

describe('TicketDetailPage', () => {
  describe('rendering', () => {
    it('shows the request, its number and its badges', async () => {
      renderWithProviders(<TicketDetailPage />)

      const heading = await screen.findByRole('heading', { level: 1 })
      expect(heading).toHaveTextContent('#42 Rebrand the launch deck')
      expect(screen.getByText('Needs the new logo and colour tokens.')).toBeInTheDocument()

      // Scoped to the header: the sidebar's Status and Priority selects show these same
      // words, so an unscoped query is ambiguous.
      const header = within(heading.parentElement!)
      expect(header.getByText('Open')).toBeInTheDocument()
      expect(header.getByText('High')).toBeInTheDocument()
    })

    it('shows the conversation and the activity history', async () => {
      renderWithProviders(<TicketDetailPage />)

      expect(await screen.findByText('Started on this.')).toBeInTheDocument()
      expect(screen.getByText('raised this ticket', { exact: false })).toBeInTheDocument()
    })

    it('reports a not-found ticket in an alert', async () => {
      vi.mocked(ticketsApi.fetchTicket).mockRejectedValue(new TicketsError('Ticket not found'))

      renderWithProviders(<TicketDetailPage />)

      expect(await screen.findByRole('alert')).toHaveTextContent('Ticket not found')
    })
  })

  describe('a deleted person on the ticket', () => {
    it('keeps the assignee, comment author and event actor readable, marked deleted', async () => {
      const gone = { id: null, name: 'Sam Staff', email: 'sam@acme.test', deleted: true }
      vi.mocked(ticketsApi.fetchTicket).mockResolvedValue({
        ticket: detail({
          assignee: gone,
          comments: [{ ...detail().comments[0]!, author: gone }],
          events: [{ ...detail().events[0]!, actor: gone }],
        }),
      })

      renderWithProviders(<TicketDetailPage />)

      // The comment keeps its attribution, so the thread still makes sense.
      expect(await screen.findByText('Started on this.')).toBeInTheDocument()
      expect(screen.getAllByText('Sam Staff').length).toBeGreaterThan(0)
      expect(screen.getAllByText('(deleted)').length).toBeGreaterThan(0)
      // And the sidebar explains why nobody is assigned any more.
      expect(
        screen.getByText('Was assigned to Sam Staff, whose account has been deleted.'),
      ).toBeInTheDocument()
    })
  })

  describe('status, priority and assignee', () => {
    it('sends the new status', async () => {
      const { user } = renderWithProviders(<TicketDetailPage />)

      await user.click(await screen.findByRole('combobox', { name: 'Status' }))
      await user.click(await screen.findByRole('option', { name: 'Resolved' }))

      await waitFor(() =>
        expect(ticketsApi.updateTicket).toHaveBeenCalledWith(WORKSPACE_ID, TICKET_ID, {
          status: 'RESOLVED',
        }),
      )
    })

    it('sends null to clear the assignee, not undefined', async () => {
      const { user } = renderWithProviders(<TicketDetailPage />)

      await user.click(await screen.findByRole('combobox', { name: 'Assignee' }))
      await user.click(await screen.findByRole('option', { name: 'Unassigned' }))

      // undefined would mean "leave it alone" to the server — null is what clears it.
      await waitFor(() =>
        expect(ticketsApi.updateTicket).toHaveBeenCalledWith(WORKSPACE_ID, TICKET_ID, {
          assigneeId: null,
        }),
      )
    })

    it('survives assigning someone — the write response must carry the full detail', async () => {
      // Regression: PATCH used to return the bare ticket, with no `comments` or `events`.
      // TicketControls writes that response straight into the ['ticket'] cache, so the page
      // re-rendered with `ticket.comments === undefined` and TicketDeleteButton crashed on
      // `ticket.comments.length`. Mocking a full-detail response is the contract this test
      // pins: a write returns what a read returns.
      const assigned: TicketDetail = {
        ...detail(),
        assignee: { id: 'u_mia', name: 'Mia Manager', email: 'mia@acme.test', deleted: false },
      }
      vi.mocked(ticketsApi.updateTicket).mockResolvedValue({ ticket: assigned })

      const { user } = renderWithProviders(<TicketDetailPage />)

      await user.click(await screen.findByRole('combobox', { name: 'Assignee' }))
      await user.click(await screen.findByRole('option', { name: 'Mia Manager' }))

      await waitFor(() =>
        expect(ticketsApi.updateTicket).toHaveBeenCalledWith(WORKSPACE_ID, TICKET_ID, {
          assigneeId: 'u_mia',
        }),
      )

      // The page is still standing: heading, thread and activity all render.
      expect(await screen.findByRole('heading', { level: 1 })).toHaveTextContent('#42')
      expect(screen.getByText('Started on this.')).toBeInTheDocument()
      expect(screen.getByText('raised this ticket', { exact: false })).toBeInTheDocument()
      // And the delete button — the component that actually threw — rendered fine.
      expect(screen.getByRole('button', { name: 'Delete' })).toBeInTheDocument()
    })

    it('surfaces a refusal in the page alert', async () => {
      vi.mocked(ticketsApi.updateTicket).mockRejectedValue(
        new TicketsError('Only an admin can override priority'),
      )

      const { user } = renderWithProviders(<TicketDetailPage />)

      await user.click(await screen.findByRole('combobox', { name: 'Priority' }))
      await user.click(await screen.findByRole('option', { name: 'Low' }))

      expect(await screen.findByRole('alert')).toHaveTextContent(
        'Only an admin can override priority',
      )
    })

    it('gives a manager no priority control, since that is admin-only', async () => {
      vi.mocked(meApi.fetchMe).mockResolvedValue(me('MANAGER'))

      renderWithProviders(<TicketDetailPage />)

      // The value is still shown, with the reason it cannot be changed.
      expect(await screen.findByText('(admin only)')).toBeInTheDocument()
      expect(screen.queryByRole('combobox', { name: 'Priority' })).not.toBeInTheDocument()
      // A manager may still assign and move status.
      expect(screen.getByRole('combobox', { name: 'Assignee' })).toBeInTheDocument()
      expect(screen.getByRole('combobox', { name: 'Status' })).toBeInTheDocument()
    })

    it('lets staff move a ticket assigned to them', async () => {
      vi.mocked(meApi.fetchMe).mockResolvedValue(me('STAFF', 'u_sam'))

      renderWithProviders(<TicketDetailPage />)

      expect(await screen.findByRole('combobox', { name: 'Status' })).toBeInTheDocument()
      // But not reassign it — that is a lead's call.
      expect(screen.queryByRole('combobox', { name: 'Assignee' })).not.toBeInTheDocument()
    })

    it('gives staff no status control on someone else’s ticket', async () => {
      vi.mocked(meApi.fetchMe).mockResolvedValue(me('STAFF', 'u_other'))

      renderWithProviders(<TicketDetailPage />)

      await screen.findByRole('heading', { level: 1 })
      expect(screen.queryByRole('combobox', { name: 'Status' })).not.toBeInTheDocument()
    })
  })

  describe('commenting', () => {
    it('posts a public comment', async () => {
      const { user } = renderWithProviders(<TicketDetailPage />)

      await user.type(await screen.findByLabelText('Comment'), 'On it.')
      await user.click(screen.getByRole('button', { name: 'Comment' }))

      await waitFor(() =>
        expect(ticketsApi.addTicketComment).toHaveBeenCalledWith(WORKSPACE_ID, TICKET_ID, {
          body: 'On it.',
          internal: false,
        }),
      )
    })

    it('posts an internal note when the box is ticked', async () => {
      const { user } = renderWithProviders(<TicketDetailPage />)

      await user.click(
        await screen.findByRole('checkbox', { name: /Internal note/ }),
      )
      await user.type(screen.getByLabelText('Internal note'), 'Budget is tight.')
      await user.click(screen.getByRole('button', { name: 'Add note' }))

      await waitFor(() =>
        expect(ticketsApi.addTicketComment).toHaveBeenCalledWith(WORKSPACE_ID, TICKET_ID, {
          body: 'Budget is tight.',
          internal: true,
        }),
      )
    })

    it('refuses an empty comment without calling the API', async () => {
      const { user } = renderWithProviders(<TicketDetailPage />)

      await user.click(await screen.findByRole('button', { name: 'Comment' }))

      expect(await screen.findByText('Write something first')).toBeInTheDocument()
      expect(ticketsApi.addTicketComment).not.toHaveBeenCalled()
    })

    it('offers no internal-note option to a client', async () => {
      vi.mocked(meApi.fetchMe).mockResolvedValue(me('CLIENT'))

      renderWithProviders(<TicketDetailPage />)

      await screen.findByRole('button', { name: 'Comment' })
      expect(screen.queryByRole('checkbox', { name: /Internal note/ })).not.toBeInTheDocument()
    })

    it('marks an internal note in the thread so it is not mistaken for a client-visible reply', async () => {
      vi.mocked(ticketsApi.fetchTicket).mockResolvedValue({
        ticket: detail({
          comments: [{ ...detail().comments[0]!, internal: true, body: 'Team only.' }],
        }),
      })

      renderWithProviders(<TicketDetailPage />)

      const note = (await screen.findByText('Team only.')).closest('li')!
      expect(within(note).getByText('Internal note')).toBeInTheDocument()
    })
  })

  describe('deleting a ticket', () => {
    it('is offered to an admin and requires confirmation', async () => {
      const { user } = renderWithProviders(<TicketDetailPage />)

      await user.click(await screen.findByRole('button', { name: 'Delete' }))
      expect(ticketsApi.deleteTicket).not.toHaveBeenCalled()

      await user.click(await screen.findByRole('button', { name: 'Delete ticket' }))

      await waitFor(() =>
        expect(ticketsApi.deleteTicket).toHaveBeenCalledWith(WORKSPACE_ID, TICKET_ID),
      )
    })

    it('does nothing when the confirmation is cancelled', async () => {
      const { user } = renderWithProviders(<TicketDetailPage />)

      await user.click(await screen.findByRole('button', { name: 'Delete' }))
      await user.click(await screen.findByRole('button', { name: 'Cancel' }))

      expect(ticketsApi.deleteTicket).not.toHaveBeenCalled()
    })

    it('is hidden from a manager', async () => {
      vi.mocked(meApi.fetchMe).mockResolvedValue(me('MANAGER'))

      renderWithProviders(<TicketDetailPage />)

      await screen.findByRole('heading', { level: 1 })
      expect(screen.queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument()
      // Editing is still a manager's to do.
      expect(screen.getByRole('button', { name: 'Edit' })).toBeInTheDocument()
    })
  })

  describe('editing the request', () => {
    it('sends the changed subject and description', async () => {
      const { user } = renderWithProviders(<TicketDetailPage />)

      await user.click(await screen.findByRole('button', { name: 'Edit' }))
      const subject = screen.getByLabelText('Subject')
      await user.clear(subject)
      await user.type(subject, 'Rebrand the pitch deck')
      await user.click(screen.getByRole('button', { name: 'Save changes' }))

      await waitFor(() =>
        expect(ticketsApi.updateTicket).toHaveBeenCalledWith(WORKSPACE_ID, TICKET_ID, {
          subject: 'Rebrand the pitch deck',
          description: 'Needs the new logo and colour tokens.',
          categoryId: 'c_1',
        }),
      )
    })

    it('keeps save disabled until something changes', async () => {
      const { user } = renderWithProviders(<TicketDetailPage />)

      await user.click(await screen.findByRole('button', { name: 'Edit' }))
      expect(screen.getByRole('button', { name: 'Save changes' })).toBeDisabled()

      await user.type(screen.getByLabelText('Subject'), '!')
      expect(screen.getByRole('button', { name: 'Save changes' })).toBeEnabled()
    })

    it('is hidden from staff', async () => {
      vi.mocked(meApi.fetchMe).mockResolvedValue(me('STAFF', 'u_sam'))

      renderWithProviders(<TicketDetailPage />)

      await screen.findByRole('heading', { level: 1 })
      expect(screen.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument()
    })
  })
})
