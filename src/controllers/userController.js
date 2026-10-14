import User from '../models/User.js';
import { DEFAULT_AUDIO_RADIUS } from '../config/constants.js';

/**
 * Helper to compute Euclidean distance between two 2D points [x1, y1] and [x2, y2]
 */
export const calculateEuclideanDistance = (x1, y1, x2, y2) => {
  return Math.sqrt(Math.pow(x2 - x1, 2) + Math.pow(y2 - y1, 2));
};

/**
 * GET /api/users/nearby
 * Finds nearby online avatars based on 2D Euclidean spatial coordinates and proximity radius
 * Query parameters:
 *  - x (required): number
 *  - y (required): number
 *  - maxDistance (optional): default 100
 *  - roomId (optional): string filter by room
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

    const x = parseFloat(rawX);
    const y = parseFloat(rawY);
    const maxDistance = rawRadius !== undefined ? parseFloat(rawRadius) : DEFAULT_AUDIO_RADIUS;

    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      return res.status(400).json({
        success: false,
        message: 'Query parameters x and y must be valid finite numbers',
      });
    }

    if (!Number.isFinite(maxDistance) || maxDistance <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Query parameter maxDistance/radius must be a positive number',
      });
    }

    // Base filter: online users
    const filter = {
      isOnline: true,
    };

    if (roomId) {
      filter.roomId = roomId;
    }

    if (excludeId) {
      filter._id = { $ne: excludeId };
    }

    let nearbyUsers = [];

    // Attempt MongoDB 2d/spatial query first, fallback gracefully to in-memory Euclidean distance
    try {
      // For 2D Euclidean coordinates in flat space
      const usersInScope = await User.find({
        ...filter,
        'location.coordinates': {
          $near: [x, y],
          $maxDistance: maxDistance,
        },
      })
        .select('username avatarUrl location isOnline roomId socketId updatedAt')
        .lean();

      nearbyUsers = usersInScope.map((u) => {
        const uX = u.location?.coordinates?.[0] ?? 0;
        const uY = u.location?.coordinates?.[1] ?? 0;
        const distance = calculateEuclideanDistance(x, y, uX, uY);
        return {
          avatarId: u._id,
          username: u.username,
          avatarUrl: u.avatarUrl,
          x: uX,
          y: uY,
          distance: Math.round(distance * 100) / 100,
          inAudioRange: distance <= maxDistance,
          roomId: u.roomId,
          isOnline: u.isOnline,
        };
      });
    } catch (geoError) {
      // In case 2d index is indexing or planar distance fallback
      const onlineUsers = await User.find(filter)
        .select('username avatarUrl location isOnline roomId socketId updatedAt')
        .lean();

      nearbyUsers = onlineUsers
        .map((u) => {
          const uX = u.location?.coordinates?.[0] ?? 0;
          const uY = u.location?.coordinates?.[1] ?? 0;
          const distance = calculateEuclideanDistance(x, y, uX, uY);
          return {
            avatarId: u._id,
            username: u.username,
            avatarUrl: u.avatarUrl,
            x: uX,
            y: uY,
            distance: Math.round(distance * 100) / 100,
            inAudioRange: distance <= maxDistance,
            roomId: u.roomId,
            isOnline: u.isOnline,
          };
        })
        .filter((u) => u.distance <= maxDistance)
        .sort((a, b) => a.distance - b.distance);
    }

    return res.status(200).json({
      success: true,
      origin: { x, y },
      maxDistance,
      count: nearbyUsers.length,
      data: nearbyUsers,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Failed to query nearby users',
      error: error.message,
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
