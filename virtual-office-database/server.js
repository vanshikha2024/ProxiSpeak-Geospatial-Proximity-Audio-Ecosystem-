import 'dotenv/config';
import express from 'express';
import http from 'http';
import cors from 'cors';
import helmet from 'helmet';
import mongoose from 'mongoose';
import { Server } from 'socket.io';
import { connectDB } from './config/db.js';
import userRoutes from './routes/userRoutes.js';
import roomRoutes from './routes/roomRoutes.js';
import positionRoutes from './routes/positionRoutes.js';
import { registerOfficeSocket } from './sockets/officeSocket.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';

const app = express();
const server = http.createServer(app);
const allowedOrigins = (process.env.CLIENT_ORIGIN || 'http://localhost:5173').split(',').map((origin) => origin.trim()).filter(Boolean);
app.disable('x-powered-by');
app.use(helmet());
app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
    return callback(new Error('Origin is not allowed by CORS.'));
  },
  credentials: true
}));
app.use(express.json({ limit: '100kb' }));
app.use(express.urlencoded({ extended: false, limit: '100kb' }));
app.get('/api/health', (_req, res) => res.json({ success: true, status: 'ok', service: 'virtual-office-api', timestamp: new Date().toISOString() }));
app.use('/api/users', userRoutes);
app.use('/api/rooms', roomRoutes);
app.use('/api/positions', positionRoutes);
app.use(notFoundHandler);
app.use(errorHandler);

const io = new Server(server, { cors: { origin: allowedOrigins, methods: ['GET', 'POST', 'PUT', 'PATCH'], credentials: true }, maxHttpBufferSize: 1e5 });
registerOfficeSocket(io);
const port = Number(process.env.PORT) || 5000;
try {
  await connectDB();
  server.listen(port, () => console.log(`API and Socket.IO running on port ${port}`));
} catch (error) {
  console.error('Failed to start server:', error.message);
  process.exit(1);
}

let shuttingDown = false;
async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.info(`[server] ${signal} received; shutting down`);
  const forceExit = setTimeout(() => process.exit(1), 10000);
  forceExit.unref();
  server.close(async () => {
    try {
      await io.close();
      await mongoose.disconnect();
      clearTimeout(forceExit);
      process.exit(0);
    } catch (error) {
      console.error('[server] shutdown failed:', error);
      process.exit(1);
    }
  });
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
