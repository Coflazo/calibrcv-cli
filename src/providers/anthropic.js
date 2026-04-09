/**
 * Anthropic Claude provider. Supports Claude Sonnet 4, Claude Haiku 4.
 * Uses the official @anthropic-ai/sdk.
 */
import Anthropic from '@anthropic-ai/sdk';

let client = null;

function getClient() {
  if (!client) {
    client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return client;
}

const DEFAULT_MODEL = 'claude-sonnet-4-20250514';

/**
 * Call Anthropic Claude.
 */
export async function callAnthropic(systemPrompt, userMessage, options = {}) {
  const model = process.env.ANTHROPIC_MODEL || DEFAULT_MODEL;

  const response = await getClient().messages.create({
    model,
    max_tokens: 4096,
    system: systemPrompt,
    messages: [{ role: 'user', content: userMessage }],
  });

  return response.content[0].text;
}

/**
 * Call Anthropic Claude with image(s) for vision tasks.
 * @param {string} prompt - Text prompt
 * @param {Buffer[]} imageBuffers - Array of PNG image buffers
 * @returns {Promise<string>}
 */
export async function callAnthropicVision(prompt, imageBuffers) {
  const content = [];
  for (const buf of imageBuffers) {
    content.push({
      type: 'image',
      source: {
        type: 'base64',
        media_type: 'image/png',
        data: buf.toString('base64'),
      },
    });
  }
  content.push({ type: 'text', text: prompt });

  const response = await getClient().messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 4096,
    messages: [{ role: 'user', content }],
  });

  return response.content[0].text;
}
