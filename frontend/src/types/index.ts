export type Plan = 'FREE' | 'STANDARD' | 'AI' | 'AI_UNLIMITED';

export interface TrialStatus {
  enabled: boolean;
  days: number;
  plan: Plan;
  eligible: boolean;
  used: boolean;
  active: boolean;
  daysLeft: number;
  endsAt: string | null;
  usedAt: string | null;
}

export interface TrialPublicConfig {
  enabled: boolean;
  days: number;
  plan: Plan;
}

export interface PaymentsPublicConfig {
  paymentsEnabled: boolean;
  paymentsDisabledMessage?: { zh?: string; en?: string; fr?: string };
}
export type Skill = 'CO' | 'CE' | 'PE' | 'PO';
export type QuestionType = 'SINGLE' | 'MULTIPLE' | 'TRUE_FALSE' | 'TRUE_FALSE_JUSTIFY' | 'FILL' | 'ESSAY' | 'SPEAKING';

export interface User {
  id: string;
  email: string;
  name?: string;
  plan: Plan;
  effectivePlan?: Plan;
  subscriptionEnd?: string | null;
  trial?: TrialStatus;
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
  passage?: string | null;
  audioUrl?: string | null;
  /** CO-only: which AudioDocument this question belongs to. */
  audioDocumentId?: string | null;
  points: number;
  options: QuestionOption[];
  followUps?: OralFollowUp[];
}

export interface AudioDocument {
  id: string;
  order: number;
  title: string | null;
  audioUrl: string | null;
  maxPlays: number;
  prepSeconds: number;
  gapSeconds: number;
  answerSeconds: number;
}

export interface OralFollowUp {
  id: string;
  order: number;
  text: string;
  audioUrl?: string | null;
}

export interface ExamSetBrief {
  id: string;
  title: string;
  year?: number | null;
  description?: string;
  isFreePreview: boolean;
  coFormat?: 'long' | 'short' | 'other' | null;
  totalQuestions: number;
  countsBySkill: Record<Skill, number>;
}

export interface ExamSetDetail {
  id: string;
  title: string;
  year?: number | null;
  description?: string;
  questions: Question[];
  audioDocuments?: AudioDocument[];
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
  oralId?: string | null;
  oralStatus?: OralStatus | null;
}

export interface PerSkillBreakdown {
  score: number;
  maxScore: number;
  pendingAI: boolean;
}

