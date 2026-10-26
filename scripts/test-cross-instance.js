// Cross-instance Socket.IO Redis adapter test
// This script spawns two server instances on different ports (default 5055 and 5056)
// using the same Redis configuration, then verifies that an event emitted
// from a client connected to one instance is received by a client on the other.

import { spawn } from 'child_process';
import { io as Client } from 'socket.io-client';
// Using global fetch API (Node 22+); no external dependency required

const SERVER_SCRIPT = 'src/server.js';
const PORT1 = process.env.PORT1 || 5055;
const PORT2 = process.env.PORT2 || 5056;

function startServer(port) {
  return spawn('node', [SERVER_SCRIPT], {
    env: { ...process.env, PORT: port },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

function waitForHealth(port) {
  return new Promise((resolve, reject) => {
    const attempt = () => {
      fetch(`http://localhost:${port}/health`)
        .then((res) => res.json())
        .then((json) => {
          if (json.status === 'ok') resolve();
          else setTimeout(attempt, 200);
        })
        .catch(() => setTimeout(attempt, 200));
    };
    attempt();
  });
}

(async () => {
  console.log('🚀 Starting two server instances');
  const server1 = startServer(PORT1);
  const server2 = startServer(PORT2);

  // Wait for both health endpoints
  await Promise.all([waitForHealth(PORT1), waitForHealth(PORT2)]);
  console.log('✅ Both servers healthy');

  const clientA = Client(`http://localhost:${PORT1}`, { transports: ['websocket'] });
  const clientB = Client(`http://localhost:${PORT2}`, { transports: ['websocket'] });

  await Promise.all([
    new Promise((res) => clientA.once('connect', res)),
    new Promise((res) => clientB.once('connect', res)),
  ]);

  const ROOM = 'crossInstanceRoom';

  // Join both clients to the same logical room
  clientA.emit('avatar:join', { username: 'Alice', x: 10, y: 10, roomId: ROOM });
  clientB.emit('avatar:join', { username: 'Bob', x: 20, y: 20, roomId: ROOM });

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
  server1.kill();
  server2.kill();
  process.exit(0);
})();
