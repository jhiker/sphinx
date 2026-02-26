/**
 * Agent definitions for open mode quiz generation.
 */

import type { AgentDefinition } from '@anthropic-ai/claude-agent-sdk';
import type { SourceSpec } from './types.js';
import { formatSourceSpec } from './sources.js';

/**
 * Create the source explorer agent definition.
 * This agent explores a single source and extracts notes.
 */
export function createSourceExplorerAgent(
  source: SourceSpec,
  sourceIndex: number,
  notesPath: string,
  userPrompt: string
): AgentDefinition {
  const sourceDesc = formatSourceSpec(source);

  return {
    description: `Explores ${sourceDesc} to extract concepts, facts, and potential quiz questions`,
    prompt: buildExplorerPrompt(source, sourceIndex, notesPath, userPrompt),
    model: 'sonnet',
    tools: getToolsForSource(source),
    maxTurns: 15,
  };
}

/**
 * Create the connection finder agent definition.
 * This agent analyzes notes from all sources to find cross-source connections.
 */
export function createConnectionFinderAgent(
  notesDir: string,
  sourceCount: number,
  connectionsPath: string
): AgentDefinition {
  return {
    description: 'Analyzes notes from multiple sources to find cross-source themes and connections',
    prompt: buildConnectionFinderPrompt(notesDir, sourceCount, connectionsPath),
    model: 'sonnet',
    tools: ['Read', 'Glob', 'Write'],
    maxTurns: 10,
  };
}

/**
 * Create the quiz synthesizer agent definition.
 * This agent generates the final quiz from notes and connections.
 */
export function createQuizSynthesizerAgent(
  sessionDir: string,
  quizPath: string,
  userPrompt: string,
  focus: string,
  questionCount: number,
  difficulty: string
): AgentDefinition {
  return {
    description: 'Synthesizes a cohesive quiz from source notes and cross-source connections',
    prompt: buildSynthesizerPrompt(sessionDir, quizPath, userPrompt, focus, questionCount, difficulty),
    model: 'opus',
    tools: ['Read', 'Glob', 'Write', 'Bash'],
    maxTurns: 20,
  };
}

/**
 * Get the appropriate tools for exploring a source type.
 */
function getToolsForSource(source: SourceSpec): string[] {
  const baseTools = ['Read', 'Glob', 'Grep', 'Write'];

  switch (source.type) {
    case 'github':
      return [...baseTools, 'Bash']; // For gh CLI
    case 'url':
      return [...baseTools, 'WebFetch'];
    case 'confluence':
      return [...baseTools, 'WebFetch']; // May also use MCP
    case 'notion':
      return [...baseTools, 'WebFetch']; // May also use MCP
    case 'file':
      return baseTools;
    default:
      return baseTools;
  }
}

/**
 * Build the prompt for a source explorer agent.
 */
function buildExplorerPrompt(
  source: SourceSpec,
  sourceIndex: number,
  notesPath: string,
  userPrompt: string
): string {
  return `You are a source explorer agent. Your task is to explore a content source and extract structured notes that will be used to generate quiz questions.

## Your Source
- Type: ${source.type}
- Target: ${source.target}
${source.subtype ? `- Subtype: ${source.subtype}` : ''}

## User's Quiz Focus
${userPrompt || 'General comprehension and understanding of the content.'}

## Your Task

1. **Explore the source** using the appropriate tools:
${getExplorationInstructions(source)}

2. **Extract and organize information**:
   - Identify 5-10 key concepts with clear definitions
   - Extract 10-20 important facts that could be quiz-worthy
   - Note 5-10 potential quiz question topics with difficulty estimates

3. **Write your findings** to the notes file in JSON format.

## Output Format

Write your notes to: ${notesPath}

The JSON must follow this structure:
\`\`\`json
{
  "source": {
    "type": "${source.type}",
    "target": "${source.target}"${source.subtype ? `,
    "subtype": "${source.subtype}"` : ''}
  },
  "summary": "A 2-3 sentence high-level summary of the source content",
  "concepts": [
    {
      "id": "concept-1",
      "name": "Concept Name",
      "definition": "Clear, educational definition",
      "relatedTo": ["concept-2"]
    }
  ],
  "facts": [
    {
      "statement": "A specific, factual statement",
      "quizWorthy": true,
      "reference": "Where in the source this was found"
    }
  ],
  "potentialQuestions": [
    {
      "topic": "What the question would test",
      "difficulty": 0,
      "outline": "Brief description of the question",
      "questionType": "multiple-choice"
    }
  ],
  "generatedAt": "${new Date().toISOString()}"
}
\`\`\`

## Difficulty Scale
- -2: Basic terminology, obvious from reading
- -1: Simple concepts, single-step reasoning
- 0: Moderate understanding required
- +1: Requires connecting multiple concepts
- +2: Expert-level, nuanced understanding

## Guidelines
- Focus on content that is substantive and educational
- Avoid trivial details that wouldn't make good quiz questions
- Look for relationships between concepts
- Consider both factual recall and conceptual understanding
- Be thorough but stay focused on the user's quiz focus

Begin exploring the source now.`;
}

