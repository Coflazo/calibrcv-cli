#!/usr/bin/env node

import { Command } from 'commander';
import chalk from 'chalk';
import { readFileSync, existsSync } from 'fs';
import { resolve, basename } from 'path';

import { loadConfig } from '../src/config.js';
import { configureProviders } from '../src/lib/ai-router.js';
import { ResumePipeline } from '../src/pipeline/orchestrator.js';
import { atsScorer } from '../src/lib/ats-scorer.js';
import { extractTextFromPDF } from '../src/lib/pdf-extractor.js';
import { createPipelineUI } from '../src/ui/spinner.js';
import { runInterview } from '../src/ui/interview.js';
import { printReport } from '../src/ui/report.js';
import { scrapeJobUrl } from '../src/lib/job-scraper.js';
import { parseResume } from '../src/lib/resume-parser.js';

const program = new Command();

program
  .name('calibrcv')
  .description('AI-powered resume optimizer. Runs in your terminal.')
  .version('1.0.0');

// ── BUILD command ─────────────────────────────────────────────

program
  .command('build')
  .description('Build an optimized resume from a PDF')
  .argument('<resume>', 'Path to your resume PDF')
  .option('-o, --output <path>', 'Output PDF path')
  .option('-s, --sector <sector>', 'Target sector (e.g. banking, consulting, technology)')
  .option('--job-url <url>', 'Job posting URL for tailoring')
  .option('--job-desc <text>', 'Job description: file path, URL, or inline text')
  .option('-p, --provider <name>', 'LLM provider (ollama, groq, gemini, openrouter, openai, anthropic)')
  .option('-m, --model <name>', 'Model name for any provider (e.g. gpt-4o, claude-sonnet-4-20250514, llama3.1)')
  .option('--skip-enrich', 'Skip the enrichment interview')
  .option('--vlm', 'Use Vision Language Model for PDF extraction')
  .option('--vlm-model <name>', 'VLM model name (default: qwen2-vl for Ollama)')
  .option('-v, --verbose', 'Verbose output')
  .action(async (resumePath, opts) => {
    try {
      const config = loadConfig(opts);
      // Set model env var for the appropriate provider
      if (config.model) {
        const p = config.provider;
        if (p === 'openai') process.env.OPENAI_MODEL = config.model;
        else if (p === 'anthropic') process.env.ANTHROPIC_MODEL = config.model;
        else if (p === 'groq') process.env.GROQ_MODEL = config.model;
        else if (p === 'gemini') process.env.GEMINI_MODEL = config.model;
        else if (p === 'openrouter') process.env.OPENROUTER_MODEL = config.model;
        else process.env.OLLAMA_MODEL = config.model;
      }
      configureProviders({ provider: config.provider });

      // Read the PDF
      const absPath = resolve(resumePath);
      if (!existsSync(absPath)) {
        console.error(chalk.red(`File not found: ${absPath}`));
        process.exit(1);
      }
      const pdfBuffer = readFileSync(absPath);

      // Output path
      const outputPath = config.output
        ? resolve(config.output)
        : resolve(basename(absPath, '.pdf') + '_calibrcv.pdf');

      // Job description (optional) — supports URL, file path, or inline text
      let jobDescription = null;
      if (config.jobUrl) {
        console.log(chalk.dim(`  Fetching job description from ${config.jobUrl}...`));
        try {
          const job = await scrapeJobUrl(config.jobUrl);
          jobDescription = `Title: ${job.title}\nCompany: ${job.company}\n\n${job.description}`;
          console.log(chalk.dim(`  Found: ${job.title} at ${job.company}`));
        } catch (err) {
          console.error(chalk.yellow(`  Could not scrape job URL: ${err.message}`));
        }
      } else if (config.jobDesc) {
        const jd = config.jobDesc;
        if (jd.startsWith('http://') || jd.startsWith('https://')) {
          // Auto-detect URL
          console.log(chalk.dim(`  Fetching job description from ${jd}...`));
          try {
            const job = await scrapeJobUrl(jd);
            jobDescription = `Title: ${job.title}\nCompany: ${job.company}\n\n${job.description}`;
            console.log(chalk.dim(`  Found: ${job.title} at ${job.company}`));
          } catch (err) {
            console.error(chalk.yellow(`  Could not scrape job URL: ${err.message}`));
          }
        } else if (existsSync(resolve(jd))) {
          // File path
          jobDescription = readFileSync(resolve(jd), 'utf-8');
        } else {
          // Inline text
          jobDescription = jd;
        }
      }

      console.log('');
      console.log(chalk.bold('  CalibrCV'));
      console.log(chalk.dim(`  ${basename(absPath)} -> ${basename(outputPath)}`));
      console.log('');

      const pipeline = new ResumePipeline();
      const ui = createPipelineUI();

      pipeline.on('progress', (event) => ui.onProgress(event));

      // Phase 1: Analyze (may pause for enrichment)
      const phase1 = await pipeline.run({
        pdfBuffer,
        targetSector: config.sector,
        jobDescription,
        outputPath,
        vlm: config.vlm,
        vlmModel: config.vlmModel,
      });

      if (phase1.requiresEnrichment) {
        ui.pause();

        const answers = await runInterview(phase1.questions, config.skipEnrich);

        ui.resume();

        // Phase 2: Resume pipeline with answers
        const result = await pipeline.run({
          pdfBuffer,
          targetSector: config.sector,
          enrichmentAnswers: answers,
          resumeText: phase1.resumeText,
          analysis: phase1.analysis,
          jobDescription,
          outputPath,
        });

        ui.stop();
        printReport(result.atsBreakdown);

        if (result.pdfBuffer) {
          console.log(chalk.green(`  PDF saved to ${outputPath}`));
          console.log(chalk.dim(`  LaTeX source saved to ${outputPath.replace(/\.pdf$/i, '.tex')}`));
        } else {
          console.log(chalk.yellow('  No PDF generated (LaTeX compiler not found).'));
          console.log(chalk.dim(`  LaTeX source saved to ${outputPath.replace(/\.pdf$/i, '.tex')}`));
        }
      }

    } catch (err) {
      console.error(chalk.red(`\n  Error: ${err.message}`));
      if (err.errors) {
        for (const e of err.errors) {
          console.error(chalk.dim(`    ${e.provider}: ${e.error}`));
        }
      }
      process.exit(1);
    }
  });

