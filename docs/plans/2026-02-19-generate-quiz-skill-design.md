# Generate Quiz Skill - Design Document

**Date:** 2026-02-19
**Status:** Approved

## Overview

Add a `generate` command to Sphinx that creates quizzes from various content sources using an Agent Skill. The skill leverages Claude's tools (git, gh, MCP servers) to explore content and generate valid Sphinx quiz JSON.

## Design Decisions

| Decision | Choice |
|----------|--------|
| LLM Provider | Configurable (Anthropic, OpenAI) |
| CLI Structure | Subcommands per source |
| Quiz Focus | Configurable with smart defaults |
| Output | Stdout default, `-o` for file |
| Config Precedence | CLI > env vars > config file |
| Quiz Parameters | Presets with override flags |
| Architecture | Agent Skill (not one-shot prompt) |
| Extensibility | Source-agnostic, pluggable sources |

## Command Structure

```bash
sphinx generate <source> <subcommand> [options]

# GitHub
sphinx generate github repo <url>
sphinx generate github pr <url>

# Git
sphinx generate git local [path]
sphinx generate git diff <branch> [--base main]

# Confluence
sphinx generate confluence <page-url>

# Common options
  -o, --output <file>       Write to file instead of stdout
  --focus <type>            comprehension | changes | practices | security | concepts
  --profile <name>          quick (5q) | standard (10q) | thorough (15q)
  --questions <n>           Override question count
  --difficulty <level>      easy | medium | hard | mixed
  --types <list>            Question types to include
  --provider <name>         LLM provider (anthropic, openai)
  --api-key <key>           API key (or use env/config)
  --token <token>           GitHub token (for github source)
```

## Configuration System

**Precedence:** CLI flags → Environment variables → Config file → Defaults

**Environment variables:**
```bash
ANTHROPIC_API_KEY=sk-ant-...
OPENAI_API_KEY=sk-...
SPHINX_LLM_PROVIDER=anthropic
GITHUB_TOKEN=ghp_...
```

**Config file** (`~/.sphinx/config.json`):
```json
{
  "llm": {
    "provider": "anthropic",
    "model": "claude-sonnet-4-20250514"
  },
  "github": {
    "token": "ghp_..."
  },
  "generate": {
    "defaultProfile": "standard",
    "defaultFocus": "comprehension"
  }
}
```

## Skill Architecture

```
.claude/skills/generate-quiz/
├── SKILL.md              # Core quiz generation logic
└── sources/
    ├── git.md            # Instructions for git/local repos
    ├── github.md         # Instructions for GitHub repos/PRs
    └── confluence.md     # Instructions for Confluence pages
```

### Core SKILL.md

```markdown
---
name: generate-quiz
description: >
  Generate a Sphinx quiz from any content source. Use when asked to create
  a quiz from: GitHub repos/PRs, git branches/diffs, Confluence pages,
  or other documentation. Explores content, identifies key concepts, and
  outputs valid Sphinx quiz JSON.
---

# Generate Quiz from Content

## Overview
Generate educational quizzes that test understanding of code, documentation,
or changes. Adapts to the content source and focus area.

## Inputs
- **Source**: Where to get content (github, git, confluence, etc.)
- **Focus**: comprehension | changes | practices | security | concepts
- **Profile**: quick (5) | standard (10) | thorough (15) questions
- **Difficulty**: easy | medium | hard | mixed
- **Types**: multiple-choice, multi-select, free-text

## Process

### Step 1: Identify Source & Load Instructions
Based on the source type, read the relevant guide:
- GitHub: .claude/skills/generate-quiz/sources/github.md
- Git: .claude/skills/generate-quiz/sources/git.md
- Confluence: .claude/skills/generate-quiz/sources/confluence.md

### Step 2: Gather Project Context
Look for and read (if they exist):
- CLAUDE.md, AGENT.md - Project conventions and context
- README.md - Project overview
- Architecture docs, API docs

### Step 3: Extract Content
Follow source-specific instructions to gather:
- For code: Key files, structure, patterns
- For changes: Diffs, commit messages, PR descriptions
- For docs: Page content, linked pages, hierarchy

### Step 4: Identify Quiz Topics
Based on focus area, identify 2-3x more topics than needed:
- **comprehension**: Core concepts, how things work, relationships
- **changes**: Why changes were made, impact, trade-offs
- **practices**: Best practices, potential issues, improvements
- **security**: Vulnerabilities, attack vectors, mitigations
- **concepts**: Definitions, terminology, domain knowledge

### Step 5: Generate Questions
For each topic, create questions following Sphinx schema:
- Vary question types based on content
- Set IRT difficulty (-2 to +2) based on concept complexity
- Include code/content snippets as context
- Write clear explanations for answers

### Step 6: Output Quiz JSON
Output valid JSON matching Sphinx schema. Include:
- Metadata (id, title, description based on source)
- Config (mode: static, threshold: 0.7)
- Questions array

### Step 7: Verify Output

Before presenting the quiz, validate it:

1. Write generated JSON to temp file
2. Run: `sphinx validate /tmp/sphinx-quiz-draft.json --verbose`
3. If validation fails, fix issues and re-validate
4. Once valid, output to requested destination

### Step 8: Cleanup
Remove temp files.

## Error Recovery

If validation fails repeatedly (3+ attempts):
1. Output the current best-effort JSON
2. Include validation errors as comments
3. Suggest manual fixes needed
```

