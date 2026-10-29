import http from 'http';
import dotenv from 'dotenv';
import app from './app.js';
import connectDB from './config/db.js';
import { initSocket } from './sockets/socket.js';
import { initRedis, closeRedis } from './config/redis.js';
import { initAvatarRedis, closeAvatarRedis } from './redis/avatarState.js';

// Load environment variables
dotenv.config();

const PORT = process.env.PORT || 5000;

// Create HTTP server wrapping Express app
const server = http.createServer(app);

let io = null;

// Connect to MongoDB, Redis & start server
const startServer = async () => {
  await connectDB();
  await initRedis();
  await initAvatarRedis();

  // Initialize Socket.io on the HTTP server after Redis connections are established
  io = initSocket(server);

  server.listen(PORT, () => {
    console.log(`==================================================`);
    console.log(`🚀 ProxiSpeak Server running on port ${PORT}`);
    console.log(`🌐 Health check endpoint: http://localhost:${PORT}/health`);
    console.log(`⚡ WebSocket Signaling layer operational`);
    console.log(`==================================================`);
  });
};

startServer();

// Graceful shutdown handling
const shutdown = async () => {
  console.log('⚡ Shutting down server...');
  if (io) {
    try {
      await new Promise((resolve) => io.close(resolve));
    } catch (_) {}
  }
  await closeRedis();
  await closeAvatarRedis();
  server.close(() => {
    console.log('🛑 Server closed');
    process.exit(0);
  });
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
