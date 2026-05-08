-- ─── UP ──────────────────────────────────────────────────────────────────────
-- CreateTable: formulaire_versions

CREATE TABLE "formulaire_versions" (
    "id"           TEXT NOT NULL,
    "formulaireId" TEXT NOT NULL,
    "version"      TEXT NOT NULL,
    "snapshot"     JSONB NOT NULL,
    "changedBy"    TEXT NOT NULL,
    "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "formulaire_versions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "formulaire_versions_formulaireId_createdAt_idx" ON "formulaire_versions"("formulaireId", "createdAt");

-- AddForeignKey
ALTER TABLE "formulaire_versions" ADD CONSTRAINT "formulaire_versions_formulaireId_fkey"
    FOREIGN KEY ("formulaireId") REFERENCES "formulaires"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ─── DOWN ─────────────────────────────────────────────────────────────────────
-- Rollback: drop the table and its index (index is dropped automatically with the table)
-- DROP TABLE IF EXISTS "formulaire_versions";
