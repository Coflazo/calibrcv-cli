import { GoogleGenerativeAI } from '@google/generative-ai';

let genAI = null;

function getClient() {
  if (!genAI) {
    genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  }
  return genAI;
}

/**
 * Call Google Gemini (gemini-2.5-flash).
 */
export async function callGemini(systemPrompt, userMessage, options = {}) {
  const model = getClient().getGenerativeModel({
    model: 'gemini-2.5-flash',
    systemInstruction: systemPrompt,
  });

  const attemptCall = async () => {
    const result = await model.generateContent(userMessage);
    return result.response.text();
  };

  try {
    return await attemptCall();
  } catch (err) {
    if (err.status === 429 || err.message?.includes('429') || err.message?.includes('RESOURCE_EXHAUSTED')) {
      await new Promise(resolve => setTimeout(resolve, 10000));
      return await attemptCall();
    }
    throw err;
  }
}
