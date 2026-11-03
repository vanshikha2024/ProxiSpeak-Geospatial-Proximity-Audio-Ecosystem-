// ---------------------------------------------------------------
// scripts/seed-room.js - creates the default office "main-office" with
// a few desks and walls. Safe to run twice: an existing office is not
// changed. Run with:  npm run seed:room   (MongoDB must be connected)
// ---------------------------------------------------------------
require("dotenv").config();
const mongoose = require("mongoose");
const Room = require("../models/Room");
const { validateLayout } = require("../services/roomLayout");

const DEFAULT_LAYOUT = {
  width: 720,
  height: 420,
  obstacles: [
    { x: 300, y: 200, width: 60, height: 20, label: "Desk" },
    { x: 150, y: 300, width: 20, height: 80, label: "Wall" },
    { x: 500, y: 300, width: 120, height: 24, label: "Table" },
  ],
};

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGODB_URI is not set (see server/.env.example)");

  const checked = validateLayout(DEFAULT_LAYOUT);
  if (checked.error) throw new Error(checked.error);

  await mongoose.connect(uri, { serverSelectionTimeoutMS: 5000 });
  await Room.init();

  const result = await Room.updateOne(
    { roomId: "main-office" },
    { $setOnInsert: { roomId: "main-office", name: "Main Office", ...checked.value } },
    { upsert: true }
  );
  console.log(result.upsertedCount ? "Created the main-office layout." : "main-office already exists; left unchanged.");

  const room = await Room.findOne({ roomId: "main-office" }).lean();
  console.log(`Obstacles in main-office: ${room.obstacles.length}`);
  room.obstacles.forEach((o) => console.log(`  - ${o.label || "(no label)"} at ${o.x},${o.y} (${o.width}x${o.height})`));
}

main()
  .catch((error) => {
    console.error("SEED FAILED:", error.message);
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect());
