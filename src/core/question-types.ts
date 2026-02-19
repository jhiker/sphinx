import type {
  Question,
  MultipleChoiceQuestion,
  MultiSelectQuestion,
  FreeTextQuestion,
  CodeChallengeQuestion,
  Option,
} from './types.js';

/**
 * Question type utilities for validation, scoring, and display
 */

export interface ScoringResult {
  correct: boolean;
  score: number;
  feedback?: string;
}

/**
 * Validate answer format for a question type
 */
export function validateAnswer(question: Question, answer: string | string[]): boolean {
  switch (question.type) {
    case 'multiple-choice':
      return validateMultipleChoiceAnswer(question, answer);
    case 'multi-select':
      return validateMultiSelectAnswer(question, answer);
    case 'free-text':
      return validateFreeTextAnswer(answer);
    case 'code-challenge':
      return validateCodeChallengeAnswer(answer);
  }
}

function validateMultipleChoiceAnswer(
  question: MultipleChoiceQuestion,
  answer: string | string[]
): boolean {
  const selected = Array.isArray(answer) ? answer[0] : answer;
  return question.options.some((o) => o.id === selected);
}

function validateMultiSelectAnswer(
  question: MultiSelectQuestion,
  answer: string | string[]
): boolean {
  const selected = Array.isArray(answer) ? answer : [answer];
  const validIds = new Set(question.options.map((o) => o.id));
  return selected.every((id) => validIds.has(id));
}

function validateFreeTextAnswer(answer: string | string[]): boolean {
  const text = Array.isArray(answer) ? answer[0] : answer;
  return typeof text === 'string' && text.trim().length > 0;
}

function validateCodeChallengeAnswer(answer: string | string[]): boolean {
  const code = Array.isArray(answer) ? answer[0] : answer;
  return typeof code === 'string' && code.trim().length > 0;
}

/**
 * Score an answer for a question
 */
export function scoreAnswer(question: Question, answer: string | string[]): ScoringResult {
  switch (question.type) {
    case 'multiple-choice':
      return scoreMultipleChoice(question, answer);
    case 'multi-select':
      return scoreMultiSelect(question, answer);
    case 'free-text':
      return scoreFreeText(question, answer);
    case 'code-challenge':
      // Code challenges need external execution
      return { correct: false, score: 0, feedback: 'Code execution not yet evaluated' };
  }
}

function scoreMultipleChoice(
  question: MultipleChoiceQuestion,
  answer: string | string[]
): ScoringResult {
  const selected = Array.isArray(answer) ? answer[0] : answer;
  const correctOption = question.options.find((o) => o.correct);
  const correct = correctOption?.id === selected;

  return {
    correct,
    score: correct ? 1 : 0,
    feedback: correct
      ? 'Correct!'
      : `Incorrect. The correct answer was: ${correctOption?.text}`,
  };
}

function scoreMultiSelect(
  question: MultiSelectQuestion,
  answer: string | string[]
): ScoringResult {
  const selectedIds = new Set(Array.isArray(answer) ? answer : [answer]);
  const correctIds = new Set(question.options.filter((o) => o.correct).map((o) => o.id));

  if (question.scoring === 'all-or-nothing') {
    const allCorrectSelected = [...correctIds].every((id) => selectedIds.has(id));
    const noIncorrectSelected = [...selectedIds].every((id) => correctIds.has(id));
    const correct = allCorrectSelected && noIncorrectSelected;

    const correctOptions = question.options
      .filter((o) => o.correct)
      .map((o) => o.text)
      .join(', ');

    return {
      correct,
      score: correct ? 1 : 0,
      feedback: correct
        ? 'Correct!'
        : `Incorrect. The correct answers were: ${correctOptions}`,
    };
  } else {
    // Partial scoring
    let correctSelections = 0;
    let incorrectSelections = 0;

    for (const id of selectedIds) {
      if (correctIds.has(id)) {
        correctSelections++;
      } else {
        incorrectSelections++;
      }
    }

    const totalCorrect = correctIds.size;
    const rawScore = (correctSelections - incorrectSelections) / totalCorrect;
    const score = Math.max(0, rawScore);
    const correct = score === 1;

    const percentage = Math.round(score * 100);
    const correctOptions = question.options
      .filter((o) => o.correct)
      .map((o) => o.text)
      .join(', ');

    return {
      correct,
      score,
      feedback: correct
        ? 'Correct!'
        : `Partial credit: ${percentage}%. The correct answers were: ${correctOptions}`,
    };
  }
}

