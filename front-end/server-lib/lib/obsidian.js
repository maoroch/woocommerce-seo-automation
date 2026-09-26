// src/lib/obsidian.js
//
// Загружает .md заметки из obsidian-vault/ как дополнительный контекст для AI.
//
// - Рекурсивно обходит каталог
// - Удаляет YAML frontmatter
// - Очищает Obsidian-синтаксис: [[wikilinks]], ![[embeds]], #tags, ==highlights==
// - Возвращает список заметок с относительным путём (используется как "id")

import fs from 'fs/promises';
import path from 'path';

const DEFAULT_VAULT_DIR = path.join(process.cwd(), 'obsidian-vault');
const MAX_NOTE_LENGTH = 20000; // символов на заметку — защита от слишком больших файлов

/**
 * Рекурсивно собирает все .md файлы в директории.
 */
async function walkMarkdownFiles(dir, baseDir = dir) {
  let results = [];
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch (err) {
    if (err.code === 'ENOENT') return [];
    throw err;
  }

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name.startsWith('.')) continue; // .obsidian, .git, etc.
      results = results.concat(await walkMarkdownFiles(fullPath, baseDir));
    } else if (entry.isFile() && entry.name.endsWith('.md')) {
      const relPath = path.relative(baseDir, fullPath);
      results.push({ fullPath, relPath });
    }
  }
  return results;
}

/**
 * Удаляет YAML frontmatter (--- ... ---) из начала файла.
 */
function stripFrontmatter(content) {
  if (content.startsWith('---')) {
    const end = content.indexOf('\n---', 3);
    if (end !== -1) {
      return content.slice(end + 4).trimStart();
    }
  }
  return content;
}

/**
 * Очищает Obsidian-специфичный синтаксис, оставляя читаемый текст.
 */
function cleanObsidianSyntax(content) {
  let cleaned = content;

  // ![[embed]] -> убираем целиком (вложения файлов/изображений)
  cleaned = cleaned.replace(/!\[\[([^\]]+)\]\]/g, '');

  // [[link|alias]] -> alias ;  [[link]] -> link
  cleaned = cleaned.replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, '$2');
  cleaned = cleaned.replace(/\[\[([^\]]+)\]\]/g, '$1');

  // ==highlight== -> highlight
  cleaned = cleaned.replace(/==([^=]+)==/g, '$1');

  // #tag -> убираем символ # (но не markdown-заголовки в начале строки)
  cleaned = cleaned.replace(/(^|\s)#([a-zA-Zа-яА-Я0-9_-]+)/g, '$1$2');

  return cleaned.trim();
}

/**
 * Возвращает заголовок заметки: первая строка вида "# Заголовок" или имя файла.
 */
function extractTitle(content, relPath) {
  const match = content.match(/^#\s+(.+)$/m);
  if (match) return match[1].trim();
  return path.basename(relPath, '.md');
}

/**
 * Получить список всех заметок в vault (метаданные без полного содержимого).
 *
 * @param {string} vaultDir
 * @returns {Array<{id, title, path}>}
 */
export async function listNotes(vaultDir = DEFAULT_VAULT_DIR) {
  const files = await walkMarkdownFiles(vaultDir);
  const notes = [];

  for (const { fullPath, relPath } of files) {
    if (relPath.toLowerCase() === 'readme.md') continue; // служебный файл
    try {
      const raw = await fs.readFile(fullPath, 'utf8');
      const content = stripFrontmatter(raw);
      const title = extractTitle(content, relPath);
      notes.push({
        id: relPath.replace(/\\/g, '/').replace(/\.md$/, ''),
        title,
        path: relPath.replace(/\\/g, '/'),
        size: raw.length,
      });
    } catch {
      // пропускаем нечитаемые файлы
    }
  }

  notes.sort((a, b) => a.path.localeCompare(b.path));
  return notes;
}

/**
 * Загружает и очищает содержимое одной заметки по id (относительный путь без .md).
 *
 * @param {string} noteId
 * @param {string} vaultDir
 * @returns {string} очищенный текст заметки
 */
export async function loadNote(noteId, vaultDir = DEFAULT_VAULT_DIR) {
  const safeId = noteId.replace(/\\/g, '/').replace(/^\/+/, '');
  if (safeId.includes('..')) throw new Error('Invalid note id');

  const fullPath = path.join(vaultDir, `${safeId}.md`);
  const raw = await fs.readFile(fullPath, 'utf8');
  let content = stripFrontmatter(raw);
  content = cleanObsidianSyntax(content);

  if (content.length > MAX_NOTE_LENGTH) {
    content = content.slice(0, MAX_NOTE_LENGTH) + '\n\n[...обрезано...]';
  }

  return content;
}

/**
 * Загружает и объединяет несколько заметок в один контекстный блок для AI.
 *
 * @param {string[]} noteIds
 * @param {string} vaultDir
 * @returns {string} объединённый контекст с заголовками заметок
 */
export async function buildContext(noteIds = [], vaultDir = DEFAULT_VAULT_DIR) {
  if (!noteIds?.length) return '';

  const parts = [];
  for (const id of noteIds) {
    try {
      const content = await loadNote(id, vaultDir);
      parts.push(`### ${id}\n${content}`);
    } catch (err) {
      console.warn(`⚠️  Could not load Obsidian note "${id}": ${err.message}`);
    }
  }

  return parts.join('\n\n---\n\n');
}

export { DEFAULT_VAULT_DIR };
