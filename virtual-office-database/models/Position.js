
import mongoose from 'mongoose';

const positionSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true,
      index: true
    },

    roomId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Room',
      default: null,
      index: true
    },

    x: {
      type: Number,
      required: true,
      default: 100,
      min: 0,
      validate: {
        validator: Number.isFinite,
        message: 'X coordinate must be a finite number.'
      }
    },

    y: {
      type: Number,
      required: true,
      default: 100,
      min: 0,
      validate: {
        validator: Number.isFinite,
        message: 'Y coordinate must be a finite number.'
      }
    },

    direction: {
      type: String,
      enum: ['up', 'down', 'left', 'right'],
      default: 'down'
    },

    isMoving: {
      type: Boolean,
      default: false
    },

    lastUpdated: {
      type: Date,
      default: Date.now
    }
  },
  {
    timestamps: true,
    versionKey: false
  }
);

// Efficient room-based position queries
positionSchema.index({ roomId: 1, updatedAt: -1 });

// Automatically refresh lastUpdated when the document changes
positionSchema.pre('save', function () {
  this.lastUpdated = new Date();
});

const Position = mongoose.model('Position', positionSchema);

export default Position;
