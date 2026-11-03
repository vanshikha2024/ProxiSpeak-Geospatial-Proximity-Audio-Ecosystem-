import express from 'express';
import cors from 'cors';

import roomRoutes from './routes/roomRoutes.js';
import userRoutes from './routes/userRoutes.js';

const app = express();

// Core Middleware
app.use(cors({ origin: process.env.CORS_ORIGIN || '*' }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Health Check Endpoint
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    service: 'ProxiSpeak Backend API',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
});

// API Routes
app.use('/api/rooms', roomRoutes);
app.use('/api/users', userRoutes);

// 404 Route Handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: `Cannot ${req.method} ${req.originalUrl}`,
  });
});

export default app;
