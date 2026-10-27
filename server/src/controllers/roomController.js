import Room from '../models/Room.js';
import User from '../models/User.js';
import {
  DEFAULT_AUDIO_RADIUS,
  DEFAULT_ROOM_WIDTH,
  DEFAULT_ROOM_HEIGHT,
  DEFAULT_ROOM_CAPACITY,
} from '../config/constants.js';

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
    const { name, description, dimensions, audioRadius, capacity, isPrivate, passcode } = req.body;

    if (!name || typeof name !== 'string' || !name.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Room name is required and cannot be empty',
      });
    }

    const room = await Room.create({
      name: name.trim(),
      description: description ? description.trim() : '',
      dimensions: dimensions || { width: DEFAULT_ROOM_WIDTH, height: DEFAULT_ROOM_HEIGHT },
      audioRadius: Number.isFinite(audioRadius) ? audioRadius : DEFAULT_AUDIO_RADIUS,
      capacity: Number.isFinite(capacity) ? capacity : DEFAULT_ROOM_CAPACITY,
      isPrivate: Boolean(isPrivate),
      passcode: passcode || null,
    });

    return res.status(201).json({
      success: true,
      message: 'Room created successfully',
      data: room,
    });
  } catch (error) {
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
