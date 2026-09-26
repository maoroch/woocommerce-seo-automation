// src/commands/analyze.js
import { fetchAndAnalyze } from '../services/seo-analyzer.js';
import fs from 'fs/promises';
import path from 'path';

function printTable(results) {
  console.log('\n📊 SEO Analysis Report\n');
  console.log('ID'.padEnd(8) + 'Score'.padEnd(8) + 'Title (truncated)'.padEnd(40) + 'Issues');
  console.log('-'.repeat(80));
  for (const res of results) {
    const idStr = res.id.toString().padEnd(8);
    const scoreStr = (res.score.toString() + '/100').padEnd(8);
    const titleShort = (res.title.length > 35 ? res.title.slice(0, 32) + '...' : res.title).padEnd(40);
    const issuesShort = res.issues.slice(0, 2).join('; ');
    console.log(`${idStr}${scoreStr}${titleShort}${issuesShort}`);
  }
  console.log('\n');
}

async function exportToCsv(results, filePath) {
  const headers = ['id', 'name', 'score', 'title', 'meta_description', 'focus_keyword', 'issues'];
  const rows = results.map(r => [
    r.id,
    `"${r.name.replace(/"/g, '""')}"`,
    r.score,
    `"${r.title.replace(/"/g, '""')}"`,
    `"${r.metaDescription.replace(/"/g, '""')}"`,
    `"${r.focusKeyword.replace(/"/g, '""')}"`,
    `"${r.issues.join('; ').replace(/"/g, '""')}"`,
  ]);
  const csvContent = [headers.join(','), ...rows.map(row => row.join(','))].join('\n');
  await fs.writeFile(filePath, csvContent, 'utf8');
  console.log(`📄 Results exported to ${filePath}`);
}

export async function analyzeCommand(options = {}) {
  const { ids, category, catId, output } = options;
  try {
    console.log('🔍 Fetching products and analyzing...');
    const results = await fetchAndAnalyze({ ids, category, catId });
    printTable(results);
    if (output) {
      await exportToCsv(results, output);
    }
    const avgScore = results.reduce((sum, r) => sum + r.score, 0) / results.length;
    console.log(`📈 Average SEO score: ${avgScore.toFixed(1)}/100`);
  } catch (err) {
    console.error('❌ Analysis failed:', err.message);
  }
}

// CLI
if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const idsFlag = args.find(arg => arg.startsWith('--ids='));
  const categoryFlag = args.find(arg => arg.startsWith('--category='));
  const catIdFlag = args.find(arg => arg.startsWith('--catId='));
  const outputFlag = args.find(arg => arg.startsWith('--output='));
  
  const ids = idsFlag ? idsFlag.split('=')[1].split(',').map(Number) : null;
  const category = categoryFlag ? categoryFlag.split('=')[1] : null;
  const catId = catIdFlag ? parseInt(catIdFlag.split('=')[1]) : null;
  const output = outputFlag ? outputFlag.split('=')[1] : null;
  
  analyzeCommand({ ids, category, catId, output }).catch(console.error);
}