# Project Scope

## Problem

Marketing and creative teams receive work requests from multiple channels such as Slack, email, meetings, and direct messages. These requests are often incomplete, difficult to prioritize, and scattered across different systems.

This creates several operational problems:

- Incomplete briefs require multiple rounds of clarification.
- Requests are spread across different communication channels with no central queue.
- Work is prioritized based on urgency or politics rather than capacity.
- Approval processes lack visibility and frequently become bottlenecks.
- Team members spend significant time responding to status update requests.
- Managers lack reporting and analytics to understand workload, throughput, and team capacity.

Existing project management tools provide request forms, but request submission is often treated as a secondary feature, resulting in poor adoption and low-quality request data.

---

# Solution

Build a multi-tenant SaaS platform centered around a single concept: **Request Management**.

The platform standardizes the complete request lifecycle:

Request Intake
→ Validation
→ Triage
→ Routing
→ Work Execution
→ Review / Approval
→ Delivery
→ Analytics

Instead of building different software for every industry, the platform provides a reusable workflow engine that can be configured using industry-specific templates.

Each template defines:

- Request Types
- Intake Forms
- Workflow Statuses
- Routing Rules
- Approval Rules
- SLA Configuration
- Reports

The first market will be **In-house Marketing & Creative Teams**, while the underlying platform remains industry-agnostic for future expansion.

---

# Features

## 1. Workspace Management

- Multi-tenant organizations
- A workspace is provisioned with a single Admin account; the Admin then invites additional Manager/Staff members, capped by the workspace's subscription tier (team-member count)
- Team member invitations
- Roles & permissions:
  - **Admin** — full control: billing, categories, SLA configuration, roles/permissions, and the only role that can manually override a ticket's priority
  - **Manager** — near-Admin: can manage categories, SLA settings, assignment, and view team analytics; cannot manage billing or roles, and cannot override priority
  - **Staff** — works assigned tickets only; can transition a ticket between statuses (e.g. Open → Resolved) but cannot rename/add statuses, edit categories/SLA, or override priority
  - **Client** — the same entity as the Requester Portal user (Section 5), formalized as an invited role. Admin invites a Client into the workspace with a default permission of **watcher** (view/track their own tickets only). Admin can additionally grant a Client permission to **raise tickets manually** — this is a per-client grant, not a workspace-wide switch
- Workspace settings

---

## 2. Request Intake

Allow users to submit structured requests through multiple entry points.

Features:

- Dynamic form builder
- Custom request types / ticket categories — admin-editable; each category carries an SLA timeframe and feeds the auto-priority scoring
- Conditional fields
- Required field validation
- Public forms
- Internal forms
- File uploads
- Draft requests
- Email-to-ticket — inbound support emails automatically create a ticket; clients with permission can also raise a ticket manually
- Slack request submission (Future)

---

## 3. Request Queue

Centralized inbox for every incoming request.

Features:

- Unified request queue
- Search
- Filters
- Sorting
- Bulk actions
- Request details
- Activity history

---

## 4. Workflow Management

Manage requests through configurable workflows.

Features:

- Ticket statuses — fixed platform-wide in MVP: **Requested → Open → Resolved → Closed**. Labels cannot be renamed or added to by anyone, including Admin, in MVP; Staff/Manager transition a ticket between these statuses as part of normal work
- Manual assignment
- Automatic routing rules
- Priority management:
  - Levels: **Low, Normal, Medium, High, Urgent**
  - Initial priority is set automatically by the AI categorization system, based on the ticket's category and its impact on the requester
  - Priority automatically escalates as the category's SLA deadline approaches if the ticket remains unresolved
  - Only Admin can manually override priority
- Task comments
- Internal notes
- Attachments
- Deliverables

Future:

- Dependencies
- Time tracking
- Workload planning

---

## 5. Requester Portal

Allow requesters to track their own requests without requiring a paid account.

Features:

- Magic-link access
- Live request status
- Comments
- Notifications
- Deliverable download
- Request history

---

## 6. Review & Approval

Provide structured approval workflows.

Features:

- Approval chains
- Approval history
- Decision audit log

Future:

- File proofing
- Annotation
- Version comparison
- E-signatures

---

## 7. Analytics

Provide operational insights for managers.

Features:

- Request volume
- Throughput
- Cycle time
- Time in status
- SLA performance
- Bottleneck analysis
- Capacity utilization
- Demand by department
- Rework rate
- Scheduled reports
- CSV export

---

## 8. Workflow Templates

Convert the generic workflow engine into vertical-specific products.

Template configuration includes:

- Request Types
- Forms
- Routing Rules
- Workflow Statuses
- Approval Chains
- SLA Defaults
- Dashboard Configuration

Initial template:

- Marketing & Creative Operations

Future templates:

- Internal IT
- HR
- Client Services
- Construction
- Property Management

---

## 9. Automation & AI

- AI intake assistant
- Request completeness scoring
- AI categorization/classification
- Duplicate request detection
- Intelligent routing
- AI recommendations
- AI ticket summaries — condenses a ticket's thread/history for quick review
- AI-suggested brief and replies — staff-facing draft assistance, powered by the Knowledgebase (Section 10)
- Auto-generated email responses — a human-friendly initial reply when a ticket is created via email, plus scheduled follow-up emails (e.g. "still working on it, next update in 3 days") timed off the category's SLA

---

