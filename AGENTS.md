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
│   │   └── generate.ts        # AI quiz generation (uses Claude Agent SDK)
│   ├── core/                  # Core quiz logic
│   │   ├── types.ts           # TypeScript interfaces (Quiz, Question, etc.)
│   │   ├── parser.ts          # JSON parsing + Ajv schema validation
│   │   ├── engine.ts          # QuizEngine - runs quizzes, scores answers
│   │   ├── irt.ts             # IRTEngine - 2PL adaptive testing
│   │   └── question-types.ts  # Scoring/validation per question type
│   ├── generate/              # Quiz generation config
│   │   └── config.ts          # Layered config: defaults → file → env → CLI
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
│   └── generate-quiz/         # Claude Code skill for generation
│       ├── SKILL.md           # Skill definition
│       └── sources/           # Source-specific instructions
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
```

## Generation Architecture

The `generate` command:
1. Loads config from `~/.sphinx/config.json` → env vars → CLI flags
2. Builds a prompt with source/focus/question count
3. Invokes Claude Agent SDK with `outputFormat: { type: 'json_schema', schema: quizSchema }`
4. Returns `structured_output` from result message

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
| `SPHINX_LLM_PROVIDER` | Provider (anthropic/openai) |
| `GITHUB_TOKEN` / `GH_TOKEN` | GitHub API access |
| `ANTHROPIC_API_KEY` | Direct API access |

## Build & Run

```bash
npm run build              # TypeScript → dist/
npm run dev                # Watch mode
node dist/cli.js <command> # Run locally
```

Build copies `src/schema/` and `skills/` to `dist/` for runtime access.
