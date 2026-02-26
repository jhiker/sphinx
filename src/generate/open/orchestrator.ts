/**
 * Orchestrator for multi-source open mode quiz generation.
 */

import { randomUUID } from 'crypto';
import { mkdir, writeFile, readFile, readdir } from 'fs/promises';
import { join } from 'path';
import { homedir } from 'os';
import { query } from '@anthropic-ai/claude-agent-sdk';
import type { GenerateConfig, Focus } from '../config.js';
import type {
  OpenModeConfig,
  OpenModeResult,
  SourceSpec,
  SourceNotes,
  ConnectionAnalysis,
} from './types.js';
import {
  createSourceExplorerAgent,
  createConnectionFinderAgent,
} from './agents.js';

export interface OrchestratorInput {
  sources: SourceSpec[];
  prompt: string;
  config: OpenModeConfig;
  focus: Focus;
  questionCount: number;
  difficulty: string;
  globalConfig: GenerateConfig;
}

/**
 * Run the open mode orchestrator.
 */
export async function runOrchestrator(input: OrchestratorInput): Promise<OpenModeResult> {
  const startTime = Date.now();
  const sessionId = randomUUID().slice(0, 8);

  // Create session directory
  const sessionsDir = join(homedir(), '.sphinx', 'open-sessions');
  const sessionDir = join(sessionsDir, sessionId);
  const notesDir = join(sessionDir, 'notes');

  await mkdir(notesDir, { recursive: true });

  // Save session config
  await writeFile(
    join(sessionDir, 'sources.json'),
    JSON.stringify(input.sources, null, 2)
  );

  console.error(`Session: ${sessionId}`);
  console.error(`Session directory: ${sessionDir}`);
  console.error('');

  try {
    // Phase 1: Explore sources in parallel
    console.error('Phase 1: Exploring sources...');
    const notes = await exploreSourcesParallel(
      input.sources,
      notesDir,
      input.prompt,
      input.config
    );

    const successfulNotes = notes.filter(isNonNullSourceNotes);
    console.error(`  Explored ${successfulNotes.length}/${input.sources.length} sources`);

    if (successfulNotes.length === 0) {
      return {
        success: false,
        error: 'All source explorations failed',
        sessionDir,
        stats: {
          totalSources: input.sources.length,
          successfulSources: 0,
          conceptsExtracted: 0,
          connectionsFound: 0,
          questionsGenerated: 0,
          durationMs: Date.now() - startTime,
        },
      };
    }

    // Phase 2: Find connections between sources
    console.error('');
    console.error('Phase 2: Finding connections...');
    const connectionsPath = join(sessionDir, 'connections.json');
    const connections = await findConnections(
      notesDir,
      successfulNotes.length,
      connectionsPath,
      input.config
    );
    console.error(`  Found ${connections.connections.length} connections`);

    // Phase 3: Synthesize quiz
    console.error('');
    console.error('Phase 3: Synthesizing quiz...');
    const quizPath = join(sessionDir, 'quiz.json');
    await synthesizeQuiz(
      sessionDir,
      quizPath,
      input.prompt,
      input.focus,
      input.questionCount,
      input.difficulty,
      input.config
    );

    // Validate the quiz exists and count questions
    let questionsGenerated = 0;
    try {
      const quizContent = await readFile(quizPath, 'utf-8');
      const quizData: unknown = JSON.parse(quizContent);
      questionsGenerated = getQuestionCountFromQuiz(quizData);
    } catch {
      // Quiz validation failed
    }

    const totalConcepts = successfulNotes.reduce(
      (sum, n) => sum + (n.concepts?.length || 0),
      0
    );

    return {
      success: true,
      quizPath,
      sessionDir,
      stats: {
        totalSources: input.sources.length,
        successfulSources: successfulNotes.length,
        conceptsExtracted: totalConcepts,
        connectionsFound: connections.connections.length,
        questionsGenerated,
        durationMs: Date.now() - startTime,
      },
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`Orchestration failed: ${errorMessage}`);

    return {
      success: false,
      error: errorMessage,
      sessionDir,
      stats: {
        totalSources: input.sources.length,
        successfulSources: 0,
        conceptsExtracted: 0,
        connectionsFound: 0,
        questionsGenerated: 0,
        durationMs: Date.now() - startTime,
      },
    };
  }
}

