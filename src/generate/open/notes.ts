/**
 * Notes parsing and validation for open mode.
 */

import { readFile, readdir } from 'fs/promises';
import { join } from 'path';
import type { SourceNotes } from './types.js';

/**
 * Validation result for notes.
 */
export interface NotesValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Validate a SourceNotes object.
 */
export function validateNotes(notes: unknown): NotesValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!notes || typeof notes !== 'object') {
    return { valid: false, errors: ['Notes must be an object'], warnings: [] };
  }

  const obj = notes as Record<string, unknown>;

  // Required fields
  if (!obj.source || typeof obj.source !== 'object') {
    errors.push('Missing or invalid "source" field');
  }

  if (typeof obj.summary !== 'string' || obj.summary.length === 0) {
    errors.push('Missing or empty "summary" field');
  }

  // Concepts validation
  if (!Array.isArray(obj.concepts)) {
    warnings.push('Missing "concepts" array, defaulting to empty');
  } else {
    obj.concepts.forEach((concept, i) => {
      const conceptErrors = validateConcept(concept, i);
      errors.push(...conceptErrors);
    });
  }

  // Facts validation
  if (!Array.isArray(obj.facts)) {
    warnings.push('Missing "facts" array, defaulting to empty');
  } else {
    obj.facts.forEach((fact, i) => {
      const factErrors = validateFact(fact, i);
      errors.push(...factErrors);
    });
  }

  // Potential questions validation
  if (!Array.isArray(obj.potentialQuestions)) {
    warnings.push('Missing "potentialQuestions" array, defaulting to empty');
  } else {
    obj.potentialQuestions.forEach((question, i) => {
      const questionErrors = validateQuestionOutline(question, i);
      errors.push(...questionErrors);
    });
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Validate a concept object.
 */
function validateConcept(concept: unknown, index: number): string[] {
  const errors: string[] = [];
  const prefix = `concepts[${index}]`;

  if (!concept || typeof concept !== 'object') {
    return [`${prefix}: must be an object`];
  }

  const obj = concept as Record<string, unknown>;

  if (typeof obj.id !== 'string' || obj.id.length === 0) {
    errors.push(`${prefix}: missing or empty "id"`);
  }

  if (typeof obj.name !== 'string' || obj.name.length === 0) {
    errors.push(`${prefix}: missing or empty "name"`);
  }

  if (typeof obj.definition !== 'string' || obj.definition.length === 0) {
    errors.push(`${prefix}: missing or empty "definition"`);
  }

  return errors;
}

/**
 * Validate a fact object.
 */
function validateFact(fact: unknown, index: number): string[] {
  const errors: string[] = [];
  const prefix = `facts[${index}]`;

  if (!fact || typeof fact !== 'object') {
    return [`${prefix}: must be an object`];
  }

  const obj = fact as Record<string, unknown>;

  if (typeof obj.statement !== 'string' || obj.statement.length === 0) {
    errors.push(`${prefix}: missing or empty "statement"`);
  }

  if (typeof obj.quizWorthy !== 'boolean') {
    errors.push(`${prefix}: missing or invalid "quizWorthy" boolean`);
  }

  return errors;
}

/**
 * Validate a question outline object.
 */
function validateQuestionOutline(question: unknown, index: number): string[] {
  const errors: string[] = [];
  const prefix = `potentialQuestions[${index}]`;

  if (!question || typeof question !== 'object') {
    return [`${prefix}: must be an object`];
  }

  const obj = question as Record<string, unknown>;

  if (typeof obj.topic !== 'string' || obj.topic.length === 0) {
    errors.push(`${prefix}: missing or empty "topic"`);
  }

  if (typeof obj.difficulty !== 'number') {
    errors.push(`${prefix}: missing or invalid "difficulty" number`);
  } else if (obj.difficulty < -2 || obj.difficulty > 2) {
    errors.push(`${prefix}: "difficulty" should be between -2 and 2`);
  }

  if (typeof obj.outline !== 'string' || obj.outline.length === 0) {
    errors.push(`${prefix}: missing or empty "outline"`);
  }

  return errors;
}

/**
 * Parse and validate notes from a JSON string.
 */
export function parseNotes(jsonString: string): SourceNotes {
  const data: unknown = JSON.parse(jsonString);
  const validation = validateNotes(data);

  if (!validation.valid) {
    throw new Error(`Invalid notes: ${validation.errors.join('; ')}`);
  }

  // Log warnings
  if (validation.warnings.length > 0) {
    console.warn(`Notes warnings: ${validation.warnings.join('; ')}`);
  }

  return data as SourceNotes;
}

/**
 * Load notes from a file.
 */
export async function loadNotesFromFile(filePath: string): Promise<SourceNotes> {
  const content = await readFile(filePath, 'utf-8');
  return parseNotes(content);
}

/**
 * Load all notes from a directory.
 */
export async function loadAllNotes(notesDir: string): Promise<SourceNotes[]> {
  const entries = await readdir(notesDir);
  const notesFiles = entries
    .filter((f) => f.startsWith('source-') && f.endsWith('.json'))
    .sort();

  const notes: SourceNotes[] = [];

  for (const file of notesFiles) {
    try {
      const filePath = join(notesDir, file);
      const noteData = await loadNotesFromFile(filePath);
      notes.push(noteData);
    } catch (error) {
      console.warn(`Warning: Could not load notes from ${file}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  return notes;
}

/**
 * Aggregate statistics from multiple notes.
 */
export interface NotesStats {
  totalConcepts: number;
  totalFacts: number;
  totalQuizWorthyFacts: number;
  totalPotentialQuestions: number;
  averageDifficulty: number;
  conceptsPerSource: number[];
  factsPerSource: number[];
}

/**
 * Calculate aggregate statistics from notes.
 */
export function calculateNotesStats(notes: SourceNotes[]): NotesStats {
  const conceptsPerSource = notes.map((n) => n.concepts?.length || 0);
  const factsPerSource = notes.map((n) => n.facts?.length || 0);

  const allQuestions = notes.flatMap((n) => n.potentialQuestions || []);
  const difficulties = allQuestions.map((q) => q.difficulty).filter((d) => typeof d === 'number');
  const avgDifficulty = difficulties.length > 0
    ? difficulties.reduce((a, b) => a + b, 0) / difficulties.length
    : 0;

  const quizWorthyFacts = notes.reduce(
    (sum, n) => sum + (n.facts?.filter((f) => f.quizWorthy).length || 0),
    0
  );

  return {
    totalConcepts: conceptsPerSource.reduce((a, b) => a + b, 0),
    totalFacts: factsPerSource.reduce((a, b) => a + b, 0),
    totalQuizWorthyFacts: quizWorthyFacts,
    totalPotentialQuestions: allQuestions.length,
    averageDifficulty: Math.round(avgDifficulty * 100) / 100,
    conceptsPerSource,
    factsPerSource,
  };
}

/**
 * Find concepts that appear across multiple sources (by similar names).
 */
export function findSharedConcepts(notes: SourceNotes[]): string[] {
  const conceptNames: Map<string, number> = new Map();

  for (const note of notes) {
    const seen = new Set<string>();

    for (const concept of note.concepts || []) {
      const normalized = concept.name.toLowerCase().trim();
      if (!seen.has(normalized)) {
        seen.add(normalized);
        conceptNames.set(normalized, (conceptNames.get(normalized) || 0) + 1);
      }
    }
  }

  // Return concepts that appear in more than one source
  return Array.from(conceptNames.entries())
    .filter(([, count]) => count > 1)
    .map(([name]) => name);
}
