// src/lib/html-validator.js
import chalk from 'chalk';

function getErrorSnippet(html, errorIndex, context = 50) {
  if (errorIndex < 0 || errorIndex >= html.length) return '';
  const start = Math.max(0, errorIndex - context);
  const end = Math.min(html.length, errorIndex + context);
  let snippet = html.slice(start, end);
  const localPos = errorIndex - start;
  if (localPos >= 0 && localPos < snippet.length) {
    const before = snippet.slice(0, localPos);
    const errorChar = snippet[localPos];
    const after = snippet.slice(localPos + 1);
    snippet = before + chalk.red(errorChar) + after;
  }
  return snippet;
}

function checkHeadingHierarchy(html) {
  const errors = [];
  const headingRegex = /<(h[1-6])[^>]*>/gi;
  let lastLevel = 1;
  let match;
  while ((match = headingRegex.exec(html)) !== null) {
    const currentLevel = parseInt(match[1][1]);
    if (currentLevel > lastLevel + 1) {
      errors.push({
        type: 'heading_skip',
        message: `Пропущен уровень заголовка: после h${lastLevel} идёт h${currentLevel}`,
        snippet: getErrorSnippet(html, match.index)
      });
    }
    lastLevel = currentLevel;
  }
  return errors;
}

function checkDuplicateH1(html) {
  const h1Matches = html.match(/<h1[^>]*>/gi) || [];
  if (h1Matches.length > 1) {
    return [{
      type: 'duplicate_h1',
      message: `Найдено ${h1Matches.length} тегов <h1> (допустим только один)`,
      snippet: getErrorSnippet(html, html.indexOf('<h1'))
    }];
  }
  return [];
}

function checkImageAlt(html) {
  const errors = [];
  const imgRegex = /<img[^>]*>/gi;
  let match;
  while ((match = imgRegex.exec(html)) !== null) {
    const imgTag = match[0];
    if (!/alt=["'][^"']*["']/i.test(imgTag)) {
      errors.push({
        type: 'empty_alt',
        message: 'Изображение без атрибута alt',
        snippet: getErrorSnippet(html, match.index)
      });
    }
  }
  return errors;
}

function checkEmptyHref(html) {
  const errors = [];
  const aRegex = /<a[^>]*href=["']\s*["'][^>]*>/gi;
  let match;
  while ((match = aRegex.exec(html)) !== null) {
    errors.push({
      type: 'empty_href',
      message: 'Ссылка с пустым href',
      snippet: getErrorSnippet(html, match.index)
    });
  }
  return errors;
}

function checkDisallowedTags(html) {
  const errors = [];
  const disallowed = ['script', 'iframe', 'object', 'embed'];
  for (const tag of disallowed) {
    const regex = new RegExp(`<${tag}[^>]*>`, 'gi');
    let match;
    while ((match = regex.exec(html)) !== null) {
      errors.push({
        type: 'disallowed_tag',
        message: `Запрещённый тег <${tag}>`,
        snippet: getErrorSnippet(html, match.index)
      });
    }
  }
  return errors;
}

function checkListNesting(html) {
  const errors = [];
  const liRegex = /<li[^>]*>/gi;
  let match;
  while ((match = liRegex.exec(html)) !== null) {
    const before = html.slice(0, match.index);
    const lastListOpen = before.lastIndexOf('<ul');
    const lastListClose = before.lastIndexOf('</ul');
    const lastOlOpen = before.lastIndexOf('<ol');
    const lastOlClose = before.lastIndexOf('</ol');
    if ((lastListOpen < lastListClose && lastOlOpen < lastOlClose) || 
        (lastListOpen === -1 && lastOlOpen === -1)) {
      errors.push({
        type: 'invalid_nesting',
        message: 'Тег <li> вне <ul> или <ol>',
        snippet: getErrorSnippet(html, match.index)
      });
    }
  }
  return errors;
}

export function validateHtmlAdvanced(html, fieldName, productId) {
  if (!html || typeof html !== 'string') return [];

  let errors = [];

  // Базовая проверка закрытых тегов
  const stack = [];
  const tagRegex = /<(\/?)([a-zA-Z][a-zA-Z0-9]*)\b[^>]*>/g;
  const voidTags = new Set(['area','base','br','col','embed','hr','img','input','link','meta','param','source','track','wbr']);
  let match;
  while ((match = tagRegex.exec(html)) !== null) {
    const isClosing = match[1] === '/';
    const tagName = match[2].toLowerCase();
    if (isClosing) {
      if (stack.length === 0 || stack[stack.length-1] !== tagName) {
        errors.push({
          type: 'unclosed_tag',
          message: `Лишний закрывающий тег </${tagName}>`,
          snippet: getErrorSnippet(html, match.index)
        });
        continue;
      }
      stack.pop();
    } else if (!voidTags.has(tagName)) {
      stack.push(tagName);
    }
  }
  if (stack.length > 0) {
    errors.push({
      type: 'unclosed_tag',
      message: `Незакрытые теги: ${stack.join(', ')}`,
      snippet: getErrorSnippet(html, html.length - 1)
    });
  }

  // Дополнительные проверки
  errors.push(...checkDuplicateH1(html));
  errors.push(...checkHeadingHierarchy(html));
  errors.push(...checkImageAlt(html));
  errors.push(...checkEmptyHref(html));
  errors.push(...checkDisallowedTags(html));
  errors.push(...checkListNesting(html));

  return errors;
}

export function validateHtml(html, fieldName, productId) {
  const errors = validateHtmlAdvanced(html, fieldName, productId);
  return { valid: errors.length === 0, errors: errors.map(e => e.message) };
}