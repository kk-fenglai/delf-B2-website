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
}

export interface SubmitResult {
  sessionId: string;
  totalScore: number;
  maxScore: number;
  details: SubmitResultDetail[];
}
