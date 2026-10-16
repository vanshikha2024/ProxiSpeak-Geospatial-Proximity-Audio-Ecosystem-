import mongoose from 'mongoose';

/**
 * User / Avatar Schema for ProxiSpeak
 * Supports 2D map space coordinates [x, y] with a planar 2d index for proximity ($near) queries.
 */
const userSchema = new mongoose.Schema(
  {
    username: {
      type: String,
      required: [true, 'Username is required'],
      trim: true,
    },
    email: {
      type: String,
      unique: true,
      sparse: true,
      trim: true,
      lowercase: true,
    },
    avatarUrl: {
      type: String,
      default: '',
    },
    // GeoJSON Point location for 2D spatial positioning [x, y] (or [lng, lat])
    location: {
      type: {
        type: String,
        enum: ['Point'],
        default: 'Point',
      },
      coordinates: {
        type: [Number], // [x, y] coordinates in 2D space
        required: true,
        default: [0, 0],
        validate: {
          validator: function (val) {
            return (
              Array.isArray(val) &&
              val.length === 2 &&
              Number.isFinite(val[0]) &&
              Number.isFinite(val[1])
            );
          },
          message: 'Coordinates must be an array of two finite numbers [x, y]',
        },
      },
    },
    roomId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Room',
      default: null,
      index: true,
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
  },
  {
    timestamps: true,
  }
);

// Planar Euclidean 2D geospatial index for virtual office pixel coordinates
// Set min/max bounds suitable for virtual office canvas dimensions (up to 10,000 x 10,000 px)
userSchema.index({ 'location.coordinates': '2d' }, { min: -2000, max: 10000 });

const User = mongoose.model('User', userSchema);

export default User;
