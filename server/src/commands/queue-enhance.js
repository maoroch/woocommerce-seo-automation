/**
 * queue-enhance.js — постановка товаров в очередь AI-улучшения
 *
 * Использование:
 *   node src/commands/queue-enhance.js --ids=123,456
 *   node src/commands/queue-enhance.js --low-score=50 --mode=seo
 *   node src/commands/queue-enhance.js --status=idle --mode=all
 */

import chalk from 'chalk';
import { connectDB, disconnectDB } from '../db/connection.js';
import { Product } from '../db/product.model.js';
import { addEnhanceBatch, getQueueStats } from '../queue/queue.js';

export async function queueEnhanceCommand(options = {}) {
  const {
    ids: idsArg,
    lowScore,
    status,
    mode = 'all',
    priority = 10,
    verbose = false,
    obsidianNotes = [],
  } = options;

  await connectDB();

  try {
    let productIds = [];

    if (idsArg) {
      // Конкретные ID
      productIds = (Array.isArray(idsArg) ? idsArg : idsArg.split(','))
        .map(id => parseInt(id))
        .filter(id => !isNaN(id));

    } else if (lowScore !== undefined) {
      // Товары с SEO score ниже порога
      const threshold = parseInt(lowScore);
      const docs = await Product.find({
        'seo_score.total': { $lt: threshold },
        task_status: { $in: ['idle', 'rejected'] },
      }).select('wc_id name seo_score.total').limit(500);

      productIds = docs.map(d => d.wc_id);
      console.log(chalk.blue(`📊 Found ${docs.length} products with SEO score < ${threshold}`));
      if (verbose) {
        docs.forEach(d =>
          console.log(chalk.gray(`   [${d.wc_id}] ${d.name} — score: ${d.seo_score?.total ?? '?'}`))
        );
      }

    } else if (status) {
      // По статусу задачи
      const docs = await Product.find({ task_status: status }).select('wc_id name').limit(500);
      productIds = docs.map(d => d.wc_id);
      console.log(chalk.blue(`📋 Found ${docs.length} products with status "${status}"`));
    } else {
      console.error('❌ Specify --ids, --low-score=<n>, or --status=<status>');
      return;
    }

    if (productIds.length === 0) {
      console.log('✅ No products to queue.');
      return;
    }

    // Обновляем статус в MongoDB
    await Product.updateMany(
      { wc_id: { $in: productIds } },
      { $set: { task_status: 'pending' } }
    );

    // Добавляем в BullMQ
    const jobs = await addEnhanceBatch(productIds, { mode, priority, obsidianNotes });
    if (obsidianNotes.length) {
      console.log(chalk.cyan(`📓 Obsidian context: ${obsidianNotes.join(', ')}`));
    }
    console.log(chalk.green(`\n✅ Queued ${jobs.length} products (mode: ${mode})`));

    // Показываем статистику очереди
    const stats = await getQueueStats();
    console.log(chalk.cyan('\n📊 Queue stats:'));
    console.log(`   Waiting:   ${stats.waiting}`);
    console.log(`   Active:    ${stats.active}`);
    console.log(`   Completed: ${stats.completed}`);
    console.log(`   Failed:    ${stats.failed}`);

  } finally {
    await disconnectDB();
  }
}

// ---- CLI entry point ----
if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const idsFlag       = args.find(a => a.startsWith('--ids='));
  const lowScoreFlag  = args.find(a => a.startsWith('--low-score='));
  const statusFlag    = args.find(a => a.startsWith('--status='));
  const modeFlag      = args.find(a => a.startsWith('--mode='));
  const priorityFlag  = args.find(a => a.startsWith('--priority='));
  const verboseFlag   = args.includes('--verbose');
  const obsidianFlag  = args.find(a => a.startsWith('--obsidian='));

  queueEnhanceCommand({
    ids:       idsFlag      ? idsFlag.split('=')[1]           : null,
    lowScore:  lowScoreFlag ? lowScoreFlag.split('=')[1]      : undefined,
    status:    statusFlag   ? statusFlag.split('=')[1]        : undefined,
    mode:      modeFlag     ? modeFlag.split('=')[1]          : 'all',
    priority:  priorityFlag ? parseInt(priorityFlag.split('=')[1]) : 10,
    verbose:   verboseFlag,
    obsidianNotes: obsidianFlag ? obsidianFlag.split('=')[1].split(',') : [],
  }).catch(err => {
    console.error('❌', err.message);
    process.exit(1);
  });
}
