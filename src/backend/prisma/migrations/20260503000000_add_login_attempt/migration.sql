-- CreateTable: login_attempts (brute force protection — DB fallback when Redis unavailable)
CREATE TABLE "login_attempts" (
    "id"          TEXT NOT NULL,
    "ip"          TEXT NOT NULL,
    "attempts"    INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" TIMESTAMP(3),
    "updatedAt"   TIMESTAMP(3) NOT NULL,

    CONSTRAINT "login_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "login_attempts_ip_key" ON "login_attempts"("ip");
CREATE INDEX "login_attempts_ip_idx" ON "login_attempts"("ip");
CREATE INDEX "login_attempts_lockedUntil_idx" ON "login_attempts"("lockedUntil");

-- DOWN (rollback)
-- DROP TABLE "login_attempts";