### Source: github.md

```markdown
# GitHub Source

## Requirements
- `gh` CLI authenticated (or GITHUB_TOKEN provided)

## For Repository
gh repo view <owner/repo>
gh api repos/<owner/repo>/git/trees/main?recursive=1

Focus on: README, src/ directory, main entry points, config files

## For Pull Request
gh pr view <number> --repo <owner/repo> --json title,body,commits,files
gh pr diff <number> --repo <owner/repo>
gh pr view <number> --repo <owner/repo> --json comments,reviews

Focus on: Changed files, PR description, commit messages, review comments
```

### Source: git.md

```markdown
# Git Source

## For Local Repository
find . -type f -name "*.ts" -o -name "*.py" | head -50
git log --oneline -20

Read key files directly with Read tool.

## For Branch Diff
git log <base>..<branch> --oneline
git diff <base>...<branch>
git diff --name-only <base>...<branch>

Focus on: What changed, commit messages explain why
```

### Source: confluence.md

```markdown
# Confluence Source

## Requirements
- Confluence MCP server connected, OR
- CONFLUENCE_TOKEN and CONFLUENCE_URL environment variables

## Fetching Content
Use available Confluence tools to:
1. Fetch page content by URL or page ID
2. Get child pages if exploring a space
3. Extract text content from page body

## Focus Areas
- Page content and structure
- Linked/child pages for broader context
- Labels and metadata for categorization
```

## CLI Implementation

The CLI uses Claude Agent SDK to invoke the skill:

```typescript
import { query } from "@anthropic-ai/claude-agent-sdk";

async function generate(source: string, options: GenerateOptions) {
  const prompt = buildPrompt(source, options);

  for await (const msg of query({
    prompt,
    options: {
      cwd: process.cwd(),
      settingSources: ["project"],
      allowedTools: ["Skill", "Bash", "Read", "Glob", "Grep"]
    }
  })) {
    // Handle streaming output
  }
}
```

## File Structure

```
src/
├── commands/
│   └── generate.ts        # Generate command + subcommands
├── generate/
│   ├── index.ts           # Exports
│   ├── config.ts          # Config loading (env, file, CLI merge)
│   └── profiles.ts        # Preset profiles (quick, standard, thorough)
.claude/skills/generate-quiz/
├── SKILL.md               # Core skill
└── sources/
    ├── github.md
    ├── git.md
    └── confluence.md
```

## Dependencies

- `@anthropic-ai/claude-agent-sdk` - Claude Agent SDK

## Default Focus by Source

| Source | Default Focus |
|--------|---------------|
| github repo | comprehension |
| github pr | changes |
| git local | comprehension |
| git diff | changes |
| confluence | concepts |
