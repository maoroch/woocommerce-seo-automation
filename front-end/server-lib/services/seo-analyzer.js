// src/services/seo-analyzer.js
import { getProducts, getProductsByCategory, getAllCategories } from '../lib/woocommerce.js';

// Вспомогательные функции
function countWords(text) {
  if (!text) return 0;
  return text.trim().split(/\s+/).length;
}

function countChars(text) {
  if (!text) return 0;
  return text.length;
}

function containsKeyword(text, keyword) {
  if (!text || !keyword) return false;
  return text.toLowerCase().includes(keyword.toLowerCase());
}

function checkHtmlHeadings(html) {
  if (!html) return false;
  const hasH1 = /<h1[^>]*>/i.test(html);
  const hasH2 = /<h2[^>]*>/i.test(html);
  return hasH1 || hasH2;
}

// Оценка длины заголовка (name или meta_title)
function scoreTitleLength(title) {
  const len = countChars(title);
  if (len >= 50 && len <= 70) return { score: 20, status: 'good', message: `Длина ${len} символов (в норме)` };
  if ((len >= 40 && len < 50) || (len > 70 && len <= 80)) return { score: 10, status: 'warning', message: `Длина ${len} символов (допустимо, но лучше 50-70)` };
  return { score: 0, status: 'error', message: `Длина ${len} символов (рекомендуется 50-70)` };
}

// Оценка длины meta description
function scoreMetaDescLength(desc) {
  const len = countChars(desc);
  if (len >= 120 && len <= 160) return { score: 20, status: 'good', message: `Длина ${len} символов (в норме)` };
  if ((len >= 100 && len < 120) || (len > 160 && len <= 180)) return { score: 10, status: 'warning', message: `Длина ${len} символов (допустимо, но лучше 120-160)` };
  return { score: 0, status: 'error', message: `Длина ${len} символов (рекомендуется 120-160)` };
}

// Наличие focus keyword
function scoreFocusKeywordExists(focusKeyword) {
  if (focusKeyword && focusKeyword.trim().length > 0) {
    return { score: 15, status: 'good', message: 'Фокусное ключевое слово указано' };
  }
  return { score: 0, status: 'error', message: 'Фокусное ключевое слово отсутствует' };
}

// Вхождение focus keyword в title
function scoreKeywordInTitle(title, focusKeyword) {
  if (!focusKeyword) return { score: 0, status: 'error', message: 'Нет ключевого слова для проверки' };
  if (containsKeyword(title, focusKeyword)) {
    return { score: 10, status: 'good', message: `Ключевое слово найдено в заголовке` };
  }
  return { score: 0, status: 'error', message: `Ключевое слово отсутствует в заголовке` };
}

// Вхождение focus keyword в meta description
function scoreKeywordInMetaDesc(metaDesc, focusKeyword) {
  if (!focusKeyword) return { score: 0, status: 'error', message: 'Нет ключевого слова для проверки' };
  if (containsKeyword(metaDesc, focusKeyword)) {
    return { score: 10, status: 'good', message: `Ключевое слово найдено в meta description` };
  }
  return { score: 0, status: 'error', message: `Ключевое слово отсутствует в meta description` };
}

// Оценка длины основного описания (description)
function scoreDescriptionLength(description) {
  const len = countChars(description);
  if (len >= 2000) return { score: 15, status: 'good', message: `Длина ${len} символов (отлично)` };
  if (len >= 1000 && len < 2000) return { score: 10, status: 'warning', message: `Длина ${len} символов (хорошо, но можно больше)` };
  if (len >= 500 && len < 1000) return { score: 5, status: 'warning', message: `Длина ${len} символов (маловато)` };
  return { score: 0, status: 'error', message: `Длина ${len} символов (слишком короткое описание)` };
}

