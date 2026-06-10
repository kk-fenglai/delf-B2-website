-- Index the FK so loading a question's options (WHERE questionId = / IN (...))
-- uses an index instead of a sequential scan.
-- CreateIndex
CREATE INDEX "QuestionOption_questionId_idx" ON "QuestionOption"("questionId");
