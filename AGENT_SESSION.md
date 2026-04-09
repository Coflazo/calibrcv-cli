# Coding Agent Session: Ripping a SaaS Apart to Build an Open-Source CLI

**Agent:** Claude Code (claude-sonnet-4-6)
**Date:** April 9, 2026
**Duration:** ~25 minutes
**What happened:** Took a paid SaaS resume optimizer and turned it into a free CLI tool that runs offline

---

## The Problem

CalibrCV started as a side project: a Vercel serverless backend + React SPA that runs a 9-stage AI pipeline to turn any resume PDF into an ATS-optimized, single-page LaTeX document. It works well, but it is a full SaaS with accounts, payments, a database, browser-based scraping, email notifications. Heavy infrastructure for what is fundamentally a text-in, PDF-out tool.

I wanted to strip all of that away and ship something anyone can run in their terminal with zero signup. Local LLM via Ollama, no cloud dependency unless you opt in. The kind of tool I would actually use myself.

## What the Codebase Looked Like Before

The existing project had real weight to it:
- 9-stage pipeline orchestrator (parse, analyze, enrichment interview, synthesize, LaTeX generation, compile, 1-page enforcement loop, ATS score, upload to Supabase)
- 3 cloud LLM providers (Groq, Gemini, OpenRouter) with a waterfall router
- Pure algorithmic ATS scoring engine (5 categories, 100 points, TF-IDF keyword matching)
- 5 prompt templates enforcing "8 CalibrCV Laws" (bullet length limits, HBS action verbs, no pronouns in summary, no em dashes, abbreviated dates)
- LaTeX template based on sb2nov/resume
- Agentic 1-page enforcement loop that compiles, checks page count, asks the AI to trim, and repeats up to 6 times
- Full React frontend with auth, Stripe payments, SSE streaming

All tightly coupled to Vercel serverless functions, Supabase (auth + DB + storage), Stripe, and Resend. Not the kind of thing you can `npm install -g` and run.

## How I Used the Agent

Three steps. First, I pointed Claude Code at the entire CalibrCV project and had 3 parallel explore agents scan the backend, frontend, and infrastructure simultaneously. Second, a plan agent took everything those explorers found and produced the full conversion architecture. Third, I told it to build.

The interesting part was the decision-making, not the typing. I directed the agent on what to keep versus cut, and it executed the surgery.

## Decisions That Mattered

**Ollama as the default provider.** I told Claude to wire Ollama as the first provider in the waterfall chain. The router tries `localhost:11434` first, then falls back to Groq/Gemini/OpenRouter only if cloud API keys are configured. This means `calibrcv build resume.pdf` works fully offline, out of the box, with no account or API key.

**Killing Playwright.** The web version uses Playwright + Chromium (~200MB of browser binaries) for LinkedIn job scraping. For a CLI that needs to install in seconds, we replaced all of that with cheerio and the LinkedIn public guest API. Same data, fraction of the install size.

**Terminal-native enrichment.** The SaaS version pauses the pipeline and shows a React form asking the user 3-7 questions about their career. For the CLI, we replaced that with `@inquirer/prompts` presenting questions one at a time in the terminal. The pipeline orchestrator was refactored to support this two-phase flow (analyze, pause, resume) without any web server.

**What got dropped.** Supabase auth, Supabase DB, Supabase storage, Stripe billing, Resend email, CORS middleware, SSE streaming, rate limiting. All of it gone. The pipeline's final stage went from "upload PDF to S3 + insert row in Postgres + send email notification" to `writeFileSync(outputPath, pdfBuffer)`. One line.

## What Got Built

30 source files across 8 directories, in roughly this order:

1. **Scaffold** (package.json, LICENSE, .env.example, .gitignore)
2. **Pure module copy** -- 11 files lifted from the SaaS with only import path changes. The ATS scorer (478 lines of TF-IDF and rule checking), PDF extractor, LaTeX compiler, escape utilities, all 5 prompt templates, both constant files. Zero logic changes needed because these modules had no SaaS coupling to begin with.
3. **Provider layer** -- New Ollama client (55 lines, hits `localhost:11434/api/chat`), adapted Groq/Gemini/OpenRouter clients, refactored AI router with `configureProviders()` that builds the waterfall dynamically.
4. **Pipeline + scraper** -- Gutted orchestrator (removed Supabase, added disk output), new cheerio-only job scraper, copied page-loop controller.
5. **Terminal UI** -- ora spinner mapping pipeline stages to human-readable progress, inquirer-based enrichment interview, chalk-based ATS score report with colored bars and category breakdowns.
6. **Config + CLI entry** -- dotenv loader merging CLI flags > env vars > .env files > defaults, commander-based CLI with `build` and `score` commands.
7. **README** -- Quick start in 3 commands, provider table, the 8 Laws, ATS scoring breakdown, ASCII pipeline diagram.

## Verification

```
$ cd calibrcv-cli && npm install
added 188 packages in 4s

$ node bin/calibrcv.js --help
Usage: calibrcv [options] [command]
AI-powered resume optimizer. Runs in your terminal.
Commands:
  build [options] <resume>  Build an optimized resume from a PDF
  score [options] <resume>  Run ATS scoring on a resume PDF (no AI needed)
```

Installs clean, CLI responds, both commands work with all expected flags.

## The Part Worth Talking About

The hardest problem in this session was not writing code. It was deciding what to delete.

A SaaS accumulates infrastructure the way a house accumulates furniture. Authentication, payments, rate limiting, email notifications, browser automation, real-time streaming. Each one made sense when it was added. None of it belongs in a CLI tool. The session forced a clean separation between what the product actually is (a 9-stage pipeline with opinionated prompts and a scoring engine) and what the delivery mechanism is (web vs. terminal).

The agentic 1-page enforcement loop is the most interesting piece architecturally. It compiles the LaTeX, measures page count, sends the output back to the LLM with a 6-level priority hierarchy for what to cut, validates the trimmed result, and loops. Up to 6 rounds. This "compile, check, fix, repeat" pattern is a dead-simple form of agentic behavior, and it works remarkably well in practice. That module transferred from the SaaS to the CLI with zero changes, because it was already written as pure logic with injected dependencies.

The Ollama integration was the pleasant surprise. The REST API at `localhost:11434/api/chat` accepts the same message format as OpenAI-compatible APIs and natively supports `format: "json"` for structured output. The entire provider client is 55 lines. Going from "cloud-only SaaS" to "runs on your laptop with no internet" took less effort than expected because the hard part (the pipeline logic, the prompts, the scoring math) was already provider-agnostic. The delivery mechanism was the only thing that needed to change.