export interface SubmitResult {
  sessionId: string;
  mode?: 'PRACTICE' | 'EXAM';
  totalScore: number;
  maxScore: number;
  perSkill?: Record<Skill, PerSkillBreakdown>;
  thresholds?: {
    passTotal: number;
    passPerSkill: number;
    skillMax: number;
  };
  details: SubmitResultDetail[];
  essays?: SubmitResponseEssay[];
  orals?: SubmitResponseOral[];
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
  modelEssay: string | null;
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

// --- AI oral grading (Production Orale) -----------------------------------

export type OralStatus = 'queued' | 'transcribing' | 'grading' | 'done' | 'error';

export type OralRubricKey =
  | 'presentation'
  | 'argumentation'
  | 'interaction'
  | 'aisance'
  | 'lexique_etendue'
  | 'lexique_maitrise'
  | 'morphosyntaxe_etendue'
  | 'morphosyntaxe_maitrise'
  | 'phonologie';

export type OralCorrectionType = 'grammar' | 'lexique' | 'syntaxe' | 'register';

export interface OralRubricDimension {
  key: OralRubricKey;
  score: number;
  max: number;
  feedback: string;
}

export interface OralCorrection {
  excerpt: string;
  issue: string;
  suggestion: string;
  type: OralCorrectionType;
}

export interface OralGradeFollowUp {
  id: string;
  order: number;
  text: string;
  recordingId: string | null;
}

export interface OralGrade {
  id: string;
  questionId: string;
  sessionId: string | null;
  status: OralStatus;
  model: ClaudeModelKey | null;
  locale: 'fr' | 'en' | 'zh' | null;
  aiScore: number | null;
  aiFeedback: string | null;
  rubric: OralRubricDimension[] | null;
  corrections: OralCorrection[] | null;
  strengths: string[] | null;
  transcriptCombined: string | null;
  recordingIds: string[];
  monologueRecordingId: string | null;
  followUps: OralGradeFollowUp[];
  errorMessage: string | null;
  gradedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface OralQuota {
  plan: Plan;
  used: number;
  monthlyCap: number;
  resetAt: string;
  allowedModels: ClaudeModelKey[];
  defaultModel: ClaudeModelKey | null;
  models: EssayModelOption[];
  thresholds: {
    totalMax: number;
    minWords: number;
    targetWords: number;
    maxWords: number;
    monologueMaxSec: number;
    followUpMaxSec: number;
    prepDefaultSec: number;
    prepPracticeSec: number;
    dimensions: Array<{ key: OralRubricKey; max: number; labelFr: string }>;
  };
}

export interface SubmitResponseOral {
  oralId: string;
  questionId: string;
  status: OralStatus;
  model: ClaudeModelKey | null;
  errorMessage: string | null;
}

export interface UploadedRecording {
  id: string;
  questionId: string;
  followUpId: string | null;
  sessionId: string | null;
  mimeType: string;
  durationSec: number;
  sizeBytes: number;
  createdAt: string;
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
  examSet: { id: string; title: string; year?: number | null; isUserOwned?: boolean };
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

// --- Subscription payments (微信 + 支付宝) --------------------------------

export type PayProvider = 'wechat' | 'alipay' | 'stripe';

export type OrderStatus = 'CREATED' | 'PENDING' | 'PAID' | 'CLOSED' | 'REFUNDED' | 'FAILED';

export interface CatalogPrice {
  id: string;
  code: string;
  /** Optional display label (admin-editable). */
  name?: string | null;
  months: number;
  currency: string;
  amountCents: number;
  supportsAutoRenew: boolean;
}

export interface CatalogProduct {
  id: string;
  code: string;
  name: string;
  plan: Exclude<Plan, 'FREE'>;
  prices: CatalogPrice[];
}

export interface PaymentOrderSummary {
  id: string;
  provider: PayProvider;
  product: string;
  plan: Plan;
  months: number;
  currency: string;
  amountCents: number;
  refundedCents: number;
  status: OrderStatus;
  paidAt: string | null;
  expiresAt: string | null;
  createdAt: string;
}

export interface CreatedOrderResponse {
  orderId: string;
  provider: PayProvider;
  product: string;
  amountCents: number;
  currency: string;
  codeUrl?: string | null;
  redirectUrl?: string | null;
  expiresAt?: string;
  mock?: boolean;
}

// --- User-owned exam sets (我的题库) -------------------------------------

export interface UserExamSetBrief {
  id: string;
  title: string;
  description?: string | null;
  primarySkill: 'CE' | 'PE' | 'CO' | 'PO';
  isPublished: boolean;
  questionCount: number;
  createdAt: string;
}

export interface UserExamSetLimits {
  CE: { used: number; cap: number; canCreate: boolean };
  PE: { used: number; cap: number; canCreate: boolean };
  CO: { used: number; cap: number; canCreate: boolean };
  PO: { used: number; cap: number; canCreate: boolean };
}

export interface UserExamQuestionInput {
  id?: string;
  skill: 'CE' | 'PE' | 'CO' | 'PO';
  type: string;
  order: number;
  prompt: string;
  passage?: string | null;
  explanation?: string | null;
  modelEssay?: string | null;
  points: number;
  audioDocumentId?: string | null;
  options: Array<{ label: string; text: string; isCorrect: boolean; order?: number }>;
  followUps?: Array<{ order: number; text: string; expectedAngle?: string | null }>;
}

export interface UserAudioDocument {
  id: string;
  order: number;
  title?: string | null;
  audioUrl?: string | null;
  maxPlays: number;
}

export interface UserExamSetDetail {
  id: string;
  title: string;
  description?: string | null;
  primarySkill: 'CE' | 'PE' | 'CO' | 'PO';
  isPublished: boolean;
  audioDocuments?: UserAudioDocument[];
  questions: Array<UserExamQuestionInput & {
    id: string;
    options?: Array<{ id: string; label: string; text: string; isCorrect: boolean; order: number }>;
    followUps?: Array<{ id: string; order: number; text: string; expectedAngle?: string | null }>;
  }>;
}
