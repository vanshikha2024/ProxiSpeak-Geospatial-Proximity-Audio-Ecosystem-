import mongoose from 'mongoose';
import {
  DEFAULT_AUDIO_RADIUS,
  DEFAULT_ROOM_WIDTH,
  DEFAULT_ROOM_HEIGHT,
  DEFAULT_ROOM_CAPACITY,
} from '../config/constants.js';

/**
 * Room / Office Schema for ProxiSpeak
 * Represents virtual office spaces with dimensions, active members, and spatial settings.
 */
const roomSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Room name is required'],
      trim: true,
      maxlength: [100, 'Room name cannot exceed 100 characters'],
    },
    description: {
      type: String,
      default: '',
      trim: true,
      maxlength: [500, 'Description cannot exceed 500 characters'],
    },
    // Map dimensions in 2D Euclidean units (pixels)
    dimensions: {
      width: {
        type: Number,
        default: DEFAULT_ROOM_WIDTH,
        min: [100, 'Width must be at least 100'],
      },
      height: {
        type: Number,
        default: DEFAULT_ROOM_HEIGHT,
        min: [100, 'Height must be at least 100'],
      },
    },
    // Proximity audio radius in pixels
    audioRadius: {
      type: Number,
      default: DEFAULT_AUDIO_RADIUS,
      min: [10, 'Audio radius must be at least 10'],
      max: [1000, 'Audio radius cannot exceed 1000'],
    },
    capacity: {
      type: Number,
      default: DEFAULT_ROOM_CAPACITY,
      min: [2, 'Capacity must be at least 2'],
    },
    isPrivate: {
      type: Boolean,
      default: false,
    },
    passcode: {
      type: String,
      default: null,
      select: false, // Do not expose passcode in standard queries
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

// Room index
roomSchema.index({ name: 1 });

const Room = mongoose.model('Room', roomSchema);

export default Room;
