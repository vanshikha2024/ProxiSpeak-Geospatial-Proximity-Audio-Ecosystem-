import Room from '../models/Room.js';
import User from '../models/User.js';
import {
  DEFAULT_AUDIO_RADIUS,
  DEFAULT_ROOM_WIDTH,
  DEFAULT_ROOM_HEIGHT,
  DEFAULT_ROOM_CAPACITY,
  DEFAULT_SPAWN_X,
  DEFAULT_SPAWN_Y,
} from '../config/constants.js';
import { validateRoomLayout } from '../utils/obstacleValidation.js';

/**
 * GET /api/rooms
 * Retrieves list of available rooms/offices with member count
 */
export const getRooms = async (req, res) => {
  try {
    const rooms = await Room.find().sort({ createdAt: -1 }).lean();

    // Attach active member count for each room
    const roomsWithCount = await Promise.all(
      rooms.map(async (room) => {
        const activeMembersCount = await User.countDocuments({
          roomId: room._id,
          isOnline: true,
        });
        return {
          ...room,
          activeMembersCount,
        };
      })
    );

    return res.status(200).json({
      success: true,
      count: roomsWithCount.length,
      data: roomsWithCount,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve rooms',
      error: error.message,
    });
  }
};

/**
 * POST /api/rooms
 * Creates a new virtual office/room
 */
export const createRoom = async (req, res) => {
  try {
    const {
      name,
      description,
      dimensions,
      width,
      height,
      audioRadius,
      capacity,
      isPrivate,
      passcode,
      spawnPoint,
      obstacles,
    } = req.body;

    const roomWidth = width ?? dimensions?.width ?? DEFAULT_ROOM_WIDTH;
    const roomHeight = height ?? dimensions?.height ?? DEFAULT_ROOM_HEIGHT;

    // Run reusable layout and obstacle validation
    const layoutValidation = validateRoomLayout(
      {
        ...req.body,
        width: roomWidth,
        height: roomHeight,
      },
      { requireName: true }
    );

    if (!layoutValidation.isValid) {
      return res.status(400).json({
        success: false,
        message: 'Room layout validation failed',
        errors: layoutValidation.errors,
      });
    }

    const room = await Room.create({
      name: name.trim(),
      description: description ? description.trim() : '',
      width: roomWidth,
      height: roomHeight,
      dimensions: { width: roomWidth, height: roomHeight },
      audioRadius: Number.isFinite(audioRadius) ? audioRadius : DEFAULT_AUDIO_RADIUS,
      capacity: Number.isFinite(capacity) ? capacity : DEFAULT_ROOM_CAPACITY,
      spawnPoint: spawnPoint || { x: DEFAULT_SPAWN_X, y: DEFAULT_SPAWN_Y },
      obstacles: Array.isArray(obstacles) ? obstacles : [],
      isPrivate: Boolean(isPrivate),
      passcode: passcode || null,
    });

    return res.status(201).json({
      success: true,
      message: 'Room created successfully',
      data: room,
    });
  } catch (error) {
    if (error.name === 'ValidationError') {
      return res.status(400).json({
        success: false,
        message: error.message,
      });
    }
    return res.status(500).json({
      success: false,
      message: 'Failed to create room',
      error: error.message,
    });
  }
};

/**
 * GET /api/rooms/:id
 * Retrieves specific room details
 */
export const getRoomById = async (req, res) => {
  try {
    const { id } = req.params;
    const room = await Room.findById(id).lean();

    if (!room) {
      return res.status(404).json({
        success: false,
        message: 'Room not found',
      });
    }

    const activeMembersCount = await User.countDocuments({
      roomId: room._id,
      isOnline: true,
    });

    return res.status(200).json({
      success: true,
      data: {
        ...room,
        activeMembersCount,
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve room',
      error: error.message,
    });
  }
};

/**
 * GET /api/rooms/:id/members
 * Retrieves all active/online avatars currently present in a room
 */
export const getRoomMembers = async (req, res) => {
  try {
    const { id } = req.params;
    const room = await Room.findById(id);

    if (!room) {
      return res.status(404).json({
        success: false,
        message: 'Room not found',
      });
    }

    const members = await User.find({
      roomId: id,
      isOnline: true,
    })
      .select('username avatarUrl location isOnline socketId updatedAt')
      .lean();

    return res.status(200).json({
      success: true,
      roomId: id,
      count: members.length,
      data: members.map((m) => ({
        avatarId: m._id,
        username: m.username,
        avatarUrl: m.avatarUrl,
        x: m.location?.coordinates?.[0] ?? 0,
        y: m.location?.coordinates?.[1] ?? 0,
        isOnline: m.isOnline,
        socketId: m.socketId,
        updatedAt: m.updatedAt,
      })),
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve room members',
      error: error.message,
    });
  }
};
