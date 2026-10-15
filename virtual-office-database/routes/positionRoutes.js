import { Router } from 'express';
import mongoose from 'mongoose';
import Position from '../models/Position.js';
import Room from '../models/Room.js';

const router = Router();
router.get('/room/:roomId', async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.roomId)) return res.status(400).json({ message: 'Invalid room ID' });
    const positions = await Position.find({ roomId: req.params.roomId }).populate('userId', 'username avatar status').lean();
    res.json(positions);
  } catch (err) { next(err); }
});

router.put('/:userId', async (req, res, next) => {
  try {
    const { userId } = req.params;
    const { x, y, roomId, direction } = req.body;
    if (!mongoose.isValidObjectId(userId)) return res.status(400).json({ message: 'Invalid user ID' });
    if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || y < 0) return res.status(400).json({ message: 'x and y must be non-negative numbers' });
    if (roomId && !mongoose.isValidObjectId(roomId)) return res.status(400).json({ message: 'Invalid room ID' });
    if (roomId) {
      const room = await Room.findById(roomId).lean();
      if (!room) return res.status(404).json({ message: 'Room not found' });
      if (x > room.width || y > room.height) return res.status(400).json({ message: 'Position is outside room boundaries' });
    }
    const update = { x, y };
    if (roomId !== undefined) update.roomId = roomId || null;
    if (direction && ['up', 'down', 'left', 'right'].includes(direction)) update.direction = direction;
    const position = await Position.findOneAndUpdate({ userId }, { $set: update, $setOnInsert: { userId } }, { new: true, upsert: true, runValidators: true });
    res.json(position);
  } catch (err) { next(err); }
});
export default router;
