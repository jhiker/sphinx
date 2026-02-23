import prompts from 'prompts';
import { parseQuiz } from '../core/parser.js';
import { QuizEngine } from '../core/engine.js';
import { AdaptiveQuizEngine } from '../core/irt.js';
import {
  getQuestionInstructions,
  scoreAnswer,
} from '../core/question-types.js';
import type { Quiz, Question, QuizResult, QuestionResult } from '../core/types.js';
import { CLIRenderer } from '../renderers/cli.js';
import { displayResultsJson } from '../results/display.js';
import { saveResultsToFile } from '../results/file.js';
import { sendResultsToWebhook } from '../results/webhook.js';

export interface QuizOptions {
  ci?: boolean;
  json?: boolean;
  color?: boolean;
  answers?: string; // Path to answers file for CI mode
}

export async function runQuiz(filePath: string, options: QuizOptions = {}): Promise<number> {
  const parseResult = await parseQuiz(filePath);

  if (!parseResult.success || !parseResult.quiz) {
    if (options.json) {
      console.log(JSON.stringify({ error: parseResult.errors }, null, 2));
    } else {
      console.error('Failed to load quiz:');
      for (const error of parseResult.errors || []) {
        console.error(`  - ${error}`);
      }
    }
    return 1;
  }

  const quiz = parseResult.quiz;

  let result: QuizResult;

  if (options.ci) {
    result = await runCIMode(quiz, options);
  } else {
    result = await runInteractiveMode(quiz, options);
  }

  // Handle result persistence
  await persistResults(result, quiz, options);

  return result.passed ? 0 : 1;
}

async function persistResults(
  result: QuizResult,
  quiz: Quiz,
  options: QuizOptions
): Promise<void> {
  const persistence = quiz.results?.persistence || ['display'];

  for (const method of persistence) {
    switch (method) {
      case 'display':
        if (options.json) {
          displayResultsJson(result, quiz);
        } else if (!options.ci) {
          // Already displayed in interactive mode
        }
        break;

      case 'file':
        if (quiz.results?.filePath) {
          try {
            const savedPath = await saveResultsToFile(result, quiz, quiz.results.filePath);
            if (!options.json) {
              console.log(`Results saved to: ${savedPath}`);
            }
          } catch (error) {
            console.error(`Failed to save results: ${(error as Error).message}`);
          }
        }
        break;

      case 'webhook':
        if (quiz.results?.webhookUrl) {
          try {
            const response = await sendResultsToWebhook(result, quiz, quiz.results.webhookUrl);
            if (!options.json && !response.success) {
              console.error(`Failed to send webhook: ${response.message}`);
            }
          } catch (error) {
            console.error(`Webhook error: ${(error as Error).message}`);
          }
        }
        break;
    }
  }
}

async function runInteractiveMode(quiz: Quiz, options: QuizOptions): Promise<QuizResult> {
  const renderer = new CLIRenderer({ color: options.color });

  renderer.renderHeader(quiz);

  // Confirm start
  const startConfirm = await prompts({
    type: 'confirm',
    name: 'start',
    message: 'Ready to begin?',
    initial: true,
  });

  if (!startConfirm.start) {
    console.log('Quiz cancelled.');
    // Return empty result for cancelled quiz
    return {
      quizId: quiz.metadata.id,
      startTime: Date.now(),
      endTime: Date.now(),
      totalTime: 0,
      questionResults: [],
      totalScore: 0,
      maxScore: 0,
      percentage: 0,
      passed: false,
    };
  }

  let result: QuizResult;

  if (quiz.config.mode === 'adaptive' && quiz.adaptive) {
    result = await runAdaptiveQuiz(quiz, renderer);
  } else {
    result = await runStaticQuiz(quiz, renderer);
  }

  renderer.renderResults(result, quiz);

  return result;
}

