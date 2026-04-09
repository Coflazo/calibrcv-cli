/**
 * VLM (Vision Language Model) based PDF extraction.
 * Converts PDF pages to images and sends them to a vision model
 * for high-fidelity text extraction. Useful for image-based PDFs
 * or when pdf-parse loses layout fidelity.
 *
 * Waterfall: Gemini Vision (cloud, fast) -> Ollama + qwen2-vl (local, free)
 */

import { callVLM } from './ai-router.js';

const VLM_PROMPT = `Extract ALL text from this resume image exactly as it appears.
Preserve the section structure (headers, bullet points, dates, contact info).
Return plain text with the same layout — do not add any commentary or formatting.
Keep bullet points as "•", preserve date formats, and maintain section order.`;

/**
 * Extract text from a PDF using a Vision Language Model.
 * @param {Buffer} pdfBuffer - Raw PDF file bytes
 * @param {{ vlmModel?: string }} options
 * @returns {Promise<{ text: string, pages: number }>}
 */
export async function extractWithVLM(pdfBuffer, options = {}) {
  // Dynamic import to avoid loading pdf-to-img unless VLM is used
  const { pdf } = await import('pdf-to-img');

  const pages = [];
  const document = await pdf(pdfBuffer, { scale: 2.0 });
  for await (const image of document) {
    pages.push(Buffer.from(image));
  }

  if (pages.length === 0) {
    throw new Error('PDF has no pages to extract.');
  }

  // Send all pages (up to 5) to the VLM
  const pagesToSend = pages.slice(0, 5);
  const text = await callVLM(VLM_PROMPT, pagesToSend, options);

  return { text: text.trim(), pages: pages.length };
}
