import { Server } from 'socket.io';
import { registerSignalingHandlers, activeAvatars } from './signaling.js';

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

