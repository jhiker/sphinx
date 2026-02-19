import type { Quiz, Question, QuizResult, QuestionResult } from '../core/types.js';
import { getCorrectAnswers, getQuestionTypeName } from '../core/question-types.js';

export interface CLIRendererOptions {
  color?: boolean;
}

// ANSI color codes
const colors = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m',
};

export class CLIRenderer {
  private useColor: boolean;

  constructor(options: CLIRendererOptions = {}) {
    this.useColor = options.color !== false;
  }

  private color(text: string, colorCode: string): string {
    if (!this.useColor) return text;
    return `${colorCode}${text}${colors.reset}`;
  }

  private bold(text: string): string {
    return this.color(text, colors.bold);
  }

  private dim(text: string): string {
    return this.color(text, colors.dim);
  }

  private green(text: string): string {
    return this.color(text, colors.green);
  }

  private red(text: string): string {
    return this.color(text, colors.red);
  }

  private yellow(text: string): string {
    return this.color(text, colors.yellow);
  }

  private blue(text: string): string {
    return this.color(text, colors.blue);
  }

  private cyan(text: string): string {
    return this.color(text, colors.cyan);
  }

  renderHeader(quiz: Quiz): void {
    console.log();
    console.log(this.bold('═'.repeat(60)));
    console.log(this.bold(this.cyan(`  ${quiz.metadata.title}`)));
    console.log(this.bold('═'.repeat(60)));
    console.log();

    if (quiz.metadata.description) {
      console.log(this.dim(quiz.metadata.description));
      console.log();
    }

    console.log(this.dim(`Questions: ${quiz.questions.length}`));
    console.log(this.dim(`Passing: ${(quiz.config.passingThreshold * 100).toFixed(0)}%`));
    console.log(this.dim(`Mode: ${quiz.config.mode}`));

    if (quiz.config.timeLimit) {
      const minutes = Math.floor(quiz.config.timeLimit / 60);
      const seconds = quiz.config.timeLimit % 60;
      console.log(this.dim(`Time Limit: ${minutes}m ${seconds}s`));
    }

    console.log();
  }

  renderQuestion(
    question: Question,
    current: number,
    total: number,
    extra?: string
  ): void {
    console.log();
    console.log(this.bold('─'.repeat(60)));

    const progress = this.renderProgressBar(current, total, 20);
    const header = `Question ${current}/${total} ${progress}`;
    console.log(this.blue(header));

    if (extra) {
      console.log(this.dim(extra));
    }

    console.log(this.dim(`[${getQuestionTypeName(question.type)}]`));
    console.log();

    console.log(this.bold(question.prompt));

    if (question.context) {
      console.log();
      console.log(this.dim('Context:'));
      console.log(question.context);
    }

    if (question.type === 'multiple-choice' || question.type === 'multi-select') {
      console.log();
      question.options.forEach((option, index) => {
        const letter = String.fromCharCode(65 + index);
        console.log(`  ${this.cyan(letter)}. ${option.text}`);
      });
    }
  }

  private renderProgressBar(current: number, total: number, width: number): string {
    const filled = Math.round((current / total) * width);
    const empty = width - filled;
    const bar = '█'.repeat(filled) + '░'.repeat(empty);
    const percent = Math.round((current / total) * 100);
    return `[${bar}] ${percent}%`;
  }

  renderQuestionResult(result: QuestionResult, question: Question): void {
    console.log();

    if (result.correct) {
      console.log(this.green('✓ Correct!'));
    } else {
      console.log(this.red('✗ Incorrect'));

      const correctAnswers = getCorrectAnswers(question);
      if (correctAnswers.length > 0) {
        console.log(this.dim(`Correct answer: ${correctAnswers.join(', ')}`));
      }
    }

    if (question.explanation) {
      console.log();
      console.log(this.dim('Explanation:'));
      console.log(this.dim(question.explanation));
    }

    console.log();
  }

