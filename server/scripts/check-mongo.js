// ---------------------------------------------------------------
// scripts/check-mongo.js - run this on YOUR PC with MongoDB running.
// It connects, makes sure the 2d index exists, and prints it.
// Run with:  npm run check:mongo
// ---------------------------------------------------------------
require("dotenv").config();
const mongoose = require("mongoose");
const User = require("../models/User");

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGODB_URI is not set (see server/.env.example)");

  await mongoose.connect(uri, { serverSelectionTimeoutMS: 5000 });
  await User.syncIndexes();

  const indexes = await User.collection.indexes();
  const twoD = indexes.find((index) => index.key && index.key["location.coordinates"] === "2d");
  console.log("Indexes on users collection:");
  indexes.forEach((index) => console.log("  -", JSON.stringify(index.key)));

  if (!twoD) throw new Error("2d index on location.coordinates was NOT created");
  console.log("\nOK: MongoDB is connected and the 2d index exists.");
}

main()
  .catch((error) => {
    console.error("CHECK FAILED:", error.message);
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect());
