// ---------------------------------------------------------------
// scripts/benchmark-nearby.js - the Week 2 spatial audit.
// Run with:  npm run bench:nearby   (MongoDB must be connected)
//
// For 50, 500 and 1000 people it checks two things:
//   1. SPEED: how long the $near query takes (100 random queries each).
//      - "database time" is the work MongoDB does (the target: under 20 ms).
//      - "round trip" is the full time from this computer, including the
//        internet. Cloud databases are always slower here.
//   2. ACCURACY: the $near results match a plain distance calculation.
// It writes everything to audit-results.md. Test people are written to
// a room called "__bench__" and deleted again at the end.
// ---------------------------------------------------------------
require("dotenv").config();
const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");
const User = require("../models/User");

const ROOM = "__bench__";
const SIZES = [50, 500, 1000];
const QUERIES_PER_SIZE = 100;
const AUDIT_QUERIES_PER_SIZE = 20;
const RADIUS = 100;
const TARGET_MS = 20;

const randomInt = (min, max) => min + Math.floor(Math.random() * (max - min + 1));
const randomPoint = () => ({ x: randomInt(18, 702), y: randomInt(18, 402) });
const round1 = (n) => Math.round(n * 10) / 10;

function percentile(sortedValues, p) {
  const index = Math.min(sortedValues.length - 1, Math.ceil(sortedValues.length * p) - 1);
  return sortedValues[Math.max(0, index)];
}

// MongoDB's own timing for the query (no internet time included).
async function databaseMs(query) {
  const plan = await User.find(query).explain("executionStats");
  const stats = plan.executionStats || (plan[0] && plan[0].executionStats);
  return stats.executionTimeMillis;
}

async function runSize(size) {
  await User.deleteMany({ roomId: ROOM });
  const people = Array.from({ length: size }, (_, i) => ({
    username: `bench-${i}`,
    roomId: ROOM,
    isOnline: true,
    location: { coordinates: [randomInt(18, 702), randomInt(18, 402)] },
  }));
  await User.insertMany(people);

  // SPEED
  const dbTimes = [];
  const roundTrips = [];
  for (let i = 0; i < QUERIES_PER_SIZE; i++) {
    const point = randomPoint();
    const query = User.nearbyQuery(ROOM, point, RADIUS);

    dbTimes.push(await databaseMs(query));

    const start = performance.now();
    await User.find(query).select("_id").lean();
    roundTrips.push(performance.now() - start);
  }
  dbTimes.sort((a, b) => a - b);
  roundTrips.sort((a, b) => a - b);

  // ACCURACY: compare $near with a plain distance check on the same data
  const everyone = await User.find({ roomId: ROOM, isOnline: true })
    .select("location")
    .lean();
  let mismatches = 0;
  for (let i = 0; i < AUDIT_QUERIES_PER_SIZE; i++) {
    const point = randomPoint();
    const nearIds = (await User.find(User.nearbyQuery(ROOM, point, RADIUS)).select("_id").lean())
      .map((doc) => String(doc._id))
      .sort();
    const expectedIds = everyone
      .filter((doc) => {
        const [x, y] = doc.location.coordinates;
        return Math.hypot(x - point.x, y - point.y) <= RADIUS;
      })
      .map((doc) => String(doc._id))
      .sort();
    if (JSON.stringify(nearIds) !== JSON.stringify(expectedIds)) mismatches += 1;
  }

  return {
    size,
    dbAvg: round1(dbTimes.reduce((a, b) => a + b, 0) / dbTimes.length),
    dbP95: percentile(dbTimes, 0.95),
    dbMax: Math.max(...dbTimes),
    rtAvg: round1(roundTrips.reduce((a, b) => a + b, 0) / roundTrips.length),
    rtMax: round1(Math.max(...roundTrips)),
    mismatches,
  };
}

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGODB_URI is not set (see server/.env.example)");

  await mongoose.connect(uri, { serverSelectionTimeoutMS: 5000 });
  await User.init();

  const results = [];
  try {
    for (const size of SIZES) {
      console.log(`Testing ${size} people...`);
      results.push(await runSize(size));
    }
  } finally {
    await User.deleteMany({ roomId: ROOM });
  }

  const lines = [
    "# Week 2 spatial audit: $near query",
    "",
    `Radius: ${RADIUS} px. Queries per size: ${QUERIES_PER_SIZE}. Target: database time under ${TARGET_MS} ms.`,
    `Database: ${mongoose.connection.name}`,
    "",
    "| People | DB avg (ms) | DB 95th % (ms) | DB max (ms) | Round trip avg (ms) | Round trip max (ms) | Accuracy mismatches | Result |",
    "|---|---|---|---|---|---|---|---|",
  ];
  let allPass = true;
  for (const r of results) {
    const pass = r.dbP95 < TARGET_MS && r.mismatches === 0;
    if (!pass) allPass = false;
    lines.push(
      `| ${r.size} | ${r.dbAvg} | ${r.dbP95} | ${r.dbMax} | ${r.rtAvg} | ${r.rtMax} | ${r.mismatches}/${AUDIT_QUERIES_PER_SIZE} | ${pass ? "PASS" : "FAIL"} |`
    );
  }
  lines.push("");
  lines.push(
    "Database time is the work MongoDB does. Round trip includes the internet, so it is always higher for a cloud database."
  );
  lines.push(allPass ? "Overall: PASS" : "Overall: FAIL");

  const report = lines.join("\n") + "\n";
  fs.writeFileSync(path.join(__dirname, "..", "audit-results.md"), report);
  console.log("\n" + report);
  console.log("Saved to server/audit-results.md");
  process.exitCode = allPass ? 0 : 1;
}

main()
  .catch((error) => {
    console.error("AUDIT FAILED:", error.message);
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect());