## 10. Knowledgebase & Suggestions

Capture the operational history of every resolved ticket and reuse it to speed up future requests.

Stores, per resolved ticket:

- Original brief/request details
- Deliverables
- Completion time, including a breakdown of delays (e.g. time lost waiting on external access/approvals)
- FAQ / resolution notes

Uses:

- **Requester-facing suggestions** — when a requester raises a new ticket, the system matches it against similar past tickets in the same category and surfaces a suggestion to preempt common delays.
  - Example: a Shopify conversion-tracking request previously took 7 days, 5 of which were lost waiting on client platform access. The next similar request shows: `/suggestion: ensure you provide Shopify, GTM, GA4 and Ads platform access to: XXXX@domain.com for faster service delivery.`
- **Staff-facing reference** — staff resolving a ticket can look up how similar past tickets were handled.

Note: this has a cold-start problem — suggestions have nothing to draw on until a workspace has accumulated enough resolved tickets in a given category. Early workspaces will see few or no suggestions until history builds up. Matching is scoped to a single workspace's own ticket history only (no cross-tenant matching).

---

# MVP

The initial release focuses on replacing intake spreadsheets and Slack-based request handling for marketing teams.

Included:

- Workspace management — provisioned with a single Admin account; Admin invites Manager/Staff, capped by the plan's team-member limit; roles are Admin, Manager, Staff, and Client (see Workspace Management for the permission matrix)
- Customer-facing form builder — workspace admins can create/edit request types/categories, fields, and conditional logic
- Public request forms (no bot/spam protection in MVP — see Excluded)
- Ticket categories — admin-editable, each with its own SLA timeframe
- Fixed ticket statuses: Requested, Open, Resolved, Closed — not renameable by anyone in MVP; Staff/Manager transition tickets between them
- Priority system — 5 levels (Low/Normal/Medium/High/Urgent); auto-set at intake by the AI categorization system based on category + requester impact; auto-escalates as the SLA deadline approaches; manually overridable by Admin only
- SLA setup — Admin sets an SLA timeframe per category during onboarding; drives priority escalation and email follow-up timing
- Unified ticket queue / dashboard — search, filters, sorting, bulk actions, activity history, and an overview dashboard for Admin/Manager to view and manage all tickets
- Ticket detail view
- Manual assignment
- Basic automatic routing rules
- Configurable workflow pipeline — forms, categories, and routing are workspace-editable; only the Marketing Team template ships (no multi-template switcher/marketplace UI yet)
- Request details, comments, internal notes, attachments, deliverables
- Requester Portal / Client role — invited by Admin, default "watcher" access (live status, comments, deliverable download, request history); Admin can grant a Client permission to raise tickets manually
- Email-to-ticket — inbound support emails automatically create tickets
- Auto-generated email responses — AI-drafted initial reply on email-created tickets, plus scheduled AI follow-up emails timed off the category's SLA
- Knowledgebase & suggestions — stores case history (briefs, deliverables, completion time, FAQ); surfaces requester-facing suggestions at intake and staff-facing reference during resolution (see Section 10; note the cold-start limitation)
- AI ticket summaries and AI-suggested brief/replies for staff
- Email notifications
- File uploads
- Basic analytics: request volume, throughput, cycle time, time in status, SLA performance, bottleneck analysis, category breakdown, CSV export
- Stripe subscriptions — flat per-workspace pricing tiers gated on internal team member count
- Marketing Team template (default categories, forms, statuses, routing, and SLA defaults — fully editable per workspace)
- AI intake assistant, AI categorization/classification, and knowledgebase-driven suggestions (see Section 10)
- Basic CSV import of existing backlog at onboarding

Excluded:

- Slack integration (email-to-ticket is now in MVP; Slack intake is not)
- Approval workflows
- Capacity planning
- Time tracking
- API
- SSO
- Proofing
- Multi-template switching / template marketplace UI
- Custom or renameable ticket statuses (fixed 4-status set only in MVP)
- AI completeness scoring, duplicate request detection
- Public form bot/spam protection (captcha, rate limiting)

---

# Resolved Decisions

- **Multi-tenancy data isolation model**: shared database, `tenant_id`/`workspaceId`-scoped, with tenant isolation enforced at the application layer (Prisma Client Extension/middleware wrapper) rather than native Row-Level Security. See `tech-stack.md` (Database) and `implementation-plan.md` (Phase 1).
- **Email threading**: each ticket gets a unique reply-to token; inbound replies matched against it are appended to the existing ticket instead of creating a duplicate. See `implementation-plan.md` (Phase 6).

---

# Open Questions

- **"Impact on requester" input**: the AI categorization system uses category + "impact on requester" to set initial priority — what specifically feeds this (an intake form field, account/contract tier, or something else)? Needs a concrete definition.
- **SLA escalation thresholds**: at what point(s) does priority step up a level — e.g. 50% of SLA elapsed → Medium, 75% → High, breach → Urgent? Needs explicit thresholds.
- **Seat/plan enforcement**: when an Admin tries to invite a Manager/Staff member beyond the plan's team-member cap, does it hard-block the invite or prompt an upgrade flow?
- **Inbound email mechanism**: how does email-to-ticket actually receive mail — a dedicated per-workspace inbound address, email forwarding, or a webhook-based provider (e.g. Postmark/SendGrid inbound parse)? Needs a technical decision before build.