<p align="center">
  <img src="assets/logo.png" alt="CalibrCV" width="120" />
</p>
<h1 align="center">calibrcv</h1>
<p align="center">
  Your resume is probably getting rejected by robots. Fix it in your terminal.
  <br /><br />
  <a href="#quick-start">Quick Start</a>
  &middot;
  <a href="#what-happens-when-you-run-it">How It Works</a>
  &middot;
  <a href="#llm-providers">Providers</a>
  &middot;
  <a href="#the-8-calibrcv-laws">The 8 Laws</a>
</p>

<p align="center">
  <a href="https://opensource.org/licenses/MIT"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="License: MIT"></a>
  <a href="https://nodejs.org/en/"><img src="https://img.shields.io/badge/node-%3E%3D18-brightgreen.svg" alt="Node >= 18"></a>
  <a href="https://ollama.com"><img src="https://img.shields.io/badge/LLM-Ollama%20(local)-black.svg" alt="Ollama"></a>
  <a href="https://www.npmjs.com/package/calibrcv"><img src="https://img.shields.io/npm/v/calibrcv.svg" alt="npm version"></a>
  <a href="https://www.npmjs.com/package/calibrcv"><img src="https://img.shields.io/npm/dm/calibrcv.svg" alt="npm downloads"></a>
</p>

<p align="center">
  <img src="assets/demo.gif" alt="calibrcv demo" width="700" />
</p>

---

**calibrcv** is an open-source CLI that takes your resume PDF, rewrites it using AI under strict editorial rules, compiles it to LaTeX, and enforces a single-page limit through an agentic trim loop. Runs fully offline with Ollama. No account, no cloud, no data leaves your machine unless you choose a cloud provider.

> Most resume tools slap a template on your content and call it optimized. calibrcv runs a 9-stage pipeline with an actual scoring engine. It rewrites every bullet, enforces action verbs, kills filler, compiles to LaTeX, and loops until the result fits on one page. Then it scores the output against 5 ATS categories so you know exactly where you stand.

## Quick Start

```bash
npm install -g calibrcv

# pull a local model (free, runs on your machine)
ollama pull llama3.1

# optimize your resume
calibrcv build resume.pdf
```

That's it. Three commands. You get back a PDF, a `.tex` source file, and a terminal score report.

Just want a score? `calibrcv score resume.pdf` runs instantly, no AI needed.

## What Happens When You Run It

```
resume.pdf
    |
    v
 1. Parse PDF .............. extract text (or use VLM for image-based PDFs)
    |
    v
 2. Analyze ................ LLM diagnoses weaknesses, generates 3-7 questions
    |
    v
 3. Enrichment Interview ... you answer in the terminal (skippable)
    |
    v
 4. Synthesize ............. LLM rewrites every section under the 8 Laws
    |
    v
 5. Generate LaTeX ......... fills the sb2nov/resume template
    |
    v
 6. Compile + Trim Loop .... compiles to PDF; if >1 page, AI trims
    |    ^                   and recompiles (up to 6 rounds)
    |    |___________________|
    v
 7. ATS Score .............. pure algorithmic, 100-point scale
    |
    v
 optimized.pdf + resume.tex + score report
```

## Usage

### Build (full pipeline)

```bash
# basic
calibrcv build resume.pdf

# custom output path
calibrcv build resume.pdf -o optimized.pdf

# target a sector
calibrcv build resume.pdf --sector banking

# tailor for a specific job posting
calibrcv build resume.pdf --job-url https://linkedin.com/jobs/view/123456

# tailor from a local job description file
calibrcv build resume.pdf --job-desc posting.txt

# use a specific cloud provider
calibrcv build resume.pdf --provider groq

# use a different Ollama model
calibrcv build resume.pdf --model mistral

# skip the enrichment Q&A
calibrcv build resume.pdf --skip-enrich

# use VLM (vision model) for PDF extraction — great for scanned/image PDFs
calibrcv build resume.pdf --vlm

# use a specific vision model with Ollama
calibrcv build resume.pdf --vlm --vlm-model qwen2-vl
```

### Score (no AI needed)

Just want to know where your resume stands? The scoring engine is pure algorithmic — it uses a smart heuristic parser to detect sections, extract bullets, and identify contact info. No LLM calls, runs instantly.

```bash
# basic score
calibrcv score resume.pdf

# score against a job description file
calibrcv score resume.pdf --job-desc posting.txt

# score against a live job posting (keyword matching)
calibrcv score resume.pdf --job-url "https://linkedin.com/jobs/view/123456"
```

## LLM Providers

calibrcv tries providers in order and falls back automatically. Ollama is always first.

| Provider | Model | How to enable |
|----------|-------|---------------|
| **Ollama** (default) | `llama3.1:8b` | `ollama serve` + `ollama pull llama3.1` |
| Groq | `llama-3.3-70b` | Set `GROQ_API_KEY` |
| Google Gemini | `gemini-2.5-flash` | Set `GEMINI_API_KEY` |
| OpenRouter | `llama-3.1-8b` (free tier) | Set `OPENROUTER_API_KEY` |

