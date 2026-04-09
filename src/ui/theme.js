import chalk from 'chalk';

// Brand colors from DESIGN.md
export const brand = chalk.hex('#D4621A');
export const brandBold = chalk.hex('#D4621A').bold;
export const success = chalk.hex('#4CAF50');
export const warning = chalk.hex('#E6A817');
export const error = chalk.hex('#D32F2F');
export const muted = chalk.dim;
export const subtle = chalk.gray;

// Box-drawing characters
export const BOX = {
  tl: '\u250C', tr: '\u2510', bl: '\u2514', br: '\u2518',
  h: '\u2500', v: '\u2502',
};

/**
 * Stepped progress bar (10 blocks, per DESIGN.md "Calibrator" spec).
 */
export function steppedBar(value, max, width = 10) {
  const filled = Math.round((value / max) * width);
  const empty = width - filled;
  const ratio = value / max;
  const color = ratio >= 0.8 ? success : ratio >= 0.6 ? warning : error;
  return color('\u2588'.repeat(filled)) + subtle('\u2591'.repeat(empty));
}

/**
 * Strip ANSI escape codes from a string.
 */
function stripAnsi(str) {
  return chalk.unstyle ? chalk.unstyle(str) : str.replace(/\x1b\[[0-9;]*m/g, '');
}

/**
 * Word-wrap text to fit within maxWidth visible characters.
 * Returns an array of lines. Preserves leading whitespace on first line.
 */
export function wrapText(text, maxWidth, indent = '') {
  const visible = stripAnsi(text);
  if (visible.length <= maxWidth) return [text];
  const words = visible.split(/\s+/);
  const lines = [];
  let current = '';
  for (const word of words) {
    const test = current ? `${current} ${word}` : word;
    if (test.length > maxWidth && current) {
      lines.push(current);
      current = word;
    } else {
      current = test;
    }
  }
  if (current) lines.push(current);
  return lines.map((l, i) => (i === 0 ? l : `${indent}${l}`));
}

/**
 * Draw a box around lines of text (auto-sizes to content, max 80 cols).
 */
export function drawBox(lines, width = 0) {
  const maxCols = Math.min(process.stdout.columns || 80, 80);
  const wrapWidth = (width || maxCols) - 6;

  // Wrap all lines and flatten
  const wrapped = [];
  for (const line of lines) {
    const parts = wrapText(line, wrapWidth, '    ');
    wrapped.push(...parts);
  }

  // Compute actual box width from content
  let maxLen = 0;
  for (const line of wrapped) {
    const len = stripAnsi(line).length;
    if (len > maxLen) maxLen = len;
  }
  const inner = Math.max(maxLen, 20);

  const out = [];
  out.push(muted(`  ${BOX.tl}${BOX.h.repeat(inner + 2)}${BOX.tr}`));
  for (const line of wrapped) {
    const stripped = stripAnsi(line);
    const pad = Math.max(0, inner - stripped.length);
    out.push(muted(`  ${BOX.v}`) + ` ${line}${' '.repeat(pad)} ` + muted(BOX.v));
  }
  out.push(muted(`  ${BOX.bl}${BOX.h.repeat(inner + 2)}${BOX.br}`));
  return out.join('\n');
}

/**
 * Score color based on value.
 */
export function scoreColor(score) {
  if (score >= 80) return success;
  if (score >= 60) return warning;
  return error;
}

/**
 * Grade label from score.
 */
export function gradeLabel(score) {
  if (score >= 95) return { grade: 'A+', label: 'Exceptional' };
  if (score >= 90) return { grade: 'A', label: 'Excellent' };
  if (score >= 85) return { grade: 'A-', label: 'Very Good' };
  if (score >= 80) return { grade: 'B+', label: 'Good' };
  if (score >= 75) return { grade: 'B', label: 'Solid' };
  if (score >= 70) return { grade: 'B-', label: 'Above Average' };
  if (score >= 60) return { grade: 'C', label: 'Needs Work' };
  return { grade: 'D', label: 'Major Issues' };
}
