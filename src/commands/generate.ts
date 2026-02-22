import { Command } from 'commander';
import { loadConfig, profiles, type Profile, type Focus } from '../generate/config.js';

export function createGenerateCommand(): Command {
  const generate = new Command('generate')
    .description('Generate a quiz from content sources using AI');

  // GitHub subcommands
  const github = new Command('github')
    .description('Generate quiz from GitHub content');

  github
    .command('repo')
    .description('Generate quiz from a GitHub repository')
    .argument('<url>', 'GitHub repository URL')
    .option('--token <token>', 'GitHub token')
    .option('--model <model>', 'Model to use (overrides config default)')
    .option('--focus <focus>', 'Quiz focus: comprehension, changes, practices, security, concepts', 'comprehension')
    .option('--profile <profile>', 'Question profile: quick, standard, thorough', 'standard')
    .option('--questions <n>', 'Override question count', parseInt)
    .option('--difficulty <level>', 'Difficulty: easy, medium, hard, mixed', 'mixed')
    .option('-o, --output <file>', 'Output file (default: stdout)')
    .action(async (url, options) => {
      await runGenerate('github', 'repo', url, options);
    });

  addStandardOptions(
    github
      .command('pr')
      .description('Generate quiz from a GitHub pull request')
      .argument('<url>', 'GitHub PR URL')
      .option('--token <token>', 'GitHub token'),
    { focus: 'changes', profile: 'standard', difficulty: 'mixed' }
  ).action(async (url, options) => {
    await runGenerate('github', 'pr', url, options);
  });

  generate.addCommand(github);

  // Git subcommands
  const git = new Command('git')
    .description('Generate quiz from local git content');

  addStandardOptions(
    git
      .command('local')
      .description('Generate quiz from local git repository')
      .argument('[path]', 'Path to repository', '.'),
    { focus: 'comprehension', profile: 'standard', difficulty: 'mixed' }
  ).action(async (path, options) => {
    await runGenerate('git', 'local', path, options);
  });

  addStandardOptions(
    git
      .command('diff')
      .description('Generate quiz from git branch diff')
      .argument('<branch>', 'Branch to diff')
      .option('--base <base>', 'Base branch to diff against', 'main'),
    { focus: 'changes', profile: 'standard', difficulty: 'mixed' }
  ).action(async (branch, options) => {
    await runGenerate('git', 'diff', branch, options);
  });

  generate.addCommand(git);

  // Confluence subcommand
  addStandardOptions(
    generate
      .command('confluence')
      .description('Generate quiz from Confluence page')
      .argument('<url>', 'Confluence page URL'),
    { focus: 'concepts', profile: 'standard', difficulty: 'mixed' }
  ).action(async (url, options) => {
    await runGenerate('confluence', 'page', url, options);
  });

  return generate;
}

interface GenerateOptions {
  token?: string;
  base?: string;
  model?: string;
  focus: Focus;
  profile: Profile;
  questions?: number;
  difficulty: string;
  output?: string;
}

async function runGenerate(
  source: string,
  subtype: string,
  target: string,
  options: GenerateOptions
): Promise<void> {
  const config = await loadConfig();
  const model = options.model || config.generate.defaultModel || config.llm.model;

  const questionCount = options.questions || profiles[options.profile].questions;

  const prompt = buildPrompt(source, subtype, target, {
    ...options,
    questionCount,
  });

  console.error(`Generating quiz from ${source} ${subtype}: ${target}`);
  console.error(`Focus: ${options.focus}, Questions: ${questionCount}`);
  if (model) {
    console.error(`Model: ${model}`);
  }

  try {
    const result = await invokeSkill(prompt, config, model);

    if (options.output) {
      const { writeFile } = await import('fs/promises');
      await writeFile(options.output, result, 'utf-8');
      console.error(`Quiz written to: ${options.output}`);
    } else {
      console.log(result);
    }
  } catch (error) {
    logError('Error generating quiz', error);
    process.exit(1);
  }
}

function buildPrompt(
  source: string,
  subtype: string,
  target: string,
  options: GenerateOptions & { questionCount: number }
): string {
  const lines = [
    `Generate a Sphinx quiz from the following source:`,
    ``,
    `Source: ${source} ${subtype}`,
    `Target: ${target}`,
  ];

  if (source === 'git' && subtype === 'diff' && options.base) {
    lines.push(`Base branch: ${options.base}`);
  }

  lines.push(
    ``,
    `Parameters:`,
    `- Version: 1.0`,
    `- Focus: ${options.focus}`,
    `- Questions: ${options.questionCount}`,
    `- Difficulty: ${options.difficulty}`,
    ``,
    `Return output using the configured JSON schema structured output.`,
    `Do not wrap JSON in markdown code fences.`
  );

  return lines.join('\n');
}

