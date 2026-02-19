# Generate Quiz Skill - Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a `sphinx generate` command that uses an Agent Skill to create quizzes from GitHub repos/PRs, git repos/diffs, and Confluence pages.

**Architecture:** CLI subcommands invoke Claude Agent SDK with a generate-quiz skill. The skill uses tools (Bash, Read, Glob) to explore content sources and generates validated Sphinx quiz JSON.

**Tech Stack:** Commander.js (CLI), Claude Agent SDK, existing Sphinx validation

---

## Task 1: Create Skill Directory Structure

**Files:**
- Create: `.claude/skills/generate-quiz/SKILL.md`
- Create: `.claude/skills/generate-quiz/sources/github.md`
- Create: `.claude/skills/generate-quiz/sources/git.md`
- Create: `.claude/skills/generate-quiz/sources/confluence.md`

**Step 1: Create skill directories**

Run:
```bash
mkdir -p .claude/skills/generate-quiz/sources
```

**Step 2: Verify directory created**

Run: `ls -la .claude/skills/generate-quiz/`
Expected: Empty directory with sources/ subdirectory

**Step 3: Commit**

```bash
git add .claude/skills/generate-quiz
git commit -m "chore: create generate-quiz skill directory structure"
```

---

## Task 2: Write Core SKILL.md

**Files:**
- Create: `.claude/skills/generate-quiz/SKILL.md`

**Step 1: Write the skill file**

```markdown
---
name: generate-quiz
description: >
  Generate a Sphinx quiz from any content source. Use when asked to create
  a quiz, assessment, or test from: GitHub repos/PRs, git branches/diffs,
  Confluence pages, or other documentation. Explores content using available
  tools, identifies key concepts, and outputs valid Sphinx quiz JSON.
---

# Generate Quiz from Content

## Overview

Generate educational quizzes that test understanding of code, documentation,
or changes. This skill adapts to the content source and focus area requested.

## Inputs (from user message)

- **Source**: Where to get content (github, git, confluence, etc.)
- **Focus**: comprehension | changes | practices | security | concepts
- **Profile**: quick (5) | standard (10) | thorough (15) questions
- **Difficulty**: easy | medium | hard | mixed
- **Types**: multiple-choice, multi-select, free-text
- **Output**: File path or stdout

## Process

### Step 1: Identify Source & Load Instructions

Based on the source type mentioned, read the relevant guide:
- GitHub repo/PR: Read `.claude/skills/generate-quiz/sources/github.md`
- Git local/diff: Read `.claude/skills/generate-quiz/sources/git.md`
- Confluence: Read `.claude/skills/generate-quiz/sources/confluence.md`

### Step 2: Gather Project Context

Look for and read these files if they exist:
- `CLAUDE.md` or `AGENT.md` - Project conventions and AI context
- `README.md` - Project overview and purpose
- `docs/` directory - Architecture, API documentation
- `package.json`, `Cargo.toml`, `pyproject.toml` - Dependencies and config

### Step 3: Extract Content from Source

Follow the source-specific instructions to gather content:
- **For code repos**: Key source files, structure, patterns, entry points
- **For changes (PR/diff)**: Diffs, commit messages, PR description, review comments
- **For documentation**: Page content, linked pages, hierarchy

Prioritize by relevance. Limit exploration to stay focused.

### Step 4: Identify Quiz Topics

Based on the focus area, identify 2-3x more potential topics than questions needed:

| Focus | Topic Types |
|-------|-------------|
| comprehension | Core concepts, how components work, relationships between parts |
| changes | Why changes were made, impact of changes, trade-offs considered |
| practices | Best practices, code smells, potential improvements |
| security | Vulnerabilities, attack vectors, security mitigations |
| concepts | Definitions, terminology, domain knowledge |

### Step 5: Generate Questions

For each selected topic, create a question:

1. **Choose question type** based on content:
   - Facts with clear answer → multiple-choice
   - Multiple valid points → multi-select
   - Requires explanation → free-text

2. **Set IRT difficulty** (-2 to +2):
   - -2: Basic terminology, obvious from reading
   - -1: Simple concepts, single-step reasoning
   - 0: Moderate understanding required
   - +1: Requires connecting multiple concepts
   - +2: Expert-level, nuanced understanding

3. **Include context**: Add relevant code snippets or content excerpts

4. **Write clear explanation**: Educational, explains why answer is correct

### Step 6: Assemble Quiz JSON

Create valid JSON matching Sphinx schema:

```json
{
  "version": "1.0",
  "metadata": {
    "id": "<source-based-id>",
    "title": "<descriptive-title>",
    "description": "<what-this-quiz-tests>",
    "tags": ["<relevant>", "<tags>"]
  },
  "config": {
    "mode": "static",
    "passingThreshold": 0.7,
    "showCorrectAnswers": "after-completion"
  },
  "questions": [...]
}
```

### Step 7: Verify Output

**Critical: Always validate before outputting.**

1. Write generated JSON to temp file:
```bash
cat > /tmp/sphinx-quiz-draft.json << 'QUIZ_EOF'
<generated JSON here>
QUIZ_EOF
```

2. Run schema validation:
```bash
sphinx validate /tmp/sphinx-quiz-draft.json --verbose
```

3. If validation fails:
   - Read the error messages carefully
   - Fix the identified issues in the JSON
   - Write corrected JSON to temp file
   - Re-validate until passing

4. If validation passes, output the quiz:
   - If output file specified: write to that file
   - Otherwise: output the JSON to the user

### Step 8: Cleanup

```bash
rm -f /tmp/sphinx-quiz-draft.json
```

## Error Recovery

If validation fails after 3 attempts:
1. Output the current best-effort JSON
2. List the validation errors encountered
3. Suggest what manual fixes are needed

## Quiz Schema Quick Reference

**Question structure:**
```json
{
  "id": "q1",
  "type": "multiple-choice",
  "difficulty": 0.5,
  "discrimination": 1.2,
  "category": "topic-area",
  "prompt": "Question text here?",
  "context": "Optional code or content snippet",
  "options": [
    { "id": "a", "text": "Option A", "correct": false },
    { "id": "b", "text": "Option B", "correct": true }
  ],
  "explanation": "Why B is correct..."
}
```

**Question types:**
- `multiple-choice`: Single correct answer from options
- `multi-select`: Multiple correct answers, has `scoring: "partial" | "all-or-nothing"`
- `free-text`: Text input, has `acceptedAnswers`, `matchMode`, `caseSensitive`
```

