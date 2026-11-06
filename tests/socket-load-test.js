
import { io } from 'socket.io-client';

const SERVER_URL = 'http://localhost:5000';
const ROOM_ID = '6aec23c9bb7388b39f89910e';
const TOTAL_CLIENTS = 200;
const MOVES_PER_CLIENT = 10;
const MOVE_INTERVAL = 100;

const clients = [];
let joinedCount = 0;
let receivedMoves = 0;
let failedCount = 0;

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function connectClient(index) {
  return new Promise((resolve, reject) => {
    const socket = io(SERVER_URL, {
      transports: ['websocket'],
      reconnection: false,
      timeout: 10000,
    });

    clients.push(socket);

    const timeout = setTimeout(() => {
      reject(new Error(`User ${index} timed out`));
    }, 20000);

    socket.on('connect', () => {
      socket.emit('avatar:join', {
        username: `MovementUser_${index}`,
        x: 500 + index,
        y: 250,
        roomId: ROOM_ID,
      });
    });

    socket.on('avatar:joined', (avatar) => {
      if (avatar.username !== `MovementUser_${index}`) return;

      clearTimeout(timeout);
      joinedCount++;
      resolve(socket);
    });

    socket.on('avatar:moved', () => {
      receivedMoves++;
    });

    socket.on('connect_error', (error) => {
      clearTimeout(timeout);
      reject(error);
    });
  });
}

async function runTest() {
  console.log(`Connecting ${TOTAL_CLIENTS} clients...`);

  const results = await Promise.allSettled(
    Array.from({ length: TOTAL_CLIENTS }, (_, i) =>
      connectClient(i + 1)
    )
  );

  const connectedClients = results
    .filter((result) => result.status === 'fulfilled')
    .map((result) => result.value);

  failedCount = TOTAL_CLIENTS - connectedClients.length;

  console.log(`Successfully joined: ${joinedCount}`);
  console.log(`Failed connections: ${failedCount}`);

  if (connectedClients.length === 0) {
    throw new Error('No clients connected.');
  }

  console.log('\nStarting movement test...');

  const startMoves = receivedMoves;

  for (let move = 1; move <= MOVES_PER_CLIENT; move++) {
    connectedClients.forEach((socket, index) => {
      socket.emit('avatar:move', {
        x: 500 + index + move,
        y: 250 + move,
      });
    });

    await delay(MOVE_INTERVAL);
  }

  await delay(5000);

  const expectedMoves =
    connectedClients.length *
    MOVES_PER_CLIENT *
    (connectedClients.length - 1);

  const actualMoves = receivedMoves - startMoves;

  console.log('\n========== MOVEMENT TEST RESULTS ==========');
  console.log(`Connected clients: ${connectedClients.length}`);
  console.log(`Moves sent per client: ${MOVES_PER_CLIENT}`);
  console.log(`Total movement updates sent: ${connectedClients.length * MOVES_PER_CLIENT}`);
  console.log(`Expected broadcast deliveries: ${expectedMoves}`);
  console.log(`Received avatar:moved events: ${actualMoves}`);

  clients.forEach((socket) => {
    if (socket.connected) socket.disconnect();
  });

  console.log('\nAll test clients disconnected.');
  console.log('Movement test completed.');

  process.exit(0);
}

runTest().catch((error) => {
  console.error('Movement test failed:', error);

  clients.forEach((socket) => socket.disconnect());

  process.exit(1);
});
