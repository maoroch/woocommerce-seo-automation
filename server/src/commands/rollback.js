import fs from 'fs/promises';
import path from 'path';
import chalk from 'chalk';
import { updateProduct, updateProductSlug } from '../lib/woocommerce.js';

async function mongoRecordRollback(productId, backupFile) {
  if (!process.env.MONGODB_URI) return;
  try {
    const { connectDB } = await import('../db/connection.js');
    const { Product } = await import('../db/product.model.js');
    await connectDB();
    const doc = await Product.findOne({ wc_id: productId });
    if (!doc) return;
    doc.addHistory('rollback', [], {
      source_file: path.basename(backupFile),
      note: 'Rollback from backup',
    });
    doc.task_status = 'idle';
    await doc.save();
  } catch (err) {
    console.warn(chalk.yellow(`  ⚠️  MongoDB update skipped: ${err.message}`));
  }
}

export async function rollbackCommand(backupPath = null) {
  if (!backupPath) {
    const backupDir = path.join(process.cwd(), 'data', 'backups');
    const files = await fs.readdir(backupDir);
    const backups = files.filter(f => f.startsWith('backup_')).sort().reverse();
    if (backups.length === 0) {
      console.log('❌ No backups found.');
      return;
    }
    backupPath = path.join(backupDir, backups[0]);
    console.log(`📦 Using latest backup: ${backups[0]}`);
  }

  let backupData;
  try {
    const raw = await fs.readFile(backupPath, 'utf8');
    backupData = JSON.parse(raw);
  } catch (err) {
    console.error(`❌ Failed to read backup: ${err.message}`);
    return;
  }

  const products = Array.isArray(backupData) ? backupData : [backupData];
  console.log(`🔄 Restoring ${products.length} product(s)...`);

  let success = 0;
  let failed = 0;
  for (const product of products) {
    try {
      // Восстанавливаем основные поля
      const updateData = {
        name: product.name,
        description: product.description,
        short_description: product.short_description,
        meta_data: product.meta_data,
        images: product.images,
      };
      await updateProduct(product.id, updateData);
      
      // Восстанавливаем slug (если был в бекапе)
      if (product.slug) {
        await updateProductSlug(product.id, product.slug);
      }
      
      console.log(`✅ Restored product ${product.id} — ${product.name}`);
      success++;
      await mongoRecordRollback(product.id, backupPath);
    } catch (err) {
      console.error(`❌ Failed to restore product ${product.id}: ${err.message}`);
      failed++;
    }
  }

  console.log(`\n🎉 Rollback finished: ${success} restored, ${failed} failed.`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const fileFlag = args.find(arg => arg.startsWith('--file='));
  const backupPath = fileFlag ? fileFlag.split('=')[1] : null;
  rollbackCommand(backupPath).catch(console.error);
}