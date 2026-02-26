/**
 * CLI command handler for multi-source "open" quiz generation.
 */

import { Command } from 'commander';
import {
  loadConfig,
  profiles,
  getEffectiveLLMConfig,
  isAlternativeProvider,
  type Profile,
  type Focus,
  type LLMProvider,
} from '../generate/config.js';
import {
  parseSources,
  loadSourcesFromFile,
  formatSourceSpec,
} from '../generate/open/sources.js';
import {
  defaultOpenModeConfig,
  type OpenModeConfig,
  type SourceSpec,
} from '../generate/open/types.js';

export function createGenerateOpenCommand(): Command {
  const open = new Command('open')
    .description('Generate quiz from multiple heterogeneous sources')
    .option('--source <spec...>', 'Source specs (TYPE:TARGET), repeatable')
    .option('--sources-file <file>', 'JSON file containing source specs')
    .option('--prompt <text>', 'High-level focus/context for the quiz', '')
    .option('--max-agents <n>', 'Max concurrent explorer agents', parseInt, defaultOpenModeConfig.maxAgents)
    .option('--max-iterations <n>', 'Max turns per agent', parseInt, defaultOpenModeConfig.maxIterations)
    .option('--explorer-model <model>', 'Model for source exploration', defaultOpenModeConfig.explorerModel)
    .option('--synthesizer-model <model>', 'Model for quiz synthesis', defaultOpenModeConfig.synthesizerModel)
    .option('--provider <provider>', 'LLM provider: anthropic, kimi, moonshot, ollama', 'anthropic')
    .option('--api-base <url>', 'Custom API base URL (for alternative providers)')
    .option('--focus <focus>', 'Quiz focus: comprehension, changes, practices, security, concepts', 'comprehension')
    .option('--profile <profile>', 'Question profile: quick, standard, thorough', 'standard')
    .option('--questions <n>', 'Override question count', parseInt)
    .option('--difficulty <level>', 'Difficulty: easy, medium, hard, mixed', 'mixed')
    .option('--dry-run', 'Preview sources and estimated scope without running')
    .option('-o, --output <file>', 'Output file (default: stdout)')
    .action(async (options: GenerateOpenOptions) => {
      try {
        await runGenerateOpen(options);
      } catch (error) {
        console.error('Error:', error instanceof Error ? error.message : String(error));
        process.exit(1);
      }
    });

  return open;
}

interface GenerateOpenOptions {
  source?: string[];
  sourcesFile?: string;
  prompt: string;
  maxAgents: number;
  maxIterations: number;
  explorerModel: string;
  synthesizerModel: string;
  provider?: LLMProvider;
  apiBase?: string;
  focus: Focus;
  profile: Profile;
  questions?: number;
  difficulty: string;
  dryRun?: boolean;
  output?: string;
}

