-- Add categories and sub-categories for V2 dynamic questions

CREATE TABLE "categories_question" (
    "id" TEXT NOT NULL,
    "nom" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "categories_question_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "sous_categories_question" (
    "id" TEXT NOT NULL,
    "nom" TEXT NOT NULL,
    "categorieId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "sous_categories_question_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "questions" ADD COLUMN "categorieId" TEXT;
ALTER TABLE "questions" ADD COLUMN "sousCategorieId" TEXT;

CREATE UNIQUE INDEX "categories_question_nom_key" ON "categories_question"("nom");
CREATE INDEX "sous_categories_question_categorieId_idx" ON "sous_categories_question"("categorieId");
CREATE INDEX "questions_categorieId_idx" ON "questions"("categorieId");
CREATE INDEX "questions_sousCategorieId_idx" ON "questions"("sousCategorieId");

ALTER TABLE "sous_categories_question"
ADD CONSTRAINT "sous_categories_question_categorieId_fkey"
FOREIGN KEY ("categorieId") REFERENCES "categories_question"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "questions"
ADD CONSTRAINT "questions_categorieId_fkey"
FOREIGN KEY ("categorieId") REFERENCES "categories_question"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "questions"
ADD CONSTRAINT "questions_sousCategorieId_fkey"
FOREIGN KEY ("sousCategorieId") REFERENCES "sous_categories_question"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