  renderResults(result: QuizResult, quiz: Quiz): void {
    console.log();
    console.log(this.bold('═'.repeat(60)));
    console.log(this.bold(this.cyan('  RESULTS')));
    console.log(this.bold('═'.repeat(60)));
    console.log();

    // Score
    const scorePercent = (result.percentage * 100).toFixed(1);
    const scoreColor = result.passed ? this.green.bind(this) : this.red.bind(this);
    console.log(`Score: ${scoreColor(`${result.totalScore}/${result.maxScore} (${scorePercent}%)`)}`);

    // Pass/Fail
    if (result.passed) {
      console.log(this.green(this.bold('Status: PASSED ✓')));
    } else {
      console.log(this.red(this.bold('Status: FAILED ✗')));
      console.log(this.dim(`Required: ${(quiz.config.passingThreshold * 100).toFixed(0)}%`));
    }

    // Time
    const totalSeconds = Math.round(result.totalTime / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    console.log(this.dim(`Time: ${minutes}m ${seconds}s`));

    // IRT results if adaptive
    if (result.theta !== undefined) {
      console.log();
      console.log(this.bold('Adaptive Testing Results:'));
      console.log(`  Ability (θ): ${result.theta.toFixed(2)}`);
      if (result.standardError !== undefined) {
        console.log(`  Standard Error: ±${result.standardError.toFixed(2)}`);
      }
      console.log(`  Proficiency: ${this.getProficiencyLevel(result.theta)}`);
    }

    // Category breakdown
    const categoryResults = this.calculateCategoryResults(result, quiz);
    if (categoryResults.size > 0) {
      console.log();
      console.log(this.bold('Results by Category:'));
      for (const [category, stats] of categoryResults) {
        const catPercent = ((stats.correct / stats.total) * 100).toFixed(0);
        const catColor = stats.correct / stats.total >= quiz.config.passingThreshold
          ? this.green.bind(this)
          : this.yellow.bind(this);
        console.log(`  ${category}: ${catColor(`${stats.correct}/${stats.total} (${catPercent}%)`)}`);
      }
    }

    // Question review
    if (quiz.config.showCorrectAnswers === 'after-completion') {
      const incorrectResults = result.questionResults.filter((r) => !r.correct);
      if (incorrectResults.length > 0) {
        console.log();
        console.log(this.bold('Questions to Review:'));
        for (const qr of incorrectResults) {
          const question = quiz.questions.find((q) => q.id === qr.questionId);
          if (question) {
            console.log();
            console.log(this.red(`  ✗ ${question.prompt.substring(0, 60)}...`));
            const correct = getCorrectAnswers(question);
            console.log(this.dim(`    Correct: ${correct.join(', ')}`));
          }
        }
      }
    }

    console.log();
    console.log(this.bold('─'.repeat(60)));
    console.log();
  }

  private calculateCategoryResults(
    result: QuizResult,
    quiz: Quiz
  ): Map<string, { correct: number; total: number }> {
    const categoryMap = new Map<string, { correct: number; total: number }>();

    for (const qr of result.questionResults) {
      const question = quiz.questions.find((q) => q.id === qr.questionId);
      if (!question?.category) continue;

      const stats = categoryMap.get(question.category) || { correct: 0, total: 0 };
      stats.total++;
      if (qr.correct) stats.correct++;
      categoryMap.set(question.category, stats);
    }

    return categoryMap;
  }

  private getProficiencyLevel(theta: number): string {
    if (theta >= 2.0) return this.green('Expert');
    if (theta >= 1.0) return this.green('Advanced');
    if (theta >= 0.0) return this.yellow('Intermediate');
    if (theta >= -1.0) return this.yellow('Basic');
    return this.red('Novice');
  }

  renderError(message: string): void {
    console.error(this.red(`Error: ${message}`));
  }

  renderWarning(message: string): void {
    console.warn(this.yellow(`Warning: ${message}`));
  }

  renderInfo(message: string): void {
    console.log(this.cyan(message));
  }
}
