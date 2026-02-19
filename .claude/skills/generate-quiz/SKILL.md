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
