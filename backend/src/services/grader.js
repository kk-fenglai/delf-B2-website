// Auto-grading logic for DELF B2 question types (MVP: objective questions only)

function normalize(val) {
  if (Array.isArray(val)) return val.map(String).map((s) => s.trim().toUpperCase()).sort();
  return [String(val).trim().toUpperCase()];
}

function gradeAnswer(question, userAnswer) {
  const correctLabels = question.options
    .filter((o) => o.isCorrect)
    .map((o) => o.label.toUpperCase())
    .sort();

  switch (question.type) {
    case 'SINGLE':
    case 'TRUE_FALSE': {
      const ua = normalize(userAnswer);
      const isCorrect = ua.length === 1 && correctLabels.length === 1 && ua[0] === correctLabels[0];
      return { isCorrect, score: isCorrect ? question.points : 0 };
    }
    case 'MULTIPLE': {
      const ua = normalize(userAnswer);
      const same =
        ua.length === correctLabels.length && ua.every((v, i) => v === correctLabels[i]);
      return { isCorrect: same, score: same ? question.points : 0 };
    }
    case 'FILL': {
      // Simple case-insensitive match: correct options' text store accepted answers
      const expected = question.options
        .filter((o) => o.isCorrect)
        .map((o) => o.text.trim().toLowerCase());
      const u = String(userAnswer || '').trim().toLowerCase();
      const isCorrect = expected.includes(u);
      return { isCorrect, score: isCorrect ? question.points : 0 };
    }
    case 'TRUE_FALSE_JUSTIFY': {
      // V/F choice is auto-graded; justification requires human/AI review.
      // Wrong V/F → 0 immediately. Correct V/F → pending (isCorrect: null).
      let parsed = {};
      try { parsed = JSON.parse(String(userAnswer || '{}')); } catch { /* ignore */ }
      const choice = String(parsed.choice || '').trim().toUpperCase();
      const vfCorrect = correctLabels.length === 1 && choice === correctLabels[0];
      if (!vfCorrect) return { isCorrect: false, score: 0 };
      return { isCorrect: null, score: 0 }; // justification pending review
    }
    case 'ESSAY':
    case 'SPEAKING':
      // Not auto-graded in MVP (requires AI correction — Phase 3)
      return { isCorrect: null, score: 0 };
    default:
      return { isCorrect: false, score: 0 };
  }
}

module.exports = { gradeAnswer };
