/**
 * Source parsing and validation for open mode.
 */

import type { SourceSpec, SourceType } from './types.js';

/**
 * Valid source type prefixes.
 */
const SOURCE_TYPES: SourceType[] = ['github', 'url', 'confluence', 'notion', 'file'];

/**
 * Parse a source specification string.
 * Format: TYPE:TARGET
 *
 * @example
 * parseSourceSpec('github:owner/repo') // { type: 'github', target: 'owner/repo', subtype: 'repo' }
 * parseSourceSpec('github:owner/repo/pull/123') // { type: 'github', target: 'owner/repo/pull/123', subtype: 'pr' }
 * parseSourceSpec('url:https://docs.example.com') // { type: 'url', target: 'https://docs.example.com' }
 */
export function parseSourceSpec(spec: string): SourceSpec {
  const colonIndex = spec.indexOf(':');

  if (colonIndex === -1) {
    throw new Error(
      `Invalid source format: "${spec}". Expected TYPE:TARGET (e.g., github:owner/repo)`
    );
  }

  const typeStr = spec.slice(0, colonIndex).toLowerCase();
  const target = spec.slice(colonIndex + 1);

  if (!SOURCE_TYPES.includes(typeStr as SourceType)) {
    throw new Error(
      `Unknown source type: "${typeStr}". Valid types: ${SOURCE_TYPES.join(', ')}`
    );
  }

  if (!target || target.trim() === '') {
    throw new Error(`Empty target in source: "${spec}"`);
  }

  const type = typeStr as SourceType;
  const result: SourceSpec = { type, target };

  // Determine subtype for sources that have variations
  if (type === 'github') {
    result.subtype = inferGitHubSubtype(target);
  }

  // Validate target format for specific source types
  validateSourceTarget(result);

  return result;
}

/**
 * Infer the GitHub subtype from the target.
 */
function inferGitHubSubtype(target: string): string {
  // Check for PR URL pattern
  if (target.includes('/pull/') || target.includes('/pulls/')) {
    return 'pr';
  }
  // Check for issue URL pattern
  if (target.includes('/issues/')) {
    return 'issue';
  }
  // Check for discussion URL pattern
  if (target.includes('/discussions/')) {
    return 'discussion';
  }
  // Default to repo
  return 'repo';
}

/**
 * Validate the target format for a source specification.
 */
function validateSourceTarget(source: SourceSpec): void {
  switch (source.type) {
    case 'github':
      validateGitHubTarget(source.target);
      break;
    case 'url':
      validateUrlTarget(source.target);
      break;
    case 'confluence':
      validateConfluenceTarget(source.target);
      break;
    case 'notion':
      validateNotionTarget(source.target);
      break;
    case 'file':
      // File paths are validated at runtime
      break;
  }
}

/**
 * Validate a GitHub target.
 */
function validateGitHubTarget(target: string): void {
  // Accept full URLs
  if (target.startsWith('https://github.com/')) {
    return;
  }

  // Accept owner/repo format
  const shortPattern = /^[\w.-]+\/[\w.-]+/;
  if (shortPattern.test(target)) {
    return;
  }

  throw new Error(
    `Invalid GitHub target: "${target}". ` +
      `Expected format: owner/repo, https://github.com/owner/repo, or https://github.com/owner/repo/pull/123`
  );
}

/**
 * Validate a URL target.
 */
function validateUrlTarget(target: string): void {
  try {
    const url = new URL(target);
    if (!['http:', 'https:'].includes(url.protocol)) {
      throw new Error(`Invalid URL protocol: ${url.protocol}`);
    }
  } catch (error) {
    if (error instanceof Error && error.message.includes('Invalid URL protocol')) {
      throw error;
    }
    throw new Error(`Invalid URL: "${target}". Expected a valid http/https URL.`);
  }
}

/**
 * Validate a Confluence target.
 */
function validateConfluenceTarget(target: string): void {
  try {
    const url = new URL(target);
    // Accept any Atlassian or custom Confluence domain
    if (!url.hostname.includes('atlassian.net') && !target.includes('/wiki/')) {
      console.warn(
        `Warning: Confluence URL "${target}" doesn't appear to be an Atlassian URL. ` +
          `Proceeding anyway.`
      );
    }
  } catch {
    throw new Error(
      `Invalid Confluence URL: "${target}". ` +
        `Expected format: https://company.atlassian.net/wiki/spaces/SPACE/pages/123`
    );
  }
}

/**
 * Validate a Notion target.
 */