async function invokeSkill(
  prompt: string,
  _config: Awaited<ReturnType<typeof loadConfig>>,
  model?: string
): Promise<string> {
  // Check if running inside Claude Code (nested sessions not supported)
  if (process.env.CLAUDECODE === '1') {
    throw new Error(
      `Cannot run 'sphinx generate' from within Claude Code.\n` +
      `The generate command uses the Claude Agent SDK which spawns Claude Code as a subprocess.\n` +
      `Nested Claude Code sessions are not supported.\n\n` +
      `To generate a quiz, either:\n` +
      `  1. Run 'sphinx generate' from a regular terminal (outside Claude Code)\n` +
      `  2. Ask Claude Code directly to generate the quiz JSON for you`
    );
  }

  const outputSchema = createAgentStructuredQuizSchema();

  // Dynamic import to handle SDK
  let query: typeof import('@anthropic-ai/claude-agent-sdk').query;
  try {
    const sdk = await import('@anthropic-ai/claude-agent-sdk');
    query = sdk.query;
  } catch (err) {
    throw new Error('Failed to load Claude Agent SDK', { cause: err });
  }

  const debugMode = process.env.SPHINX_DEBUG === '1';
  const progress = new GenerateProgressBar(!debugMode);
  progress.start('Starting generation');
  let lastMessageSummary = 'none';
  let messageCount = 0;

  try {
    const queryOptions: {
      cwd: string;
      settingSources: ('project' | 'user')[];
      allowedTools: string[];
      outputFormat: {
        type: 'json_schema';
        schema: Record<string, unknown>;
      };
      model?: string;
    } = {
      cwd: process.cwd(),
      settingSources: ['project', 'user'],
      allowedTools: ['Bash', 'Read', 'Glob', 'Grep'],
      outputFormat: {
        type: 'json_schema',
        schema: outputSchema,
      },
    };

    if (model) {
      queryOptions.model = model;
    }

    for await (const message of query({
      prompt,
      options: queryOptions,
    })) {
      messageCount += 1;
      lastMessageSummary = summarizeSdkMessage(message);
      progress.onMessage(messageCount, lastMessageSummary);

      if (debugMode) {
        console.error(`[DEBUG] Message:`, JSON.stringify(message, null, 2).substring(0, 500));
      }

      // Check for result message with structured output
      if (message && typeof message === 'object') {
        const msg = message as Record<string, unknown>;

        if (msg.type === 'result') {
          const subtype = typeof msg.subtype === 'string' ? msg.subtype : 'unknown';

          if (subtype === 'success') {
            if (msg.structured_output !== undefined) {
              const validated = await validateStructuredQuizOutput(msg.structured_output);
              progress.complete('Structured output validated');
              return validated;
            }
            throw new Error(
              `Result was successful but missing structured_output. ` +
                `Structured output is required for this command. ` +
                `(result_preview=${previewValue(msg.result)})`
            );
          }

          if (subtype === 'error_max_structured_output_retries') {
            const errors = Array.isArray(msg.errors) ? msg.errors.join(', ') : '';
            throw new Error(
              `Structured output retries exhausted. ` +
                `The model could not satisfy the quiz schema. ` +
                `Consider simplifying required fields in the schema or tightening the prompt. ` +
                (errors ? `Errors: ${errors}` : '')
            );
          }

          if (subtype !== 'success') {
            const errors = Array.isArray(msg.errors) ? msg.errors : [];
            throw new Error(`Generation failed: ${errors.join(', ') || subtype}`);
          }
        }
      }
    }

    throw new Error(
      `No structured output received from SDK (messages=${messageCount}, last=${lastMessageSummary})`
    );
  } catch (err) {
    progress.fail('Generation failed');
    const errObj = toError(err);
    const details = buildSdkFailureDetails(errObj, lastMessageSummary, messageCount);

    if (details.includes('exited with code 1')) {
      throw new Error(
        `SDK query failed: ${details}\n\nPossible causes:` +
          `\n  - Claude Code is not installed or not in PATH` +
          `\n  - Missing API key or authentication issue` +
          `\n\nTo debug: run 'claude --version' to verify installation`,
        { cause: err }
      );
    }

    throw new Error(`SDK query failed: ${details}`, { cause: err });
  }
}

