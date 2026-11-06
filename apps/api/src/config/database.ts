import mongoose from 'mongoose';
import { env } from './env.js';

export async function connectDatabase(uri: string = env.MONGODB_URI): Promise<typeof mongoose> {
  try {
    const conn = await mongoose.connect(uri, {
      autoIndex: true
    });
    console.log(`[DATABASE] Connected to MongoDB: ${conn.connection.host}/${conn.connection.name}`);
    return conn;
  } catch (err) {
    console.error('[DATABASE] Failed to connect to MongoDB:', err);
    throw err;
  }
}

export async function disconnectDatabase(): Promise<void> {
  await mongoose.disconnect();
}
