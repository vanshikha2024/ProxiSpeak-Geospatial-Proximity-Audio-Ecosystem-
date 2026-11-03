// ---------------------------------------------------------------
// models/Room.js - one office: its size and its furniture/walls.
// Obstacles are rectangles in pixels that block sound between people.
// ---------------------------------------------------------------
const mongoose = require("mongoose");

const obstacleSchema = new mongoose.Schema(
  {
    x: { type: Number, required: true },
    y: { type: Number, required: true },
    width: { type: Number, required: true, min: 1 },
    height: { type: Number, required: true, min: 1 },
    label: { type: String, default: "", maxlength: 30 },
  },
  { _id: false }
);

const roomSchema = new mongoose.Schema(
  {
    roomId: {
      type: String,
      required: [true, "roomId is required"],
      unique: true,
      trim: true,
      match: [/^[\w-]{1,30}$/, "roomId may only use letters, numbers, - and _"],
    },
    name: { type: String, default: "Office", trim: true, maxlength: 60 },
    width: { type: Number, default: 720, min: 1, max: 2000 },
    height: { type: Number, default: 420, min: 1, max: 2000 },
    obstacles: { type: [obstacleSchema], default: [] },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Room", roomSchema);
