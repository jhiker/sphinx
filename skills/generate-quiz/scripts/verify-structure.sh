#!/bin/bash
# verify-structure.sh - Check quiz structure and content quality
set -e

QUIZ_FILE="${1:-/tmp/sphinx-quiz-draft.json}"

if [ ! -f "$QUIZ_FILE" ]; then
  echo "Error: Quiz file not found: $QUIZ_FILE"
  exit 1
fi

echo "Checking structure: $QUIZ_FILE"
ERRORS=0

# Check metadata
echo "Checking metadata..."
if ! jq -e '.metadata.id' "$QUIZ_FILE" > /dev/null 2>&1; then
  echo "  ✗ Missing: metadata.id"
  ERRORS=$((ERRORS + 1))
else
  echo "  ✓ metadata.id: $(jq -r '.metadata.id' "$QUIZ_FILE")"
fi

if ! jq -e '.metadata.title' "$QUIZ_FILE" > /dev/null 2>&1; then
  echo "  ✗ Missing: metadata.title"
  ERRORS=$((ERRORS + 1))
else
  echo "  ✓ metadata.title: $(jq -r '.metadata.title' "$QUIZ_FILE")"
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
    echo "  ✗ Question $i: missing id"
    ERRORS=$((ERRORS + 1))
    continue
  fi

  if [ "$Q_TYPE" = "null" ] || [ -z "$Q_TYPE" ]; then
    echo "  ✗ Question $Q_ID: missing type"
    ERRORS=$((ERRORS + 1))
  fi

  if [ "$Q_PROMPT" = "null" ] || [ -z "$Q_PROMPT" ]; then
    echo "  ✗ Question $Q_ID: missing prompt"
    ERRORS=$((ERRORS + 1))
  fi

  # Check options for choice questions
  if [ "$Q_TYPE" = "multiple-choice" ] || [ "$Q_TYPE" = "multi-select" ]; then
    OPTION_COUNT=$(jq ".questions[$i].options | length" "$QUIZ_FILE" 2>/dev/null || echo 0)
    if [ "$OPTION_COUNT" -lt 2 ]; then
      echo "  ✗ Question $Q_ID: needs at least 2 options (found $OPTION_COUNT)"
      ERRORS=$((ERRORS + 1))
    fi

    # Check for at least one correct answer
    CORRECT_COUNT=$(jq "[.questions[$i].options[] | select(.correct == true)] | length" "$QUIZ_FILE" 2>/dev/null || echo 0)
    if [ "$CORRECT_COUNT" -eq 0 ]; then
      echo "  ✗ Question $Q_ID: no correct answer marked"
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
