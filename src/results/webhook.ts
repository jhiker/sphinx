import type { QuizResult, Quiz } from '../core/types.js';

export interface WebhookOptions {
  timeout?: number;
  headers?: Record<string, string>;
  includeAnswers?: boolean;
}

export interface WebhookResponse {
  success: boolean;
  statusCode?: number;
  message?: string;
}

export async function sendResultsToWebhook(
  result: QuizResult,
  quiz: Quiz,
  webhookUrl: string,
  options: WebhookOptions = {}
): Promise<WebhookResponse> {
  const timeout = options.timeout || 10000;

  const payload = buildPayload(result, quiz, options);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Sphinx-Quiz/1.0',
        ...options.headers,
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (response.ok) {
      return {
        success: true,
        statusCode: response.status,
        message: 'Results sent successfully',
      };
    } else {
      return {
        success: false,
        statusCode: response.status,
        message: `HTTP ${response.status}: ${response.statusText}`,
      };
    }
  } catch (error) {
    clearTimeout(timeoutId);

    if ((error as Error).name === 'AbortError') {
      return {
        success: false,
        message: `Request timed out after ${timeout}ms`,
      };
    }

    return {
      success: false,
      message: `Network error: ${(error as Error).message}`,
    };
  }
}

function buildPayload(
  result: QuizResult,
  quiz: Quiz,
  options: WebhookOptions
): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    event: 'quiz_completed',
    timestamp: new Date().toISOString(),
    quiz: {
      id: quiz.metadata.id,
      title: quiz.metadata.title,
      version: quiz.version,
      mode: quiz.config.mode,
    },
    result: {
      passed: result.passed,
      score: result.totalScore,
      maxScore: result.maxScore,
      percentage: Math.round(result.percentage * 100),
      totalTimeMs: result.totalTime,
    },
    summary: {
      questionsAnswered: result.questionResults.length,
      correctAnswers: result.questionResults.filter((r) => r.correct).length,
    },
  };

  // Include IRT results if available
  if (result.theta !== undefined) {
    (payload.result as Record<string, unknown>).theta = result.theta;
    (payload.result as Record<string, unknown>).standardError = result.standardError;
  }

  // Category breakdown
  const categories = new Map<string, { correct: number; total: number }>();
  for (const qr of result.questionResults) {
    const question = quiz.questions.find((q) => q.id === qr.questionId);
    if (question?.category) {
      const stats = categories.get(question.category) || { correct: 0, total: 0 };
      stats.total++;
      if (qr.correct) stats.correct++;
      categories.set(question.category, stats);
    }
  }

  if (categories.size > 0) {
    payload.categories = Object.fromEntries(
      [...categories.entries()].map(([cat, stats]) => [
        cat,
        {
          correct: stats.correct,
          total: stats.total,
          percentage: Math.round((stats.correct / stats.total) * 100),
        },
      ])
    );
  }

  // Optionally include detailed answers
  if (options.includeAnswers) {
    payload.questions = result.questionResults.map((qr) => ({
      id: qr.questionId,
      correct: qr.correct,
      score: qr.score,
      answer: qr.answer.value,
      timeSpentMs: qr.answer.timeSpent,
    }));
  }

  return payload;
}
