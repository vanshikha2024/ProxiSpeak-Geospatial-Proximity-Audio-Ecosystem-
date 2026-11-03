import express from 'express';
import {
  getRooms,
  createRoom,
  getRoomById,
  getRoomMembers,
} from '../controllers/roomController.js';

const router = express.Router();

// GET /api/rooms - List all rooms
router.get('/', getRooms);

// POST /api/rooms - Create new room
router.post('/', createRoom);

// GET /api/rooms/:id - Get specific room details
router.get('/:id', getRoomById);

// GET /api/rooms/:id/members - Get active avatars in room
router.get('/:id/members', getRoomMembers);

export default router;
