---
name: generate-quiz-open
description: >
  Generate a Sphinx quiz from multiple heterogeneous sources. Use when asked to create
  a quiz spanning GitHub repos, web pages, Confluence, Notion, or local files.
  Orchestrates parallel exploration of sources, finds connections between them,
  and synthesizes a cohesive quiz.
---

# Generate Quiz from Multiple Sources (Open Mode)

## Overview

Open mode generates educational quizzes that span multiple content sources. It uses
parallel agents to explore each source, identifies cross-source connections, and
synthesizes questions that test understanding across the combined content.

## When to Use

Use this skill when:
- The user wants a quiz covering multiple repositories or documentation sources
- Content is spread across different platforms (GitHub, Confluence, web docs)
- Cross-source understanding is important (architecture spanning multiple repos)
- The user explicitly asks for "open mode" or multi-source generation

## Inputs (from user message)

- **Sources**: Multiple content sources (required)
  - Format: `TYPE:TARGET` (e.g., `github:owner/repo`, `url:https://docs.example.com`)
  - Types: github, url, confluence, notion, file
- **Prompt**: High-level focus or context for the quiz
- **Focus**: comprehension | changes | practices | security | concepts
- **Profile**: quick (5) | standard (10) | thorough (15) questions
- **Difficulty**: easy | medium | hard | mixed
- **Output**: File path or stdout

## Process

### Step 1: Parse and Validate Sources

Parse each source specification:
```
github:owner/repo           -> GitHub repository
github:owner/repo/pull/123  -> GitHub pull request
url:https://docs.example.com -> Web page
confluence:https://...       -> Confluence page
notion:https://notion.so/... -> Notion page
file:/path/to/file          -> Local file
```

Validate all sources before proceeding. Report any parsing errors.

### Step 2: Explore Sources in Parallel

For each source, spawn an explorer agent that:
1. Accesses the source using appropriate tools (gh CLI, WebFetch, Read)
2. Identifies key concepts and definitions
3. Extracts quiz-worthy facts
4. Outlines potential questions with difficulty estimates
5. Writes structured notes to `~/.sphinx/open-sessions/<session-id>/notes/source-N.json`

Explorer agents run in parallel (up to maxAgents concurrent).

### Step 3: Find Cross-Source Connections

After all explorations complete, analyze the notes to find:
- Themes that appear across multiple sources
- Related concepts with different names
- Complementary information (one source fills gaps from another)
- Potential cross-source quiz questions

Write connections to `~/.sphinx/open-sessions/<session-id>/connections.json`

### Step 4: Synthesize Quiz

Using the notes and connections:
1. Select question topics prioritizing cross-source themes
2. Balance coverage across different sources
3. Match the requested focus area and difficulty
4. Generate high-quality questions with explanations
5. Write quiz to `~/.sphinx/open-sessions/<session-id>/quiz.json`

### Step 5: Validate and Output

1. Run `sphinx validate` on the generated quiz
2. Fix any validation errors
3. Output to the specified location or stdout

## Notes Schema

Each source explorer writes notes in this format:

```json
{
  "source": {
    "type": "github",
    "target": "owner/repo",
    "subtype": "repo"
  },
  "summary": "High-level summary of the source",
  "concepts": [
    {
      "id": "concept-1",
      "name": "Concept Name",
      "definition": "Clear definition",
      "relatedTo": ["concept-2"]
    }
  ],
  "facts": [
    {
      "statement": "A specific fact",
      "quizWorthy": true,
      "reference": "Where found"
    }
  ],
  "potentialQuestions": [
    {
      "topic": "What to test",
      "difficulty": 0,
      "outline": "Question description",
      "questionType": "multiple-choice"
    }
  ],
  "generatedAt": "2024-01-01T00:00:00Z"
}
```

## Connections Schema

```json
{
  "connections": [
    {
      "sourceIndices": [0, 1],
      "theme": "Common theme",
      "description": "How sources relate",
      "relatedConcepts": ["concept-id-1", "concept-id-2"]
    }
  ],
  "suggestedFocusAreas": ["Areas for quiz focus"],
  "sharedConcepts": ["Concepts appearing in multiple sources"]
}
```

## CLI Usage

```bash
# Multiple sources via repeated --source flag
sphinx generate open \
  --source "github:anthropics/claude-agent-sdk" \
  --source "url:https://docs.anthropic.com/claude-code" \
  --prompt "Quiz about building autonomous agents" \
  --max-agents 3 \
  --max-iterations 15 \
  -o quiz.json

# Load sources from file
sphinx generate open \
  --sources-file sources.json \
  --prompt "Distributed systems quiz"

# Dry run to preview
sphinx generate open \
  --source "github:owner/repo" \
  --prompt "test" \
  --dry-run
```

## CLI Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `--source` | string[] | required | Source specs (TYPE:TARGET), repeatable |
| `--sources-file` | string | - | JSON file containing source specs |
| `--prompt` | string | required | High-level focus/context |
| `--max-agents` | number | 4 | Max concurrent explorer agents |
| `--max-iterations` | number | 15 | Max turns per agent |
| `--explorer-model` | string | sonnet | Model for exploration |
| `--synthesizer-model` | string | opus | Model for synthesis |
| `--focus` | string | comprehension | Quiz focus area |
| `--profile` | string | standard | Question count profile |
| `--difficulty` | string | mixed | Difficulty distribution |
| `--dry-run` | boolean | false | Preview without running |
| `-o, --output` | string | stdout | Output file |

## Session Management

Sessions are stored in `~/.sphinx/open-sessions/<session-id>/`:
- `sources.json` - Input sources
- `notes/source-N.json` - Explorer outputs
- `connections.json` - Connection analysis
- `quiz.json` - Final output

Sessions persist for debugging. Clean old sessions with:
```bash
# Sessions older than 7 days
sphinx sessions clean --older-than 7
```

## Error Handling

- **Source parse error**: Report and skip invalid sources
- **Exploration failure**: Continue with remaining sources
- **All sources fail**: Error with details
- **Synthesis failure**: Retry up to 3 times
- **Validation failure**: Fix and re-validate

## Example: Multi-Repo Architecture Quiz

```bash
sphinx generate open \
  --source "github:company/api-gateway" \
  --source "github:company/auth-service" \
  --source "github:company/user-service" \
  --source "confluence:https://company.atlassian.net/wiki/arch-overview" \
  --prompt "Quiz on microservices architecture and service interactions" \
  --focus "comprehension" \
  --profile "thorough" \
  -o architecture-quiz.json
```

This generates a quiz that tests understanding of:
- How services interact
- Authentication flow across services
- API contracts and dependencies
- Architectural decisions documented in Confluence
