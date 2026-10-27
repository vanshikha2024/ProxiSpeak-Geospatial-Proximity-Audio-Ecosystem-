import http from 'http';
import dotenv from 'dotenv';
import app from './app.js';
import connectDB from './config/db.js';
import { initSocket } from './sockets/socket.js';

// Load environment variables
dotenv.config();

const PORT = process.env.PORT || 5000;

// Create HTTP server wrapping Express app
const server = http.createServer(app);

// Initialize Socket.io on the HTTP server
const io = initSocket(server);

// Connect to MongoDB & start server
const startServer = async () => {
  await connectDB();

  server.listen(PORT, () => {
    console.log(`==================================================`);
    console.log(`🚀 ProxiSpeak Server running on port ${PORT}`);
    console.log(`🌐 Health check endpoint: http://localhost:${PORT}/health`);
    console.log(`⚡ WebSocket Signaling layer operational`);
    console.log(`==================================================`);
  });
};

startServer();
