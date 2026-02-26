import { readFile } from 'fs/promises';
import { join } from 'path';
import { homedir } from 'os';

export type LLMProvider = 'anthropic' | 'openai' | 'kimi' | 'moonshot' | 'ollama';

export interface LLMConfig {
  provider: LLMProvider;
  model?: string;
  apiKey?: string;
  /** Custom API base URL (for Kimi, Ollama, etc.) */
  apiBase?: string;
}

export interface GenerateConfig {
  llm: LLMConfig;
  github: {
    token?: string;
  };
  generate: {
    defaultProfile: 'quick' | 'standard' | 'thorough';
    defaultFocus: 'comprehension' | 'changes' | 'practices' | 'security' | 'concepts';
    defaultModel?: string;
  };
}

/**
 * Known provider configurations.
 */
export const providerConfigs: Record<string, { apiBase: string; defaultModel: string }> = {
  anthropic: {
    apiBase: 'https://api.anthropic.com',
    defaultModel: 'claude-sonnet-4-6',
  },
  kimi: {
    apiBase: 'https://api.moonshot.cn/v1',
    defaultModel: 'kimi-k2.5',
  },
  moonshot: {
    apiBase: 'https://api.moonshot.cn/v1',
    defaultModel: 'kimi-k2.5',
  },
  ollama: {
    apiBase: 'http://localhost:11434',
    defaultModel: 'kimi-k2.5:cloud',
  },
};

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
  const llmOverrides: Partial<LLMConfig> = {};
  if (process.env.SPHINX_LLM_PROVIDER) {
    llmOverrides.provider = process.env.SPHINX_LLM_PROVIDER as LLMProvider;
  }
  if (process.env.SPHINX_LLM_MODEL) {
    llmOverrides.model = process.env.SPHINX_LLM_MODEL;
  }
  if (process.env.SPHINX_API_BASE || process.env.ANTHROPIC_API_BASE) {
    llmOverrides.apiBase = process.env.SPHINX_API_BASE || process.env.ANTHROPIC_API_BASE;
  }

  // API key: check multiple sources
  if (process.env.ANTHROPIC_API_KEY) {
    llmOverrides.apiKey = process.env.ANTHROPIC_API_KEY;
  } else if (process.env.KIMI_API_KEY || process.env.MOONSHOT_API_KEY) {
    llmOverrides.apiKey = process.env.KIMI_API_KEY || process.env.MOONSHOT_API_KEY;
  } else if (process.env.OPENAI_API_KEY) {
    llmOverrides.apiKey = process.env.OPENAI_API_KEY;
  }

  if (Object.keys(llmOverrides).length > 0) {
    config.llm = llmOverrides as LLMConfig;
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

/**
 * Get the effective LLM configuration with provider defaults applied.
 */
export function getEffectiveLLMConfig(config: GenerateConfig): LLMConfig & { apiBase: string; model: string } {
  const provider = config.llm.provider;
  const providerConfig = providerConfigs[provider] || providerConfigs.anthropic;

  return {
    provider,
    apiKey: config.llm.apiKey,
    apiBase: config.llm.apiBase || providerConfig.apiBase,
    model: config.llm.model || config.generate.defaultModel || providerConfig.defaultModel,
  };
}

/**
 * Check if the provider requires a custom API base configuration.
 */
export function isAlternativeProvider(provider: LLMProvider): boolean {
  return provider !== 'anthropic';
}
