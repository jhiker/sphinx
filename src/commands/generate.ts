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

  github
    .command('pr')
    .description('Generate quiz from a GitHub pull request')
    .argument('<url>', 'GitHub PR URL')
    .option('--token <token>', 'GitHub token')
    .option('--focus <focus>', 'Quiz focus', 'changes')
    .option('--profile <profile>', 'Question profile', 'standard')
    .option('--questions <n>', 'Override question count', parseInt)
    .option('--difficulty <level>', 'Difficulty', 'mixed')
    .option('-o, --output <file>', 'Output file')
    .action(async (url, options) => {
      await runGenerate('github', 'pr', url, options);
    });

  generate.addCommand(github);

  // Git subcommands
  const git = new Command('git')
    .description('Generate quiz from local git content');

  git
    .command('local')
    .description('Generate quiz from local git repository')
    .argument('[path]', 'Path to repository', '.')
    .option('--focus <focus>', 'Quiz focus', 'comprehension')
    .option('--profile <profile>', 'Question profile', 'standard')
    .option('--questions <n>', 'Override question count', parseInt)
    .option('--difficulty <level>', 'Difficulty', 'mixed')
    .option('-o, --output <file>', 'Output file')
    .action(async (path, options) => {
      await runGenerate('git', 'local', path, options);
    });

  git
    .command('diff')
    .description('Generate quiz from git branch diff')
    .argument('<branch>', 'Branch to diff')
    .option('--base <base>', 'Base branch to diff against', 'main')
    .option('--focus <focus>', 'Quiz focus', 'changes')
    .option('--profile <profile>', 'Question profile', 'standard')
    .option('--questions <n>', 'Override question count', parseInt)
    .option('--difficulty <level>', 'Difficulty', 'mixed')
    .option('-o, --output <file>', 'Output file')
    .action(async (branch, options) => {
      await runGenerate('git', 'diff', branch, options);
    });

  generate.addCommand(git);

  // Confluence subcommand
  generate
    .command('confluence')
    .description('Generate quiz from Confluence page')
    .argument('<url>', 'Confluence page URL')
    .option('--focus <focus>', 'Quiz focus', 'concepts')
    .option('--profile <profile>', 'Question profile', 'standard')
    .option('--questions <n>', 'Override question count', parseInt)
    .option('--difficulty <level>', 'Difficulty', 'mixed')
    .option('-o, --output <file>', 'Output file')
    .action(async (url, options) => {
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
    console.error('Error generating quiz:', (error as Error).message);
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
  // Dynamic import to handle SDK
  const { query } = await import('@anthropic-ai/claude-agent-sdk');

  let result = '';

  for await (const message of query({
    prompt,
    options: {
      cwd: process.cwd(),
      settingSources: ['project', 'user'],
      allowedTools: ['Skill', 'Bash', 'Read', 'Glob', 'Grep', 'Write'],
    },
  })) {
    if (typeof message === 'string') {
      result += message;
    } else if (message && typeof message === 'object' && 'type' in message && message.type === 'text') {
      result += (message as { type: 'text'; text: string }).text;
    }
  }

  // Extract JSON from result
  const jsonMatch = result.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    return jsonMatch[0];
  }

  return result;
}
