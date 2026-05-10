-- Add per-borne I-CRM transmission channel configuration
ALTER TABLE "bornes" ADD COLUMN "canalTransmission" TEXT;

-- Allow PartageJob queries to include/filter by enregistrement and borne
CREATE INDEX "partage_jobs_enregistrementId_idx" ON "partage_jobs"("enregistrementId");

ALTER TABLE "partage_jobs"
  ADD CONSTRAINT "partage_jobs_enregistrementId_fkey"
  FOREIGN KEY ("enregistrementId") REFERENCES "enregistrements"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