/**
 * Explore sources in parallel with concurrency limit.
 */
async function exploreSourcesParallel(
  sources: SourceSpec[],
  notesDir: string,
  prompt: string,
  config: OpenModeConfig
): Promise<(SourceNotes | null)[]> {
  const results = Array<SourceNotes | null>(sources.length).fill(null);
  const pending: Promise<void>[] = [];
  let completedCount = 0;

  for (let i = 0; i < sources.length; i++) {
    const source = sources[i];
    const notesPath = join(notesDir, `source-${i}.json`);

    // Wait if we've reached max concurrent agents
    while (pending.length >= config.maxAgents) {
      await Promise.race(pending);
    }

    const agentDef = createSourceExplorerAgent(source, i, notesPath, prompt);

    const task = (async () => {
      try {
        console.error(`  Starting explorer for source ${i + 1}/${sources.length}: ${source.type}:${source.target.slice(0, 50)}`);

        const debugMode = process.env.SPHINX_DEBUG === '1';
        let turnCount = 0;

        for await (const rawMessage of query({
          prompt: `Explore this source and write notes to ${notesPath}`,
          options: {
            cwd: process.cwd(),
            agents: {
              'source-explorer': agentDef,
            },
            agent: 'source-explorer',
            allowedTools: agentDef.tools,
            maxTurns: config.maxIterations,
            settingSources: ['project', 'user'],
            permissionMode: 'bypassPermissions',
            allowDangerouslySkipPermissions: true,
          },
        })) {
          const message: unknown = rawMessage;

          // Log progress
          if (isAssistantMessage(message)) {
            turnCount++;
            if (debugMode) {
              console.error(`    [Source ${i}] Turn ${turnCount}`);
            }
          }

          if (isResultLikeMessage(message)) {
            const subtype = message.subtype || 'unknown';
            if (debugMode) {
              console.error(`    [Source ${i}] Result: ${subtype}`);
            }
            // Handle max_turns gracefully - not an error, just stop exploring
            if (subtype === 'error_max_turns') {
              console.error(`    [Source ${i}] Max turns reached, using collected notes`);
            }
            break;
          }
        }

        // Read the notes file (may have been written even if max_turns was hit)
        try {
          const content = await readFile(notesPath, 'utf-8');
          const parsedNotes: unknown = JSON.parse(content);
          results[i] = isSourceNotes(parsedNotes) ? parsedNotes : null;
          completedCount++;
          console.error(`  Completed source ${completedCount}/${sources.length}`);
        } catch {
          // No notes file - this is okay, source may not have produced notes yet
          console.error(`  Source ${i}: No notes collected (may need more turns or source was inaccessible)`);
        }
      } catch (error) {
        // Catch any errors but don't fail the whole process
        const errMsg = error instanceof Error ? error.message : String(error);
        if (errMsg.includes('max_turns') || errMsg.includes('MaxTurns')) {
          console.error(`  Source ${i}: Max turns reached, continuing with available notes`);
        } else {
          console.error(`  Source ${i}: ${errMsg}`);
        }
      }
    })();

    pending.push(task);

    // Clean up completed tasks
    void task.finally(() => {
      const index = pending.indexOf(task);
      if (index > -1) {
        void pending.splice(index, 1);
      }
    });
  }

  // Wait for all remaining tasks
  await Promise.all(pending);

  return results;
}

/**
 * Find connections between source notes.
 * If only one source, skip connection finding.
 */
