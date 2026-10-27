import express from 'express';
import {
  getNearbyUsers,
  getUsers,
  getUserById,
} from '../controllers/userController.js';

const router = express.Router();

// GET /api/users/nearby - Find nearby users by 2D coordinates and radius
router.get('/nearby', getNearbyUsers);

// GET /api/users - List users
router.get('/', getUsers);

// GET /api/users/:id - Get user by ID
router.get('/:id', getUserById);

export default router;
