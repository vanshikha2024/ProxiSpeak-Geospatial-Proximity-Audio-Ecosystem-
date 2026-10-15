import { Router } from 'express';
import Room from '../models/Room.js';

const router = Router();
router.post('/', async (req, res, next) => {
  try {
    const room = await Room.create({ name: req.body.name, description: req.body.description, width: req.body.width, height: req.body.height, isDefault: req.body.isDefault });
    res.status(201).json(room);
  } catch (err) { next(err); }
});
router.get('/', async (_req, res, next) => {
  try { res.json(await Room.find().sort({ name: 1 }).lean()); }
  catch (err) { next(err); }
});
export default router;
