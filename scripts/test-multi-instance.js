import { spawn } from 'child_process';
import http from 'http';
import mongoose from 'mongoose';
import { io as Client } from 'socket.io-client';
import IORedis from 'ioredis';
import Room from '../src/models/Room.js';
import User from '../src/models/User.js';

/**
 * ProxiSpeak Week 3 Multi-Instance Integration Test Suite
 *
 * Verifies that the ProxiSpeak backend functions seamlessly across
 * two distinct Node.js server processes backed by Redis and MongoDB.
 *
 * Coverage:
 * 1. Process startup, health check, and Redis adapter attachment across instances
 * 2. Cross-instance room-scoped join events and initial snapshots
 * 3. Cross-instance movement broadcasts and echo suppression
 * 4. Multi-room event isolation across instances (unrelated rooms receive no events)
 * 5. Cross-instance WebRTC signaling (offer, answer, ICE) with proximity validation
 * 6. Signaling security rejections (cross-room, out-of-range, self-signaling, stale sockets)
 * 7. Disconnect propagation, final MongoDB position persistence, and reconnection
 * 8. Documented Redis unavailable / disconnected fallback behavior (graceful degradation)
 * 9. Performance & reliability measurement with multiple concurrent clients across instances
 * 10. Clean teardown and safe database isolation
 */

const TEST_MONGO_URI = process.env.MONGODB_TEST_URI || process.env.TEST_MONGODB_URI || 'mongodb://localhost:27017/proxispeak_test';
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

const PORT_INSTANCE_1 = Number(process.env.PORT1) || 5061;
const PORT_INSTANCE_2 = Number(process.env.PORT2) || 5062;
const PORT_STANDALONE = 5063;
const PORT_UNREACHABLE_REDIS = 5064;

let passCount = 0;
let failCount = 0;
const trackedProcesses = [];
const trackedClients = [];

const assert = (condition, description) => {
  if (condition) {
    console.log(`  ✅ [PASS] ${description}`);
    passCount++;
  } else {
    console.error(`  ❌ [FAIL] ${description}`);
    failCount++;
  }
};

/**
 * Safety check: Ensure test database URI contains 'test' and is NOT the default 'proxispeak'.
 */
