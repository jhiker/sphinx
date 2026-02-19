import type {
  Quiz,
  Question,
  Answer,
  QuestionResult,
  QuizResult,
  MultipleChoiceQuestion,
  MultiSelectQuestion,
  FreeTextQuestion,
} from './types.js';

export interface QuizEngineOptions {
  onQuestionStart?: (question: Question, index: number, total: number) => void;
  onQuestionEnd?: (result: QuestionResult) => void;
  onQuizEnd?: (result: QuizResult) => void;
}

export interface AnswerInput {
  questionId: string;
  value: string | string[];
}

export class QuizEngine {
  private quiz: Quiz;
  private questions: Question[];
  private currentIndex: number = 0;
  private answers: Map<string, Answer> = new Map();
  private results: QuestionResult[] = [];
  private startTime: number = 0;
  private questionStartTime: number = 0;
  private options: QuizEngineOptions;
  private completed: boolean = false;

  constructor(quiz: Quiz, options: QuizEngineOptions = {}) {
    this.quiz = quiz;
    this.options = options;
    this.questions = this.prepareQuestions(quiz);
  }

  private prepareQuestions(quiz: Quiz): Question[] {
    let questions = [...quiz.questions];

    // Randomize if configured
    if (quiz.config.randomizeOrder) {
      questions = this.shuffle(questions);
    }

    // Limit question count if configured
    if (quiz.config.questionCount && quiz.config.questionCount < questions.length) {
      questions = questions.slice(0, quiz.config.questionCount);
    }

    return questions;
  }

  private shuffle<T>(array: T[]): T[] {
    const result = [...array];
    for (let i = result.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
  }

  start(): void {
    this.startTime = Date.now();
    this.currentIndex = 0;
    this.answers.clear();
    this.results = [];
    this.completed = false;
    this.questionStartTime = Date.now();

    if (this.options.onQuestionStart && this.questions.length > 0) {
      this.options.onQuestionStart(
        this.questions[0],
        0,
        this.questions.length
      );
    }
  }

  getCurrentQuestion(): Question | null {
    if (this.currentIndex >= this.questions.length) {
      return null;
    }
    return this.questions[this.currentIndex];
  }

  getProgress(): { current: number; total: number; percentage: number } {
    return {
      current: this.currentIndex + 1,
      total: this.questions.length,
      percentage: ((this.currentIndex + 1) / this.questions.length) * 100,
    };
  }

  getTimeElapsed(): number {
    return Date.now() - this.startTime;
  }

  getTimeRemaining(): number | null {
    if (!this.quiz.config.timeLimit) {
      return null;
    }
    const elapsed = this.getTimeElapsed();
    const remaining = this.quiz.config.timeLimit * 1000 - elapsed;
    return Math.max(0, remaining);
  }

  isTimeExpired(): boolean {
    const remaining = this.getTimeRemaining();
    return remaining !== null && remaining <= 0;
  }

  submitAnswer(input: AnswerInput): QuestionResult | null {
    const question = this.getCurrentQuestion();
    if (!question || question.id !== input.questionId) {
      return null;
    }

    const now = Date.now();
    const timeSpent = now - this.questionStartTime;

    const answer: Answer = {
      questionId: input.questionId,
      value: input.value,
      timestamp: now,
      timeSpent,
    };

    this.answers.set(input.questionId, answer);

    // Score the answer
    const result = this.scoreAnswer(question, answer);
    this.results.push(result);

    if (this.options.onQuestionEnd) {
      this.options.onQuestionEnd(result);
    }

    // Move to next question
    this.currentIndex++;
    this.questionStartTime = Date.now();

    if (this.currentIndex < this.questions.length) {
      if (this.options.onQuestionStart) {
        this.options.onQuestionStart(
          this.questions[this.currentIndex],
          this.currentIndex,
          this.questions.length
        );
      }
    }

    return result;
  }

  private scoreAnswer(question: Question, answer: Answer): QuestionResult {
    let correct = false;
    let score = 0;

    switch (question.type) {
      case 'multiple-choice':
        ({ correct, score } = this.scoreMultipleChoice(question, answer));
        break;
      case 'multi-select':
        ({ correct, score } = this.scoreMultiSelect(question, answer));
        break;
      case 'free-text':
        ({ correct, score } = this.scoreFreeText(question, answer));
        break;
      case 'code-challenge':
        // Code challenges require external execution - mark as pending
        ({ correct, score } = { correct: false, score: 0 });
        break;
    }

    return {
      questionId: question.id,
      correct,
      score,
      answer,
    };
  }

  private scoreMultipleChoice(
    question: MultipleChoiceQuestion,
    answer: Answer
  ): { correct: boolean; score: number } {
    const selectedId = Array.isArray(answer.value) ? answer.value[0] : answer.value;
    const correctOption = question.options.find((o) => o.correct);
    const correct = correctOption?.id === selectedId;
    return { correct, score: correct ? 1 : 0 };
  }

  private scoreMultiSelect(
    question: MultiSelectQuestion,
    answer: Answer
  ): { correct: boolean; score: number } {
    const selectedIds = new Set(
      Array.isArray(answer.value) ? answer.value : [answer.value]
    );
    const correctIds = new Set(
      question.options.filter((o) => o.correct).map((o) => o.id)
    );

    if (question.scoring === 'all-or-nothing') {
      // All correct options must be selected, no incorrect ones
      const allCorrectSelected = [...correctIds].every((id) => selectedIds.has(id));
      const noIncorrectSelected = [...selectedIds].every((id) => correctIds.has(id));
      const correct = allCorrectSelected && noIncorrectSelected;
      return { correct, score: correct ? 1 : 0 };
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

      // Score = (correct selections - incorrect selections) / total correct options
      // Minimum score is 0
      const totalCorrect = correctIds.size;
      const rawScore = (correctSelections - incorrectSelections) / totalCorrect;
      const score = Math.max(0, rawScore);
      const correct = score === 1;

      return { correct, score };
    }
  }

  private scoreFreeText(
    question: FreeTextQuestion,
    answer: Answer
  ): { correct: boolean; score: number } {
    const userAnswer = Array.isArray(answer.value) ? answer.value[0] : answer.value;
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
          matches = normalizedAnswer === normalizedAccepted;
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
        return { correct: true, score: 1 };
      }
    }

    return { correct: false, score: 0 };
  }

  isComplete(): boolean {
    return this.completed || this.currentIndex >= this.questions.length;
  }

  finish(): QuizResult {
    const endTime = Date.now();
    this.completed = true;

    const totalScore = this.results.reduce((sum, r) => sum + r.score, 0);
    const maxScore = this.results.length;
    const percentage = maxScore > 0 ? totalScore / maxScore : 0;
    const passed = percentage >= this.quiz.config.passingThreshold;

    const result: QuizResult = {
      quizId: this.quiz.metadata.id,
      startTime: this.startTime,
      endTime,
      totalTime: endTime - this.startTime,
      questionResults: this.results,
      totalScore,
      maxScore,
      percentage,
      passed,
    };

    if (this.options.onQuizEnd) {
      this.options.onQuizEnd(result);
    }

    return result;
  }

  getQuiz(): Quiz {
    return this.quiz;
  }

  getAnswers(): Map<string, Answer> {
    return new Map(this.answers);
  }

  getResults(): QuestionResult[] {
    return [...this.results];
  }
}
