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
- GitHub repo/PR: Read `skills/generate-quiz/sources/github.md`
- Git local/diff: Read `skills/generate-quiz/sources/git.md`
- Confluence: Read `skills/generate-quiz/sources/confluence.md`

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

## Verification Scripts

Use these scripts to verify quiz generation and output quality.

### 1. Schema Validation

Validates the generated quiz against the Sphinx JSON schema:

```bash
#!/bin/bash
# verify-schema.sh - Validate quiz JSON against schema
QUIZ_FILE="${1:-/tmp/sphinx-quiz-draft.json}"

if [ ! -f "$QUIZ_FILE" ]; then
  echo "Error: Quiz file not found: $QUIZ_FILE"
  exit 1
fi

sphinx validate "$QUIZ_FILE" --verbose
EXIT_CODE=$?

if [ $EXIT_CODE -eq 0 ]; then
  echo "✓ Schema validation passed"
else
  echo "✗ Schema validation failed"
fi

exit $EXIT_CODE
```

### 2. Quiz Structure Check

Verifies the quiz has required structure and reasonable content:

```bash
#!/bin/bash
# verify-structure.sh - Check quiz structure and content quality
QUIZ_FILE="${1:-/tmp/sphinx-quiz-draft.json}"

if [ ! -f "$QUIZ_FILE" ]; then
  echo "Error: Quiz file not found: $QUIZ_FILE"
  exit 1
fi

# Check required fields exist
echo "Checking required fields..."
ERRORS=0

# Check metadata
if ! jq -e '.metadata.id' "$QUIZ_FILE" > /dev/null 2>&1; then
  echo "✗ Missing: metadata.id"
  ERRORS=$((ERRORS + 1))
fi

if ! jq -e '.metadata.title' "$QUIZ_FILE" > /dev/null 2>&1; then
  echo "✗ Missing: metadata.title"
  ERRORS=$((ERRORS + 1))
fi

# Check questions array
QUESTION_COUNT=$(jq '.questions | length' "$QUIZ_FILE" 2>/dev/null || echo 0)
if [ "$QUESTION_COUNT" -eq 0 ]; then
  echo "✗ No questions found"
  ERRORS=$((ERRORS + 1))
else
  echo "✓ Found $QUESTION_COUNT questions"
fi

# Check each question has required fields
echo "Checking question structure..."
for i in $(seq 0 $((QUESTION_COUNT - 1))); do
  Q_ID=$(jq -r ".questions[$i].id" "$QUIZ_FILE")
  Q_TYPE=$(jq -r ".questions[$i].type" "$QUIZ_FILE")
  Q_PROMPT=$(jq -r ".questions[$i].prompt" "$QUIZ_FILE")

  if [ "$Q_ID" = "null" ] || [ -z "$Q_ID" ]; then
    echo "✗ Question $i: missing id"
    ERRORS=$((ERRORS + 1))
  fi

  if [ "$Q_TYPE" = "null" ] || [ -z "$Q_TYPE" ]; then
    echo "✗ Question $i: missing type"
    ERRORS=$((ERRORS + 1))
  fi

  if [ "$Q_PROMPT" = "null" ] || [ -z "$Q_PROMPT" ]; then
    echo "✗ Question $i: missing prompt"
    ERRORS=$((ERRORS + 1))
  fi

  # Check options for choice questions
  if [ "$Q_TYPE" = "multiple-choice" ] || [ "$Q_TYPE" = "multi-select" ]; then
    OPTION_COUNT=$(jq ".questions[$i].options | length" "$QUIZ_FILE" 2>/dev/null || echo 0)
    if [ "$OPTION_COUNT" -lt 2 ]; then
      echo "✗ Question $Q_ID: needs at least 2 options (found $OPTION_COUNT)"
      ERRORS=$((ERRORS + 1))
    fi

    # Check for at least one correct answer
    CORRECT_COUNT=$(jq "[.questions[$i].options[] | select(.correct == true)] | length" "$QUIZ_FILE" 2>/dev/null || echo 0)
    if [ "$CORRECT_COUNT" -eq 0 ]; then
      echo "✗ Question $Q_ID: no correct answer marked"
      ERRORS=$((ERRORS + 1))
    fi
  fi
done

if [ $ERRORS -eq 0 ]; then
  echo "✓ Structure validation passed"
  exit 0
else
  echo "✗ Structure validation failed with $ERRORS errors"
  exit 1
fi
```

