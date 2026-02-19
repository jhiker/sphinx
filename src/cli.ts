#!/usr/bin/env node

import { Command } from 'commander';
import { runQuiz } from './commands/quiz.js';
import { buildHtml } from './commands/build.js';
import { validateQuiz } from './commands/validate.js';
import { createGenerateCommand } from './commands/generate.js';

const program = new Command();

program
  .name('sphinx')
  .description('JSON-based quiz system for measuring technical competence')
  .version('1.0.0');

program
  .command('quiz')
  .description('Run a quiz interactively in the terminal')
  .argument('<file>', 'Path to quiz JSON file')
  .option('--ci', 'Run in CI mode (non-interactive, exit code 0/1)')
  .option('--json', 'Output results as JSON (implies --ci)')
  .option('--answers <file>', 'Path to answers JSON file (for CI mode)')
  .option('--no-color', 'Disable colored output')
  .action(async (file: string, options: { ci?: boolean; json?: boolean; answers?: string; color?: boolean }) => {
    try {
      const exitCode = await runQuiz(file, {
        ci: options.ci || options.json || !!options.answers,
        json: options.json,
        answers: options.answers,
        color: options.color !== false,
      });
      process.exit(exitCode);
    } catch (error) {
      console.error('Error:', (error as Error).message);
      process.exit(1);
    }
  });

program
  .command('build')
  .description('Generate a standalone HTML quiz file')
  .argument('<file>', 'Path to quiz JSON file')
  .option('-o, --output <path>', 'Output file path', 'quiz.html')
  .action(async (file: string, options: { output: string }) => {
    try {
      await buildHtml(file, options.output);
      console.log(`Built: ${options.output}`);
    } catch (error) {
      console.error('Error:', (error as Error).message);
      process.exit(1);
    }
  });

program
  .command('validate')
  .description('Validate a quiz JSON file against the schema')
  .argument('<file>', 'Path to quiz JSON file')
  .option('--verbose', 'Show detailed validation output')
  .action(async (file: string, options: { verbose?: boolean }) => {
    try {
      const valid = await validateQuiz(file, { verbose: options.verbose });
      process.exit(valid ? 0 : 1);
    } catch (error) {
      console.error('Error:', (error as Error).message);
      process.exit(1);
    }
  });

program.addCommand(createGenerateCommand());

program.parse();