/**
 * Get exploration instructions based on source type.
 */
function getExplorationInstructions(source: SourceSpec): string {
  switch (source.type) {
    case 'github':
      if (source.subtype === 'pr') {
        return `   - Use \`gh pr view ${source.target} --json title,body,files,reviews,comments\` to get PR details
   - Read the changed files to understand the modifications
   - Look at review comments for additional context`;
      }
      return `   - Use \`gh repo view ${source.target}\` to get repository overview
   - Read README.md and key documentation files
   - Explore the source code structure with Glob and Read
   - Focus on core modules and main entry points`;

    case 'url':
      return `   - Use WebFetch to retrieve the page content
   - Look for linked documentation pages
   - Extract key sections and definitions`;

    case 'confluence':
      return `   - Use WebFetch to retrieve the Confluence page
   - Look for child pages and related content
   - Extract structured information from tables and diagrams`;

    case 'notion':
      return `   - Use WebFetch to retrieve the Notion page
   - Follow linked pages if relevant
   - Extract database entries if present`;

    case 'file':
      return `   - Use Read to examine the file contents
   - If it's a directory, use Glob to find relevant files
   - Parse structured data (JSON, YAML, etc.) if applicable`;

    default:
      return `   - Use available tools to explore the content
   - Extract key information and structure`;
  }
}

/**
 * Build the prompt for the connection finder agent.
 */
function buildConnectionFinderPrompt(
  notesDir: string,
  sourceCount: number,
  connectionsPath: string
): string {
  return `You are a connection finder agent. Your task is to analyze notes from multiple source explorations and identify cross-source themes, patterns, and connections.

## Input
Notes from ${sourceCount} sources are available in: ${notesDir}
Each source's notes are in a file named source-N.json

## Your Task

1. **Read all source notes**:
   - Use Glob to find all notes files: ${notesDir}/source-*.json
   - Read each notes file to understand what was found

2. **Find connections**:
   - Identify themes that appear across multiple sources
   - Find concepts that relate to each other across sources
   - Note complementary information (one source fills in gaps from another)
   - Identify potential quiz questions that could span multiple sources

3. **Write your analysis** to: ${connectionsPath}

## Output Format

\`\`\`json
{
  "connections": [
    {
      "sourceIndices": [0, 1],
      "theme": "Theme or topic that connects these sources",
      "description": "How these sources relate to each other",
      "relatedConcepts": ["concept-id-from-source-0", "concept-id-from-source-1"]
    }
  ],
  "suggestedFocusAreas": [
    "Area that would make a good quiz focus based on cross-source coverage"
  ],
  "sharedConcepts": [
    "Concepts that appear (perhaps with different names) across multiple sources"
  ]
}
\`\`\`

## Guidelines
- Look for both explicit connections (same topics) and implicit ones (related concepts)
- Consider which connections would lead to interesting, educational quiz questions
- Identify areas where the sources provide complementary perspectives
- Note any contradictions or different viewpoints between sources

Begin analyzing the notes now.`;
}

/**
 * Build the prompt for the quiz synthesizer agent.
 */
