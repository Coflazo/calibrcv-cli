import { callOllama } from '../providers/ollama.js';
import { callGroq } from '../providers/groq.js';
import { callGemini } from '../providers/gemini.js';
import { callOpenRouter } from '../providers/openrouter.js';

export class AllProvidersFailedError extends Error {
  constructor(errors) {
    super('All AI providers exhausted');
    this.name = 'AllProvidersFailedError';
    this.errors = errors;
  }
}

export class ParseError extends Error {
  constructor(rawText) {
    super('Failed to parse AI response as JSON');
    this.name = 'ParseError';
    this.rawText = rawText;
  }
}

let activeProviders = null;

/**
 * Configure which providers are active and in what order.
 * @param {{ provider?: string }} options - CLI options
 */
export function configureProviders(options = {}) {
  const forced = options.provider;

  if (forced) {
    const map = { ollama: callOllama, groq: callGroq, gemini: callGemini, openrouter: callOpenRouter };
    if (!map[forced]) {
      throw new Error(`Unknown provider: ${forced}. Use: ollama, groq, gemini, openrouter`);
    }
    activeProviders = [{ name: forced, fn: map[forced] }];
    return;
  }

  // Auto-detect: build waterfall from available providers
  const providers = [];

  providers.push({ name: 'ollama', fn: callOllama });

  if (process.env.GROQ_API_KEY) {
    providers.push({ name: 'groq', fn: callGroq });
  }
  if (process.env.GEMINI_API_KEY) {
    providers.push({ name: 'gemini', fn: callGemini });
  }
  if (process.env.OPENROUTER_API_KEY) {
    providers.push({ name: 'openrouter', fn: callOpenRouter });
  }

  activeProviders = providers;
}

/**
 * Route an AI call through the provider waterfall.
 * @param {string} systemPrompt
 * @param {string} userMessage
 * @param {object} options - { responseFormat: 'json'|'text', taskName: string }
 * @returns {Promise<string>}
 */
export async function callAI(systemPrompt, userMessage, options = {}) {
  if (!activeProviders) {
    configureProviders();
  }

  const errors = [];

  for (const p of activeProviders) {
    try {
      return await p.fn(systemPrompt, userMessage, options);
    } catch (err) {
      errors.push({ provider: p.name, error: err.message });
    }
  }

  throw new AllProvidersFailedError(errors);
}

/**
 * Parse text as JSON with multiple fallback strategies.
 * @param {string} text
 * @returns {object}
 */
export function parseJSONSafely(text) {
  if (!text || typeof text !== 'string') {
    throw new ParseError(text);
  }

  // Attempt 1: Direct parse
  try { return JSON.parse(text); } catch (_) { /* continue */ }

  // Attempt 2: Strip markdown code fences
  const stripped = text
    .replace(/^```(?:json)?\n?/m, '')
    .replace(/\n?```$/m, '')
    .trim();
  try { return JSON.parse(stripped); } catch (_) { /* continue */ }

  // Attempt 3: Extract first {...} block
  const objMatch = stripped.match(/\{[\s\S]*\}/);
  if (objMatch) {
    try { return JSON.parse(objMatch[0]); } catch (_) { /* continue */ }
  }

  // Attempt 4: Extract first [...] block
  const arrMatch = stripped.match(/\[[\s\S]*\]/);
  if (arrMatch) {
    try { return JSON.parse(arrMatch[0]); } catch (_) { /* continue */ }
  }

  // Attempt 5: Remove trailing commas
  const noTrailingCommas = stripped
    .replace(/,\s*}/g, '}')
    .replace(/,\s*]/g, ']');
  const objMatch2 = noTrailingCommas.match(/\{[\s\S]*\}/);
  if (objMatch2) {
    try { return JSON.parse(objMatch2[0]); } catch (_) { /* continue */ }
  }

  throw new ParseError(text);
}
