// ---------------------------------------------------------------
// scripts/check-nearby.js - runs the real $near query on YOUR MongoDB.
// It writes a few test people into a room called "__check__" and
// deletes them again at the end. Only that room is touched.
// Run with:  npm run check:nearby   (MongoDB must be connected)
// ---------------------------------------------------------------
require("dotenv").config();
const mongoose = require("mongoose");
const User = require("../models/User");

const TEST_ROOM = "__check__";

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGODB_URI is not set (see server/.env.example)");

  await mongoose.connect(uri, { serverSelectionTimeoutMS: 5000 });
  await User.init(); // build the 2d index before querying

  try {
    await User.deleteMany({ roomId: TEST_ROOM });
    await User.insertMany([
      { username: "Self", roomId: TEST_ROOM, isOnline: true, location: { coordinates: [100, 100] } },
      { username: "Near", roomId: TEST_ROOM, isOnline: true, location: { coordinates: [150, 100] } }, // 50 px
      { username: "Far", roomId: TEST_ROOM, isOnline: true, location: { coordinates: [400, 100] } }, // 300 px
      { username: "Offline", roomId: TEST_ROOM, isOnline: false, location: { coordinates: [110, 100] } }, // 10 px, offline
    ]);

    const people = await User.findNearby(TEST_ROOM, { x: 100, y: 100 }, 100);
    const names = people.map((person) => person.username);
    console.log("Found within 100 px:", names.join(", ") || "(nobody)");

    const expected = ["Self", "Near"];
    if (JSON.stringify(names) !== JSON.stringify(expected)) {
      throw new Error(`expected ${expected.join(", ")} but got ${names.join(", ") || "nobody"}`);
    }
    console.log("OK: the $near query works (far and offline people were left out).");
  } finally {
    await User.deleteMany({ roomId: TEST_ROOM });
    await mongoose.disconnect();
  }
}

main().catch((error) => {
  console.error("CHECK FAILED:", error.message);
  process.exitCode = 1;
});
