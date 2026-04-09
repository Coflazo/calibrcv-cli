import {
  brand, brandBold, success, warning, muted, subtle,
  steppedBar, drawBox, scoreColor, gradeLabel, wrapText,
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
  lines.push(brandBold('\u2501\u2501 ATS SCORE REPORT \u2501\u2501'));
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
    lines.push(muted('  \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500'));
  }

  // Law violations
  const violations = report.calibrcv_law_violations || report.violations || [];
  if (violations.length > 0) {
    lines.push(brandBold('LAW VIOLATIONS'));
    const shown = violations.slice(0, 5);
    for (const v of shown) {
      const wrapped = wrapText(v, 62, '    ');
      lines.push(`  ${warning('\u26A0')} ${wrapped[0]}`);
      for (let j = 1; j < wrapped.length; j++) lines.push(`    ${wrapped[j]}`);
    }
    if (violations.length > 5) {
      lines.push(muted(`  ... and ${violations.length - 5} more`));
    }
    lines.push('');
    lines.push(muted('  \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500'));
  }

  // Recommendations
  if (report.recommendations && report.recommendations.length > 0) {
    lines.push(brandBold('RECOMMENDATIONS'));
    for (let i = 0; i < report.recommendations.length; i++) {
      const rec = report.recommendations[i];
      const wrapped = wrapText(rec, 60, '     ');
      lines.push(`  ${brand(`${i + 1}.`)} ${wrapped[0]}`);
      for (let j = 1; j < wrapped.length; j++) lines.push(`     ${wrapped[j]}`);
    }
    lines.push('');
  }

  // Missing keywords
  const missingKw = report.categories?.keywords?.missing_keywords || [];
  if (missingKw.length > 0) {
    lines.push(brandBold('MISSING KEYWORDS'));
    const kw = missingKw.map(k => subtle(`[${k}]`)).join(' ');
    lines.push(`  ${kw}`);
    lines.push('');
  }

  console.log('');
  console.log(drawBox(lines));
  console.log('');
}
