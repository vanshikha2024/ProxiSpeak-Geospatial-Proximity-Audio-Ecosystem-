// ---------------------------------------------------------------
// services/positionSaver.js - saves each person's position to MongoDB.
//
// Positions can arrive 20 times a second. To keep the database calm we
// save at most once per second per person. If the person stops moving
// inside that second, a short timer saves their last position anyway.
// If the database is not connected, everything here is skipped and the
// live app keeps working.
// ---------------------------------------------------------------
const mongoose = require("mongoose");
const User = require("../models/User");
const { nextSaveDelay } = require("./proximity");

// socket id -> { dbId, x, y, lastSavedAt, timer }
const records = new Map();

function databaseReady() {
  return mongoose.connection.readyState === 1; // 1 means connected
}

async function writePosition(record) {
  if (!record.dbId || !databaseReady()) return;
  try {
    await User.updateOne(
      { _id: record.dbId },
      { $set: { "location.coordinates": [record.x, record.y] } }
    );
  } catch (error) {
    console.error("[MongoDB] Could not save position:", error.message);
  }
}

function saveNow(record) {
  record.lastSavedAt = Date.now();
  writePosition(record);
}

async function markOffline(record) {
  if (!record.dbId || !databaseReady()) return;
  try {
    await User.updateOne(
      { _id: record.dbId },
      {
        $set: {
          isOnline: false,
          socketId: null,
          "location.coordinates": [record.x, record.y],
        },
      }
    );
  } catch (error) {
    console.error("[MongoDB] Could not mark user offline:", error.message);
  }
}

// Called when someone joins an office: create their database record.
async function join(socketId, { username, roomId, x, y }) {
  const record = { dbId: null, x, y, lastSavedAt: 0, timer: null };
  records.set(socketId, record);
  if (!databaseReady()) return;

  try {
    const doc = await User.create({
      username,
      roomId,
      socketId,
      isOnline: true,
      location: { coordinates: [x, y] },
    });
    record.dbId = doc._id;
    record.lastSavedAt = Date.now();

    // They may have left while we were creating the record.
    if (records.get(socketId) !== record) await markOffline(record);
  } catch (error) {
    console.error("[MongoDB] Could not save new user:", error.message);
  }
}

// Called on every position update from the browser.
function moved(socketId, x, y) {
  const record = records.get(socketId);
  if (!record) return;

  record.x = x;
  record.y = y;

  // A save is already waiting: it will use the latest position.
  if (record.timer) return;

  const delay = nextSaveDelay(record.lastSavedAt, Date.now());
  if (delay === 0) {
    saveNow(record);
  } else {
    record.timer = setTimeout(() => {
      record.timer = null;
      saveNow(record);
    }, delay);
  }
}

// Called when someone leaves or disconnects.
function leave(socketId) {
  const record = records.get(socketId);
  if (!record) return;

  records.delete(socketId);
  if (record.timer) clearTimeout(record.timer);
  markOffline(record);
}

module.exports = { join, moved, leave };
