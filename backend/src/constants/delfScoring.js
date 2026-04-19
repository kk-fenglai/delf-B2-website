// DELF B2 scoring constants. Single source of truth; imported by prediction
// service and echoed back in API responses so the frontend doesn't hardcode.

const SKILLS = ['CO', 'CE', 'PE', 'PO'];

// Each skill is graded out of 25, summing to 100.
const SKILL_MAX_POINTS = 25;
const TOTAL_MAX = 100;

// Pass rule: total >= 50 AND each skill >= 5 (note éliminatoire).
const PASS_TOTAL_MIN = 50;
const PASS_PER_SKILL_MIN = 5;

// Sample-size cutoffs for confidence labelling.
const CONFIDENCE_MIN_MEDIUM = 5;
const CONFIDENCE_MIN_HIGH = 15;

// Skills that require human/AI evaluation — grader.js returns score=0 for
// these by design. Treated as "pending" in predictions.
const AI_GRADED_SKILLS = ['PE', 'PO'];
const AI_GRADED_QUESTION_TYPES = ['ESSAY', 'SPEAKING'];

module.exports = {
  SKILLS,
  SKILL_MAX_POINTS,
  TOTAL_MAX,
  PASS_TOTAL_MIN,
  PASS_PER_SKILL_MIN,
  CONFIDENCE_MIN_MEDIUM,
  CONFIDENCE_MIN_HIGH,
  AI_GRADED_SKILLS,
  AI_GRADED_QUESTION_TYPES,
};