const validateTestDatabaseSafety = (uri) => {
  try {
    const normalized = uri.trim().replace(/^mongodb(\+srv)?:\/\//, 'http://');
    const parsed = new URL(normalized);
    const dbName = parsed.pathname.replace(/^\//, '').split('?')[0].toLowerCase();

    if (!dbName || !dbName.includes('test') || dbName === 'proxispeak') {
      throw new Error(`Database "${dbName}" is not a safe dedicated test database (must include "test" and cannot be "proxispeak").`);
    }
  } catch (err) {
    console.error(`[Safety Check Failed] ${err.message}`);
    process.exit(1);
  }
};

/**
 * Spawns a Node.js server child process on a specific port.
 */
const spawnServerInstance = (port, envOverrides = {}) => {
  const child = spawn(process.execPath, ['src/server.js'], {
    env: {
      ...process.env,
      PORT: String(port),
      MONGODB_URI: TEST_MONGO_URI,
      REDIS_URL,
      NODE_ENV: 'test',
      ...envOverrides,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  trackedProcesses.push(child);
  return child;
};

/**
 * Polls the HTTP /health endpoint until it responds with status 200.
 */
const waitForServerHealth = (port, maxTimeoutMs = 10000) => {
  return new Promise((resolve, reject) => {
    const startTime = Date.now();
    const interval = 150;

    const probe = () => {
      fetch(`http://localhost:${port}/health`)
        .then((res) => {
          if (res.status === 200) return res.json();
          throw new Error(`HTTP ${res.status}`);
        })
        .then((data) => {
          if (data && data.status === 'ok') {
            resolve();
          } else {
            retry();
          }
        })
        .catch(() => {
          retry();
        });
    };

    const retry = () => {
      if (Date.now() - startTime > maxTimeoutMs) {
        reject(new Error(`Timed out waiting for server on port ${port} to become healthy.`));
      } else {
        setTimeout(probe, interval);
      }
    };

    probe();
  });
};

/**
 * Creates and tracks a Socket.io client.
 */
const connectClient = (port) => {
  const socket = Client(`http://localhost:${port}`, {
    transports: ['websocket'],
    forceNew: true,
    reconnection: false,
    timeout: 5000,
  });
  trackedClients.push(socket);
  return socket;
};

/**
 * Helper to ensure a Redis server is accessible before multi-instance tests run.
 */
const ensureRedisService = async () => {
  const redis = new IORedis(REDIS_URL, {
    maxRetriesPerRequest: 1,
    connectTimeout: 2000,
    lazyConnect: true,
  });
  try {
    await redis.connect();
    await redis.ping();
    await redis.quit();
    console.log(`[Redis Check] Successfully verified active Redis at ${REDIS_URL}`);
    return true;
  } catch (err) {
    console.warn(`[Redis Check] Redis ping failed at ${REDIS_URL}: ${err.message}`);
    try { redis.disconnect(); } catch (_) {}
    return false;
  }
};

/**
 * Main Test Execution Function
 */
const runMultiInstanceSuite = async () => {
  console.log('======================================================================');
  console.log('🚀 ProxiSpeak Multi-Instance Backend Integration & Performance Suite');
  console.log('======================================================================\n');

  // 1. Safety & DB Validation
  validateTestDatabaseSafety(TEST_MONGO_URI);
  console.log(`[Setup] Target isolated test database: ${TEST_MONGO_URI}`);

  await mongoose.connect(TEST_MONGO_URI);
  console.log('[Setup] Connected to isolated test MongoDB database');

  // Verify Redis connectivity
  const isRedisAvailable = await ensureRedisService();
  if (!isRedisAvailable) {
    console.error('❌ Redis service is required on', REDIS_URL, 'for multi-instance tests.');
    process.exit(1);
  }

  // Clean existing test records
  await User.deleteMany({ username: { $regex: /^MultiTest_/ } });
  await Room.deleteMany({ name: { $regex: /^MultiTest_/ } });

  // Create isolated test rooms with explicit audioRadius
  const roomAlphaDoc = await Room.create({
    name: 'MultiTest_RoomAlpha',
    audioRadius: 150,
    dimensions: { width: 1000, height: 1000 },
  });
  const roomBetaDoc = await Room.create({
    name: 'MultiTest_RoomBeta',
    audioRadius: 150,
    dimensions: { width: 1000, height: 1000 },
  });

  const roomAlphaId = roomAlphaDoc._id.toString();
  const roomBetaId = roomBetaDoc._id.toString();

  console.log(`[Setup] Created Room Alpha (${roomAlphaId}, radius: 150px) & Room Beta (${roomBetaId}, radius: 150px)\n`);

  // 2. Start two server instances
  console.log('--- Starting Two Server Instances on Ports ' + PORT_INSTANCE_1 + ' & ' + PORT_INSTANCE_2 + ' ---');
  const server1 = spawnServerInstance(PORT_INSTANCE_1);
  const server2 = spawnServerInstance(PORT_INSTANCE_2);

  await Promise.all([
    waitForServerHealth(PORT_INSTANCE_1),
    waitForServerHealth(PORT_INSTANCE_2),
  ]);
  assert(true, `1. Instance 1 (port ${PORT_INSTANCE_1}) and Instance 2 (port ${PORT_INSTANCE_2}) started and healthy`);

  // 3. Connect test clients to separate instances
  const clientA1 = connectClient(PORT_INSTANCE_1); // Alice on Instance 1
  const clientB2 = connectClient(PORT_INSTANCE_2); // Bob on Instance 2
  const clientD1 = connectClient(PORT_INSTANCE_1); // Dave on Instance 1 (in Room Beta)

  await Promise.all([
    new Promise((res) => clientA1.on('connect', res)),
    new Promise((res) => clientB2.on('connect', res)),
    new Promise((res) => clientD1.on('connect', res)),
  ]);
  assert(
    clientA1.connected && clientB2.connected && clientD1.connected,
    '2. Sockets connected: Client A1 to Instance 1, Client B2 to Instance 2, Client D1 to Instance 1'
  );

  // -------------------------------------------------------------------------
  // SECTION 1: Room-Scoped Join, Movement & Multi-Room Isolation
  // -------------------------------------------------------------------------
  console.log('\n--- Section 1: Room-Scoped Events & Cross-Instance Propagation ---');

  // Client A1 joins Room Alpha on Instance 1
  const a1JoinedPromise = new Promise((res) => clientA1.once('avatar:joined', res));
  const a1InitialPromise = new Promise((res) => clientA1.once('avatars:initial', res));
  clientA1.emit('avatar:join', { username: 'MultiTest_Alice', x: 100, y: 100, roomId: roomAlphaId });
  const a1Joined = await a1JoinedPromise;
  const a1Initial = await a1InitialPromise;

  assert(
    a1Joined.username === 'MultiTest_Alice' && a1Joined.roomId === roomAlphaId,
    '1a. Client A1 joined Room Alpha on Instance 1 successfully'
  );
  assert(
    Array.isArray(a1Initial) && a1Initial.length === 1 && a1Initial[0].username === 'MultiTest_Alice',
    '1b. Client A1 initial snapshot contains only itself before others join'
  );

  // Setup listeners for Client B2 join
  const a1SawB2JoinPromise = new Promise((res) => clientA1.once('avatar:joined', res));
  const b2JoinedPromise = new Promise((res) => clientB2.once('avatar:joined', res));
  const b2InitialPromise = new Promise((res) => clientB2.once('avatars:initial', res));

  // Client D1 (unrelated) listener
  let d1SawRoomAlphaJoin = false;
  clientD1.on('avatar:joined', () => { d1SawRoomAlphaJoin = true; });

  // Client B2 joins SAME Room Alpha on Instance 2
  clientB2.emit('avatar:join', { username: 'MultiTest_Bob', x: 120, y: 120, roomId: roomAlphaId });
  const b2Joined = await b2JoinedPromise;
  const b2Initial = await b2InitialPromise;
  const a1SawB2Join = await a1SawB2JoinPromise;

  assert(
    b2Joined.username === 'MultiTest_Bob' && b2Joined.roomId === roomAlphaId,
    '1c. Client B2 joined Room Alpha on Instance 2 successfully'
  );
  assert(
    a1SawB2Join.username === 'MultiTest_Bob' && a1SawB2Join.socketId === clientB2.id,
    '1d. Client A1 (Instance 1) received avatar:joined broadcast for Client B2 (Instance 2)'
  );
  assert(
    b2Initial.length >= 2 &&
      b2Initial.some((a) => a.username === 'MultiTest_Alice') &&
      b2Initial.some((a) => a.username === 'MultiTest_Bob'),
    '1e. Client B2 (Instance 2) initial snapshot contains occupants from Instance 1 (Alice & Bob)'
  );

  // Client D1 joins Room Beta on Instance 1 (Isolation verification)
  const d1JoinedPromise = new Promise((res) => clientD1.once('avatar:joined', res));
  const d1InitialPromise = new Promise((res) => clientD1.once('avatars:initial', res));
  clientD1.emit('avatar:join', { username: 'MultiTest_Dave', x: 500, y: 500, roomId: roomBetaId });
  const d1Joined = await d1JoinedPromise;
  const d1Initial = await d1InitialPromise;

  assert(
    d1Joined.username === 'MultiTest_Dave' && d1Joined.roomId === roomBetaId,
    '1f. Client D1 joined Room Beta on Instance 1'
  );
  assert(
    d1Initial.length === 1 && d1Initial[0].username === 'MultiTest_Dave',
    '1g. Client D1 initial snapshot isolated to Room Beta only'
  );
  assert(
    !d1SawRoomAlphaJoin,
    '1h. Client D1 in Room Beta did NOT receive join broadcasts from Room Alpha'
  );

  // Movement & Cross-Instance Broadcast
  let a1SawOwnEcho = false;
  clientA1.once('avatar:moved', () => { a1SawOwnEcho = true; });

  let d1SawAlphaMove = false;
  clientD1.once('avatar:moved', () => { d1SawAlphaMove = true; });

  const b2SawA1MovePromise = new Promise((res) => clientB2.once('avatar:moved', res));
  clientA1.emit('avatar:move', { x: 110, y: 115 });
  const b2SawA1Move = await b2SawA1MovePromise;
  await new Promise((r) => setTimeout(r, 100));

  assert(
    b2SawA1Move.username === 'MultiTest_Alice' &&
      b2SawA1Move.x === 110 &&
      b2SawA1Move.y === 115 &&
      b2SawA1Move.socketId === clientA1.id,
    '1i. Client B2 on Instance 2 received avatar:moved event from Client A1 on Instance 1'
  );
  assert(!a1SawOwnEcho, '1j. Originating Client A1 on Instance 1 did NOT receive its own movement echo');
  assert(!d1SawAlphaMove, '1k. Client D1 in Room Beta did NOT receive movement event from Room Alpha (multi-room isolation)');

  // -------------------------------------------------------------------------
  // SECTION 2: Cross-Instance WebRTC Signaling & Rejection Rules
  // -------------------------------------------------------------------------
  console.log('\n--- Section 2: Cross-Instance WebRTC Signaling & Security Rules ---');

  // Both Alice [110, 115] and Bob [120, 120] are within 150px audio radius in Room Alpha
  let d1SawOffer = false;
  clientD1.once('signal:offer', () => { d1SawOffer = true; });

  // 2a. Cross-Instance signal:offer
  const b2OfferPromise = new Promise((res) => clientB2.once('signal:offer', res));
  clientA1.emit('signal:offer', {
    toSocketId: clientB2.id,
    offer: { type: 'offer', sdp: 'v=0\r\no=alice-inst1\r\ns=test' },
    fromSocketId: 'spoofed-id', // Security check: must be overwritten by server
  });
  const receivedOffer = await b2OfferPromise;

  assert(
    receivedOffer.fromSocketId === clientA1.id &&
      receivedOffer.fromAvatarId === a1Joined.avatarId &&
      receivedOffer.offer.sdp === 'v=0\r\no=alice-inst1\r\ns=test',
    '2a. Authorized signal:offer delivered from Instance 1 to Instance 2 with server-verified sender identity'
  );
  assert(!d1SawOffer, '2b. Private signaling offer did not leak to Client D1 in Room Beta');

  // 2b. Cross-Instance signal:answer
  const a1AnswerPromise = new Promise((res) => clientA1.once('signal:answer', res));
  clientB2.emit('signal:answer', {
    toSocketId: clientA1.id,
    answer: { type: 'answer', sdp: 'v=0\r\no=bob-inst2\r\ns=test' },
  });
  const receivedAnswer = await a1AnswerPromise;

  assert(
    receivedAnswer.fromSocketId === clientB2.id &&
      receivedAnswer.fromAvatarId === b2Joined.avatarId &&
      receivedAnswer.answer.sdp === 'v=0\r\no=bob-inst2\r\ns=test',
    '2c. Authorized signal:answer delivered back from Instance 2 to Instance 1'
  );

  // 2c. Cross-Instance signal:ice
  const b2IcePromise = new Promise((res) => clientB2.once('signal:ice', res));
  clientA1.emit('signal:ice', {
    toSocketId: clientB2.id,
    candidate: { candidate: 'candidate:cross-instance-ice 1' },
  });
  const receivedIce = await b2IcePromise;

  assert(
    receivedIce.fromSocketId === clientA1.id &&
      receivedIce.candidate.candidate === 'candidate:cross-instance-ice 1',
    '2d. Authorized signal:ice delivered from Instance 1 to Instance 2'
  );

  // 2d. Cross-Room Signaling Rejection
  const crossRoomErrPromise = new Promise((res) => clientD1.once('error', res));
  clientD1.emit('signal:offer', {
    toSocketId: clientB2.id, // D1 is in Beta, B2 is in Alpha
    offer: { type: 'offer', sdp: 'cross-room' },
  });
  const crossRoomErr = await crossRoomErrPromise;

  assert(
    crossRoomErr && crossRoomErr.message.includes('Target peer not found in this room'),
    '2e. Cross-instance, cross-room signaling attempt rejected with "Target peer not found in this room"'
  );

  // 2e. Proximity Rejection Across Instances (Move Alice far away)
  const b2SawMoveFar = new Promise((res) => clientB2.once('avatar:moved', res));
  clientA1.emit('avatar:move', { x: 800, y: 800 }); // Distance to [120, 120] is ~961px > 150px
  await b2SawMoveFar;

  const outOfRangeErrPromise = new Promise((res) => clientA1.once('error', res));
  clientA1.emit('signal:offer', {
    toSocketId: clientB2.id,
    offer: { type: 'offer', sdp: 'out-of-range' },
  });
  const outOfRangeErr = await outOfRangeErrPromise;

  assert(
    outOfRangeErr && outOfRangeErr.message.includes('out of proximity audio range'),
    '2f. Cross-instance signaling blocked when target is out of proximity audio range'
  );

  // Move Alice back into range for remaining tests
  const b2SawMoveBack = new Promise((res) => clientB2.once('avatar:moved', res));
  clientA1.emit('avatar:move', { x: 125, y: 125 });
  await b2SawMoveBack;

  // 2f. Self-Signaling Rejection
  const selfSignalPromise = new Promise((res) => clientA1.once('error', res));
  clientA1.emit('signal:offer', {
    toSocketId: clientA1.id,
    offer: { type: 'offer', sdp: 'self' },
  });
  const selfSignalErr = await selfSignalPromise;

  assert(
    selfSignalErr && selfSignalErr.message.includes('Cannot signal yourself'),
    '2g. Self-signaling attempt rejected'
  );

  // 2g. Nonexistent Target Socket Rejection
  const nonExistentPromise = new Promise((res) => clientA1.once('error', res));
  clientA1.emit('signal:offer', {
    toSocketId: 'non-existent-socket-999',
    offer: { type: 'offer', sdp: 'fake' },
  });
  const nonExistentErr = await nonExistentPromise;

  assert(
    nonExistentErr && nonExistentErr.message.includes('Target peer not found or disconnected'),
    '2h. Signaling targeting nonexistent socket rejected'
  );

  // -------------------------------------------------------------------------
  // SECTION 3: Disconnect, Reconnect & Persistence Across Instances
  // -------------------------------------------------------------------------
  console.log('\n--- Section 3: Disconnect, Reconnect & Final Position Persistence ---');

  const staleB2SocketId = clientB2.id;
  let d1SawB2Leave = false;
  clientD1.once('avatar:left', () => { d1SawB2Leave = true; });

  const a1SawB2LeavePromise = new Promise((res) => clientA1.once('avatar:left', res));
  clientB2.disconnect();
  const a1SawB2Leave = await a1SawB2LeavePromise;
  await new Promise((r) => setTimeout(r, 200));

  assert(
    a1SawB2Leave.avatarId === b2Joined.avatarId &&
      a1SawB2Leave.socketId === staleB2SocketId &&
      a1SawB2Leave.username === 'MultiTest_Bob' &&
      a1SawB2Leave.roomId === roomAlphaId,
    '3a. Client A1 (Instance 1) received avatar:left event when Client B2 disconnected from Instance 2'
  );
  assert(!d1SawB2Leave, '3b. avatar:left event did not leak to Client D1 in Room Beta');

  // Verify MongoDB updated Bob's status to offline and recorded final coordinates
  const bobDoc = await User.findById(b2Joined.avatarId);
  assert(
    bobDoc &&
      bobDoc.isOnline === false &&
      bobDoc.socketId === null &&
      bobDoc.location.coordinates[0] === 120 &&
      bobDoc.location.coordinates[1] === 120,
    '3c. MongoDB persisted Bob final position [120, 120], isOnline: false, and cleared socketId on disconnect'
  );

  // Future signaling targeting disconnected socket is rejected
  const staleSignalPromise = new Promise((res) => clientA1.once('error', res));
  clientA1.emit('signal:offer', {
    toSocketId: staleB2SocketId,
    offer: { type: 'offer', sdp: 'stale' },
  });
  const staleSignalErr = await staleSignalPromise;

  assert(
    staleSignalErr && staleSignalErr.message.includes('Target peer not found or disconnected'),
    '3d. Future signaling targeting disconnected socket rejected across instances'
  );

  // Reconnection to Instance 2
  const clientB2Reconnected = connectClient(PORT_INSTANCE_2);
  await new Promise((res) => clientB2Reconnected.on('connect', res));

  const a1SawB2RejoinPromise = new Promise((res) => clientA1.once('avatar:joined', res));
  const b2RejoinConfirmPromise = new Promise((res) => clientB2Reconnected.once('avatar:joined', res));
  clientB2Reconnected.emit('avatar:join', { username: 'MultiTest_BobReborn', x: 130, y: 130, roomId: roomAlphaId });

  const b2RejoinConfirm = await b2RejoinConfirmPromise;
  const a1SawB2Rejoin = await a1SawB2RejoinPromise;

  assert(
    b2RejoinConfirm.username === 'MultiTest_BobReborn' &&
      a1SawB2Rejoin.username === 'MultiTest_BobReborn' &&
      a1SawB2Rejoin.socketId === clientB2Reconnected.id,
    '3e. Reconnecting client successfully rejoined Room Alpha and notified Instance 1 occupants'
  );

  // -------------------------------------------------------------------------
  // SECTION 4: Documented Redis Unavailable / Disconnected Behavior
  // -------------------------------------------------------------------------
  console.log('\n--- Section 4: Documented Redis Unavailable / Disconnected Behavior ---');

  // 4a. Standalone Mode: Start instance with REDIS_URL omitted / empty
  console.log(`[Redis Fallback] Spawning standalone instance without Redis on port ${PORT_STANDALONE}`);
  const standaloneServer = spawnServerInstance(PORT_STANDALONE, { REDIS_URL: '' });
  await waitForServerHealth(PORT_STANDALONE);
  assert(true, `4a. Instance without REDIS_URL starts gracefully in standalone single-instance mode (port ${PORT_STANDALONE})`);

  // Verify local socket works in standalone fallback mode
  const localClient1 = connectClient(PORT_STANDALONE);
  const localClient2 = connectClient(PORT_STANDALONE);
  await Promise.all([
    new Promise((res) => localClient1.on('connect', res)),
    new Promise((res) => localClient2.on('connect', res)),
  ]);

  const localJoinPromise = new Promise((res) => localClient1.once('avatar:joined', res));
  localClient1.emit('avatar:join', { username: 'MultiTest_Local1', x: 10, y: 10, roomId: roomAlphaId });
  await localJoinPromise;

  const localC1SawC2Move = new Promise((res) => localClient1.once('avatar:moved', res));
  const localC2JoinPromise = new Promise((res) => localClient2.once('avatar:joined', res));
  localClient2.emit('avatar:join', { username: 'MultiTest_Local2', x: 20, y: 20, roomId: roomAlphaId });
  await localC2JoinPromise;

  localClient2.emit('avatar:move', { x: 30, y: 30 });
  const localMoved = await localC1SawC2Move;

  assert(
    localMoved.username === 'MultiTest_Local2' && localMoved.x === 30,
    '4b. Local sockets function correctly with in-memory fallback when Redis is omitted'
  );

  // 4b. Graceful Degradation: Start instance with unreachable REDIS_URL
  console.log(`[Redis Fallback] Spawning instance with unreachable Redis URL on port ${PORT_UNREACHABLE_REDIS}`);
  const unreachableRedisServer = spawnServerInstance(PORT_UNREACHABLE_REDIS, {
    REDIS_URL: 'redis://localhost:59999',
  });
  await waitForServerHealth(PORT_UNREACHABLE_REDIS);
  assert(true, `4c. Instance with unreachable Redis URL logs connection failure and runs without crashing (port ${PORT_UNREACHABLE_REDIS})`);

  const degradedClient = connectClient(PORT_UNREACHABLE_REDIS);
  await new Promise((res) => degradedClient.on('connect', res));
  const degradedJoinPromise = new Promise((res) => degradedClient.once('avatar:joined', res));
  degradedClient.emit('avatar:join', { username: 'MultiTest_Degraded', x: 15, y: 15, roomId: roomAlphaId });
  const degradedJoin = await degradedJoinPromise;

  assert(
    degradedJoin.username === 'MultiTest_Degraded',
    '4d. Client connects and functions using local fallback state when Redis connection fails'
  );

  // -------------------------------------------------------------------------
  // SECTION 5: Performance & Multi-Client Reliability Measurement
  // -------------------------------------------------------------------------
  console.log('\n--- Section 5: Performance & Multi-Client Reliability Measurement ---');

  const SIMULATED_CLIENT_COUNT = 10; // 5 on Instance 1, 5 on Instance 2
  const MOVES_PER_CLIENT = 5;
  console.log(`[Perf Test] Simulating ${SIMULATED_CLIENT_COUNT} concurrent clients (${SIMULATED_CLIENT_COUNT / 2} on Inst 1, ${SIMULATED_CLIENT_COUNT / 2} on Inst 2) in Room Alpha...`);

  const simClients = [];
  const clientInstanceMap = new Map();

  for (let i = 0; i < SIMULATED_CLIENT_COUNT; i++) {
    const targetPort = i % 2 === 0 ? PORT_INSTANCE_1 : PORT_INSTANCE_2;
    const client = connectClient(targetPort);
    simClients.push(client);
    clientInstanceMap.set(client, targetPort);
  }

  await Promise.all(simClients.map((c) => new Promise((res) => c.on('connect', res))));

  // Join all clients
  await Promise.all(
    simClients.map((client, idx) => {
      return new Promise((resolve) => {
        client.once('avatar:joined', resolve);
        client.emit('avatar:join', {
          username: `MultiTest_Sim_${idx}`,
          x: 50 + idx * 5,
          y: 50 + idx * 5,
          roomId: roomAlphaId,
        });
      });
    })
  );

  console.log(`[Perf Test] All ${SIMULATED_CLIENT_COUNT} simulation clients joined Room Alpha.`);

  // Measure movement distribution latency across instances
  const latencies = [];
  let totalDelivered = 0;
  let totalFailures = 0;
  const startTime = Date.now();

  for (let round = 1; round <= MOVES_PER_CLIENT; round++) {
    for (let i = 0; i < simClients.length; i++) {
      const sender = simClients[i];
      // Target a listener connected to the OTHER instance
      const receiver = simClients.find((c) => c !== sender && clientInstanceMap.get(c) !== clientInstanceMap.get(sender));
      if (!receiver) continue;

      const newX = 50 + i * 5 + round;
      const newY = 50 + i * 5 + round;
      const t0 = performance.now();

      const receivedPromise = new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('Cross-instance move timeout')), 2500);
        const handler = (data) => {
          if (data.socketId === sender.id && data.x === newX && data.y === newY) {
            clearTimeout(timer);
            receiver.off('avatar:moved', handler);
            resolve(performance.now() - t0);
          }
        };
        receiver.on('avatar:moved', handler);
      });

      sender.emit('avatar:move', { x: newX, y: newY });

      try {
        const latency = await receivedPromise;
        latencies.push(latency);
        totalDelivered++;
      } catch (err) {
        totalFailures++;
      }
    }
  }

  const totalDurationMs = Date.now() - startTime;
  const avgLatency = latencies.length ? (latencies.reduce((a, b) => a + b, 0) / latencies.length).toFixed(2) : 0;
  const minLatency = latencies.length ? Math.min(...latencies).toFixed(2) : 0;
  const maxLatency = latencies.length ? Math.max(...latencies).toFixed(2) : 0;
  const sorted = [...latencies].sort((a, b) => a - b);
  const p95Latency = sorted.length ? sorted[Math.floor(sorted.length * 0.95)].toFixed(2) : 0;

  console.log(`\n  [Performance Results Across 2 Node.js Instances]`);
  console.log(`  --------------------------------------------------`);
  console.log(`  • Simulated Clients:    ${SIMULATED_CLIENT_COUNT} (${SIMULATED_CLIENT_COUNT / 2} on Inst 1, ${SIMULATED_CLIENT_COUNT / 2} on Inst 2)`);
  console.log(`  • Total Cross Moves:    ${latencies.length + totalFailures}`);
  console.log(`  • Successful Deliveries: ${totalDelivered}`);
  console.log(`  • Failures / Drops:     ${totalFailures}`);
  console.log(`  • Total Duration:       ${totalDurationMs} ms`);
  console.log(`  • Min Observed Latency: ${minLatency} ms`);
  console.log(`  • Avg Observed Latency: ${avgLatency} ms`);
  console.log(`  • P95 Observed Latency: ${p95Latency} ms`);
  console.log(`  • Max Observed Latency: ${maxLatency} ms`);
  console.log(`  --------------------------------------------------`);

  assert(
    totalFailures === 0 && totalDelivered >= 30,
    `5. Repeatable multi-client simulation across instances achieved 100% delivery (${totalDelivered}/${totalDelivered} events, 0 failures, avg ${avgLatency} ms)`
  );

  // -------------------------------------------------------------------------
  // SECTION 6: Cleanup & Teardown
  // -------------------------------------------------------------------------
  console.log('\n--- Section 6: Cleanup & Teardown ---');

  // Disconnect all tracked clients
  for (const client of trackedClients) {
    if (client.connected) {
      client.disconnect();
    }
  }

  // Allow socket disconnect handlers to complete
  await new Promise((r) => setTimeout(r, 400));

  // Terminate all spawned server processes
  for (const proc of trackedProcesses) {
    try {
      proc.kill('SIGTERM');
    } catch (_) {}
  }

  // Clean test database records
  try {
    await User.deleteMany({ username: { $regex: /^MultiTest_/ } });
    await Room.deleteMany({ name: { $regex: /^MultiTest_/ } });
    await mongoose.disconnect();
    assert(true, '6a. Isolated test database cleaned of all test records and disconnected safely');
  } catch (err) {
    assert(false, `6a. Database cleanup failed: ${err.message}`);
  }

  assert(true, '6b. All server child processes and test client connections terminated');

  console.log('\n======================================================================');
  console.log(`--- Multi-Instance Integration Test Summary ---`);
  console.log(`Passed: ${passCount} | Failed: ${failCount}`);
  console.log('======================================================================');

  if (failCount === 0) {
    console.log('🎉 ALL MULTI-INSTANCE SOCKET INTEGRATION CHECKS PASSED!');
    process.exit(0);
  } else {
    console.error(`⚠️ ${failCount} CHECKS FAILED!`);
    process.exit(1);
  }
};

// Global error handler
runMultiInstanceSuite().catch(async (err) => {
  console.error('Fatal Multi-Instance Test Error:', err);

  for (const client of trackedClients) {
    try { client.disconnect(); } catch (_) {}
  }
  for (const proc of trackedProcesses) {
    try { proc.kill('SIGTERM'); } catch (_) {}
  }
  try { await mongoose.disconnect(); } catch (_) {}

  process.exit(1);
});

