import mongoose from 'mongoose';
import 'dotenv/config';

let isConnected = false;

export async function connectDB() {
  if (isConnected) return;

  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error('MONGODB_URI not set in .env');
  }

  await mongoose.connect(uri, {
    dbName: process.env.MONGODB_DB || 'woo_seo',
  });

  isConnected = true;
  console.log('✅ MongoDB connected');
}

export async function disconnectDB() {
  if (!isConnected) return;
  await mongoose.disconnect();
  isConnected = false;
}

export default mongoose;
