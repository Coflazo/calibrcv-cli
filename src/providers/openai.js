/**
 * OpenAI provider. Supports GPT-4o, GPT-4o-mini, o3-mini.
 * Uses the official openai SDK.
 */
import OpenAI from 'openai';

let client = null;

function getClient() {
  if (!client) {
    client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return client;
}

const DEFAULT_MODEL = 'gpt-4o-mini';

/**
 * Call OpenAI chat completions.
 */
export async function callOpenAI(systemPrompt, userMessage, options = {}) {
  const { responseFormat = 'text' } = options;
  const model = process.env.OPENAI_MODEL || DEFAULT_MODEL;

  const params = {
    model,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userMessage },
    ],
    temperature: 0.3,
    max_tokens: 4096,
  };

  if (responseFormat === 'json') {
    params.response_format = { type: 'json_object' };
  }

  const response = await getClient().chat.completions.create(params);
  return response.choices[0].message.content;
}

/**
 * Call OpenAI with image(s) for vision tasks (GPT-4o).
 * @param {string} prompt - Text prompt
 * @param {Buffer[]} imageBuffers - Array of PNG image buffers
 * @returns {Promise<string>}
 */
export async function callOpenAIVision(prompt, imageBuffers) {
  const content = [{ type: 'text', text: prompt }];
  for (const buf of imageBuffers) {
    content.push({
      type: 'image_url',
      image_url: { url: `data:image/png;base64,${buf.toString('base64')}` },
    });
  }

  const response = await getClient().chat.completions.create({
    model: 'gpt-4o',
    messages: [{ role: 'user', content }],
    temperature: 0.1,
    max_tokens: 4096,
  });

  return response.choices[0].message.content;
}
