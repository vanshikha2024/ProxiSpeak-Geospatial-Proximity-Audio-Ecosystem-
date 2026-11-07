import mongoose from 'mongoose';
import Message from '../models/Message.js';
import Room from '../models/Room.js';
import User from '../models/User.js';

// POST /api/messages
export const createMessage = async (req, res) => {
  try {
    const { roomId, senderId, text } = req.body || {};

    if (!mongoose.isValidObjectId(roomId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid room ID',
      });
    }

    if (!mongoose.isValidObjectId(senderId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid sender ID',
      });
    }

    if (typeof text !== 'string' || !text.trim() || text.trim().length > 2000) {
      return res.status(400).json({
        success: false,
        message: 'Message must contain between 1 and 2000 characters',
      });
    }

    const room = await Room.findById(roomId);
    if (!room) {
      return res.status(404).json({
        success: false,
        message: 'Room not found',
      });
    }

    const user = await User.findOne({
      _id: senderId,
      roomId,
    });

    if (!user) {
      return res.status(403).json({
        success: false,
        message: 'Sender is not a member of this room',
      });
    }

    const message = await Message.create({
      roomId,
      senderId,
      text: text.trim(),
    });

    await message.populate('senderId', 'username avatarUrl');

    return res.status(201).json({
      success: true,
      message: 'Message saved successfully',
      data: message,
    });
  } catch (error) {
    console.error('[Messages] Create failed:', error.message);

    return res.status(500).json({
      success: false,
      message: 'Failed to save message',
    });
  }
};

// GET /api/messages/room/:roomId
export const getRoomMessages = async (req, res) => {
  try {
    const { roomId } = req.params;

    if (!mongoose.isValidObjectId(roomId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid room ID',
      });
    }

    const roomExists = await Room.exists({ _id: roomId });

    if (!roomExists) {
      return res.status(404).json({
        success: false,
        message: 'Room not found',
      });
    }

    const parsedLimit = Number.parseInt(req.query.limit, 10);
    const limit = Math.min(
      Math.max(Number.isNaN(parsedLimit) ? 50 : parsedLimit, 1),
      100
    );

    const messages = await Message.find({ roomId })
      .populate('senderId', 'username avatarUrl')
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();

    return res.status(200).json({
      success: true,
      count: messages.length,
      data: messages.reverse(),
    });
  } catch (error) {
    console.error('[Messages] Retrieval failed:', error.message);

    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve messages',
    });
  }
};
