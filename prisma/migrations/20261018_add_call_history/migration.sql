-- CreateTable
CREATE TABLE IF NOT EXISTS "call_history" (
    "id" TEXT NOT NULL,
    "callId" TEXT NOT NULL,
    "callType" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "isDirect" BOOLEAN NOT NULL DEFAULT true,
    "callerId" TEXT NOT NULL,
    "recipientId" TEXT,
    "channelName" TEXT,
    "durationSeconds" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "call_history_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "call_history_callerId_idx" ON "call_history"("callerId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "call_history_recipientId_idx" ON "call_history"("recipientId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "call_history_callerId_recipientId_createdAt_idx" ON "call_history"("callerId", "recipientId", "createdAt");

-- AddForeignKey
ALTER TABLE "call_history" ADD CONSTRAINT "call_history_callerId_fkey"
    FOREIGN KEY ("callerId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "call_history" ADD CONSTRAINT "call_history_recipientId_fkey"
    FOREIGN KEY ("recipientId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
