import { parseQuiz } from '../core/parser.js';
import { buildStandaloneHtml } from '../renderers/html.js';

export async function buildHtml(filePath: string, outputPath: string): Promise<void> {
  const result = await parseQuiz(filePath);

  if (!result.success || !result.quiz) {
    throw new Error(`Invalid quiz file:\n${(result.errors || []).join('\n')}`);
  }

  await buildStandaloneHtml(result.quiz, outputPath);
}
