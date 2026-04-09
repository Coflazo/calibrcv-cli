import EventEmitter from 'events';
import { callAI, parseJSONSafely } from '../lib/ai-router.js';
import { extractTextFromPDF } from '../lib/pdf-extractor.js';
import { extractWithVLM } from '../lib/vlm-extractor.js';
import { buildAnalyzePrompt } from '../prompts/analyze.js';
import { buildSynthesizePrompt } from '../prompts/synthesize.js';
import { buildLatexPrompt } from '../prompts/latex.js';
import { buildTailorPrompt } from '../prompts/tailor.js';
import { enforceOnePage } from '../lib/page-loop.js';
import { compileLaTeX } from '../lib/latex-compiler.js';
import { atsScorer } from '../lib/ats-scorer.js';
import { writeFileSync } from 'fs';
import { dirname, join } from 'path';

/**
 * ResumePipeline: orchestrates the full resume build.
 * Refactored for CLI: no Supabase, no SSE, writes to local disk.
 */
export class ResumePipeline extends EventEmitter {

  constructor() {
    super();
    this.state = 'idle';
  }

  setState(state, message, progress) {
    this.state = state;
    this.emit('progress', { state, message, progress });
  }

  /**
   * Run the full resume build pipeline.
   *
   * @param {object} params
   * @param {Buffer} params.pdfBuffer - Raw PDF file bytes.
   * @param {string} params.targetSector - Target industry sector.
   * @param {Array|null} [params.enrichmentAnswers] - Answers from enrichment interview.
   * @param {string|null} [params.resumeText] - Pre-extracted resume text.
   * @param {object|null} [params.analysis] - Pre-computed analysis.
   * @param {string|null} [params.jobDescription] - Job description text for tailoring.
   * @param {string|null} [params.outputPath] - Where to write the PDF.
   * @returns {Promise<object>}
   */
  async run({
    pdfBuffer,
    targetSector,
    enrichmentAnswers = null,
    resumeText = null,
    analysis = null,
    jobDescription = null,
    outputPath = null,
    vlm = false,
    vlmModel = null,
  }) {
    try {
      // STAGE 1: Parse PDF
      let text = resumeText;
      if (!text) {
        this.setState('parsing', 'Extracting resume content...', 5);

        if (vlm) {
          // VLM extraction requested explicitly
          this.setState('parsing', 'Extracting with vision model...', 5);
          const vlmResult = await extractWithVLM(pdfBuffer, { vlmModel });
          text = vlmResult.text;
        } else {
          const extracted = await extractTextFromPDF(pdfBuffer);
          if (extracted.isImageBased) {
            // Auto-fallback to VLM for image-based PDFs
            this.setState('parsing', 'Image-based PDF detected, using vision model...', 5);
            const vlmResult = await extractWithVLM(pdfBuffer, { vlmModel });
            text = vlmResult.text;
          } else {
            text = extracted.text;
          }
        }
      }

      // STAGE 2: Analyze
      let analysisResult = analysis;
      if (!analysisResult) {
        this.setState('analyzing', 'Analyzing your profile...', 15);
        const raw = await callAI(
          buildAnalyzePrompt(targetSector),
          `Resume text:\n${text}`,
          { responseFormat: 'json', taskName: 'analyze' }
        );
        analysisResult = parseJSONSafely(raw);
      }

      // STAGE 3: Enrichment Gate
      if (!enrichmentAnswers) {
        this.setState('enriching', 'Waiting for your answers...', 25);
        return {
          requiresEnrichment: true,
          questions: analysisResult.follow_up_questions,
          analysis: analysisResult,
          resumeText: text,
        };
      }

      // STAGE 4: Synthesize Content
      this.setState('synthesizing', 'Rewriting with CalibrCV rules...', 45);
      const enrichmentContext = enrichmentAnswers
        .map(a => `Q: ${a.question}\nA: ${a.answer}`)
        .join('\n\n');

      const synthesisRaw = await callAI(
        buildSynthesizePrompt(targetSector),
        `Original resume:\n${text}\n\nEnrichment answers:\n${enrichmentContext}`,
        { responseFormat: 'json', taskName: 'synthesize' }
      );
      let resumeJSON = parseJSONSafely(synthesisRaw);

      // STAGE 4b: Tailor (optional)
      if (jobDescription) {
        this.setState('tailoring', 'Tailoring for the target role...', 50);
        const tailorRaw = await callAI(
          buildTailorPrompt(
            resumeJSON.experience?.[0]?.title || 'Target Role',
            'Target Company'
          ),
          `Master resume JSON:\n${JSON.stringify(resumeJSON, null, 2)}\n\nJob description:\n${jobDescription}`,
          { responseFormat: 'json', taskName: 'tailor' }
        );
        resumeJSON = parseJSONSafely(tailorRaw);
      }

      // STAGE 5: Generate LaTeX
      this.setState('generating_latex', 'Engineering your layout...', 60);
      let latexRaw = await callAI(
        buildLatexPrompt(),
        `Resume JSON:\n${JSON.stringify(resumeJSON, null, 2)}`,
        { responseFormat: 'text', taskName: 'generate-latex' }
      );

      if (latexRaw.trim().startsWith('```')) {
        latexRaw = latexRaw
          .replace(/^```(?:latex|tex)?\n?/m, '')
          .replace(/\n?```$/m, '')
          .trim();
      }

      if (!latexRaw.trim().startsWith('\\documentclass')) {
        latexRaw = await callAI(
          buildLatexPrompt(),
          `IMPORTANT: Return ONLY raw LaTeX starting with \\documentclass.\n\nResume JSON:\n${JSON.stringify(resumeJSON, null, 2)}`,
          { responseFormat: 'text', taskName: 'generate-latex-retry' }
        );
        if (latexRaw.trim().startsWith('```')) {
          latexRaw = latexRaw
            .replace(/^```(?:latex|tex)?\n?/m, '')
            .replace(/\n?```$/m, '')
            .trim();
        }
        if (!latexRaw.trim().startsWith('\\documentclass')) {
          throw new Error('AI returned invalid LaTeX after 2 attempts');
        }
      }

      // STAGE 6+7: Compile + 1-page Enforcement
      this.setState('compiling', 'Compiling to PDF...', 70);
      const { latexCode, pdfBuffer: compiledPDF, pageCount, iterations, warning } =
        await enforceOnePage(
          latexRaw,
          targetSector,
          callAI,
          compileLaTeX,
          (progress) => {
            if (progress.stage === 'trimming') {
              this.setState('trimming',
                `Fitting to one page (attempt ${progress.iteration}/6)...`,
                70 + (progress.iteration * 3));
            } else if (progress.stage === 'checking') {
              this.setState('checking_pages', 'Verifying page length...', 75);
            }
          }
        );

      // STAGE 8: ATS Scoring
      this.setState('scoring', 'Calculating ATS compatibility...', 90);
      const atsReport = atsScorer.score(text, resumeJSON, jobDescription);

      // STAGE 9: Write to disk
      if (outputPath && compiledPDF) {
        writeFileSync(outputPath, compiledPDF);
      }

      // Always save .tex source alongside
      if (outputPath) {
        const texPath = outputPath.replace(/\.pdf$/i, '.tex');
        writeFileSync(texPath, latexCode, 'utf-8');
      }

      this.setState('complete', 'Your resume is ready.', 100);

      return {
        success: true,
        atsScore: atsReport.total,
        atsBreakdown: atsReport,
        resumeJSON,
        latexCode,
        pdfBuffer: compiledPDF,
        pageCount,
        trimIterations: iterations,
        warning: warning || null,
        outputPath,
      };

    } catch (error) {
      this.setState('error', `Something went wrong: ${error.message}`, 0);
      throw error;
    }
  }
}