class GenerateProgressBar {
  private readonly enabled: boolean;
  private currentPercent = 0;
  private lastLabel = '';
  private readonly width = 28;

  constructor(enabled: boolean) {
    this.enabled = enabled && process.stderr.isTTY;
  }

  start(label: string): void {
    if (!this.enabled) {
      return;
    }
    this.currentPercent = 5;
    this.render(this.currentPercent, label);
  }

  onMessage(messageCount: number, summary: string): void {
    if (!this.enabled) {
      return;
    }

    let target = Math.min(92, 10 + messageCount * 4);
    if (summary.includes('type=assistant')) {
      target = Math.max(target, Math.min(94, 18 + messageCount * 5));
    }
    if (summary.includes('type=result')) {
      target = Math.max(target, 96);
    }

    this.advanceTo(target, this.labelForSummary(summary));
  }

  complete(label: string): void {
    if (!this.enabled) {
      return;
    }
    this.render(100, label);
    process.stderr.write('\n');
  }

  fail(label: string): void {
    if (!this.enabled) {
      return;
    }
    this.render(this.currentPercent, label);
    process.stderr.write('\n');
  }

  private advanceTo(target: number, label: string): void {
    if (target <= this.currentPercent && label === this.lastLabel) {
      return;
    }
    this.render(Math.max(this.currentPercent, target), label);
  }

  private labelForSummary(summary: string): string {
    if (summary.includes('type=result')) {
      return 'Finalizing result';
    }
    if (summary.includes('type=assistant')) {
      return 'Composing quiz';
    }
    if (summary.includes('type=tool_use')) {
      return 'Reading sources';
    }
    if (summary.includes('type=system')) {
      return 'Planning';
    }
    return 'Processing';
  }

  private render(percent: number, label: string): void {
    const normalized = Math.max(0, Math.min(100, Math.floor(percent)));
    const filled = Math.round((normalized / 100) * this.width);
    const bar = `${'#'.repeat(filled)}${'-'.repeat(this.width - filled)}`;
    this.currentPercent = normalized;
    this.lastLabel = label;
    process.stderr.write(`\r[${bar}] ${String(normalized).padStart(3, ' ')}% ${label}`);
  }
}

function addStandardOptions(
  command: Command,
  defaults: { focus: Focus; profile: Profile; difficulty: string }
): Command {
  return command
    .option('--model <model>', 'Model to use (overrides config default)')
    .option('--focus <focus>', 'Quiz focus', defaults.focus)
    .option('--profile <profile>', 'Question profile', defaults.profile)
    .option('--questions <n>', 'Override question count', parseInt)
    .option('--difficulty <level>', 'Difficulty', defaults.difficulty)
    .option('-o, --output <file>', 'Output file');
}

function summarizeSdkMessage(message: unknown): string {
  if (!message || typeof message !== 'object') {
    return String(message);
  }

  const msg = message as Record<string, unknown>;
  const type = typeof msg.type === 'string' ? msg.type : 'unknown';
  const subtype = typeof msg.subtype === 'string' ? msg.subtype : undefined;
  const hasStructuredOutput = 'structured_output' in msg;
  const hasResultText = typeof msg.result === 'string' && msg.result.length > 0;
  const errorCount = Array.isArray(msg.errors) ? msg.errors.length : undefined;

  const parts = [`type=${type}`];
  if (subtype) {
    parts.push(`subtype=${subtype}`);
  }
  if (hasStructuredOutput) {
    parts.push('structured_output=yes');
  }
  if (hasResultText) {
    parts.push('result_text=yes');
  }
  if (errorCount !== undefined) {
    parts.push(`errors=${errorCount}`);
  }

  return parts.join(' ');
}

function buildSdkFailureDetails(err: Error, lastMessageSummary: string, messageCount: number): string {
  if (err.message.includes('No structured output received from SDK')) {
    return `No structured output received from SDK (messages=${messageCount}, last=${lastMessageSummary})`;
  }

  return err.message;
}

function toError(error: unknown): Error {
  if (error instanceof Error) {
    return error;
  }

  return new Error(typeof error === 'string' ? error : JSON.stringify(error));
}

function logError(prefix: string, error: unknown): void {
  const err = toError(error);
  console.error(`${prefix}: ${err.message}`);

  const causeMessages = collectCauseMessages(err);
  for (const message of causeMessages) {
    console.error(`Cause: ${message}`);
  }

  if (process.env.SPHINX_DEBUG === '1' && err.stack) {
    console.error(err.stack);
  }
}

