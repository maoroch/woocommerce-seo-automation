// src/lib/json-utils.js
export function extractJsonFromResponse(text) {
  if (!text || typeof text !== 'string') {
    throw new Error(`extractJsonFromResponse получил некорректный аргумент: ${typeof text}`);
  }

  let cleaned = text;

  // 1. Удаляем markdown-обёртки
  cleaned = cleaned.replace(/```(?:json)?\s*([\s\S]*?)\s*```/g, (match, content) => content.trim());

  // 2. Удаляем однострочные и многострочные комментарии
  cleaned = cleaned.replace(/\/\/.*$/gm, '');
  cleaned = cleaned.replace(/\/\*[\s\S]*?\*\//g, '');
  
  // 3. Удаляем ВСЕ управляющие символы (включая \n, \r, \t)
  //    Это безопасно для HTML-контента – браузер игнорирует лишние пробелы и переносы.
  cleaned = cleaned.replace(/[\x00-\x1F\x7F]/g, '');

  // 4. Находим первый { или [
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

  // 5. Ищем последнюю закрывающую скобку
  let end = jsonStr.lastIndexOf('}');
  let end2 = jsonStr.lastIndexOf(']');
  let lastClose = Math.max(end, end2);
  if (lastClose !== -1) {
    jsonStr = jsonStr.slice(0, lastClose + 1);
  }

  // 6. Парсим
  try {
    return JSON.parse(jsonStr);
  } catch (err) {
    throw new Error(`Невалидный JSON после очистки: ${err.message}\nОчищенный фрагмент: ${jsonStr.slice(0, 200)}`);
  }
}