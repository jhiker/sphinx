import type { Question, AdaptiveConfig, QuestionResult } from './types.js';

/**
 * Item Response Theory (IRT) Module
 * Implements the 2-Parameter Logistic (2PL) model for adaptive testing
 *
 * The 2PL model: P(θ) = 1 / (1 + exp(-a(θ - b)))
 * where:
 *   θ (theta) = ability estimate
 *   a = discrimination parameter (how well item differentiates)
 *   b = difficulty parameter (item difficulty)
 */

export interface IRTQuestion {
  id: string;
  difficulty: number;  // b parameter
  discrimination: number;  // a parameter
}

export interface IRTState {
  theta: number;  // Current ability estimate
  standardError: number;  // Standard error of theta
  responses: IRTResponse[];
  questionsAsked: Set<string>;
}

export interface IRTResponse {
  questionId: string;
  correct: boolean;
  difficulty: number;
  discrimination: number;
}

export class IRTEngine {
  private config: AdaptiveConfig;
  private state: IRTState;
  private availableQuestions: IRTQuestion[];

  constructor(config: AdaptiveConfig, questions: Question[]) {
    this.config = config;
    this.availableQuestions = questions.map((q) => ({
      id: q.id,
      difficulty: q.difficulty,
      discrimination: q.discrimination,
    }));

    this.state = {
      theta: config.initialTheta,
      standardError: Infinity,
      responses: [],
      questionsAsked: new Set(),
    };
  }

  /**
   * Calculate probability of correct response using 2PL model
   */
  private probability(theta: number, a: number, b: number): number {
    const exponent = -a * (theta - b);
    return 1 / (1 + Math.exp(exponent));
  }

  /**
   * Calculate Fisher Information for a question at given theta
   * I(θ) = a² * P(θ) * Q(θ)
   * where Q(θ) = 1 - P(θ)
   */
  private fisherInformation(theta: number, a: number, b: number): number {
    const p = this.probability(theta, a, b);
    const q = 1 - p;
    return a * a * p * q;
  }

  /**
   * Select the next question using maximum information criterion
   */
  selectNextQuestion(): IRTQuestion | null {
    const unanswered = this.availableQuestions.filter(
      (q) => !this.state.questionsAsked.has(q.id)
    );

    if (unanswered.length === 0) {
      return null;
    }

    if (this.config.selectionMethod === 'random') {
      const index = Math.floor(Math.random() * unanswered.length);
      return unanswered[index];
    }

    // Maximum information selection
    let bestQuestion = unanswered[0];
    let maxInfo = -Infinity;

    for (const question of unanswered) {
      const info = this.fisherInformation(
        this.state.theta,
        question.discrimination,
        question.difficulty
      );

      if (info > maxInfo) {
        maxInfo = info;
        bestQuestion = question;
      }
    }

    return bestQuestion;
  }

  /**
   * Record a response and update theta estimate
   */
  recordResponse(questionId: string, correct: boolean): void {
    const question = this.availableQuestions.find((q) => q.id === questionId);
    if (!question) {
      throw new Error(`Question not found: ${questionId}`);
    }

    this.state.responses.push({
      questionId,
      correct,
      difficulty: question.difficulty,
      discrimination: question.discrimination,
    });

    this.state.questionsAsked.add(questionId);

    // Update theta estimate
    this.updateTheta();
  }

  /**
   * Update theta using Maximum Likelihood Estimation (MLE)
   * with Newton-Raphson iteration
   */
  private updateTheta(): void {
    if (this.state.responses.length === 0) {
      return;
    }

    // Check for all correct or all incorrect (MLE doesn't converge)
    const allCorrect = this.state.responses.every((r) => r.correct);
    const allIncorrect = this.state.responses.every((r) => !r.correct);

    if (allCorrect) {
      // Increase theta towards upper bound
      this.state.theta = Math.min(
        this.state.theta + 0.5,
        this.config.thetaRange[1]
      );
      this.state.standardError = this.calculateStandardError();
      return;
    }

    if (allIncorrect) {
      // Decrease theta towards lower bound
      this.state.theta = Math.max(
        this.state.theta - 0.5,
        this.config.thetaRange[0]
      );
      this.state.standardError = this.calculateStandardError();
      return;
    }

    // Newton-Raphson iteration for MLE
    let theta = this.state.theta;
    const maxIterations = 25;
    const tolerance = 0.001;

    for (let i = 0; i < maxIterations; i++) {
      const { derivative, secondDerivative } = this.logLikelihoodDerivatives(theta);

      if (Math.abs(secondDerivative) < 1e-10) {
        break;
      }

      const delta = derivative / (-secondDerivative);
      theta = theta + delta;

      // Constrain to theta range
      theta = Math.max(this.config.thetaRange[0], Math.min(this.config.thetaRange[1], theta));

      if (Math.abs(delta) < tolerance) {
        break;
      }
    }

    this.state.theta = theta;
    this.state.standardError = this.calculateStandardError();
  }

