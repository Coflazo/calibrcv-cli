import { PDFDocument } from 'pdf-lib';
import { execSync } from 'child_process';
import { writeFileSync, readFileSync, existsSync, mkdirSync, unlinkSync } from 'fs';
import { join } from 'path';
import { randomUUID } from 'crypto';
import { validateLatex } from './latex-escape.js';

/**
 * Compile LaTeX source to PDF.
 * Tries: tectonic -> pdflatex -> latexmk+xelatex -> fallback (source only).
 *
 * @param {string} latexSource - Complete LaTeX document source.
 * @returns {Promise<{ pdfBuffer: Buffer|null, pageCount: number, compilationMethod: string, latexSource: string, error?: string }>}
 */
export async function compileLaTeX(latexSource) {
  const validation = validateLatex(latexSource);
  if (!validation.valid) {
    return {
      pdfBuffer: null,
      pageCount: 0,
      compilationMethod: 'none',
      latexSource,
      error: `LaTeX validation failed: ${validation.errors.join('; ')}`,
    };
  }

  const jobId = randomUUID().slice(0, 8);
  const tmpDir = join('/tmp', `calibrcv-${jobId}`);
  const env = { ...process.env, PATH: `${process.env.PATH}:/Library/TeX/texbin:/usr/local/bin` };

  try {
    if (!existsSync(tmpDir)) {
      mkdirSync(tmpDir, { recursive: true });
    }

    const texPath = join(tmpDir, 'resume.tex');
    const pdfPath = join(tmpDir, 'resume.pdf');
    writeFileSync(texPath, latexSource, 'utf-8');

    // Strategy 1: tectonic
    try {
      execSync(`tectonic "${texPath}" --outdir "${tmpDir}" 2>&1`, {
        timeout: 30000, stdio: 'pipe', env,
      });
      if (existsSync(pdfPath)) {
        const pdfBuffer = readFileSync(pdfPath);
        const pageCount = await countPages(pdfBuffer);
        cleanup(tmpDir);
        return { pdfBuffer, pageCount, compilationMethod: 'tectonic', latexSource };
      }
    } catch (_) { /* try next */ }

    // Strategy 2: pdflatex
    try {
      execSync(
        `cd "${tmpDir}" && pdflatex -interaction=nonstopmode -halt-on-error resume.tex 2>&1`,
        { timeout: 30000, stdio: 'pipe', env }
      );
      if (existsSync(pdfPath)) {
        const pdfBuffer = readFileSync(pdfPath);
        const pageCount = await countPages(pdfBuffer);
        cleanup(tmpDir);
        return { pdfBuffer, pageCount, compilationMethod: 'pdflatex', latexSource };
      }
    } catch (_) { /* try next */ }

    // Strategy 3: latexmk + xelatex
    try {
      execSync(
        `cd "${tmpDir}" && latexmk -xelatex -interaction=nonstopmode -halt-on-error resume.tex 2>&1`,
        { timeout: 45000, stdio: 'pipe', env }
      );
      if (existsSync(pdfPath)) {
        const pdfBuffer = readFileSync(pdfPath);
        const pageCount = await countPages(pdfBuffer);
        cleanup(tmpDir);
        return { pdfBuffer, pageCount, compilationMethod: 'xelatex', latexSource };
      }
    } catch (_) { /* try next */ }

    // Strategy 4: Fallback
    cleanup(tmpDir);
    return {
      pdfBuffer: null,
      pageCount: 0,
      compilationMethod: 'none',
      latexSource,
      error: 'No LaTeX compiler found. Install tectonic (brew install tectonic) or texlive. Your .tex source has been saved.',
    };

  } catch (err) {
    cleanup(tmpDir);
    return {
      pdfBuffer: null,
      pageCount: 0,
      compilationMethod: 'none',
      latexSource,
      error: `Compilation error: ${err.message}`,
    };
  }
}

/**
 * Count pages in a PDF buffer.
 */
export async function countPages(pdfBuffer) {
  try {
    const pdfDoc = await PDFDocument.load(pdfBuffer);
    return pdfDoc.getPageCount();
  } catch (_) {
    return 1;
  }
}

function cleanup(dirPath) {
  try {
    const files = ['resume.tex', 'resume.pdf', 'resume.aux', 'resume.log',
                   'resume.out', 'resume.fls', 'resume.fdb_latexmk', 'resume.xdv',
                   'resume.synctex.gz'];
    for (const f of files) {
      const fp = join(dirPath, f);
      if (existsSync(fp)) unlinkSync(fp);
    }
  } catch (_) { /* non-critical */ }
}
