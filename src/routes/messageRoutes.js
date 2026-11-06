import express from 'express';
import {
  createMessage,
  getRoomMessages,
} from '../controllers/messageController.js';

const router = express.Router();

router.post('/', createMessage);
router.get('/room/:roomId', getRoomMessages);

export default router;
