export type Plan = 'FREE' | 'STANDARD' | 'AI' | 'AI_UNLIMITED';
export type Skill = 'CO' | 'CE' | 'PE' | 'PO';
export type QuestionType = 'SINGLE' | 'MULTIPLE' | 'TRUE_FALSE' | 'FILL' | 'ESSAY' | 'SPEAKING';

export interface User {
  id: string;
  email: string;
  name?: string;
  plan: Plan;
}

export interface QuestionOption {
  id: string;
  label: string;
  text: string;
  order: number;
}

export interface Question {
  id: string;
  skill: Skill;
  type: QuestionType;
  order: number;
  prompt: string;
  passage?: string;
  audioUrl?: string;
  points: number;
  options: QuestionOption[];
}

export interface ExamSetBrief {
  id: string;
  title: string;
  year: number;
  description?: string;
  isFreePreview: boolean;
  totalQuestions: number;
  countsBySkill: Record<Skill, number>;
}

export interface ExamSetDetail {
  id: string;
  title: string;
  year: number;
  description?: string;
  questions: Question[];
}

export interface SubmitResultDetail {
  questionId: string;
  userAnswer: any;
  correctAnswer: string[] | null;
  isCorrect: boolean | null;
  score: number;
  maxScore: number;
  explanation?: string;
  essayId?: string | null;
  essayStatus?: EssayStatus | null;
}

export interface SubmitResult {
  sessionId: string;
  totalScore: number;
  maxScore: number;
  details: SubmitResultDetail[];
  essays?: SubmitResponseEssay[];
}

// --- Score prediction (GET /api/user/prediction) ---

export type PredictionStatus = 'ready' | 'insufficient' | 'pending_ai';
export type PredictionConfidence = 'none' | 'low' | 'medium' | 'high';
export type PredictionVerdict =
  | 'likely_pass'
  | 'borderline'
  | 'at_risk_gate'
  | 'unlikely_pass'
  | 'insufficient';

export interface PerSkillPrediction {
  status: PredictionStatus;
  sampleSize: number;
  attemptedPoints: number;
  earnedPoints: number;
  accuracyWeighted: number;
  predictedScore: number;
  confidence: PredictionConfidence;
  belowPassGate: boolean;
}

export interface WhatIfScenario {
  pePoints: number;
  poPoints: number;
  total: number;
  passes: boolean;
}

export type RecommendationType =
  | 'gate_risk'
  | 'sample_low'
  | 'near_line'
  | 'ai_upsell';

export interface PredictionRecommendation {
  type: RecommendationType;
  skill?: Skill;
  predictedScore?: number;
  sampleSize?: number;
  needed?: number;
}

export interface Prediction {
  perSkill: Record<Skill, PerSkillPrediction>;
  total: {
    lowerBound: number;
    upperBound: number;
    verifiedPoints: number;
  };
  verdict: PredictionVerdict;
  whatIfScenarios: WhatIfScenario[];
  minPePoNeeded: number | null;
  recommendations: PredictionRecommendation[];
  thresholds: {
    passTotal: number;
    passPerSkill: number;
    skillMax: number;
  };
  totalAttempts: number;
  uniqueQuestions: number;
  lastPracticeAt: string | null;
}

// --- AI essay grading -----------------------------------------------------

// Historically this was `ClaudeModelKey`; kept the name to avoid a project-wide
// rename, but the values are now provider-agnostic (DeepSeek + Qwen). Legacy
// essay rows in DB may still carry 'haiku-4-5' etc. — render-side fallbacks
// in EssayGradeCard handle those labels.
export type ClaudeModelKey = 'qwen-turbo' | 'deepseek-chat' | 'qwen-plus';

export type ModelTier = 'fast' | 'balanced' | 'precise';

export type EssayStatus = 'queued' | 'grading' | 'done' | 'error';

export type RubricKey =
  | 'consigne'
  | 'sociolinguistique'
  | 'faits'
  | 'argumentation'
  | 'coherence'
  | 'lexique_etendue'
  | 'lexique_maitrise'
  | 'orthographe'
  | 'morphosyntaxe_etendue'
  | 'morphosyntaxe_maitrise';

export type CorrectionType = 'grammar' | 'lexique' | 'orthographe' | 'syntaxe';

export interface RubricDimension {
  key: RubricKey;
  score: number;
  max: number;
  feedback: string;
}

export interface EssayCorrection {
  excerpt: string;
  issue: string;
  suggestion: string;
  type: CorrectionType;
}

export interface EssayGrade {
  id: string;
  questionId: string;
  sessionId: string | null;
  status: EssayStatus;
  model: ClaudeModelKey | null;
  locale: 'fr' | 'en' | 'zh' | null;
  content: string;
  wordCount: number;
  aiScore: number | null;
  aiFeedback: string | null;
  rubric: RubricDimension[] | null;
  corrections: EssayCorrection[] | null;
  strengths: string[] | null;
  errorMessage: string | null;
  gradedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface EssayModelOption {
  key: ClaudeModelKey;
  label: string;
  tier: ModelTier;
}

export interface EssayQuota {
  plan: Plan;
  used: number;
  dayUsed: number;
  monthlyCap: number;
  dailyCap: number;
  resetAt: string;
  allowedModels: ClaudeModelKey[];
  defaultModel: ClaudeModelKey | null;
  models: EssayModelOption[];
  thresholds: {
    totalMax: number;
    minWords: number;
    targetWords: number;
    maxWords: number;
    dimensions: Array<{ key: RubricKey; max: number; labelFr: string }>;
  };
}

export interface SubmitResponseEssay {
  essayId: string;
  questionId: string;
  status: EssayStatus;
  model: ClaudeModelKey | null;
  errorMessage: string | null;
}

// --- Mistake notebook (错题本) -------------------------------------------

export interface MistakeItem {
  attemptId: string;
  questionId: string;
  skill: Skill;
  type: QuestionType;
  prompt: string;
  passage?: string | null;
  audioUrl?: string | null;
  explanation?: string | null;
  points: number;
  options: Array<{ id: string; label: string; text: string; isCorrect: boolean }>;
  correctAnswer: string[];
  userAnswer: string | string[];
  examSet: { id: string; title: string; year: number };
  attemptedAt: string;
}

export interface MistakesResponse {
  items: MistakeItem[];
  total: number;
  page: number;
  pageSize: number;
}

export interface MistakeStats {
  total: number;
  bySkill: Record<Skill, number>;
}
