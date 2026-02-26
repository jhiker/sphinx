/**
 * Synthesis utilities for open mode quiz generation.
 */

import type { SourceNotes, ConnectionAnalysis, QuestionOutline } from './types.js';

/**
 * Configuration for quiz synthesis.
 */
export interface SynthesisConfig {
  focus: string;
  questionCount: number;
  difficulty: 'easy' | 'medium' | 'hard' | 'mixed';
  userPrompt: string;
}

/**
 * A ranked question candidate for selection.
 */
export interface RankedQuestion {
  outline: QuestionOutline;
  sourceIndex: number;
  score: number;
  crossSource: boolean;
}

/**
 * Rank and select question candidates from notes.
 */
export function selectQuestionCandidates(
  notes: SourceNotes[],
  connections: ConnectionAnalysis,
  config: SynthesisConfig
): RankedQuestion[] {
  const candidates: RankedQuestion[] = [];

  // Collect all question outlines with their source indices
  for (let i = 0; i < notes.length; i++) {
    const note = notes[i];
    for (const outline of note.potentialQuestions || []) {
      candidates.push({
        outline,
        sourceIndex: i,
        score: 0,
        crossSource: false,
      });
    }
  }

  // Score each candidate
  for (const candidate of candidates) {
    candidate.score = scoreCandidate(candidate, connections, config);
    candidate.crossSource = isCrossSourceQuestion(candidate, connections);
  }

  // Sort by score (descending)
  candidates.sort((a, b) => b.score - a.score);

  // Select top candidates with diversity
  return selectDiverseCandidates(candidates, config.questionCount, notes.length);
}

/**
 * Score a question candidate based on various factors.
 */
function scoreCandidate(
  candidate: RankedQuestion,
  connections: ConnectionAnalysis,
  config: SynthesisConfig
): number {
  let score = 0;

  // Base score from difficulty match
  score += scoreDifficultyMatch(candidate.outline.difficulty, config.difficulty);

  // Bonus for cross-source topics
  if (isCrossSourceQuestion(candidate, connections)) {
    score += 20;
  }

  // Bonus for matching focus area keywords
  score += scoreFocusMatch(candidate.outline.topic, config.focus);

  // Bonus for matching user prompt keywords
  if (config.userPrompt) {
    score += scorePromptMatch(candidate.outline.topic, config.userPrompt);
  }

  return score;
}

/**
 * Score how well a difficulty matches the desired difficulty setting.
 */
function scoreDifficultyMatch(
  questionDifficulty: number,
  targetDifficulty: string
): number {
  switch (targetDifficulty) {
    case 'easy':
      // Prefer difficulties -2 to -0.5
      return questionDifficulty <= -0.5 ? 10 : questionDifficulty <= 0 ? 5 : 0;
    case 'medium':
      // Prefer difficulties -0.5 to 0.5
      return Math.abs(questionDifficulty) <= 0.5 ? 10 : Math.abs(questionDifficulty) <= 1 ? 5 : 0;
    case 'hard':
      // Prefer difficulties 0.5 to 2
      return questionDifficulty >= 0.5 ? 10 : questionDifficulty >= 0 ? 5 : 0;
    case 'mixed':
    default:
      // All difficulties are acceptable
      return 5;
  }
}

/**
 * Check if a question relates to cross-source connections.
 */
function isCrossSourceQuestion(
  candidate: RankedQuestion,
  connections: ConnectionAnalysis
): boolean {
  const topicLower = candidate.outline.topic.toLowerCase();

  // Check if topic matches any connection theme
  for (const connection of connections.connections) {
    if (connection.theme.toLowerCase().includes(topicLower) ||
        topicLower.includes(connection.theme.toLowerCase())) {
      return true;
    }
  }

  // Check if topic matches shared concepts
  for (const concept of connections.sharedConcepts) {
    if (concept.toLowerCase().includes(topicLower) ||
        topicLower.includes(concept.toLowerCase())) {
      return true;
    }
  }

  return false;
}

/**
 * Score how well a topic matches the focus area.
 */
function scoreFocusMatch(topic: string, focus: string): number {
  const topicLower = topic.toLowerCase();

  const focusKeywords: Record<string, string[]> = {
    comprehension: ['understand', 'concept', 'how', 'what', 'explain', 'define'],
    changes: ['change', 'modify', 'update', 'add', 'remove', 'refactor', 'migrate'],
    practices: ['best', 'practice', 'pattern', 'anti-pattern', 'should', 'avoid'],
    security: ['security', 'vulnerability', 'attack', 'protect', 'auth', 'safe'],
    concepts: ['definition', 'term', 'meaning', 'concept', 'principle'],
  };

  const keywords = focusKeywords[focus] || [];
  let matches = 0;

  for (const keyword of keywords) {
    if (topicLower.includes(keyword)) {
      matches++;
    }
  }

  return matches * 5;
}

/**
 * Score how well a topic matches the user prompt.
 */