### 3. Quiz Dry Run

Runs the quiz in CI mode to verify it's functional:

```bash
#!/bin/bash
# verify-runnable.sh - Test that quiz can be executed
QUIZ_FILE="${1:-/tmp/sphinx-quiz-draft.json}"

if [ ! -f "$QUIZ_FILE" ]; then
  echo "Error: Quiz file not found: $QUIZ_FILE"
  exit 1
fi

echo "Running quiz in CI mode..."
sphinx quiz "$QUIZ_FILE" --ci --json

EXIT_CODE=$?
if [ $EXIT_CODE -eq 0 ]; then
  echo "✓ Quiz runs successfully"
else
  echo "✗ Quiz failed to run (exit code: $EXIT_CODE)"
fi

exit $EXIT_CODE
```

### 4. Full Verification Pipeline

Run all verification steps in sequence:

```bash
#!/bin/bash
# verify-all.sh - Complete verification pipeline
QUIZ_FILE="${1:-/tmp/sphinx-quiz-draft.json}"

echo "=== Sphinx Quiz Verification Pipeline ==="
echo "File: $QUIZ_FILE"
echo

# Step 1: Schema validation
echo "--- Step 1: Schema Validation ---"
sphinx validate "$QUIZ_FILE" --verbose
if [ $? -ne 0 ]; then
  echo "Pipeline failed at schema validation"
  exit 1
fi
echo

# Step 2: Structure check (inline)
echo "--- Step 2: Structure Check ---"
QUESTION_COUNT=$(jq '.questions | length' "$QUIZ_FILE" 2>/dev/null || echo 0)
echo "Questions: $QUESTION_COUNT"

if [ "$QUESTION_COUNT" -eq 0 ]; then
  echo "Pipeline failed: no questions"
  exit 1
fi

# Check question types distribution
echo "Question types:"
jq -r '.questions[].type' "$QUIZ_FILE" | sort | uniq -c
echo

# Check difficulty distribution
echo "Difficulty distribution:"
jq -r '.questions[].difficulty // 0' "$QUIZ_FILE" | sort -n | uniq -c
echo

# Step 3: Dry run
echo "--- Step 3: Dry Run ---"
sphinx quiz "$QUIZ_FILE" --ci
if [ $? -ne 0 ]; then
  echo "Pipeline failed at dry run"
  exit 1
fi
echo

echo "=== All Verification Passed ==="
exit 0
```

### Usage in Skill Execution

After generating quiz JSON, run the verification pipeline:

```bash
# Write quiz to temp file
cat > /tmp/sphinx-quiz-draft.json << 'QUIZ_EOF'
<generated JSON>
QUIZ_EOF

# Run full verification
bash -c '
QUIZ_FILE="/tmp/sphinx-quiz-draft.json"

# Schema validation
if ! sphinx validate "$QUIZ_FILE" --verbose; then
  echo "Schema validation failed"
  exit 1
fi

# Structure check
QUESTION_COUNT=$(jq ".questions | length" "$QUIZ_FILE")
if [ "$QUESTION_COUNT" -eq 0 ]; then
  echo "No questions generated"
  exit 1
fi

# Dry run
if ! sphinx quiz "$QUIZ_FILE" --ci; then
  echo "Quiz dry run failed"
  exit 1
fi

echo "All verification passed"
'
```

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
