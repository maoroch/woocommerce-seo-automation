import mongoose from "mongoose";

const MONGODB_URI = process.env.MONGODB_URI || "mongodb://localhost:27017";
const MONGODB_DB = process.env.MONGODB_DB || "woo_seo";

// Кэшируем соединение между запросами (важно для Next.js dev hot-reload)
let cached = (global as any)._mongoose;
if (!cached) {
  cached = (global as any)._mongoose = { conn: null, promise: null };
}

export async function connectDB() {
  if (cached.conn) return cached.conn;

  if (!cached.promise) {
    cached.promise = mongoose.connect(MONGODB_URI, { dbName: MONGODB_DB }).then((m) => m);
  }
  cached.conn = await cached.promise;
  return cached.conn;
}