function scoreFreeText(
  question: FreeTextQuestion,
  answer: string | string[]
): ScoringResult {
  const userAnswer = Array.isArray(answer) ? answer[0] : answer;
  const normalizedAnswer = question.caseSensitive
    ? userAnswer
    : userAnswer.toLowerCase();

  for (const accepted of question.acceptedAnswers) {
    const normalizedAccepted = question.caseSensitive
      ? accepted
      : accepted.toLowerCase();

    let matches = false;

    switch (question.matchMode) {
      case 'exact':
        matches = normalizedAnswer.trim() === normalizedAccepted.trim();
        break;
      case 'contains':
        matches = normalizedAnswer.includes(normalizedAccepted);
        break;
      case 'regex':
        try {
          const flags = question.caseSensitive ? '' : 'i';
          const regex = new RegExp(accepted, flags);
          matches = regex.test(userAnswer);
        } catch {
          matches = false;
        }
        break;
    }

    if (matches) {
      return { correct: true, score: 1, feedback: 'Correct!' };
    }
  }

  return {
    correct: false,
    score: 0,
    feedback: `Incorrect. Accepted answers include: ${question.acceptedAnswers[0]}`,
  };
}

/**
 * Get correct answer(s) for display
 */
export function getCorrectAnswers(question: Question): string[] {
  switch (question.type) {
    case 'multiple-choice': {
      const correct = question.options.find((o) => o.correct);
      return correct ? [correct.text] : [];
    }
    case 'multi-select':
      return question.options.filter((o) => o.correct).map((o) => o.text);
    case 'free-text':
      return question.acceptedAnswers;
    case 'code-challenge':
      return ['(Code solution required)'];
  }
}

/**
 * Format question for display (plain text)
 */
export function formatQuestionText(question: Question): string {
  let text = question.prompt;

  if (question.context) {
    text += '\n\n' + question.context;
  }

  return text;
}

/**
 * Format options for display
 */
export function formatOptions(options: Option[]): string[] {
  return options.map((o, i) => {
    const letter = String.fromCharCode(65 + i); // A, B, C, ...
    return `${letter}. ${o.text}`;
  });
}

/**
 * Get question type display name
 */
export function getQuestionTypeName(type: Question['type']): string {
  switch (type) {
    case 'multiple-choice':
      return 'Multiple Choice';
    case 'multi-select':
      return 'Select All That Apply';
    case 'free-text':
      return 'Free Response';
    case 'code-challenge':
      return 'Code Challenge';
  }
}

/**
 * Get instructions for question type
 */
export function getQuestionInstructions(question: Question): string {
  switch (question.type) {
    case 'multiple-choice':
      return 'Select one answer:';
    case 'multi-select':
      return 'Select all that apply:';
    case 'free-text':
      return 'Type your answer:';
    case 'code-challenge':
      return `Write your solution in ${question.language}:`;
  }
}

/**
 * Check if a question type supports partial credit
 */
export function supportsPartialCredit(question: Question): boolean {
  return question.type === 'multi-select' && question.scoring === 'partial';
}

/**
 * Get the maximum score for a question
 */
export function getMaxScore(question: Question): number {
  // All questions have a max score of 1 in our system
  return 1;
}

/**
 * Shuffle options (for randomization)
 */
export function shuffleOptions(options: Option[]): Option[] {
  const result = [...options];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}