**Step 2: Verify skill file created**

Run: `cat .claude/skills/generate-quiz/SKILL.md | head -20`
Expected: Shows frontmatter and beginning of skill

**Step 3: Commit**

```bash
git add .claude/skills/generate-quiz/SKILL.md
git commit -m "feat: add core generate-quiz skill"
```

---

## Task 3: Write GitHub Source Instructions

**Files:**
- Create: `.claude/skills/generate-quiz/sources/github.md`

**Step 1: Write GitHub source file**

```markdown
# GitHub Source Instructions

## Requirements

- `gh` CLI must be installed and authenticated
- Or `GITHUB_TOKEN` environment variable set

## For GitHub Repository

### Fetch repository overview
```bash
gh repo view <owner/repo>
```

### List repository structure
```bash
gh api repos/<owner/repo>/git/trees/HEAD?recursive=1 --jq '.tree[].path' | head -100
```

### Read important files
Clone locally or use API:
```bash
gh api repos/<owner/repo>/contents/README.md --jq '.content' | base64 -d
gh api repos/<owner/repo>/contents/src --jq '.[].name'
```

### Focus areas for comprehension
- README.md - Project purpose and overview
- Main entry points (index.ts, main.py, etc.)
- Core source files in src/ or lib/
- Configuration files (package.json, etc.)
- Documentation in docs/

## For GitHub Pull Request

### Fetch PR metadata
```bash
gh pr view <number> --repo <owner/repo> --json title,body,state,author,baseRefName,headRefName
```

### Get changed files list
```bash
gh pr view <number> --repo <owner/repo> --json files --jq '.files[].path'
```

### Get full diff
```bash
gh pr diff <number> --repo <owner/repo>
```

### Get PR discussion context
```bash
gh pr view <number> --repo <owner/repo> --json comments,reviews
```

### Get commit messages
```bash
gh pr view <number> --repo <owner/repo> --json commits --jq '.commits[].messageHeadline'
```

### Focus areas for changes
- PR title and description explain the "why"
- Commit messages provide context
- Diff shows the "what"
- Review comments highlight concerns
- Look at both added and removed code

## Prioritization

1. Always read PR/repo description first
2. Focus on source code over tests (unless testing-focused)
3. Limit to ~20 most relevant files
4. Skip generated files, lock files, binaries
```

**Step 2: Verify file created**

Run: `cat .claude/skills/generate-quiz/sources/github.md | head -10`
Expected: Shows header and requirements

**Step 3: Commit**

```bash
git add .claude/skills/generate-quiz/sources/github.md
git commit -m "feat: add GitHub source instructions for quiz generation"
```

