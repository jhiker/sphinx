# Sphinx - Agent Guide

This document helps coding agents understand the Sphinx quiz system architecture.

## Purpose

Sphinx is a JSON-based quiz system for measuring technical competence. It supports:
- Static quizzes with fixed question order
- Adaptive quizzes using Item Response Theory (IRT)
- AI-powered quiz generation from code repositories

## Directory Structure

```
sphinx/
├── src/
│   ├── cli.ts                 # Entry point, Commander.js setup
│   ├── commands/              # CLI command implementations
│   │   ├── quiz.ts            # Interactive quiz runner
│   │   ├── build.ts           # HTML generation
│   │   ├── validate.ts        # Schema validation
│   │   ├── generate.ts        # AI quiz generation (uses Claude Agent SDK)
│   │   └── generate-open.ts   # Multi-source "open" mode generation
│   ├── core/                  # Core quiz logic
│   │   ├── types.ts           # TypeScript interfaces (Quiz, Question, etc.)
│   │   ├── parser.ts          # JSON parsing + Ajv schema validation
│   │   ├── engine.ts          # QuizEngine - runs quizzes, scores answers
│   │   ├── irt.ts             # IRTEngine - 2PL adaptive testing
│   │   └── question-types.ts  # Scoring/validation per question type
│   ├── generate/              # Quiz generation
│   │   ├── config.ts          # Layered config: defaults → file → env → CLI
│   │   └── open/              # Multi-source open mode
│   │       ├── types.ts       # Open mode interfaces
│   │       ├── sources.ts     # Source parsing and validation
│   │       ├── agents.ts      # Agent definitions (explorer, connection, synthesizer)
│   │       ├── orchestrator.ts # Parallel agent coordination
│   │       ├── notes.ts       # Notes validation and aggregation
│   │       └── synthesize.ts  # Question selection and ranking
│   ├── renderers/             # Output formatters
│   │   ├── cli.ts             # Terminal output with ANSI colors
│   │   └── html.ts            # Standalone HTML quiz builder
│   ├── results/               # Result persistence
│   │   ├── display.ts         # Console output
│   │   ├── file.ts            # JSON file output
│   │   └── webhook.ts         # HTTP POST results
│   └── schema/
│       └── quiz.schema.json   # JSON Schema (draft-07)
├── skills/
│   ├── generate-quiz/         # Single-source quiz generation skill
│   │   ├── SKILL.md           # Skill definition
│   │   └── sources/           # Source-specific instructions
│   └── generate-quiz-open/    # Multi-source open mode skill
│       └── SKILL.md           # Open mode skill definition
├── examples/                  # Sample quiz files
└── docs/plans/                # Design documents
```

## Key Concepts

### Quiz Structure

A quiz JSON file has this shape:

```typescript
interface Quiz {
  version: string;              // Schema version (e.g., "1.0")
  metadata: {
    id: string;                 // Unique identifier (kebab-case)
    title: string;
    description?: string;
    tags?: string[];
    author?: string;
  };
  config: {
    mode: 'static' | 'adaptive';
    passingThreshold: number;   // 0.0 - 1.0
    timeLimit: number | null;   // Seconds
    randomizeOrder: boolean;
    showCorrectAnswers: 'never' | 'after-each' | 'after-completion';
  };
  questions: Question[];        // At least one required
  adaptive?: AdaptiveConfig;    // Required if mode is 'adaptive'
  results?: ResultsConfig;
}
```

### Question Types

1. **multiple-choice**: Single correct answer from options
2. **multi-select**: Multiple correct answers, supports partial scoring
3. **free-text**: Text input with exact/contains/regex matching
4. **code-challenge**: Programming problems with test cases

### IRT (Item Response Theory)

The `IRTEngine` implements 2-Parameter Logistic model:
- **θ (theta)**: Ability estimate (-3 to +3 scale)
- **a (discrimination)**: How well question differentiates ability levels
- **b (difficulty)**: Question difficulty on theta scale

Adaptive quizzes select questions that maximize information at current θ estimate.

## CLI Commands

```bash
sphinx quiz <file>           # Run quiz interactively
sphinx quiz <file> --ci      # CI mode (non-interactive)
sphinx build <file>          # Generate HTML
sphinx validate <file>       # Validate JSON
sphinx generate git local .  # Generate quiz from repo
sphinx generate github repo <url>  # Generate from GitHub repo
sphinx generate open --source "github:owner/repo" --prompt "..." # Multi-source generation
```

## Generation Architecture

### Single-Source Generation

The `generate` command:
1. Loads config from `~/.sphinx/config.json` → env vars → CLI flags
2. Builds a prompt with source/focus/question count
3. Invokes Claude Agent SDK with `outputFormat: { type: 'json_schema', schema: quizSchema }`
4. Returns `structured_output` from result message

### Multi-Source "Open" Mode

The `generate open` command enables quiz generation from multiple heterogeneous sources:

```bash
sphinx generate open \
  --source "github:owner/repo1" \
  --source "url:https://docs.example.com" \
  --prompt "Quiz about the combined architecture" \
  -o quiz.json
```

