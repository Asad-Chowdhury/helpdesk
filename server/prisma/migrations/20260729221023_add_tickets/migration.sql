-- CreateEnum
CREATE TYPE "TicketStatus" AS ENUM ('REQUESTED', 'OPEN', 'RESOLVED', 'CLOSED');

-- CreateEnum
CREATE TYPE "TicketPriority" AS ENUM ('LOW', 'NORMAL', 'MEDIUM', 'HIGH', 'URGENT');

-- CreateEnum
CREATE TYPE "TicketEventType" AS ENUM ('CREATED', 'STATUS_CHANGED', 'PRIORITY_CHANGED', 'ASSIGNED', 'UNASSIGNED', 'CATEGORY_CHANGED');

-- CreateTable
CREATE TABLE "ticket" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "subject" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "status" "TicketStatus" NOT NULL DEFAULT 'REQUESTED',
    "priority" "TicketPriority" NOT NULL DEFAULT 'NORMAL',
    "categoryId" TEXT,
    "requesterId" TEXT,
    "requesterName" TEXT NOT NULL,
    "requesterEmail" TEXT NOT NULL,
    "assigneeId" TEXT,
    "assigneeName" TEXT,
    "assigneeEmail" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "resolvedAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),

    CONSTRAINT "ticket_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ticket_comment" (
    "id" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "internal" BOOLEAN NOT NULL DEFAULT false,
    "authorId" TEXT,
    "authorName" TEXT NOT NULL,
    "authorEmail" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ticket_comment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ticket_event" (
    "id" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "type" "TicketEventType" NOT NULL,
    "fromValue" TEXT,
    "toValue" TEXT,
    "actorId" TEXT,
    "actorName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ticket_event_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ticket_workspaceId_status_idx" ON "ticket"("workspaceId", "status");

-- CreateIndex
CREATE INDEX "ticket_workspaceId_assigneeId_idx" ON "ticket"("workspaceId", "assigneeId");

-- CreateIndex
CREATE INDEX "ticket_workspaceId_requesterId_idx" ON "ticket"("workspaceId", "requesterId");

-- CreateIndex
CREATE INDEX "ticket_workspaceId_createdAt_idx" ON "ticket"("workspaceId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ticket_workspaceId_number_key" ON "ticket"("workspaceId", "number");

-- CreateIndex
CREATE INDEX "ticket_comment_ticketId_createdAt_idx" ON "ticket_comment"("ticketId", "createdAt");

-- CreateIndex
CREATE INDEX "ticket_comment_workspaceId_idx" ON "ticket_comment"("workspaceId");

-- CreateIndex
CREATE INDEX "ticket_event_ticketId_createdAt_idx" ON "ticket_event"("ticketId", "createdAt");

-- CreateIndex
CREATE INDEX "ticket_event_workspaceId_idx" ON "ticket_event"("workspaceId");

-- AddForeignKey
ALTER TABLE "ticket" ADD CONSTRAINT "ticket_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket" ADD CONSTRAINT "ticket_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "category"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket" ADD CONSTRAINT "ticket_requesterId_fkey" FOREIGN KEY ("requesterId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket" ADD CONSTRAINT "ticket_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_comment" ADD CONSTRAINT "ticket_comment_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "ticket"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_comment" ADD CONSTRAINT "ticket_comment_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_event" ADD CONSTRAINT "ticket_event_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "ticket"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_event" ADD CONSTRAINT "ticket_event_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;
