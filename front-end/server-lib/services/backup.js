import fs from 'fs/promises';
import path from 'path';

export async function createBackup(products) {
  const backupDir = path.join(process.cwd(), 'data', 'backups');
  await fs.mkdir(backupDir, { recursive: true });
  const fileName = `backup_${Date.now()}.json`;
  const filePath = path.join(backupDir, fileName);
  await fs.writeFile(filePath, JSON.stringify(products, null, 2));
  return filePath;
}

export async function getLatestBackup() {
  const backupDir = path.join(process.cwd(), 'data', 'backups');
  const files = await fs.readdir(backupDir);
  const backups = files.filter(f => f.startsWith('backup_')).sort().reverse();
  if (backups.length === 0) return null;
  return path.join(backupDir, backups[0]);
}