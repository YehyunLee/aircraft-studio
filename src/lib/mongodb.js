// Reusable MongoDB connection helper for Next.js API routes
// Caches the client across hot reloads in dev to prevent connections growing
import { MongoClient } from 'mongodb';

const uri = process.env.MONGODB_URI;
const dbName = process.env.MONGODB_DB || 'aircraft-studio';

if (!uri) {
  console.warn('MONGODB_URI is not set. API routes depending on MongoDB will fail.');
}

let cached = global._mongo;
if (!cached) {
  cached = global._mongo = { conn: null, promise: null };
}

export async function getMongoClient() {
  if (cached.conn) return cached.conn;
  if (!cached.promise) {
    cached.promise = (async () => {
      const client = new MongoClient(uri, {
        maxPoolSize: 10,
        retryWrites: true,
      });
      await client.connect();
      return client;
    })();
  }
  cached.conn = await cached.promise;
  return cached.conn;
}

export async function getDb() {
  const client = await getMongoClient();
  return client.db(dbName);
}
