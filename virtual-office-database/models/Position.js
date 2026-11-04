import mongoose from "mongoose";

const positionSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
    },
    roomId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Room",
      default: null,
    },
    x: {
      type: Number,
      required: true,
      default: 100,
      min: 0,
      validate: {
        validator: Number.isFinite,
        message: "X coordinate must be finite.",
      },
    },
    y: {
      type: Number,
      required: true,
      default: 100,
      min: 0,
      validate: {
        validator: Number.isFinite,
        message: "Y coordinate must be finite.",
      },
    },
    direction: {
      type: String,
      enum: ["up", "down", "left", "right"],
      default: "down",
    },
    isMoving: { type: Boolean, default: false },
    lastUpdated: { type: Date, default: Date.now },
  },
  { timestamps: true, versionKey: false },
);

positionSchema.index({ roomId: 1, updatedAt: -1 });
positionSchema.pre("save", function updateLastUpdated() {
  this.lastUpdated = new Date();
});
positionSchema.pre("findOneAndUpdate", function updatePositionTimestamp() {
  this.set({ lastUpdated: new Date() });
});
export default mongoose.model("Position", positionSchema);
