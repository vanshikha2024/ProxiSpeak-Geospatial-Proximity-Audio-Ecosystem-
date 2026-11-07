import { Server } from 'socket.io';
import { registerSignalingHandlers, activeAvatars } from './signaling.js';
import { createAdapter } from '@socket.io/redis-adapter';
import { getPubClient, getSubClient } from '../config/redis.js';

/**
 * Initializes Socket.io server attached to the HTTP server instance.
 * Attaches signaling & avatar event handlers.
 * 
 * @param {import('http').Server} httpServer 
 * @returns {Server} io
 */
export const initSocket = (httpServer) => {
  const io = new Server(httpServer, {
    cors: {
      origin: process.env.CORS_ORIGIN || '*',
      methods: ['GET', 'POST'],
    },
  });

  // Attach Redis adapter for horizontal scaling when Redis is configured
  const pub = getPubClient();
  const sub = getSubClient();
  if (pub && sub) {
    io.adapter(createAdapter(pub, sub));
    console.log('[Redis] Socket.IO adapter attached');
  } else {
    console.log('[Redis] Socket.IO adapter not attached (Redis disabled)');
  }

  // Attach avatar movement & signaling event listeners
  registerSignalingHandlers(io);

  return io;
};

export {
  registerSignalingHandlers,
  activeAvatars,
  validateSignalingRequest,
  getRoomAudioRadius,
  roomAudioRadii,
} from './signaling.js';

