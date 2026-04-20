// Score prediction service. Pure function — takes the user's latest attempts
// (one per (userId, questionId) — most recent wins) and returns a
// DELF-B2-flavoured verdict + per-skill breakdown.
//
// Callers must de-duplicate attempts to latest-per-question BEFORE calling
// predictScore — this service treats its input as the source of truth.

const {
  SKILLS,
  SKILL_MAX_POINTS,
  PASS_TOTAL_MIN,
  PASS_PER_SKILL_MIN,
  CONFIDENCE_MIN_MEDIUM,
  CONFIDENCE_MIN_HIGH,
  AI_GRADED_SKILLS,
  AI_GRADED_QUESTION_TYPES,
} = require('../constants/delfScoring');

function classifyConfidence(sampleSize) {
  if (sampleSize === 0) return 'none';
  if (sampleSize < CONFIDENCE_MIN_MEDIUM) return 'low';
  if (sampleSize < CONFIDENCE_MIN_HIGH) return 'medium';
  return 'high';
}

function buildPerSkill(attempts) {
  const perSkill = {};

  for (const skill of SKILLS) {
    perSkill[skill] = {
      status: AI_GRADED_SKILLS.includes(skill) ? 'pending_ai' : 'insufficient',
      sampleSize: 0,
      attemptedPoints: 0,
      earnedPoints: 0,
      accuracyWeighted: 0,
      predictedScore: 0,
      confidence: 'none',
      belowPassGate: false,
    };
  }

  // Aggregate raw numbers.
  for (const a of attempts) {
    const skill = a.question.skill;
    if (!perSkill[skill]) continue;
    // Skip AI-graded question types in the aggregation — they always score 0
    // in grader.js and would drag accuracy to zero if counted.
    if (AI_GRADED_QUESTION_TYPES.includes(a.question.type)) continue;
    perSkill[skill].sampleSize += 1;
    perSkill[skill].attemptedPoints += a.question.points;
    perSkill[skill].earnedPoints += a.score ?? 0;
  }

  // Finalise each skill's derived fields.
  for (const skill of SKILLS) {
    const s = perSkill[skill];
    s.confidence = classifyConfidence(s.sampleSize);

    if (AI_GRADED_SKILLS.includes(skill)) {
      // PE/PO stay 'pending_ai' regardless of any data (grader returns 0 anyway).
      s.status = 'pending_ai';
      continue;
    }

    if (s.sampleSize === 0) {
      s.status = 'insufficient';
      continue;
    }

    s.accuracyWeighted = s.attemptedPoints > 0 ? s.earnedPoints / s.attemptedPoints : 0;
    s.predictedScore = Math.round(s.accuracyWeighted * SKILL_MAX_POINTS * 10) / 10; // 1 decimal
    s.belowPassGate = s.predictedScore < PASS_PER_SKILL_MIN;
    s.status = 'ready';
  }

  return perSkill;
}

function computeVerdict(perSkill) {
  const co = perSkill.CO;
  const ce = perSkill.CE;

  // Need confidence >= medium on both auto-gradable skills to judge.
  const haveData = co.status === 'ready' && ce.status === 'ready';
  if (!haveData) return 'insufficient';

  const anyBelowGate = co.belowPassGate || ce.belowPassGate;
  if (anyBelowGate) return 'at_risk_gate';

  const verified = co.predictedScore + ce.predictedScore;

  // Given CO+CE score, what's needed from PE+PO to hit 50 total?
  // If verified >= 30, PE+PO avg 10 each is enough — likely pass.
  // If verified in [20, 30), PE+PO need 15+ each — borderline.
  // If verified < 20, even max PE+PO (50) brings total to < 70 but passes would
  // need sustained performance there; we call it unlikely.
  if (verified >= 30) return 'likely_pass';
  if (verified >= 20) return 'borderline';
  return 'unlikely_pass';
}

function buildWhatIfScenarios(perSkill) {
  const co = perSkill.CO;
  const ce = perSkill.CE;
  if (co.status !== 'ready' || ce.status !== 'ready') return [];

  const verified = co.predictedScore + ce.predictedScore;
  const pairs = [
    { pePoints: 10, poPoints: 10 },
    { pePoints: 15, poPoints: 15 },
    { pePoints: 20, poPoints: 20 },
  ];
  return pairs.map(({ pePoints, poPoints }) => {
    const total = Math.round((verified + pePoints + poPoints) * 10) / 10;
    return {
      pePoints,
      poPoints,
      total,
      passes:
        total >= PASS_TOTAL_MIN &&
        !co.belowPassGate &&
        !ce.belowPassGate &&
        pePoints >= PASS_PER_SKILL_MIN &&
        poPoints >= PASS_PER_SKILL_MIN,
    };
  });
}

function computeMinPePoNeeded(perSkill) {
  const co = perSkill.CO;
  const ce = perSkill.CE;
  if (co.status !== 'ready' || ce.status !== 'ready') return null;
  if (co.belowPassGate || ce.belowPassGate) return null; // gate already failed
  const needed = PASS_TOTAL_MIN - (co.predictedScore + ce.predictedScore);
  // Clamp: min 2× PASS_PER_SKILL_MIN (must also clear per-skill gates for PE+PO).
  const gateFloor = 2 * PASS_PER_SKILL_MIN;
  return Math.max(0, Math.ceil(Math.max(needed, gateFloor) * 10) / 10);
}

function buildRecommendations(perSkill) {
  const recs = [];

  for (const skill of ['CO', 'CE']) {
    const s = perSkill[skill];
    if (s.status === 'ready' && s.belowPassGate) {
      recs.push({
        type: 'gate_risk',
        skill,
        predictedScore: s.predictedScore,
      });
    }
  }

  for (const skill of ['CO', 'CE']) {
    const s = perSkill[skill];
    if (s.sampleSize > 0 && s.sampleSize < CONFIDENCE_MIN_MEDIUM) {
      recs.push({
        type: 'sample_low',
        skill,
        sampleSize: s.sampleSize,
        needed: CONFIDENCE_MIN_MEDIUM,
      });
    }
  }

  for (const skill of ['CO', 'CE']) {
    const s = perSkill[skill];
    if (
      s.status === 'ready' &&
      !s.belowPassGate &&
      s.predictedScore < 12
    ) {
      recs.push({
        type: 'near_line',
        skill,
        predictedScore: s.predictedScore,
      });
    }
  }

  // Always nudge AI upsell for PE/PO.
  recs.push({ type: 'ai_upsell' });

  return recs.slice(0, 4);
}

function predictScore(attempts) {
  const perSkill = buildPerSkill(attempts);
  const verdict = computeVerdict(perSkill);

  const verified = perSkill.CO.predictedScore + perSkill.CE.predictedScore;
  const lowerBound = Math.round(verified * 10) / 10;
  const upperBound = Math.round((verified + 2 * SKILL_MAX_POINTS) * 10) / 10;

  return {
    perSkill,
    total: {
      lowerBound,
      upperBound,
      verifiedPoints: lowerBound, // alias for clarity on frontend
    },
    verdict,
    whatIfScenarios: buildWhatIfScenarios(perSkill),
    minPePoNeeded: computeMinPePoNeeded(perSkill),
    recommendations: buildRecommendations(perSkill),
    thresholds: {
      passTotal: PASS_TOTAL_MIN,
      passPerSkill: PASS_PER_SKILL_MIN,
      skillMax: SKILL_MAX_POINTS,
    },
  };
}

module.exports = { predictScore, classifyConfidence };
