/**
 * sync.js — команда синхронизации WooCommerce → MongoDB
 *
 * Использование:
 *   node src/commands/sync.js [--ids=123,456] [--category="Логгеры"] [--catId=84] [--verbose]
 *   node src/commands/sync.js              (первые 50 товаров)
 *   node src/commands/sync.js --all         (ВЕСЬ каталог + категории, постранично)
 */

import { connectDB, disconnectDB } from '../db/connection.js';
import { syncProducts, syncAllProducts } from '../db/sync.service.js';

export async function syncCommand(options = {}) {
  await connectDB();
  try {
    if (options.all) {
      await syncAllProducts({ verbose: options.verbose });
    } else {
      await syncProducts(options);
    }
  } finally {
    await disconnectDB();
  }
}

// ---- CLI entry point ----
if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const idsFlag      = args.find(a => a.startsWith('--ids='));
  const categoryFlag = args.find(a => a.startsWith('--category='));
  const catIdFlag    = args.find(a => a.startsWith('--catId='));
  const verboseFlag  = args.includes('--verbose');
  const allFlag      = args.includes('--all');

  syncCommand({
    ids:      idsFlag      ? idsFlag.split('=')[1]        : null,
    category: categoryFlag ? categoryFlag.split('=')[1]   : null,
    catId:    catIdFlag    ? parseInt(catIdFlag.split('=')[1]) : null,
    verbose:  verboseFlag,
    all:      allFlag,
  }).catch(err => {
    console.error('❌', err.message);
    process.exit(1);
  });
}
