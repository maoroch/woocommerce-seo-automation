/**
 * status.js — обзор состояния продуктов в MongoDB
 *
 * Использование:
 *   node src/commands/status.js
 *   node src/commands/status.js --ids=123,456
 *   node src/commands/status.js --low-score=50
 *   node src/commands/status.js --history=123   (история одного товара)
 */

import chalk from 'chalk';
import Table from 'cli-table3';
import { connectDB, disconnectDB } from '../db/connection.js';
import { Product } from '../db/product.model.js';

function scoreColor(score) {
  if (score >= 70) return chalk.green(score);
  if (score >= 40) return chalk.yellow(score);
  return chalk.red(score);
}

function statusBadge(status) {
  const map = {
    idle:       chalk.gray('idle'),
    pending:    chalk.cyan('pending'),
    processing: chalk.blue('processing'),
    done:       chalk.magenta('done ✨'),
    approved:   chalk.green('approved ✅'),
    rejected:   chalk.red('rejected'),
  };
  return map[status] ?? chalk.white(status);
}

/**
 * Общая сводка по всем продуктам.
 */
async function showOverview() {
  const total = await Product.countDocuments();
  if (total === 0) {
    console.log(chalk.yellow('No products in MongoDB. Run: node src/commands/sync.js'));
    return;
  }

  // Группировка по статусу
  const statusAgg = await Product.aggregate([
    { $group: { _id: '$task_status', count: { $sum: 1 } } },
    { $sort: { _id: 1 } },
  ]);

  // SEO score распределение
  const scoreAgg = await Product.aggregate([
    {
      $group: {
        _id: null,
        avg:  { $avg: '$seo_score.total' },
        min:  { $min: '$seo_score.total' },
        max:  { $max: '$seo_score.total' },
        below50: { $sum: { $cond: [{ $lt: ['$seo_score.total', 50] }, 1, 0] } },
        above70: { $sum: { $cond: [{ $gte: ['$seo_score.total', 70] }, 1, 0] } },
      },
    },
  ]);
  const score = scoreAgg[0] ?? {};

  // Последняя синхронизация
  const lastSync = await Product.findOne({}, { wc_synced_at: 1 }).sort({ wc_synced_at: -1 });

  console.log(chalk.bold.cyan('\n📊 MongoDB Product Status\n'));
  console.log(`  Total products : ${chalk.white(total)}`);
  console.log(`  Last WC sync   : ${lastSync?.wc_synced_at ? chalk.white(lastSync.wc_synced_at.toLocaleString()) : chalk.gray('never')}`);

  console.log(chalk.bold('\n  SEO Scores:'));
  console.log(`    Average : ${scoreColor(Math.round(score.avg ?? 0))}`);
  console.log(`    Min     : ${scoreColor(score.min ?? 0)}`);
  console.log(`    Max     : ${scoreColor(score.max ?? 0)}`);
  console.log(`    < 50    : ${chalk.red(score.below50 ?? 0)} products need improvement`);
  console.log(`    ≥ 70    : ${chalk.green(score.above70 ?? 0)} products are good`);

  console.log(chalk.bold('\n  Task Status:'));
  for (const s of statusAgg) {
    console.log(`    ${statusBadge(s._id).padEnd(25)} ${chalk.white(s.count)}`);
  }
  console.log('');
}

/**
 * Таблица продуктов с фильтрацией.
 */
async function showProductTable(options = {}) {
  const { ids, lowScore } = options;
  let query = {};

  if (ids) {
    const idList = ids.split(',').map(Number).filter(Boolean);
    query = { wc_id: { $in: idList } };
  } else if (lowScore !== undefined) {
    query = { 'seo_score.total': { $lt: parseInt(lowScore) } };
  }

  const docs = await Product.find(query)
    .sort({ 'seo_score.total': 1 })
    .limit(100)
    .select('wc_id sku name seo_score task_status wc_synced_at imported_at');

  if (docs.length === 0) {
    console.log(chalk.yellow('No products found.'));
    return;
  }

  const table = new Table({
    head: [
      chalk.cyan('WC ID'),
      chalk.cyan('SKU'),
      chalk.cyan('Name'),
      chalk.cyan('SEO'),
      chalk.cyan('Status'),
      chalk.cyan('Synced'),
    ],
    colWidths: [8, 14, 36, 6, 14, 14],
    style: { compact: true },
  });

  for (const d of docs) {
    table.push([
      d.wc_id,
      d.sku || '—',
      (d.name || '').slice(0, 34),
      scoreColor(d.seo_score?.total ?? 0),
      statusBadge(d.task_status),
      d.wc_synced_at ? d.wc_synced_at.toLocaleDateString() : '—',
    ]);
  }

  console.log(chalk.bold.cyan(`\n📋 Products (${docs.length} shown)\n`));
  console.log(table.toString());
}

/**
 * История изменений одного продукта.
 */
async function showHistory(productId) {
  const doc = await Product.findOne({ wc_id: parseInt(productId) }).select('wc_id name history');
  if (!doc) {
    console.log(chalk.red(`Product ${productId} not found in MongoDB.`));
    return;
  }

  console.log(chalk.bold.cyan(`\n📜 History for product ${doc.wc_id} — ${doc.name}\n`));

  if (!doc.history?.length) {
    console.log(chalk.gray('  No history yet.'));
    return;
  }

  // Показываем последние 20 записей, свежие первыми
  const entries = [...doc.history].reverse().slice(0, 20);

  for (const entry of entries) {
    const date = new Date(entry.created_at).toLocaleString();
    const action = chalk.bold(entry.action.padEnd(12));
    const scoreDiff = (entry.seo_score_before != null && entry.seo_score_after != null)
      ? `  SEO: ${scoreColor(entry.seo_score_before)} → ${scoreColor(entry.seo_score_after)}`
      : '';

    console.log(`  ${chalk.gray(date)}  ${action}${scoreDiff}`);
    if (entry.note) console.log(chalk.gray(`    Note: ${entry.note}`));

    for (const ch of (entry.changes ?? [])) {
      const oldVal = String(ch.old_value ?? '').slice(0, 50);
      const newVal = String(ch.new_value ?? '').slice(0, 50);
      console.log(
        chalk.gray(`    • ${ch.field}: `) +
        chalk.red(`"${oldVal}"`) +
        chalk.gray(' → ') +
        chalk.green(`"${newVal}"`)
      );
    }
    console.log('');
  }
}

// ---- Main ----

export async function statusCommand(options = {}) {
  await connectDB();
  try {
    if (options.history) {
      await showHistory(options.history);
    } else if (options.ids || options.lowScore !== undefined) {
      await showProductTable(options);
    } else {
      await showOverview();
    }
  } finally {
    await disconnectDB();
  }
}

// ---- CLI entry point ----
if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const idsFlag       = args.find(a => a.startsWith('--ids='));
  const lowScoreFlag  = args.find(a => a.startsWith('--low-score='));
  const historyFlag   = args.find(a => a.startsWith('--history='));

  statusCommand({
    ids:      idsFlag      ? idsFlag.split('=')[1]       : null,
    lowScore: lowScoreFlag ? lowScoreFlag.split('=')[1]  : undefined,
    history:  historyFlag  ? historyFlag.split('=')[1]   : null,
  }).catch(err => {
    console.error('❌', err.message);
    process.exit(1);
  });
}
