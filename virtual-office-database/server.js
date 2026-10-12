import 'dotenv/config';
import express from 'express';
import http from 'http';
import cors from 'cors';
import { Server } from 'socket.io';
import { connectDB } from './config/db.js';
import userRoutes from './routes/userRoutes.js';
import roomRoutes from './routes/roomRoutes.js';
import positionRoutes from './routes/positionRoutes.js';
import { registerOfficeSocket } from './sockets/officeSocket.js';

const app = express();
const server = http.createServer(app);
const allowedOrigin = process.env.CLIENT_ORIGIN || 'http://localhost:5173';
app.use(cors({ origin: allowedOrigin }));
app.use(express.json({ limit: '1mb' }));

app.get('/api/health', (_req, res) => res.json({ status: 'ok', service: 'virtual-office-api' }));
app.use('/api/users', userRoutes);
app.use('/api/rooms', roomRoutes);
app.use('/api/positions', positionRoutes);

app.use((err, _req, res, _next) => {
  if (err?.code === 11000) return res.status(409).json({ message: 'A record with this unique value already exists' });
  if (err?.name === 'ValidationError') return res.status(400).json({ message: err.message });
  console.error(err);
  res.status(500).json({ message: 'Internal server error' });
});

const io = new Server(server, { cors: { origin: allowedOrigin, methods: ['GET', 'POST', 'PUT', 'PATCH'] } });
registerOfficeSocket(io);

const port = Number(process.env.PORT) || 5000;
try {
  await connectDB();
  server.listen(port, () => console.log(`API and Socket.IO running on http://localhost:${port}`));
} catch (error) {
  console.error('Failed to start server:', error.message);
  process.exit(1);
}
