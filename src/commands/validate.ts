import { parseQuiz } from '../core/parser.js';

export interface ValidateOptions {
  verbose?: boolean;
}

export async function validateQuiz(
  filePath: string,
  options: ValidateOptions = {}
): Promise<boolean> {
  const result = await parseQuiz(filePath);

  if (result.success) {
    console.log('✓ Valid quiz file');

    if (options.verbose && result.quiz) {
      console.log('\nQuiz Details:');
      console.log(`  ID: ${result.quiz.metadata.id}`);
      console.log(`  Title: ${result.quiz.metadata.title}`);
      console.log(`  Questions: ${result.quiz.questions.length}`);
      console.log(`  Mode: ${result.quiz.config.mode}`);
      console.log(`  Passing Threshold: ${(result.quiz.config.passingThreshold * 100).toFixed(0)}%`);

      if (result.quiz.metadata.tags?.length) {
        console.log(`  Tags: ${result.quiz.metadata.tags.join(', ')}`);
      }

      const typeCounts = new Map<string, number>();
      for (const q of result.quiz.questions) {
        typeCounts.set(q.type, (typeCounts.get(q.type) || 0) + 1);
      }

      console.log('\nQuestion Types:');
      for (const [type, count] of typeCounts) {
        console.log(`  ${type}: ${count}`);
      }
    }

    return true;
  } else {
    console.log('✗ Invalid quiz file');
    console.log('\nErrors:');
    for (const error of result.errors || []) {
      console.log(`  - ${error}`);
    }
    return false;
  }
}