async function runGenerateOpen(options: GenerateOpenOptions): Promise<void> {
  // Parse sources from CLI or file
  let sources: SourceSpec[];

  if (options.sourcesFile) {
    sources = await loadSourcesFromFile(options.sourcesFile);
    if (options.source && options.source.length > 0) {
      // Merge CLI sources with file sources
      sources = [...sources, ...parseSources(options.source)];
    }
  } else if (options.source && options.source.length > 0) {
    sources = parseSources(options.source);
  } else {
    throw new Error(
      'At least one source is required. Use --source or --sources-file'
    );
  }

  // Build config with CLI overrides
  const config = await loadConfig();

  // Apply provider overrides from CLI
  if (options.provider) {
    config.llm.provider = options.provider;
  }
  if (options.apiBase) {
    config.llm.apiBase = options.apiBase;
  }

  const llmConfig = getEffectiveLLMConfig(config);
  const openConfig: OpenModeConfig = {
    maxAgents: loadEnvInt('SPHINX_OPEN_MAX_AGENTS', options.maxAgents),
    maxIterations: loadEnvInt('SPHINX_OPEN_MAX_ITERATIONS', options.maxIterations),
    explorerModel: validateModel(options.explorerModel),
    synthesizerModel: validateModel(options.synthesizerModel),
  };

  const questionCount = options.questions || profiles[options.profile].questions;

  // Dry run mode: just show what would be done
  if (options.dryRun) {
    showDryRun(sources, openConfig, options, questionCount, llmConfig);
    return;
  }

  // Check for nested Claude Code
  if (process.env.CLAUDECODE === '1') {
    throw new Error(
      `Cannot run 'sphinx generate open' from within Claude Code.\n` +
        `The generate command uses the Claude Agent SDK which spawns Claude Code as a subprocess.\n` +
        `Nested Claude Code sessions are not supported.\n\n` +
        `To generate a quiz, either:\n` +
        `  1. Run 'sphinx generate open' from a regular terminal (outside Claude Code)\n` +
        `  2. Ask Claude Code directly to generate the quiz JSON for you`
    );
  }

  // Set up environment for alternative providers
  const originalEnv: Record<string, string | undefined> = {};
  if (isAlternativeProvider(llmConfig.provider)) {
    originalEnv.ANTHROPIC_API_BASE = process.env.ANTHROPIC_API_BASE;
    process.env.ANTHROPIC_API_BASE = llmConfig.apiBase;

    if (llmConfig.apiKey && !process.env.ANTHROPIC_API_KEY) {
      originalEnv.ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
      process.env.ANTHROPIC_API_KEY = llmConfig.apiKey;
    }
  }

  // Run orchestrator
  console.error(`Starting open mode quiz generation...`);
  console.error(`Sources: ${sources.length}`);
  console.error(`Prompt: ${options.prompt || '(none)'}`);
  console.error(`Provider: ${llmConfig.provider}`);
  if (isAlternativeProvider(llmConfig.provider)) {
    console.error(`API Base: ${llmConfig.apiBase}`);
  }
  console.error(`Max agents: ${openConfig.maxAgents}`);
  console.error(`Focus: ${options.focus}, Questions: ${questionCount}`);
  console.error('');

  const { runOrchestrator } = await import('../generate/open/orchestrator.js');

  try {
    const result = await runOrchestrator({
      sources,
      prompt: options.prompt,
      config: openConfig,
      focus: options.focus,
      questionCount,
      difficulty: options.difficulty,
      globalConfig: config,
    });

    if (!result.success) {
      console.error(`Generation failed: ${result.error}`);
      console.error(`Session artifacts saved at: ${result.sessionDir}`);
      process.exit(1);
    }

    // Output the quiz
    if (result.quizPath) {
      const { readFile } = await import('fs/promises');
      const quizContent = await readFile(result.quizPath, 'utf-8');

      if (options.output) {
        const { writeFile } = await import('fs/promises');
        await writeFile(options.output, quizContent, 'utf-8');
        console.error(`Quiz written to: ${options.output}`);
      } else {
        console.log(quizContent);
      }
    }

    // Show stats
    console.error('');
    console.error(`Generation complete!`);
    console.error(`  Sources explored: ${result.stats.successfulSources}/${result.stats.totalSources}`);
    console.error(`  Concepts extracted: ${result.stats.conceptsExtracted}`);
    console.error(`  Connections found: ${result.stats.connectionsFound}`);
    console.error(`  Questions generated: ${result.stats.questionsGenerated}`);
    console.error(`  Duration: ${(result.stats.durationMs / 1000).toFixed(1)}s`);
    console.error(`  Session: ${result.sessionDir}`);
  } finally {
    // Restore original environment variables
    for (const [key, value] of Object.entries(originalEnv)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
}

function showDryRun(
  sources: SourceSpec[],
  config: OpenModeConfig,
  options: GenerateOpenOptions,
  questionCount: number,
  llmConfig: ReturnType<typeof getEffectiveLLMConfig>
): void {
  console.log('=== Dry Run: Open Mode Quiz Generation ===\n');

  console.log('Sources:');
  for (let i = 0; i < sources.length; i++) {
    console.log(`  ${i + 1}. ${formatSourceSpec(sources[i])}`);
  }
  console.log('');

  console.log('Configuration:');
  console.log(`  Provider: ${llmConfig.provider}`);
  if (isAlternativeProvider(llmConfig.provider)) {
    console.log(`  API Base: ${llmConfig.apiBase}`);
  }
  console.log(`  Max concurrent agents: ${config.maxAgents}`);
  console.log(`  Max iterations per agent: ${config.maxIterations}`);
  console.log(`  Explorer model: ${config.explorerModel}`);
  console.log(`  Synthesizer model: ${config.synthesizerModel}`);
  console.log('');

  console.log('Quiz Parameters:');
  console.log(`  Focus: ${options.focus}`);
  console.log(`  Questions: ${questionCount}`);
  console.log(`  Difficulty: ${options.difficulty}`);
  if (options.prompt) {
    console.log(`  Prompt: ${options.prompt}`);
  }
  console.log('');

  const estimatedAgents = Math.min(sources.length, config.maxAgents);
  const estimatedTime = estimateGenerationTime(sources.length, config);

  console.log('Estimates:');
  console.log(`  Parallel agents: ${estimatedAgents}`);
  console.log(`  Estimated time: ${estimatedTime}`);
  console.log('');

  console.log('To run: remove --dry-run flag');
}

function estimateGenerationTime(sourceCount: number, config: OpenModeConfig): string {
  // Rough estimates based on typical exploration times
  const agentBatches = Math.ceil(sourceCount / config.maxAgents);
  const explorationTimePerBatch = 30; // seconds
  const connectionTime = 15; // seconds
  const synthesisTime = 45; // seconds

  const totalSeconds =
    agentBatches * explorationTimePerBatch + connectionTime + synthesisTime;

  if (totalSeconds < 60) {
    return `~${totalSeconds}s`;
  } else if (totalSeconds < 3600) {
    return `~${Math.ceil(totalSeconds / 60)}min`;
  } else {
    return `~${(totalSeconds / 3600).toFixed(1)}h`;
  }
}

function loadEnvInt(envVar: string, defaultValue: number): number {
  const value = process.env[envVar];
  if (value) {
    const parsed = parseInt(value, 10);
    if (!isNaN(parsed) && parsed > 0) {
      return parsed;
    }
  }
  return defaultValue;
}

function validateModel(model: string): 'sonnet' | 'opus' | 'haiku' {
  const validModels = ['sonnet', 'opus', 'haiku'];
  const normalized = model.toLowerCase();

  if (validModels.includes(normalized)) {
    return normalized as 'sonnet' | 'opus' | 'haiku';
  }

  // Accept full model names
  if (normalized.includes('sonnet')) return 'sonnet';
  if (normalized.includes('opus')) return 'opus';
  if (normalized.includes('haiku')) return 'haiku';

  console.warn(`Unknown model "${model}", defaulting to sonnet`);
  return 'sonnet';
}
