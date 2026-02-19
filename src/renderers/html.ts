import { writeFile } from 'fs/promises';
import type { Quiz } from '../core/types.js';

/**
 * Build a standalone HTML quiz file
 * This will be fully implemented in Phase 4
 */
export async function buildStandaloneHtml(quiz: Quiz, outputPath: string): Promise<void> {
  const html = generateHtml(quiz);
  await writeFile(outputPath, html, 'utf-8');
}

function generateHtml(quiz: Quiz): string {
  const quizJson = JSON.stringify(quiz, null, 2);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(quiz.metadata.title)}</title>
  <style>
    ${getStyles()}
  </style>
</head>
<body>
  <div id="app">
    <div id="loading">Loading quiz...</div>
  </div>

  <script>
    const QUIZ_DATA = ${quizJson};
    ${getQuizScript()}
  </script>
</body>
</html>`;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function getStyles(): string {
  return `
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }

    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      line-height: 1.6;
      color: #333;
      background: #f5f5f5;
      min-height: 100vh;
    }

    #app {
      max-width: 800px;
      margin: 0 auto;
      padding: 20px;
    }

    .quiz-header {
      background: white;
      padding: 30px;
      border-radius: 8px;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
      margin-bottom: 20px;
      text-align: center;
    }

    .quiz-header h1 {
      color: #2c3e50;
      margin-bottom: 10px;
    }

    .quiz-header p {
      color: #666;
    }

    .quiz-info {
      display: flex;
      justify-content: center;
      gap: 20px;
      margin-top: 15px;
      color: #888;
      font-size: 14px;
    }

    .question-card {
      background: white;
      padding: 30px;
      border-radius: 8px;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
      margin-bottom: 20px;
    }

    .progress-bar {
      height: 8px;
      background: #e0e0e0;
      border-radius: 4px;
      margin-bottom: 20px;
      overflow: hidden;
    }

    .progress-fill {
      height: 100%;
      background: linear-gradient(90deg, #3498db, #2ecc71);
      transition: width 0.3s ease;
    }

    .question-number {
      color: #888;
      font-size: 14px;
      margin-bottom: 10px;
    }

    .question-prompt {
      font-size: 18px;
      font-weight: 500;
      margin-bottom: 20px;
    }

    .question-context {
      background: #f8f9fa;
      padding: 15px;
      border-radius: 4px;
      margin-bottom: 20px;
      font-family: monospace;
      font-size: 14px;
      white-space: pre-wrap;
      overflow-x: auto;
    }

    .options {
      display: flex;
      flex-direction: column;
      gap: 10px;
    }

    .option {
      display: flex;
      align-items: center;
      padding: 15px;
      border: 2px solid #e0e0e0;
      border-radius: 8px;
      cursor: pointer;
      transition: all 0.2s ease;
    }

    .option:hover {
      border-color: #3498db;
      background: #f8f9fa;
    }

    .option.selected {
      border-color: #3498db;
      background: #ebf5fb;
    }

    .option.correct {
      border-color: #2ecc71;
      background: #e8f8f0;
    }

    .option.incorrect {
      border-color: #e74c3c;
      background: #fdf2f2;
    }

    .option input {
      margin-right: 12px;
    }

    .text-input {
      width: 100%;
      padding: 15px;
      border: 2px solid #e0e0e0;
      border-radius: 8px;
      font-size: 16px;
      transition: border-color 0.2s ease;
    }

    .text-input:focus {
      outline: none;
      border-color: #3498db;
    }

    .btn {
      display: inline-block;
      padding: 12px 24px;
      font-size: 16px;
      font-weight: 500;
      border: none;
      border-radius: 8px;
      cursor: pointer;
      transition: all 0.2s ease;
    }

    .btn-primary {
      background: #3498db;
      color: white;
    }

    .btn-primary:hover {
      background: #2980b9;
    }

    .btn-primary:disabled {
      background: #bdc3c7;
      cursor: not-allowed;
    }

    .btn-success {
      background: #2ecc71;
      color: white;
    }

    .actions {
      display: flex;
      justify-content: space-between;
      margin-top: 20px;
    }

    .feedback {
      padding: 15px;
      border-radius: 8px;
      margin-top: 15px;
    }

    .feedback.correct {
      background: #e8f8f0;
      color: #27ae60;
    }

    .feedback.incorrect {
      background: #fdf2f2;
      color: #c0392b;
    }

    .explanation {
      margin-top: 10px;
      padding: 10px;
      background: #f8f9fa;
      border-radius: 4px;
      font-size: 14px;
      color: #666;
    }

    .results {
      text-align: center;
    }

    .results h2 {
      margin-bottom: 20px;
    }

    .score {
      font-size: 48px;
      font-weight: bold;
      margin: 20px 0;
    }

    .score.passed {
      color: #2ecc71;
    }

    .score.failed {
      color: #e74c3c;
    }

    .status {
      font-size: 24px;
      margin-bottom: 20px;
    }

    .status.passed {
      color: #2ecc71;
    }

    .status.failed {
      color: #e74c3c;
    }

    .stats {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
      gap: 15px;
      margin: 20px 0;
    }

    .stat {
      background: #f8f9fa;
      padding: 15px;
      border-radius: 8px;
    }

    .stat-label {
      font-size: 12px;
      color: #888;
      text-transform: uppercase;
    }

    .stat-value {
      font-size: 24px;
      font-weight: bold;
      color: #2c3e50;
    }

    @media (max-width: 600px) {
      #app {
        padding: 10px;
      }

      .quiz-header, .question-card {
        padding: 20px;
      }

      .question-prompt {
        font-size: 16px;
      }
    }
  `;
}

function getQuizScript(): string {
  return `
    class QuizApp {
      constructor(quiz) {
        this.quiz = quiz;
        this.questions = this.prepareQuestions();
        this.currentIndex = 0;
        this.answers = new Map();
        this.results = [];
        this.startTime = null;
        this.state = 'intro'; // intro, question, feedback, results
      }

      prepareQuestions() {
        let questions = [...this.quiz.questions];
        if (this.quiz.config.randomizeOrder) {
          questions = this.shuffle(questions);
        }
        if (this.quiz.config.questionCount && this.quiz.config.questionCount < questions.length) {
          questions = questions.slice(0, this.quiz.config.questionCount);
        }
        return questions;
      }

      shuffle(array) {
        const result = [...array];
        for (let i = result.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [result[i], result[j]] = [result[j], result[i]];
        }
        return result;
      }

      start() {
        this.startTime = Date.now();
        this.state = 'question';
        this.render();
      }

      getCurrentQuestion() {
        return this.questions[this.currentIndex];
      }

      submitAnswer(answer) {
        const question = this.getCurrentQuestion();
        const result = this.scoreAnswer(question, answer);
        this.answers.set(question.id, answer);
        this.results.push(result);

        if (this.quiz.config.showCorrectAnswers === 'after-each') {
          this.state = 'feedback';
        } else {
          this.nextQuestion();
        }
        this.render();
      }

      scoreAnswer(question, answer) {
        let correct = false;
        let score = 0;

        switch (question.type) {
          case 'multiple-choice': {
            const correctOption = question.options.find(o => o.correct);
            correct = correctOption?.id === answer;
            score = correct ? 1 : 0;
            break;
          }
          case 'multi-select': {
            const selectedIds = new Set(Array.isArray(answer) ? answer : [answer]);
            const correctIds = new Set(question.options.filter(o => o.correct).map(o => o.id));

            if (question.scoring === 'all-or-nothing') {
              const allCorrect = [...correctIds].every(id => selectedIds.has(id));
              const noIncorrect = [...selectedIds].every(id => correctIds.has(id));
              correct = allCorrect && noIncorrect;
              score = correct ? 1 : 0;
            } else {
              let correctSelections = 0;
              let incorrectSelections = 0;
              for (const id of selectedIds) {
                if (correctIds.has(id)) correctSelections++;
                else incorrectSelections++;
              }
              const rawScore = (correctSelections - incorrectSelections) / correctIds.size;
              score = Math.max(0, rawScore);
              correct = score === 1;
            }
            break;
          }
          case 'free-text': {
            const userAnswer = (question.caseSensitive ? answer : answer.toLowerCase()).trim();
            for (const accepted of question.acceptedAnswers) {
              const normalizedAccepted = (question.caseSensitive ? accepted : accepted.toLowerCase()).trim();
              let matches = false;
              switch (question.matchMode) {
                case 'exact':
                  matches = userAnswer === normalizedAccepted;
                  break;
                case 'contains':
                  matches = userAnswer.includes(normalizedAccepted);
                  break;
                case 'regex':
                  try {
                    const flags = question.caseSensitive ? '' : 'i';
                    matches = new RegExp(accepted, flags).test(answer);
                  } catch (e) {
                    matches = false;
                  }
                  break;
              }
              if (matches) {
                correct = true;
                score = 1;
                break;
              }
            }
            break;
          }
        }

        return { questionId: question.id, correct, score };
      }

      nextQuestion() {
        this.currentIndex++;
        if (this.currentIndex >= this.questions.length) {
          this.state = 'results';
        } else {
          this.state = 'question';
        }
      }

      getResults() {
        const totalScore = this.results.reduce((sum, r) => sum + r.score, 0);
        const maxScore = this.results.length;
        const percentage = maxScore > 0 ? totalScore / maxScore : 0;
        return {
          totalScore,
          maxScore,
          percentage,
          passed: percentage >= this.quiz.config.passingThreshold,
          time: Date.now() - this.startTime,
        };
      }

      render() {
        const app = document.getElementById('app');

        switch (this.state) {
          case 'intro':
            app.innerHTML = this.renderIntro();
            document.getElementById('start-btn').addEventListener('click', () => this.start());
            break;
          case 'question':
            app.innerHTML = this.renderQuestion();
            this.attachQuestionListeners();
            break;
          case 'feedback':
            app.innerHTML = this.renderFeedback();
            document.getElementById('next-btn').addEventListener('click', () => {
              this.nextQuestion();
              this.render();
            });
            break;
          case 'results':
            app.innerHTML = this.renderResults();
            document.getElementById('restart-btn')?.addEventListener('click', () => {
              location.reload();
            });
            break;
        }
      }

      renderIntro() {
        return \`
          <div class="quiz-header">
            <h1>\${this.escapeHtml(this.quiz.metadata.title)}</h1>
            \${this.quiz.metadata.description ? \`<p>\${this.escapeHtml(this.quiz.metadata.description)}</p>\` : ''}
            <div class="quiz-info">
              <span>\${this.questions.length} Questions</span>
              <span>Pass: \${(this.quiz.config.passingThreshold * 100).toFixed(0)}%</span>
            </div>
            <div style="margin-top: 20px;">
              <button id="start-btn" class="btn btn-primary">Start Quiz</button>
            </div>
          </div>
        \`;
      }

      renderQuestion() {
        const question = this.getCurrentQuestion();
        const progress = ((this.currentIndex + 1) / this.questions.length) * 100;

        return \`
          <div class="question-card">
            <div class="progress-bar">
              <div class="progress-fill" style="width: \${progress}%"></div>
            </div>
            <div class="question-number">Question \${this.currentIndex + 1} of \${this.questions.length}</div>
            <div class="question-prompt">\${this.escapeHtml(question.prompt)}</div>
            \${question.context ? \`<div class="question-context">\${this.escapeHtml(question.context)}</div>\` : ''}
            \${this.renderOptions(question)}
            <div class="actions">
              <div></div>
              <button id="submit-btn" class="btn btn-primary" disabled>Submit</button>
            </div>
          </div>
        \`;
      }

      renderOptions(question) {
        switch (question.type) {
          case 'multiple-choice':
            return \`
              <div class="options">
                \${question.options.map((opt, i) => \`
                  <label class="option" data-id="\${opt.id}">
                    <input type="radio" name="answer" value="\${opt.id}">
                    \${this.escapeHtml(opt.text)}
                  </label>
                \`).join('')}
              </div>
            \`;
          case 'multi-select':
            return \`
              <div class="options">
                \${question.options.map((opt, i) => \`
                  <label class="option" data-id="\${opt.id}">
                    <input type="checkbox" name="answer" value="\${opt.id}">
                    \${this.escapeHtml(opt.text)}
                  </label>
                \`).join('')}
              </div>
            \`;
          case 'free-text':
            return \`<input type="text" class="text-input" id="answer-input" placeholder="Type your answer...">\`;
          default:
            return '<p>Unsupported question type</p>';
        }
      }

      attachQuestionListeners() {
        const question = this.getCurrentQuestion();
        const submitBtn = document.getElementById('submit-btn');

        if (question.type === 'multiple-choice') {
          document.querySelectorAll('input[name="answer"]').forEach(input => {
            input.addEventListener('change', (e) => {
              document.querySelectorAll('.option').forEach(o => o.classList.remove('selected'));
              e.target.closest('.option').classList.add('selected');
              submitBtn.disabled = false;
            });
          });
          submitBtn.addEventListener('click', () => {
            const selected = document.querySelector('input[name="answer"]:checked');
            if (selected) this.submitAnswer(selected.value);
          });
        } else if (question.type === 'multi-select') {
          document.querySelectorAll('input[name="answer"]').forEach(input => {
            input.addEventListener('change', (e) => {
              e.target.closest('.option').classList.toggle('selected', e.target.checked);
              const anyChecked = document.querySelector('input[name="answer"]:checked');
              submitBtn.disabled = !anyChecked;
            });
          });
          submitBtn.addEventListener('click', () => {
            const selected = [...document.querySelectorAll('input[name="answer"]:checked')].map(i => i.value);
            if (selected.length > 0) this.submitAnswer(selected);
          });
        } else if (question.type === 'free-text') {
          const input = document.getElementById('answer-input');
          input.addEventListener('input', () => {
            submitBtn.disabled = input.value.trim() === '';
          });
          submitBtn.addEventListener('click', () => {
            if (input.value.trim()) this.submitAnswer(input.value);
          });
          input.addEventListener('keypress', (e) => {
            if (e.key === 'Enter' && input.value.trim()) this.submitAnswer(input.value);
          });
        }
      }

      renderFeedback() {
        const question = this.getCurrentQuestion();
        const result = this.results[this.results.length - 1];

        let feedbackHtml = result.correct
          ? '<div class="feedback correct">✓ Correct!</div>'
          : '<div class="feedback incorrect">✗ Incorrect</div>';

        if (!result.correct) {
          const correctAnswers = this.getCorrectAnswers(question);
          feedbackHtml += \`<div class="explanation">Correct answer: \${this.escapeHtml(correctAnswers.join(', '))}</div>\`;
        }

        if (question.explanation) {
          feedbackHtml += \`<div class="explanation">\${this.escapeHtml(question.explanation)}</div>\`;
        }

        return \`
          <div class="question-card">
            <div class="question-prompt">\${this.escapeHtml(question.prompt)}</div>
            \${feedbackHtml}
            <div class="actions">
              <div></div>
              <button id="next-btn" class="btn btn-primary">
                \${this.currentIndex < this.questions.length - 1 ? 'Next Question' : 'See Results'}
              </button>
            </div>
          </div>
        \`;
      }

      getCorrectAnswers(question) {
        switch (question.type) {
          case 'multiple-choice':
            return question.options.filter(o => o.correct).map(o => o.text);
          case 'multi-select':
            return question.options.filter(o => o.correct).map(o => o.text);
          case 'free-text':
            return question.acceptedAnswers;
          default:
            return [];
        }
      }

      renderResults() {
        const results = this.getResults();
        const minutes = Math.floor(results.time / 60000);
        const seconds = Math.floor((results.time % 60000) / 1000);

        return \`
          <div class="question-card results">
            <h2>Quiz Complete!</h2>
            <div class="score \${results.passed ? 'passed' : 'failed'}">
              \${(results.percentage * 100).toFixed(0)}%
            </div>
            <div class="status \${results.passed ? 'passed' : 'failed'}">
              \${results.passed ? '✓ PASSED' : '✗ FAILED'}
            </div>
            <div class="stats">
              <div class="stat">
                <div class="stat-label">Score</div>
                <div class="stat-value">\${results.totalScore}/\${results.maxScore}</div>
              </div>
              <div class="stat">
                <div class="stat-label">Time</div>
                <div class="stat-value">\${minutes}m \${seconds}s</div>
              </div>
              <div class="stat">
                <div class="stat-label">Required</div>
                <div class="stat-value">\${(this.quiz.config.passingThreshold * 100).toFixed(0)}%</div>
              </div>
            </div>
            <button id="restart-btn" class="btn btn-primary">Try Again</button>
          </div>
        \`;
      }

      escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
      }
    }

    // Initialize
    document.addEventListener('DOMContentLoaded', () => {
      const app = new QuizApp(QUIZ_DATA);
      app.render();
    });
  `;
}
