import { config as loadDotenv } from 'dotenv';
import { existsSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

/**
 * Load configuration from .env files and CLI options.
 * Priority: CLI flags > env vars > .env in CWD > ~/.calibrcv/.env > defaults
 *
 * @param {object} cliOptions - Options from commander
 * @returns {object} Merged configuration
 */
export function loadConfig(cliOptions = {}) {
  // Load .env files (lowest priority first, higher priority overrides)
  const homeEnv = join(homedir(), '.calibrcv', '.env');
  if (existsSync(homeEnv)) {
    loadDotenv({ path: homeEnv, override: false, quiet: true });
  }
  loadDotenv({ override: false, quiet: true }); // CWD .env

  return {
    provider: cliOptions.provider || null,
    model: cliOptions.model || process.env.OLLAMA_MODEL || 'llama3.1',
    sector: cliOptions.sector || 'General',
    output: cliOptions.output || null,
    jobUrl: cliOptions.jobUrl || null,
    jobDesc: cliOptions.jobDesc || null,
    skipEnrich: cliOptions.skipEnrich || false,
    verbose: cliOptions.verbose || false,
  };
}
