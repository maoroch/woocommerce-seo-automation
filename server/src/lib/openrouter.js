// src/lib/openrouter.js
import 'dotenv/config';
import { extractJsonFromResponse } from './json-utils.js';

const API_KEY = process.env.OPENROUTER_API_KEY;
const MODEL = process.env.OPENROUTER_MODEL || 'openrouter/auto';
const BASE_URL = 'https://openrouter.ai/api/v1/chat/completions';

export async function callOpenRouter(systemPrompt, userPrompt, options = {}) {
  if (!API_KEY) throw new Error('OPENROUTER_API_KEY is not set in .env');

  const maxTokens = options.maxTokens || 10000; // по умолчанию 4000

  const response = await fetch(BASE_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: options.temperature || 0.7,
      max_tokens: maxTokens,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenRouter API error (${response.status}): ${errorText}`);
  }

  const data = await response.json();
  if (!data.choices || !data.choices[0]) {
    throw new Error('OpenRouter вернул некорректный ответ: отсутствуют choices');
  }
  console.log(`📊 Tokens used: prompt=${data.usage.prompt_tokens}, completion=${data.usage.completion_tokens}, total=${data.usage.total_tokens}`);

  const choice = data.choices[0];
  if (choice.finish_reason === 'length') {
    throw new Error(`OpenRouter: достигнут лимит токенов (${maxTokens}). Увеличьте max_tokens или сократите входные данные.`);
  }

  if (!choice.message || !choice.message.content) {
    console.error('❌ OpenRouter response structure:', JSON.stringify(data, null, 2));
    throw new Error('OpenRouter вернул некорректный ответ: отсутствует content');
  }

  return choice.message.content;
}

export { extractJsonFromResponse };