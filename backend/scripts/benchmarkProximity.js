/*
Benchmark Proximity Query Performance

This script benchmarks the `User.find` $near query used by the
`/api/users/nearby` endpoint in `src/controllers/userController.js`.
It creates isolated test datasets of 50, 500, and 1000 users with random
coordinates and measures query latency without including database setup or
seeding time.

Prerequisites:
  Set MONGODB_BENCHMARK_URI to a MongoDB connection string whose database
  name is exactly `proxispeak_benchmark`.  Example:
    MONGODB_BENCHMARK_URI=mongodb://localhost:27017/proxispeak_benchmark

Usage:
  node scripts/benchmarkProximity.js

The script prints a summary table with average, p50, p95 latencies (ms)
for each dataset size.
*/

import mongoose from 'mongoose';
import User from '../src/models/User.js';
import Room from '../src/models/Room.js';
import { DEFAULT_AUDIO_RADIUS } from '../src/config/constants.js';
import dotenv from 'dotenv';

dotenv.config();

// ---------------------------------------------------------------------------
// 1. Validate dedicated benchmark URI
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
  // pathname is "/<dbname>" — strip leading slash
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
// 2. Configuration
// ---------------------------------------------------------------------------
const DATASET_SIZES = [50, 500, 1000];
const ITERATIONS = 200;

const randInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

// Track document IDs created by this run so cleanup targets only our records.
const createdUserIds = [];
const createdRoomIds = [];

// ---------------------------------------------------------------------------
// 3. Database helpers
// ---------------------------------------------------------------------------

async function connect() {
  await mongoose.connect(benchUri);
  console.log(`Connected to benchmark database "${parsedDbName}".`);
  // Ensure the schema-defined 2d index exists (idempotent).
  await User.createIndexes();
}

/**
 * Remove only the documents created by this benchmark run, identified by
 * their _id values collected during seeding.  Neither User nor Room schemas
 * define a `benchmarkId` field, so we cannot rely on an ad-hoc property.
 */
async function cleanUp() {
  const userResult = await User.deleteMany({ _id: { $in: createdUserIds } });
  const roomResult = await Room.deleteMany({ _id: { $in: createdRoomIds } });
  console.log(
    `Cleanup: removed ${userResult.deletedCount} user(s), ` +
    `${roomResult.deletedCount} room(s).`
  );
  // Reset tracking arrays for the next dataset run.
  createdUserIds.length = 0;
  createdRoomIds.length = 0;
}

async function seedUsers(count, roomId) {
  const docs = [];
  for (let i = 0; i < count; i++) {
    docs.push({
      username: `bench_user_${i}`,
      email: `bench_user_${i}_${Date.now()}@benchmark.local`,
      avatarUrl: '',
      location: {
        type: 'Point',
        coordinates: [randInt(0, 10000), randInt(0, 10000)],
      },
      isOnline: true,
      roomId,
    });
  }
  const inserted = await User.insertMany(docs);
  createdUserIds.push(...inserted.map((u) => u._id));
}

async function createRoom() {
  const room = await Room.create({
    name: 'BenchmarkRoom',
    description: 'Room for proximity benchmark',
    dimensions: { width: 10000, height: 10000 },
    audioRadius: DEFAULT_AUDIO_RADIUS,
    capacity: 100,
    isPrivate: false,
  });
  createdRoomIds.push(room._id);
  return room._id;
}

// ---------------------------------------------------------------------------
// 4. Benchmark runner
// ---------------------------------------------------------------------------

async function runBenchmark(datasetSize) {
  // Clean up any leftovers from a prior dataset in this run.
  await cleanUp();

  const roomId = await createRoom();
  await seedUsers(datasetSize, roomId);

  // Pick a random query origin inside the canvas.
  const queryX = randInt(0, 10000);
  const queryY = randInt(0, 10000);

  const query = {
    isOnline: true,
    roomId,
    'location.coordinates': {
      $near: [queryX, queryY],
      $maxDistance: DEFAULT_AUDIO_RADIUS,
    },
  };

  // Warm-up run (MongoDB may cache the query plan).
  await User.find(query).lean();

  const latencies = [];
  for (let i = 0; i < ITERATIONS; i++) {
    const start = process.hrtime.bigint();
    await User.find(query).lean();
    const end = process.hrtime.bigint();
    latencies.push(Number(end - start) / 1e6); // ns → ms
  }

  latencies.sort((a, b) => a - b);
  const avg = latencies.reduce((a, b) => a + b, 0) / latencies.length;
  const p50 = latencies[Math.floor(latencies.length * 0.5)];
  const p95 = latencies[Math.floor(latencies.length * 0.95)];

  console.log(`Dataset ${datasetSize} users:`);
  console.log(`  avg: ${avg.toFixed(2)} ms`);
  console.log(`  p50: ${p50.toFixed(2)} ms`);
  console.log(`  p95: ${p95.toFixed(2)} ms`);
  console.log('');
}

// ---------------------------------------------------------------------------
// 5. Main
// ---------------------------------------------------------------------------

async function main() {
  console.log('Connecting to benchmark DB...');
  await connect();
  try {
    for (const size of DATASET_SIZES) {
      await runBenchmark(size);
    }
  } finally {
    // Always clean up remaining records and disconnect.
    try {
      await cleanUp();
    } catch (cleanupErr) {
      console.error('Cleanup error:', cleanupErr.message);
    }
    await mongoose.disconnect();
    console.log('Benchmark finished (DB disconnected).');
  }
}

main().catch((err) => {
  console.error('Benchmark error:', err);
  process.exit(1);
});
