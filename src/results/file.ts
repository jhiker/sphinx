import { writeFile, mkdir } from 'fs/promises';
import { dirname, join } from 'path';
import type { QuizResult, Quiz } from '../core/types.js';

export interface FileResultOptions {
  format?: 'json' | 'csv';
  includeAnswers?: boolean;
}

export async function saveResultsToFile(
  result: QuizResult,
  quiz: Quiz,
  filePath: string,
  options: FileResultOptions = {}
): Promise<string> {
  const format = options.format || 'json';
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `${quiz.metadata.id}-${timestamp}.${format}`;
  const fullPath = join(filePath, filename);

  // Ensure directory exists
  await mkdir(dirname(fullPath), { recursive: true });

  let content: string;

  if (format === 'csv') {
    content = generateCsv(result, quiz, options);
  } else {
    content = generateJson(result, quiz, options);
  }

  await writeFile(fullPath, content, 'utf-8');

  return fullPath;
}

function generateJson(
  result: QuizResult,
  quiz: Quiz,
  options: FileResultOptions
): string {
  const output: Record<string, unknown> = {
    timestamp: new Date().toISOString(),
    quiz: {
      id: quiz.metadata.id,
      title: quiz.metadata.title,
      version: quiz.version,
    },
    config: {
      mode: quiz.config.mode,
      passingThreshold: quiz.config.passingThreshold,
    },
    result: {
      passed: result.passed,
      totalScore: result.totalScore,
      maxScore: result.maxScore,
      percentage: result.percentage,
      totalTimeMs: result.totalTime,
      startTime: new Date(result.startTime).toISOString(),
      endTime: new Date(result.endTime).toISOString(),
    },
  };

  // Include IRT results if available
  if (result.theta !== undefined) {
    (output.result as Record<string, unknown>).theta = result.theta;
    (output.result as Record<string, unknown>).standardError = result.standardError;
  }

  // Include detailed question results
  output.questions = result.questionResults.map((qr) => {
    const question = quiz.questions.find((q) => q.id === qr.questionId);
    const questionResult: Record<string, unknown> = {
      id: qr.questionId,
      correct: qr.correct,
      score: qr.score,
      category: question?.category,
      difficulty: question?.difficulty,
    };

    if (options.includeAnswers) {
      questionResult.answer = qr.answer.value;
      questionResult.timeSpentMs = qr.answer.timeSpent;
    }

    return questionResult;
  });

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
    output.categories = Object.fromEntries(
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

  return JSON.stringify(output, null, 2);
}

function generateCsv(
  result: QuizResult,
  quiz: Quiz,
  options: FileResultOptions
): string {
  const headers = [
    'quiz_id',
    'quiz_title',
    'timestamp',
    'passed',
    'score',
    'max_score',
    'percentage',
    'time_seconds',
    'theta',
    'standard_error',
  ];

  const values = [
    quiz.metadata.id,
    `"${quiz.metadata.title.replace(/"/g, '""')}"`,
    new Date().toISOString(),
    result.passed ? 'true' : 'false',
    result.totalScore.toString(),
    result.maxScore.toString(),
    (result.percentage * 100).toFixed(1),
    (result.totalTime / 1000).toFixed(1),
    result.theta?.toFixed(3) || '',
    result.standardError?.toFixed(3) || '',
  ];

  let csv = headers.join(',') + '\n';
  csv += values.join(',') + '\n';

  // Add question details section
  csv += '\n# Question Results\n';
  const questionHeaders = ['question_id', 'category', 'correct', 'score', 'difficulty'];
  if (options.includeAnswers) {
    questionHeaders.push('answer', 'time_seconds');
  }
  csv += questionHeaders.join(',') + '\n';

  for (const qr of result.questionResults) {
    const question = quiz.questions.find((q) => q.id === qr.questionId);
    const row = [
      qr.questionId,
      question?.category || '',
      qr.correct ? 'true' : 'false',
      qr.score.toString(),
      question?.difficulty?.toString() || '0',
    ];

    if (options.includeAnswers) {
      const answerStr = Array.isArray(qr.answer.value)
        ? qr.answer.value.join(';')
        : qr.answer.value;
      row.push(`"${answerStr.replace(/"/g, '""')}"`);
      row.push((qr.answer.timeSpent / 1000).toFixed(1));
    }

    csv += row.join(',') + '\n';
  }

  return csv;
}
