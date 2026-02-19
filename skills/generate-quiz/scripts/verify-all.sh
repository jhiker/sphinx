#!/bin/bash
# verify-all.sh - Complete verification pipeline for generated quizzes
set -e

QUIZ_FILE="${1:-/tmp/sphinx-quiz-draft.json}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

# Find sphinx command - use installed version or local dev
if command -v sphinx &> /dev/null; then
  SPHINX="sphinx"
elif [ -f "$SCRIPT_DIR/../../../dist/cli.js" ]; then
  SPHINX="node $SCRIPT_DIR/../../../dist/cli.js"
elif [ -f "./dist/cli.js" ]; then
  SPHINX="node ./dist/cli.js"
else
  echo "Error: sphinx command not found. Install sphinx or run from repo root."
  exit 1
fi

echo "=== Sphinx Quiz Verification Pipeline ==="
echo "File: $QUIZ_FILE"
echo

if [ ! -f "$QUIZ_FILE" ]; then
  echo "Error: Quiz file not found: $QUIZ_FILE"
  exit 1
fi

# Step 1: Schema validation
echo "--- Step 1: Schema Validation ---"
if ! $SPHINX validate "$QUIZ_FILE" --verbose; then
  echo "Pipeline failed at schema validation"
  exit 1
fi
echo

# Step 2: Structure check
echo "--- Step 2: Structure Check ---"
QUESTION_COUNT=$(jq '.questions | length' "$QUIZ_FILE" 2>/dev/null || echo 0)
echo "Questions: $QUESTION_COUNT"

if [ "$QUESTION_COUNT" -eq 0 ]; then
  echo "Pipeline failed: no questions"
  exit 1
fi

# Check question types distribution
echo "Question types:"
jq -r '.questions[].type' "$QUIZ_FILE" | sort | uniq -c | sed 's/^/  /'
echo

# Check difficulty distribution
echo "Difficulty distribution:"
jq -r '.questions[].difficulty // 0' "$QUIZ_FILE" | sort -n | uniq -c | sed 's/^/  /'
echo

# Check for explanations
EXPLAINED=$(jq '[.questions[] | select(.explanation != null and .explanation != "")] | length' "$QUIZ_FILE")
echo "Questions with explanations: $EXPLAINED / $QUESTION_COUNT"
echo

# Step 3: Dry run (verify quiz can be loaded and parsed)
echo "--- Step 3: Dry Run ---"
# CI mode without answers returns exit 1 (not passed) but validates the quiz structure
# We capture the output to check for "Quiz validated" or error messages
DRY_RUN_OUTPUT=$($SPHINX quiz "$QUIZ_FILE" --ci 2>&1) || true
echo "$DRY_RUN_OUTPUT"

if echo "$DRY_RUN_OUTPUT" | grep -q "Failed to load quiz\|Error:"; then
  echo "Pipeline failed at dry run"
  exit 1
fi
echo "✓ Quiz loads and parses correctly"
echo

# Summary
echo "=== Verification Summary ==="
echo "  Total questions: $QUESTION_COUNT"
echo "  With explanations: $EXPLAINED"
echo "  Schema: ✓ Valid"
echo "  Structure: ✓ Valid"
echo "  Runnable: ✓ Valid"
echo
echo "=== All Verification Passed ==="
exit 0
