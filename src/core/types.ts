// Core types for Sphinx Quiz System

export interface QuizMetadata {
  id: string;
  title: string;
  description?: string;
  tags?: string[];
  author?: string;
}

export interface QuizConfig {
  mode: 'static' | 'adaptive';
  questionTypes?: QuestionType[];
  questionCount?: number;
  passingThreshold: number;
  timeLimit: number | null;
  randomizeOrder: boolean;
  showCorrectAnswers: 'never' | 'after-each' | 'after-completion';
}

export interface ResultsConfig {
  persistence: ('display' | 'file' | 'webhook')[];
  filePath?: string;
  webhookUrl?: string | null;
}

export interface AdaptiveConfig {
  initialTheta: number;
  thetaRange: [number, number];
  standardErrorThreshold: number;
  minQuestions: number;
  maxQuestions: number;
  selectionMethod: 'maximum-information' | 'random';
}

export type QuestionType = 'multiple-choice' | 'multi-select' | 'free-text' | 'code-challenge';

export interface Option {
  id: string;
  text: string;
  correct: boolean;
}

export interface BaseQuestion {
  id: string;
  type: QuestionType;
  difficulty: number;
  discrimination: number;
  category?: string;
  prompt: string;
  context?: string;
  explanation?: string;
}

export interface MultipleChoiceQuestion extends BaseQuestion {
  type: 'multiple-choice';
  options: Option[];
}

export interface MultiSelectQuestion extends BaseQuestion {
  type: 'multi-select';
  options: Option[];
  scoring: 'all-or-nothing' | 'partial';
}

export interface FreeTextQuestion extends BaseQuestion {
  type: 'free-text';
  acceptedAnswers: string[];
  matchMode: 'exact' | 'contains' | 'regex';
  caseSensitive: boolean;
}

export interface TestCase {
  input: unknown[];
  expected: unknown;
  description?: string;
}

export interface CodeChallengeQuestion extends BaseQuestion {
  type: 'code-challenge';
  language: 'javascript' | 'typescript' | 'python';
  starterCode?: string;
  testCases: TestCase[];
  timeLimit: number;
}

export type Question =
  | MultipleChoiceQuestion
  | MultiSelectQuestion
  | FreeTextQuestion
  | CodeChallengeQuestion;

export interface Quiz {
  $schema?: string;
  version: string;
  metadata: QuizMetadata;
  config: QuizConfig;
  results?: ResultsConfig;
  adaptive?: AdaptiveConfig;
  questions: Question[];
}

// Runtime types

export interface Answer {
  questionId: string;
  value: string | string[];
  timestamp: number;
  timeSpent: number;
}

export interface QuestionResult {
  questionId: string;
  correct: boolean;
  score: number;
  answer: Answer;
}

export interface QuizResult {
  quizId: string;
  startTime: number;
  endTime: number;
  totalTime: number;
  questionResults: QuestionResult[];
  totalScore: number;
  maxScore: number;
  percentage: number;
  passed: boolean;
  theta?: number;
  standardError?: number;
}
