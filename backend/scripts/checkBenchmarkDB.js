/*
Check Benchmark Database — Read-Only Inspector

Connects to the dedicated benchmark database and prints the User model's
collection name and indexes. Does NOT modify any data or indexes.

Prerequisites:
  Set MONGODB_BENCHMARK_URI to a MongoDB connection string whose database
  name is exactly `proxispeak_benchmark`.

Usage:
  node scripts/checkBenchmarkDB.js
*/

import mongoose from 'mongoose';
import User from '../src/models/User.js';
import dotenv from 'dotenv';

dotenv.config();

// ---------------------------------------------------------------------------
// 1. Validate dedicated benchmark URI (same logic as benchmarkProximity.js)
// ---------------------------------------------------------------------------
const benchUri = process.env.MONGODB_BENCHMARK_URI;

if (!benchUri) {
  console.error(
    'ERROR: MONGODB_BENCHMARK_URI environment variable is not set.\n' +
    'Set it to a MongoDB URI whose database name is exactly "proxispeak_benchmark".'
  );
  process.exit(1);
}

let parsedDbName;
try {
  const url = new URL(benchUri);
  parsedDbName = url.pathname.replace(/^\//, '').split('/')[0];
} catch (err) {
  console.error('ERROR: MONGODB_BENCHMARK_URI is not a valid URL:', err.message);
  process.exit(1);
}

if (parsedDbName !== 'proxispeak_benchmark') {
  console.error(
    `ERROR: MONGODB_BENCHMARK_URI database name is "${parsedDbName}", ` +
    'but must be exactly "proxispeak_benchmark".'
  );
  process.exit(1);
}

// ---------------------------------------------------------------------------
// 2. Connect, inspect, disconnect
// ---------------------------------------------------------------------------
async function main() {
  await mongoose.connect(benchUri);
  try {
    console.log(`Database: ${parsedDbName}`);
    console.log(`User collection: ${User.collection.collectionName}`);
    const indexes = await User.collection.getIndexes({});
    console.log('User indexes:', JSON.stringify(indexes, null, 2));
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected.');
  }
}

main().catch((err) => {
  console.error('checkBenchmarkDB error:', err.message);
  process.exit(1);
});