async function runStaticQuiz(quiz: Quiz, renderer: CLIRenderer): Promise<QuizResult> {
  const engine = new QuizEngine(quiz);
  engine.start();

  while (!engine.isComplete()) {
    const question = engine.getCurrentQuestion();
    if (!question) break;

    const progress = engine.getProgress();
    renderer.renderQuestion(question, progress.current, progress.total);

    const answer = await promptForAnswer(question);

    if (answer === undefined) {
      // User cancelled
      break;
    }

    const questionResult = engine.submitAnswer({
      questionId: question.id,
      value: answer,
    });

    if (questionResult && quiz.config.showCorrectAnswers === 'after-each') {
      renderer.renderQuestionResult(questionResult, question);
    }
  }

  return engine.finish();
}

async function runAdaptiveQuiz(quiz: Quiz, renderer: CLIRenderer): Promise<QuizResult> {
  const adaptiveEngine = new AdaptiveQuizEngine(quiz.adaptive!, quiz.questions);
  adaptiveEngine.start();

  const startTime = Date.now();
  const results: QuestionResult[] = [];

  while (!adaptiveEngine.shouldStop()) {
    const question = adaptiveEngine.getNextQuestion();
    if (!question) break;

    const progress = adaptiveEngine.getProgress();
    renderer.renderQuestion(
      question,
      progress.current + 1,
      progress.max,
      `Ability: ${adaptiveEngine.getTheta().toFixed(2)}`
    );

    const answer = await promptForAnswer(question);

    if (answer === undefined) {
      break;
    }

    const scoring = scoreAnswer(question, answer);
    const questionResult: QuestionResult = {
      questionId: question.id,
      correct: scoring.correct,
      score: scoring.score,
      answer: {
        questionId: question.id,
        value: answer,
        timestamp: Date.now(),
        timeSpent: 0,
      },
    };

    adaptiveEngine.recordAnswer(questionResult);
    results.push(questionResult);

    if (quiz.config.showCorrectAnswers === 'after-each') {
      renderer.renderQuestionResult(questionResult, question);
    }
  }

  const endTime = Date.now();
  const totalScore = results.reduce((sum, r) => sum + r.score, 0);
  const maxScore = results.length;

  return {
    quizId: quiz.metadata.id,
    startTime,
    endTime,
    totalTime: endTime - startTime,
    questionResults: results,
    totalScore,
    maxScore,
    percentage: maxScore > 0 ? totalScore / maxScore : 0,
    passed: adaptiveEngine.getTheta() >= 0, // Theta >= 0 is passing for adaptive
    theta: adaptiveEngine.getTheta(),
    standardError: adaptiveEngine.getStandardError(),
  };
}

async function promptForAnswer(question: Question): Promise<string | string[] | undefined> {
  console.log();
  console.log(getQuestionInstructions(question));
  console.log();

  switch (question.type) {
    case 'multiple-choice': {
      const response = await prompts({
        type: 'select',
        name: 'answer',
        message: 'Your answer:',
        choices: question.options.map((o) => ({
          title: o.text,
          value: o.id,
        })),
      });
      return readPromptStringField(response, 'answer');
    }

    case 'multi-select': {
      const response = await prompts({
        type: 'multiselect',
        name: 'answers',
        message: 'Your answers:',
        choices: question.options.map((o) => ({
          title: o.text,
          value: o.id,
        })),
        min: 1,
      });
      return readPromptStringArrayField(response, 'answers');
    }

    case 'free-text': {
      const response = await prompts({
        type: 'text',
        name: 'answer',
        message: 'Your answer:',
      });
      return readPromptStringField(response, 'answer');
    }

    case 'code-challenge': {
      console.log('Starter code:');
      console.log(question.starterCode || '// Write your solution here');
      console.log();

      const response = await prompts({
        type: 'text',
        name: 'code',
        message: 'Enter your code (single line, or "skip" to skip):',
      });
      return readPromptStringField(response, 'code');
    }
  }
}

function readPromptStringField(response: unknown, key: string): string | undefined {
  if (!response || typeof response !== 'object') {
    return undefined;
  }
  const value = (response as Record<string, unknown>)[key];
  return typeof value === 'string' ? value : undefined;
}

