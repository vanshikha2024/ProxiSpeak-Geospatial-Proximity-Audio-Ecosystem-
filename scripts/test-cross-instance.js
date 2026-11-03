// Cross-instance Socket.IO Redis adapter test
// This script spawns two server instances on different ports (default 5055 and 5056)
// using the same Redis configuration, then verifies that an event emitted
// from a client connected to one instance is received by a client on the other.

import { spawn } from 'child_process';
import mongoose from 'mongoose';
import { io as Client } from 'socket.io-client';
import Room from '../src/models/Room.js';

const SERVER_SCRIPT = 'src/server.js';
const PORT1 = process.env.PORT1 || 5055;
const PORT2 = process.env.PORT2 || 5056;
const TEST_MONGO_URI = process.env.MONGODB_TEST_URI || process.env.TEST_MONGODB_URI || 'mongodb://localhost:27017/proxispeak_test';
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

function startServer(port) {
  return spawn(process.execPath, [SERVER_SCRIPT], {
    env: {
      ...process.env,
      PORT: String(port),
      MONGODB_URI: TEST_MONGO_URI,
      REDIS_URL,
      NODE_ENV: 'test',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

function waitForHealth(port, maxTimeoutMs = 10000) {
  return new Promise((resolve, reject) => {
    const startTime = Date.now();
    const attempt = () => {
      fetch(`http://localhost:${port}/health`)
        .then((res) => res.json())
        .then((json) => {
          if (json.status === 'ok') resolve();
          else setTimeout(attempt, 150);
        })
        .catch(() => {
          if (Date.now() - startTime > maxTimeoutMs) {
            reject(new Error(`Timed out waiting for port ${port}`));
          } else {
            setTimeout(attempt, 150);
          }
        });
    };
    attempt();
  });
}

(async () => {
  console.log('🚀 Starting two server instances on ports', PORT1, 'and', PORT2);

  // Ensure test room exists in test MongoDB
  await mongoose.connect(TEST_MONGO_URI);
  const ROOM_NAME = 'crossInstanceRoom';
  await Room.findOneAndUpdate(
    { name: ROOM_NAME },
    { name: ROOM_NAME, audioRadius: 200, dimensions: { width: 1000, height: 1000 } },
    { upsert: true, new: true }
  );
  await mongoose.disconnect();

  const server1 = startServer(PORT1);
  const server2 = startServer(PORT2);

  // Wait for both health endpoints
  await Promise.all([waitForHealth(PORT1), waitForHealth(PORT2)]);
  console.log('✅ Both servers healthy');

  const clientA = Client(`http://localhost:${PORT1}`, { transports: ['websocket'], forceNew: true });
  const clientB = Client(`http://localhost:${PORT2}`, { transports: ['websocket'], forceNew: true });

  await Promise.all([
    new Promise((res) => clientA.once('connect', res)),
    new Promise((res) => clientB.once('connect', res)),
  ]);

  // Join both clients to the same logical room
  clientA.emit('avatar:join', { username: 'Alice', x: 10, y: 10, roomId: ROOM_NAME });
  clientB.emit('avatar:join', { username: 'Bob', x: 20, y: 20, roomId: ROOM_NAME });

  // Wait for join confirmations
  await Promise.all([
    new Promise((res) => clientA.once('avatar:joined', res)),
    new Promise((res) => clientB.once('avatar:joined', res)),
  ]);

  // Listen for movement on clientB
  const movedPromise = new Promise((resolve) => clientB.once('avatar:moved', resolve));

  // Trigger movement from clientA
  clientA.emit('avatar:move', { x: 30, y: 40 });

  const moved = await movedPromise;
  if (moved.username === 'Alice' && moved.x === 30 && moved.y === 40) {
    console.log('✅ Cross‑instance movement event received correctly');
  } else {
    console.error('❌ Cross‑instance movement event mismatch', moved);
    process.exit(1);
  }

  // Clean up
  clientA.disconnect();
  clientB.disconnect();
  server1.kill('SIGTERM');
  server2.kill('SIGTERM');
  process.exit(0);
})().catch((err) => {
  console.error('Fatal cross-instance test error:', err);
  process.exit(1);
});