async function findConnections(
  notesDir: string,
  sourceCount: number,
  connectionsPath: string,
  _config: OpenModeConfig
): Promise<ConnectionAnalysis> {
  // If only one source, skip connection finding
  if (sourceCount <= 1) {
    console.error('  Skipping connection finding (only 1 source)');
    const emptyConnections: ConnectionAnalysis = {
      connections: [],
      suggestedFocusAreas: [],
      sharedConcepts: [],
    };
    await writeFile(connectionsPath, JSON.stringify(emptyConnections, null, 2));
    return emptyConnections;
  }

  const agentDef = createConnectionFinderAgent(notesDir, sourceCount, connectionsPath);

  try {
    for await (const rawMessage of query({
      prompt: `Analyze the source notes and find connections. Write results to ${connectionsPath}`,
      options: {
        cwd: process.cwd(),
        agents: {
          'connection-finder': agentDef,
        },
        agent: 'connection-finder',
        allowedTools: agentDef.tools,
        maxTurns: 10,
        settingSources: ['project', 'user'],
        permissionMode: 'bypassPermissions',
        allowDangerouslySkipPermissions: true,
      },
    })) {
      const message: unknown = rawMessage;
      if (isResultLikeMessage(message)) {
        break;
      }
    }

    // Read the connections file
    const content = await readFile(connectionsPath, 'utf-8');
    const parsed: unknown = JSON.parse(content);
    return isConnectionAnalysis(parsed)
      ? parsed
      : { connections: [], suggestedFocusAreas: [], sharedConcepts: [] };
  } catch (error) {
    console.error(`  Warning: Connection finding failed: ${error instanceof Error ? error.message : String(error)}`);
    // Write empty connections file and return
    const emptyConnections: ConnectionAnalysis = {
      connections: [],
      suggestedFocusAreas: [],
      sharedConcepts: [],
    };
    await writeFile(connectionsPath, JSON.stringify(emptyConnections, null, 2));
    return emptyConnections;
  }
}

/**
 * Synthesize the final quiz from notes and connections using structured output.
 */
async function synthesizeQuiz(
  sessionDir: string,
  quizPath: string,
  prompt: string,
  focus: string,
  questionCount: number,
  difficulty: string,
  _config: OpenModeConfig
): Promise<void> {
  // Read all notes files
  const notesDir = join(sessionDir, 'notes');
  const notesFiles = await readdir(notesDir);
  const notesContent: string[] = [];

  for (const file of notesFiles.filter(f => f.endsWith('.json'))) {
    try {
      const content = await readFile(join(notesDir, file), 'utf-8');
      notesContent.push(`### ${file}\n${content}`);
    } catch {
      // Skip unreadable files
    }
  }

  // Read connections
  let connectionsContent = '{}';
  try {
    connectionsContent = await readFile(join(sessionDir, 'connections.json'), 'utf-8');
  } catch {
    // Use empty connections
  }

  // Build synthesis prompt
  const synthesisPrompt = buildSynthesisPrompt(
    notesContent.join('\n\n'),
    connectionsContent,
    prompt,
    focus,
    questionCount,
    difficulty
  );

  const debugMode = process.env.SPHINX_DEBUG === '1';

  // Use structured output to generate the quiz in a single turn
  // No tools needed - just generate JSON directly from the notes
  for await (const rawMessage of query({
    prompt: synthesisPrompt,
    options: {
      cwd: process.cwd(),
      maxTurns: 3, // Allow a few retries for structured output validation
      settingSources: ['project', 'user'],
      permissionMode: 'bypassPermissions',
      allowDangerouslySkipPermissions: true,
      allowedTools: [], // No tools needed - pure generation
      outputFormat: {
        type: 'json_schema',
        schema: createQuizSchema(),
      },
    },
  })) {
    const message: unknown = rawMessage;

    if (debugMode) {
      const msgObj = message as Record<string, unknown>;
      const msgType = typeof msgObj?.type === 'string' ? msgObj.type : 'unknown';
      const subtype = typeof msgObj?.subtype === 'string' ? msgObj.subtype : '';
      console.error(`    [Synthesizer] ${msgType}${subtype ? `: ${subtype}` : ''}`);
    }

    if (isResultLikeMessage(message)) {
      // Check for structured output in success case
      if (message.subtype === 'success') {
        const resultMsg = message as { structured_output?: unknown };
        if (resultMsg.structured_output) {
          const quizJson = JSON.stringify(resultMsg.structured_output, null, 2);
          await writeFile(quizPath, quizJson);
          console.error('  Quiz generated successfully');
          return;
        }
      }

      // Handle max_turns - try to extract any partial result
      if (message.subtype === 'error_max_turns') {
        console.error('  Warning: Max turns reached during synthesis');
        // Check if there's a partial result we can use
        const resultMsg = message as { result?: string; structured_output?: unknown };
        if (resultMsg.structured_output) {
          const quizJson = JSON.stringify(resultMsg.structured_output, null, 2);
          await writeFile(quizPath, quizJson);
          console.error('  Using partial quiz output');
          return;
        }
        throw new Error('Quiz synthesis hit max turns without producing output. Try increasing --max-iterations or simplifying sources.');
      }

      // Other error
      throw new Error(`Quiz synthesis failed: ${message.subtype || 'unknown error'}`);
    }
  }

  throw new Error('Quiz synthesis did not produce output');
}

