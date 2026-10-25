// ---------------------------------------------------------------
// scripts/check-mongo.js - a READ-ONLY check of your MongoDB.
// It connects and reports whether the 2d index exists.
// It never creates or deletes indexes, so it is safe on a shared
// database (for example, a teammate's cluster).
// Run with:  npm run check:mongo
// ---------------------------------------------------------------
require("dotenv").config();
const mongoose = require("mongoose");

// Do not let the model build indexes during this check.
mongoose.set("autoIndex", false);
const User = require("../models/User");

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGODB_URI is not set (see server/.env.example)");

  await mongoose.connect(uri, { serverSelectionTimeoutMS: 5000 });
  console.log(`Connected to database: ${mongoose.connection.name}`);

  const indexes = await User.collection.indexes();
  console.log("Indexes on the users collection:");
  indexes.forEach((index) => console.log("  -", JSON.stringify(index.key)));

  const hasTwoD = indexes.some((index) => index.key && index.key["location.coordinates"] === "2d");
  if (!hasTwoD) {
    console.log("\nThe 2d index is NOT there yet. Start the server once with 'npm run dev';");
    console.log("it creates the index on connect. Then run 'npm run check:mongo' again.");
    process.exitCode = 1;
    return;
  }
  console.log("\nOK: MongoDB is connected and the 2d index exists.");
}

main()
  .catch((error) => {
    console.error("CHECK FAILED:", error.message);
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect());