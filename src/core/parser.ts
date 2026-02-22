import { createRequire } from 'module';
import type { ErrorObject, AnySchema, Options } from 'ajv';
import { readFile } from 'fs/promises';

const require = createRequire(import.meta.url);

interface ValidateFunction {
  (data: unknown): boolean;
  errors?: ErrorObject[] | null;
}

// Use Ajv with draft-07 since draft-2020-12 requires additional setup
const Ajv = require('ajv').default as new (opts?: Options) => {
  compile(schema: AnySchema): ValidateFunction;
};
import { resolve } from 'path';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import type { Quiz, QuizConfig, AdaptiveConfig, ResultsConfig, Question } from './types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export interface ParseResult {
  success: boolean;
  quiz?: Quiz;
  errors?: string[];
}

export interface ValidationError {
  path: string;
  message: string;
}

// Default values for optional config fields
const defaultConfig: Partial<QuizConfig> = {
  mode: 'static',
  passingThreshold: 0.7,
  timeLimit: null,
  randomizeOrder: false,
  showCorrectAnswers: 'after-completion',
};

const defaultResults: ResultsConfig = {
  persistence: ['display'],
};

const defaultAdaptive: AdaptiveConfig = {
  initialTheta: 0.0,
  thetaRange: [-3.0, 3.0],
  standardErrorThreshold: 0.3,
  minQuestions: 5,
  maxQuestions: 20,
  selectionMethod: 'maximum-information',
};

export class QuizParser {
  private ajv: InstanceType<typeof Ajv>;
  private schema: AnySchema | null = null;
  private schemaLoaded = false;

  constructor() {
    this.ajv = new Ajv({
      allErrors: true,
      verbose: true,
      strict: false,
      // Schema uses `format: "uri"` but we don't register format plugins.
      // Disable format validation to avoid noisy warnings while preserving
      // current behavior (format was already ignored).
      validateFormats: false,
    });
  }

  private async loadSchema(): Promise<void> {
    if (this.schemaLoaded) return;

    const schemaPath = join(__dirname, '..', 'schema', 'quiz.schema.json');
    const schemaContent = await readFile(schemaPath, 'utf-8');
    this.schema = JSON.parse(schemaContent);
    this.schemaLoaded = true;
  }

