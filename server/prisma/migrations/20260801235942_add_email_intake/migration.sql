-- CreateEnum
CREATE TYPE "TicketSource" AS ENUM ('WEB', 'EMAIL');

-- CreateEnum
CREATE TYPE "InboundEmailOutcome" AS ENUM ('TICKET_CREATED', 'COMMENT_APPENDED', 'DUPLICATE', 'DROPPED');

-- CreateEnum
CREATE TYPE "OutboundEmailStatus" AS ENUM ('QUEUED', 'SENT', 'FAILED');

-- AlterTable
ALTER TABLE "ticket" ADD COLUMN     "source" "TicketSource" NOT NULL DEFAULT 'WEB';

-- replyToken is NOT NULL UNIQUE on a table that already has rows, so it cannot be added
-- in one statement. Add it nullable, backfill, then tighten.
--
-- gen_random_uuid() is core Postgres from 13 (no pgcrypto needed); stripping the dashes
-- yields 32 lowercase hex characters — the same alphabet and length newReplyToken()
-- produces in the app, so the address parser only ever has to recognise one form.
ALTER TABLE "ticket" ADD COLUMN     "replyToken" TEXT;
UPDATE "ticket" SET "replyToken" = replace(gen_random_uuid()::text, '-', '') WHERE "replyToken" IS NULL;
ALTER TABLE "ticket" ALTER COLUMN "replyToken" SET NOT NULL;

-- AlterTable
ALTER TABLE "workspace" ADD COLUMN     "allowUnknownSenders" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "inbound_email" (
    "id" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "recipient" TEXT NOT NULL,
    "fromEmail" TEXT NOT NULL,
    "subject" TEXT,
    "outcome" "InboundEmailOutcome" NOT NULL,
    "dropReason" TEXT,
    "workspaceId" TEXT,
    "ticketId" TEXT,
    "attachments" JSONB,
    "spfResult" TEXT,
    "dkimPass" BOOLEAN,
    "spamScore" DOUBLE PRECISION,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inbound_email_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "outbound_email" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT,
    "ticketId" TEXT,
    "toEmail" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "status" "OutboundEmailStatus" NOT NULL DEFAULT 'QUEUED',
    "providerId" TEXT,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentAt" TIMESTAMP(3),

    CONSTRAINT "outbound_email_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "inbound_email_workspaceId_receivedAt_idx" ON "inbound_email"("workspaceId", "receivedAt");

-- CreateIndex
CREATE INDEX "inbound_email_fromEmail_receivedAt_idx" ON "inbound_email"("fromEmail", "receivedAt");

-- CreateIndex
CREATE UNIQUE INDEX "inbound_email_recipient_messageId_key" ON "inbound_email"("recipient", "messageId");

-- CreateIndex
CREATE INDEX "outbound_email_ticketId_createdAt_idx" ON "outbound_email"("ticketId", "createdAt");

-- CreateIndex
CREATE INDEX "outbound_email_status_createdAt_idx" ON "outbound_email"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ticket_replyToken_key" ON "ticket"("replyToken");

