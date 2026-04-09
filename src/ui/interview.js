import { input } from '@inquirer/prompts';
import { brand, brandBold, warning, muted } from './theme.js';

/**
 * Run the enrichment interview in the terminal.
 * Prompts the user for each question with context, validation, and progress.
 *
 * @param {Array} questions - Follow-up questions from analysis.
 * @param {boolean} skip - If true, return empty answers.
 * @returns {Promise<Array<{question: string, answer: string}>>}
 */
export async function runInterview(questions, skip = false) {
  if (!questions || questions.length === 0) {
    return [];
  }

  // Normalize questions (API can return strings or objects)
  const normalized = questions.map((q, i) => {
    if (typeof q === 'string') {
      return { id: `q${i + 1}`, question: q, context: '', why_important: '', example_answer: '' };
    }
    return {
      id: q.id || `q${i + 1}`,
      question: q.question || q,
      context: q.context || '',
      why_important: q.why_important || '',
      example_answer: q.example_answer || '',
    };
  });

  if (skip) {
    return normalized.map(q => ({ question: q.question, answer: '' }));
  }

  const total = normalized.length;
  console.log('');
  console.log(brandBold('  Enrichment Interview'));
  console.log(muted(`  ${total} questions to strengthen your resume. Press Enter to skip any.`));
  console.log(muted('  Tip: Include numbers, tool names, and specific outcomes for the best results.'));
  console.log('');

  const answers = [];

  for (let i = 0; i < total; i++) {
    const q = normalized[i];
    const progress = muted(`[${i + 1}/${total}]`);

    // Show why this question matters
    if (q.why_important) {
      console.log(brand(`  ${progress} Why: ${q.why_important}`));
    }
    if (q.context) {
      console.log(muted(`  Section: ${q.context}`));
    }

    const hint = q.example_answer
      ? muted(` (e.g. "${q.example_answer}")`)
      : '';

    const answer = await input({
      message: `${progress}  ${q.question}${hint}`,
      default: '',
    });

    const trimmed = answer.trim();

    // Smart validation: warn on short answers
    if (trimmed && trimmed.length < 15 && trimmed.length > 0) {
      console.log(warning('  Tip: Longer answers with specifics (numbers, tools, outcomes) produce stronger bullets.'));
    }

    // Nudge for metrics if answer lacks numbers
    if (trimmed && trimmed.length > 10 && !/\d/.test(trimmed)) {
      console.log(muted('  Tip: Try adding a number (%, $, count, timeframe) to make this bullet quantifiable.'));
    }

    answers.push({
      question: q.question,
      answer: trimmed,
    });

    // Visual separator between questions
    if (i < total - 1) {
      console.log('');
    }
  }

  const answered = answers.filter(a => a.answer).length;
  console.log('');
  console.log(muted(`  Done. ${answered}/${total} questions answered.`));
  console.log('');
  return answers;
}
