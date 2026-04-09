import { buildTrimPrompt } from '../prompts/trim.js';
import { validateLatex } from './latex-escape.js';

const MAX_ITERATIONS = 6;

/**
 * Agentic 1-page enforcement loop.
 * Compiles LaTeX, checks page count, iteratively trims until it fits on 1 page.
 *
 * @param {string} latexCode - Initial LaTeX source.
 * @param {string} targetSector - Target industry sector.
 * @param {Function} callAI - The AI router function.
 * @param {Function} compileFn - LaTeX compilation function.
 * @param {Function} [onProgress] - Optional progress callback.
 * @returns {Promise<{ latexCode: string, pdfBuffer: Buffer|null, pageCount: number, iterations: number, warning?: string }>}
 */
export async function enforceOnePage(latexCode, targetSector, callAI, compileFn, onProgress = null) {
  let currentLatex = latexCode;
  let lastResult = null;

  for (let iteration = 0; iteration <= MAX_ITERATIONS; iteration++) {
    if (onProgress) {
      onProgress({ iteration, pageCount: null, stage: 'compiling' });
    }

    const result = await compileFn(currentLatex);
    lastResult = result;

    if (!result.pdfBuffer) {
      return {
        latexCode: currentLatex,
        pdfBuffer: null,
        pageCount: 0,
        iterations: iteration,
        warning: `Compilation failed: ${result.error}`,
      };
    }

    if (onProgress) {
      onProgress({ iteration, pageCount: result.pageCount, stage: 'checking' });
    }

    if (result.pageCount === 1) {
      return {
        latexCode: currentLatex,
        pdfBuffer: result.pdfBuffer,
        pageCount: 1,
        iterations: iteration,
      };
    }

    if (iteration >= MAX_ITERATIONS) {
      return {
        latexCode: currentLatex,
        pdfBuffer: result.pdfBuffer,
        pageCount: result.pageCount,
        iterations: iteration,
        warning: `Could not fit to 1 page after ${MAX_ITERATIONS} attempts. Current: ${result.pageCount} pages`,
      };
    }

    if (onProgress) {
      onProgress({ iteration: iteration + 1, pageCount: result.pageCount, stage: 'trimming' });
    }

    try {
      let trimmedLatex = await callAI(
        buildTrimPrompt(targetSector, result.pageCount, iteration + 1),
        `Current LaTeX:\n${currentLatex}`,
        { responseFormat: 'text', taskName: `trim-iteration-${iteration + 1}` }
      );

      let cleaned = trimmedLatex.trim();
      if (cleaned.startsWith('```')) {
        cleaned = cleaned
          .replace(/^```(?:latex|tex)?\n?/m, '')
          .replace(/\n?```$/m, '')
          .trim();
      }

      const validation = validateLatex(cleaned);
      if (!validation.valid) {
        continue;
      }

      currentLatex = cleaned;
    } catch (_) {
      // Continue with the current version
    }
  }

  return {
    latexCode: currentLatex,
    pdfBuffer: lastResult?.pdfBuffer || null,
    pageCount: lastResult?.pageCount || 0,
    iterations: MAX_ITERATIONS,
    warning: 'Exhausted all trim iterations',
  };
}