Put your keys in `.env` in your working directory or at `~/.calibrcv/.env`:

```bash
GROQ_API_KEY=gsk_...
GEMINI_API_KEY=AI...
OPENROUTER_API_KEY=sk-or-...
OLLAMA_MODEL=llama3.1
VLM_MODEL=qwen2-vl
```

Force a specific provider: `calibrcv build resume.pdf --provider groq`

## VLM-Based PDF Parsing

By default, calibrcv extracts text from PDFs using `pdf-parse`. For scanned or image-based PDFs (where text extraction returns little to nothing), calibrcv can use a **Vision Language Model (VLM)** to read the PDF as an image.

```bash
# explicitly use VLM extraction
calibrcv build resume.pdf --vlm

# auto-fallback: if pdf-parse detects an image-based PDF, VLM kicks in automatically
calibrcv build resume.pdf
```

**VLM provider waterfall:** Gemini Flash (cloud, fast) -> Ollama + qwen2-vl (local, free)

| Provider | Model | How to enable | Speed |
|----------|-------|---------------|-------|
| **Google Gemini** | `gemini-2.5-flash` | Set `GEMINI_API_KEY` | Fast |
| **Ollama** (local) | `qwen2-vl` | `ollama pull qwen2-vl` | Slower, fully offline |

To use a different Ollama vision model:

```bash
calibrcv build resume.pdf --vlm --vlm-model llava:13b
# or set VLM_MODEL in .env
VLM_MODEL=bakllava
```

**Recommended vision models for Ollama:**

| Model | Size | Best for |
|-------|------|----------|
| `qwen2-vl` | 4.4 GB | Best quality, default choice |
| `llava:13b` | 8 GB | Strong alternative |
| `bakllava` | 4.7 GB | Faster, good quality |
| `llava` | 4.7 GB | Lightweight option |

## The 8 CalibrCV Laws

Every resume produced by calibrcv follows these rules. No exceptions, no overrides.

| # | Law | What it means |
|---|-----|---------------|
| 1 | **100-Character Bullets** | Every bullet fits in 100 characters. Period. |
| 2 | **HBS Action Verbs** | Every bullet opens with an approved verb (Architected, Deployed, Engineered...) |
| 3 | **Harvard-Style Summary** | 3-4 sentences, zero pronouns (no I/my/me/we), executive voice |
| 4 | **Realistic Grounding** | No inflated claims. Seniority-appropriate language only. |
| 5 | **Zero Em Dashes** | Replaced with semicolons, colons, or restructured sentences |
| 6 | **Two-Line Skills** | Exactly two rows: "Quantitative Stack" and "Analytic Domain" |
| 7 | **Strict Bullet Counts** | Experience: 2-3 bullets. Projects: exactly 2. |
| 8 | **Abbreviated Dates** | "Jun. 2023" format throughout |

## ATS Scoring

The scoring engine is pure math. No AI calls, no external API. Five categories, 100 points.

| Category | Points | What it checks |
|----------|--------|---------------|
| Structural Integrity | 0-20 | Required sections present, dates on all entries |
| Keyword Density | 0-30 | TF-IDF matching against job description with stopword filtering and stem matching (or lexical richness without JD) |
| Content Quality | 0-25 | HBS verb compliance, quantified metrics, bullet length |
| Parsability | 0-15 | Box-drawing chars, em dashes, smart quotes, encoding issues |
| Completeness | 0-10 | Email, phone, LinkedIn, location, skills breadth |

## Prerequisites

- **Node.js 18+**
- **Ollama** for local LLM (or a cloud API key from the table above)
- **LaTeX compiler** for PDF output: `tectonic`, `pdflatex`, or `xelatex`
  - macOS: `brew install tectonic` or `brew install --cask mactex`
  - Ubuntu/Debian: `sudo apt install texlive-full`
  - Windows: [MiKTeX](https://miktex.org/download)
  - If no compiler is found, calibrcv still outputs the `.tex` source file

## Why This Exists

I built CalibrCV as a full SaaS (Vercel + React + Supabase + Stripe). It worked, but it was heavy. Accounts, payments, database, browser automation, email notifications. A lot of infrastructure for a tool that fundamentally takes text in and spits a PDF out.

So I ripped the core pipeline out and turned it into something you can install in 10 seconds and run offline. The AI logic, the prompts, the scoring engine, the LaTeX template: all the same. The delivery mechanism changed from "web app with auth" to "three commands in your terminal."

## Contributing

PRs welcome. If you want to add a new LLM provider, the interface is simple: look at `src/providers/ollama.js` (55 lines) as a reference.

```bash
git clone https://github.com/Coflazo/calibrcv-cli.git
cd calibrcv-cli
npm install
node bin/calibrcv.js --help
```

## License

[MIT](LICENSE)
