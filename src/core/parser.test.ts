import test from 'node:test';
import assert from 'node:assert/strict';

import { parseQuizString } from './parser.js';

void test('parseQuizString applies config and results defaults', async () => {
  const input = {
    version: '1.0',
    metadata: {
      id: 'defaults-test',
      title: 'Defaults Test',
    },
    config: {
      mode: 'static',
    },
    questions: [
      {
        id: 'q1',
        type: 'multiple-choice',
        prompt: 'Pick one',
        options: [
          { id: 'a', text: 'A', correct: true },
          { id: 'b', text: 'B', correct: false },
        ],
      },
    ],
  };

  const result = await parseQuizString(JSON.stringify(input));
  assert.equal(result.success, true);
  assert.ok(result.quiz);
  assert.equal(result.quiz?.config.passingThreshold, 0.7);
  assert.equal(result.quiz?.config.randomizeOrder, false);
  assert.equal(result.quiz?.config.showCorrectAnswers, 'after-completion');
  assert.equal(result.quiz?.config.timeLimit, null);
  assert.deepEqual(result.quiz?.results?.persistence, ['display']);
  assert.equal(result.quiz?.questions[0]?.difficulty, 0);
  assert.equal(result.quiz?.questions[0]?.discrimination, 1);
});

void test('parseQuizString rejects multiple-choice questions with multiple correct answers', async () => {
  const input = {
    version: '1.0',
    metadata: {
      id: 'mcq-invalid',
      title: 'Invalid MCQ',
    },
    config: {
      mode: 'static',
    },
    questions: [
      {
        id: 'q1',
        type: 'multiple-choice',
        prompt: 'Pick one',
        options: [
          { id: 'a', text: 'A', correct: true },
          { id: 'b', text: 'B', correct: true },
        ],
      },
    ],
  };

  const result = await parseQuizString(JSON.stringify(input));
  assert.equal(result.success, false);
  assert.ok(result.errors?.some((e) => e.includes('multiple-choice must have exactly one correct answer')));
});
