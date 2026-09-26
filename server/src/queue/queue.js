/**
 * queue.js
 *
 * BullMQ очередь для AI-улучшения товаров.
 *
 * Архитектура:
 *   1. Задачи добавляются через addEnhanceJob()
 *   2. Worker (worker.js) берёт задачи пачками, вызывает OpenRouter
 *   3. Результат сохраняется в MongoDB как ai_suggestion (task_status = 'done')
 *   4. Пользователь ревьюит и запускает import.js (HITL сохраняется!)
 */

import { Queue, QueueEvents } from 'bullmq';
import 'dotenv/config';

const REDIS_HOST = process.env.REDIS_HOST || 'localhost';
const REDIS_PORT = parseInt(process.env.REDIS_PORT || '6379');

const connection = {
  host: REDIS_HOST,
  port: REDIS_PORT,
};

// Основная очередь
export const enhanceQueue = new Queue('seo-enhance', {
  connection,
  defaultJobOptions: {
    attempts: 3,                         // 3 попытки при ошибке
    backoff: { type: 'exponential', delay: 5000 }, // 5s, 10s, 20s
    removeOnComplete: { count: 100 },    // хранить последние 100 выполненных
    removeOnFail:     { count: 50 },
  },
});

// События очереди (для логов / мониторинга)
export const queueEvents = new QueueEvents('seo-enhance', { connection });

/**
 * Добавить товар в очередь на AI-улучшение.
 *
 * @param {number|string} productId  — wc_id товара
 * @param {Object} options
 * @param {string} options.mode      — 'seo' | 'content' | 'all'  (default: 'all')
 * @param {number} options.priority  — приоритет (1 = высший, по умолчанию 10)
 * @param {string} options.note      — произвольная заметка
 * @param {string[]} options.obsidianNotes — id заметок Obsidian для контекста (опционально)
 */
export async function addEnhanceJob(productId, options = {}) {
  const { mode = 'all', priority = 10, note = '', obsidianNotes = [] } = options;

  const job = await enhanceQueue.add(
    'enhance',
    { productId, mode, note, obsidianNotes },
    { priority }
  );

  return job;
}

/**
 * Добавить несколько товаров в очередь.
 * @param {Array<number>} productIds
 * @param {Object} options  — те же, что у addEnhanceJob
 */
export async function addEnhanceBatch(productIds, options = {}) {
  const jobs = productIds.map(id => ({
    name: 'enhance',
    data: {
      productId: id,
      mode: options.mode || 'all',
      note: options.note || '',
      obsidianNotes: options.obsidianNotes || [],
    },
    opts: { priority: options.priority || 10 },
  }));
  return enhanceQueue.addBulk(jobs);
}

/**
 * Получить статистику очереди.
 */
export async function getQueueStats() {
  const [waiting, active, completed, failed, delayed] = await Promise.all([
    enhanceQueue.getWaitingCount(),
    enhanceQueue.getActiveCount(),
    enhanceQueue.getCompletedCount(),
    enhanceQueue.getFailedCount(),
    enhanceQueue.getDelayedCount(),
  ]);
  return { waiting, active, completed, failed, delayed };
}

/**
 * Получить список упавших задач (с причиной ошибки).
 * @param {number} limit
 */
export async function getFailedJobs(limit = 50) {
  const jobs = await enhanceQueue.getFailed(0, limit - 1);
  return jobs.map(job => ({
    id: job.id,
    productId: job.data.productId,
    mode: job.data.mode,
    failedReason: job.failedReason,
    attemptsMade: job.attemptsMade,
    timestamp: job.timestamp,
  }));
}

/**
 * Повторить упавшую задачу по id.
 */
export async function retryFailedJob(jobId) {
  const job = await enhanceQueue.getJob(jobId);
  if (!job) throw new Error(`Job ${jobId} not found`);
  await job.retry();
  return { ok: true };
}

/**
 * Удалить упавшую задачу по id (без повтора).
 */
export async function removeFailedJob(jobId) {
  const job = await enhanceQueue.getJob(jobId);
  if (!job) throw new Error(`Job ${jobId} not found`);
  await job.remove();
  return { ok: true };
}
