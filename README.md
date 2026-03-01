# Sphinx Quiz System

A JSON-based quiz system for measuring technical competence during development workflows. Supports static and adaptive (IRT-based) difficulty modes, outputs to both CLI and standalone HTML.

The idea is to explore a pattern for challenging humans who want to stay in the loop in the design and implementation of software systems, as their involvement in this process becomes increasingly high-level and indirect. See [Your Brain on ChatGPT: Accumulation of Cognitive Debt when Using an AI Assistant for Essay Writing Task](https://arxiv.org/abs/2506.08872) or [Simon Willison's write-up on the concept](https://simonwillison.net/2026/Feb/15/cognitive-debt/) for more context on the motivation.

## Installation

```bash
npm install -g sphinx-cli
```

### From source
```bash
# First clone this repo and then ->
npm install
npm run build
npm link # to set up sphinx cli
```

## Usage

### Run a Quiz Interactively in TUI

```bash
sphinx quiz ./examples/sample-quiz.json
```

### Generate Standalone HTML

```bash
sphinx build ./examples/sample-quiz.json -o quiz.html
open quiz.html # to open in browser
```

Open the generated HTML file in any browser - it works completely offline.

### Validate a Quiz File

```bash
sphinx validate ./examples/sample-quiz.json --verbose
```

### Generate a Quiz with AI

Quiz generation is packaged as a skill available in `skills/generate-quiz`. It is possible activate this skill in an agentic coding assistant and request generation of a quiz given a set of tools. 

### Using CLI

There is also a cli command for quiz generation, which under the hood uses this skill with Claude SDK and structured outputs functionality to guarantee conformance with the json format. It also includes common presets for different input and output formats. This approach is currently a bit more tested.


*Requirements:*

You'll need to provide an `ANTHROPIC_API_KEY` with an API Key that supports the Claude API format.

Generate from supported sources:

```bash
# Local git repo
sphinx generate git local .

# GitHub repo
sphinx generate github repo https://github.com/org/repo

# Git branch diff
sphinx generate git diff feature-branch --base main
```

Write to file:

```bash
sphinx generate git local . -o quiz.json
```

Model selection:

```bash
# Per-command override (highest priority)
sphinx generate git local . --model claude-sonnet-4-6
```

Config defaults (`~/.sphinx/config.json`):

```json
{
  "generate": {
    "defaultModel": "claude-sonnet-4-6"
  },
  "llm": {
    "model": "claude-opus-4-6"
  }
}
```

Model precedence:
- `--model` CLI flag
- `generate.defaultModel` from config
- `llm.model` from config

Environment variables:
- `SPHINX_DEFAULT_MODEL`
- `SPHINX_LLM_MODEL`
- `SPHINX_LLM_PROVIDER` - Provider: anthropic, kimi, moonshot, ollama
- `SPHINX_API_BASE` - Custom API base URL

### Alternative Providers (Kimi, Ollama) - Experimental

Sphinx has configuration support for alternative Anthropic-compatible providers:

```bash
# Using Kimi (Moonshot AI)
export KIMI_API_KEY="your-kimi-api-key"
sphinx generate git local . --provider kimi

# Using Ollama (local)
sphinx generate git local . --provider ollama --api-base http://localhost:11434
```

Supported providers:
- `anthropic` (default) - Anthropic Claude API
- `kimi` / `moonshot` - Moonshot AI Kimi K2.5
- `ollama` - Local Ollama instance

> **Note:** Alternative providers have limited compatibility. The `generate` command uses the Claude Agent SDK which relies on Claude-specific features (structured output, internal hooks). Alternative providers may not work reliably until they support these features or direct API integration is added.

`generate` uses structured output (`json_schema`) and validates quiz JSON against the project schema.

### Multi-Source Generation (Open Mode)

Generate quizzes that span multiple heterogeneous sources:

```bash
# Multiple sources via repeated --source flag
sphinx generate open \
  --source "github:anthropics/claude-agent-sdk" \
  --source "url:https://docs.anthropic.com/claude-code" \
  --source "confluence:https://company.atlassian.net/wiki/pages/123" \
  --prompt "Quiz about building autonomous agents with Claude" \
  -o quiz.json

# Load sources from file
sphinx generate open \
  --sources-file sources.json \
  --prompt "Distributed systems architecture quiz"

# Preview without running
sphinx generate open \
  --source "github:owner/repo" \
  --prompt "test" \
  --dry-run
```

**Supported source types:**
- `github:owner/repo` - GitHub repository
- `github:owner/repo/pull/123` - GitHub pull request
- `url:https://...` - Web page (via WebFetch)
- `confluence:https://...` - Confluence page
- `notion:https://...` - Notion page
- `file:/path/to/file` - Local file

**Options:**
- `--max-agents <n>` - Max concurrent explorer agents (default: 4)
- `--max-iterations <n>` - Max turns per agent (default: 15)
- `--explorer-model <model>` - Model for exploration (default: sonnet)
- `--synthesizer-model <model>` - Model for synthesis (default: opus)

Open mode uses parallel agents to explore each source, finds cross-source connections, and synthesizes questions that test understanding across all sources.

### CI Mode

For automated testing in CI pipelines:

```bash
# Validate only (exit code 0 if valid)
sphinx quiz ./quiz.json --ci

# Run with answers file
sphinx quiz ./quiz.json --ci --answers ./answers.json

# Output as JSON
sphinx quiz ./quiz.json --json --answers ./answers.json
```

Exit codes:
- `0` - Quiz passed (or validation successful)
- `1` - Quiz failed (or validation error)

## Quiz JSON Schema

### Basic Structure

```json
{
  "version": "1.0",
  "metadata": {
    "id": "my-quiz",
    "title": "My Quiz Title",
    "description": "Optional description",
    "tags": ["tag1", "tag2"],
    "author": "your-name"
  },
  "config": {
    "mode": "static",
    "passingThreshold": 0.7,
    "randomizeOrder": false,
    "showCorrectAnswers": "after-completion"
  },
  "questions": [...]
}
```

### Question Types

#### Multiple Choice

```json
{
  "id": "q1",
  "type": "multiple-choice",
  "prompt": "What is 2 + 2?",
  "options": [
    { "id": "a", "text": "3", "correct": false },
    { "id": "b", "text": "4", "correct": true },
    { "id": "c", "text": "5", "correct": false }
  ],
  "explanation": "Basic arithmetic."
}
```

#### Multi-Select

```json
{
  "id": "q2",
  "type": "multi-select",
  "prompt": "Select all prime numbers:",
  "options": [
    { "id": "a", "text": "2", "correct": true },
    { "id": "b", "text": "3", "correct": true },
    { "id": "c", "text": "4", "correct": false },
    { "id": "d", "text": "5", "correct": true }
  ],
  "scoring": "partial"
}
```

Scoring modes:
- `"partial"` - Points for correct selections minus incorrect (default)
- `"all-or-nothing"` - Full points only if all correct options selected

#### Free Text

```json
{
  "id": "q3",
  "type": "free-text",
  "prompt": "What HTTP header prevents clickjacking?",
  "acceptedAnswers": ["X-Frame-Options", "CSP frame-ancestors"],
  "matchMode": "contains",
  "caseSensitive": false
}
```

Match modes:
- `"exact"` - Exact match required
- `"contains"` - Answer must contain the accepted string
- `"regex"` - Accepted answers are regex patterns

### Adaptive Mode (IRT)

Enable adaptive testing with Item Response Theory:

```json
{
  "config": {
    "mode": "adaptive"
  },
  "adaptive": {
    "initialTheta": 0.0,
    "thetaRange": [-3.0, 3.0],
    "standardErrorThreshold": 0.3,
    "minQuestions": 5,
    "maxQuestions": 20,
    "selectionMethod": "maximum-information"
  },
  "questions": [
    {
      "id": "q1",
      "difficulty": -1.0,
      "discrimination": 1.2,
      ...
    }
  ]
}
```

IRT Parameters:
- `difficulty` (-3 to 3): Higher = harder question
- `discrimination` (0 to 5): How well the question differentiates ability levels

### Results Persistence

```json
{
  "results": {
    "persistence": ["display", "file", "webhook"],
    "filePath": "./results/",
    "webhookUrl": "https://your-api.com/results"
  }
}
```

## CI/CD Integration

### GitHub Actions Example

```yaml
- name: Run Knowledge Check
  run: |
    npm install -g sphinx-quiz
    sphinx quiz ./security-quiz.json --ci --answers ./expected-answers.json
```

### Answers File Format

```json
{
  "q1": "a",
  "q2": ["a", "b", "c"],
  "q3": "X-Frame-Options"
}
```

## Examples

See the `examples/` directory for:
- `sample-quiz.json` - Basic static quiz with multiple question types
- `adaptive-quiz.json` - Adaptive quiz with IRT parameters
- `sample-answers.json` - Answer file for CI testing

## Development

```bash
# Build
npm run build

# Lint
npm run lint

# Watch mode
npm run dev

# Run CLI
node dist/cli.js quiz ./examples/sample-quiz.json
```

### Makefile Targets

This repo also includes a `Makefile` with common workflows:

```bash
make help
make install
make lint
make test
make check
```

## License

MIT
