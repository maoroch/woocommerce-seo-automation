# SEO Proof Desk — Dashboard

Next.js веб-интерфейс для WooCommerce SEO Optimizer. Читает и пишет в ту же
MongoDB, что и CLI-инструменты (`server/`).

WooCommerce остаётся источником истины. Dashboard только показывает зеркало
из MongoDB и позволяет approve/reject AI-предложений — реальный импорт в
WooCommerce всё равно выполняется через `import.js` с diff/preview/backup
(HITL не нарушается).

---

## Страницы

1. **Dashboard** (`/`) — общая статистика: средний SEO score, сколько
   товаров требуют внимания, лента последних изменений.
2. **Products** (`/products`) — таблица всех товаров с фильтрами (поиск,
   статус, score, сортировка) → клик открывает детальную страницу с полной
   историей изменений (diff-вид).
3. **Queue** (`/queue`) — review desk: AI-предложения (`task_status: done`)
   с возможностью Approve / Reject прямо из интерфейса.

---

## Установка

```bash
npm install
cp .env.local.example .env.local
```

В `.env.local` укажи тот же `MONGODB_URI` / `MONGODB_DB`, что использует
backend (`server/.env`):

```env
MONGODB_URI=mongodb://localhost:27017
MONGODB_DB=woo_seo
```

## Запуск

```bash
npm run dev       # http://localhost:3000
```

```bash
npm run build
npm start
```

---

## Как это соотносится с backend (`server/`)

- `node src/commands/sync.js` — наполняет MongoDB данными → видно на Dashboard/Products.
- `node src/commands/queue-enhance.js` + `node src/queue/worker.js` — генерируют
  `ai_suggestion` → товары появляются на странице Queue со статусом "Needs review".
- Approve в Queue ставит `task_status: approved` — после этого экспортируй
  одобренные товары и запускай `node src/commands/import.js --file=... --yes`
  для записи в WooCommerce (с бэкапом).
- Reject — очищает `ai_suggestion`, можно поставить товар в очередь снова.