  /**
   * Calculate first and second derivatives of log-likelihood
   */
  private logLikelihoodDerivatives(theta: number): {
    derivative: number;
    secondDerivative: number;
  } {
    let derivative = 0;
    let secondDerivative = 0;

    for (const response of this.state.responses) {
      const { difficulty: b, discrimination: a, correct } = response;
      const p = this.probability(theta, a, b);
      const q = 1 - p;

      const u = correct ? 1 : 0;

      // First derivative: sum of a(u - P)
      derivative += a * (u - p);

      // Second derivative: -sum of a²PQ
      secondDerivative -= a * a * p * q;
    }

    return { derivative, secondDerivative };
  }

  /**
   * Calculate standard error of theta estimate
   * SE = 1 / sqrt(I(θ)) where I is total information
   */
  private calculateStandardError(): number {
    let totalInformation = 0;

    for (const response of this.state.responses) {
      totalInformation += this.fisherInformation(
        this.state.theta,
        response.discrimination,
        response.difficulty
      );
    }

    if (totalInformation <= 0) {
      return Infinity;
    }

    return 1 / Math.sqrt(totalInformation);
  }

  /**
   * Check if stopping criterion is met
   */
  shouldStop(): boolean {
    const numQuestions = this.state.responses.length;

    // Minimum questions not yet reached
    if (numQuestions < this.config.minQuestions) {
      return false;
    }

    // Maximum questions reached
    if (numQuestions >= this.config.maxQuestions) {
      return true;
    }

    // No more questions available
    if (this.state.questionsAsked.size >= this.availableQuestions.length) {
      return true;
    }

    // Standard error threshold met
    if (this.state.standardError <= this.config.standardErrorThreshold) {
      return true;
    }

    return false;
  }

  /**
   * Get current state
   */
  getState(): IRTState {
    return { ...this.state, questionsAsked: new Set(this.state.questionsAsked) };
  }

  /**
   * Get current theta estimate
   */
  getTheta(): number {
    return this.state.theta;
  }

  /**
   * Get current standard error
   */
  getStandardError(): number {
    return this.state.standardError;
  }

  /**
   * Get number of questions answered
   */
  getQuestionCount(): number {
    return this.state.responses.length;
  }

  /**
   * Convert theta to a percentile (assuming normal distribution)
   * Uses standard normal CDF approximation
   */
  thetaToPercentile(theta: number = this.state.theta): number {
    // Standard normal CDF approximation
    const z = theta; // theta is already standardized
    const a1 = 0.254829592;
    const a2 = -0.284496736;
    const a3 = 1.421413741;
    const a4 = -1.453152027;
    const a5 = 1.061405429;
    const p = 0.3275911;

    const sign = z < 0 ? -1 : 1;
    const absZ = Math.abs(z);
    const t = 1 / (1 + p * absZ);
    const y = 1 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-absZ * absZ / 2);

    return ((1 + sign * y) / 2) * 100;
  }

  /**
   * Get proficiency level description based on theta
   */
  getProficiencyLevel(theta: number = this.state.theta): string {
    if (theta >= 2.0) return 'Expert';
    if (theta >= 1.0) return 'Advanced';
    if (theta >= 0.0) return 'Intermediate';
    if (theta >= -1.0) return 'Basic';
    return 'Novice';
  }
}

/**
 * Create an adaptive quiz engine that combines IRT with regular engine
 */
export class AdaptiveQuizEngine {
  private irt: IRTEngine;
  private questionMap: Map<string, Question>;
  private results: QuestionResult[] = [];
  private startTime: number = 0;

  constructor(config: AdaptiveConfig, questions: Question[]) {
    this.irt = new IRTEngine(config, questions);
    this.questionMap = new Map(questions.map((q) => [q.id, q]));
  }

  start(): void {
    this.startTime = Date.now();
    this.results = [];
  }

  getNextQuestion(): Question | null {
    if (this.irt.shouldStop()) {
      return null;
    }

    const irtQuestion = this.irt.selectNextQuestion();
    if (!irtQuestion) {
      return null;
    }

    return this.questionMap.get(irtQuestion.id) || null;
  }

  recordAnswer(result: QuestionResult): void {
    this.irt.recordResponse(result.questionId, result.correct);
    this.results.push(result);
  }

  shouldStop(): boolean {
    return this.irt.shouldStop();
  }

  getTheta(): number {
    return this.irt.getTheta();
  }

  getStandardError(): number {
    return this.irt.getStandardError();
  }

  getProgress(): { current: number; min: number; max: number } {
    const state = this.irt.getState();
    return {
      current: state.responses.length,
      min: this.irt['config'].minQuestions,
      max: this.irt['config'].maxQuestions,
    };
  }

  getResults(): QuestionResult[] {
    return [...this.results];
  }

  getProficiencyLevel(): string {
    return this.irt.getProficiencyLevel();
  }

  getPercentile(): number {
    return this.irt.thetaToPercentile();
  }
}