/**
 * Build the synthesis prompt from notes and connections.
 */
function buildSynthesisPrompt(
  notesContent: string,
  connectionsContent: string,
  userPrompt: string,
  focus: string,
  questionCount: number,
  difficulty: string
): string {
  return `You are a quiz synthesizer. Generate a quiz from the following source notes and connections.

## User's Focus
${userPrompt || 'General comprehension quiz'}

## Quiz Requirements
- Focus: ${focus}
- Question count: ${questionCount}
- Difficulty: ${difficulty}

## Source Notes
${notesContent}

## Cross-Source Connections
${connectionsContent}

## Instructions
1. Create ${questionCount} high-quality questions based on the notes
2. Prioritize cross-source topics when available
3. Match the requested focus area (${focus})
4. Distribute difficulty appropriately:
${getDifficultyDistribution(difficulty)}

Generate a valid Sphinx quiz JSON with:
- version: "1.0"
- metadata with id, title, description, and tags
- config with mode: "static", passingThreshold: 0.7, etc.
- questions array with multiple-choice questions

Each question needs: id, type, prompt, difficulty (-2 to 2), options (with correct marked), and explanation.`;
}

function getDifficultyDistribution(difficulty: string): string {
  switch (difficulty) {
    case 'easy':
      return '   All questions: difficulty -2 to -0.5';
    case 'medium':
      return '   All questions: difficulty -0.5 to 0.5';
    case 'hard':
      return '   All questions: difficulty 0.5 to 2';
    case 'mixed':
    default:
      return '   ~20% easy (-2 to -1), ~50% medium (-1 to 1), ~30% hard (1 to 2)';
  }
}

/**
 * Create the JSON schema for quiz structured output.
 */
function createQuizSchema(): Record<string, unknown> {
  return {
    type: 'object',
    required: ['version', 'metadata', 'config', 'questions'],
    properties: {
      version: { type: 'string', pattern: '^\\d+\\.\\d+$' },
      metadata: {
        type: 'object',
        required: ['id', 'title'],
        properties: {
          id: { type: 'string', pattern: '^[a-z0-9-]+$' },
          title: { type: 'string' },
          description: { type: 'string' },
          tags: { type: 'array', items: { type: 'string' } },
        },
      },
      config: {
        type: 'object',
        required: ['mode', 'passingThreshold', 'timeLimit', 'randomizeOrder', 'showCorrectAnswers'],
        properties: {
          mode: { type: 'string', enum: ['static', 'adaptive'] },
          passingThreshold: { type: 'number' },
          timeLimit: { type: ['integer', 'null'] },
          randomizeOrder: { type: 'boolean' },
          showCorrectAnswers: { type: 'string', enum: ['never', 'after-each', 'after-completion'] },
        },
      },
      questions: {
        type: 'array',
        minItems: 1,
        items: {
          type: 'object',
          required: ['id', 'type', 'prompt'],
          properties: {
            id: { type: 'string' },
            type: { type: 'string', enum: ['multiple-choice', 'multi-select', 'free-text'] },
            prompt: { type: 'string' },
            difficulty: { type: 'number' },
            discrimination: { type: 'number' },
            category: { type: 'string' },
            context: { type: 'string' },
            explanation: { type: 'string' },
            options: {
              type: 'array',
              items: {
                type: 'object',
                required: ['id', 'text'],
                properties: {
                  id: { type: 'string' },
                  text: { type: 'string' },
                  correct: { type: 'boolean' },
                },
              },
            },
          },
        },
      },
    },
  };
}