function validateNotionTarget(target: string): void {
  try {
    const url = new URL(target);
    if (!url.hostname.includes('notion.so') && !url.hostname.includes('notion.site')) {
      console.warn(
        `Warning: Notion URL "${target}" doesn't appear to be a Notion URL. ` +
          `Proceeding anyway.`
      );
    }
  } catch {
    throw new Error(
      `Invalid Notion URL: "${target}". Expected a valid Notion page URL.`
    );
  }
}

/**
 * Parse multiple source specifications.
 */
export function parseSources(specs: string[]): SourceSpec[] {
  if (specs.length === 0) {
    throw new Error('At least one source is required');
  }

  const sources: SourceSpec[] = [];
  const errors: string[] = [];

  for (const spec of specs) {
    try {
      sources.push(parseSourceSpec(spec));
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
    }
  }

  if (errors.length > 0 && sources.length === 0) {
    throw new Error(`All sources failed to parse:\n${errors.join('\n')}`);
  }

  if (errors.length > 0) {
    console.warn(`Warning: ${errors.length} source(s) failed to parse:\n${errors.join('\n')}`);
  }

  return sources;
}

/**
 * Load sources from a JSON file.
 */
export async function loadSourcesFromFile(filePath: string): Promise<SourceSpec[]> {
  const { readFile } = await import('fs/promises');

  try {
    const content = await readFile(filePath, 'utf-8');
    const data: unknown = JSON.parse(content);

    // Support both array of strings and array of objects
    if (Array.isArray(data)) {
      const specs: SourceSpec[] = [];

      for (const item of data) {
        if (typeof item === 'string') {
          specs.push(parseSourceSpec(item));
        } else if (typeof item === 'object' && item !== null) {
          // Already a SourceSpec object
          validateSourceSpec(item);
          specs.push(item);
        } else {
          throw new Error(`Invalid source item: ${JSON.stringify(item)}`);
        }
      }

      return specs;
    }

    // Support object with sources array
    if (
      typeof data === 'object' &&
      data !== null &&
      'sources' in data &&
      Array.isArray((data as { sources: unknown }).sources)
    ) {
      const nestedSources = (data as { sources: unknown[] }).sources;
      const specs: SourceSpec[] = [];
      for (const item of nestedSources) {
        if (typeof item === 'string') {
          specs.push(parseSourceSpec(item));
        } else if (typeof item === 'object' && item !== null) {
          validateSourceSpec(item);
          specs.push(item);
        } else {
          throw new Error(`Invalid source item: ${JSON.stringify(item)}`);
        }
      }
      return specs;
    }

    throw new Error(
      `Invalid sources file format. Expected an array of source specs or an object with a "sources" array.`
    );
  } catch (error) {
    if (error instanceof Error && error.message.includes('ENOENT')) {
      throw new Error(`Sources file not found: ${filePath}`);
    }
    throw error;
  }
}

/**
 * Validate a SourceSpec object.
 */
function validateSourceSpec(spec: unknown): asserts spec is SourceSpec {
  if (typeof spec !== 'object' || spec === null) {
    throw new Error('Source spec must be an object');
  }

  const obj = spec as Record<string, unknown>;

  if (typeof obj.type !== 'string') {
    throw new Error('Source spec must have a "type" string');
  }

  if (!SOURCE_TYPES.includes(obj.type as SourceType)) {
    throw new Error(`Invalid source type: "${obj.type}"`);
  }

  if (typeof obj.target !== 'string' || obj.target.trim() === '') {
    throw new Error('Source spec must have a non-empty "target" string');
  }
}

/**
 * Format a source spec as a human-readable string.
 */
export function formatSourceSpec(source: SourceSpec): string {
  const parts: string[] = [source.type];
  if (source.subtype) {
    parts.push(`(${source.subtype})`);
  }
  parts.push(source.target);
  return parts.join(' ');
}

/**
 * Get a short identifier for a source (for file names, etc.).
 */
export function getSourceId(source: SourceSpec, index: number): string {
  switch (source.type) {
    case 'github': {
      // Extract owner/repo from target
      const match = source.target.match(/([^/]+\/[^/]+)/);
      if (match) {
        return `github-${match[1].replace('/', '-')}`;
      }
      return `github-${index}`;
    }
    case 'url': {
      try {
        const url = new URL(source.target);
        return `url-${url.hostname.replace(/\./g, '-')}`;
      } catch {
        return `url-${index}`;
      }
    }
    case 'confluence':
      return `confluence-${index}`;
    case 'notion':
      return `notion-${index}`;
    case 'file':
      return `file-${index}`;
    default:
      return `source-${index}`;
  }
}
