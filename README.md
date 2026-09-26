# 🚀 WooCommerce SEO Optimizer (Human-in-the-Loop)

[![Node.js](https://img.shields.io/badge/Node.js-18%2B-green)](https://nodejs.org/)
[![License](https://img.shields.io/badge/License-MIT-blue)](LICENSE)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](http://makeapullrequest.com)
[![OpenRouter](https://img.shields.io/badge/Powered%20by-OpenRouter-orange)](https://openrouter.ai)

Bulk SEO optimization for WooCommerce + Rank Math — Export → AI enhance (or manual) → validate → preview → import with backup & rollback. Designed for human review and safe, predictable updates.

---

## ✨ Features

- 📦 Export products by ID, category, slug, or all (default 50, pagination supported).
- 🔄 Import with diff preview, confirmation prompt, automatic backup, and rollback.
- 🧠 Rank Math support: meta_title, meta_description, focus_keyword.
- 🔗 Slug updates via WordPress REST API (permits permalink changes not supported by WooCommerce REST API).
- 🛡️ Elementor-safe updates: only the first text widget is modified; technical tables and other critical widgets are preserved.
- 🧰 HTML validation with colored error snippets to prevent malformed content from reaching the site.
- 🤖 AI enhancement (OpenRouter): fast, cheap, and stable LLM-based rewriting with human-in-the-loop review.
- 📊 SEO analyzer (no AI): returns a 0–100 score and can export reports to CSV.
- ⏮️ Rollback: revert the last import from backup.

---

## 🛠 Installation & Setup

Clone and install:

```bash
git clone <repo-url>
cd server
npm install
cp .env.example .env
```

Edit `.env` with your credentials:

```env
WC_URL=https://your-site.com
WC_CONSUMER_KEY=ck_...
WC_CONSUMER_SECRET=cs_...
WORDPRESS_USER=admin_username
WORDPRESS_APP_PASSWORD=xxxx xxxx xxxx xxxx
OPENROUTER_API_KEY=sk-or-v1-...
OPENROUTER_MODEL=openrouter/auto
```

---

## 📦 Usage

1. Export products
```bash
node src/commands/export.js --ids=123,456
node src/commands/export.js --category="Loggers"
```

2. AI enhancement (OpenRouter)
```bash
node src/commands/ai.js --input=export.json --enhance=all --examples=examples.json --verbose
```

3. Import with preview & backup
```bash
node src/commands/import.js --file=..._enhanced.json [--yes] [--skip-html-validation]
```

4. Rollback last import
```bash
node src/commands/rollback.js [--file=backup.json]
```

5. SEO analysis (no AI)
```bash
node src/commands/analyze.js --ids=123 --output=report.csv
```

---

## 🧠 Architectural decisions & outcomes

| Decision | Why? | Outcome |
|---|---|---|
| JSON storage initially | Fast MVP, no DB overhead | Good for 150–500 products; migrate to PostgreSQL later if needed |
| OpenRouter over local LLM | Local Ollama was slow/unreliable | Stable, fast, predictable cost |
| Partial Elementor update | Preserve technical widgets and exact specs | Prevents hallucinations and destructive edits |
| Human-in-the-Loop previews | Business‑critical changes require review | Zero accidental SEO damage; trusted workflow |
| Automatic backup & rollback | Safety net for imports | Easy recovery from mistakes |
| Advanced HTML validation | Detect broken markup early | Avoids broken tables, missing alt tags, malformed headings |
| Slug updates via WP REST API | WooCommerce REST API lacks slug changes | Full control over permalinks |

---

## 🧪 Tech stack

- Node.js 18+ (ES modules, native fetch)
- OpenRouter API (LLM aggregation)
- WooCommerce REST API + WordPress REST API
- Zod (schema validation)
- chalk (colored terminal output)
- readline (interactive confirmations)

---

## 📄 License

MIT © Ilyas Salimov
