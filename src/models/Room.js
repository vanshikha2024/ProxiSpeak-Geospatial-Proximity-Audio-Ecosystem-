import mongoose from 'mongoose';
import {
  DEFAULT_AUDIO_RADIUS,
  DEFAULT_ROOM_CAPACITY,
  DEFAULT_SPAWN_X,
  DEFAULT_SPAWN_Y,
} from '../config/constants.js';
import { isPointInsideObstacle } from '../utils/obstacleValidation.js';

/**
 * Embedded Spawn Point Schema
 * Defines the initial coordinates where avatars enter the virtual room.
 */
const spawnPointSchema = new mongoose.Schema(
  {
    x: {
      type: Number,
      default: DEFAULT_SPAWN_X,
      validate: {
        validator: (v) => Number.isFinite(v),
        message: 'Spawn point x must be a valid finite number',
      },
    },
    y: {
      type: Number,
      default: DEFAULT_SPAWN_Y,
      validate: {
        validator: (v) => Number.isFinite(v),
        message: 'Spawn point y must be a valid finite number',
      },
    },
  },
  { _id: false }
);

/**
 * Embedded Obstacle Schema
 * Represents walls, desks, furniture, and partitions within a virtual office.
 */
const obstacleSchema = new mongoose.Schema(
  {
    x: {
      type: Number,
      required: [true, 'Obstacle x coordinate is required'],
      validate: {
        validator: (v) => Number.isFinite(v),
        message: 'Obstacle x coordinate must be a valid finite number',
      },
    },
    y: {
      type: Number,
      required: [true, 'Obstacle y coordinate is required'],
      validate: {
        validator: (v) => Number.isFinite(v),
        message: 'Obstacle y coordinate must be a valid finite number',
      },
    },
    width: {
      type: Number,
      required: [true, 'Obstacle width is required'],
      validate: {
        validator: (v) => typeof v === 'number' && Number.isFinite(v) && v > 0,
        message: 'Obstacle width must be a positive number',
      },
    },
    height: {
      type: Number,
      required: [true, 'Obstacle height is required'],
      validate: {
        validator: (v) => typeof v === 'number' && Number.isFinite(v) && v > 0,
        message: 'Obstacle height must be a positive number',
      },
    },
    label: {
      type: String,
      required: [true, 'Obstacle label is required'],
      trim: true,
      maxlength: [100, 'Obstacle label cannot exceed 100 characters'],
    },
    // Acoustic sound attenuation & collision properties for Week 4 acoustic occlusion
    blocksSound: {
      type: Boolean,
      default: true,
    },
    soundAttenuation: {
      type: Number,
      default: 1.0,
      min: [0.0, 'Sound attenuation cannot be less than 0.0'],
      max: [1.0, 'Sound attenuation cannot exceed 1.0'],
    },
    blocksMovement: {
      type: Boolean,
      default: true,
    },
  },
  { _id: true }
);

/**
 * Room / Office Schema for ProxiSpeak
 * Unified persistence model for virtual office layouts, audio proximity, and embedded obstacles.
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
    // Room canvas dimensions in 2D Euclidean units (pixels)
    width: {
      type: Number,
      required: [true, 'Room width is required'],
      default: function () {
        return this.dimensions?.width;
      },
      validate: {
        validator: (v) => typeof v === 'number' && Number.isFinite(v) && v > 0,
        message: 'Room width must be a positive number',
      },
    },
    height: {
      type: Number,
      required: [true, 'Room height is required'],
      default: function () {
        return this.dimensions?.height;
      },
      validate: {
        validator: (v) => typeof v === 'number' && Number.isFinite(v) && v > 0,
        message: 'Room height must be a positive number',
      },
    },
    // Proximity audio radius in pixels
    audioRadius: {
      type: Number,
      default: DEFAULT_AUDIO_RADIUS,
      min: [10, 'Audio radius must be at least 10'],
      max: [1000, 'Audio radius cannot exceed 1000'],
    },
    // Maximum avatar capacity for the room
    capacity: {
      type: Number,
      default: DEFAULT_ROOM_CAPACITY,
      min: [2, 'Capacity must be at least 2'],
    },
    // Avatar entry coordinates
    spawnPoint: {
      type: spawnPointSchema,
      default: () => ({ x: DEFAULT_SPAWN_X, y: DEFAULT_SPAWN_Y }),
      validate: [
        {
          validator: function (sp) {
            if (!sp) return true;
            const w = this.width ?? this.dimensions?.width;
            const h = this.height ?? this.dimensions?.height;
            if (Number.isFinite(w) && Number.isFinite(h) && w > 0 && h > 0) {
              if (sp.x < 0 || sp.x > w || sp.y < 0 || sp.y > h) return false;
            }
            return true;
          },
          message: 'Spawn point coordinates must remain inside room boundaries',
        },
        {
          validator: function (sp) {
            if (!sp || !Array.isArray(this.obstacles)) return true;
            for (const obs of this.obstacles) {
              if (isPointInsideObstacle(sp, obs)) return false;
            }
            return true;
          },
          message: 'Spawn point cannot be inside an obstacle',
        },
      ],
    },
    // Embedded physical and acoustic obstacles (walls, desks, partitions)
    obstacles: {
      type: [obstacleSchema],
      default: [],
      validate: {
        validator: function (obsList) {
          if (!Array.isArray(obsList)) return true;
          const w = this.width ?? this.dimensions?.width;
          const h = this.height ?? this.dimensions?.height;
          if (Number.isFinite(w) && Number.isFinite(h) && w > 0 && h > 0) {
            for (let i = 0; i < obsList.length; i++) {
              const obs = obsList[i];
              if (obs && Number.isFinite(obs.x) && Number.isFinite(obs.width)) {
                if (obs.x < 0 || obs.x + obs.width > w) return false;
              }
              if (obs && Number.isFinite(obs.y) && Number.isFinite(obs.height)) {
                if (obs.y < 0 || obs.y + obs.height > h) return false;
              }
            }
          }
          return true;
        },
        message: 'All obstacles must remain completely inside room boundaries',
      },
    },
    // Backward-compatibility structure for code referencing dimensions object
    dimensions: {
      width: {
        type: Number,
        default: function () {
          return this.width;
        },
      },
      height: {
        type: Number,
        default: function () {
          return this.height;
        },
      },
    },
    isPrivate: {
      type: Boolean,
      default: false,
    },
    passcode: {
      type: String,
      default: null,
      select: false,
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

// Synchronize dimensions object with top-level width and height for complete backward compatibility
roomSchema.pre('validate', function () {
  if (this.dimensions && typeof this.dimensions === 'object') {
    if (this.width === undefined && this.dimensions.width !== undefined) {
      this.width = this.dimensions.width;
    }
    if (this.height === undefined && this.dimensions.height !== undefined) {
      this.height = this.dimensions.height;
    }
  }
  if (this.width !== undefined || this.height !== undefined) {
    this.dimensions = {
      width: this.width,
      height: this.height,
    };
  }
});

// Room index
roomSchema.index({ name: 1 });

const Room = mongoose.model('Room', roomSchema);

export default Room;
