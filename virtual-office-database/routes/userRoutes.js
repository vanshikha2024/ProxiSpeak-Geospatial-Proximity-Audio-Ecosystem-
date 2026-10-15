import { Router } from 'express';
import mongoose from 'mongoose';
import User from '../models/User.js';
import Position from '../models/Position.js';

const router = Router();
const validId = (id) => mongoose.isValidObjectId(id);

// Create a user (authentication is not included in this starter).
router.post('/', async (req, res, next) => {
  try {
    const { username, email, avatar } = req.body;
    const user = await User.create({ username, email, avatar });
    const position = await Position.create({ userId: user._id, x: 100, y: 100 });
    res.status(201).json({ user, position });
  } catch (err) { next(err); }
});

router.get('/', async (_req, res, next) => {
  try {
    const users = await User.find().sort({ createdAt: -1 }).limit(200).lean();
    res.json(users);
  } catch (err) { next(err); }
});

router.get('/:id', async (req, res, next) => {
  try {
    if (!validId(req.params.id)) return res.status(400).json({ message: 'Invalid user ID' });
    const user = await User.findById(req.params.id).lean();
    if (!user) return res.status(404).json({ message: 'User not found' });
    const position = await Position.findOne({ userId: user._id }).lean();
    res.json({ user, position });
  } catch (err) { next(err); }
});

router.patch('/:id', async (req, res, next) => {
  try {
    if (!validId(req.params.id)) return res.status(400).json({ message: 'Invalid user ID' });
    const allowed = ['username', 'email', 'avatar', 'status'];
    const updates = Object.fromEntries(Object.entries(req.body).filter(([key]) => allowed.includes(key)));
    const user = await User.findByIdAndUpdate(req.params.id, updates, { new: true, runValidators: true });
    if (!user) return res.status(404).json({ message: 'User not found' });
    res.json(user);
  } catch (err) { next(err); }
});

export default router;
