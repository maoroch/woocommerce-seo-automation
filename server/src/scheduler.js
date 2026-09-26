/**
 * scheduler.js
 *
 * Планировщик автоматической полной синхронизации WooCommerce → MongoDB.
 *
 * Запуск (отдельный долгоживущий процесс, например через pm2/systemd):
 *   node src/scheduler.js
 *
 * Расписание задаётся через .env:
 *   SYNC_CRON_SCHEDULE="0 3 * * *"   — каждый день в 03:00 (по умолчанию)
 *   SYNC_CRON_ENABLED=true            — включить/выключить (по умолчанию true)
 *
 * Формат cron: "минута час день месяц день_недели"
 * Примеры:
 *   "0 3 * * *"      — каждый день в 03:00
 *   "0 /6 * * *"    — каждые 6 часов
 *   "0 3 * * 1"      — каждый понедельник в 03:00
 */

import cron from 'node-cron';
import chalk from 'chalk';
import 'dotenv/config';
import { connectDB, disconnectDB } from './db/connection.js';
import { syncAllProducts } from './db/sync.service.js';

const SCHEDULE = process.env.SYNC_CRON_SCHEDULE || '0 3 * * *';
const ENABLED = (process.env.SYNC_CRON_ENABLED ?? 'true') !== 'false';

async function runFullSync() {
  const startedAt = new Date();
  console.log(chalk.cyan(`\n⏰ [${startedAt.toLocaleString()}] Scheduled full sync starting...`));

  await connectDB();
  try {
    const stats = await syncAllProducts({ verbose: false });
    const took = ((Date.now() - startedAt.getTime()) / 1000).toFixed(1);
    console.log(chalk.green(`✅ Scheduled sync finished in ${took}s`));
    return stats;
  } catch (err) {
    console.error(chalk.red(`❌ Scheduled sync failed: ${err.message}`));
    throw err;
  } finally {
    await disconnectDB();
  }
}

function start() {
  if (!ENABLED) {
    console.log(chalk.yellow('⏸️  Scheduler disabled (SYNC_CRON_ENABLED=false). Exiting.'));
    return;
  }

  if (!cron.validate(SCHEDULE)) {
    console.error(chalk.red(`❌ Invalid cron schedule: "${SCHEDULE}"`));
    process.exit(1);
  }

  console.log(chalk.cyan(`\n🚀 SEO Sync Scheduler started`));
  console.log(chalk.gray(`   Schedule: "${SCHEDULE}"`));
  console.log(chalk.gray(`   Next runs follow this cron expression. Press Ctrl+C to stop.\n`));

  cron.schedule(SCHEDULE, () => {
    runFullSync().catch(() => {
      // ошибка уже залогирована, не валим процесс — ждём следующего тика
    });
  });

  // Graceful shutdown
  process.on('SIGINT', () => {
    console.log(chalk.yellow('\n⏹️  Scheduler stopped.'));
    process.exit(0);
  });
}

// ---- CLI entry point ----
if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);

  if (args.includes('--now')) {
    // Запустить полную синхронизацию один раз сразу (без планировщика)
    runFullSync()
      .then(() => process.exit(0))
      .catch(() => process.exit(1));
  } else {
    start();
  }
}
