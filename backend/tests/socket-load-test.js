import { io } from 'socket.io-client';

const SERVER_URL = process.env.SERVER_URL || 'http://localhost:5000';
const ROOM_ID = process.env.ROOM_ID;
const TOTAL_CLIENTS = Number(process.env.TOTAL_CLIENTS || 50);
const MOVES_PER_CLIENT = Number(process.env.MOVES_PER_CLIENT || 10);
const MOVE_INTERVAL = Number(process.env.MOVE_INTERVAL || 100);

if (!ROOM_ID) {
  console.error('Missing ROOM_ID. Set it before running the test.');
  process.exit(1);
}

const sockets = [];
const joinTimes = [];
let receivedMoves = 0;
let connectedClients = 0;
let failedClients = 0;

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function joinClient(index) {
  return new Promise((resolve, reject) => {
    const socket = io(SERVER_URL, {
      transports: ['websocket'],
      reconnection: false,
      timeout: 10000,
    });

    sockets.push(socket);

    const username = `LoadTest_${index}`;
    const startedAt = Date.now();
    let settled = false;

    const timeout = setTimeout(() => {
      if (!settled) {
        settled = true;
        socket.disconnect();
        reject(new Error(`${username}: join timed out`));
      }
    }, 20000);

    socket.on('connect', () => {
      socket.emit('avatar:join', {
        username,
        x: 500 + index,
        y: 250,
        roomId: ROOM_ID,
      });
    });

    socket.on('avatar:joined', (avatar) => {
      if (settled || avatar.username !== username) return;

      settled = true;
      clearTimeout(timeout);
      joinTimes.push(Date.now() - startedAt);
      connectedClients++;
      resolve(socket);
    });

    socket.on('avatar:moved', () => {
      receivedMoves++;
    });

    socket.on('error', (error) => {
      if (settled) return;

      settled = true;
      clearTimeout(timeout);
      failedClients++;
      socket.disconnect();
      reject(new Error(error?.message || `${username}: join rejected`));
    });

    socket.on('connect_error', (error) => {
      if (settled) return;

      settled = true;
      clearTimeout(timeout);
      failedClients++;
      reject(new Error(`${username}: ${error.message}`));
    });
  });
}

async function run() {
  console.log(`\nStarting load test`);
  console.log(`Server: ${SERVER_URL}`);
  console.log(`Clients: ${TOTAL_CLIENTS}`);
  console.log(`Moves per client: ${MOVES_PER_CLIENT}\n`);

  const results = await Promise.allSettled(
    Array.from({ length: TOTAL_CLIENTS }, (_, i) => joinClient(i + 1))
  );

  const successfulSockets = results
    .filter((result) => result.status === 'fulfilled')
    .map((result) => result.value);

  failedClients = TOTAL_CLIENTS - successfulSockets.length;
  for (const result of results) {
    if (result.status === 'rejected') {
      console.log('JOIN FAILURE:', result.reason.message);
    }
  }

  console.log(`Connected: ${successfulSockets.length}`);
  console.log(`Failed: ${failedClients}`);

  if (successfulSockets.length === 0) {
    console.error('No clients joined. Test stopped.');
    return;
  }

  console.log('\nSending movement events...');

  const startedAt = Date.now();

  for (let move = 0; move < MOVES_PER_CLIENT; move++) {
    for (let i = 0; i < successfulSockets.length; i++) {
      successfulSockets[i].emit('avatar:move', {
        x: 500 + i + move,
        y: 250 + move,
      });
    }

    await wait(MOVE_INTERVAL);
  }

  const expectedMoves =
    successfulSockets.length *
    MOVES_PER_CLIENT *
    (successfulSockets.length - 1);

  const deliveryWaitStarted = Date.now();
  const MAX_DELIVERY_WAIT = 30000;

  while (
    receivedMoves < expectedMoves &&
    Date.now() - deliveryWaitStarted < MAX_DELIVERY_WAIT
  ) {
    await wait(250);
  }

  const durationSeconds = (Date.now() - startedAt) / 1000;

  const deliveryRate = expectedMoves
    ? ((receivedMoves / expectedMoves) * 100).toFixed(2)
    : '0.00';

  const averageJoinTime = joinTimes.length
    ? Math.round(joinTimes.reduce((sum, value) => sum + value, 0) / joinTimes.length)
    : 0;

  console.log('\n========== LOAD TEST RESULTS ==========');
  console.log(`Requested clients: ${TOTAL_CLIENTS}`);
  console.log(`Joined clients: ${successfulSockets.length}`);
  console.log(`Rejected/failed: ${failedClients}`);
  console.log(`Expected movement deliveries: ${expectedMoves}`);
  console.log(`Received movement deliveries: ${receivedMoves}`);
  console.log(`Delivery rate: ${deliveryRate}%`);
  console.log(`Average join time: ${averageJoinTime} ms`);
  console.log(`Movement test duration: ${durationSeconds.toFixed(2)} seconds`);
  console.log('=======================================\n');

  for (const socket of sockets) {
    socket.disconnect();
  }
}

run().catch((error) => {
  console.error('Load test failed:', error);
  for (const socket of sockets) socket.disconnect();
  process.exitCode = 1;
});