---

## Task 4: Write Git Source Instructions

**Files:**
- Create: `.claude/skills/generate-quiz/sources/git.md`

**Step 1: Write Git source file**

```markdown
# Git Source Instructions

## Requirements

- Must be run from within a git repository
- `git` CLI available

## For Local Repository

### Check repo status
```bash
git status
git log --oneline -10
```

### Explore structure
```bash
find . -type f \( -name "*.ts" -o -name "*.js" -o -name "*.py" -o -name "*.go" -o -name "*.rs" \) | grep -v node_modules | grep -v dist | head -50
```

### Read key files
Use the Read tool to read:
- README.md
- CLAUDE.md or AGENT.md
- Main source files identified from structure

### Focus areas for comprehension
- Entry points and main modules
- Core business logic
- Public APIs and interfaces
- Configuration and setup

## For Branch Diff

### Identify branches
```bash
git branch -a
git log --oneline main..<branch> # or master
```

### Get commit messages (explain why)
```bash
git log main..<branch> --format="%s%n%b"
```

### Get list of changed files
```bash
git diff --name-only main...<branch>
```

### Get full diff
```bash
git diff main...<branch>
```

### Get diff with context
```bash
git diff -U10 main...<branch>  # 10 lines of context
```

### Focus areas for changes
- Commit messages explain intent
- Look at both additions and deletions
- Understand what problem is being solved
- Note any refactoring vs new features

## Prioritization

1. Commit messages first - they explain why
2. Changed source files over changed tests
3. Core modules over utilities
4. Skip formatting-only changes
5. Limit diff review to meaningful changes
```

**Step 2: Verify file created**

Run: `cat .claude/skills/generate-quiz/sources/git.md | head -10`
Expected: Shows header and requirements

**Step 3: Commit**

```bash
git add .claude/skills/generate-quiz/sources/git.md
git commit -m "feat: add Git source instructions for quiz generation"
```

---

## Task 5: Write Confluence Source Instructions

**Files:**
- Create: `.claude/skills/generate-quiz/sources/confluence.md`

**Step 1: Write Confluence source file**

```markdown
# Confluence Source Instructions

## Requirements

One of:
- Confluence MCP server connected and available
- `CONFLUENCE_URL` and `CONFLUENCE_TOKEN` environment variables set

## Fetching Content

### If MCP server available
Use the Confluence MCP tools to:
1. Search for pages by title or space
2. Fetch page content by ID
3. Get child pages for hierarchy

### If using API directly
```bash
# Get page content
curl -s -H "Authorization: Bearer $CONFLUENCE_TOKEN" \
  "$CONFLUENCE_URL/wiki/rest/api/content/<page-id>?expand=body.storage"

# Get child pages
curl -s -H "Authorization: Bearer $CONFLUENCE_TOKEN" \
  "$CONFLUENCE_URL/wiki/rest/api/content/<page-id>/child/page"
```

## Content Extraction

### From page URL
Extract page ID from URL: `https://domain.atlassian.net/wiki/spaces/SPACE/pages/<page-id>/Title`

### Process HTML content
- Extract text from body.storage.value
- Preserve code blocks and tables
- Note headings for structure

## Focus Areas for Concepts

- Page title and overview
- Key definitions and terminology
- Process descriptions
- Diagrams (note their presence, describe if possible)
- Links to related pages (for context)
- Code examples if present

## Prioritization

1. Main page content first
2. Immediate child pages for depth
3. Linked pages for breadth
4. Skip navigation/template content
5. Focus on substantive documentation
```

**Step 2: Verify file created**

Run: `cat .claude/skills/generate-quiz/sources/confluence.md | head -10`
Expected: Shows header and requirements

**Step 3: Commit**

```bash
git add .claude/skills/generate-quiz/sources/confluence.md
git commit -m "feat: add Confluence source instructions for quiz generation"
```

---

## Task 6: Add Claude Agent SDK Dependency

**Files:**
- Modify: `package.json`

**Step 1: Add SDK dependency**

Run:
```bash
npm install @anthropic-ai/claude-agent-sdk
```

**Step 2: Verify installation**

Run: `grep claude-agent-sdk package.json`
Expected: Shows the dependency in package.json

**Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add Claude Agent SDK dependency"
```

---

## Task 7: Create Config Module

**Files:**
- Create: `src/generate/config.ts`

**Step 1: Write config module**

