/**
 * Escape special LaTeX characters in text content.
 * @param {string} text - Raw text to escape.
 * @returns {string} LaTeX-safe text.
 */
export function escapeLatex(text) {
  if (!text || typeof text !== 'string') return '';

  return text
    .replace(/\\/g, '\\textbackslash{}')
    .replace(/&/g, '\\&')
    .replace(/%/g, '\\%')
    .replace(/\$/g, '\\$')
    .replace(/#/g, '\\#')
    .replace(/_/g, '\\_')
    .replace(/\{/g, '\\{')
    .replace(/\}/g, '\\}')
    .replace(/~/g, '\\textasciitilde{}')
    .replace(/\^/g, '\\textasciicircum{}')
    .replace(/>/g, '$>$')
    .replace(/</g, '$<$')
    .replace(/—/g, ';')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"');
}

/**
 * Validate that a LaTeX source string is structurally valid.
 * @param {string} latexSource
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validateLatex(latexSource) {
  const errors = [];

  if (!latexSource || typeof latexSource !== 'string') {
    return { valid: false, errors: ['LaTeX source is empty or not a string'] };
  }

  const trimmed = latexSource.trim();

  if (!trimmed.startsWith('\\documentclass')) {
    errors.push('Missing \\documentclass at start');
  }
  if (!trimmed.endsWith('\\end{document}')) {
    errors.push('Missing \\end{document} at end');
  }
  if (!trimmed.includes('\\begin{document}')) {
    errors.push('Missing \\begin{document}');
  }
  if (!trimmed.includes('\\pdfgentounicode=1')) {
    errors.push('Missing \\pdfgentounicode=1');
  }
  if (/—/.test(trimmed)) {
    errors.push('Contains em dashes which break LaTeX compilation');
  }

  return { valid: errors.length === 0, errors };
}
