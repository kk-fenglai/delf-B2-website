-- ExamSet.year is optional: topic-based PO sets have no exam date/year.
ALTER TABLE "ExamSet" ALTER COLUMN "year" DROP NOT NULL;
