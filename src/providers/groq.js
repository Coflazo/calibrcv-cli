import Groq from 'groq-sdk';

let groqClient = null;

function getClient() {
  if (!groqClient) {
    groqClient = new Groq({ apiKey: process.env.GROQ_API_KEY });
  }
  return groqClient;
}

/**
 * Call Groq API (llama-3.3-70b-versatile).
 */
export async function callGroq(systemPrompt, userMessage, options = {}) {
  const { responseFormat = 'text' } = options;

  const requestParams = {
    model: 'llama-3.3-70b-versatile',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userMessage },
    ],
    temperature: 0.3,
    max_tokens: 4096,
  };

  if (responseFormat === 'json') {
    requestParams.response_format = { type: 'json_object' };
  }

  const response = await getClient().chat.completions.create(requestParams);
  return response.choices?.[0]?.message?.content || '';
}
