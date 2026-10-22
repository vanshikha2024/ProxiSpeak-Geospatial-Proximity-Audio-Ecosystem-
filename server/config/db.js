// ---------------------------------------------------------------
// config/db.js - connects the server to MongoDB.
//
// The connection string comes from server/.env (MONGODB_URI).
// If MongoDB is not running, the server still starts and the live
// movement and voice features keep working; only saving is skipped.
// ---------------------------------------------------------------
require("dotenv").config();
const mongoose = require("mongoose");

async function connectDB() {
  const uri = process.env.MONGODB_URI;

  if (!uri) {
    console.warn("[MongoDB] MONGODB_URI is not set in server/.env. Running without a database.");
    return false;
  }

  try {
    await mongoose.connect(uri);
    console.log(`[MongoDB] Connected to ${mongoose.connection.host}`);
    return true;
  } catch (error) {
    console.error(`[MongoDB] Could not connect: ${error.message}`);
    return false;
  }
}

module.exports = connectDB;
