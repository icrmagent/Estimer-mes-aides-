-- CreateTable
CREATE TABLE "configurations" (
    "id" SERIAL NOT NULL,
    "formDefinition" JSONB NOT NULL,
    "version" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "configurations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "submissions" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "configVersion" TEXT NOT NULL,
    "synced" BOOLEAN NOT NULL DEFAULT false,
    "syncedAt" TIMESTAMP(3),
    "crmProjectId" TEXT,

    CONSTRAINT "submissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "submission_values" (
    "id" SERIAL NOT NULL,
    "submissionId" TEXT NOT NULL,
    "fieldId" INTEGER NOT NULL,
    "value" TEXT NOT NULL,

    CONSTRAINT "submission_values_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "submissions_synced_createdAt_idx" ON "submissions"("synced", "createdAt");

-- CreateIndex
CREATE INDEX "submission_values_submissionId_idx" ON "submission_values"("submissionId");

-- CreateIndex
CREATE INDEX "submission_values_fieldId_idx" ON "submission_values"("fieldId");

-- AddForeignKey
ALTER TABLE "submission_values" ADD CONSTRAINT "submission_values_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "submissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