  async parse(filePath: string): Promise<ParseResult> {
    try {
      await this.loadSchema();

      const absolutePath = resolve(filePath);
      const content = await readFile(absolutePath, 'utf-8');
      const data = JSON.parse(content);

      return this.validate(data);
    } catch (error) {
      if (error instanceof SyntaxError) {
        return {
          success: false,
          errors: [`Invalid JSON: ${error.message}`],
        };
      }
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return {
          success: false,
          errors: [`File not found: ${filePath}`],
        };
      }
      return {
        success: false,
        errors: [`Failed to read file: ${(error as Error).message}`],
      };
    }
  }

  async parseString(jsonString: string): Promise<ParseResult> {
    try {
      await this.loadSchema();
      const data = JSON.parse(jsonString);
      return this.validate(data);
    } catch (error) {
      if (error instanceof SyntaxError) {
        return {
          success: false,
          errors: [`Invalid JSON: ${error.message}`],
        };
      }
      return {
        success: false,
        errors: [`Failed to parse JSON: ${(error as Error).message}`],
      };
    }
  }

  private validate(data: unknown): ParseResult {
    if (!this.schema) {
      return {
        success: false,
        errors: ['Schema not loaded'],
      };
    }

    const validate = this.ajv.compile(this.schema);
    const valid = validate(data);

    if (!valid) {
      const errors = (validate.errors || []).map((err: ErrorObject) => {
        const path = err.instancePath || '/';
        return `${path}: ${err.message}`;
      });
      return {
        success: false,
        errors,
      };
    }

    // Apply defaults and normalize the quiz
    const quiz = this.applyDefaults(data as Quiz);

    // Additional semantic validation
    const semanticErrors = this.validateSemantics(quiz);
    if (semanticErrors.length > 0) {
      return {
        success: false,
        errors: semanticErrors,
      };
    }

    return {
      success: true,
      quiz,
    };
  }

  private applyDefaults(quiz: Quiz): Quiz {
    return {
      ...quiz,
      config: {
        ...defaultConfig,
        ...quiz.config,
      },
      results: {
        ...defaultResults,
        ...quiz.results,
      },
      adaptive: quiz.config.mode === 'adaptive'
        ? { ...defaultAdaptive, ...quiz.adaptive }
        : quiz.adaptive,
      questions: quiz.questions.map((q): Question => {
        // Apply base defaults
        const withDefaults = {
          ...q,
          difficulty: q.difficulty ?? 0,
          discrimination: q.discrimination ?? 1,
        };
        // Apply type-specific defaults
        if (q.type === 'multi-select') {
          return { ...withDefaults, scoring: q.scoring || 'partial' } as Question;
        }
        if (q.type === 'free-text') {
          return {
            ...withDefaults,
            matchMode: q.matchMode || 'exact',
            caseSensitive: q.caseSensitive ?? false,
          } as Question;
        }
        if (q.type === 'code-challenge') {
          return { ...withDefaults, timeLimit: q.timeLimit || 300 } as Question;
        }
        return withDefaults as Question;
      }),
    };
  }

  private validateSemantics(quiz: Quiz): string[] {
    const errors: string[] = [];

    // Check for duplicate question IDs
    const questionIds = new Set<string>();
    for (const question of quiz.questions) {
      if (questionIds.has(question.id)) {
        errors.push(`Duplicate question ID: ${question.id}`);
      }
      questionIds.add(question.id);
    }

    // Validate multiple-choice has exactly one correct answer
    for (const question of quiz.questions) {
      if (question.type === 'multiple-choice') {
        const correctCount = question.options.filter((o) => o.correct).length;
        if (correctCount !== 1) {
          errors.push(
            `Question ${question.id}: multiple-choice must have exactly one correct answer (found ${correctCount})`
          );
        }
      }
    }

    // Validate multi-select has at least one correct answer
    for (const question of quiz.questions) {
      if (question.type === 'multi-select') {
        const correctCount = question.options.filter((o) => o.correct).length;
        if (correctCount === 0) {
          errors.push(
            `Question ${question.id}: multi-select must have at least one correct answer`
          );
        }
      }
    }

    // Validate option IDs are unique within each question
    for (const question of quiz.questions) {
      if (question.type === 'multiple-choice' || question.type === 'multi-select') {
        const optionIds = new Set<string>();
        for (const option of question.options) {
          if (optionIds.has(option.id)) {
            errors.push(`Question ${question.id}: duplicate option ID: ${option.id}`);
          }
          optionIds.add(option.id);
        }
      }
    }

    // Validate adaptive config when mode is adaptive
    if (quiz.config.mode === 'adaptive') {
      if (!quiz.adaptive) {
        // Not an error - we use defaults
      } else {
        if (quiz.adaptive.minQuestions > quiz.adaptive.maxQuestions) {
          errors.push(
            `Adaptive config: minQuestions (${quiz.adaptive.minQuestions}) cannot exceed maxQuestions (${quiz.adaptive.maxQuestions})`
          );
        }
        if (quiz.adaptive.thetaRange[0] >= quiz.adaptive.thetaRange[1]) {
          errors.push(
            `Adaptive config: thetaRange min must be less than max`
          );
        }
      }
    }

    // Validate questionCount if specified
    if (quiz.config.questionCount !== undefined) {
      if (quiz.config.mode === 'static' && quiz.config.questionCount > quiz.questions.length) {
        errors.push(
          `Config questionCount (${quiz.config.questionCount}) exceeds available questions (${quiz.questions.length})`
        );
      }
    }

    return errors;
  }
}

// Convenience function for one-off parsing
export async function parseQuiz(filePath: string): Promise<ParseResult> {
  const parser = new QuizParser();
  return parser.parse(filePath);
}

export async function parseQuizString(jsonString: string): Promise<ParseResult> {
  const parser = new QuizParser();
  return parser.parseString(jsonString);
}