function readPromptStringArrayField(response: unknown, key: string): string[] | undefined {
  if (!response || typeof response !== 'object') {
    return undefined;
  }
  const value = (response as Record<string, unknown>)[key];
  if (!Array.isArray(value) || !value.every((item) => typeof item === 'string')) {
    return undefined;
  }
  return value;
}

async function runCIMode(quiz: Quiz, options: QuizOptions): Promise<QuizResult> {
  // CI mode: validate the quiz and output info
  // In a real CI scenario, you might read answers from stdin or a file

  const startTime = Date.now();
  const questions = quiz.config.randomizeOrder
    ? shuffle([...quiz.questions])
    : [...quiz.questions];

  const limitedQuestions = quiz.config.questionCount
    ? questions.slice(0, quiz.config.questionCount)
    : questions;

  // For CI validation mode without answers, we just output quiz info
  if (!options.answers) {
    const output = {
      status: 'validation',
      quiz: {
        id: quiz.metadata.id,
        title: quiz.metadata.title,
        questionCount: limitedQuestions.length,
        passingThreshold: quiz.config.passingThreshold,
        mode: quiz.config.mode,
      },
      message: 'Quiz validated successfully. Provide --answers file for execution.',
    };

    if (options.json) {
      console.log(JSON.stringify(output, null, 2));
    } else {
      console.log(`Quiz: ${quiz.metadata.title}`);
      console.log(`Questions: ${limitedQuestions.length}`);
      console.log(`Passing: ${(quiz.config.passingThreshold * 100).toFixed(0)}%`);
      console.log('\nQuiz validated. Use interactive mode or provide answers file.');
    }

    // Return a "neutral" result for validation-only mode
    return {
      quizId: quiz.metadata.id,
      startTime,
      endTime: Date.now(),
      totalTime: 0,
      questionResults: [],
      totalScore: 0,
      maxScore: limitedQuestions.length,
      percentage: 0,
      passed: false, // No answers = not passed
    };
  }

  // If answers file provided, load and process them
  const { readFile } = await import('fs/promises');
  try {
    const answersContent = await readFile(options.answers, 'utf-8');
    const answers = JSON.parse(answersContent) as Record<string, string | string[]>;

    const results: QuestionResult[] = [];

    for (const question of limitedQuestions) {
      const answer = answers[question.id];
      if (answer === undefined) {
        // No answer provided for this question
        results.push({
          questionId: question.id,
          correct: false,
          score: 0,
          answer: {
            questionId: question.id,
            value: '',
            timestamp: Date.now(),
            timeSpent: 0,
          },
        });
        continue;
      }

      const scoring = scoreAnswer(question, answer);
      results.push({
        questionId: question.id,
        correct: scoring.correct,
        score: scoring.score,
        answer: {
          questionId: question.id,
          value: answer,
          timestamp: Date.now(),
          timeSpent: 0,
        },
      });
    }

    const endTime = Date.now();
    const totalScore = results.reduce((sum, r) => sum + r.score, 0);
    const maxScore = results.length;
    const percentage = maxScore > 0 ? totalScore / maxScore : 0;

    const result: QuizResult = {
      quizId: quiz.metadata.id,
      startTime,
      endTime,
      totalTime: endTime - startTime,
      questionResults: results,
      totalScore,
      maxScore,
      percentage,
      passed: percentage >= quiz.config.passingThreshold,
    };

    if (!options.json) {
      console.log(`Quiz: ${quiz.metadata.title}`);
      console.log(`Score: ${totalScore}/${maxScore} (${(percentage * 100).toFixed(1)}%)`);
      console.log(`Status: ${result.passed ? 'PASSED' : 'FAILED'}`);
    }

    return result;
  } catch (error) {
    console.error(`Failed to load answers file: ${(error as Error).message}`);
    return {
      quizId: quiz.metadata.id,
      startTime,
      endTime: Date.now(),
      totalTime: 0,
      questionResults: [],
      totalScore: 0,
      maxScore: limitedQuestions.length,
      percentage: 0,
      passed: false,
    };
  }
}

function shuffle<T>(array: T[]): T[] {
  const result = [...array];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}
