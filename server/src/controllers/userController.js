import mongoose from 'mongoose';
import User from '../models/User.js';
import Room from '../models/Room.js';
import { DEFAULT_AUDIO_RADIUS } from '../config/constants.js';
import {
  calculateEuclideanDistance,
  isWithinAudioRadius,
  getEffectiveAudioRadius,
} from '../utils/proximity.js';

// Re-export proximity helpers for backwards compatibility and test suites
export { calculateEuclideanDistance, isWithinAudioRadius, getEffectiveAudioRadius };

/**
 * GET /api/users/nearby
 * Finds nearby online avatars based on 2D Euclidean spatial coordinates and proximity radius.
 * When roomId is provided, the room's configured audioRadius is the source of truth.
 *
 * Query parameters:
 *  - x (required): number
 *  - y (required): number
 *  - maxDistance (optional): fallback radius if no roomId specified
 *  - radius (optional): alias for maxDistance
 *  - roomId (optional): string filter by room and source of truth for audioRadius
 *  - excludeId (optional): string avatarId to exclude (self)
 */
export const getNearbyUsers = async (req, res) => {
  try {
    const rawX = req.query.x;
    const rawY = req.query.y;
    const rawRadius = req.query.maxDistance || req.query.radius;
    const { roomId, excludeId } = req.query;

    if (rawX === undefined || rawY === undefined) {
      return res.status(400).json({
        success: false,
        message: 'Query parameters x and y are required numbers',
      });
    }

    if (Array.isArray(rawX) || Array.isArray(rawY)) {
      return res.status(400).json({
        success: false,
        message: 'Query parameters x and y must be single values',
      });
    }

    const x = parseFloat(rawX);
    const y = parseFloat(rawY);

    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      return res.status(400).json({
        success: false,
        message: 'Query parameters x and y must be valid finite numbers',
      });
    }

    if (x < 0 || y < 0) {
      return res.status(400).json({
        success: false,
        message: 'Coordinates x and y cannot be negative',
      });
    }

    if (Array.isArray(rawRadius)) {
      return res.status(400).json({
        success: false,
        message: 'Query parameter maxDistance/radius must be a single value',
      });
    }

    let parsedRadius = null;
    if (rawRadius !== undefined) {
      parsedRadius = parseFloat(rawRadius);
      if (!Number.isFinite(parsedRadius) || parsedRadius <= 0) {
        return res.status(400).json({
          success: false,
          message: 'Query parameter maxDistance/radius must be a positive number',
        });
      }
    }

    // Base filter: online users
    const filter = {
      isOnline: true,
    };

    let effectiveRadius = DEFAULT_AUDIO_RADIUS;

    if (roomId) {
      if (!mongoose.Types.ObjectId.isValid(roomId)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid roomId format',
        });
      }

      if (mongoose.connection.readyState === 1) {
        // Query room and obtain configured audioRadius as the source of truth
        const room = await Room.findById(roomId).select('audioRadius').lean();
        if (!room) {
          return res.status(404).json({
            success: false,
            message: 'Room not found',
          });
        }
        effectiveRadius = getEffectiveAudioRadius(room, parsedRadius);
      } else {
        effectiveRadius = getEffectiveAudioRadius(null, parsedRadius);
      }

      filter.roomId = roomId;
    } else {
      effectiveRadius = getEffectiveAudioRadius(null, parsedRadius);
    }

    if (excludeId) {
      if (!mongoose.Types.ObjectId.isValid(excludeId)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid excludeId format',
        });
      }
      filter._id = { $ne: excludeId };
    }

    // Planar Euclidean spatial query using 2d index on location.coordinates
    const usersInScope = await User.find({
      ...filter,
      'location.coordinates': {
        $near: [x, y],
        $maxDistance: effectiveRadius,
      },
    })
      .select('username avatarUrl location isOnline roomId')
      .lean();

    const nearbyUsers = usersInScope
      .map((u) => {
        const uX = u.location?.coordinates?.[0] ?? 0;
        const uY = u.location?.coordinates?.[1] ?? 0;
        const distance = calculateEuclideanDistance(x, y, uX, uY);
        const inAudioRange = isWithinAudioRadius(x, y, uX, uY, effectiveRadius);
        return {
          avatarId: u._id,
          username: u.username,
          avatarUrl: u.avatarUrl,
          x: uX,
          y: uY,
          distance: Math.round(distance * 100) / 100,
          inAudioRange,
          roomId: u.roomId,
          isOnline: u.isOnline,
        };
      })
      .filter((u) => u.inAudioRange)
      .sort((a, b) => a.distance - b.distance);

    return res.status(200).json({
      success: true,
      origin: { x, y },
      maxDistance: effectiveRadius,
      count: nearbyUsers.length,
      data: nearbyUsers,
    });
  } catch (error) {
    console.error('[Nearby] Failed to query nearby users:', error.message);
    return res.status(500).json({
      success: false,
      message: 'Failed to query nearby users',
    });
  }
};

/**
 * GET /api/users
 * Returns list of users with optional filtering
 */
export const getUsers = async (req, res) => {
  try {
    const { isOnline, roomId } = req.query;
    const filter = {};

    if (isOnline !== undefined) {
      filter.isOnline = isOnline === 'true';
    }

    if (roomId) {
      filter.roomId = roomId;
    }

    const users = await User.find(filter)
      .select('username avatarUrl location isOnline roomId socketId updatedAt')
      .sort({ updatedAt: -1 })
      .lean();

    return res.status(200).json({
      success: true,
      count: users.length,
      data: users.map((u) => ({
        avatarId: u._id,
        username: u.username,
        avatarUrl: u.avatarUrl,
        x: u.location?.coordinates?.[0] ?? 0,
        y: u.location?.coordinates?.[1] ?? 0,
        isOnline: u.isOnline,
        roomId: u.roomId,
        socketId: u.socketId,
        updatedAt: u.updatedAt,
      })),
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve users',
      error: error.message,
    });
  }
};

/**
 * GET /api/users/:id
 * Returns a specific user profile & avatar state
 */
export const getUserById = async (req, res) => {
  try {
    const { id } = req.params;
    const user = await User.findById(id).lean();

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    return res.status(200).json({
      success: true,
      data: {
        avatarId: user._id,
        username: user.username,
        email: user.email,
        avatarUrl: user.avatarUrl,
        x: user.location?.coordinates?.[0] ?? 0,
        y: user.location?.coordinates?.[1] ?? 0,
        isOnline: user.isOnline,
        roomId: user.roomId,
        socketId: user.socketId,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve user',
      error: error.message,
    });
  }
};