// Наличие alt у главного изображения
function scoreImageAlt(images) {
  if (!images || images.length === 0) return { score: 0, status: 'error', message: 'Нет изображений' };
  const mainImage = images[0];
  if (mainImage.alt && mainImage.alt.trim().length > 0) {
    return { score: 5, status: 'good', message: 'Alt заполнен' };
  }
  return { score: 0, status: 'error', message: 'Alt отсутствует' };
}

// Наличие заголовков H1/H2 в описании
function scoreHeadings(description) {
  const hasHeadings = checkHtmlHeadings(description);
  if (hasHeadings) {
    return { score: 5, status: 'good', message: 'Есть заголовки H1 или H2' };
  }
  return { score: 0, status: 'warning', message: 'Нет заголовков H1/H2 в описании' };
}

// Главная функция анализа одного товара
export function analyzeProduct(product) {
  // Извлекаем мета-поля Rank Math
  const metaMap = new Map((product.meta_data || []).map(m => [m.key, m.value]));
  const metaTitle = metaMap.get('rank_math_title') || '';
  const metaDescription = metaMap.get('rank_math_description') || '';
  const focusKeyword = metaMap.get('rank_math_focus_keyword') || '';
  
  // Для заголовка используем SEO-заголовк (если есть), иначе name
  const titleForScore = metaTitle || product.name || '';
  
  const titleScore = scoreTitleLength(titleForScore);
  const metaDescScore = scoreMetaDescLength(metaDescription);
  const focusExistsScore = scoreFocusKeywordExists(focusKeyword);
  const keywordInTitleScore = scoreKeywordInTitle(titleForScore, focusKeyword);
  const keywordInDescScore = scoreKeywordInMetaDesc(metaDescription, focusKeyword);
  const descLengthScore = scoreDescriptionLength(product.description || '');
  const imageAltScore = scoreImageAlt(product.images);
  const headingsScore = scoreHeadings(product.description || '');
  
  const totalScore = titleScore.score + metaDescScore.score + focusExistsScore.score +
                     keywordInTitleScore.score + keywordInDescScore.score +
                     descLengthScore.score + imageAltScore.score + headingsScore.score;
  
  const issues = [];
  const addIssue = (scoreObj, field) => {
    if (scoreObj.status !== 'good') {
      issues.push(`${field}: ${scoreObj.message}`);
    }
  };
  addIssue(titleScore, 'Title');
  addIssue(metaDescScore, 'Meta description');
  addIssue(focusExistsScore, 'Focus keyword');
  addIssue(keywordInTitleScore, 'Keyword in title');
  addIssue(keywordInDescScore, 'Keyword in meta desc');
  addIssue(descLengthScore, 'Description length');
  addIssue(imageAltScore, 'Image alt');
  addIssue(headingsScore, 'Headings');
  
  return {
    id: product.id,
    name: product.name,
    score: totalScore,
    title: titleForScore,
    metaDescription,
    focusKeyword,
    issues: issues.slice(0, 3), // показываем не более 3 главных проблем
    details: {
      titleScore, metaDescScore, focusExistsScore, keywordInTitleScore, keywordInDescScore,
      descLengthScore, imageAltScore, headingsScore,
    },
  };
}

// Функция для массового анализа (принимает массив товаров)
export function analyzeProducts(products) {
  return products.map(p => analyzeProduct(p));
}

// Функция для получения товаров и анализа (с фильтрами)
export async function fetchAndAnalyze(options = {}) {
  const { ids, category, catId, limit = 50 } = options;
  let products = [];
  if (catId) {
    products = await getProductsByCategory(catId, limit);
  } else if (category) {
    const allCats = await getAllCategories();
    const matched = allCats.find(cat => 
      cat.name.toLowerCase() === category.toLowerCase() || 
      cat.slug.toLowerCase() === category.toLowerCase()
    );
    if (matched) {
      products = await getProductsByCategory(matched.id, limit);
    } else {
      throw new Error(`Category "${category}" not found`);
    }
  } else if (ids && ids.length) {
    products = await getProducts(ids);
  } else {
    products = await getProducts(); // все товары (до 50)
  }
  return analyzeProducts(products);
}