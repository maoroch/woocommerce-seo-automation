// src/lib/ollama.js
import 'dotenv/config';
import { extractJsonFromResponse } from './json-utils.js';

const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'llama3.2';

export async function isOllamaAvailable() {
  try {
    const res = await fetch(`${OLLAMA_URL}/api/tags`);
    return res.ok;
  } catch {
    return false;
  }
}

function aggressiveJsonExtract(text) {
  if (!text || typeof text !== 'string') {
    throw new Error('Получен некорректный аргумент');
  }

  let cleaned = text;

  // Удаляем markdown-обёртки
  cleaned = cleaned.replace(/```(?:json)?\s*([\s\S]*?)\s*```/g, (match, content) => content.trim());

  // Удаляем markdown заголовки (###, ##, #)
  cleaned = cleaned.replace(/^#+\s+.*$/gm, '');

  // Удаляем markdown форматирование (**bold**, *italic*, и т.д.)
  cleaned = cleaned.replace(/\*\*(.+?)\*\*/g, '$1');
  cleaned = cleaned.replace(/\*(.+?)\*/g, '$1');
  cleaned = cleaned.replace(/__(.+?)__/g, '$1');
  cleaned = cleaned.replace(/_(.+?)_/g, '$1');

  // Удаляем комментарии // и /* */
  cleaned = cleaned.replace(/\/\/.*$/gm, '');
  cleaned = cleaned.replace(/\/\*[\s\S]*?\*\//g, '');

  // Находим первый { или [
  const firstBrace = cleaned.indexOf('{');
  const firstBracket = cleaned.indexOf('[');
  let start = -1;
  if (firstBracket !== -1 && (firstBracket < firstBrace || firstBrace === -1)) {
    start = firstBracket;
  } else if (firstBrace !== -1) {
    start = firstBrace;
  }
  if (start === -1) {
    throw new Error('Не найден JSON массив или объект в ответе');
  }

  let jsonStr = cleaned.slice(start);

  let end = jsonStr.lastIndexOf('}');
  let end2 = jsonStr.lastIndexOf(']');
  let lastClose = Math.max(end, end2);
  if (lastClose !== -1) {
    jsonStr = jsonStr.slice(0, lastClose + 1);
  }

  try {
    return JSON.parse(jsonStr);
  } catch (initialErr) {
    let repaired = jsonStr
      .replace(/([^\\])'([^']*)'([^\\])/g, '$1"$2"$3')
      .replace(/:\s*'([^']*)'([,\n\]])/g, ': "$1"$2');
    try {
      return JSON.parse(repaired);
    } catch (repairErr) {
      throw new Error(`Невалидный JSON после очистки: ${initialErr.message}\nОчищенный (первые 300 символов): ${jsonStr.slice(0, 300)}`);
    }
  }
}

export async function callOllama(systemPrompt, userPrompt, options = {}) {
  const timeoutMs = options.timeoutMs || 300000; // 5 минут
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${OLLAMA_URL}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: OLLAMA_MODEL,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        format: "json",
        stream: false,
        temperature: 0,
        top_k: options.topK ?? 40,
        top_p: options.topP ?? 0.9,
        num_predict: options.maxTokens ?? 1000, // уменьшено
      }),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    if (!response.ok) throw new Error(`Ollama error: ${response.status} ${await response.text()}`);
    const data = await response.json();
    return data.message.content;
  } catch (err) {
    clearTimeout(timeoutId);
    if (err.name === 'AbortError') throw new Error(`Ollama timeout after ${timeoutMs}ms`);
    throw err;
  }
}

export { aggressiveJsonExtract as extractJsonFromResponse };
