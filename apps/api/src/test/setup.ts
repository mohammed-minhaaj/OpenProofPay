import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';

let mongoServer: MongoMemoryServer | undefined;

export async function setupTestDb(): Promise<void> {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }

  const testUri = process.env.MONGODB_TEST_URI || 'mongodb://127.0.0.1:27017/openproofpay_test';

  try {
    await mongoose.connect(testUri, { serverSelectionTimeoutMS: 1000, connectTimeoutMS: 1000 });
    return;
  } catch {
    // If local test db is not reachable, fall back to in-memory server
  }

  try {
    if (!process.env.MONGOMS_SYSTEM_BINARY && process.platform === 'darwin') {
      process.env.MONGOMS_SYSTEM_BINARY = '/opt/homebrew/bin/mongod';
    }

    mongoServer = await MongoMemoryServer.create({
      instance: {
        dbName: 'openproofpay_test'
      },
      binary: {
        systemBinary: process.env.MONGOMS_SYSTEM_BINARY || '/opt/homebrew/bin/mongod'
      }
    });

    const uri = mongoServer.getUri();
    await mongoose.connect(uri);
  } catch (err) {
    console.warn('[setupTestDb] Could not connect to MongoMemoryServer:', err);
    throw err;
  }
}

export async function clearTestDb(): Promise<void> {
  if (mongoose.connection.readyState !== 0) {
    const collections = mongoose.connection.collections;
    for (const key in collections) {
      const collection = collections[key];
      if (collection) {
        await collection.deleteMany({});
      }
    }
  }
}

export async function teardownTestDb(): Promise<void> {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }
  if (mongoServer) {
    await mongoServer.stop();
  }
}
