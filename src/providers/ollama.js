/**
 * Ollama provider. Calls the local Ollama REST API.
 * Default: http://localhost:11434, model llama3.1:8b
 */

const DEFAULT_HOST = 'http://localhost:11434';
const DEFAULT_MODEL = 'llama3.1:8b';

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
    stream: false,
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

  const data = await response.json();
  return data.message?.content || '';
}
