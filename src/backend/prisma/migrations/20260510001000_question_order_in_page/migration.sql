ALTER TABLE "questions" ADD COLUMN IF NOT EXISTS "ordreDansPage" INTEGER NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS "questions_formulaireId_orderPage_ordreDansPage_idx"
ON "questions"("formulaireId", "orderPage", "ordreDansPage");
