import ora from 'ora';
import chalk from 'chalk';

const STAGE_MESSAGES = {
  parsing: 'Extracting resume content',
  analyzing: 'Analyzing your profile',
  enriching: 'Waiting for your answers',
  synthesizing: 'Rewriting with CalibrCV rules',
  tailoring: 'Tailoring for the target role',
  generating_latex: 'Engineering your layout',
  compiling: 'Compiling to PDF',
  trimming: 'Fitting to one page',
  checking_pages: 'Verifying page length',
  scoring: 'Calculating ATS compatibility',
  complete: 'Done',
  error: 'Error',
};

/**
 * Create a pipeline UI that renders progress via ora spinner.
 */
export function createPipelineUI() {
  const spinner = ora({
    text: 'Starting pipeline...',
    color: 'yellow',
  });
  spinner.start();

  return {
    onProgress({ state, message, progress }) {
      if (state === 'complete') {
        spinner.succeed(chalk.green('Your resume is ready.'));
        return;
      }

      if (state === 'error') {
        spinner.fail(chalk.red(message));
        return;
      }

      const label = STAGE_MESSAGES[state] || message;
      const pct = progress ? chalk.dim(` [${progress}%]`) : '';
      spinner.text = `${label}${pct}`;
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
