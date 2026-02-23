import { readFile } from 'fs/promises';
import { join } from 'path';
import { homedir } from 'os';

export interface GenerateConfig {
  llm: {
    provider: 'anthropic' | 'openai';
    model?: string;
    apiKey?: string;
  };
  github: {
    token?: string;
  };
  generate: {
    defaultProfile: 'quick' | 'standard' | 'thorough';
    defaultFocus: 'comprehension' | 'changes' | 'practices' | 'security' | 'concepts';
    defaultModel?: string;
  };
}

const defaultConfig: GenerateConfig = {
  llm: {
    provider: 'anthropic',
  },
  github: {},
  generate: {
    defaultProfile: 'standard',
    defaultFocus: 'comprehension',
  },
};

export async function loadConfig(cliOptions: Partial<GenerateConfig> = {}): Promise<GenerateConfig> {
  // Start with defaults
  let config = { ...defaultConfig };

  // Layer 1: Config file
  const fileConfig = await loadConfigFile();
  config = mergeConfig(config, fileConfig);

  // Layer 2: Environment variables
  const envConfig = loadEnvConfig();
  config = mergeConfig(config, envConfig);

  // Layer 3: CLI options (highest priority)
  config = mergeConfig(config, cliOptions);

  return config;
}

async function loadConfigFile(): Promise<Partial<GenerateConfig>> {
  const configPath = join(homedir(), '.sphinx', 'config.json');

  try {
    const content = await readFile(configPath, 'utf-8');
    const parsed: unknown = JSON.parse(content);
    if (!parsed || typeof parsed !== 'object') {
      return {};
    }
    return parsed as Partial<GenerateConfig>;
  } catch {
    return {};
  }
}

function loadEnvConfig(): Partial<GenerateConfig> {
  const config: Partial<GenerateConfig> = {};

  // LLM config
  const llmOverrides: Partial<GenerateConfig['llm']> = {};
  if (process.env.SPHINX_LLM_PROVIDER) {
    llmOverrides.provider = process.env.SPHINX_LLM_PROVIDER as 'anthropic' | 'openai';
  }
  if (process.env.SPHINX_LLM_MODEL) {
    llmOverrides.model = process.env.SPHINX_LLM_MODEL;
  }
  if (process.env.ANTHROPIC_API_KEY) {
    llmOverrides.apiKey = process.env.ANTHROPIC_API_KEY;
  } else if (process.env.OPENAI_API_KEY) {
    llmOverrides.apiKey = process.env.OPENAI_API_KEY;
  }
  if (Object.keys(llmOverrides).length > 0) {
    config.llm = llmOverrides as GenerateConfig['llm'];
  }

  // GitHub config
  const githubToken = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
  if (githubToken) {
    config.github = { token: githubToken };
  }

  if (process.env.SPHINX_DEFAULT_MODEL) {
    config.generate = { defaultModel: process.env.SPHINX_DEFAULT_MODEL } as GenerateConfig['generate'];
  }

  return config;
}

function mergeConfig(base: GenerateConfig, override: Partial<GenerateConfig>): GenerateConfig {
  return {
    llm: { ...base.llm, ...override.llm },
    github: { ...base.github, ...override.github },
    generate: { ...base.generate, ...override.generate },
  };
}

export type Profile = 'quick' | 'standard' | 'thorough';
export type Focus = 'comprehension' | 'changes' | 'practices' | 'security' | 'concepts';

export const profiles: Record<Profile, { questions: number; description: string }> = {
  quick: { questions: 5, description: '5 questions, fast assessment' },
  standard: { questions: 10, description: '10 questions, balanced coverage' },
  thorough: { questions: 15, description: '15 questions, comprehensive' },
};
