#!/bin/bash
# verify-schema.sh - Validate quiz JSON against Sphinx schema
set -e

QUIZ_FILE="${1:-/tmp/sphinx-quiz-draft.json}"

# Find sphinx command - use installed version or local dev
if command -v sphinx &> /dev/null; then
  SPHINX="sphinx"
elif [ -f "$(dirname "$0")/../../../dist/cli.js" ]; then
  SPHINX="node $(dirname "$0")/../../../dist/cli.js"
elif [ -f "./dist/cli.js" ]; then
  SPHINX="node ./dist/cli.js"
else
  echo "Error: sphinx command not found. Install sphinx or run from repo root."
  exit 1
fi

if [ ! -f "$QUIZ_FILE" ]; then
  echo "Error: Quiz file not found: $QUIZ_FILE"
  exit 1
fi

echo "Validating: $QUIZ_FILE"
$SPHINX validate "$QUIZ_FILE" --verbose
EXIT_CODE=$?

if [ $EXIT_CODE -eq 0 ]; then
  echo "✓ Schema validation passed"
else
  echo "✗ Schema validation failed"
fi

exit $EXIT_CODE
