#!/usr/bin/env node

import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import mongoose from 'mongoose';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load env from apps/api/.env first, then root .env
dotenv.config({ path: path.resolve(__dirname, '../apps/api/.env') });
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const nodeEnv = process.env.NODE_ENV || 'development';
const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/openproofpay';

console.log('====================================================');
console.log(' OpenProofPay Guarded Database Reset Tool');
console.log('====================================================');

// 1. Refuse in production
if (nodeEnv === 'production') {
  console.error('[BLOCKED] Database reset is strictly prohibited in production mode!');
  process.exit(1);
}

// 2. Extract database name from URI
let dbName = '';
try {
  const parsed = new URL(mongoUri);
  dbName = parsed.pathname.replace(/^\//, '').split('?')[0];
} catch {
  const match = mongoUri.match(/\/([^/?]+)(\?|$)/);
  if (match) {
    dbName = match[1];
  }
}

if (!dbName) {
  console.error('[ERROR] Could not parse database name from MONGODB_URI.');
  process.exit(1);
}

// 3. Approved dev database name check
const APPROVED_DB_PATTERN = /^openproofpay(_dev|_test)?$/;
if (!APPROVED_DB_PATTERN.test(dbName)) {
  console.error(`[BLOCKED] Target database '${dbName}' is NOT an approved OpenProofPay development database.`);
  console.error('Approved database names: openproofpay, openproofpay_dev, openproofpay_test');
  process.exit(1);
}

console.log(`Environment:      ${nodeEnv}`);
console.log(`Target Database:  ${dbName}`);
console.log(`Host:             ${mongoUri.replace(/\/\/.*@/, '//***:***@')}`);

// 4. Require explicit --confirm flag
const hasConfirmFlag = process.argv.includes('--confirm');

if (!hasConfirmFlag) {
  console.log('\n[SAFETY CHECK]');
  console.log('This command will erase all collections in the development database: ' + dbName);
  console.log('To execute the reset, run:');
  console.log('  npm run db:reset -- --confirm\n');
  process.exit(0);
}

// 5. Connect and reset
async function executeReset() {
  try {
    console.log(`\nConnecting to ${dbName}...`);
    const conn = await mongoose.connect(mongoUri);
    const db = conn.connection.db;

    if (!db) {
      throw new Error('Database instance is undefined after connecting.');
    }

    const collections = await db.listCollections().toArray();
    console.log(`Found ${collections.length} collection(s) in '${dbName}':`);
    for (const c of collections) {
      console.log(` - ${c.name}`);
    }

    if (collections.length === 0) {
      console.log('Database is already clean. Nothing to drop.');
    } else {
      console.log(`\nDropping ${collections.length} collection(s)...`);
      for (const c of collections) {
        await db.dropCollection(c.name);
        console.log(` ✓ Dropped collection: ${c.name}`);
      }
      console.log(`\nSuccessfully reset '${dbName}'. Database is now clean.`);
    }

    await mongoose.disconnect();
    console.log('Disconnected cleanly.');
    process.exit(0);
  } catch (err) {
    console.error('\n[RESET FAILED]:', err);
    await mongoose.disconnect().catch(() => {});
    process.exit(1);
  }
}

executeReset();
