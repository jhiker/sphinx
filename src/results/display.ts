import type { QuizResult, Quiz } from '../core/types.js';
import { CLIRenderer } from '../renderers/cli.js';

export interface DisplayOptions {
  color?: boolean;
  verbose?: boolean;
}

export function displayResults(
  result: QuizResult,
  quiz: Quiz,
  options: DisplayOptions = {}
): void {
  const renderer = new CLIRenderer({ color: options.color });
  renderer.renderResults(result, quiz);
}

export function displayResultsJson(result: QuizResult, quiz: Quiz): void {
  const output = {
    quiz: {
      id: quiz.metadata.id,
      title: quiz.metadata.title,
    },
    result: {
      passed: result.passed,
      score: result.totalScore,
      maxScore: result.maxScore,
      percentage: Math.round(result.percentage * 100),
      timeMs: result.totalTime,
      theta: result.theta,
      standardError: result.standardError,
    },
    questions: result.questionResults.map((qr) => ({
      id: qr.questionId,
      correct: qr.correct,
      score: qr.score,
    })),
  };

  console.log(JSON.stringify(output, null, 2));
}
