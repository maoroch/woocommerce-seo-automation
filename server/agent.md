# Инструкции для AI‑агента (Agent.md)

## 🧠 Цель
Краткое руководство для AI‑агента или нового разработчика проекта **WooCommerce SEO Optimizer**: архитектура, ключевые решения, контракты и практические рекомендации для поддержки и расширения.

## 🏗 Общая архитектура
Проект — CLI‑инструмент на Node.js (ES modules).

- Команды: `src/commands/`
- Взаимодействие с API: `src/lib/`
- Хранение данных: JSON (кэш, бекапы)

Слои:
1. Source Layer — `woocommerce.js`, `openrouter.js`, `ollama.js` (Ollama не используется, код сохранён).
2. Normalization Layer — `export.js` (формирует JSON), `import.schema.js` (валидация).
3. Intelligence Layer — OpenRouter (`ai.js`), пост‑обработка ответов.
4. Human‑in‑the‑Loop — превью, подтверждение, бекап, rollback.

## 🧩 Ключевые файлы и ответственность

| Файл | Ответственность |
|------|----------------|
| `commands/export.js` | Экспорт товаров в JSON (фильтрация, включение полей). |
| `commands/import.js` | Импорт JSON: валидация, diff, бекап, обновление через WooCommerce/WordPress API. |
| `commands/ai.js` | Улучшение товаров через OpenRouter (SEO / content / all, `--examples`). |
| `commands/analyze.js` | Локальный SEO‑анализ (без AI). |
| `commands/rollback.js` | Восстановление из бекапа. |
| `lib/woocommerce.js` | Клиент WooCommerce и WordPress REST API (getProducts, updateProduct, updateProductSlug). |
| `lib/openrouter.js` | Вызовы OpenRouter и извлечение JSON. |
| `lib/ollama.js` | Клиент для локальной Ollama (не используется). |
| `lib/html-validator.js` | Проверка HTML (закрытые теги, иерархия заголовков, alt, пустые ссылки, запрещённые теги). |
| `lib/token-limiter.js` | Ограничение расхода токенов OpenRouter. |
| `services/backup.js` | Создание/чтение бекапов. |
| `services/seo-analyzer.js` | Ядро правил SEO и расчёт баллов. |
| `schemas/import.schema.js` | Zod‑схема для импортируемых товаров. |

## ⚙️ Основные решения, которые нужно знать
- Elementor: обновляется только первый текстовый виджет (`widgetType: 'text-editor'`) — сохранение технических таблиц (второго виджета) обязательно.
- Ollama: отключена; AI‑задачи через OpenRouter (`--no-ollama` по умолчанию).
- SEO‑поля Rank Math: `rank_math_title`, `rank_math_description`, `rank_math_focus_keyword`.
- Slug: обновляется через WordPress REST API (требуется Application Password).
- HTML‑валидатор: реализован на чистом JS, без внешних зависимостей.
- Бекапы: сохраняются в `data/backups/` как `backup_<timestamp>.json`. Rollback использует последний или указанный бекап.
- Лимитер токенов: по умолчанию 10 000 токенов за 10 минут.

## 🚫 Чего не следует делать
- Не менять второй текстовый виджет Elementor (там технические таблицы).
- Не возвращать Ollama без тщательного тестирования.
- Не игнорировать бекапы — создавать их перед массовыми операциями.
- Не удалять флаг `--yes` (используется в автоматизации/CI).

## 🧪 Рекомендации для доработок (приоритеты)
- Пагинация: доработать `getProducts` в `woocommerce.js` для сбора всех страниц.
- Поддержка виджетов Elementor: расширить `replaceTextInElementorElements` (например, `widgetType: 'html'`, `'heading'`).
- Расширение SEO‑анализа: плотность ключевых слов, микроразметка, скорость загрузки (внешний API).
- Интеграция с Google Search Console: использовать официальный API для реальных поисковых запросов и позиций.

## 📘 Пример: добавление пагинации в экспорт
В `woocommerce.js` можно заменить `getProducts` на следующий подход:

```javascript
export async function getAllProducts(ids = []) {
    let all = [];
    let page = 1;
    const perPage = 100;
    while (true) {
        const params = new URLSearchParams();
        if (ids.length) params.append('include', ids.join(','));
        params.append('per_page', perPage);
        params.append('page', page);
        const products = await request(`products?${params.toString()}`);
        if (!products.length) break;
        all.push(...products);
        page++;
    }
    return all;
}
```

Затем в `export.js` используйте `getAllProducts` вместо `getProducts`.

## 📌 Краткое резюме
Проект стабилен. Основные точки расширения — `ai.js` (промпты, пост‑обработка) и `import.js` (новые мета‑поля). Любое изменение, затрагивающее Elementor, должно сохранять вторую часть контента (технические таблицы). Для отладки используйте `--verbose`. Обновляйте эту документацию при добавлении важных решений.
