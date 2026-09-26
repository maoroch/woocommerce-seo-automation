# 📋 Команды WooCommerce SEO Optimizer

Полный справочник по CLI-командам проекта.

> Работать из папки `server/`.

---

## 🗂️ Экспорт товаров — export.js

Экспортирует товары из WooCommerce в JSON: `data/cache/export_<timestamp>.json`.

Синтаксис
```bash
node src/commands/export.js [--ids=<ids>] [--category=<name>] [--catId=<id>]
```

Аргументы

| Аргумент | Описание |
|---|---|
| `--ids=<ids>` | Экспорт товаров по ID через запятую (например `--ids=123,456`). |
| `--category=<name>` | Экспорт товаров по названию или slug категории (например `--category="Логгеры"` или `--category=loggery`). |
| `--catId=<id>` | Экспорт по числовому ID категории (например `--catId=84`). |

Примечание: нельзя использовать `--ids` вместе с `--category` или `--catId`. Без аргументов экспортируются первые 50 товаров.

Примеры
```bash
# Первые 50 товаров
node src/commands/export.js

# По ID
node src/commands/export.js --ids=18625,25121

# По названию категории
node src/commands/export.js --category="Логгеры"

# По slug категории
node src/commands/export.js --category=loggery

# По ID категории
node src/commands/export.js --catId=84
```

---

## 🤖 AI-улучшение — ai.js

Улучшает SEO-поля и/или контент товаров через OpenRouter API.

Синтаксис
```bash
node src/commands/ai.js --input=<file> [--output=<file>] [--enhance=<mode>] [--examples=<file>] [--verbose]
```

Аргументы

| Аргумент | Описание |
|---|---|
| `--input=<file>` | Обязательно. Путь к JSON, полученному после экспорта. |
| `--output=<file>` | Куда сохранить результат. По умолчанию: `<input>_<mode>_enhanced.json`. |
| `--enhance=<mode>` | `seo` (только мета), `content` (только описание), `all` (всё). По умолчанию `all`. |
| `--examples=<file>` | JSON файла few-shot примеров (массив объектов `{ original, improved }`). |
| `--verbose` | Подробные логи (включая ответы модели). |

Примеры
```bash
# Улучшить всё (по умолчанию)
node src/commands/ai.js --input=data/cache/export_123.json

# Только SEO с примерами
node src/commands/ai.js --input=export.json --enhance=seo --examples=examples.json

# Только контент с подробным логом
node src/commands/ai.js --input=export.json --enhance=content --verbose

# Сохранить в другой файл
node src/commands/ai.js --input=export.json --output=optimized.json
```

---

## 📥 Импорт товаров — import.js

Импортирует улучшённые данные обратно в WooCommerce. Делает проверку, preview и бэкап.

Синтаксис
```bash
node src/commands/import.js --file=<file> [--yes] [--skip-html-validation] [--update-elementor] [--verbose]
```

Аргументы

| Аргумент | Описание |
|---|---|
| `--file=<file>` | Обязательно. Путь к JSON для импорта (обычно результат AI). |
| `--yes` | Авто-подтверждение изменений (без запроса). |
| `--skip-html-validation` | Пропустить валидацию HTML (рисковано). |
| `--update-elementor` | Обновить `_elementor_data` (первый текстовый виджет) новым описанием. |
| `--verbose` | Подробный вывод и отладочная информация. |

Примеры
```bash
# Обычный импорт (с подтверждением)
node src/commands/import.js --file=data/cache/export_all_enhanced.json

# Автоматический импорт без подтверждения
node src/commands/import.js --file=optimized.json --yes

# С обновлением Elementor
node src/commands/import.js --file=optimized.json --update-elementor --yes

# Без HTML-валидации
node src/commands/import.js --file=optimized.json --skip-html-validation --yes
```

---

## ⏪ Откат — rollback.js

Восстанавливает товары из последнего или указанного бэкапа.

Синтаксис
```bash
node src/commands/rollback.js [--file=<backup>]
```

Аргументы

| Аргумент | Описание |
|---|---|
| `--file=<backup>` | Путь к конкретному бекапу. Если не указан — используется последний в `data/backups/`. |

Примеры
```bash
# Откат последнего импорта
node src/commands/rollback.js

# Откат по конкретному файлу
node src/commands/rollback.js --file=data/backups/backup_12345678.json
```

---

## 📊 SEO-анализатор — analyze.js

Оценивает SEO-показатели товаров без использования AI. Выводит таблицу и опционально CSV.

Синтаксис
```bash
node src/commands/analyze.js [--ids=<ids>] [--category=<name>] [--catId=<id>] [--output=<csv>]
```

Аргументы

| Аргумент | Описание |
|---|---|
| `--ids=<ids>` | Анализ по ID (через запятую). |
| `--category=<name>` | Анализ категории по названию или slug. |
| `--catId=<id>` | Анализ категории по числовому ID. |
| `--output=<csv>` | Сохранить отчёт в CSV файл (помимо таблицы в консоли). |

Без фильтров анализируются первые 50 товаров.

Примеры
```bash
# Анализ одного товара
node src/commands/analyze.js --ids=18625

# Анализ категории и сохранить CSV
node src/commands/analyze.js --category="Логгеры" --output=report.csv

# Анализ первых 50 товаров
node src/commands/analyze.js
```

---

## 🧪 Дополнительные заметки

- Бекапы: `data/backups/`. Экспорт: `data/cache/`.
- Для обновления slug требуются `WORDPRESS_USER` и `WORDPRESS_APP_PASSWORD` в `.env`.
- Для AI-команд нужен `OPENROUTER_API_KEY`.
- Используйте `--verbose` для детального дебага при проблемах.
- Рекомендовано тестировать импорт на тестовой среде перед продакшеном.