// ── SCORE command ─────────────────────────────────────────────

program
  .command('score')
  .description('Run ATS scoring on a resume PDF (no AI needed)')
  .argument('<resume>', 'Path to your resume PDF')
  .option('--job-desc <text>', 'Job description: file path, URL, or inline text')
  .option('--job-url <url>', 'Job posting URL for keyword matching')
  .action(async (resumePath, opts) => {
    try {
      const absPath = resolve(resumePath);
      if (!existsSync(absPath)) {
        console.error(chalk.red(`File not found: ${absPath}`));
        process.exit(1);
      }

      const pdfBuffer = readFileSync(absPath);
      const { text } = await extractTextFromPDF(pdfBuffer);

      let jobDescription = null;
      if (opts.jobUrl) {
        try {
          const job = await scrapeJobUrl(opts.jobUrl);
          jobDescription = job.description;
        } catch (_) { /* ignore */ }
      } else if (opts.jobDesc) {
        const jd = opts.jobDesc;
        if (jd.startsWith('http://') || jd.startsWith('https://')) {
          try {
            const job = await scrapeJobUrl(jd);
            jobDescription = job.description;
          } catch (_) { /* ignore */ }
        } else if (existsSync(resolve(jd))) {
          jobDescription = readFileSync(resolve(jd), 'utf-8');
        } else {
          jobDescription = jd;
        }
      }

      // Parse resume text into structured JSON for scoring
      const resumeJSON = parseResume(text);

      const report = atsScorer.score(text, resumeJSON, jobDescription);
      printReport(report);

    } catch (err) {
      console.error(chalk.red(`\n  Error: ${err.message}`));
      process.exit(1);
    }
  });

program.parse();
