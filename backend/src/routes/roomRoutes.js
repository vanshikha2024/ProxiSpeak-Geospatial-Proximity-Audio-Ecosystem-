import express from 'express';
import {
  getRooms,
  createRoom,
  getRoomById,
  getRoomMembers,
  updateRoomLayout,
} from '../controllers/roomController.js';
import validateObjectId from '../middleware/validateObjectId.js';

const router = express.Router();

// GET /api/rooms - List all rooms
router.get('/', getRooms);

// POST /api/rooms - Create new room
router.post('/', createRoom);

// GET /api/rooms/:id - Get specific room details
router.get('/:id', validateObjectId('id', 'room ID'), getRoomById);

// GET /api/rooms/:id/members - Get active avatars in room
router.get('/:id/members', validateObjectId('id', 'room ID'), getRoomMembers);

router.put('/:id/layout', validateObjectId('id', 'room ID'), updateRoomLayout );

export default router;