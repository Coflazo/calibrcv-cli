import {
  brand, brandBold, success, warning, muted, subtle,
  steppedBar, drawBox, scoreColor, gradeLabel,
} from './theme.js';

/**
 * Print the ATS Score Report to the terminal.
 */
export function printReport(report) {
  if (!report) return;

  const { grade, label } = gradeLabel(report.total);
  const color = scoreColor(report.total);
  const scoreStr = color.bold(String(report.total).padStart(3));

  const lines = [];
  lines.push(brandBold('ATS SCORE REPORT'));
  lines.push('');
  lines.push(`  ${scoreStr} ${muted('/ 100')}   ${color.bold(grade)}  ${color(label)}`);
  lines.push('');

  // Category breakdown (object with named keys)
  if (report.categories) {
    for (const [, cat] of Object.entries(report.categories)) {
      const score = String(cat.score).padStart(2);
      const max = String(cat.max).padStart(2);
      const bar = steppedBar(cat.score, cat.max);
      const name = muted(cat.label || cat.name);
      lines.push(`  ${score}/${max}  ${bar}  ${name}`);
    }
    lines.push('');
  }

  // Law violations
  const violations = report.calibrcv_law_violations || report.violations || [];
  if (violations.length > 0) {
    lines.push(brandBold('LAW VIOLATIONS'));
    const shown = violations.slice(0, 5);
    for (const v of shown) {
      lines.push(`  ${warning('!')} ${v}`);
    }
    if (violations.length > 5) {
      lines.push(muted(`  ... and ${violations.length - 5} more`));
    }
    lines.push('');
  }

  // Recommendations
  if (report.recommendations && report.recommendations.length > 0) {
    lines.push(brandBold('RECOMMENDATIONS'));
    for (let i = 0; i < report.recommendations.length; i++) {
      lines.push(`  ${muted(`${i + 1}.`)} ${report.recommendations[i]}`);
    }
    lines.push('');
  }

  // Missing keywords
  if (report.missingKeywords && report.missingKeywords.length > 0) {
    lines.push(brandBold('MISSING KEYWORDS'));
    const kw = report.missingKeywords.map(k => subtle(`[${k}]`)).join(' ');
    lines.push(`  ${kw}`);
    lines.push('');
  }

  console.log('');
  console.log(drawBox(lines));
  console.log('');
}
