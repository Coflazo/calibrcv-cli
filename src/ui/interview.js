import { input } from '@inquirer/prompts';
import chalk from 'chalk';

/**
 * Run the enrichment interview in the terminal.
 * Prompts the user for each question, returns answers array.
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
      return { id: `q${i + 1}`, question: q, context: '', example_answer: '' };
    }
    return {
      id: q.id || `q${i + 1}`,
      question: q.question || q,
      context: q.context || '',
      example_answer: q.example_answer || '',
    };
  });

  if (skip) {
    return normalized.map(q => ({ question: q.question, answer: '' }));
  }

  console.log('');
  console.log(chalk.bold('  Enrichment Interview'));
  console.log(chalk.dim('  Answer these questions to improve your resume. Press Enter to skip any.'));
  console.log('');

  const answers = [];

  for (let i = 0; i < normalized.length; i++) {
    const q = normalized[i];

    if (q.context) {
      console.log(chalk.dim(`  [${q.context}]`));
    }

    const hint = q.example_answer
      ? chalk.dim(` (e.g. "${q.example_answer}")`)
      : '';

    const answer = await input({
      message: `${i + 1}/${normalized.length}  ${q.question}${hint}`,
      default: '',
    });

    answers.push({
      question: q.question,
      answer: answer.trim(),
    });
  }

  console.log('');
  return answers;
}