function collectCauseMessages(error: Error): string[] {
  const causes: string[] = [];
  let current: unknown = error.cause;

  while (current) {
    if (current instanceof Error) {
      causes.push(current.message);
      current = current.cause;
      continue;
    }

    causes.push(String(current));
    break;
  }

  return causes;
}

function previewValue(value: unknown): string {
  if (typeof value !== 'string') {
    return String(value);
  }
  const compact = value.replace(/\s+/g, ' ').trim();
  return compact.length > 140 ? `${compact.slice(0, 140)}...` : compact;
}

async function validateStructuredQuizOutput(output: unknown): Promise<string> {
  const json = JSON.stringify(output);
  const { parseQuizString } = await import('../core/parser.js');
  const validation = await parseQuizString(json);

  if (!validation.success) {
    const details = (validation.errors || []).slice(0, 5).join('; ');
    throw new Error(`Structured output received but failed quiz validation: ${details}`);
  }

  return JSON.stringify(output, null, 2);
}

function createAgentStructuredQuizSchema(): Record<string, unknown> {
  return {
    type: 'object',
    required: ['version', 'metadata', 'config', 'questions'],
    properties: {
      version: { type: 'string', pattern: '^\\d+\\.\\d+$' },
      metadata: {
        type: 'object',
        required: ['id', 'title'],
        properties: {
          id: { type: 'string', pattern: '^[a-z0-9-]+$' },
          title: { type: 'string' },
          description: { type: 'string' },
          tags: { type: 'array', items: { type: 'string' } },
          author: { type: 'string' },
        },
      },
      config: {
        type: 'object',
        required: ['mode', 'passingThreshold', 'timeLimit', 'randomizeOrder', 'showCorrectAnswers'],
        properties: {
          mode: { type: 'string', enum: ['static', 'adaptive'] },
          questionTypes: {
            type: 'array',
            items: { type: 'string', enum: ['multiple-choice', 'multi-select', 'free-text', 'code-challenge'] },
          },
          questionCount: { type: 'integer' },
          passingThreshold: { type: 'number' },
          timeLimit: { type: ['integer', 'null'] },
          randomizeOrder: { type: 'boolean' },
          showCorrectAnswers: { type: 'string', enum: ['never', 'after-each', 'after-completion'] },
        },
      },
      results: {
        type: 'object',
        properties: {
          persistence: { type: 'array', items: { type: 'string', enum: ['display', 'file', 'webhook'] } },
          filePath: { type: 'string' },
          webhookUrl: { type: ['string', 'null'] },
        },
      },
      adaptive: {
        type: 'object',
        properties: {
          initialTheta: { type: 'number' },
          thetaRange: { type: 'array', items: { type: 'number' }, minItems: 2, maxItems: 2 },
          standardErrorThreshold: { type: 'number' },
          minQuestions: { type: 'integer' },
          maxQuestions: { type: 'integer' },
          selectionMethod: { type: 'string', enum: ['maximum-information', 'random'] },
        },
      },
      questions: {
        type: 'array',
        minItems: 1,
        items: {
          type: 'object',
          required: ['id', 'type', 'prompt'],
          properties: {
            id: { type: 'string' },
            type: { type: 'string', enum: ['multiple-choice', 'multi-select', 'free-text', 'code-challenge'] },
            prompt: { type: 'string' },
            difficulty: { type: 'number' },
            discrimination: { type: 'number' },
            category: { type: 'string' },
            context: { type: 'string' },
            explanation: { type: 'string' },
            options: {
              type: 'array',
              items: {
                type: 'object',
                required: ['id', 'text'],
                properties: {
                  id: { type: 'string' },
                  text: { type: 'string' },
                  correct: { type: 'boolean' },
                },
              },
            },
            scoring: { type: 'string', enum: ['all-or-nothing', 'partial'] },
            acceptedAnswers: { type: 'array', items: { type: 'string' } },
            matchMode: { type: 'string', enum: ['exact', 'contains', 'regex'] },
            caseSensitive: { type: 'boolean' },
            language: { type: 'string', enum: ['javascript', 'typescript', 'python'] },
            starterCode: { type: 'string' },
            testCases: {
              type: 'array',
              items: {
                type: 'object',
                required: ['input', 'expected'],
                properties: {
                  input: { type: 'array' },
                  expected: {},
                  description: { type: 'string' },
                },
              },
            },
            timeLimit: { type: 'integer' },
          },
        },
      },
    },
  };
}
