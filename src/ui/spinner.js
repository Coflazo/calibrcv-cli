import ora from 'ora';
import { brand, brandBold, success, error, muted } from './theme.js';

const STAGES = [
  { key: 'parsing', label: 'Extracting resume content', num: 1 },
  { key: 'analyzing', label: 'Analyzing your profile', num: 2 },
  { key: 'enriching', label: 'Waiting for your answers', num: 3 },
  { key: 'synthesizing', label: 'Rewriting with CalibrCV rules', num: 4 },
  { key: 'tailoring', label: 'Tailoring for the target role', num: 5 },
  { key: 'generating_latex', label: 'Engineering your layout', num: 6 },
  { key: 'compiling', label: 'Compiling to PDF', num: 7 },
  { key: 'trimming', label: 'Fitting to one page', num: 7 },
  { key: 'checking_pages', label: 'Verifying page length', num: 7 },
  { key: 'scoring', label: 'Calculating ATS compatibility', num: 8 },
];

const STAGE_MAP = Object.fromEntries(STAGES.map(s => [s.key, s]));
const TOTAL_STAGES = 8;

/**
 * Create a pipeline UI that renders progress via ora spinner.
 */
export function createPipelineUI() {
  const spinner = ora({
    text: brand('Starting pipeline...'),
    color: 'yellow',
  });
  spinner.start();

  return {
    onProgress({ state, message, progress }) {
      if (state === 'complete') {
        spinner.succeed(success.bold(' Resume ready.'));
        return;
      }

      if (state === 'error') {
        spinner.fail(error(` ${message}`));
        return;
      }

      const stage = STAGE_MAP[state];
      const label = stage ? stage.label : message;
      const num = stage ? muted(`[${stage.num}/${TOTAL_STAGES}]`) : '';
      const pct = progress ? muted(` ${progress}%`) : '';
      spinner.text = `${num} ${brand(label)}${pct}`;
    },

    pause() {
      spinner.stop();
    },

    resume() {
      spinner.start();
    },

    stop() {
      if (spinner.isSpinning) {
        spinner.stop();
      }
    },
  };
}
