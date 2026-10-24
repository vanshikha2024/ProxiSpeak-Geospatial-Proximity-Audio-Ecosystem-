// ---------------------------------------------------------------
// models/User.js - one avatar (a person in the office) and its position.
//
// Field names match the team backend (TeamLeader branch) so the two
// can be merged without renaming anything.
// ---------------------------------------------------------------
const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
  {
    username: {
      type: String,
      required: [true, "Username is required"],
      trim: true,
      maxlength: 20,
    },

    // Which office the person is in (matches the room id the client sends)
    roomId: {
      type: String,
      default: "main-office",
      trim: true,
    },

    isOnline: {
      type: Boolean,
      default: false,
      index: true,
    },

    socketId: {
      type: String,
      default: null,
    },

    // Position on the 2D office map in pixels: [x, y]
    location: {
      type: { type: String, enum: ["Point"], default: "Point" },
      coordinates: {
        type: [Number],
        default: [0, 0],
        validate: {
          validator: (value) =>
            Array.isArray(value) &&
            value.length === 2 &&
            value.every((n) => Number.isFinite(n)),
          message: "Coordinates must be [x, y] with two finite numbers",
        },
      },
    },
  },
  { timestamps: true }
);

// Flat (2D) index for pixel coordinates. $near queries use it to find
// people close to a point. The bounds cover the whole office canvas.
userSchema.index({ "location.coordinates": "2d" }, { min: -2000, max: 10000 });

// The query for "who is within `radius` px of `point` in this room".
// $near returns people closest first. Only online people are included.
userSchema.statics.nearbyQuery = function (roomId, point, radius) {
  return {
    roomId,
    isOnline: true,
    "location.coordinates": { $near: [point.x, point.y], $maxDistance: radius },
  };
};

// Run the nearby query. Returns plain objects: { username, roomId, location }.
userSchema.statics.findNearby = function (roomId, point, radius) {
  return this.find(this.nearbyQuery(roomId, point, radius))
    .select("username roomId location")
    .lean();
};

module.exports = mongoose.model("User", userSchema);