**Architecture:**
```
┌─────────────────────────────────────┐
│         Main Orchestrator           │
│  (spawns agents, tracks progress)   │
└─────────────────┬───────────────────┘
                  │
    ┌─────────────┼─────────────┐
    ▼             ▼             ▼
┌────────┐   ┌────────┐   ┌────────┐
│Source 1│   │Source 2│   │Source N│   ← Explorer agents (parallel)
│Explorer│   │Explorer│   │Explorer│
└───┬────┘   └───┬────┘   └───┬────┘
    │            │            │
    ▼            ▼            ▼
 notes/       notes/       notes/      ← JSON notes files
    │            │            │
    └────────────┼────────────┘
                 ▼
        ┌─────────────────┐
        │Connection Finder│             ← Finds cross-source themes
        └────────┬────────┘
                 ▼
        ┌─────────────────┐
        │Quiz Synthesizer │             ← Generates final quiz
        └─────────────────┘
```

**Supported source types:**
- `github:owner/repo` - GitHub repository
- `github:owner/repo/pull/123` - GitHub pull request
- `url:https://...` - Web page
- `confluence:https://...` - Confluence page
- `notion:https://...` - Notion page
- `file:/path/to/file` - Local file

**Session artifacts** stored in `~/.sphinx/open-sessions/<session-id>/`:
- `sources.json` - Input sources
- `notes/source-N.json` - Explorer outputs
- `connections.json` - Cross-source connections
- `quiz.json` - Final quiz

**Important**: Cannot run from within Claude Code (nested sessions unsupported). The SDK spawns Claude Code as subprocess.

## Schema Validation

`QuizParser` in `parser.ts`:
1. Validates against JSON Schema using Ajv
2. Applies defaults for optional fields
3. Runs semantic validation (duplicate IDs, correct answer counts, etc.)

## Scoring Logic

In `engine.ts`:
- **multiple-choice**: 1 if correct, 0 otherwise
- **multi-select (all-or-nothing)**: 1 only if all correct selected, no incorrect
- **multi-select (partial)**: `(correct - incorrect) / total_correct`, min 0
- **free-text**: Matches against `acceptedAnswers` using configured `matchMode`

## Testing in CI

```bash
sphinx quiz ./quiz.json --ci --answers ./answers.json
```

Exit code 0 = passed, 1 = failed or error.

## Adding Features

### New Question Type
1. Add type to `QuestionType` union in `types.ts`
2. Add interface extending `BaseQuestion`
3. Add to `Question` union type
4. Implement scoring in `engine.ts` (`scoreAnswer` method)
5. Implement validation in `question-types.ts`
6. Update JSON Schema in `quiz.schema.json`

### New CLI Command
1. Create file in `src/commands/`
2. Add to `src/cli.ts` using Commander.js pattern

### New Result Persistence
1. Create file in `src/results/`
2. Export from `src/results/index.ts`
3. Add to `ResultsConfig.persistence` type

## Environment Variables

| Variable | Purpose |
|----------|---------|
| `SPHINX_DEBUG=1` | Enable debug logging |
| `SPHINX_DEFAULT_MODEL` | Default model for generation |
| `SPHINX_LLM_MODEL` | LLM model override |
| `SPHINX_LLM_PROVIDER` | Provider (anthropic/kimi/moonshot/ollama) |
| `SPHINX_API_BASE` | Custom API base URL for alternative providers |
| `SPHINX_OPEN_MAX_AGENTS` | Max concurrent agents for open mode |
| `SPHINX_OPEN_MAX_ITERATIONS` | Max turns per agent in open mode |
| `GITHUB_TOKEN` / `GH_TOKEN` | GitHub API access |
| `ANTHROPIC_API_KEY` | Direct API access |
| `KIMI_API_KEY` / `MOONSHOT_API_KEY` | Kimi/Moonshot API access |

## Alternative LLM Providers

Sphinx has configuration support for alternative Anthropic-compatible providers (Kimi K2.5, Ollama, etc.):

```bash
# Using Kimi (Moonshot AI)
export KIMI_API_KEY="your-kimi-api-key"
sphinx generate git local . --provider kimi

# Using custom API base
sphinx generate git local . --provider kimi --api-base https://api.moonshot.cn/v1

# Using Ollama (local)
sphinx generate git local . --provider ollama --api-base http://localhost:11434
```

Config file (`~/.sphinx/config.json`):
```json
{
  "llm": {
    "provider": "kimi",
    "apiBase": "https://api.moonshot.cn/v1"
  }
}
```

**Current Limitations:**

The `sphinx generate` command uses the Claude Agent SDK which relies on Claude-specific features:
- **Structured Output** - The SDK's `outputFormat: { type: 'json_schema' }` requires Claude's native structured output support
- **Internal Hooks** - The SDK uses Claude Code's hook system (e.g., StructuredOutput tool) that alternative providers don't implement
- **Message Formats** - Some SDK message types are Claude-specific

As a result, alternative providers may not work reliably with `sphinx generate`. The configuration is in place for future compatibility when:
- Providers add structured output support matching Claude's format
- Direct API integration bypasses the SDK for alternative providers
- The SDK adds explicit multi-provider support

## Build & Run

```bash
npm run build              # TypeScript → dist/
npm run dev                # Watch mode
node dist/cli.js <command> # Run locally
```

Build copies `src/schema/` and `skills/` to `dist/` for runtime access.
