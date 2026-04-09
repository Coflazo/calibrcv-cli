/**
 * Ollama provider. Calls the local Ollama REST API.
 * Default: http://localhost:11434, model llama3.1
 * Uses streaming to avoid Node.js headers timeout on long generations.
 */

const DEFAULT_HOST = 'http://localhost:11434';
const DEFAULT_MODEL = 'llama3.1';

export async function callOllama(systemPrompt, userMessage, options = {}) {
  const { responseFormat = 'text' } = options;
  const host = process.env.OLLAMA_HOST || DEFAULT_HOST;
  const model = process.env.OLLAMA_MODEL || DEFAULT_MODEL;

  const body = {
    model,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userMessage },
    ],
    stream: true,
    options: { temperature: 0.3 },
  };

  if (responseFormat === 'json') {
    body.format = 'json';
  }

  let response;
  try {
    response = await fetch(`${host}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch (err) {
    if (err.cause?.code === 'ECONNREFUSED' || err.message?.includes('ECONNREFUSED')) {
      throw new Error(
        `Ollama is not running. Start it with: ollama serve\n` +
        `Or set a cloud provider: --provider groq`
      );
    }
    throw err;
  }

  if (!response.ok) {
    const errorText = await response.text();
    if (errorText.includes('model') && errorText.includes('not found')) {
      throw new Error(
        `Ollama model "${model}" not found. Pull it with: ollama pull ${model}`
      );
    }
    throw new Error(`Ollama API error ${response.status}: ${errorText}`);
  }

  let content = '';
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    const chunk = decoder.decode(value, { stream: true });
    for (const line of chunk.split('\n').filter(Boolean)) {
      try {
        const json = JSON.parse(line);
        if (json.message?.content) content += json.message.content;
      } catch (_) { /* skip malformed chunks */ }
    }
  }
  return content;
}

/**
 * Call Ollama with image(s) for vision tasks.
 * Requires a vision-capable model (e.g., qwen2-vl, llava, bakllava).
 * @param {string} prompt - Text prompt
 * @param {Buffer[]} imageBuffers - Array of PNG image buffers
 * @param {string} [vlmModel] - Vision model name override
 * @returns {Promise<string>}
 */
export async function callOllamaVision(prompt, imageBuffers, vlmModel) {
  const host = process.env.OLLAMA_HOST || DEFAULT_HOST;
  const model = vlmModel || process.env.VLM_MODEL || 'qwen2-vl';

  const images = imageBuffers.map(buf => buf.toString('base64'));

  const body = {
    model,
    messages: [
      { role: 'user', content: prompt, images },
    ],
    stream: true,
    options: { temperature: 0.1 },
  };

  let response;
  try {
    response = await fetch(`${host}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch (err) {
    if (err.cause?.code === 'ECONNREFUSED' || err.message?.includes('ECONNREFUSED')) {
      throw new Error(
        `Ollama is not running. Start it with: ollama serve\n` +
        `Or set GEMINI_API_KEY for cloud-based VLM extraction.`
      );
    }
    throw err;
  }

  if (!response.ok) {
    const errorText = await response.text();
    if (errorText.includes('model') && errorText.includes('not found')) {
      throw new Error(
        `Ollama vision model "${model}" not found. Pull it with: ollama pull ${model}`
      );
    }
    throw new Error(`Ollama API error ${response.status}: ${errorText}`);
  }

  let content = '';
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    const chunk = decoder.decode(value, { stream: true });
    for (const line of chunk.split('\n').filter(Boolean)) {
      try {
        const json = JSON.parse(line);
        if (json.message?.content) content += json.message.content;
      } catch (_) { /* skip malformed chunks */ }
    }
  }
  return content;
}