```typescript
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
    return JSON.parse(content);
  } catch {
    return {};
  }
}

function loadEnvConfig(): Partial<GenerateConfig> {
  const config: Partial<GenerateConfig> = {
    llm: {},
    github: {},
    generate: {},
  };

  // LLM provider
  if (process.env.SPHINX_LLM_PROVIDER) {
    config.llm!.provider = process.env.SPHINX_LLM_PROVIDER as 'anthropic' | 'openai';
  }

  // API keys
  if (process.env.ANTHROPIC_API_KEY) {
    config.llm!.apiKey = process.env.ANTHROPIC_API_KEY;
  } else if (process.env.OPENAI_API_KEY) {
    config.llm!.apiKey = process.env.OPENAI_API_KEY;
  }

  // GitHub token
  if (process.env.GITHUB_TOKEN) {
    config.github!.token = process.env.GITHUB_TOKEN;
  } else if (process.env.GH_TOKEN) {
    config.github!.token = process.env.GH_TOKEN;
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
```

**Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit src/generate/config.ts`
Expected: No errors

**Step 3: Commit**

```bash
git add src/generate/config.ts
git commit -m "feat: add config module for generate command"
```

---

## Task 8: Create Generate Command

**Files:**
- Create: `src/commands/generate.ts`

**Step 1: Write generate command**

```typescript
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

async function invokeSkill(prompt: string, config: ReturnType<typeof loadConfig> extends Promise<infer T> ? T : never): Promise<string> {
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
    } else if (message.type === 'text') {
      result += message.text;
    }
  }

  // Extract JSON from result
  const jsonMatch = result.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    return jsonMatch[0];
  }

  return result;
}
```

**Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit src/commands/generate.ts`
Expected: No errors (or SDK type errors we'll fix)

**Step 3: Commit**

```bash
git add src/commands/generate.ts
git commit -m "feat: add generate command with subcommands"
```

---

## Task 9: Register Generate Command in CLI

**Files:**
- Modify: `src/cli.ts`

**Step 1: Add import and register command**

Add to imports at top:
```typescript
import { createGenerateCommand } from './commands/generate.js';
```

Add before `program.parse()`:
```typescript
program.addCommand(createGenerateCommand());
```

**Step 2: Verify build succeeds**

Run: `npm run build`
Expected: Build completes without errors

**Step 3: Test help output**

Run: `node dist/cli.js generate --help`
Expected: Shows generate command with subcommands

**Step 4: Commit**

```bash
git add src/cli.ts
git commit -m "feat: register generate command in CLI"
```

---

## Task 10: Create Generate Index Export

**Files:**
- Create: `src/generate/index.ts`

**Step 1: Write index file**

```typescript
export * from './config.js';
```

**Step 2: Update build script to copy skills**

Modify `package.json` scripts.build:
```json
"build": "tsc && cp -r src/schema dist/ && cp -r templates dist/ && cp -r .claude dist/"
```

**Step 3: Build and verify**

Run: `npm run build`
Expected: Build succeeds, `.claude` copied to `dist/`

**Step 4: Commit**

```bash
git add src/generate/index.ts package.json
git commit -m "feat: add generate module exports and copy skills to dist"
```

---

## Task 11: End-to-End Test

**Files:** None (testing only)

**Step 1: Verify CLI help**

Run: `node dist/cli.js generate --help`
Expected: Shows generate command

Run: `node dist/cli.js generate github --help`
Expected: Shows github subcommands (repo, pr)

Run: `node dist/cli.js generate git --help`
Expected: Shows git subcommands (local, diff)

**Step 2: Verify skill is present**

Run: `cat dist/.claude/skills/generate-quiz/SKILL.md | head -5`
Expected: Shows skill frontmatter

**Step 3: Test generate command (dry run)**

Run: `node dist/cli.js generate git local . --help`
Expected: Shows options for local command

**Step 4: Final commit**

```bash
git add -A
git commit -m "feat: complete generate quiz command implementation"
```

---

## Summary

| Task | Description | Files |
|------|-------------|-------|
| 1 | Create skill directory structure | `.claude/skills/generate-quiz/` |
| 2 | Write core SKILL.md | `.claude/skills/generate-quiz/SKILL.md` |
| 3 | Write GitHub source instructions | `sources/github.md` |
| 4 | Write Git source instructions | `sources/git.md` |
| 5 | Write Confluence source instructions | `sources/confluence.md` |
| 6 | Add Claude Agent SDK dependency | `package.json` |
| 7 | Create config module | `src/generate/config.ts` |
| 8 | Create generate command | `src/commands/generate.ts` |
| 9 | Register command in CLI | `src/cli.ts` |
| 10 | Create exports and update build | `src/generate/index.ts`, `package.json` |
| 11 | End-to-end verification | (testing) |
