// src/lib/ai-provider.js
//
// Единая точка вызова LLM. Поддерживает два провайдера:
//   - OpenRouter (облачный API, требует OPENROUTER_API_KEY)
//   - Ollama (локальный сервер, требует OLLAMA_BASE_URL)
//
// Выбор провайдера: AI_PROVIDER=openrouter|ollama в .env (по умолчанию openrouter).
// Можно переопределить на вызов: callAI(system, user, { provider: 'ollama', model: 'llama3' })

import { extractJsonFromResponse } from './json-utils.js';

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const OPENROUTER_MODEL = process.env.OPENROUTER_MODEL || 'openrouter/auto';
const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';

const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'llama3';

/**
 * Вызов OpenRouter (chat completions).
 */
async function callOpenRouter(systemPrompt, userPrompt, options = {}) {
  if (!OPENROUTER_API_KEY) throw new Error('OPENROUTER_API_KEY is not set in .env');

  const model = options.model || OPENROUTER_MODEL;
  const maxTokens = options.maxTokens || 10000;

  const response = await fetch(OPENROUTER_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: options.temperature ?? 0.7,
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

  const choice = data.choices[0];
  if (choice.finish_reason === 'length') {
    throw new Error(`OpenRouter: достигнут лимит токенов (${maxTokens}). Увеличьте max_tokens или сократите входные данные.`);
  }
  if (!choice.message?.content) {
    throw new Error('OpenRouter вернул некорректный ответ: отсутствует content');
  }

  return {
    content: choice.message.content,
    usage: data.usage,
    model,
    provider: 'openrouter',
  };
}

/**
 * Вызов локального Ollama (/api/chat).
 */
async function callOllama(systemPrompt, userPrompt, options = {}) {
  const model = options.model || OLLAMA_MODEL;
  const url = `${OLLAMA_BASE_URL.replace(/\/$/, '')}/api/chat`;

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      stream: false,
      options: {
        temperature: options.temperature ?? 0.7,
      },
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Ollama API error (${response.status}): ${errorText}`);
  }

  const data = await response.json();
  if (!data.message?.content) {
    throw new Error('Ollama вернул некорректный ответ: отсутствует message.content');
  }

  return {
    content: data.message.content,
    usage: {
      prompt_tokens: data.prompt_eval_count ?? null,
      completion_tokens: data.eval_count ?? null,
      total_tokens: (data.prompt_eval_count ?? 0) + (data.eval_count ?? 0),
    },
    model,
    provider: 'ollama',
  };
}

/**
 * Универсальный вызов LLM.
 *
 * @param {string} systemPrompt
 * @param {string} userPrompt
 * @param {Object} options
 * @param {'openrouter'|'ollama'} options.provider — по умолчанию из AI_PROVIDER env (или 'openrouter')
 * @param {string} options.model — переопределить модель
 * @param {number} options.maxTokens
 * @param {number} options.temperature
 * @returns {Object} { content, usage, model, provider }
 */
export async function callAI(systemPrompt, userPrompt, options = {}) {
  const provider = options.provider || process.env.AI_PROVIDER || 'openrouter';

  if (provider === 'ollama') {
    return callOllama(systemPrompt, userPrompt, options);
  }
  return callOpenRouter(systemPrompt, userPrompt, options);
}

/**
 * Проверка доступности провайдера (для UI — показать статус подключения).
 */
export async function checkProviderStatus(provider) {
  try {
    if (provider === 'ollama') {
      const url = `${OLLAMA_BASE_URL.replace(/\/$/, '')}/api/tags`;
      const res = await fetch(url, { signal: AbortSignal.timeout(3000) });
      if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
      const data = await res.json();
      return { ok: true, models: (data.models || []).map(m => m.name) };
    }

    // openrouter
    if (!OPENROUTER_API_KEY) return { ok: false, error: 'OPENROUTER_API_KEY not set' };
    return { ok: true, model: OPENROUTER_MODEL };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

export { extractJsonFromResponse };
export const DEFAULT_OPENROUTER_MODEL = OPENROUTER_MODEL;
export const DEFAULT_OLLAMA_MODEL = OLLAMA_MODEL;
export const DEFAULT_OLLAMA_BASE_URL = OLLAMA_BASE_URL;
