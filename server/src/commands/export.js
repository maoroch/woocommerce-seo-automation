import { getProducts, getProductsByCategory, getAllCategories } from '../lib/woocommerce.js';
import fs from 'fs/promises';
import path from 'path';
import chalk from 'chalk';

// MongoDB sync — необязателен: если MONGODB_URI не задан, просто пропускаем
async function trySyncToMongo(products) {
  if (!process.env.MONGODB_URI) return;
  try {
    const { connectDB, disconnectDB } = await import('../db/connection.js');
    const { syncOneProduct } = await import('../db/sync.service.js');
    await connectDB();
    let synced = 0;
    for (const p of products) {
      await syncOneProduct(p);
      synced++;
    }
    await disconnectDB();
    console.log(chalk.cyan(`🍃 MongoDB: synced ${synced} products`));
  } catch (err) {
    console.warn(chalk.yellow(`⚠️  MongoDB sync skipped: ${err.message}`));
  }
}

export async function exportCommand(options = {}) {
  const { ids: idsArg, category: categoryName, catId } = options;
  let products = [];

  if (catId) {
    console.log(`📦 Exporting products from category ID ${catId}...`);
    products = await getProductsByCategory(catId);
  } else if (categoryName) {
    console.log(`🔍 Searching category: "${categoryName}"...`);
    const allCats = await getAllCategories();
    const matched = allCats.find(cat => 
      cat.name.toLowerCase() === categoryName.toLowerCase() || 
      cat.slug.toLowerCase() === categoryName.toLowerCase()
    );
    if (!matched) {
      console.error(`❌ Category "${categoryName}" not found by name or slug.`);
      return;
    }
    console.log(`✅ Found category: ${matched.name} (ID: ${matched.id})`);
    products = await getProductsByCategory(matched.id);
    console.log(`📦 Exporting products from category "${matched.name}"...`);
  } else if (idsArg) {
    const ids = idsArg.split(',').map(id => parseInt(id.trim())).filter(id => !isNaN(id));
    console.log(`📦 Exporting products with IDs: ${ids.join(', ')}...`);
    products = await getProducts(ids);
  } else {
    console.log(`📦 Exporting all products...`);
    products = await getProducts();
  }

  const exportData = products.map(p => ({
    id: p.id,
    sku: p.sku,
    slug: p.slug,                            // slug
    name: p.name,
    title: p.name,
    meta_title: p.meta_data?.find(m => m.key === 'rank_math_title')?.value || '',
    meta_description: p.meta_data?.find(m => m.key === 'rank_math_description')?.value || '',
    focus_keyword: p.meta_data?.find(m => m.key === 'rank_math_focus_keyword')?.value || '',
    description: p.description,
    short_description: p.short_description,
    images: p.images.map(img => ({
      id: img.id,
      src: img.src,
      alt: img.alt,
      title: img.title,
    })),
  }));

  const fileName = `export_${Date.now()}.json`;
  const filePath = path.join(process.cwd(), 'data', 'cache', fileName);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(exportData, null, 2));

  console.log(`✅ Exported ${exportData.length} products to ${filePath}`);

  // Синхронизируем в MongoDB (если MONGODB_URI задан)
  await trySyncToMongo(products);

  return filePath;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const idsFlag = args.find(arg => arg.startsWith('--ids='));
  const categoryFlag = args.find(arg => arg.startsWith('--category='));
  const catIdFlag = args.find(arg => arg.startsWith('--catId='));
  
  const ids = idsFlag ? idsFlag.split('=')[1] : null;
  const category = categoryFlag ? categoryFlag.split('=')[1] : null;
  const catId = catIdFlag ? parseInt(catIdFlag.split('=')[1]) : null;

  if ((category && ids) || (catId && ids) || (category && catId)) {
    console.error('❌ Please use only one filter: --ids, --category, or --catId');
    process.exit(1);
  }

  exportCommand({ ids, category, catId }).catch(console.error);
}