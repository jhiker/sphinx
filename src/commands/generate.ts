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

  const questionCount = options.questions || profiles[options.profile].questions;

  const prompt = buildPrompt(source, subtype, target, {
    ...options,
    questionCount,
  });

  console.error(`Generating quiz from ${source} ${subtype}: ${target}`);
  console.error(`Focus: ${options.focus}, Questions: ${questionCount}`);

  try {
    const result = await invokeSkill(prompt, config);

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
    `- Focus: ${options.focus}`,
    `- Questions: ${options.questionCount}`,
    `- Difficulty: ${options.difficulty}`,
    ``,
    `Output the quiz JSON directly, no other text.`
  );

  return lines.join('\n');
}

async function invokeSkill(prompt: string, _config: Awaited<ReturnType<typeof loadConfig>>): Promise<string> {
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

  // Load the quiz schema for structured output
  const { readFile } = await import('fs/promises');
  const { fileURLToPath } = await import('url');
  const { dirname, join } = await import('path');

  const __filename = fileURLToPath(import.meta.url);
  const __dirname = dirname(__filename);
  const schemaPath = join(__dirname, '..', 'schema', 'quiz.schema.json');

  let quizSchema: Record<string, unknown>;
  try {
    const schemaContent = await readFile(schemaPath, 'utf-8');
    quizSchema = JSON.parse(schemaContent);
  } catch (err) {
    throw new Error('Failed to load quiz schema', { cause: err });
  }

  // Dynamic import to handle SDK
  let query: typeof import('@anthropic-ai/claude-agent-sdk').query;
  try {
    const sdk = await import('@anthropic-ai/claude-agent-sdk');
    query = sdk.query;
  } catch (err) {
    throw new Error('Failed to load Claude Agent SDK', { cause: err });
  }

  const debugMode = process.env.SPHINX_DEBUG === '1';
  let lastMessageSummary = 'none';
  let messageCount = 0;

  try {
    for await (const message of query({
      prompt,
      options: {
        cwd: process.cwd(),
        settingSources: ['project', 'user'],
        allowedTools: ['Bash', 'Read', 'Glob', 'Grep'],
        outputFormat: {
          type: 'json_schema',
          schema: quizSchema,
        },
      },
    })) {
      messageCount += 1;
      lastMessageSummary = summarizeSdkMessage(message);

      if (debugMode) {
        console.error(`[DEBUG] Message:`, JSON.stringify(message, null, 2).substring(0, 500));
      }

      // Check for result message with structured output
      if (message && typeof message === 'object') {
        const msg = message as Record<string, unknown>;

        if (msg.type === 'result') {
          if (msg.subtype === 'success' && msg.structured_output !== undefined) {
            // Return the structured output as formatted JSON
            return JSON.stringify(msg.structured_output, null, 2);
          } else if (msg.subtype !== 'success') {
            const errors = (msg.errors as string[]) || [];
            throw new Error(`Generation failed: ${errors.join(', ') || msg.subtype}`);
          }
        }
      }
    }

    throw new Error(
      `No structured output received from SDK (messages=${messageCount}, last=${lastMessageSummary})`
    );
  } catch (err) {
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

function addStandardOptions(
  command: Command,
  defaults: { focus: Focus; profile: Profile; difficulty: string }
): Command {
  return command
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
  const errorCount = Array.isArray(msg.errors) ? msg.errors.length : undefined;

  const parts = [`type=${type}`];
  if (subtype) {
    parts.push(`subtype=${subtype}`);
  }
  if (hasStructuredOutput) {
    parts.push('structured_output=yes');
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