function buildSynthesizerPrompt(
  sessionDir: string,
  quizPath: string,
  userPrompt: string,
  focus: string,
  questionCount: number,
  difficulty: string
): string {
  return `You are a quiz synthesizer agent. Your task is to generate a cohesive, educational quiz by combining insights from multiple source explorations.

## Input
Session directory: ${sessionDir}
- Source notes: ${sessionDir}/notes/source-*.json
- Connection analysis: ${sessionDir}/connections.json

## Quiz Requirements
- Focus: ${focus}
- Question count: ${questionCount}
- Difficulty: ${difficulty}
- User's prompt: ${userPrompt || 'General comprehension quiz'}

## Your Task

1. **Read all inputs**:
   - Read each source notes file
   - Read the connection analysis
   - Understand the full landscape of content

2. **Select question topics**:
   - Prioritize cross-source topics (they demonstrate broader understanding)
   - Balance coverage across different sources
   - Match the requested focus area
   - Vary difficulty according to the difficulty setting

3. **Generate questions**:
   - Create ${questionCount} high-quality questions
   - Include clear, educational explanations
   - Use appropriate question types (multiple-choice, multi-select, free-text)
   - Add relevant context/code snippets where helpful

4. **Validate and write**:
   - Write the quiz to: ${quizPath}
   - Run \`sphinx validate ${quizPath} --verbose\` to check
   - Fix any validation errors

## Quiz JSON Structure

\`\`\`json
{
  "version": "1.0",
  "metadata": {
    "id": "open-quiz-<timestamp>",
    "title": "Quiz Title",
    "description": "What this quiz tests",
    "tags": ["relevant", "tags"]
  },
  "config": {
    "mode": "static",
    "passingThreshold": 0.7,
    "timeLimit": null,
    "randomizeOrder": true,
    "showCorrectAnswers": "after-completion"
  },
  "questions": [
    {
      "id": "q1",
      "type": "multiple-choice",
      "difficulty": 0,
      "discrimination": 1.0,
      "category": "topic",
      "prompt": "Question text?",
      "context": "Optional context or code snippet",
      "options": [
        { "id": "a", "text": "Option A", "correct": false },
        { "id": "b", "text": "Option B", "correct": true },
        { "id": "c", "text": "Option C", "correct": false },
        { "id": "d", "text": "Option D", "correct": false }
      ],
      "explanation": "Educational explanation of why B is correct"
    }
  ]
}
\`\`\`

## Question Type Guidelines

**multiple-choice**: Single correct answer
- 4 options typically
- Clear distractor options that test understanding

**multi-select**: Multiple correct answers
- Include "scoring": "partial" or "all-or-nothing"
- Mark all correct options

**free-text**: Text input answer
- Include "acceptedAnswers": ["answer1", "answer2"]
- Include "matchMode": "exact" | "contains" | "regex"
- Include "caseSensitive": true | false

## Difficulty Mapping
${getDifficultyInstructions(difficulty)}

## Focus Area: ${focus}
${getFocusInstructions(focus)}

Begin synthesizing the quiz now.`;
}

function getDifficultyInstructions(difficulty: string): string {
  switch (difficulty) {
    case 'easy':
      return 'All questions should have difficulty between -2 and -0.5';
    case 'medium':
      return 'All questions should have difficulty between -0.5 and 0.5';
    case 'hard':
      return 'All questions should have difficulty between 0.5 and 2';
    case 'mixed':
    default:
      return `Mix difficulties across the range:
- ~20% easy (difficulty -2 to -1)
- ~50% medium (difficulty -1 to 1)
- ~30% hard (difficulty 1 to 2)`;
  }
}

function getFocusInstructions(focus: string): string {
  switch (focus) {
    case 'comprehension':
      return 'Focus on understanding core concepts, how components work, and relationships between parts.';
    case 'changes':
      return 'Focus on what changed, why changes were made, impact of changes, and trade-offs considered.';
    case 'practices':
      return 'Focus on best practices, code patterns, potential improvements, and anti-patterns.';
    case 'security':
      return 'Focus on security considerations, vulnerabilities, attack vectors, and mitigations.';
    case 'concepts':
      return 'Focus on definitions, terminology, domain knowledge, and conceptual understanding.';
    default:
      return 'Balance questions across understanding, application, and analysis.';
  }
}
