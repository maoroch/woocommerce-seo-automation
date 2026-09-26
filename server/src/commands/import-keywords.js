// src/commands/import-keywords.js
import fs from 'fs/promises';
import readline from 'readline';
import { getProducts, updateProduct } from '../lib/woocommerce.js';

async function confirm(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => rl.question(question, answer => {
    rl.close();
    resolve(answer.toLowerCase() === 'y');
  }));
}

export async function importKeywordsCommand(filePath, options = {}) {
  const { autoConfirm = false, dryRun = false } = options;

  console.log(`📖 Чтение файла: ${filePath}`);
  let data;
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    data = JSON.parse(raw);
  } catch (err) {
    console.error(`❌ Ошибка чтения/парсинга: ${err.message}`);
    return;
  }

  if (!Array.isArray(data)) {
    console.error('❌ Файл должен содержать массив объектов { id, focus_keywords }');
    return;
  }

  // Валидация каждого элемента
  const items = [];
  for (const item of data) {
    if (!item.id || typeof item.id !== 'number') {
      console.error(`❌ Пропущен элемент без id: ${JSON.stringify(item)}`);
      continue;
    }
    if (!Array.isArray(item.focus_keywords) || item.focus_keywords.length === 0) {
      console.warn(`⚠️ Товар ${item.id} не имеет массива focus_keywords, пропускаем`);
      continue;
    }
    items.push({ id: item.id, keywords: item.focus_keywords });
  }

  if (items.length === 0) {
    console.log('✅ Нет данных для импорта');
    return;
  }

  console.log(`📦 Найдено товаров: ${items.length}`);

  // Получаем текущие товары
  const ids = items.map(i => i.id);
  console.log(`📡 Загрузка текущих данных из WooCommerce...`);
  const currentProducts = await getProducts(ids);
  const currentMap = new Map(currentProducts.map(p => [p.id, p]));

  // Собираем изменения
  const changes = [];
  for (const item of items) {
    const oldProduct = currentMap.get(item.id);
    if (!oldProduct) {
      console.warn(`⚠️ Товар ${item.id} не найден в магазине, пропускаем`);
      continue;
    }
    const oldKeyword = oldProduct.meta_data?.find(m => m.key === 'rank_math_focus_keyword')?.value || '';
    const newKeyword = item.keywords.join(', ');
    if (oldKeyword === newKeyword) continue;
    changes.push({
      id: item.id,
      name: oldProduct.name,
      oldKeyword,
      newKeyword,
    });
  }

  if (changes.length === 0) {
    console.log('✅ Нет изменений');
    return;
  }

  // Preview
  console.log('\n📋 Preview изменений:\n');
  for (const ch of changes) {
    console.log(`🆔 ${ch.id} — ${ch.name}`);
    console.log(`   focus_keyword: "${ch.oldKeyword}" → "${ch.newKeyword}"\n`);
  }

  if (dryRun) {
    console.log('🏁 Dry-run завершён, изменения не применены');
    return;
  }

  if (!autoConfirm) {
    const ok = await confirm('⚠️ Применить изменения? (y/N): ');
    if (!ok) {
      console.log('❌ Отменено.');
      return;
    }
  }

  // Применяем
  let success = 0;
  let failed = 0;
  for (const ch of changes) {
    try {
      // Получаем актуальные meta_data товара (чтобы не затереть другие поля)
      const product = currentMap.get(ch.id);
      const oldMeta = product.meta_data || [];
      const metaMap = new Map(oldMeta.map(m => [m.key, m.value]));
      metaMap.set('rank_math_focus_keyword', ch.newKeyword);
      const updateData = {
        meta_data: Array.from(metaMap, ([key, value]) => ({ key, value })),
      };
      await updateProduct(ch.id, updateData);
      console.log(`✅ Обновлён товар ${ch.id} — ${ch.name}`);
      success++;
    } catch (err) {
      console.error(`❌ Ошибка товара ${ch.id}: ${err.message}`);
      failed++;
    }
  }

  console.log(`\n🎉 Импорт завершён: ${success} обновлено, ${failed} ошибок.`);
}

// CLI
if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const fileFlag = args.find(a => a.startsWith('--file='));
  const yesFlag = args.includes('--yes');
  const dryRunFlag = args.includes('--dry-run');

  if (!fileFlag) {
    console.error('Usage: node import-keywords.js --file=keywords.json [--yes] [--dry-run]');
    process.exit(1);
  }
  const filePath = fileFlag.split('=')[1];
  importKeywordsCommand(filePath, { autoConfirm: yesFlag, dryRun: dryRunFlag }).catch(console.error);
}