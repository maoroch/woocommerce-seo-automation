/**
 * worker.js
 *
 * BullMQ Worker — обрабатывает задачи AI-улучшения из очереди.
 *
 * Запуск:
 *   node src/queue/worker.js
 *
 * Worker берёт товар из MongoDB, отправляет в OpenRouter,
 * сохраняет ai_suggestion и меняет task_status на 'done'.
 * HITL не нарушается: человек всё равно запускает import.js для подтверждения.
 */

import { Worker } from 'bullmq';
import chalk from 'chalk';
import 'dotenv/config';
import { connectDB, disconnectDB } from '../db/connection.js';
import { Product } from '../db/product.model.js';
import { enhanceProductWithAI } from '../services/ai-enhancer.js';
import { buildContext } from '../lib/obsidian.js';

const REDIS_HOST = process.env.REDIS_HOST || 'localhost';
const REDIS_PORT = parseInt(process.env.REDIS_PORT || '6379');

const CONCURRENCY = parseInt(process.env.WORKER_CONCURRENCY || '3');

/**
 * Обработчик одной задачи.
 */
async function processJob(job) {
  const { productId, mode, note, obsidianNotes = [] } = job.data;

  console.log(chalk.blue(`\n⚙️  Job ${job.id} | product ${productId} | mode: ${mode}`));

  // 1. Получаем продукт из MongoDB
  const doc = await Product.findOne({ wc_id: productId });
  if (!doc) {
    throw new Error(`Product ${productId} not found in MongoDB. Run sync first.`);
  }

  // 2. Помечаем как "в обработке"
  doc.task_status = 'processing';
  await doc.save();

  // 3. Вызываем AI (переиспользуем существующий модуль)
  let enhanced;
  try {
    // Формируем объект в формате, который ожидает enhanceProductWithAI
    const productData = {
      id:                doc.wc_id,
      sku:               doc.sku,
      slug:              doc.slug,
      name:              doc.name,
      title:             doc.title,
      meta_title:        doc.meta_title,
      meta_description:  doc.meta_description,
      focus_keyword:     doc.focus_keyword,
      description:       doc.description,
      short_description: doc.short_description,
    };

    const context = await buildContext(obsidianNotes);
    enhanced = await enhanceProductWithAI(productData, { mode, context });
  } catch (err) {
    // При ошибке AI — возвращаем статус и пробрасываем (BullMQ сделает retry)
    doc.task_status = 'idle';
    await doc.save();
    throw err;
  }

  // 4. Сохраняем AI-предложение в MongoDB
  doc.ai_suggestion = {
    ...enhanced,
    mode,
    generated_at: new Date(),
  };
  doc.task_status = 'done';
  doc.addHistory('ai_enhance', [], { note: note || `AI enhance (mode: ${mode})` });
  await doc.save();

  console.log(chalk.green(`  ✅ Job ${job.id} done | product ${productId}`));

  return { productId, mode };
}

// ---------- Запуск Worker ----------

async function startWorker() {
  await connectDB();
  console.log(chalk.cyan(`\n🚀 SEO Enhance Worker started (concurrency: ${CONCURRENCY})`));
  console.log(chalk.gray('   Waiting for jobs... Press Ctrl+C to stop.\n'));

  const worker = new Worker('seo-enhance', processJob, {
    connection: { host: REDIS_HOST, port: REDIS_PORT },
    concurrency: CONCURRENCY,
  });

  worker.on('completed', (job) => {
    console.log(chalk.green(`✔  Job ${job.id} completed`));
  });

  worker.on('failed', (job, err) => {
    console.error(chalk.red(`✗  Job ${job?.id} failed: ${err.message}`));
  });

  worker.on('error', (err) => {
    console.error(chalk.red(`Worker error: ${err.message}`));
  });

  // Graceful shutdown
  process.on('SIGINT', async () => {
    console.log(chalk.yellow('\n⏹️  Shutting down worker...'));
    await worker.close();
    await disconnectDB();
    process.exit(0);
  });
}

startWorker().catch(err => {
  console.error(chalk.red(`Failed to start worker: ${err.message}`));
  process.exit(1);
});