/**
 * List all open mode sessions.
 */
export async function listSessions(): Promise<
  Array<{ id: string; createdAt: Date; sourceCount: number }>
> {
  const sessionsDir = join(homedir(), '.sphinx', 'open-sessions');

  try {
    const entries = await readdir(sessionsDir, { withFileTypes: true });
    const sessions: Array<{ id: string; createdAt: Date; sourceCount: number }> = [];

    for (const entry of entries) {
      if (entry.isDirectory()) {
        try {
          const sourcesPath = join(sessionsDir, entry.name, 'sources.json');
          const content = await readFile(sourcesPath, 'utf-8');
          const sourcesData: unknown = JSON.parse(content);

          sessions.push({
            id: entry.name,
            createdAt: new Date(), // Would need to read from file stats
            sourceCount: Array.isArray(sourcesData) ? sourcesData.length : 0,
          });
        } catch {
          // Skip invalid sessions
        }
      }
    }

    return sessions;
  } catch {
    return [];
  }
}

function isNonNullSourceNotes(note: SourceNotes | null): note is SourceNotes {
  return note !== null;
}

function getQuestionCountFromQuiz(data: unknown): number {
  if (!data || typeof data !== 'object') {
    return 0;
  }
  const questions = (data as { questions?: unknown }).questions;
  return Array.isArray(questions) ? questions.length : 0;
}

function isSourceNotes(data: unknown): data is SourceNotes {
  return !!data && typeof data === 'object' && 'summary' in data && 'source' in data;
}

function isConnectionAnalysis(data: unknown): data is ConnectionAnalysis {
  if (!data || typeof data !== 'object') {
    return false;
  }
  const obj = data as Record<string, unknown>;
  return (
    Array.isArray(obj.connections) &&
    Array.isArray(obj.suggestedFocusAreas) &&
    Array.isArray(obj.sharedConcepts)
  );
}

function isResultLikeMessage(message: unknown): message is { type: 'result'; subtype?: string } {
  if (!message || typeof message !== 'object') {
    return false;
  }
  const obj = message as Record<string, unknown>;
  return obj.type === 'result' && (obj.subtype === undefined || typeof obj.subtype === 'string');
}

function isAssistantMessage(message: unknown): boolean {
  if (!message || typeof message !== 'object') {
    return false;
  }
  const obj = message as Record<string, unknown>;
  return obj.type === 'assistant';
}

/**
 * Clean up old sessions.
 */
export async function cleanSessions(olderThanDays: number = 7): Promise<number> {
  const { rm, stat } = await import('fs/promises');
  const sessionsDir = join(homedir(), '.sphinx', 'open-sessions');
  const cutoff = Date.now() - olderThanDays * 24 * 60 * 60 * 1000;
  let cleaned = 0;

  try {
    const entries = await readdir(sessionsDir, { withFileTypes: true });

    for (const entry of entries) {
      if (entry.isDirectory()) {
        const sessionPath = join(sessionsDir, entry.name);
        try {
          const stats = await stat(sessionPath);
          if (stats.mtimeMs < cutoff) {
            await rm(sessionPath, { recursive: true });
            cleaned++;
          }
        } catch {
          // Skip errors
        }
      }
    }

    return cleaned;
  } catch {
    return 0;
  }
}