function scorePromptMatch(topic: string, prompt: string): number {
  const topicWords = topic.toLowerCase().split(/\s+/);
  const promptWords = prompt.toLowerCase().split(/\s+/);

  // Filter out common words
  const stopWords = new Set(['the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
    'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should',
    'may', 'might', 'must', 'shall', 'can', 'need', 'dare', 'ought', 'used',
    'to', 'of', 'in', 'for', 'on', 'with', 'at', 'by', 'from', 'as', 'into',
    'through', 'during', 'before', 'after', 'above', 'below', 'between', 'under',
    'and', 'but', 'or', 'nor', 'so', 'yet', 'both', 'either', 'neither',
    'not', 'only', 'own', 'same', 'than', 'too', 'very', 'just', 'about', 'quiz']);

  const significantPromptWords = promptWords.filter(w => !stopWords.has(w) && w.length > 2);

  let matches = 0;
  for (const promptWord of significantPromptWords) {
    for (const topicWord of topicWords) {
      if (topicWord.includes(promptWord) || promptWord.includes(topicWord)) {
        matches++;
        break;
      }
    }
  }

  return matches * 10;
}

/**
 * Select a diverse set of candidates ensuring coverage across sources.
 */
function selectDiverseCandidates(
  candidates: RankedQuestion[],
  count: number,
  sourceCount: number
): RankedQuestion[] {
  const selected: RankedQuestion[] = [];
  const sourceQuestionCounts = new Map<number, number>();

  // Initialize source counts
  for (let i = 0; i < sourceCount; i++) {
    sourceQuestionCounts.set(i, 0);
  }

  // Target questions per source (with some flexibility)
  const targetPerSource = Math.ceil(count / sourceCount);

  // First pass: select top-scoring candidates while maintaining diversity
  for (const candidate of candidates) {
    if (selected.length >= count) break;

    const currentCount = sourceQuestionCounts.get(candidate.sourceIndex) || 0;

    // Allow selection if source hasn't exceeded target, or if it's a high-scoring cross-source question
    if (currentCount < targetPerSource || (candidate.crossSource && currentCount < targetPerSource + 1)) {
      selected.push(candidate);
      sourceQuestionCounts.set(candidate.sourceIndex, currentCount + 1);
    }
  }

  // Second pass: if we don't have enough, relax constraints
  if (selected.length < count) {
    for (const candidate of candidates) {
      if (selected.length >= count) break;
      if (!selected.includes(candidate)) {
        selected.push(candidate);
      }
    }
  }

  return selected;
}

/**
 * Build the synthesis context from notes and connections.
 */
export function buildSynthesisContext(
  notes: SourceNotes[],
  connections: ConnectionAnalysis,
  selectedQuestions: RankedQuestion[]
): string {
  const sections: string[] = [];

  // Source summaries
  sections.push('## Source Summaries\n');
  for (let i = 0; i < notes.length; i++) {
    const note = notes[i];
    sections.push(`### Source ${i + 1}: ${note.source.type}:${note.source.target}`);
    sections.push(note.summary);
    sections.push('');
  }

  // Key concepts
  sections.push('## Key Concepts\n');
  for (let i = 0; i < notes.length; i++) {
    const note = notes[i];
    if (note.concepts && note.concepts.length > 0) {
      sections.push(`### From Source ${i + 1}:`);
      for (const concept of note.concepts.slice(0, 5)) {
        sections.push(`- **${concept.name}**: ${concept.definition}`);
      }
      sections.push('');
    }
  }

  // Cross-source connections
  if (connections.connections.length > 0) {
    sections.push('## Cross-Source Connections\n');
    for (const connection of connections.connections) {
      sections.push(`### ${connection.theme}`);
      sections.push(`Sources: ${connection.sourceIndices.map(i => i + 1).join(', ')}`);
      sections.push(connection.description);
      sections.push('');
    }
  }

  // Selected question topics
  sections.push('## Selected Question Topics\n');
  for (let i = 0; i < selectedQuestions.length; i++) {
    const q = selectedQuestions[i];
    sections.push(`${i + 1}. **${q.outline.topic}** (difficulty: ${q.outline.difficulty}, source: ${q.sourceIndex + 1}${q.crossSource ? ', cross-source' : ''})`);
    sections.push(`   ${q.outline.outline}`);
  }

  return sections.join('\n');
}

/**
 * Get difficulty distribution targets based on difficulty setting.
 */
export function getDifficultyDistribution(
  difficulty: string,
  count: number
): { easy: number; medium: number; hard: number } {
  switch (difficulty) {
    case 'easy':
      return { easy: count, medium: 0, hard: 0 };
    case 'medium':
      return { easy: 0, medium: count, hard: 0 };
    case 'hard':
      return { easy: 0, medium: 0, hard: count };
    case 'mixed':
    default:
      // 20% easy, 50% medium, 30% hard
      const easy = Math.round(count * 0.2);
      const hard = Math.round(count * 0.3);
      const medium = count - easy - hard;
      return { easy, medium, hard };
  }
}
