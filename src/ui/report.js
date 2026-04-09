import chalk from 'chalk';

/**
 * Print the ATS score report to the terminal.
 * @param {object} report - ATS score report from atsScorer.score()
 */
export function printReport(report) {
  console.log('');
  console.log(chalk.bold('  ATS Score Report'));
  console.log('  ' + chalk.dim('─'.repeat(50)));

  // Score + grade
  const scoreColor = report.total >= 80 ? chalk.green
    : report.total >= 60 ? chalk.yellow
    : chalk.red;

  const grade = report.letter_grade;
  console.log('');
  console.log(`  ${scoreColor.bold(`  ${report.total}`)}  ${chalk.dim('/ 100')}  ${chalk.bold(grade.grade)} ${chalk.dim(grade.label)}`);
  console.log('');

  // Category breakdown
  console.log(chalk.bold('  Categories'));
  const cats = report.categories;
  for (const [key, cat] of Object.entries(cats)) {
    const pct = Math.round((cat.score / cat.max) * 100);
    const bar = renderBar(cat.score, cat.max, 20);
    const score = `${String(cat.score).padStart(2)}/${cat.max}`;
    console.log(`  ${chalk.dim(score)}  ${bar}  ${cat.label}`);
  }

  // Law violations
  if (report.calibrcv_law_violations?.length > 0) {
    console.log('');
    console.log(chalk.bold('  Law Violations'));
    for (const v of report.calibrcv_law_violations.slice(0, 5)) {
      console.log(`  ${chalk.yellow('!')} ${v}`);
    }
    if (report.calibrcv_law_violations.length > 5) {
      console.log(chalk.dim(`  ... and ${report.calibrcv_law_violations.length - 5} more`));
    }
  }

  // Recommendations
  if (report.recommendations?.length > 0) {
    console.log('');
    console.log(chalk.bold('  Recommendations'));
    report.recommendations.forEach((rec, i) => {
      console.log(`  ${chalk.dim(`${i + 1}.`)} ${rec}`);
    });
  }

  // Missing keywords
  const keywords = cats.keywords;
  if (keywords?.missing_keywords?.length > 0) {
    console.log('');
    console.log(chalk.bold('  Missing Keywords'));
    console.log(`  ${keywords.missing_keywords.map(k => chalk.dim(`[${k}]`)).join(' ')}`);
  }

  console.log('');
  console.log('  ' + chalk.dim('─'.repeat(50)));
  console.log('');
}

function renderBar(value, max, width) {
  const filled = Math.round((value / max) * width);
  const empty = width - filled;
  const color = (value / max) >= 0.8 ? chalk.green
    : (value / max) >= 0.6 ? chalk.yellow
    : chalk.red;
  return color('█'.repeat(filled)) + chalk.dim('░'.repeat(empty));
}
